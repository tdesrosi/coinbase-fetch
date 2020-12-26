const express = require('express');
const bodyParser = require('body-parser');
const coinbase = require('coinbase');
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const ejs = require('ejs');
require('dotenv').config();

const port = 4000;
const app = express();
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: true }))

//testing coinbase call/spreadsheet update
//console.log(main.balance(process.env.API_KEY));

//testing official coinbase nodejs library
var client = new coinbase.Client({ 'apiKey': process.env.API_KEY, 'apiSecret': process.env.API_SECRET });
//for development purposes set SSL to false
client.strictSSL = false;

//function to authorize or check authorization 
async function writeValuesToSpreadsheet(accountBalance) {
    // If modifying these scopes, delete token.json.
    const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first
    // time.
    const TOKEN_PATH = 'token.json';

    // Load client secrets from a local file.
    fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
        // Authorize a client with credentials, then call the Google Sheets API.
        authorize(JSON.parse(content), listMajors);
    });

    /**
     * Create an OAuth2 client with the given credentials, and then execute the
     * given callback function.
     * @param {Object} credentials The authorization client credentials.
     * @param {function} callback The callback to call with the authorized client.
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
     * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
     * @param {getEventsCallback} callback The callback for the authorized client.
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
     * Prints the names and majors of students in a sample spreadsheet:
     * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
     * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
     */
    function listMajors(auth) {
        const sheets = google.sheets({ version: 'v4', auth });
        sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SHEET_ID,
            range: 'Balances!A13:I13',
            valueInputOption: 'USER_ENTERED',
            resource: {
                "values": [
                    [
                        "Coinbase",
                        "Coinbase",
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

//interval function to get account balance every hour
setInterval(() => {
    //get account balance
    client.getAccounts({}, (err, accounts) => {
        if (err) return console.log(err);
        accounts.forEach((acct) => {
            writeValuesToSpreadsheet(acct.balance.amount);
            console.log('my bal: ' + acct.balance.amount + ' for ' + acct.name);
        });
    });
},
    1000 * 60 * 60 //every 1 hours
);

//open to web server
app.listen(process.env.PORT || port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})