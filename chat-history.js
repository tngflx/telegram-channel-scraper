const { telegram: { msgHistory } } = require('./config')
const fetch = require("node-fetch")
const db = require('./utils/db');
const { Api } = require("telegram");
const { Gmap } = require('./utils/googlemap')
const gmap = new Gmap()

const { client } = require('./utils/init')

/**
 * Get groups in telegram to get channel ID
 * @returns
 */
const getChannelsID = async () => {
    const dialogs = await client.getDialogs({
        limit: 10
    });

    return dialogs.reduce((accum, { name, id }, idx) => {
        let _name = name.trim().toLowerCase()
        if (_name.includes('locum'))
            accum.push({ name, id });
        return accum
    }, [])
}

const chatHistory = async (channels) => {

    const { maxMsg, limit } = msgHistory

    const max = maxMsg
    let offsetId = 0
    let preliminary_selected_locums = new Set(),
        messages = [];

    for (const [channel_index, { id, name }] of channels.entries()) {
        let lastIdofMsgs = await db.getLastMsgId(name);

        do {
            let history = await client.getMessages(id, {
                max_id: -offsetId,
                offset: -preliminary_selected_locums.length,
                limit
            });

            /**
             * Preliminary check if the messages are truly message and not vote post or others
             * if message contain keyword female or lady, don't take the locum'
             */
            messages = history.filter(filterLastDay).filter(({ isReply, className, message }) =>
                className === 'Message'
                && !isReply && checkIfContainKeyword(message, ['locum'])
                && !checkIfContainKeyword(message, msgHistory.skip_keywords)
                && !checkIfContainKeyword(message, msgHistory.skip_location)
            )

            preliminary_selected_locums.add(...[].concat(messages));
            messages.length > 0 && (offsetId = messages[0].id);

            if (messages.length > 0) {
                channels[channel_index]['lastMsgId'] = messages[0].id
                await db.updateLastMsgId(channels)
            }
            history = null;
        } while (messages.length === limit && preliminary_selected_locums.length < max)

        //const showNew = preliminary_selected_locums.filter(({ id }) =>
        //    id > lastIdofMsgs)
        //const noRepeats = uniqueArray(showNew, 'id')
    }

    /**
     * TODO
     * Categories to filter out from selection
     * 1. If locum replied with taken
     * 2. If distance too far (google map api)
     * 3. If pay is too low, below rm40
     * 4. If unpaid rest
     * 
     * TODO2
     * hiring advertisement
     * 1. To categorized in different json object
     * */

    const no_repeats = uniqByKeepFirst(preliminary_selected_locums, it => it.message);
    const filter_taken = await filter_skipped_keywords(no_repeats);
    const filter_distance = await filter_locum_distance(filter_taken)



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

/**
 * Filter by skipped_keywords 
 * @var {skipped_keywords} taken if locum already taken, we should take out that object from array
 * @var {skipped_keywords} unpaid if locum unpaid for rest, take out too
 * 1st step : plucking certain object of interest only as our array
 * 2nd step : filter out not fit locums
 */
const filter_skipped_keywords = async (preliminary_selected_locums) => {
    let filter_taken_arr = [];
    const { skipped_keywords, skip_location } = msgHistory

    for (const { message, replies, replyTo, id, date, peerId, ...rest } of preliminary_selected_locums) {
        let received_replies_num = replies?.replies;
        let { channelId } = peerId

        /**
         * Check if reply to the message contains word taken or any other keyword, then skip the locum
         */
        if (received_replies_num > 0) {
            let { messages: received_replies_msgs, users } = await client.invoke(
                new Api.messages.GetReplies({
                    peer: channelId,
                    msgId: id
                })
            );
            await new Promise(resolve => setTimeout(resolve, 500));
            for (const { message: reply_msg, date } of received_replies_msgs) {
                if (checkIfContainKeyword(reply_msg, skipped_keywords)) continue;
                else
                    filter_taken_arr.push({ parent_msg: message, received_replies_num, reply_msg, replies, replyTo, id })
            }

        } else
            filter_taken_arr.push({ parent_msg: message, replies, replyTo, id });

    }
    return filter_taken_arr;
}

/**
 * use google map to estimate distance and duration from locum place
 * @param {any} preliminary_selected_locums
 */
const filter_locum_distance = async (preliminary_selected_locums) => {
    let accepted_locum = []

    for (const { full_msg } of preliminary_selected_locums) {
        let msg_body_lines = full_msg.split('\n').filter((m) => m.trim() !== '')
        for (const msg_line of msg_body_lines) {
            let clinic_name = msg_line.match(/klinik(.*)/gi)
            if (clinic_name) {
                let gmap_place = await gmap.getPlace(clinic_name[0])
                let { distance, duration } = await gmap.getDistance(gmap_place)

                /**
                 * If the trip needed is more than an hour, reject the locum
                 */
                if (parseInt(duration) < 60) {
                    accepted_locum.push(full_msg)
                }
                continue;
            }
        }
    }

    if (accepted_locum.length > 30)
        return accepted_locum
}

const checkIfContainKeyword = (strings, skipped_keywords) => {
    let trimmed_lower_strings = strings.trim().toLowerCase();
    return skipped_keywords.some((substr) => trimmed_lower_strings.includes(substr))
}

const printMessages = (messages) => {
    const formatted = messages.map(formatMessage)
    formatted.forEach(e => console.log(e))
}

const uniqByKeepFirst = (a, key) => {
    let seen = new Set();
    return a.filter(item => {
        let k = key(item);
        if (seen.has(k))
            return false
        else
            return seen.add(k)
        //    return seen.has(k) ? false : seen.add(k);
    });
}

const uniqueArray = function (myArr, prop) {
    return myArr.filter((obj, pos, arr) => {
        return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
    });
}
const filterLastDay = ({ date }) => new Date(date * 1e3) > dayRange()
const dayRange = () => Date.now() - new Date(86400000 * 2)
const filterUsersMessages = ({ _ }) => _ === 'message'

const formatMessage = ({ message, date, id }) => {
    const dt = new Date(date * 1e3)
    const hours = dt.getHours()
    const mins = dt.getMinutes()
    return `${hours}:${mins} [${id}] ${message}`
}

module.exports = {
    getChannelsID,
    chatHistory,
}
