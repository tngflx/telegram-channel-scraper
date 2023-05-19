require('dotenv').config();

const config = {
    telegram: {
        id: process.env.TELEGRAM_APP_ID,
        hash: process.env.TELEGRAM_APP_HASH,
        phone: process.env.TELEGRAM_PHONE_NUMBER,
        storage: process.env.TELEGRAM_FILE,
        devServer: false,
        msgHistory: {
            olderByDays: 3,
            maxNumFiltrMsgsPerChannel: 200,
            maxNumUnfiltrMsgsPerChannel: 100,
            skip_keywords: ["taken", "unpaid", "nurse", "pembantu", "female", "lady", "sonographer"],
            skip_location: ["JB", "Johor"],
            wanted_states: ['Selangor', 'Kuala Lumpur'],
            tolerable_travel_duration_min: 60,
            tolerable_work_duration_hours: 5,
            tolerable_lowest_rate: 40
        },
        getChat: {
            limit: 50
        },
    },
    gmap: {
        API_KEY: process.env.GOOGLEMAP_API_KEY,
        geolocate: true
    },
    whatsapp: {
        SecParty_phone_num: process.env.WHATSAPP_2NDPARTY_PHONE_NUMBER,
        clearMsg: true
    },
    channelinfodb: process.env.CHANNELSINFO_FILE,
    failedGmapQuerydb: process.env.FAILEDGMAPQUERY_FILE,
    server: process.env.SERVER_URL
}

module.exports = config;
