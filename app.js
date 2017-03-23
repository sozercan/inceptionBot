// This loads the environment variables from the .env file
require('dotenv-extended').load();

const builder = require('botbuilder');
const restify = require('restify');
const Promise = require('bluebird');
const request = require('request-promise').defaults({ encoding: null });
const tensorflowClient = require('tensorflow-serving-node-client')(process.env.TFSERVER);
const isUrl = require('is-url');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

// Listen for messages
server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector, function (session) {

    var msg = session.message;

    if (isUrl(msg.text) || msg.attachments.length) {

        // Message with attachment, proceed to download it.
        // Skype & MS Teams attachment URLs are secured by a JwtToken, so we need to pass the token from our bot.
        var attachment = msg.attachments[0];
        var fileDownload;

        if(msg.attachments.length)
        {
            fileDownload = checkRequiresToken(msg)
                ? requestWithToken(attachment.contentUrl)
                : request(attachment.contentUrl);
        }
        else {
            fileDownload = request(msg.text);
        }


        fileDownload.then(
            function (response) {
                tensorflowClient.predict(response, (err, res) => {
                    if (err) {
                        return console.error(err);
                    }

                    let result = res[0][0];

                    var reply = new builder.Message(session)
                        .text('![]('+msg.text+')\n\nI think this is a %s', result);
                    session.send(reply);
                });
            });

    } else {

        // No attachments were sent
        var reply = new builder.Message(session)
            .text('Hi there! Please upload a photo for classification.');
        session.send(reply);
    }

});

// Request file with Authentication Header
var requestWithToken = function (url) {
    return obtainToken().then(function (token) {
        return request({
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/octet-stream'
            }
        });
    });
};

// Promise for obtaining JWT Token (requested once)
var obtainToken = Promise.promisify(connector.getAccessToken.bind(connector));

var checkRequiresToken = function (message) {
    return message.source === 'skype' || message.source === 'msteams';
};