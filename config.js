require('dotenv').config();

const config = {
    telegram: {
        id: process.env.TELEGRAM_APP_ID,
        hash: process.env.TELEGRAM_APP_HASH,
        phone: process.env.TELEGRAM_PHONE_NUMBER,
        storage: process.env.TELEGRAM_FILE,
        devServer: false,
        msgHistory: {
            maxNumFiltrMsgsPerChannel: 200,
            maxNumUnfiltrMsgsPerChannel: 400,
            skip_keywords: ["taken", "unpaid", "nurse", "pembantu", "female", "lady"],
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
        session_file: process.env.WHATSAPP_SESSION,
        SecParty_phone_num: process.env.WHATSAPP_2NDPARTY_PHONE_NUMBER
    },
    channelinfodb: process.env.CHANNELSINFO_FILE,
    failedGmapQuerydb: process.env.FAILEDGMAPQUERY_FILE,
    server: process.env.SERVER_URL
}

module.exports = config;
