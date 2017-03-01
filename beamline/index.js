/*jshint esversion: 6 */

// take care of multi-region deployment
// move everything to yaml configuration - validate yaml config file
// make it work on github.com & private github as well
// add ${LATEST} and CURR_STABLE version test result assertions
// zip file should contain all files/folders from the repo and not just index.js and node_modules
// add stage add security scan -- use  appsec or retire.js
// add stage add Artemis integration
// send artifacts to slack channel (won't work with webhook, need to use token)

// DONE -
// add stage for creating new branch and PR -- FORK
// add stage for creating new branch and PR -- DEV/QA
// add stage function code SHA verification
// add ${LATEST} and CURR_STABLE test stages

const path = require('path');
const execSync = require('child_process').execSync;
const git = require('lambda-git')({targetDirectory: "/tmp/pipeline/git"});
const LambdaSDK = require('./lambdaSDK.js');
const fs = require('fs');
const archiver = require('archiver');
const crypto = require('crypto');
const https = require('https');
const yaml = require('js-yaml');
const util = require('util');

exports.BASE_DIR = '/tmp/pipeline';
exports.HOME_DIR = path.join(exports.BASE_DIR, 'git');
exports.BUILD_DIR = path.join(exports.BASE_DIR, 'build');

var logUrl = function(logGroupName,logStreamName, startTime) {
  return `https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION}#logEvent:` +
    `group=${encodeURIComponent(logGroupName)};` +
    `stream=${encodeURIComponent(logStreamName)};` +
    `start=${encodeURIComponent(startTime.toISOString().slice(0, 19))}Z`
};

var testFunction = function(lambda, functionName, qualifier, slackARN, slackSub, payload, callback) {
  if (typeof(qualifier) === "undefined" || qualifier === null) qualifier = "$LATEST";
  // testing deployed lambda function
  lambda.getFunctionInfo(functionName)
  .then(function (functionData) {
      lambda.invokeByRequest(functionData.functionName, qualifier, payload)
      .then(function (data) {
        slackMessage = "Stage: Testing of lambda function completed:\n" + functionName + ":" + qualifier;
        lambda.invokeByRequest(slackARN, null,
          {
            "Subject": slackSub,
            "Message": slackMessage,
            "slackChannel": process.env.slackChannel,
            "slackUser": process.env.slackUser,
            "emoji": process.env.emoji,
            "webhookURI": process.env.webhookURI
          });
        callback(data);
      })
      .catch(function (err) {
        console.log("ERROR: " + err);
        slackMessage = "Stage: Testing of lambda function has failed:\n" + functionName + ":" + qualifier
        lambda.invokeByRequest(slackARN, null,
          {
            "Subject": slackSub,
            "Message": slackMessage,
            "slackChannel": process.env.slackChannel,
            "slackUser": process.env.slackUser,
            "emoji": process.env.emoji,
            "webhookURI": process.env.webhookURI
          });
        callback(err);
      });
  })
  .catch(function (err) {
    console.log("ERROR: " + err);
    slackMessage = "Stage: Testing of lambda function has failed because function does not exists:\n" + functionName + ":" + qualifier
    lambda.invokeByRequest(slackARN, null,
      {
        "Subject": slackSub,
        "Message": slackMessage,
        "slackChannel": process.env.slackChannel,
        "slackUser": process.env.slackUser,
        "emoji": process.env.emoji,
        "webhookURI": process.env.webhookURI
      });
    callback(err);
  });
};

var publishVersion = function(lambda, functionName, slackARN, slackSub, callback) {
  // publish the latest version
  lambda.publishVersion(functionName, function (version) {
    console.log("published version: " + version);
    slackMessage = "Stage: Publish new version of lambda function completed: " + functionName;
    lambda.invokeByRequest(slackARN, null,
      {
        "Subject": slackSub,
        "Message": slackMessage,
        "slackChannel": process.env.slackChannel,
        "slackUser": process.env.slackUser,
        "emoji": process.env.emoji,
        "webhookURI": process.env.webhookURI
      });
    callback(version);
  });
};

