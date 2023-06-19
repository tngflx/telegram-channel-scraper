const fs = require('fs');
const path = require('path');
const { readDb } = require('./db');
const { Logger, LogLevel } = require('./logger');
const log = new Logger(LogLevel.DEBUG)


class gAuth {

    constructor() {
        const serviceAccountKeyPath = path.join(__dirname, 'gcpauth.json'); // Path to your service account key file
        let serviceAccObjs = JSON.parse(fs.readFileSync(serviceAccountKeyPath, 'utf8'));

        Object.assign(this, serviceAccObjs);
        this.accessToken = ''
    }

    fetchAccessToken() {

        const jwtToken = this.generateJwtToken();

        const tokenEndpoint = 'https://oauth2.googleapis.com/token';
        const tokenParams = new URLSearchParams();
        tokenParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        tokenParams.append('assertion', jwtToken);

        return fetch(tokenEndpoint, {
            method: 'POST',
            body: tokenParams,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })
            .then(response => response.json())
            .then(({ access_token }) => access_token)
            .catch(err => log.error(err))


    }

    generateJwtToken(serviceAccountKey) {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const expirationTime = nowInSeconds + 3600; // Token valid for 1 hour

        const jwtPayload =
        {
            iss: this.client_email,
            sub: this.client_email,
            scope: "https://www.googleapis.com/auth/cloud-billing",
            aud: this.token_uri,
            iat: nowInSeconds,
            exp: expirationTime,
        };

        const encodedHeader = base64Encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const encodedPayload = base64Encode(JSON.stringify(jwtPayload));

        const signatureInput = `${encodedHeader}.${encodedPayload}`;

        const signature = generateSignature(signatureInput, this.private_key);

        return `${signatureInput}.${signature}`;
    }

    async getBudget() {
        this.accessToken = await this.fetchAccessToken()

        const billingaccountID = '01F71E-AEA749-64B853';
        const budgetID = '586dfa9a-89c1-4247-9793-b17de057ab15'
        const url = `https://billingbudgets.googleapis.com/v1/billingAccounts/${billingaccountID}/budgets/${budgetID}`;

        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'x-goog-user-project': this.project_id,
                'Content-Type': 'application/json'
            }
        };

        return await fetch(url, options)
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(`Request failed with status code ${response.status}`);
                }
            })
            .then(data => {
                const budget = data.budgetAmount?.specifiedAmount?.amount || 0;
                const currentSpend = data.amount?.spentAmount?.amount || 0;
                const percentage = (currentSpend / budget) * 100;

                console.log('Budget:', data);
                console.log('Current Spend:', currentSpend);
                console.log('Budget Percentage:', percentage);
            })
            .catch(error => {
                console.error('Error:', error.message);
            });

    }
}
function base64Encode(data) {
    return Buffer.from(data).toString('base64');
}

function generateSignature(data, privateKey) {
    const { createSign } = require('crypto');
    const signer = createSign('RSA-SHA256');
    signer.update(data);
    return signer.sign(privateKey, 'base64');
}

module.exports = {
    gAuth
}