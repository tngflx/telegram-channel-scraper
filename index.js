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

const client = new TelegramClient(
    storeSession,
    apiId,
    apiHash,
    { connectionRetries: 5 });

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.listen(3000, () => log.info('API running on port ' + 3000))

app.get("/", async (req, res) => {
    if (await client.isUserAuthorized()) {
        log.success('Telegram : User logged in')
    } else {
        let qr = await waclient.qrcodeListener()
        CODE_FORM += qr
        res.send(BASE_TEMPLATE.replace("{{0}}", CODE_FORM));

        await client.start({
            phoneNumber: config.telegram.phone,
            phoneCode: async () => codeCallback.promise,
            password: async () => passwordCallback.promise,
            onError: (err) => log.error(err),
        });
        await client.connect()

        start()

    }
});

app.post("/", async (req, res) => {
    //To access POST variable use req.body()methods.
    if ("code" in req.body) {
        codeCallback.resolve(req.body.code);
        return res.send(BASE_TEMPLATE.replace("{{0}}", PASSWORD_FORM));
    }
    if ("password" in req.body) {
        passwordCallback.resolve(req.body.code);
        res.redirect("/");
    }
    console.log(req.body);
});

const codeCallback = callbackPromise();
const passwordCallback = callbackPromise();

const run = async (chat) => {
    await db.makeSessionFilesWritable()
    await chatHistory(chat)
}

const start = async () => {
    callbackGramClient(client)
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