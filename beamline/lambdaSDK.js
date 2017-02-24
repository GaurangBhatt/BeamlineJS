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

LambdaSDK.prototype.createLambda = function(functionName, s3bucket, s3key, handler, role, memorySize, timeout, description) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    return new Promise(function(resolve, reject) {
        var params = {
          Code: {
            S3Bucket: s3bucket,
            S3Key: s3key
          },
          FunctionName: functionName,
          Handler: handler,
          Role: role,
          Runtime: 'nodejs4.3',
          Description: description,
          MemorySize: memorySize,
          Timeout: timeout
        };

        sdk.api.createFunction(params, function(err, data) {
            console.log("Lambda code create attempt finished.");
            if (err) {
                console.log("Error creating function. Params:", err);
                console.log("Input Parameters: ", params);
                console.log(err.stack);
                reject(err);
            } else {
                console.log("Function created: " + functionName);
                resolve(data);
            }
        });
    });
};

LambdaSDK.prototype.updateLambdaCode = function(functionName, s3bucket, s3key) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    return new Promise(function(resolve, reject) {
        var params = {
            FunctionName: functionName,
            S3Key: s3key,
            S3Bucket: s3bucket
        };

        sdk.api.updateFunctionCode(params, function(err, data) {
            console.log("Lambda code update attempt finished.");
            if (err) {
                console.log("Error updating code. Params:", err);
                console.log("Input Parameters: ", params);
                console.log(err.stack);
                reject(err);
            } else {
                console.log("Updated function: " + functionName);
                resolve(data);
            }
        });
    });
};

LambdaSDK.prototype.updateLambdaConfiguration = function(functionName, handler, role, description, memorySize, timeout) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    return new Promise(function(resolve, reject) {
        var params = {
            FunctionName: functionName,
            Handler: handler,
            Role: role,
            Description: description,
            MemorySize: memorySize,
            Timeout: timeout
        };

        sdk.api.updateFunctionConfiguration(params, function(err, data) {
            console.log("Lambda configuration update attempt finished.");
            if (err) {
                console.log("Error updating configuration. Params:", err);
                console.log("Input Parameters: ", params);
                console.log(err.stack);
                reject(err);
            } else {
                console.log("Updated function configuration: " + functionName);
                resolve(data);
            }
        });
    });
};

LambdaSDK.prototype.createAlias = function(functionName, aliasName, version) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    return new Promise(function(resolve, reject) {
        var params = {
            FunctionName: functionName,
            Name: aliasName,
            FunctionVersion: version
        };
        sdk.api.createAlias(params, function(err, data) {
            if (err !== null) reject(err);
            else
            {
                console.log("Create version alias: " + data.Name + " => " + data.FunctionVersion);
                resolve(data);
            }
        });
    });
};

LambdaSDK.prototype.updateAlias = function(functionName, aliasName, version) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    return new Promise(function(resolve, reject) {
        var params = {
            FunctionName: functionName,
            Name: aliasName,
            FunctionVersion: version
        };
        sdk.api.updateAlias(params, function(err, data) {
            if (err !== null) reject(err);
            else
            {
                console.log("Update version alias: " + data.Name + " => " + data.FunctionVersion);
                resolve(data);
            }
        });
    });
};

LambdaSDK.prototype.publishVersion = function(functionName, notify) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    return new Promise(function(resolve, reject) {
        sdk.api.publishVersion({ FunctionName: functionName }, function(err, data) {
            if (err !== null) reject(err);
            else {
                if (notify !== undefined && notify !== null) notify(data.Version);
                resolve(data);
            }
        });
    });
};

LambdaSDK.prototype.getAliases = function(functionName) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    console.log("Get aliases of:" + functionName);
    return new Promise(function(resolve, reject) {
        sdk.api.listAliases({ FunctionName: functionName }, function(err, aliasData) {
            if (err !== null) reject(err);
            var aliases = {};
            aliasData.Aliases.forEach(function(aliasData) { aliases[aliasData.Name] = aliasData.FunctionVersion; });
            resolve(aliases);
        });
    });
};

LambdaSDK.prototype.getFunctionInfo = function(functionName) {
    // Keep a local copy of this, because the Promise eats it.
    var sdk = this;
    return new Promise(function(resolve, reject) {
        sdk.api.getFunction({ FunctionName: functionName }, function(err, functionData) {
            if (err !== null) reject(err);
            else {
                var info = {
                    functionName: functionName,
                    arn: functionData.Configuration.FunctionArn,
                    sha256: functionData.Configuration.CodeSha256,
                    modified: functionData.Configuration.LastModified,
                    role: functionData.Configuration.Role,
                    runtime: functionData.Configuration.Runtime,
                    version: functionData.Configuration.Version,
                };
                sdk.getAliases(functionName).then(function(aliasData) {
                    info.aliases = aliasData;
                    resolve(info);
                })
                .catch(function(err) {
                    info.aliases = {};
                    resolve(info);
                });
            }
        });
    });
};

module.exports = LambdaSDK;
