const { Client, LocalAuth, Events } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { Logger, LogLevel } = require('./logger')
const log = new Logger(LogLevel.DEBUG)

const { whatsapp: { SESSION_FILE } } = require('../config')
const fs = require('fs');
const { whatsapp: { SecParty_phone_num }, telegram: { phone } } = require('../config');

class WhatsAppClient {
    myGroupName = 'Locum Finder'
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                puppeteer: {
                    args: ["--no-sandbox"]
                },
                authStrategy: new LocalAuth({
                    clientId: 'locumfilter123',
                    dataPath: './'
                })
            })
        });
        this.phoneNum = null
        this.myPhoneNum = null;
        this.groupID = null;
        this.attachListeners()
    }

    async start() {
        await this.client.initialize();
    }

    async getPhoneNumId(phoneNum) {
        phoneNum = phoneNum.replace(/[^\d]/g, "")
        let { _serialized } = await this.client.getNumberId(phoneNum)
        return _serialized;
    }

    attachListeners() {
        this.client.on(Events.QR_RECEIVED, (qr) => {
            qrcode.generate(qr, { small: true });
        });

        // WhatsApp authenticated
        this.client.on(Events.AUTHENTICATED, (msg) => {
        });

        // WhatsApp authentication failure
        this.client.on(Events.AUTHENTICATION_FAILURE, () => {
            log.error('not authenticated');
        });

        // WhatsApp ready
        this.client.on(Events.READY, async (ready) => {
            log.success('whatsapp ready');
            this.myPhoneNum = await this.getPhoneNumId(phone)
            this.otherPhoneNum = await this.getPhoneNumId(SecParty_phone_num)

            return this.client.getChats().then((chats) => {
                const myGroup = chats.find((chat) => chat.name === this.myGroupName);
                if (!myGroup) {
                    return this.client.createGroup(this.myGroupName, [this.myPhoneNum]).then((createGroup) => {
                        log.success(`group ${this.myGroupName} created!`)
                        this.groupID = createGroup.gid._serialized
                    })

                } else {
                    this.groupID = myGroup.id._serialized
                }


            }).catch(err => log.error(err))

        });

        this.client.on('message_ack', (message, ack) => {
            if (ack === 'message sent') {
                log.success('Message sent successfully');
            } else {
            //    log.error(`Message sending failed with ACK: ${ack}`);
            }
        });

        this.start()
    }

    async sendMessage(phoneNum, text) {
        switch (phoneNum) {
            case 'me':
                phoneNum = this.myPhoneNum;
                return await this.client.sendMessage(phoneNum, text)
                break;
            case 'my_group':
                phoneNum = this.groupID;
                const groupChat = await this.client.getChatById(phoneNum);
                await groupChat.clearMessages();
                return await groupChat.sendMessage(text);
                break;
            default:
                phoneNum = this.getPhoneNumId(phoneNum)
                return await this.client.sendMessage(phoneNum, text)
        }
    }
}
exports.WhatsAppClient = WhatsAppClient