const { TelegramClient } = require('telegram')
const { StoreSession } = require('telegram/sessions');
const storeSession = new StoreSession("my_session");
const rlp = require('readline');

const { Logger, LogLevel } = require('./logger')
const log = new Logger(LogLevel.DEBUG)

const rl = rlp.createInterface({
    input: process.stdin,
    output: process.stdout
});
const { telegram: { phone: phone_number } } = require('../config')

const apiId = parseInt(config.telegram.id);
const apiHash = config.telegram.hash;

const client = new TelegramClient(
    storeSession,
    apiId,
    apiHash,
    { connectionRetries: 5 });
//exports.GramClient = client

// First you will receive a code via SMS or Telegram, which you have to enter
// directly in the command line. If you entered the correct code, you will be
// logged in and the credentials are saved.
async function login(client, phone) {

    await client.start({
        phoneNumber: config.telegram.phone,
        password: () => askFor('password'),
        phoneCode: () => askFor('phonecode'),
        onError: (err) => console.error(err),
    });

    await client.connect()
}

// First check if we are already signed in (if credentials are stored). If we
// are logged in, execution continues, otherwise the login process begins.
exports.checkLogin = async function () {

    if (!(await client.isUserAuthorized())) {
        log.warn('Telegram : not signed in')

        try {
            await login(client)
            log.success('Telegram : signed in successfully')
        } catch (err) {
            log.error(err);
        }

    } else {
        log.info('Telegram : already signed in')
    }
    return
}