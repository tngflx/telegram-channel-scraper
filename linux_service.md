[Unit]
Description=Telegram channel scraper
Documentation=https://myapp.example.com

[Service]
ExecStart=node index.js
Restart=always
User=ubuntu
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=/root/tele

[Install]
WantedBy=multi-user.target