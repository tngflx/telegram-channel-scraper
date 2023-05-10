const { telegram: { msgHistory } } = require('./config')
const { Logger, LogLevel } = require('./utils/logger')
const log = new Logger(LogLevel.DEBUG)

const db = require('./utils/db');
const { Api } = require("telegram");
const { Gmap } = require('./utils/googlemap')
const gmap = new Gmap()

const { moment } = require('./utils/moment');
const Moment = new moment()

let GramClient, waClient
const callbackGramClient = (_gramClient, _waClient) => {
    waClient = _waClient
    GramClient = _gramClient;
};

/**
 * Get groups in telegram to get channel ID
 * @returns
 */
const getChannelsID = async () => {

    const dialogs = await GramClient.getDialogs({
        limit: 20
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
        current_messages,
        showNew = [],
        lastIdofMsgs;

    for (const [channel_index, { id: channelId, name }] of channels.entries()) {
        lastIdofMsgs = await db.getLastMsgId(channel_index);

        do {
            let history = await GramClient.getMessages(channelId, {
                max_id: -offsetId,
                offset: -(preliminary_selected_locums.length),
                limit
            });

            /**
             * Preliminary check if the current_messages are truly message and not vote post or others
             * if message contain keyword female or lady, don't take the locum'
             */
            current_messages = history.filter(filterLastDay).filter(({ isReply, className, message }) =>
                className === 'Message'
                && !isReply && checkIfContainKeyword(message, ['locum'])
                && !checkIfContainKeyword(message, msgHistory.skip_keywords)
                && !checkIfContainKeyword(message, msgHistory.skip_location)
            )

            preliminary_selected_locums = preliminary_selected_locums.concat(current_messages);
            current_messages.length > 0 && (offsetId = current_messages[0].id);

            if (current_messages.length > 0) {
                channels[channel_index]['lastMsgId'] = current_messages[0].id
                let result = await db.updateLastMsgId(channels)
                log.info(`channelName: ${name} lastMsgId: ${lastIdofMsgs}`)
            }

        } while (current_messages.length === limit && preliminary_selected_locums.length < max)

        let combineChannelName = {
            name,
            chats:
                current_messages.filter(({ id }) => {
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

    const no_repeats = uniqByKeepFirst(showNew, item => {
        const allChats = showNew.map(obj => obj.chats).flat();
        const otherChats = allChats.filter(chat => chat !== item.chats[0]);
        const otherChatsStr = otherChats.map(chat => chat.message).join('');
        return `${item.name}-${item?.chats[0]?.message}-${otherChatsStr}`;
    });

    const filter_taken = await filter_skipped_keywords(no_repeats);
    const reformatWA_filterDistance_locums = await filter_locum_distance(filter_taken)

    let sentToWA = [];
    if (reformatWA_filterDistance_locums.length > 0 && reformatWA_filterDistance_locums[0]?.[0]?.hasOwnProperty('full_msg')) {

        sentToWA = await reformatWA_filterDistance_locums.reduce(async (accum, { name, ...chats }) => {
            const previousResult = await accum;
            for (const chat of Object.values(chats)) {
                sleep(200)
                previousResult.push(await waClient.sendMsg('my_group', JSON.stringify(chat, null, 2)));
            }
            return previousResult;
        }, []);

    }

    return sentToWA
}

/**
 * Filter by skipped_keywords 
 * @var {skipped_keywords} taken if locum already taken, we should take out that object from array
 * @var {skipped_keywords} unpaid if locum unpaid for rest, take out too
 * 1st step : plucking certain object of interest only as our array
 * 2nd step : filter out not fit locums
 */
const filter_skipped_keywords = async (msgs) => {
    let filter_taken_arr = []
    const { skip_keywords } = msgHistory

    for (const { chats, name } of msgs) {
        let replies_msg = []

        for (const { message, replies, replyTo, id, date, peerId, ...rest } of chats) {
            let received_replies_num = replies?.replies;
            let { channelId } = peerId

            /**
             * Check if reply to the message contains word taken or any other keyword, then skip the locum
             */
            if (received_replies_num > 0) {
                let { messages: received_replies_msgs, users } = await GramClient.invoke(
                    new Api.messages.GetReplies({
                        peer: channelId,
                        msgId: id
                    })
                );
                await sleep(500);

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
    let accepted_locums = []

    const { tolerable_travel_duration_min, tolerable_work_duration_hours, tolerable_lowest_rate } = msgHistory;

    for (const { chats, name } of msgs) {
        let accepted_locum_body = [];

        for (const [channel_index, { parent_msg }] of chats.entries()) {
            let msg_body_lines = parent_msg.split('\n').filter((m) => m.trim() !== '')
            let checked_clinic = false //If the clinic name checked before, stop process google map

            for (const msg_line of msg_body_lines) {
                /**
                 * Matches 'Klinik some', 'Poliklinik some','Sai poliklinik, 56000',
                 */
                let clinic_name = reformatClinicName(msg_line, msg_body_lines)
                /**
                 * Extract rate from msg_line
                 */
                let locum_rate = msg_line.match(/(?<=^|\D)(?:RM\s?)?\d+(?:\.\d{1,2})?(?=(\s*\/(hour|hr|hrly|hourly|h))|(\s*\/\s*hr)|(\s*\/\s*hour)|\s+per\s+(hour|hr|h))/i)
                locum_rate = null || locum_rate?.[0].replace(/[^\d.-]/g, '')
                /**
                 * Extract whatsapp link from msg_line
                 */
                let whatsapp_link = msg_line.match(/(?:api\.whatsapp\.com\/(.*)=\d{10,12})|(wa(?:s|ss)ap\.my|wa\.me)\/.\d+(?:\/\w+)?|(wa\.link)\/.*/gi)
                whatsapp_link = whatsapp_link?.[0]
                /** 
                 * match all kind phone number and form whatsapp link from it
                 */
                let phone_numbers = msg_line.match(/(\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g)
                phone_numbers = phone_numbers?.[0]

                let work_time = msg_line.match(/\d{1,2}\.*\d{0,2}\s?[ap]m/gi)

                if (clinic_name && !locum_rate && !checked_clinic) {
                    if (/chill|whatsapp/i.test(clinic_name)) continue;
                    checked_clinic = true;

                    let gmap_place = await gmap.getPlace(clinic_name)
                    if (!gmap_place) break;

                    let gmap_distance = await gmap.getDistance(gmap_place)
                    if (gmap_distance == 'state_too_far' || gmap_distance == null) break;
                    else {
                        let { distance, duration } = gmap_distance

                        const regex = /(?:(\d+)\s*(?:hour)s*\s*)?(\d+)\s*min(?:ute)?s*/i;
                        let [, hours, minutes] = duration.match(regex);
                        hours = Number(hours)
                        minutes = Number(minutes)

                        if (hours && minutes) {
                            duration = hours * 60 + minutes;
                        } else {
                            duration = minutes
                        }

                        /**
                         * If duration is less than an hour, check for locum rate
                         */
                        if (parseInt(duration) < parseInt(tolerable_travel_duration_min)) {
                            accepted_locum_body[channel_index] = { full_msg: msg_body_lines, distance, travel_duration_min: duration }
                            continue;
                        }
                    }

                    // If previous clinic wasn't put in accepted_locum_body, meant it was not accepted
                    // Locum rate is on the next line of message
                } else if (locum_rate && accepted_locum_body[channel_index] != null) {
                    if (parseInt(locum_rate) < parseInt(tolerable_lowest_rate)) {
                        accepted_locum_body.splice(channel_index, 1)
                        break;
                    } else if (parseInt(locum_rate) >= parseInt(tolerable_lowest_rate)) {
                        accepted_locum_body[channel_index] = { ...accepted_locum_body[channel_index], locum_rate: locum_rate }
                    }
                } else if ((phone_numbers || whatsapp_link) && accepted_locum_body[channel_index] != null) {
                    if (whatsapp_link) {
                        accepted_locum_body[channel_index] = { ...accepted_locum_body[channel_index], whatsapp_link }
                    } else {
                        accepted_locum_body[channel_index] = { ...accepted_locum_body[channel_index], whatsapp_link: `https://wa.me/+6${phone_numbers}` }
                    }
                } else if (work_time && accepted_locum_body[channel_index] != null) {
                    // Convert am/pm to 24hours format, calculate durations
                    let [startTime, endTime] = work_time;
                    if (!startTime || !endTime) continue;
                    let work_duration = Moment.calcDuration(startTime, endTime)

                    if (work_duration >= tolerable_work_duration_hours * 60) {
                        accepted_locum_body[channel_index] = { ...accepted_locum_body[channel_index], work_duration: `${work_duration / 60} hour` }
                    } else {
                        accepted_locum_body.splice(channel_index, 1)
                        continue;
                    }
                }
            }

        }
        let combine_channel_name = {
            name,
            ...accepted_locum_body.filter(val => val) //Reindex array back
        }
        accepted_locums.push(combine_channel_name)
    }
    return accepted_locums

}

const reformatClinicName = (msg_line, msg_body_lines) => {
    let [clinic_name] = msg_line.match(/\b(\w* ?\w*?[ck]lini[ck][^,]*)/i) || [null]

    //remove all emojis, non unicode, date? if possible
    let emojiRegex = /[^a-zA-Z0-9\s\p{Emoji}]/gu

    let [hospital_name] = msg_line.match(/.*\bhospital\b.*/i) || [null]

    let malaysian_address = /(Lot|No|\d+).*(Jalan|Jln|Lorong|Lrg|Lebuhraya|Lebuh|Persiaran|Psn|Kampung|Kg|Menara).*,.*/gi

    let true_address = msg_body_lines.reduce((accum, msg, idx) => {
        let [add] = msg.match(malaysian_address) || [null]
        return add || accum;
    }, null)

    switch (true) {
        //Contains for
        case /for.*\d+/i.test(clinic_name):
            return clinic_name.replace('FOR ', '').replace(' 2023', '')
            break;
        //Contains DD/MM/YY or DD-MM-YY format
        case /\w+?\s\d{1,2}\/\d{1,2}\/\d{1,4}/i.test(clinic_name):
            let replace_name = clinic_name.replace(regex, '')
            return replace_name
            break;
        //Contains true address
        case true_address:
            return true_address
            break;
        //Contains comma end of string
        case clinic_name?.endsWith(','):
            return clinic_name.slice(0, -1)
            break;
        //Contains emojis non unicode, date?
        case emojiRegex.test(clinic_name):
            return clinic_name?.replace(emojiRegex, '')
            break;
        default:
            return clinic_name ? clinic_name : hospital_name;
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

const uniqByKeepFirst = (arr, key) => {
    const seen = {};
    return arr.filter((item) => {
        const k = key(item);
        if (!seen.hasOwnProperty(k)) {
            seen[k] = true;
            return true;
        }
        return false;
    });
};

const uniqueArray = function (myArr, prop) {
    return myArr.filter((obj, pos, arr) => {
        return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    callbackGramClient
}
