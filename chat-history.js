const config = require('./config')
const fetch = require("node-fetch")
const db = require('./utils/db');
const { Api } = require("telegram");

const { client } = require('./utils/init')

const getChat = async () => {
    const dialogs = await client.getDialogs({
        limit: 30
    });

    return dialogs.reduce((accum, { name, id }, idx) => {
        let _name = name.trim().toLowerCase()
        if (_name.includes('locum'))
            accum.push({ name, id });
        return accum
    }, [])
}

const chatHistory = async (chats) => {
    let lastIdofMsgs = await db.getLastMsgId();
    const { maxMsg, limit, keywords } = config.telegram.msgHistory

    const max = maxMsg
    let offsetId = 0
    let full_arr = [],
        messages = [];

    for (let { id, name } of chats) {
        do {
            let history = await client.getMessages(id, {
                max_id: -offsetId,
                offset: -full_arr.length,
                limit
            });

            messages = history.filter(filterLastDay);
            full_arr = full_arr.concat(messages);
            messages.length > 0 && (offsetId = messages[0].id);

            if (messages.length > 0) {
                await db.updateLastMsgId(messages[0].id)
            }
            history = null;
        } while (messages.length === limit && full_arr.length < max)
    }

    /**
     * Filter by keywords 
     * @var {keywords} taken if locum already taken, we should take out that object from array
     * @var {keywords} unpaid if locum unpaid for rest, take out too
     * 
     */
    full_arr = full_arr.map(({ message, className, isReply, replies, replyTo, id }) => {
        if (className === 'Message') {
            let trimmed_lower_message = message.trim().toLowerCase();
            let check_keyword = keywords.some((substr) => trimmed_lower_message.includes(substr))

            if (isReply && check_keyword) {
                let { replyToMsgId } = replyTo
                return ({ message, isReply, replies, replyToMsgId, id });
            }
            return ({ message, isReply, replies, replyTo, id });
        }
    }).filter(n => n !== undefined)

    let message2 = [...new Map(full_arr.map((m) => [m.message, m])).values()];

    const showNew = full_arr.filter(({ id }) => id == lastIdofMsgs)
    const noRepeats = uniqueArray(showNew, 'id')
    const usersMsg = noRepeats.filter(filterUsersMessages)

    if (usersMsg.length > 0) {
        const done = await sendToServer(usersMsg)
        printMessages(usersMsg)
        console.log("saved to server: ", done)
        console.log("Last msg id ", messages[0].id)
    }
    lastIdofMsgs = await db.getLastMsgId();
    const dt = new Date()
    const hours = dt.getHours()
    const mins = dt.getMinutes()
    console.log(`${hours}:${mins} - [${lastIdofMsgs}]`)
}

let sent = []

const printMessages = (messages) => {
    const formatted = messages.map(formatMessage)
    formatted.forEach(e => console.log(e))
}

const uniqueArray = function (myArr, prop) {
    return myArr.filter((obj, pos, arr) => {
        return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
    });
}
const filterLastDay = ({ date }) => new Date(date * 1e3) > dayRange()
const dayRange = () => Date.now() - new Date(86400000 * 5)
const filterUsersMessages = ({ _ }) => _ === 'message'

const formatMessage = ({ message, date, id }) => {
    const dt = new Date(date * 1e3)
    const hours = dt.getHours()
    const mins = dt.getMinutes()
    return `${hours}:${mins} [${id}] ${message}`
}

module.exports = {
    getChat,
    chatHistory,
}
