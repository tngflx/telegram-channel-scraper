const ws = require('ws');
const { Logger, LogLevel } = require('./utils/logger');
const log = new Logger(LogLevel.DEBUG)

class WebSocket extends ws.Server {
    constructor() {
        super({ port: 8080 });

        this.connectedClient = null; // Store the connected client WebSocket instance

        this.on('connection', this.handleConnection);
    }

    handleConnection(ws) {
        log.success('WS : A new client connected.');

        // Store the connected client WebSocket instance
        this.connectedClient = ws;

        ws.on('message', (message) => {
            log.info('Received message from client:', message);

            // Send a response back to the client

            ws.send('Received: ' + message);

            // Send a message to the connected client
            this.sendMessageToClient('Hello from the server!');
        });

        ws.on('close', () => {
            log.info('WS : Client disconnected.');

            // Clear the connected client reference when the client disconnects
            this.connectedClient = null;
        });
    }

    sendMsg(message) {
        if (this.connectedClient) {
            if (typeof (message) == 'object')
                message = JSON.stringify(message)
            this.connectedClient.send(message);
        }
    }
}

exports.WebSocket = WebSocket
