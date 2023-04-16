require('dotenv').config();

const config = {
    telegram: {
        id: process.env.TELEGRAM_APP_ID,
        hash: process.env.TELEGRAM_APP_HASH,
        phone: process.env.TELEGRAM_PHONE_NUMBER,
        storage: process.env.TELEGRAM_FILE,
        devServer: false,
        msgHistory: {
            maxMsg: 400,
            limit: 300,
            skip_keywords: ["taken", "unpaid", "nurse", "pembantu", "female", "lady"],
            skip_location: ["JB", "Johor"],
            wanted_states: ['Selangor', 'Kuala Lumpur'],
            tolerable_duration_min: 60,
            tolerable_lowest_rate: 40
        },
        getChat: {
            limit: 50
        },
    },
    gmap: {
        API_KEY: process.env.GOOGLEMAP_API_KEY
    },
    channelinfodb: process.env.CHANNELSINFO_FILE,
    server: process.env.SERVER_URL
}

module.exports = config;
