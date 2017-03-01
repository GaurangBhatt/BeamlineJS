/*jshint esversion: 6 */
const LambdaSDK = require('./lambdaSDK.js');
const https = require('https');
const fs = require('fs');
const yaml = require('js-yaml');
const util = require('util');
const execSync = require('child_process').execSync;

exports.handler = function(event, context) {
    const invokedFunctionARN = context.invokedFunctionArn;
    const arnItems = invokedFunctionARN.split(":");
    const region = arnItems[3];
    const accountID = arnItems[4];
    const slackARN = "arn:aws:lambda:" + region + ":" + accountID + ":function:slack-notify";
    const beamLineARN = "arn:aws:lambda:" + region + ":" + accountID + ":function:beamlineJS";
    const lambda = new LambdaSDK();

    // blow away the /tmp directory.
    execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +', {stdio:[0,1,2]});

    if (event.pipeline !== undefined && event.pipeline === 'production') {
      lambda.invokeByRequest(beamLineARN, null, {
          "GIT_HUB_REPO_URL": event.repo_full_name,
          "PROJECT_NAME": event.repo_name,
          "userId": event.senderId,
          "organization": event.repo_org,
          "pipeline": event.pipeline,
          "version": event.version,
          "codeSHA256" : event.codeSHA256
      });
    } else {
      const snsEvent = event.Records[0].Sns;
      const eventType = ((snsEvent.MessageAttributes || {})['X-Github-Event'] || {}).Value;
      const snsMessage = JSON.parse(snsEvent.Message);
      https.get("https://raw.githubusercontent.com/mybhishi/sample-lambda/develop/config/beamline.yaml").on('response', function (response) {
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
            var mess = '';
            var sub = '';
            console.log("EVENT TYPE:" + eventType);
            if (eventType === 'push') {
              const repo_full_name = snsMessage.repository.full_name;
              if (snsMessage.repository.fork === true && snsMessage.base_ref === 'refs/heads/develop' && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.created === true) {
                  lambda.invokeByRequest(slackARN, null,
                    {
                      "Subject": "[" + repo_full_name + "]: ",
                      "Message": "New PR branch " + snsMessage.ref + " created by: " + snsMessage.sender.login,
                      "slackChannel": forkConfig[1].slack.channel_name,
                      "slackUser": forkConfig[1].slack.slack_user,
                      "emoji": forkConfig[1].slack.icon_emoji,
                      "webhookURI": forkConfig[1].slack.webhook_uri
                    });
              } else if (snsMessage.repository.fork === true && snsMessage.base_ref === null && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.deleted === true) {
                  lambda.invokeByRequest(slackARN, null,
                    {
                      "Subject": "[" + repo_full_name + "]: ",
                      "Message": "PR branch " + snsMessage.ref + " deleted by: " + snsMessage.sender.login,
                      "slackChannel": forkConfig[1].slack.channel_name,
                      "slackUser": forkConfig[1].slack.slack_user,
                      "emoji": forkConfig[1].slack.icon_emoji,
                      "webhookURI": forkConfig[1].slack.webhook_uri
                    });
              } else if (snsMessage.repository.fork === false && snsMessage.base_ref === 'refs/heads/develop' && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.created === true) {
                  lambda.invokeByRequest(slackARN, null,
                    {
                      "Subject": "[" + repo_full_name + "]: ",
                      "Message": "New PR branch " + snsMessage.ref + " created by: " + snsMessage.sender.login,
                      "slackChannel": defaultConfig[0].slack.channel_name,
                      "slackUser": defaultConfig[0].slack.slack_user,
                      "emoji": defaultConfig[0].slack.icon_emoji,
                      "webhookURI": defaultConfig[0].slack.webhook_uri
                    });
              } else if (snsMessage.repository.fork === false && snsMessage.base_ref === null && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.deleted === true) {
                  lambda.invokeByRequest(slackARN, null,
                    {
                      "Subject": "[" + repo_full_name + "]: ",
                      "Message": "PR branch " + snsMessage.ref + " deleted by: " + snsMessage.sender.login,
                      "slackChannel": defaultConfig[0].slack.channel_name,
                      "slackUser": defaultConfig[0].slack.slack_user,
                      "emoji": defaultConfig[0].slack.icon_emoji,
                      "webhookURI": defaultConfig[0].slack.webhook_uri
                    });
              } else {
                const username = snsMessage.commits[0].author.username;
                const totalCommits = snsMessage.commits.length;
                var slackSub = "[" + repo_full_name + "]: " +  totalCommits + " commit(s) by " + username + " ";
                if(totalCommits > 1) {
                  var others = totalCommits - 1;
                  slackSub += "and " + others + " others";
                }
                var slackMessage = "Commits:";
                for(var i = 0; i < totalCommits; i++) {
                  slackMessage += snsMessage.commits[i].message + "\n";
                  if (snsMessage.commits[i].added.length > 0) {
                    slackMessage += " added:" + snsMessage.commits[i].added + "\n";
                  }
                  if (snsMessage.commits[i].removed.length > 0) {
                    slackMessage += " removed:" + snsMessage.commits[i].removed + "\n";
                  }
                  if (snsMessage.commits[i].modified.length > 0) {
                    slackMessage += " modified:" + snsMessage.commits[i].modified + "\n";
                  }
                }
                if (snsMessage.repository.fork === true && snsMessage.ref === 'refs/heads/develop' && snsMessage.created === false && snsMessage.deleted === false) {
                  lambda.invokeByRequest(slackARN, null,
                    {
                      "Subject": slackSub,
                      "Message": slackMessage,
                      "slackChannel": forkConfig[1].slack.channel_name,
                      "slackUser": forkConfig[1].slack.slack_user,
                      "emoji": forkConfig[1].slack.icon_emoji,
                      "webhookURI": forkConfig[1].slack.webhook_uri
                    });
                  var repo_name = snsMessage.repository.name;
                  var sender = snsMessage.sender.login;
                  var organization = snsMessage.organization.login;
                  lambda.invokeByRequest(beamLineARN, null, {
                      "GIT_HUB_REPO_URL": repo_full_name,
                      "PROJECT_NAME": repo_name,
                      "userId": sender,
                      "organization": organization,
                      "pipeline": "fork"
                  });
                } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/develop') {
                    lambda.invokeByRequest(slackARN, null,
                      {
                        "Subject": slackSub,
                        "Message": slackMessage,
                        "slackChannel": defaultConfig[0].slack.channel_name,
                        "slackUser": defaultConfig[0].slack.slack_user,
                        "emoji": defaultConfig[0].slack.icon_emoji,
                        "webhookURI": defaultConfig[0].slack.webhook_uri
                      });
                } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/master') {
                    lambda.invokeByRequest(slackARN, null,
                      {
                        "Subject": slackSub,
                        "Message": slackMessage,
                        "slackChannel": defaultConfig[0].slack.channel_name,
                        "slackUser": defaultConfig[0].slack.slack_user,
                        "emoji": defaultConfig[0].slack.icon_emoji,
                        "webhookURI": defaultConfig[0].slack.webhook_uri
                      });
                } else {
                  sub = "Pipeline Error";
                  mess = "Pipeline request was received but with errors. Pipeline only accepts changes from a Fork with develop branch, develop branch and master branch";
                  lambda.invokeByRequest(slackARN, null,
                    {
                      "Subject": sub,
                      "Message": mess,
                      "slackChannel": defaultConfig[0].slack.channel_name,
                      "slackUser": defaultConfig[0].slack.slack_user,
                      "emoji": defaultConfig[0].slack.icon_emoji,
                      "webhookURI": defaultConfig[0].slack.webhook_uri
                    });
                }
              }
            } else if (eventType === 'pull_request') {
              var pull_request = snsMessage.pull_request;
              var pr_repo_full_name = snsMessage.repository.full_name;
              var pr_url = pull_request.html_url;
              var pr_username = pull_request.user.login;
              var pr_slackSubject = "[" + pr_repo_full_name + "]:";

              if (pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
                pr_slackSubject += " New PR opened by " + pr_username + " URL <" + pr_url + "|Link to pull request>";
              } if (pull_request.merged === false && snsMessage.action === 'closed') {
                pr_slackSubject += " PR URL <" + pr_url + "|Link to pull request>" + " is closed by " + pr_username;
              } else if (pull_request.merged === true && snsMessage.action === 'closed'){
                var mergedBy = pull_request.merged_by.login;
                pr_slackSubject += " PR URL <" + pr_url + "|Link to pull request>" + " is merged by " + mergedBy;
              }

              if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'develop' && pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
                mess = "A new pull request was created for merge into develop branch. Please review and merge!!!";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": pr_slackSubject,
                    "Message": mess,
                    "slackChannel": devConfig[1].slack.channel_name,
                    "slackUser": devConfig[1].slack.slack_user,
                    "emoji": devConfig[1].slack.icon_emoji,
                    "webhookURI": devConfig[1].slack.webhook_uri
                  });

              } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'develop' && pull_request.merged === false && snsMessage.action === 'closed') {
                mess = "Pull request was closed on develop branch.";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": pr_slackSubject,
                    "Message": mess,
                    "slackChannel": devConfig[1].slack.channel_name,
                    "slackUser": devConfig[1].slack.slack_user,
                    "emoji": devConfig[1].slack.icon_emoji,
                    "webhookURI": devConfig[1].slack.webhook_uri
                  });

              } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'develop' && pull_request.merged === true) {
                mess = "Pull request was merged into develop branch. Starting development pipeline";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": pr_slackSubject,
                    "Message": mess,
                    "slackChannel": devConfig[1].slack.channel_name,
                    "slackUser": devConfig[1].slack.slack_user,
                    "emoji": devConfig[1].slack.icon_emoji,
                    "webhookURI": devConfig[1].slack.webhook_uri
                  });
                var main_repo_name = snsMessage.repository.name;
                var sender_login = snsMessage.sender.login;
                console.log(pr_repo_full_name.substring(0, pr_repo_full_name.indexOf("/")));
                lambda.invokeByRequest(beamLineARN, null, {
                    "GIT_HUB_REPO_URL": pr_repo_full_name,
                    "PROJECT_NAME": main_repo_name,
                    "userId": sender_login,
                    "organization": "GaurangBhatt",
                    "pipeline": "development"
                });

              } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'master' && pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
                mess = "A new pull request was created for merge into master branch. Please review and merge!!!";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": pr_slackSubject,
                    "Message": mess,
                    "slackChannel": stagingConfig[1].slack.channel_name,
                    "slackUser": stagingConfig[1].slack.slack_user,
                    "emoji": stagingConfig[1].slack.icon_emoji,
                    "webhookURI": stagingConfig[1].slack.webhook_uri
                  });

              } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'master' && pull_request.merged === false && snsMessage.action === 'closed') {
                mess = "Pull request was closed on master branch.";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": pr_slackSubject,
                    "Message": mess,
                    "slackChannel": stagingConfig[1].slack.channel_name,
                    "slackUser": stagingConfig[1].slack.slack_user,
                    "emoji": stagingConfig[1].slack.icon_emoji,
                    "webhookURI": stagingConfig[1].slack.webhook_uri
                  });

              } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'master' && pull_request.merged === true) {
                mess = "Pull request was merged into master branch. Starting staging (QA) pipeline";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": pr_slackSubject,
                    "Message": mess,
                    "slackChannel": stagingConfig[1].slack.channel_name,
                    "slackUser": stagingConfig[1].slack.slack_user,
                    "emoji": stagingConfig[1].slack.icon_emoji,
                    "webhookURI": stagingConfig[1].slack.webhook_uri
                  });
                var staging_repo_name = snsMessage.repository.name;
                var st_sender_login = snsMessage.sender.login;
                //var organization = snsMessage.organization.login;
                console.log(pr_repo_full_name.substring(0, pr_repo_full_name.indexOf("/")));
                lambda.invokeByRequest(beamLineARN, null, {
                    "GIT_HUB_REPO_URL": pr_repo_full_name,
                    "PROJECT_NAME": staging_repo_name,
                    "userId": st_sender_login,
                    "organization": "GaurangBhatt",
                    "pipeline": "staging"
                });

              } else {
                sub = "Pipeline Error";
                mess = "Pipeline request was received but with errors. Pipeline only accepts changes from pull requests on develop and master branch";
                lambda.invokeByRequest(slackARN, null,
                  {
                    "Subject": sub,
                    "Message": mess,
                    "slackChannel": defaultConfig[0].slack.channel_name,
                    "slackUser": defaultConfig[0].slack.slack_user,
                    "emoji": defaultConfig[0].slack.icon_emoji,
                    "webhookURI": defaultConfig[0].slack.webhook_uri
                  });
              }
            } else {
              sub = "Pipeline Error";
              mess = "Pipeline request was received but with errors. Pipeline only accepts changes from pull requests on develop and master branch";
              lambda.invokeByRequest(slackARN, null,
                {
                  "Subject": sub,
                  "Message": mess,
                  "slackChannel": defaultConfig[0].slack.channel_name,
                  "slackUser": defaultConfig[0].slack.slack_user,
                  "emoji": defaultConfig[0].slack.icon_emoji,
                  "webhookURI": defaultConfig[0].slack.webhook_uri
                });
            }
        });
        response.on('error', function(){
          context.fail("Failed to read beamline configuration file!!");
        });
      });
    }
};
