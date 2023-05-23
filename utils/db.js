const fs = require("fs");
const path = require("path");
const { channelinfodb: CHANNEL_DB, failedGmapQuerydb: FAILED_DB } = require('../config');
const { Logger, LogLevel } = require('./logger');
const { error } = require('console');
const log = new Logger(LogLevel.DEBUG)

async function readDb(file) {
    return new Promise((res, rej) => {
        let dir = path.dirname(file)
        if (!fs.existsSync(dir)) rej(new Error("directory not found"))

        fs.readFile(file, 'utf8', (err, data) => {
            err ? rej(err) : res(data)
        });
    })
}

async function writeFile(json, file) {
    return new Promise((res, rej) => {
        let dir = path.dirname(file)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, error => error ? log.error(error) : log.info('You have created the nested_directory'));
        }

        fs.writeFile(file, JSON.stringify(json, null, 2), "utf8", (err) => {
            err ? rej(err) : res();
        });
    })
}

/**
 * LastMsgId can only work by replacing whole json document, so we need to read old one
 * and modify it and paste it
 * @param {any} original_data
 * @returns
 */
async function updateLastMsgId(original_data) {
    try {
        return await writeFile(original_data, CHANNEL_DB)
    } catch (err) {
        log.error('updateLastMsgId : ' + err)
    }
}

async function getLastMsgId(channelIndex) {
    let file;
    try {
        const readFile = await readDb(CHANNEL_DB);
        file = JSON.parse(readFile)

        // Another check to make sure lastMsgId object exists
        if (file && file?.[channelIndex].hasOwnProperty('lastMsgId'))
            return file[channelIndex]['lastMsgId']
        else
            throw new Error('json key \lastMsgId\ is not set')
    } catch (err) {

        if (!file) {
            log.error('Can/t parse CHANNEL_DB json data, likely empty')
            return 1
        } else {
            log.error(err?.hasOwnProperty('message') ? err.message : err)
            file[channelIndex]['lastMsgId'] = 1
            await updateLastMsgId(file);
            return 1;
        }
    }
}

async function getChat() {
    try {
        const readFile = await readDb(CHANNEL_DB);
        const file = JSON.parse(readFile)
        return file;
    } catch (err) {
        log.error(`${CHANNEL_DB} is empty`);
        return false;
    }
}

async function updateChat(obj) {
    try {
        await writeFile(obj, CHANNEL_DB)
    } catch (err) {
        log.error(err)
    }
}

function updateFail(newData) {
    // Read the existing data from the file
    let existingJSON = [];
    try {
        return new Promise((res, rej) => {
            let dir = path.dirname(FAILED_DB)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, error => error ? log.error(error) : log.info('You have created the nested_directory'));
            }

            if (newData == 'clear') {
                fs.writeFile(FAILED_DB, "", (err, data) => {
                    if (err) throw err;
                    res(data)
                    log.info('failedgmap: cleared');
                });
            } else {
                fs.readFile(FAILED_DB, 'utf-8', (err, existingData) => {
                    if (existingData && existingData.length > 0) {
                        existingJSON = JSON.parse(existingData);
                    }
                    existingJSON.push(newData);

                    fs.writeFile(FAILED_DB, JSON.stringify(existingJSON, null, 2), (err, data) => {
                        if (err) throw err;
                        res(data)
                        log.info('failedgmap: updated');
                    });
                });
            }
        })


    } catch (err) {
        // If the file does not exist or cannot be read, ignore the error and assume an empty file
    }

}

/**
 * Fix the bug where my_session folder is always read only, cause unable to rename file as required by telegram
 */
async function makeSessionFilesWritable(sessionName) {
    const files = await fs.promises.readdir(sessionName);
    for (const file of files) {
        const filePath = path.join(sessionName, file);
        const stats = await fs.promises.stat(filePath);
        const isReadOnly = !!(stats.mode & 0o200);
        if (isReadOnly) {
            await fs.promises.chmod(filePath, 0o666);
        }
    }
    log.success('Telegram : All session files processed to writable');
}


module.exports = { updateLastMsgId, getLastMsgId, getChat, updateChat, updateFail, makeSessionFilesWritable, readDb }