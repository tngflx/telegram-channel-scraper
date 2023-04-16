const config = require('../config');
const fs = require("fs");
const path = require("path");
const { channelinfodb } = require('../config');
const CHANNELDB = channelinfodb;

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
            fs.mkdirSync(dir, error => error ? console.log(error) : console.log('You have created the nested_directory'));
        }

        fs.writeFile(file, JSON.stringify(json, null, 2), "utf8", (err) => {
            err ? rej(err) : res();
        });
    })
}

async function updateLastMsgId(original_data) {
    try {
        return await writeFile(original_data, CHANNELDB)
    } catch (err) {
        console.log("error, couldnt save to file " + err)
    }
}

async function getLastMsgId(index) {
    try {
        const readFile = await readDb(CHANNELDB);
        const file = JSON.parse(readFile)
        return file[index]['lastMsgId']
        console.log(res)
    } catch (err) {
        console.log("file not found so making a empty one and adding default value ")
        await updateLastMsgId(1);
        return 1;
    }
}

async function getChat() {
    try {
        const readFile = await readDb(CHANNELDB);
        const file = JSON.parse(readFile)
        return file;
    } catch (err) {
        console.log(err);
        return false;
    }
}

async function updateChat(obj) {
    try {
        const work = await writeFile(obj, CHANNELDB)
    } catch (err) {
        console.log("error, couldnt save chat to file " + err)
    }
}

module.exports = { updateLastMsgId, getLastMsgId, getChat, updateChat }