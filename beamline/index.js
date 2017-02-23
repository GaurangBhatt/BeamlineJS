/*jshint esversion: 6 */

// add stage add security scan
// add stage add Artemis integration
// add stage run integration/QA tests after version relase and manage alias
// send artifacts to slack channel (won't work with webhook, need to use token)
// move everything to yaml configuration - validate yaml config file
// add stage function code & configuraiton SHA verification
// add stage for creating new branch and PR
// take care of multi-region deployment

const path = require('path');
const execSync = require('child_process').execSync;
const git = require('lambda-git')({targetDirectory: "/tmp/pipeline/git"});
const LambdaSDK = require('./lambdaSDK.js');

exports.BASE_DIR = '/tmp/pipeline';
exports.HOME_DIR = path.join(exports.BASE_DIR, 'git');
exports.BUILD_DIR = path.join(exports.BASE_DIR, 'build');

var logUrl = function(logGroupName,logStreamName, startTime) {
  return `https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION}#logEvent:` +
    `group=${encodeURIComponent(logGroupName)};` +
    `stream=${encodeURIComponent(logStreamName)};` +
    `start=${encodeURIComponent(startTime.toISOString().slice(0, 19))}Z`
};

var testFunction = function(lambda, functionName, slackARN, slackSub, payload, callback) {
  // smoke testing deployed lambda function
  this.lambda.getFunctionInfo(functionName)
  .then(function (functionData) {
      this.lambda.invokeByRequest(functionData.functionName, null, payload)
      .then(function (data) {
        slackMessage = "Stage: Testing of lambda function completed";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
        callback(data);
      })
      .catch(function (err) {
        console.log("ERROR: " + err);
        slackMessage = "Stage: Testing of lambda function has failed";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
        callback(err);
      });
  })
  .catch(function (err) {
    console.log("ERROR: " + err);
    slackMessage = "Stage: Testing of lambda function has failed because function does not exists";
    this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
    callback(err);
  });
};

var publishVersion = function(lambda, functionName, slackARN, slackSub, callback) {
  // publish the latest version
  this.lambda.publishVersion(functionName, function (version) {
    console.log("published version: " + version);
    slackMessage = "Stage: Publish new version of lambda function completed";
    this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
    callback(version);
  });
};

var manageAliases = function(lambda, functionName, version, slackARN, slackSub, callback) {
  this.lambda.getAliases(functionName)
  .then(function(aliasData) {
      console.log(aliasData);
      if (aliasData === undefined || (aliasData.CURR_STABLE === undefined && aliasData.LAST_STABLE === undefined)) {
        //create new CURR_STABLE alias
        this.lambda.createAlias(functionName, 'CURR_STABLE', version)
        .then(function(currStableAliasData){
          console.log(currStableAliasData);
          // create new LAST_STABLE alias
          this.lambda.createAlias(functionName, 'LAST_STABLE', version)
          .then(function(lastStableAliasData) {
            console.log(lastStableAliasData);
            slackMessage = "Stage: CURR_STABLE and LAST_STABLE aliases created with version:" + version;
            this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
            callback("aliases created");
          })
          .catch(function(lastStableAliasError) {
            console.log("ERROR: " + lastStableAliasError)
            callback(lastStableAliasError);
          });
        })
        .catch(function(currStableAliasError){
          console.log("ERROR: " + currStableAliasError)
          callback(currStableAliasError);
        });
      } else {
        //update CURR_STABLE alias version
        this.lambda.updateAlias(functionName, 'CURR_STABLE', version)
        .then(function(updateCurrStableAliasData) {
          console.log(updateCurrStableAliasData);
          // update LAST_STABLE alias version
          this.lambda.updateAlias(functionName, 'LAST_STABLE', aliasData.CURR_STABLE)
          .then(function(updateLastStableAliasData) {
            console.log(updateLastStableAliasData);
            slackMessage = "Stage: Update aliases completed. CURR_STABLE alias is: " + version + " and LAST_STABLE alias is: " + aliasData.CURR_STABLE;
            this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
            callback("alias versions updated");
          })
          .catch(function(updateLastStableAliasError) {
            console.log("ERROR: " + updateLastStableAliasError)
            callback(updateLastStableAliasError);
          });
        })
        .catch(function(updateCurrStableAliasError){
          console.log("ERROR: " + updateCurrStableAliasError);
          callback(updateCurrStableAliasError);
        });
      }
  })
  .catch(function(err) {
      console.log(err);
  });
};

