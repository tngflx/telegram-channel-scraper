/* eslint-disable no-case-declarations */
/* eslint-disable no-unreachable */
const { Client, LocalAuth, Events } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { Logger, LogLevel } = require('./logger')
const log = new Logger(LogLevel.DEBUG)

const { whatsapp: { clearMsg }, telegram } = require('../config')
const { whatsapp: { SecParty_phone_num }, telegram: { phone } } = require('../config');
const { callbackPromise } = require('./helper');

class WhatsAppClient extends Client {
    myGroupName = 'Locum Finder'
    constructor() {

        super({
            puppeteer: {
                args: ["--no-sandbox"]
            },
            authStrategy: new LocalAuth({
                clientId: 'whatsapp',
                dataPath: './'
            })
        })
        this.phoneNum = null
        this.myPhoneNum = null;
        this.groupID = null;
        this.qrImage = callbackPromise()
        this.authStatus = callbackPromise()
        this.attachListeners()
    }

    async getPhoneNumId(phoneNum) {
        phoneNum = phoneNum.replace(/[^\d]/g, "")
        let { _serialized } = await super.getNumberId(phoneNum)
        return _serialized;
    }

    async checkAuthStatus() {
        return this.authStatus.promise;
    }

    // to get first qrimage
    async getQRImage() {
        return await this.qrImage.promise
    }

    aggregateAuthListener() {
        this.on('auth_status', (status, url) => {
            this.qrImage.resolve(url)
            this.authStatus.resolve(status);
        })
    }

    async attachListeners() {
        this.aggregateAuthListener()

        this.on(Events.QR_RECEIVED, (qr) => {
            qrcode.toDataURL(qr, (err, url) => {
                if (err) {
                    log.error('Error generating QR code:', err);
                    this.emit('auth_status', false)
                } else {
                    this.emit('auth_status', false, url)
                }
            });
        });

        // WhatsApp authenticated
        this.on(Events.AUTHENTICATED, () => {
            this.emit('auth_status', true)
        });

        // WhatsApp authentication failure
        this.on(Events.AUTHENTICATION_FAILURE, () => {
            this.emit('auth_status', false)
            log.error('not authenticated');
        });

        // WhatsApp ready
        this.on(Events.READY, async () => {
            log.success('whatsapp ready');
            this.myPhoneNum = await this.getPhoneNumId(phone)
            this.otherPhoneNum = await this.getPhoneNumId(SecParty_phone_num)

            return super.getChats().then((chats) => {
                const myGroup = chats.find((chat) => chat.name === this.myGroupName);

                if (process.env.NODE_ENV == 'dev' || clearMsg == true) {
                    myGroup.clearMessages().then(status => {
                        log.info('WA.clearMessages: ' + status)
                    })
                }

                if (!myGroup) {
                    return super.createGroup(this.myGroupName, [this.myPhoneNum]).then((createGroup) => {
                        log.success(`group ${this.myGroupName} created!`)
                        this.groupID = createGroup.gid._serialized
                    })

                } else {
                    this.groupID = myGroup.id._serialized
                }


            }).catch(err => {
                this.emit('auth_status', false)
                log.error(err)
            })

        });

        this.on('message_ack', (message, ack) => {
            if (ack === 'message sent') {
                log.success('Message sent successfully');
            } else {
                //    log.error(`Message sending failed with ACK: ${ack}`);
            }
        });

        super.initialize()
    }

    async sendMsg(phoneNum, text) {
        switch (phoneNum) {
            case 'me':
                phoneNum = this.myPhoneNum;
                return await super.sendMessage(phoneNum, text)
                break;
            case 'my_group':
                phoneNum = this.groupID;
                const groupChat = await super.getChatById(phoneNum);
                return await groupChat.sendMessage(text);
                break;
            default:
                phoneNum = this.getPhoneNumId(phoneNum)
                return await super.sendMessage(phoneNum, text)
        }
    }
}
module.exports = {
    WhatsAppClient,
    Events
}
