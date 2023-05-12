const { getChannelsID, chatHistory, callbackGramClient } = require('./chat-history')
const db = require('./utils/db');
const { TelegramClient } = require('telegram')
const { StoreSession } = require('telegram/sessions');
const storeSession = new StoreSession("my_session");

const express = require("express");
var bodyParser = require('body-parser')

let { BASE_TEMPLATE, PHONE_FORM, PASSWORD_FORM, CODE_FORM } = require('./frontend/html');
const config = require('./config');
const { Logger, LogLevel } = require('./utils/logger');
const { WhatsAppClient } = require('./utils/whatsapp');
const { callbackPromise } = require('./utils/helper');
const waclient = new WhatsAppClient()

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const log = new Logger(LogLevel.DEBUG)

const apiId = parseInt(config.telegram.id);
const apiHash = config.telegram.hash;

const gramClient = new TelegramClient(
    storeSession,
    apiId,
    apiHash,
    { connectionRetries: 5 });

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const doneGramLoginCallback = callbackPromise();
const codeCallback = callbackPromise();

(async () => {
    const port = process.env.PORT != '' ? 3000 : process.env.PORT
    app.listen(port, () => log.info('API running on port ' + port))

    let waclientStatus = await waclient.qrStatus()
    await gramClient.connect()
    let gramclientStatus = await gramClient.isUserAuthorized()

    if (waclientStatus == 'ready' && gramclientStatus) {
        log.success('Telegram : User logged in')
        start()
    } else {
        app.get("/", async (req, res) => {
            // add qr code if there is
            if (waclientStatus !== 'ready')
                CODE_FORM += waclientStatus
            res.send(BASE_TEMPLATE.replace("{{0}}", CODE_FORM));

            await gramClient.start({
                phoneNumber: config.telegram.phone,
                phoneCode: async () => codeCallback.promise,
                password: '',
                onError: (err) => {
                    doneGramLoginCallback.resolve(false)
                    log.error(err)
                }
            });

            doneGramLoginCallback.resolve(true)
            await gramClient.connect()
            start()
        })
    }

})()


app.post("/", async (req, res) => {
    //To access POST variable use req.body()methods.
    if ("code" in req.body) {
        const { code } = req.body;
        codeCallback.resolve(code)
        let waclientStatus = await waclient.qrStatus()

        start()

        if (waclientStatus == 'ready' && await doneGramLoginCallback.promise) {
            return res.send(BASE_TEMPLATE.replace("{{0}}", `<h1>LOGGED IN SUCCESS</h1>`));
        } else
            return res.send(BASE_TEMPLATE.replace("{{0}}", `<h1>FAILED LOGGED IN</h1>`));

    };
})

const run = async (chat) => {
    await db.makeSessionFilesWritable()
    await chatHistory(chat)
}

const start = async () => {
    callbackGramClient(gramClient)
    let chat = await db.getChat();

    if (!chat) {
        chat = await getChannelsID();
        await db.updateChat(chat)
    }

    let timerId = setTimeout(function tick() {
        run(chat);
        timerId = setTimeout(tick, 60000);
    }, 2000);
}