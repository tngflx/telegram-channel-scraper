/* eslint-disable no-undef */
const currentDomain = window.location.hostname;

const url = `ws://${currentDomain}:8080`;

const socket = new WebSocket(url);

socket.addEventListener('open', () => {
    console.log('Connected to WebSocket server.');
});

socket.addEventListener('message', (event) => {
    console.log('Received message from server:', event.data);
    const { qrDataURL, redirect } = JSON.parse(event.data) || {}
    if (redirect) {
        window.location.href = `http://${currentDomain}/${redirect}`
        return;
    }
    // Update the image source with the received data
    const qrImage = document.getElementById('qrcode');
    qrImage.src = qrDataURL;
});

socket.addEventListener('close', () => {
    console.log('Disconnected from WebSocket server.');
})