exports.handler = function (event, context) {
  //set this so that npm modules are cached in writeable directory. The default HOME directory /home/xxxxx is read-only
  // file system.
  process.env['HOME']='/tmp';
  process.env['GIT_HUB_REPO_URL'] = event.GIT_HUB_REPO_URL;
  process.env['PROJECT_NAME'] = event.PROJECT_NAME;
  process.env['USER_ID'] = event.userId;
  const slackARN = 'arn:aws:lambda:us-east-1:686218048045:function:slack-notify';
  this.lambda = new LambdaSDK();

  // blow away the /tmp directory for before and after execution of this lambda function.
  // need to keep this Transient.
  execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

  var slackSub = "Beamline update: <"+ logUrl(context.logGroupName, context.logStreamName, new Date()) + "|" + context.awsRequestId + ">";
  var slackMessage = "Git URL: " + event.GIT_HUB_REPO_URL;
  slackMessage += "\nLambda Log Stream: <" + logUrl(context.logGroupName, context.logStreamName, new Date()) + "|Link to Stream>";
  this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});

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

  // create lambda deployment package
  execSync(`
    cd ${exports.BUILD_DIR}/
    node ${__dirname}/zipper.js --build_dir ${exports.BUILD_DIR} --project_name ${process.env.PROJECT_NAME}
    node ${__dirname}/s3Uploader.js --bucket_name beamline-bucket --abs_file_path ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}.zip --fileName RELEASE/FORK/${process.env.PROJECT_NAME}-${process.env.USER_ID}.zip
  `, {stdio:[0,1,2]});
  slackMessage += "\nStage: Deployment package created and uploaded to S3 bucket ";
  this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});

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
  this.lambda.getFunctionInfo('arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang')
  .then(function (functionData) {
      console.log("updating function code and configuration");
      this.lambda.updateLambdaCode(
        functionData.functionName, "beamline-bucket",
        "RELEASE/FORK/" + process.env.PROJECT_NAME + "-"+ process.env.USER_ID + ".zip"
      )
      .then(function (data) {
        slackMessage = "Stage: Lambda function code is updated";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
        // update function configuration
        this.lambda.updateLambdaConfiguration(
          functionData.functionName,
          "index.handler",
          "arn:aws:iam::686218048045:role/lambda_role",
          "Sample function",
          128,
          30
        )
        .then(function (data) {
          slackMessage = "Stage: Lambda function configuration is updated";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
          // test deployed function & configuration
          testFunction(this.lambda, 'arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang', slackARN, slackSub, {}, function(result) {
            console.log(result);
            if (result.StatusCode === 200) {
              // publish new Version
              publishVersion(this.lambda, 'arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang', slackARN, slackSub, function(version) {
                manageAliases(this.lambda, 'arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang', version, slackARN, slackSub, function(aliasData) {
                  console.log(aliasData);
                });
              });
            } else {
              context.fail("Stage: Testing of lambda function has failed")
            }
          });
        })
        .catch(function (error) {
          console.log("ERROR: " + error);
          slackMessage = "Stage: Update lambda function configuration has failed";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
          context.fail("Stage: Update lambda function configuration has failed");
        });
      })
      .catch(function (error) {
        console.log("ERROR: " + error);
        slackMessage = "Stage: Update lambda function code has failed";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
        context.fail("Stage: Update lambda function code has failed");
      });
  })
  .catch(function (err) {
      console.log("ERROR: ", err.message);
      if (err.code === 'ResourceNotFoundException' && err.statusCode === 404) {
          console.log("Creating lambda function");
          this.lambda.createLambda(
              process.env.PROJECT_NAME + "-" + event.userId,
              "beamline-bucket",
              "RELEASE/FORK/" + process.env.PROJECT_NAME + "-"+ process.env.USER_ID + ".zip",
              "index.handler",
              "arn:aws:iam::686218048045:role/lambda_role",
              128,
              30,
              "Sample function"
          )
          .then(function (data) {
            slackMessage = "Stage: Lambda function code & configuration is deployed";
            this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
            testFunction(this.lambda, 'arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang', slackARN, slackSub, {}, function(result) {
              if (result.StatusCode === 200) {
                // publish new Version
                publishVersion(this.lambda, 'arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang', slackARN, slackSub, function(version) {
                  manageAliases(this.lambda, 'arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang', version, slackARN, slackSub, function(aliasData) {
                    console.log(aliasData);
                  });
                });
              } else {
                context.fail("Stage: Testing of lambda function has failed")
              }
            });
          })
          .catch(function (error) {
            console.log("ERROR: "+ error);
            slackMessage = "Stage: Create lambda function code & configuration has failed";
            this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
            context.fail("Stage: Create lambda function code & configuration has failed");
          });
      }
  });

  // add more stages
  console.log("all stages completed.");
  execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});
};