var manageAliases = function(lambda, functionName, version, slackARN, slackSub, callback) {
  lambda.getAliases(functionName)
  .then(function(aliasData) {
      console.log(aliasData);
      if (aliasData === undefined || (aliasData.CURR_STABLE === undefined && aliasData.LAST_STABLE === undefined)) {
        //create new CURR_STABLE alias
        lambda.createAlias(functionName, 'CURR_STABLE', version)
        .then(function(currStableAliasData){
          console.log(currStableAliasData);
          // create new LAST_STABLE alias
          lambda.createAlias(functionName, 'LAST_STABLE', version)
          .then(function(lastStableAliasData) {
            console.log(lastStableAliasData);
            slackMessage = "Stage: CURR_STABLE and LAST_STABLE aliases created with version:" + version;
            lambda.invokeByRequest(slackARN, null,
              {
                "Subject": slackSub,
                "Message": slackMessage,
                "slackChannel": process.env.slackChannel,
                "slackUser": process.env.slackUser,
                "emoji": process.env.emoji,
                "webhookURI": process.env.webhookURI
              });
            callback("aliases created");
          })
          .catch(function(lastStableAliasError) {
            console.log("ERROR: " + lastStableAliasError);
            slackMessage = "Stage: CURR_STABLE and LAST_STABLE aliases creation has failed for version:" + version;
            lambda.invokeByRequest(slackARN, null,
              {
                "Subject": slackSub,
                "Message": slackMessage,
                "slackChannel": process.env.slackChannel,
                "slackUser": process.env.slackUser,
                "emoji": process.env.emoji,
                "webhookURI": process.env.webhookURI
              });
            callback(lastStableAliasError);
          });
        })
        .catch(function(currStableAliasError){
          console.log("ERROR: " + currStableAliasError);
          slackMessage = "Stage: CURR_STABLE and LAST_STABLE aliases creation has failed for version:" + version;
          lambda.invokeByRequest(slackARN, null,
            {
              "Subject": slackSub,
              "Message": slackMessage,
              "slackChannel": process.env.slackChannel,
              "slackUser": process.env.slackUser,
              "emoji": process.env.emoji,
              "webhookURI": process.env.webhookURI
            });
          callback(currStableAliasError);
        });
      } else {
        //update CURR_STABLE alias version
        lambda.updateAlias(functionName, 'CURR_STABLE', version)
        .then(function(updateCurrStableAliasData) {
          console.log(updateCurrStableAliasData);
          // update LAST_STABLE alias version
          lambda.updateAlias(functionName, 'LAST_STABLE', aliasData.CURR_STABLE)
          .then(function(updateLastStableAliasData) {
            console.log(updateLastStableAliasData);
            slackMessage = "Stage: Update aliases completed. CURR_STABLE alias is: " + version + " and LAST_STABLE alias is: " + aliasData.CURR_STABLE;
            lambda.invokeByRequest(slackARN, null,
              {
                "Subject": slackSub,
                "Message": slackMessage,
                "slackChannel": process.env.slackChannel,
                "slackUser": process.env.slackUser,
                "emoji": process.env.emoji,
                "webhookURI": process.env.webhookURI
              });
            callback("alias versions updated");
          })
          .catch(function(updateLastStableAliasError) {
            console.log("ERROR: " + updateLastStableAliasError);
            slackMessage = "Stage: CURR_STABLE and LAST_STABLE aliases update has failed for version:" + version;
            lambda.invokeByRequest(slackARN, null,
              {
                "Subject": slackSub,
                "Message": slackMessage,
                "slackChannel": process.env.slackChannel,
                "slackUser": process.env.slackUser,
                "emoji": process.env.emoji,
                "webhookURI": process.env.webhookURI
              });
            callback(updateLastStableAliasError);
          });
        })
        .catch(function(updateCurrStableAliasError){
          console.log("ERROR: " + updateCurrStableAliasError);
          slackMessage = "Stage: CURR_STABLE and LAST_STABLE aliases update has failed for version:" + version;
          lambda.invokeByRequest(slackARN, null,
            {
              "Subject": slackSub,
              "Message": slackMessage,
              "slackChannel": process.env.slackChannel,
              "slackUser": process.env.slackUser,
              "emoji": process.env.emoji,
              "webhookURI": process.env.webhookURI
            });
          callback(updateCurrStableAliasError);
        });
      }
  })
  .catch(function(err) {
      console.log(err);
      slackMessage = "Stage: Manage alias has failed because function not found";
      lambda.invokeByRequest(slackARN, null,
        {
          "Subject": slackSub,
          "Message": slackMessage,
          "slackChannel": process.env.slackChannel,
          "slackUser": process.env.slackUser,
          "emoji": process.env.emoji,
          "webhookURI": process.env.webhookURI
        });
      callback(err);
  });
};

