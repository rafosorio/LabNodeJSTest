"use strict";
// --------------------------------------------------------------------------
// Require statements
// --------------------------------------------------------------------------
var express = require("express");
var bodyParser = require("body-parser");
var request = require("request");
var requestjs = require("request-json");
var crypto = require("crypto");

var APP_ID = "23132d2b-6e53-4f55-8d06-d412def3a86c";
var APP_SECRET = "9wxu1fzmkg0z0j80lrw9akv13lq8lcxb";
var APP_WEBHOOK_SECRET = "n8zf3murosso3uvolu7hnmil8qqfmoxp";
var SPACE_ID = "5819247fe4b0f51d493732c3";

// --------------------------------------------------------------------------
// Setup global variables
// --------------------------------------------------------------------------

// Workspace API Setup - fixed stuff
const WWS_URL = "https://api.watsonwork.ibm.com";
const AUTHORIZATION_API = "/oauth/token";
const OAUTH_ENDPOINT = "/oauth/authorize";
const WEBHOOK_VERIFICATION_TOKEN_HEADER = "X-OUTBOUND-TOKEN".toLowerCase();

// --------------------------------------------------------------------------
// Setup the express server
// --------------------------------------------------------------------------
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + "/public"));

// create application/json parser
var jsonParser = bodyParser.json();

// --------------------------------------------------------------------------
// Express Server runtime
// --------------------------------------------------------------------------
// Start our server !
app.listen(process.env.PORT || 3000, function() {
    console.log("INFO: app is listening on port %s", (process.env.PORT || 3000));
});

// --------------------------------------------------------------------------
// Webhook entry point
app.post("/callback", jsonParser, function(req, res) {
    // Check if we have all the required variables
    if (!APP_ID || !APP_SECRET || !APP_WEBHOOK_SECRET) {
        console.log("ERROR: Missing variables APP_ID, APP_SECRET or WEBHOOK_SECRET from environment");
        return;
    }

    // Handle Watson Work Webhook verification challenge
    if (req.body.type === 'verification') {
        console.log('Got Webhook verification challenge ' + req.body);

        var bodyToSend = {
            response: req.body.challenge
        };

        var hashToSend = crypto.createHmac('sha256', APP_WEBHOOK_SECRET).update(JSON.stringify(bodyToSend)).digest('hex');

        res.set('X-OUTBOUND-TOKEN', hashToSend);
        res.send(bodyToSend);
        return;
    }

    // Ignore all our own messages
    if (req.body.userId === APP_ID) {
        console.log("Message from myself : abort");
        res.status(200).end();
        return;
    }

    // Ignore empty messages
    if (req.body.content === "") {
        console.log("Empty message : abort");
        res.status(200).end();
        return;
    }

    // Get the event type
    var eventType = req.body.type;

    // Get the spaceId
    var spaceId = req.body.spaceId;

    // Acknowledge we received and processed notification to avoid getting
    // sent the same event again
    res.status(200).end();

    // Act only on the events we need
    if (eventType === "message-annotation-added") {
        console.log("Annotation Message received.");
        return;
    }
    if (eventType === "message-created") {
        console.log("Message Created received.");

        //Check if the first 8 letters form the string '@echobot'.
        //This lets us "listen" for the '@echobot' keyword
        if (req.body.content.substring(0, 8) === "@echobot") {

            // slice off the '@echobot' part.
            var term = req.body.content.slice(9, req.body.content.length);
            console.log("Echobot received", term);

            // Post it back to the space
            // Let's try to authenticate
            getJWTToken(APP_ID, APP_SECRET, function(jwt) {
                console.log("JWT Token :", jwt);
                // And post it back
                postMessageToSpace(spaceId, jwt, term, function(success) {
                    return;
                })
            })

        }
        return;
    }

    // We don't do anything else, so return.
    console.log("INFO: Skipping unwanted eventType: " + eventType);
    return;
});

// --------------------------------------------------------------------------
// REST API test : listen for POST requests on /test-message, parse the incoming JSON
app.post("/test-message", jsonParser, function(req, res) {
    console.log(req.body);

    // Build your name from the incoming JSON
    var myMsg = req.body.fname + " " + req.body.lname;

    // Let's try to authenticate
    getJWTToken(APP_ID, APP_SECRET, function(jwt) {
        console.log("JWT Token :", jwt);
        postMessageToSpace(SPACE_ID, jwt, myMsg, function(success) {
            if (success) {
                res.status(200).end();
            } else {
                res.status(500).end();
            }
        })
    })

});

//--------------------------------------------------------------------------
//Get an authentication token
function getJWTToken(userid, password, callback) {
    // Build request options for authentication.
    const authenticationOptions = {
        "method": "POST",
        "url": `${WWS_URL}${AUTHORIZATION_API}`,
        "auth": {
            "user": userid,
            "pass": password
        },
        "form": {
            "grant_type": "client_credentials"
        }
    };

    // Get the JWT Token
    request(authenticationOptions, function(err, response, authenticationBody) {

        // If successful authentication, a 200 response code is returned
        if (response.statusCode !== 200) {
            // if our app can't authenticate then it must have been
            // disabled. Just return
            console.log("ERROR: App can't authenticate");
            callback(null);
        }
        const accessToken = JSON.parse(authenticationBody).access_token;
        callback(accessToken);
    });
}

//--------------------------------------------------------------------------
//Post a message to a space
function postMessageToSpace(spaceId, accessToken, textMsg, callback) {
    var jsonClient = requestjs.createClient(WWS_URL);
    var urlToPostMessage = "/v1/spaces/" + spaceId + "/messages";
    jsonClient.headers.jwt = accessToken;

    // Building the message
    var messageData = {
        type: "appMessage",
        version: 1.0,
        annotations: [
            {
                type: "generic",
                version: 1.0,
                color: "#00B6CB",
                title: "I was listening and you said ...",
                text: textMsg,
                actor: {
                    name: "Echobot",
                    avatar: "",
                    url: ""
                }
            }
        ]
    };

    // Calling IWW API to post message
    console.log("Message body : %s", JSON.stringify(messageData));

    jsonClient.post(urlToPostMessage, messageData, function(err, jsonRes, jsonBody) {
        if (jsonRes.statusCode === 201) {
            console.log("Message posted to IBM Watson Workspace successfully!");
            callback(true);
        } else {
            console.log("Error posting to IBM Watson Workspace !");
            console.log("Return code : " + jsonRes.statusCode);
            console.log(jsonBody);
            callback(false);
        }
    });

}
