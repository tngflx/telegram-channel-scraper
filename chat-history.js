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
                log.error(`no current_messages for channel :${name}`)
                break;
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
    const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g

    for (const { chats, name } of msgs) {
        let accepted_locum_per_channel = [];
        if (chats?.length == 0)
            continue;

        for (const [channel_index, { parent_msg }] of chats.entries()) {
            let msg_body_lines = parent_msg.split('\n').filter((text) => text !== '')

            // Skip if there is only one line in the message, most likely heated discussion only
            if (msg_body_lines.length === 1) {
                continue;
            }

            msg_body_lines = msg_body_lines.map(text => { text = text.replace(emojiRegex, ''); return text.trim() })

            // Matches 'Klinik some', 'Poliklinik some','Sai poliklinik, 56000',
            let clinic_name = await reformatClinicName(msg_body_lines)

            let checked_clinic = false //If the clinic name checked before, stop process google map

            for (const msg_line of msg_body_lines) {
                // Extract rate from msg_line
                let locum_rate = msg_line.match(/(?<=^|\D)(?:RM\s?)?\d+(?:\.\d{1,2})?(?=(\s*\/(hour|hr|hrly|hourly|h))|(\s*\/\s*hr)|(\s*\/\s*hour)|\s+per\s+(hour|hr|h))/i)
                locum_rate = null || locum_rate?.[0].replace(/[^\d.-]/g, '')

                // Extract whatsapp link from msg_line
                let whatsapp_link = msg_line.match(/(?:api\.whatsapp\.com\/(.*)=\d{10,12})|(wa(?:s|ss)ap\.my|wa\.me)\/.\d+(?:\/\w+)?|(wa\.link)\/.*/gi)
                whatsapp_link = whatsapp_link?.[0]

                // match all kind phone number and form whatsapp link from it
                let phone_numbers = msg_line.match(/[\+6]?(\d{2,3})\s*[-\S]\s*(\d{4})\s*(\d{3,4})/g)
                phone_numbers = phone_numbers?.[0]

                let work_time = msg_line.match(/\d{1,2}\.*\d{0,2}\s?[ap]m/gi)

                let malaysian_address = /(Lot|No|\d+).*(Jalan|Jln|Lorong|Lrg|Lebuhraya|Lebuh|Persiaran|Psn|Kampung|Kg|Menara).*,.*/gi
                malaysian_address = msg_line.match(malaysian_address)

                let locum_date = msg_line.match(/\d{1,2}\s?[.\-/]\s?\d{1,2}\s?[.\-/]\s?\d{2,4}|\d{1,2}\s?[a-zA-Z]+\s?\d{2,4}|\d{1,2}\s?[.\-/]\s?\d{1,2}/i)

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
                    if (locum_date?.[0] && !phone_numbers && !malaysian_address) {
                        locum_date = new Date(Moment.Date.convertDateFormat(locum_date[0]))
                        let multiDatesArr = accepted_locum_per_channel[channel_index]?.['locum_date']?.['multiDatesArr']

                        if (locum_date.toString() !== 'Invalid Date') {
                            if (multiDatesArr?.length > 0) {
                                const latestDateinArr = () => new Date(Math.max(...multiDatesArr));

                                // Parasitical reduce loop to find day difference between each date
                                const differenceInTime = locum_date.getTime() - latestDateinArr().getTime();
                                const differenceInDays = differenceInTime / (1000 * 3600 * 24);

                                if (Math.abs(differenceInDays) <= 20) {
                                    multiDatesArr.push(locum_date)
                                }

                                accepted_locum_per_channel[channel_index]['locum_date'] = { latest: latestDateinArr(), multiDatesArr }

                            } else if (!multiDatesArr || multiDatesArr.length == 0) {
                                accepted_locum_per_channel[channel_index] = { ...accepted_locum_per_channel[channel_index], locum_date: { latest: locum_date, multiDatesArr: [locum_date] } }
                            }
                        }
                    }
                }
            }
        }
        let combine_channel_name = {
            name,
            ...accepted_locum_per_channel.sort((a, b) => {
                const dateA = a?.locum_date?.latest
                const dateB = b?.locum_date?.latest

                if (dateA && dateB) {
                    return dateB.getTime() - dateA.getTime();
                } else if (dateA) {
                    return -1; // Move objects with dateA to a lower index
                } else if (dateB) {
                    return 1; // Move objects with dateB to a lower index
                }

            }) //Sort array by timelatest and reindex back
        }
        accepted_locums.push(combine_channel_name)
        console.log(accepted_locums)
    }
    return await accepted_locums

}

const reformatClinicName = (msg_body_lines) => {
    return new Promise((resolve, reject) => {
        const regex = /\b(\w* ?\w*?[ck]lini[ck][^,]*)/i;
        const nonStringCharReg = /[^\w\s]|_$/g;
        const malaysian_address = /(Lot|No|\d+).*(Jalan|Jln|Lorong|Lrg|Lebuhraya|Lebuh|Persiaran|Psn|Kampung|Kg|Menara).*,.*/gi;

        let matched = null;

        for (const msg_line of msg_body_lines) {
            let [clinic_name] = msg_line.match(regex) || [null];
            let hospital_name = checkIfContainKeyword(msg_line, ['hospital']) || null;
            let [true_address] = msg_line.match(malaysian_address) || [null]

            if (clinic_name && /for.*\d+|2023|\d{4}$/i.test(clinic_name)) {
                matched = clinic_name.replace(/FOR | 2023|\d{4}/gi, '');
                break;
            }

            if (clinic_name && /\w+?\s\d{1,2}\/\d{1,2}\/\d{1,4}/i.test(clinic_name)) {
                matched = clinic_name.replace(/\w+?\s\d{1,2}\/\d{1,2}\/\d{1,4}/i, '');
                break;
            }

            if (true_address) {
                matched = true_address;
                break;
            }

            if (clinic_name && nonStringCharReg.test(clinic_name)) {
                matched = clinic_name.replace(nonStringCharReg, '');
                break;
            }

            if (clinic_name) {
                matched = clinic_name;
                break;
            }

            if (hospital_name) {
                matched = hospital_name;
                break;
            }
        }
        resolve(matched);
    });
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

module.exports = {
    getChannelsID,
    chatHistory,
    callbackBothClients
}
