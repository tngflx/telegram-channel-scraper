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
    let preliminary_selected_locums = [],
        messages = [],
        showNew = []

    for (const [channel_index, { id, name }] of channels.entries()) {
        let lastIdofMsgs = await db.getLastMsgId(channel_index);

        do {
            let history = await client.getMessages(id, {
                max_id: -offsetId,
                offset: -(preliminary_selected_locums.length),
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

            preliminary_selected_locums = preliminary_selected_locums.concat(messages);
            messages.length > 0 && (offsetId = messages[0].id);

            if (messages.length > 0) {
                channels[channel_index]['lastMsgId'] = messages[0].id
                await db.updateLastMsgId(channels)
            }
            history = null;

        } while (messages.length === limit && preliminary_selected_locums.length < max)

        let combineChannelName = {
            name,
            chats:
                messages.filter(({ id }) => {
                    return id > lastIdofMsgs
                })

        }
        showNew.push(combineChannelName)
    }

    /**
     * TODOl;
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

    const no_repeats = uniqByKeepFirst(showNew, it => it.chats);
    const filter_taken = await filter_skipped_keywords(no_repeats);
    const filter_distance_locums = await filter_locum_distance(filter_taken)
    const reformat_locums_msgbody = await reformat_whatsapp_body(filter_distance_locums)

    if (filter_distance_locums.length > 0) {
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
const filter_skipped_keywords = async (msgs) => {
    let replies_msg = [],
        filter_taken_arr = []
    const { skip_keywords } = msgHistory

    for (const { chats, name } of msgs) {
        for (const { message, replies, replyTo, id, date, peerId, ...rest } of chats) {
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

                /**
                 * if contain reply msg of "taken" we skip the locum
                 */
                for (const { message: reply_msg, date } of received_replies_msgs) {
                    if (checkIfContainKeyword(reply_msg, skip_keywords)) continue;
                    else
                        replies_msg.push({ parent_msg: message, received_replies_num, reply_msg, replies, replyTo, id })
                }

                /**
                 * If no replies most probably still vacant locum
                 */
            } else
                replies_msg.push({ parent_msg: message, replies, replyTo, id });

        }
        filter_taken_arr.push({ name, chats: replies_msg })

    }
    return filter_taken_arr;
}

/**
 * use google map to estimate distance and duration from locum place
 * @param {any} preliminary_selected_locums
 */
const filter_locum_distance = async (msgs) => {
    let accepted_locum_body = [],
        accepted_locums = []
    const { tolerable_duration_min, tolerable_lowest_rate } = msgHistory;

    for (const { chats, name } of msgs) {
        for (const { parent_msg } of chats) {
            let msg_body_lines = parent_msg.split('\n').filter((m) => m.trim() !== '')
            for (const msg_line of msg_body_lines) {
                /**
                 * Matches 'Klinik some', 'Poliklinik some','Sai poliklinik, 56000',
                 */
                let clinic_name = msg_line.match(/\b(\w* ?\w*?[ck]lini[ck][^,]*)/i)
                /**
                 * Extract rate from msg_line
                 */
                let locum_rate = msg_line.match(/(?<=^|\D)(?:RM\s?)?\d+(?:\.\d{1,2})?(?=(\s*\/(hour|hr|hrly|hourly|h))|(\s*\/\s*hr)|(\s*\/\s*hour)|\s+per\s+(hour|hr|h))/i)

                /**
                 * Extract whatsapp link from msg_line
                 */
                let whatsapp_link = msg_line.match(/https?:\/\/(?:www\.)?wa\.me\/([A-Za-z0-9]+)/i)

                if (clinic_name && !locum_rate) {
                    if (/chill|whatsapp/i.test(clinic_name[0])) continue;
                    let gmap_place = await gmap.getPlace(clinic_name[0])
                    if (!gmap_place) continue;

                    let gmap_distance = await gmap.getDistance(gmap_place)
                    if (gmap_distance == 'state_too_far' || gmap_distance == null) continue;
                    else {
                        const { distance, duration } = gmap_distance

                        /**
                         * If the trip needed is more than an hour, reject the locum
                         */
                        const added_distance_duration = {
                            ...parent_msg,
                            distance,
                            duration
                        }

                        /**
                         * If duration is less than an hour, check for locum rate
                         */
                        if (parseInt(duration) < tolerable_duration_min) {
                            accepted_locum_body.push(added_distance_duration)
                        }
                        continue;
                    }
                } else if (locum_rate) {


                }
            }
        }
        let combine_channel_name = {
            name,
            ...accepted_locum_body
        }
        accepted_locums.push(combine_channel_name)
    }
    return accepted_locums

}

/**
 * reformat message body to have whatsapp link
 */
const reformat_whatsapp_links = (msgs) => {
    for (const { chats, name } of msgs) {
        for (const { parent_msg } of chats) {
            let msg_body_lines = parent_msg.split('\n').filter((m) => m.trim() !== '')
            for (const msg_line of msg_body_lines) {


            }
        }
    }
}

const checkIfContainKeyword = (strings, keywords) => {
    let trimmed_lower_strings = strings.trim().toLowerCase();
    return keywords.some((substr) => trimmed_lower_strings.includes(substr))
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
