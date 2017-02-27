/*jshint esversion: 6 */
const LambdaSDK = require('./lambdaSDK.js');

exports.handler = function(event, context) {
    console.log(JSON.stringify(event, null, 2));
    const invokedFunctionARN = context.invokedFunctionArn;
    const arnItems = invokedFunctionARN.split(":");
    const region = arnItems[3];
    const accountID = arnItems[4];
    const slackARN = "arn:aws:lambda:" + region + ":" + accountID + ":function:slack-notify";
    const beamLineARN = "arn:aws:lambda:" + region + ":" + accountID + ":function:beamlineJS";
    this.lambda = new LambdaSDK();

    if (event.pipeline !== undefined && event.pipeline === 'production') {
      this.lambda.invokeByRequest(beamLineARN, null, {
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
      console.log(snsEvent.Message);
      var mess = '';
      var sub = '';
      console.log("EVENT TYPE:" + eventType);
      if (eventType === 'push') {
        const repo_full_name = snsMessage.repository.full_name;
        if (snsMessage.repository.fork === true && snsMessage.base_ref === 'refs/heads/develop' && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.created === true) {
            this.lambda.invokeByRequest(slackARN, null, {"Subject": "[" + repo_full_name + "]: ", "Message": "New PR branch " + snsMessage.ref + " created by: " + snsMessage.sender.login});
        } else if (snsMessage.repository.fork === true && snsMessage.base_ref === null && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.deleted === true) {
            this.lambda.invokeByRequest(slackARN, null, {"Subject": "[" + repo_full_name + "]: ", "Message": "PR branch " + snsMessage.ref + " deleted by: " + snsMessage.sender.login});
        } else if (snsMessage.repository.fork === false && snsMessage.base_ref === 'refs/heads/develop' && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.created === true) {
            this.lambda.invokeByRequest(slackARN, null, {"Subject": "[" + repo_full_name + "]: ", "Message": "New PR branch " + snsMessage.ref + " created by: " + snsMessage.sender.login});
        } else if (snsMessage.repository.fork === false && snsMessage.base_ref === null && snsMessage.ref.startsWith("refs/heads/pr-") && snsMessage.deleted === true) {
            this.lambda.invokeByRequest(slackARN, null, {"Subject": "[" + repo_full_name + "]: ", "Message": "PR branch " + snsMessage.ref + " deleted by: " + snsMessage.sender.login});
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
            this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
            var repo_name = snsMessage.repository.name;
            var sender = snsMessage.sender.login;
            var organization = snsMessage.organization.login;
            this.lambda.invokeByRequest(beamLineARN, null, {
                "GIT_HUB_REPO_URL": repo_full_name,
                "PROJECT_NAME": repo_name,
                "userId": sender,
                "organization": organization,
                "pipeline": "fork"
            });
          } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/develop') {
              this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
          } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/master') {
              this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
          } else {
            sub = "Pipeline Error";
            mess = "Pipeline request was received but with errors. Pipeline only accepts changes from a Fork with develop branch, develop branch and master branch";
            this.lambda.invokeByRequest(slackARN, null, {"Subject": sub, "Message": mess});
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
          this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

        } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'develop' && pull_request.merged === false && snsMessage.action === 'closed') {
          mess = "Pull request was closed on develop branch.";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

        } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'develop' && pull_request.merged === true) {
          mess = "Pull request was merged into develop branch. Starting development pipeline";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});
          var main_repo_name = snsMessage.repository.name;
          var sender_login = snsMessage.sender.login;
          //var organization = snsMessage.organization.login;
          console.log(pr_repo_full_name.substring(0, pr_repo_full_name.indexOf("/")));
          this.lambda.invokeByRequest(beamLineARN, null, {
              "GIT_HUB_REPO_URL": pr_repo_full_name,
              "PROJECT_NAME": main_repo_name,
              "userId": sender_login,
              "organization": "GaurangBhatt",
              "pipeline": "development"
          });

        } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'master' && pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
          mess = "A new pull request was created for merge into master branch. Please review and merge!!!";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

        } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'master' && pull_request.merged === false && snsMessage.action === 'closed') {
          mess = "Pull request was closed on master branch.";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

        } else if (pull_request.base.repo.fork === false && (pull_request.head.ref === 'develop' || pull_request.head.ref.startsWith("pr-")) && pull_request.base.ref === 'master' && pull_request.merged === true) {
          mess = "Pull request was merged into master branch. Starting staging (QA) pipeline";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});
          var staging_repo_name = snsMessage.repository.name;
          var st_sender_login = snsMessage.sender.login;
          //var organization = snsMessage.organization.login;
          console.log(pr_repo_full_name.substring(0, pr_repo_full_name.indexOf("/")));
          this.lambda.invokeByRequest(beamLineARN, null, {
              "GIT_HUB_REPO_URL": pr_repo_full_name,
              "PROJECT_NAME": staging_repo_name,
              "userId": st_sender_login,
              "organization": "GaurangBhatt",
              "pipeline": "staging"
          });

        } else {
          sub = "Pipeline Error";
          mess = "Pipeline request was received but with errors. Pipeline only accepts changes from pull requests on develop and master branch";
          this.lambda.invokeByRequest(slackARN, null, {"Subject": sub, "Message": mess});
        }
      } else {
        sub = "Pipeline Error";
        mess = "Pipeline request was received but with errors. Pipeline only accepts changes from pull requests on develop and master branch";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": sub, "Message": mess});
      }
    }
};
