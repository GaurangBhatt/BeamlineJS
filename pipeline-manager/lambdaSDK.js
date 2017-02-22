/*jshint esversion: 6 */

/**
* This code is taken from Jeff Sharpe's Lambda Crane
*/
var AWS = require('aws-sdk');

function LambdaSDK(optionsOverride) {
    const lambdaOptions = Object.assign({ apiVersion: '2015-03-31' }, optionsOverride);
    this.api = new AWS.Lambda(lambdaOptions);
}

LambdaSDK.prototype.invokeByRequest = function(functionName, qualifier, payload) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    if (typeof(qualifier) === "undefined" || qualifier === null) qualifier = "$LATEST";
    var clientContext = {
        scope: "test"
    };
    var params = {
        FunctionName: functionName,
        Qualifier: qualifier,
        InvocationType: "RequestResponse",
        LogType: "None",
        ClientContext: new Buffer(JSON.stringify(clientContext)).toString('base64'),
        Payload: JSON.stringify(payload)
    };
    return new Promise(function(resolve, reject) {
        sdk.api.invoke(params, function(err, data) {
            if (err !== null) reject(err);
            else resolve(data);
        });
    });
};

module.exports = LambdaSDK;
