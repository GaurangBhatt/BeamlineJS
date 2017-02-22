/*jshint esversion: 6 */
const LambdaSDK = require('./lambdaSDK.js');

exports.handler = function(event, context) {
    const snsEvent = event.Records[0].Sns;
    const eventType = ((snsEvent.MessageAttributes || {})['X-Github-Event'] || {}).Value;
    const snsMessage = JSON.parse(snsEvent.Message);
    const slackARN = 'arn:aws:lambda:us-east-1:686218048045:function:slack-notify';
    const fork_line_params = {
      FunctionName: 'arn:aws:lambda:us-east-1:686218048045:function:fork-line',
      InvocationType: 'Event', //async InvocationType
      LogType: 'Tail'
    };
    var mess = '';
    var sub = '';
    this.lambda = new LambdaSDK();

    if (eventType == 'push') {
      const username = snsMessage.commits[0].author.username;
      const totalCommits = snsMessage.commits.length;
      const repo_full_name = snsMessage.repository.full_name;
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
      if (snsMessage.repository.fork === true && snsMessage.ref === 'refs/heads/develop') {
          this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
          var clone_url = snsMessage.repository.clone_url;
          var repo_name = snsMessage.repository.name;
          /*
          fork_line_params.Payload = JSON.stringify({"GIT_HUB_REPO_URL": clone_url, "PROJECT_NAME": repo_name});
          this.lambda.invoke(fork_line_params, function(error, data){
            if (error) {
              context.fail({message:"Failed to start fork pipeline"});
            }
            context.succeed({message:"Fork pipeline started"});
          });
          */

      } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/develop') {
          this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
      } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/master') {
          this.lambda.invokeByRequest(slackARN, null, {"Subject": slackSub, "Message": slackMessage});
      } else {
        sub = "Pipeline Error";
        mess = "Pipeline request was received but with errors. Pipeline only accepts changes from a Fork with develop branch, develop branch and master branch";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": sub, "Message": mess});
      }
    } else if (eventType == 'pull_request') {
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

      if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
        mess = "A new pull request was created for merge into develop branch. Please review and merge!!!";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === false && snsMessage.action === 'closed') {
        mess = "Pull request was closed on develop branch.";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === true) {
        mess = "Pull request was merged into develop branch. Starting development pipeline";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
        mess = "A new pull request was created for merge into master branch. Please review and merge!!!";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === false && snsMessage.action === 'closed') {
        mess = "Pull request was closed on master branch.";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === true) {
        mess = "Pull request was merged into master branch. Starting staging (QA) pipeline";
        this.lambda.invokeByRequest(slackARN, null, {"Subject": pr_slackSubject, "Message": mess});

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
};
