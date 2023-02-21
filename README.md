# telegram-scraper-gramjs by @tngflx


Telegram Channel Scraper using **GramJS** [(GramJS)](https://gram.js.org/) library forked from this repo **[(Telegram MTProto ES6)](https://github.com/gram-js/gramjs)**

## About Telegram Channel Scraper

You can use it to grab messages from any channel (by default or user chats) and send it as JSON to any server. Some potential uses:

 - Monitor telegram news channels and send to google sheets for further processing. (Google Apps Script server on Google Sheets is very simple to set up)

 - Grab signals from Forex / Crypto telegram channels and send to server for automated trading



## Installation

Clone this repo. Then 
```bash 
$ cd telegram-channel-scraper
$ npm i
```

Create your own .env file 
 
The telegram_api_id and telegram_api_hash values can be obtained here: [https://my.telegram.org/](https://my.telegram.org/)


## Usage


Make sure your in a telegram channel or create your own one to test.

Then run the program
```bash 
$ node index.js
```

It is currently set up to poll the telegram server every 60 seconds. 
It will filter message according to your needs. For mine im using it to compare with distance required me to travel and the locum worth or not of doing it

## Contribute
Would love for someone to implement the updates feature so the app doesnt need to constantly poll the server for new messages. Feel free to send a pull request.

## License

Free for all to use