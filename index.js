const { getChannelsID, chatHistory } = require('./chat-history')
const db = require('./utils/db');
const {checkLogin} = require('./utils/init');

const run = async (chat) => {
  await chatHistory(chat)
}

const start = async () => {
  await checkLogin();

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

start()