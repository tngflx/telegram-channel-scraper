const { getChannelsID, chatHistory, callbackBothClients } = require('./chat-history')
const config = require('./config');
const db = require('./utils/db');
const { TelegramClient } = require('telegram')
const { StoreSession } = require('telegram/sessions');

let gramsessionName = "gram_sessions"
const storeSession = new StoreSession(gramsessionName);

const express = require("express");
var bodyParser = require('body-parser')
const app = express();

let { handleAssets, FAIL_PAGE, SUCCESS_PAGE, CODE_FORM, QR_IMAGE } = require('./frontend/html')

const { Logger, LogLevel } = require('./utils/logger');

const { WhatsAppClient, Events } = require('./utils/whatsapp');
const { callbackPromise } = require('./utils/helper');
const { WebSocket } = require('./websocket');
const WS = new WebSocket()

const WAclient = new WhatsAppClient()

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

let sentWAMsgs;
const gramLoggedIn = callbackPromise();
const codeCallback = callbackPromise();

// First you will receive a code via SMS or Telegram, which you have to enter
// directly in the command line. If you entered the correct code, you will be
// logged in and the credentials are saved.

handleAssets()
    .then((HTML) => {
        // if environment is dev, clear channels.json for retrieve new update
        if (process.env.NODE_ENV == 'dev') {
            db.updateChat("")
            db.updateFail("clear")
        }
        return HTML
    })
    .then(async (HTML) => {
        let BASE_TEMPLATE = HTML;

        const port = process.env.PORT == '' ? process.env.PORT : 80
        app.listen(port, () => log.info('API running on port ' + port))

        let [WAclientStatus, gramclientStatus] = await Promise.all([
            WAclient.checkAuthStatus(),
            (async () => {
                await gramClient.connect(); return gramClient.isUserAuthorized()
            })()
        ])

        log.info(`WAclientStatus :${WAclientStatus}, GramclientStatus : ${gramclientStatus}`)

        switch (true) {
            case WAclientStatus && gramclientStatus:
                app.get('/', (req, res) => {
                    res.redirect('/success')
                })
                start()
                break;

            case WAclientStatus && !gramclientStatus:
                app.get("/", async (req, res) => {
                    await handleGramLogin(res)

                    if (gramLoggedIn.promise)
                        start()
                })
                break;

            case !WAclientStatus && gramclientStatus:
                // To reset back authstatus after its current state, cause promise only resolve once and non changeable

                app.get("/", async (req, res) => {
                    let qr = await handleWAlogin()
                    res.send(BASE_TEMPLATE.replace("{{0}}", qr))

                })

                break;

            default:
                // To reset back authstatus after its current state, cause promise only resolve once and non changeable
                app.get("/", async (req, res) => {
                    // add qr code if there is
                    let qr = await handleWAlogin()
                    await handleGramLogin(res, qr)


                })
                break;
        }


        const handleWAlogin = async () => {
            let qr = await WAclient.getQRImage()
            QR_IMAGE = QR_IMAGE.replace("{{qr}}", qr)

            WAclient.on('auth_status', async (status, qrDataURL) => {
                if (qrDataURL)
                    WS.sendMsg({ qrDataURL })

                if (status && await gramLoggedIn.promise)
                    WS.sendMsg({ redirect: 'success' })
            })

            return QR_IMAGE;
        }

        /**
         * Handle gram Login
         * @param {any} res expressjs response
         * @param {any} ADD_HTML additional html to add to code_form
         * @param {any} BASE_TEMPLATE base html for web
         * @returns
         */
        const handleGramLogin = async (res, ADD_HTML) => {
            ADD_HTML ? CODE_FORM += ADD_HTML : CODE_FORM
            BASE_TEMPLATE = BASE_TEMPLATE.replace("{{0}}", CODE_FORM)
            res.send(BASE_TEMPLATE);

            await gramClient.start({
                phoneNumber: config.telegram.phone,
                phoneCode: async () => codeCallback.promise,
                password: '',
                onError: (err) => {
                    gramLoggedIn.resolve(false)
                    log.error(err)
                }
            });

            await gramClient.connect()
            return gramLoggedIn.resolve(true)
        }

    })


app.get('/success', (req, res) => {
    return res.send(SUCCESS_PAGE());
})

app.get('/fail', (req, res) => {
    return res.send(FAIL_PAGE());
})


app.post("/", async (req, res) => {
    //To access POST variable use req.body()methods.
    if ("code" in req.body) {
        const { code } = req.body;
        codeCallback.resolve(code)

        if (await WAclient.checkAuthStatus() && await gramLoggedIn.promise)
            res.redirect('/success')
        else {
            res.redirect('/fail')
        }
    }
})

const run = async (channels) => {
    await db.makeSessionFilesWritable(gramsessionName)
    sentWAMsgs = await chatHistory(channels)
}

let timerId;
const start = async () => {
    callbackBothClients(gramClient, WAclient)
    let channels = await db.getChat();

    if (!channels) {
        channels = await getChannelsID();
        await db.updateChat(channels)
    }
    (function tick() {
        run(channels);
        timerId = setTimeout(function () {
            clearTimeout(timerId);
            tick();
        }, config.telegram.msgHistory.executeIntervalMin * 60 * 1000);
    })();
}