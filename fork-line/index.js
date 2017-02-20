32/*jshint esversion: 6 */
const path = require('path');
const execSync = require('child_process').execSync;
const git = require('lambda-git')({targetDirectory: "/tmp/pipeline/git"});
const aws = require('aws-sdk');
const lambda = new aws.Lambda({region: 'us-east-1'});

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

  const params = {
      FunctionName: 'arn:aws:lambda:us-east-1:686218048045:function:slack-notify',
      InvocationType: 'Event', //async InvocationType
      LogType: 'Tail'
  };

  // blow away the /tmp directory for before and after execution of this lambda function.
  // need to keep this Transient.
  execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

  var slackSub = "Forkline update: "+ context.awsRequestId;
  var slackMessage = "Git URL: " + event.GIT_HUB_REPO_URL;
  slackMessage += "\nLambda Log Stream: <" + logUrl(context.logGroupName, context.logStreamName, new Date()) + "|Link to Stream>";
  params.Payload = JSON.stringify({"Subject": slackSub, "Message": slackMessage});
  lambda.invoke(params, (err, result) => {
    if (err) {
      context.fail({message:"Failed to notify slack channel"});
    }
  });

  //setup environment stage
  execSync(`
    if ! [ -d ${exports.HOME_DIR} ]; then
      mkdir -p ${exports.HOME_DIR}
      cp -r ${__dirname}/. ${exports.HOME_DIR}
      tar -C ${exports.HOME_DIR} -xf ${__dirname}/node_modules/lambda-git/git-2.4.3.tar
    fi
  `, {stdio:[0,1,2]});
  var slackMessage = "Stage: Environment setup stage completed";

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

  // create/update lambda function stage
  var get_function_param = {
    FunctionName: process.env.PROJECT_NAME + "-" + event.userId
  }
  var functionExists = false;
  lambda.getFunction(get_function_param, function(err, data) {
    if (err && err.statusCode === 404) {
      // create the function
      var create_function_param = {
        Code: {
          S3Bucket: "beamline-bucket",
          S3Key: "RELEASE/FORK/"+ process.env.PROJECT_NAME + "-" + process.env.USER_ID + ".zip"
        },
        FunctionName: process.env.PROJECT_NAME + "-" + event.userId,
        Handler: 'index.handler',
        Role: 'arn:aws:iam::686218048045:role/lambda_role',
        Runtime: 'nodejs4.3',
        Description: 'Sample function',
        MemorySize: 128,
        Publish: true,
        Timeout: 30
      };
      lambda.createFunction(create_function_param, function(cerr, cdata){
          if(cerr) {
            console.log(cerr, cerr.stack);
          } else {
            console.log(cdata);
          }
      });
    }
    else {
      // update the function code and configuration
      var update_function_code_params = {
          FunctionName: process.env.PROJECT_NAME + "-" + event.userId,
          Publish: true,
          S3Bucket: "beamline-bucket",
          S3Key: "RELEASE/FORK/"+ process.env.PROJECT_NAME + "-" + process.env.USER_ID + ".zip"
      };
      lambda.updateFunctionCode(update_function_code_params, function(uerr, udata) {
          if(uerr) {
            console.log(uerr, uerr.stack);
          } else {
            console.log(udata);
          }
      });

      var update_function_config_params = {
          FunctionName: process.env.PROJECT_NAME + "-" + event.userId,
          Handler: 'index.handler',
          Role: 'arn:aws:iam::686218048045:role/lambda_role',
          Runtime: 'nodejs4.3',
          Description: 'Sample function',
          MemorySize: 128,
          Timeout: 30
      };
      lambda.updateFunctionConfiguration(update_function_config_params, function(uerr, udata) {
          if(uerr) {
            console.log(uerr, uerr.stack);
          } else {
            console.log(udata);
          }
      });
    }
  });
  slackMessage += "\nStage: Lambda function code & configuration is deployed ";

  // add more stages
  console.log("all stages completed.");
  params.Payload = JSON.stringify({"Subject": slackSub, "Message": slackMessage});
  lambda.invoke(params, (err, result) => {
    if (err) {
      context.fail({message:"Failed to notify slack channel"});
    }
  });

  execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});
};
