const { Client, LocalAuth, Events } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { Logger, LogLevel } = require('./logger')
const log = new Logger(LogLevel.DEBUG)

const { whatsapp: { SESSION_FILE } } = require('../config')
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
                clientId: 'locumfilter12',
                dataPath: './'
            })
        })
        this.phoneNum = null
        this.myPhoneNum = null;
        this.groupID = null;
        this.checkIfQRneed = callbackPromise()

        this.attachListeners()
    }

    async getPhoneNumId(phoneNum) {
        phoneNum = phoneNum.replace(/[^\d]/g, "")
        let { _serialized } = await super.getNumberId(phoneNum)
        return _serialized;
    }

    async qrStatus() {
        const qrDataURL = await this.checkIfQRneed.promise
        switch (true) {
            case /\w+/g.test(qrDataURL):
                return qrDataURL
            default:
                return `<img src="${qrDataURL}" alt="QR Code"/>`
        }
    }

    async attachListeners() {
        let outerThis = this;
        this.on(Events.QR_RECEIVED, (qr) => {
            qrcode.toDataURL(qr, (err, url) => {
                if (err) {
                    log.error('Error generating QR code:', err);
                    outerThis.checkIfQRneed.reject(err)
                } else {
                    outerThis.checkIfQRneed.resolve(url)
                }
            });
        });

        // WhatsApp authenticated
        this.on(Events.AUTHENTICATED, (msg) => {
        });

        // WhatsApp authentication failure
        this.on(Events.AUTHENTICATION_FAILURE, () => {
            log.error('not authenticated');
        });

        // WhatsApp ready
        this.on(Events.READY, async (ready) => {
            outerThis.checkIfQRneed.resolve('ready')
            log.success('whatsapp ready');
            this.myPhoneNum = await outerThis.getPhoneNumId(phone)
            this.otherPhoneNum = await outerThis.getPhoneNumId(SecParty_phone_num)

            return super.getChats().then((chats) => {
                const myGroup = chats.find((chat) => chat.name === this.myGroupName);
                if (!myGroup) {
                    return super.createGroup(this.myGroupName, [this.myPhoneNum]).then((createGroup) => {
                        log.success(`group ${this.myGroupName} created!`)
                        this.groupID = createGroup.gid._serialized
                    })

                } else {
                    this.groupID = myGroup.id._serialized
                }


            }).catch(err => {
                outerThis.checkIfQRneed.resolve('error')
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
                await groupChat.clearMessages();
                return await groupChat.sendMessage(text);
                break;
            default:
                phoneNum = this.getPhoneNumId(phoneNum)
                return await super.sendMessage(phoneNum, text)
        }
    }
}
exports.WhatsAppClient = WhatsAppClient