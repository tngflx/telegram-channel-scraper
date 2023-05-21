const { telegram: { msgHistory } } = require('./config')
const { Logger, LogLevel } = require('./utils/logger')
const log = new Logger(LogLevel.DEBUG)

const db = require('./utils/db');
const { Api } = require("telegram");
const { Gmap } = require('./utils/googlemap')
const gmap = new Gmap()

const { moment } = require('./utils/moment');
const { checkIfContainKeyword } = require('./utils/helper');
const Moment = new moment()

let GramClient, WAclient
const callbackBothClients = (_gramClient, _WAclient) => {
    WAclient = _WAclient
    GramClient = _gramClient;
};

/**
 * Get groups in telegram to get channel ID
 * @returns
 */
const getChannelsID = async () => {

    const dialogs = await GramClient.getDialogs({
        limit: 50
    });

    return dialogs.reduce((accum, { name, id }, idx) => {
        let _name = name.trim().toLowerCase()
        if (_name.includes('locum'))
            accum.push({ name, id });
        return accum
    }, [])
}

const chatHistory = async (channels) => {

    const { maxNumFiltrMsgsPerChannel, maxNumUnfiltrMsgsPerChannel, skip_keywords, skip_location } = msgHistory

    let showNew = [],
        lastIdofMsgs;

    const combineSkipKeywords = [].concat(...skip_keywords, ...skip_location)

    for (const [channel_index, { id: channelId, name }] of channels.entries()) {
        lastIdofMsgs = await db.getLastMsgId(channel_index);
        let offsetId = 0
        let current_messages = []
        let locum_only_messages = []

        do {
            await sleep(300)
            let history = await GramClient.getMessages(channelId, {
                minId: offsetId,
                limit: maxNumUnfiltrMsgsPerChannel
            });

            /**
             * Preliminary check if the current_messages are truly message and not vote post or others
             * if message contain keyword female or lady, don't take the locum'
             */
            current_messages = history.filter(filterLastDay).filter(({ isReply, className, message }) =>
                className === 'Message'
                && checkIfContainKeyword(message, ['locum', 'slot'])
                && !isReply && !checkIfContainKeyword(message, combineSkipKeywords)
            )

            locum_only_messages = locum_only_messages.concat(current_messages);

            if (current_messages.length > 0) {
                // For pagination purpose
                offsetId = current_messages[0].id

                // saving lastmsgID in DB
                channels[channel_index]['lastMsgId'] = current_messages[0].id
                await db.updateLastMsgId(channels)
                log.info(`channelName: ${name} lastMsgId: ${lastIdofMsgs}`)
            } else {
                log.error('no current_messages passed filter, something wrong with filter')
            }


        } while (current_messages.length === maxNumUnfiltrMsgsPerChannel && locum_only_messages.length < maxNumFiltrMsgsPerChannel)

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
    if (reformatWA_filterDistance_locums?.length > 0) {

        sentToWA = await reformatWA_filterDistance_locums.reduce(async (accum, { name, ...chats }) => {
            const previousResult = await accum;
            for (let { full_msg, ...others } of Object.values(chats)) {
                sleep(300)
                if (Array.isArray(full_msg) && full_msg.length > 0)
                    full_msg = full_msg.join('\n')
                others = '\n' + JSON.stringify(others, null, 2)
                full_msg += others
                previousResult.push(await WAclient.sendMsg('my_group', full_msg));
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
        if (!(chats.length > 0)) break;

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
                await sleep(600);

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
 * @param {any} locum_only_messages
 */
const filter_locum_distance = async (msgs) => {
    if (!msgs || msgs.length === 0) {
        return null;
    }

    let accepted_locums = []

    const { tolerable_travel_duration_min, tolerable_work_duration_hours, tolerable_lowest_rate } = msgHistory;

    for (const { chats, name } of msgs) {
        let accepted_locum_per_channel = [];
        if (!(chats.length > 0)) break;

        for (const [channel_index, { parent_msg }] of chats.entries()) {
            let msg_body_lines = parent_msg.split('\n').filter((m) => m.trim() !== '')
            const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g
            msg_body_lines = msg_body_lines.map(text => { text = text.replace(emojiRegex, ''); return text.trim() })

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
                let phone_numbers = msg_line.match(/[\+6]?(\d{2,3})\s*[-\S]\s*(\d{7,8})/g)
                phone_numbers = phone_numbers?.[0]

                let work_time = msg_line.match(/\d{1,2}\.*\d{0,2}\s?[ap]m/gi)

                let malaysian_address = /(Lot|No|\d+).*(Jalan|Jln|Lorong|Lrg|Lebuhraya|Lebuh|Persiaran|Psn|Kampung|Kg|Menara).*,.*/gi
                malaysian_address = msg_line.match(malaysian_address)

                let locum_date = msg_line.match(/\d{1,2}\s?[\/\-.]\s?\d{1,2}\s?[\/\-.]\s?\d{2,4}|\d{1,2}\s?[a-zA-Z]+\s?\d{2,4}|\d{1,2}\s?[\/\-.]\s?\d{1,2}/gi)

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
                         * If travel duration is less than an hour, check for locum rate
                         */
                        if (parseInt(duration) < parseInt(tolerable_travel_duration_min)) {
                            accepted_locum_per_channel[channel_index] = { full_msg: msg_body_lines, distance, travel_duration_min: duration }
                            continue;
                        }
                    }

                    // If previous clinic wasn't put in accepted_locum_body, meant it was not accepted
                    // Locum rate is on the next line of message
                }

                if (accepted_locum_per_channel[channel_index]) {
                    if (locum_rate) {
                        if (parseInt(locum_rate) < parseInt(tolerable_lowest_rate)) {
                            accepted_locum_per_channel.splice(channel_index, 1)
                            break;
                        } else if (parseInt(locum_rate) >= parseInt(tolerable_lowest_rate)) {
                            accepted_locum_per_channel[channel_index] = { ...accepted_locum_per_channel[channel_index], locum_rate: locum_rate }
                        }

                    }
                    if ((phone_numbers || whatsapp_link)) {
                        if (whatsapp_link) {
                            accepted_locum_per_channel[channel_index] = { ...accepted_locum_per_channel[channel_index], whatsapp_link }
                        } else {
                            accepted_locum_per_channel[channel_index] = { ...accepted_locum_per_channel[channel_index], whatsapp_link: `https://wa.me/+6${phone_numbers}` }
                        }

                    }
                    if (work_time) {
                        // Convert am/pm to 24hours format, calculate durations
                        let [startTime, endTime] = work_time;
                        if (!startTime || !endTime)
                            continue;
                        let work_duration = Moment.Time.calcDuration(startTime, endTime)
                        const tolerable_work_duration_mins = tolerable_work_duration_hours * 60

                        if (work_duration >= tolerable_work_duration_mins) {
                            accepted_locum_per_channel[channel_index] = { ...accepted_locum_per_channel[channel_index], work_duration: `${work_duration / 60} hour` }
                        } else if (work_duration < tolerable_work_duration_mins) {
                            accepted_locum_per_channel.splice(channel_index, 1)
                            break;
                        }
                    }
                    if (locum_date?.[0] && !phone_numbers && !work_time && !malaysian_address) {

                        locum_date = new Date(Moment.Date.convertDateFormat(locum_date[0]))
                        let otherDates = accepted_locum_per_channel[channel_index]?.['locum_date']?.['otherDates']

                        if (Array.isArray(otherDates)) {
                            otherDates = otherDates.push(locum_date)
                            let latest = otherDates.reduce((acc, dateString) => {
                                const currentDate = new Date(dateString);
                                if (!acc.latestDate || currentDate > acc.latestDate) {
                                    acc = currentDate;
                                }
                                return acc;
                            }, '');
                            accepted_locum_per_channel[channel_index]['locum_date'] = { latest, otherDates }

                        } else {
                            accepted_locum_per_channel[channel_index] = { ...accepted_locum_per_channel[channel_index], locum_date: { latest: locum_date, otherDates: [locum_date] } }
                            accepted_locum_per_channel.sort((a, b) => {
                                console.log(a.locum_date)
                                console.log(b.locum_date)
                                a.locum_date.latest - b.locum_date.latest
                            });
                        }
                    }
                }
            }

        }
        let combine_channel_name = {
            name,
            ...accepted_locum_per_channel.filter(val => val) //Reindex array back
        }
        accepted_locums.push(combine_channel_name)
        console.log(accepted_locums)
    }
    return accepted_locums

}

const reformatClinicName = (msg_line, msg_body_lines) => {
    let [clinic_name] = msg_line.match(/\b(\w* ?\w*?[ck]lini[ck][^,]*)/i) || [null]

    // remove all non string character in clinic_name
    let nonStringCharReg = /[^\w\s]|_$/g
    clinic_name = clinic_name?.replace(nonStringCharReg, '');

    let ddmmyyRegex = /\w+?\s\d{1,2}\/\d{1,2}\/\d{1,4}/i

    let [hospital_name] = msg_line.match(/.*\bhospital\b.*/i) || [null]
    hospital_name = hospital_name?.replace(nonStringCharReg, '');

    // If there is address found, use that as clinic name instead
    let malaysian_address = /(Lot|No|\d+).*(Jalan|Jln|Lorong|Lrg|Lebuhraya|Lebuh|Persiaran|Psn|Kampung|Kg|Menara).*,.*/gi

    let true_address = msg_body_lines.reduce((accum, msg, idx) => {
        let [add] = msg.match(malaysian_address) || [null]
        return add || accum;
    }, null)

    switch (true) {
        //Contains for
        case /for.*\d+/i.test(clinic_name):
            return clinic_name.replace('FOR ', '').replace(' 2023', '')
        //Contains DD/MM/YY or DD-MM-YY format
        case ddmmyyRegex.test(clinic_name):
            return clinic_name.replace(ddmmyyRegex, '')
        //Contains true address
        case true_address:
            return true_address
        //Contains non-string character at end of name
        case nonStringCharReg.test(clinic_name):
            return clinic_name.replace(nonStringCharReg, '')
        default:
            return clinic_name ? clinic_name : hospital_name;
    }


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
const dayRange = () => Date.now() - new Date(86400000 * msgHistory.olderByDays)
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
    callbackBothClients
}
