/*jshint esversion: 6 */
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

  const params = {
      FunctionName: 'arn:aws:lambda:us-east-1:686218048045:function:slack-notify',
      InvocationType: 'Event', //async InvocationType
      LogType: 'Tail'
  };


  // blow away the /tmp directory for before and after execution of this lambda function.
  // need to keep this Transient.
  execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

  var slackSub = "Forkline update";
  var slackMessage = "Started forkline:";
  slackMessage += "\nGit URL:" + event.GIT_HUB_REPO_URL;
  slackMessage += "\nLog Stream:" + logUrl(context.logGroupName, context.logStreamName, new Date());
  slackMessage += "\nLambda request ID:" + context.awsRequestId;

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

  // clone stage
  execSync(`
    mkdir -p ${exports.BUILD_DIR}
    cd ${exports.BUILD_DIR}/
    git clone ${process.env.GIT_HUB_REPO_URL}
  `, {stdio:[0,1,2]});

  // install dependencies stage
  execSync(`
    cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
    npm install
  `, {stdio:[0,1,2]});

  // check code quality stage
  execSync(`
    cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
    npm run quality
  `, {stdio:[0,1,2]});

  // run code coverage & test cases
  execSync(`
    cd ${exports.BUILD_DIR}/${process.env.PROJECT_NAME}/
    npm run cover
  `, {stdio:[0,1,2]});

  // create lambda deployment package
  execSync(`
    cd ${exports.BUILD_DIR}/
    node ${__dirname}/zipper.js --build_dir ${exports.BUILD_DIR} --project_name ${process.env.PROJECT_NAME}
  `, {stdio:[0,1,2]});

  execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});
};