exports.handler = function (event, context) {
  //set this so that npm modules are cached in writeable directory. The default HOME directory /home/xxxxx is read-only
  // file system.
  process.env['HOME']='/tmp';
  https.get("https://raw.githubusercontent.com/mybhishi/sample-lambda/develop/config/beamline.yaml")
  .on('response', function (response) {
    var body = '';
    var i = 0;
    response.on('data', function (chunk) {
        i++;
        body += chunk;
    });
    response.on('end', function () {
        fs.writeFileSync("/tmp/beamline.yaml", body);
        var doc = yaml.safeLoad(fs.readFileSync('/tmp/beamline.yaml'));
        var configFile = fs.writeFileSync("/tmp/config.json", JSON.stringify(doc, null, 2));
        var config = require('/tmp/config.json');
        const defaultConfig = config[0].beamline[0].default;
        const forkConfig = config[0].beamline[1].fork;
        const devConfig = config[0].beamline[2].development;
        const stagingConfig = config[0].beamline[3].staging;
        const prodConfig = config[0].beamline[4].production;

        process.env['GIT_TOKEN'] = 'bef636ec82e08c9d1e8c22a23dd4cc75142e1591';
        process.env['GIT_HUB_REPO_URL'] = "https://" + process.env.GIT_TOKEN + "@github.com/" + event.GIT_HUB_REPO_URL + ".git";
        process.env['PROJECT_NAME'] = event.PROJECT_NAME;
        process.env['USER_ID'] = event.userId;
        process.env['REQUEST_ID'] = context.awsRequestId;
        process.env['PIPELINE'] = event.pipeline;
        process.env['ORG'] = event.organization;
        process.env['REPO_PULL_URL'] = "https://api.github.com/repos/GaurangBhatt/sample-lambda/pulls"

        const invokedFunctionARN = context.invokedFunctionArn;
        const arnItems = invokedFunctionARN.split(":");
        const region = arnItems[3];
        const accountID = arnItems[4];
        const slackARN = "arn:aws:lambda:" + region + ":" + accountID + ":function:slack-notify";
        var toBeDeployedFunctionARN = "arn:aws:lambda:" + region + ":" + accountID + ":function:" + event.PROJECT_NAME;
        console.log("Pipeline:" + event.pipeline);
        if (event.pipeline === 'fork') {
          toBeDeployedFunctionARN = toBeDeployedFunctionARN + "-" + event.userId;
          process.env['S3_KEY_LOC'] = "RELEASE/FORK/";
          process.env['ZIP_FILE_NAME'] = event.PROJECT_NAME + "-" + event.userId + ".zip";
          process.env['REPO_PR_BASE'] = "develop";
          process.env['REPO_CHECKOUT_BRANCH'] = "develop";
          process.env['slackChannel'] = forkConfig[1].slack.channel_name;
          process.env['slackUser'] = forkConfig[1].slack.slack_user;
          process.env['emoji'] = forkConfig[1].slack.icon_emoji;
          process.env['webhookURI'] = forkConfig[1].slack.webhook_uri;

        } else if (event.pipeline === 'development') {
          toBeDeployedFunctionARN = toBeDeployedFunctionARN + "-DEV"
          process.env['S3_KEY_LOC'] = "RELEASE/DEV/";
          process.env['ZIP_FILE_NAME'] = event.PROJECT_NAME + "-DEV.zip";
          process.env['REPO_PR_BASE'] = "master";
          process.env['REPO_CHECKOUT_BRANCH'] = "develop";
          process.env['slackChannel'] = devConfig[1].slack.channel_name;
          process.env['slackUser'] = devConfig[1].slack.slack_user;
          process.env['emoji'] = devConfig[1].slack.icon_emoji;
          process.env['webhookURI'] = devConfig[1].slack.webhook_uri;

        } else if (event.pipeline === 'staging') {
          toBeDeployedFunctionARN = toBeDeployedFunctionARN + "-STAGE"
          process.env['S3_KEY_LOC'] = "RELEASE/STAGE/";
          process.env['ZIP_FILE_NAME'] = event.PROJECT_NAME + "-STAGE.zip";
          process.env['REPO_CHECKOUT_BRANCH'] = "master";
          process.env['S3_PROD_KEY_LOC'] = "RELEASE/PROD/";
          process.env['PROD_ZIP_FILE_NAME'] = event.PROJECT_NAME + ".zip";
          process.env['slackChannel'] = devConfig[1].slack.channel_name;
          process.env['slackUser'] = devConfig[1].slack.slack_user;
          process.env['emoji'] = devConfig[1].slack.icon_emoji;
          process.env['webhookURI'] = devConfig[1].slack.webhook_uri;

        } else if (event.pipeline === 'production') {
          process.env['S3_KEY_LOC'] = "RELEASE/PROD/" + event.version + "/";
          process.env['ZIP_FILE_NAME'] = event.PROJECT_NAME + ".zip";
          process.env['slackChannel'] = prodConfig[1].slack.channel_name;
          process.env['slackUser'] = prodConfig[1].slack.slack_user;
          process.env['emoji'] = prodConfig[1].slack.icon_emoji;
          process.env['webhookURI'] = prodConfig[1].slack.webhook_uri;
        }
        const bucketName = "beamline-bucket-" + region;
        process.env['BUCKET_NAME'] = bucketName;
        const lambda = new LambdaSDK();
        console.log(process.env);

        // blow away the /tmp directory for before and after execution of this lambda function.
        // need to keep this Transient.
        execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

        var slackSub = event.pipeline + " Beamline update:" + event.PROJECT_NAME + " <"+ logUrl(context.logGroupName, context.logStreamName, new Date()) + "|" + context.awsRequestId + ">";
        var slackMessage = "Git URL: " + event.GIT_HUB_REPO_URL;
        slackMessage += "\nLambda Log Stream: <" + logUrl(context.logGroupName, context.logStreamName, new Date()) + "|Link to Stream>";
        lambda.invokeByRequest(slackARN, null,
          {
            "Subject": slackSub,
            "Message": slackMessage,
            "slackChannel": process.env.slackChannel,
            "slackUser": process.env.slackUser,
            "emoji": process.env.emoji,
            "webhookURI": process.env.webhookURI
          });

        if (event.pipeline !== 'production') {
          //setup environment stage
          execSync(`
            if ! [ -d ${exports.HOME_DIR} ]; then
              mkdir -p ${exports.HOME_DIR}
              cp -r ${__dirname}/. ${exports.HOME_DIR}
              tar -C ${exports.HOME_DIR} -xf ${__dirname}/node_modules/lambda-git/git-2.4.3.tar
            fi
          `, {stdio:[0,1,2]});
          var slackMessage = "Stage: Build environment setup completed";

          // clone stage
          execSync(`
            mkdir -p ${exports.BUILD_DIR}
            cd ${exports.BUILD_DIR}/
            git clone ${process.env.GIT_HUB_REPO_URL}
            cd ${process.env.PROJECT_NAME}/
            git checkout ${process.env.REPO_CHECKOUT_BRANCH}
          `, {stdio:[0,1,2]});
          slackMessage += "\nStage: Cloning of repository completed";

          // install dependencies stage
          execSync(`
            cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
            npm install
          `, {stdio:[0,1,2]});
          slackMessage += "\nStage: Install NPM modules completed";

          // check code quality stage
          execSync(`
            cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
            npm run quality
          `, {stdio:[0,1,2]});
          slackMessage += "\nStage: Run code quality checks completed";

          // run code coverage & test cases
          execSync(`
            cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
            npm run cover
            npm run check_coverage
          `, {stdio:[0,1,2]});
          slackMessage += "\nStage: Run unit tests and code coverage checks completed";

          var zipFile = exports.BUILD_DIR + "/" + process.env.PROJECT_NAME + ".zip";
          var output = fs.createWriteStream(zipFile);
          var archive = archiver('zip', {
              zlib: { level: 9 } // Sets the compression level.
          });

          /**
          * Need to learn how to clean up this below code....nested hell :-(
          * Below code will
          * a) create a lambda function if it does not exists OR
          * b) update function code and configuration if it already exists
          * c) perform smoke testing after delployment on ${LATEST} version
          * d) if test is successful then publish new version
          * e) Set CURR_STABLE & LAST_STABLE alias to new version if this is first version of the function
          *    else set CURR_STABLE to new version and LAST_STABLE to previous CURR_STABLE version.
          */
          // listen for all archive data to be written
          output.on('close', function() {
            console.log(archive.pointer() + ' total bytes');
            console.log('archiver has been finalized and the output file descriptor has closed.');
            var shasum = crypto.createHash('sha256');
            fs.createReadStream(zipFile)
            .on("data", function (chunk) {
                shasum.update(chunk);
            })
            .on("end", function () {
                var codeSHA256 = shasum.digest('base64');
                lambda = new LambdaSDK();
                execSync(`
                  cd ${exports.BUILD_DIR}/
                  node ${__dirname}/s3Uploader.js --bucket_name ${process.env.BUCKET_NAME} --abs_file_path ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}.zip --fileName ${process.env.S3_KEY_LOC}${process.env.ZIP_FILE_NAME}
                `, {stdio:[0,1,2]});
                slackMessage += "\nStage: Deployment package created and uploaded to S3 bucket ";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": slackSub,
                    "Message": slackMessage,
                    "slackChannel": process.env.slackChannel,
                    "slackUser": process.env.slackUser,
                    "emoji": process.env.emoji,
                    "webhookURI": process.env.webhookURI
                  });
                lambda.getFunctionInfo(toBeDeployedFunctionARN)
                .then(function (functionData) {
                    console.log("updating function code and configuration");
                    lambda.updateLambdaCode(
                      functionData.functionName,
                      bucketName,
                      process.env.S3_KEY_LOC + process.env.ZIP_FILE_NAME
                    )
                    .then(function() {
                      lambda.getFunctionInfo(toBeDeployedFunctionARN)
                      .then(function (functionData) {
                        console.log("lamb:" + functionData.sha256);
                        console.log("new:" + codeSHA256);
                        if (functionData.sha256 === codeSHA256) {
                          slackMessage = "Stage: Lambda function code is updated";
                          lambda.invokeByRequest(slackARN, null,
                            {
                              "Subject": slackSub,
                              "Message": slackMessage,
                              "slackChannel": process.env.slackChannel,
                              "slackUser": process.env.slackUser,
                              "emoji": process.env.emoji,
                              "webhookURI": process.env.webhookURI
                            });
                          // update function configuration
                          lambda.updateLambdaConfiguration(
                            functionData.functionName,
                            "index.handler",
                            "arn:aws:iam::686218048045:role/lambda_role",
                            "Sample function",
                            128,
                            30
                          )
                          .then(function (data) {
                            slackMessage = "Stage: Lambda function configuration is updated";
                            lambda.invokeByRequest(slackARN, null,
                              {
                                "Subject": slackSub,
                                "Message": slackMessage,
                                "slackChannel": process.env.slackChannel,
                                "slackUser": process.env.slackUser,
                                "emoji": process.env.emoji,
                                "webhookURI": process.env.webhookURI
                              });
                            // test deployed function & configuration
                            testFunction(lambda, toBeDeployedFunctionARN, null, slackARN, slackSub, {}, function(result) {
                              console.log(result);
                              if (result.StatusCode === 200) {
                                // publish new Version
                                publishVersion(lambda, toBeDeployedFunctionARN, slackARN, slackSub, function(version) {
                                  manageAliases(lambda, toBeDeployedFunctionARN, version, slackARN, slackSub, function(aliasData) {
                                    // test the function with CURR_STABLE alias
                                    testFunction(lambda, toBeDeployedFunctionARN, 'CURR_STABLE', slackARN, slackSub, {}, function(aliasResult) {
                                      if (aliasResult.StatusCode === 200) {
                                        if (event.pipeline === 'production') {
                                          console.log("all stages completed.");
                                          execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

                                        } else if (event.pipeline === 'staging') {
                                          execSync(`
                                            cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
                                            export version=\`node -p 'require(\"./package.json\").version'\`
                                            echo $version
                                            node ${__dirname}/s3Uploader.js --bucket_name ${process.env.BUCKET_NAME} --abs_file_path ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}.zip --fileName ${process.env.S3_PROD_KEY_LOC}$version/${process.env.PROD_ZIP_FILE_NAME}
                                          `, {stdio:[0,1,2]});
                                          slackMessage = "Stage: Lambda function code & configuration released for production deployment";
                                          lambda.invokeByRequest(slackARN, null,
                                            {
                                              "Subject": slackSub,
                                              "Message": slackMessage,
                                              "slackChannel": process.env.slackChannel,
                                              "slackUser": process.env.slackUser,
                                              "emoji": process.env.emoji,
                                              "webhookURI": process.env.webhookURI
                                            });

                                          slackMessage = "Stage: Change order created & released for production deployment";
                                          lambda.invokeByRequest(slackARN, null,
                                            {
                                              "Subject": slackSub,
                                              "Message": slackMessage,
                                              "slackChannel": process.env.slackChannel,
                                              "slackUser": process.env.slackUser,
                                              "emoji": process.env.emoji,
                                              "webhookURI": process.env.webhookURI
                                            });

                                          console.log("all stages completed.");
                                          execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

                                        } else {
                                          execSync(`
                                            cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
                                            git checkout -qf -b pr-${process.env.REQUEST_ID}
                                            git config user.name ${process.env.USER_ID}
                                            git config push.default matching
                                            git push origin pr-${process.env.REQUEST_ID}

                                            curl -v -b -X POST \
                                              -H "Content-Type: application/json" \
                                              -H "Authorization: token ${process.env.GIT_TOKEN}" \
                                              -d '{
                                                "title": "Pull submitted by beamlineJS for RequestID:'"${process.env.REQUEST_ID}"'",
                                                "body": "This Pull Request has passed all beamlineJS stages and is ready for Merge into '"${process.env.REPO_PR_BASE}"'",
                                                "head": "'"${process.env.ORG}"':pr-'"${process.env.REQUEST_ID}"'",
                                                "base": "${process.env.REPO_PR_BASE}"
                                              }' \
                                              "${process.env.REPO_PULL_URL}"
                                          `, {stdio:[0,1,2]});
                                          console.log("all stages completed.");
                                          execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});
                                        }

                                      } else {
                                        slackMessage = "Stage: Testing of lambda function has failed using CURR_STABLE version";
                                        lambda.invokeByRequest(slackARN, null,
                                          {
                                            "Subject": slackSub,
                                            "Message": slackMessage,
                                            "slackChannel": process.env.slackChannel,
                                            "slackUser": process.env.slackUser,
                                            "emoji": process.env.emoji,
                                            "webhookURI": process.env.webhookURI
                                          });
                                        context.fail("Stage: Testing of lambda function has failed");
                                      }
                                    });
                                  });
                                });
                              } else {
                                slackMessage = "Stage: Testing of lambda function has failed using ${LATEST} version";
                                lambda.invokeByRequest(slackARN, null,
                                  {
                                    "Subject": slackSub,
                                    "Message": slackMessage,
                                    "slackChannel": process.env.slackChannel,
                                    "slackUser": process.env.slackUser,
                                    "emoji": process.env.emoji,
                                    "webhookURI": process.env.webhookURI
                                  });
                                context.fail("Stage: Testing of lambda function has failed");
                              }
                            });
                          })
                          .catch(function (error) {
                            console.log("ERROR: " + error);
                            slackMessage = "Stage: Update lambda function configuration has failed";
                            lambda.invokeByRequest(slackARN, null,
                              {
                                "Subject": slackSub,
                                "Message": slackMessage,
                                "slackChannel": process.env.slackChannel,
                                "slackUser": process.env.slackUser,
                                "emoji": process.env.emoji,
                                "webhookURI": process.env.webhookURI
                              });
                            context.fail("Stage: Update lambda function configuration has failed");
                          });
                        } else {
                          slackMessage = "Stage: Lambda function code update has failed. SHA256 mismatch between stored code and uploaded code.";
                          lambda.invokeByRequest(slackARN, null,
                            {
                              "Subject": slackSub,
                              "Message": slackMessage,
                              "slackChannel": process.env.slackChannel,
                              "slackUser": process.env.slackUser,
                              "emoji": process.env.emoji,
                              "webhookURI": process.env.webhookURI
                            });
                          context.fail("Stage: Lambda function code update has failed. SHA256 mismatch between stored code and uploaded code.");
                        }
                      });
                    });
                })
                .catch(function (err) {
                  console.log("ERROR: ", err.message);
                  if (err.code === 'ResourceNotFoundException' && err.statusCode === 404) {
                      console.log("Creating lambda function");
                      lambda.createLambda(
                          toBeDeployedFunctionARN,
                          bucketName,
                          process.env.S3_KEY_LOC + process.env.ZIP_FILE_NAME,
                          "index.handler",
                          "arn:aws:iam::686218048045:role/lambda_role",
                          128,
                          30,
                          "Sample function"
                      )
                      .then(function(){
                        lambda.getFunctionInfo(toBeDeployedFunctionARN)
                        .then(function(functionData){
                          console.log("lamb:" + functionData.sha256);
                          console.log("new:" + codeSHA256);
                          if (functionData.sha256 === codeSHA256) {
                            slackMessage = "Stage: Lambda function code & configuration is deployed";
                            lambda.invokeByRequest(slackARN, null,
                              {
                                "Subject": slackSub,
                                "Message": slackMessage,
                                "slackChannel": process.env.slackChannel,
                                "slackUser": process.env.slackUser,
                                "emoji": process.env.emoji,
                                "webhookURI": process.env.webhookURI
                              });
                            testFunction(lambda, toBeDeployedFunctionARN, null, slackARN, slackSub, {}, function(result) {
                              if (result.StatusCode === 200) {
                                // publish new Version
                                publishVersion(lambda, toBeDeployedFunctionARN, slackARN, slackSub, function(version) {
                                  manageAliases(lambda, toBeDeployedFunctionARN, version, slackARN, slackSub, function(aliasData) {
                                    // test the function with CURR_STABLE alias
                                    testFunction(lambda, toBeDeployedFunctionARN, 'CURR_STABLE', slackARN, slackSub, {}, function(aliasResult) {
                                      if (aliasResult.StatusCode === 200) {
                                        if (event.pipeline === 'production') {
                                          console.log("all stages completed.");
                                          execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

                                        } else if (event.pipeline === 'staging') {
                                          execSync(`
                                            cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
                                            export version=\`node -p 'require(\"./package.json\").version'\`
                                            echo $version
                                            node ${__dirname}/s3Uploader.js --bucket_name ${process.env.BUCKET_NAME} --abs_file_path ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}.zip --fileName ${process.env.S3_PROD_KEY_LOC}$version/${process.env.PROD_ZIP_FILE_NAME}
                                          `, {stdio:[0,1,2]});
                                          slackMessage = "Stage: Lambda function code & configuration released for production deployment";
                                          lambda.invokeByRequest(slackARN, null,
                                            {
                                              "Subject": slackSub,
                                              "Message": slackMessage,
                                              "slackChannel": process.env.slackChannel,
                                              "slackUser": process.env.slackUser,
                                              "emoji": process.env.emoji,
                                              "webhookURI": process.env.webhookURI
                                            });

                                          slackMessage = "Stage: Change order created & released for production deployment";
                                          lambda.invokeByRequest(slackARN, null,
                                            {
                                              "Subject": slackSub,
                                              "Message": slackMessage,
                                              "slackChannel": process.env.slackChannel,
                                              "slackUser": process.env.slackUser,
                                              "emoji": process.env.emoji,
                                              "webhookURI": process.env.webhookURI
                                            });

                                          console.log("all stages completed.");
                                          execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

                                        } else {
                                          execSync(`
                                            cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
                                            git checkout -qf -b pr-${process.env.REQUEST_ID}
                                            git config user.name ${process.env.USER_ID}
                                            git config push.default matching
                                            git push origin pr-${process.env.REQUEST_ID}

                                            curl -v -b -X POST \
                                              -H "Content-Type: application/json" \
                                              -H "Authorization: token ${process.env.GIT_TOKEN}" \
                                              -d '{
                                                "title": "Pull submitted by beamlineJS for RequestID:'"${process.env.REQUEST_ID}"'",
                                                "body": "This Pull Request has passed all beamlineJS stages and is ready for Merge into '"${process.env.REPO_PR_BASE}"'",
                                                "head": "'"${process.env.ORG}"':pr-'"${process.env.REQUEST_ID}"'",
                                                "base": "${process.env.REPO_PR_BASE}"
                                              }' \
                                              "${process.env.REPO_PULL_URL}"
                                          `, {stdio:[0,1,2]});
                                          console.log("all stages completed.");
                                          execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});
                                        }

                                      } else {
                                        slackMessage = "Stage: Testing of lambda function has failed using CURR_STABLE version";
                                        lambda.invokeByRequest(slackARN, null,
                                          {
                                            "Subject": slackSub,
                                            "Message": slackMessage,
                                            "slackChannel": process.env.slackChannel,
                                            "slackUser": process.env.slackUser,
                                            "emoji": process.env.emoji,
                                            "webhookURI": process.env.webhookURI
                                          });
                                        context.fail("Stage: Testing of lambda function has failed");
                                      }
                                    });
                                  });
                                });
                              } else {
                                slackMessage = "Stage: Testing of lambda function has failed using ${LATEST} version";
                                lambda.invokeByRequest(slackARN, null,
                                  {
                                    "Subject": slackSub,
                                    "Message": slackMessage,
                                    "slackChannel": process.env.slackChannel,
                                    "slackUser": process.env.slackUser,
                                    "emoji": process.env.emoji,
                                    "webhookURI": process.env.webhookURI
                                  });
                                context.fail("Stage: Testing of lambda function has failed");
                              }
                            });
                          } else {
                            slackMessage = "Stage: Create lambda function code & configuration has failed";
                            lambda.invokeByRequest(slackARN, null,
                              {
                                "Subject": slackSub,
                                "Message": slackMessage,
                                "slackChannel": process.env.slackChannel,
                                "slackUser": process.env.slackUser,
                                "emoji": process.env.emoji,
                                "webhookURI": process.env.webhookURI
                              });
                            context.fail("Stage: Create lambda function code & configuration has failed");
                          }
                        });
                      });
                    }
                });
            });
          });

          // good practice to catch this error explicitly
          archive.on('error', function(err) {
            console.log(err);
          });

          // pipe archive data to the file
          archive.pipe(output);

          // append a index.js from stream
          var index_file = exports.BUILD_DIR + "/" + process.env.PROJECT_NAME + '/' + 'index.js';
          archive.append(fs.createReadStream(index_file), { name: 'index.js' });

          // append node_modules
          var module_dir = exports.BUILD_DIR + "/" + process.env.PROJECT_NAME + "/" + "node_modules";
          archive.directory(module_dir,'node_modules');

          // finalize the archive (ie we are done appending files but streams have to finish yet)
          archive.finalize();
        } else {
          lambda = new LambdaSDK();
          lambda.getFunctionInfo(toBeDeployedFunctionARN)
          .then(function (functionData) {
              console.log("updating function code and configuration");
              lambda.updateLambdaCode(
                functionData.functionName,
                bucketName,
                process.env.S3_KEY_LOC + process.env.ZIP_FILE_NAME
              )
              .then(function() {
                lambda.getFunctionInfo(toBeDeployedFunctionARN)
                .then(function (functionData) {
                  console.log("lamb:" + functionData.sha256);
                  console.log("new:" + event.codeSHA256);
                  if (functionData.sha256 === event.codeSHA256) {
                    slackMessage = "Production Stage: Lambda function code is updated";
                    lambda.invokeByRequest(slackARN, null,
                      {
                        "Subject": slackSub,
                        "Message": slackMessage,
                        "slackChannel": process.env.slackChannel,
                        "slackUser": process.env.slackUser,
                        "emoji": process.env.emoji,
                        "webhookURI": process.env.webhookURI
                      });
                    // update function configuration
                    lambda.updateLambdaConfiguration(
                      functionData.functionName,
                      "index.handler",
                      "arn:aws:iam::686218048045:role/lambda_role",
                      "Sample function",
                      128,
                      30
                    )
                    .then(function (data) {
                      slackMessage = "Production Stage: Lambda function configuration is updated";
                      lambda.invokeByRequest(slackARN, null,
                        {
                          "Subject": slackSub,
                          "Message": slackMessage,
                          "slackChannel": process.env.slackChannel,
                          "slackUser": process.env.slackUser,
                          "emoji": process.env.emoji,
                          "webhookURI": process.env.webhookURI
                        });
                      // test deployed function & configuration
                      testFunction(lambda, toBeDeployedFunctionARN, null, slackARN, slackSub, {}, function(result) {
                        console.log(result);
                        if (result.StatusCode === 200) {
                          // publish new Version
                          publishVersion(lambda, toBeDeployedFunctionARN, slackARN, slackSub, function(version) {
                            manageAliases(lambda, toBeDeployedFunctionARN, version, slackARN, slackSub, function(aliasData) {
                              // test the function with CURR_STABLE alias
                              testFunction(lambda, toBeDeployedFunctionARN, 'CURR_STABLE', slackARN, slackSub, {}, function(aliasResult) {
                                if (aliasResult.StatusCode === 200) {
                                    console.log("all production stages completed.");
                                    execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

                                } else {
                                  slackMessage = "Production Stage: Testing of lambda function has failed using CURR_STABLE version";
                                  lambda.invokeByRequest(slackARN, null,
                                    {
                                      "Subject": slackSub,
                                      "Message": slackMessage,
                                      "slackChannel": process.env.slackChannel,
                                      "slackUser": process.env.slackUser,
                                      "emoji": process.env.emoji,
                                      "webhookURI": process.env.webhookURI
                                    });
                                  context.fail("Production Stage: Testing of lambda function has failed");
                                }
                              });
                            });
                          });
                        } else {
                          slackMessage = "Production Stage: Testing of lambda function has failed using ${LATEST} version";
                          lambda.invokeByRequest(slackARN, null,
                            {
                              "Subject": slackSub,
                              "Message": slackMessage,
                              "slackChannel": process.env.slackChannel,
                              "slackUser": process.env.slackUser,
                              "emoji": process.env.emoji,
                              "webhookURI": process.env.webhookURI
                            });
                          context.fail("Production Stage: Testing of lambda function has failed");
                        }
                      });
                    })
                    .catch(function (error) {
                      console.log("ERROR: " + error);
                      slackMessage = "Production Stage: Update lambda function configuration has failed";
                      lambda.invokeByRequest(slackARN, null,
                        {
                          "Subject": slackSub,
                          "Message": slackMessage,
                          "slackChannel": process.env.slackChannel,
                          "slackUser": process.env.slackUser,
                          "emoji": process.env.emoji,
                          "webhookURI": process.env.webhookURI
                        });
                      context.fail("Production Stage: Update lambda function configuration has failed");
                    });
                  } else {
                    slackMessage = "Production Stage: Lambda function code update has failed. SHA256 mismatch between stored code and uploaded code.";
                    lambda.invokeByRequest(slackARN, null,
                      {
                        "Subject": slackSub,
                        "Message": slackMessage,
                        "slackChannel": process.env.slackChannel,
                        "slackUser": process.env.slackUser,
                        "emoji": process.env.emoji,
                        "webhookURI": process.env.webhookURI
                      });
                    context.fail("Production Stage: Lambda function code update has failed. SHA256 mismatch between stored code and uploaded code.");
                  }
                });
              });
          })
          .catch(function (err) {
            console.log("ERROR: ", err.message);
            if (err.code === 'ResourceNotFoundException' && err.statusCode === 404) {
                console.log("Creating lambda function");
                lambda.createLambda(
                    toBeDeployedFunctionARN,
                    bucketName,
                    process.env.S3_KEY_LOC + process.env.ZIP_FILE_NAME,
                    "index.handler",
                    "arn:aws:iam::686218048045:role/lambda_role",
                    128,
                    30,
                    "Sample function"
                )
                .then(function(){
                  lambda.getFunctionInfo(toBeDeployedFunctionARN)
                  .then(function(functionData){
                    console.log("lamb:" + functionData.sha256);
                    console.log("new:" + event.codeSHA256);
                    if (functionData.sha256 === event.codeSHA256) {
                      slackMessage = "Production Stage: Lambda function code & configuration is deployed";
                      lambda.invokeByRequest(slackARN, null,
                        {
                          "Subject": slackSub,
                          "Message": slackMessage,
                          "slackChannel": process.env.slackChannel,
                          "slackUser": process.env.slackUser,
                          "emoji": process.env.emoji,
                          "webhookURI": process.env.webhookURI
                        });
                      testFunction(lambda, toBeDeployedFunctionARN, null, slackARN, slackSub, {}, function(result) {
                        if (result.StatusCode === 200) {
                          // publish new Version
                          publishVersion(lambda, toBeDeployedFunctionARN, slackARN, slackSub, function(version) {
                            manageAliases(lambda, toBeDeployedFunctionARN, version, slackARN, slackSub, function(aliasData) {
                              // test the function with CURR_STABLE alias
                              testFunction(lambda, toBeDeployedFunctionARN, 'CURR_STABLE', slackARN, slackSub, {}, function(aliasResult) {
                                if (aliasResult.StatusCode === 200) {
                                    console.log("all production stages completed.");
                                    execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

                                } else {
                                  slackMessage = "Production Stage: Testing of lambda function has failed using CURR_STABLE version";
                                  lambda.invokeByRequest(slackARN, null,
                                    {
                                      "Subject": slackSub,
                                      "Message": slackMessage,
                                      "slackChannel": process.env.slackChannel,
                                      "slackUser": process.env.slackUser,
                                      "emoji": process.env.emoji,
                                      "webhookURI": process.env.webhookURI
                                    });
                                  context.fail("Production Stage: Testing of lambda function has failed");
                                }
                              });
                            });
                          });
                        } else {
                          slackMessage = "Production Stage: Testing of lambda function has failed using ${LATEST} version";
                          lambda.invokeByRequest(slackARN, null,
                            {
                              "Subject": slackSub,
                              "Message": slackMessage,
                              "slackChannel": process.env.slackChannel,
                              "slackUser": process.env.slackUser,
                              "emoji": process.env.emoji,
                              "webhookURI": process.env.webhookURI
                            });
                          context.fail("Production Stage: Testing of lambda function has failed");
                        }
                      });
                    } else {
                      slackMessage = "Production Stage: Create lambda function code & configuration has failed";
                      lambda.invokeByRequest(slackARN, null,
                        {
                          "Subject": slackSub,
                          "Message": slackMessage,
                          "slackChannel": process.env.slackChannel,
                          "slackUser": process.env.slackUser,
                          "emoji": process.env.emoji,
                          "webhookURI": process.env.webhookURI
                        });
                      context.fail("Production Stage: Create lambda function code & configuration has failed");
                    }
                  });
                });
              }
          });
        }
    });
    response.on('error', function(){
        context.fail("Error reading beamline configuration file!!");
    });
  });
};
