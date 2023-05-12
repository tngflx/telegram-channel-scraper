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
const WAclient = new WhatsAppClient()

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

// First you will receive a code via SMS or Telegram, which you have to enter
// directly in the command line. If you entered the correct code, you will be
// logged in and the credentials are saved.

(async () => {
    const port = process.env.PORT != '' ? 3000 : process.env.PORT
    app.listen(port, () => log.info('API running on port ' + port))
    let [WAclientStatus, gramclientStatus] = await Promise.all([
        WAclient.checkAuthStatus(),
        (async () => {
            await gramClient.connect(); return gramClient.isUserAuthorized()
        })()
    ])

    // To reset back authstatus after its current state, cause promise only resolve once and permanent
    WAclient.authStatus = callbackPromise();

    switch (true) {
        case WAclientStatus && gramclientStatus:
            log.success('Telegram : User logged in')
            start()
            break;

        case WAclientStatus && !gramclientStatus:
            app.get("/", async (req, res) => {
                // add qr code if there is
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

                await gramClient.connect()
                res.redirect('/success')
                start()
            })
            break;

        case !WAclientStatus && gramclientStatus:
            app.get("/", async (req, res) => {
                res.send(BASE_TEMPLATE.replace("{{0}}", await WAclient.getQrImage()));

                WAclientStatus = await WAclient.checkAuthStatus()
                if (WAclientStatus) res.redirect('/success')

            })

            break;

        default:
            app.get("/", async (req, res) => {
                // add qr code if there is
                CODE_FORM += await WAclient.getQrImage()
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

                await gramClient.connect()
                res.redirect('/success')
                start()
            })
            break;
    }

})()

app.get('/success', (req, res) => {
    return res.send(BASE_TEMPLATE.replace("{{0}}", `<h1>LOGGED IN SUCCESS</h1>`));
})

app.get('/fail', (req, res) => {
    return res.send(BASE_TEMPLATE.replace("{{0}}", `<h1>LOGGED IN FAILED</h1>`));
})

app.post("/", (req, res) => {
    //To access POST variable use req.body()methods.
    if ("code" in req.body) {
        const { code } = req.body;
        codeCallback.resolve(code)
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