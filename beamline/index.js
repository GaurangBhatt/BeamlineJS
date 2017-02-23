/*jshint esversion: 6 */
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

  // create/update lambda function stage
  this.lambda.getFunctionInfo('arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang')
  .then(function (functionData) {
      console.log("updating function code and configuration");
      this.lambda.updateLambdaCode(
        functionData.functionName, "beamline-bucket",
        "RELEASE/FORK/" + process.env.PROJECT_NAME + "-"+ process.env.USER_ID + ".zip"
      )
      .then(function (data){
        slackMessage = "Stage: Lambda function code is updated";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
      })
      .catch(function (error){
        console.log("ERROR: " + error);
        slackMessage = "Stage: Update lambda function code has failed";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
        context.fail("Stage: Update lambda function code has failed");
      });

      this.lambda.updateLambdaConfiguration(
        functionData.functionName,
        "index.handler",
        "arn:aws:iam::686218048045:role/lambda_role",
        "Sample function",
        128,
        30
      )
      .then(function (data){
        slackMessage = "Stage: Lambda function configuration is updated";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
      })
      .catch(function (error){
        console.log("ERROR: " + error);
        slackMessage = "Stage: Update lambda function configuration has failed";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
        context.fail("Stage: Update lambda function configuration has failed");
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
          .then(function (data){
            slackMessage = "Stage: Lambda function code & configuration is deployed";
            this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
          })
          .catch(function (error){
            console.log("ERROR: "+ error);
            slackMessage = "Stage: Create lambda function code & configuration has failed";
            this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
            context.fail("Stage: Create lambda function code & configuration has failed");
          });
      }
  });

  // smoke testing deployed lambda function
  this.lambda.getFunctionInfo('arn:aws:lambda:us-east-1:686218048045:function:sample-lambda-gaurang')
  .then(function (functionData) {
      this.lambda.invokeByRequest(functionData.functionName, null, {})
      .then(function (data) {
        slackMessage = "Stage: Testing of lambda function completed";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
      })
      .catch(function (err) {
        console.log("ERROR: " + err);
        slackMessage = "Stage: Testing of lambda function has failed";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
        context.fail("Failed to invoke lambda function:" + err.message);
      });
  })
  .catch(function (err) {
    console.log("ERROR: " + err);
    slackMessage = "Stage: Testing of lambda function has failed because function";
    this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
    context.fail(err.message);
  });

  // publish the latest version
  let publishedVersion = null;

  // create/update alias


  // How do I maintain state in GitHub repo??

  // add more stages
  console.log("all stages completed.");
  execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});
};
