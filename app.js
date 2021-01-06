const express = require('express');
const bodyParser = require('body-parser');
const coinbase = require('coinbase');
const { CoinbasePro } = require('coinbase-pro-node');
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
require('dotenv').config();

const port = 4000;
const app = express();
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: true }))

//using official coinbase nodejs library
var client = new coinbase.Client({
    'apiKey': process.env.API_KEY,
    'apiSecret': process.env.API_SECRET
});
//for development purposes set SSL to false
client.strictSSL = false;

//using official coinbase pro nodejs library
var pro_client = new CoinbasePro({
    apiKey: process.env.PRO_API_KEY,
    apiSecret: process.env.PRO_API_SECRET,
    passphrase: process.env.PRO_PASSWORD
});


//function to authorize or check authorization 
async function writeValuesToSpreadsheet(accountBalance, accountType) {
    const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first
    // time.
    const TOKEN_PATH = 'token.json';

    // Load client secrets from a local file.
    fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
        // Authorize a client with credentials, then call the Google Sheets API.
        authorize(JSON.parse(content), writeBalances);
    });

    /**
     * Create an OAuth2 client with the given credentials, and then execute the
     * given callback function.
     */
    function authorize(credentials, callback) {
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);

        // Check if we have previously stored a token.
        fs.readFile(TOKEN_PATH, (err, token) => {
            if (err) return getNewToken(oAuth2Client, callback);
            oAuth2Client.setCredentials(JSON.parse(token));
            callback(oAuth2Client);
        });
    }

    /**
     * Get and store new token after prompting for user authorization, and then
     * execute the given callback with the authorized OAuth2 client.
     */
    function getNewToken(oAuth2Client, callback) {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) return console.error('Error while trying to retrieve access token', err);
                oAuth2Client.setCredentials(token);
                // Store the token to disk for later program executions
                fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                    if (err) return console.error(err);
                    console.log('Token stored to', TOKEN_PATH);
                });
                callback(oAuth2Client);
            });
        });
    }
    /**
     * Writes the balance to the spreadsheet
     */
    function writeBalances(auth) {
        var range = ""
        var account_name = "";
        if (accountType === "pro") {
            range = 'Balances!A14:I14'
            accountName = 'Coinbase Pro'
        } else {
            range = 'Balances!A13:I13'
            accountName = 'Coinbase Regular'
        }
        const sheets = google.sheets({ version: 'v4', auth });
        sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                "values": [
                    [
                        accountName,
                        accountName,
                        "crypto",
                        accountBalance,
                        accountBalance,
                        "",
                        "USD",
                        "A",
                        "investments"
                    ]
                ]
            }
        }, (err, res) => {
            if (err) return console.log('The API returned an error: ' + err);
            console.log(`cells updated: ${res.data.updatedCells}`);
        });
    }
}


async function getAccountBalances() {
    //get account balance
    client.getAccounts({}, (err, accounts) => {
        if (err) return console.log(err);
        var cumulative_balance = 0;
        accounts.forEach(acct => {
            cumulative_balance += (acct.native_balance.amount * 1);
        });
        console.log(new Date().toISOString()
            .replace(/T/, ' ')
            .replace(/\..+/, ''));
        console.log(cumulative_balance);
        console.log("\n");
        writeValuesToSpreadsheet(cumulative_balance, "regular");
    });

    // get account balance for pro accounts, where
    // I'll need to calculate the exchange to USD myself
    client.getExchangeRates({ 'currency': 'USD' }, function (err, rates) {
        //store a collection of current rates
        var rate_collection = rates.data.rates;
        //get all of my personal accounts
        pro_client.rest.account.listAccounts().then(accounts => {
            var cumulative_coin_balance = 0;
            accounts.forEach(acct => {
                var exchanged_value = rate_collection[acct.currency] * 1;
                cumulative_coin_balance += ((acct.balance) / exchanged_value) || 0;
            });
            console.log(new Date().toISOString()
                .replace(/T/, ' ')
                .replace(/\..+/, ''));
            console.log(cumulative_coin_balance);
            console.log("\n");
            writeValuesToSpreadsheet(cumulative_coin_balance, "pro");
        });
    });
    console.log("\n---------------------------------\n")
}

// the meat and potatoes happens here
// get account balances upon startup
getAccountBalances();
// interval function to get account balances every hour
setInterval(() => {
    getAccountBalances();
},
    1000 * 60 * 60 * 1 //every 1 hours
);

//open to web server
app.listen(process.env.PORT || port, () => {
    console.log(`Example app listening at http://localhost:${port}\n`)
})