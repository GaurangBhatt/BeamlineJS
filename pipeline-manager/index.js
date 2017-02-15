/*jshint esversion: 6 */
const aws = require('aws-sdk');
const lambda = new aws.Lambda({region: 'us-east-1'});

exports.handler = function(event, context) {
    const snsEvent = event.Records[0].Sns;
    const eventType = ((snsEvent.MessageAttributes || {})['X-Github-Event'] || {}).Value;
    const snsMessage = JSON.parse(snsEvent.Message);
    const params = {
        FunctionName: 'arn:aws:lambda:us-east-1:686218048045:function:slack-notify',
        InvocationType: 'RequestResponse',
        LogType: 'Tail'
    };

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
      params.Payload=JSON.stringify({"Subject": slackSub, "Message": slackMessage});
      if (snsMessage.repository.fork === true && snsMessage.ref === 'refs/heads/develop') {
          lambda.invoke(params, (err, result) => {
            if (err) {
              context.fail({message:"Failed to notify slack channel"});
            } else {
              context.succeed({message: "Started fork pipeline" });
            }
          });
      } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/develop') {
          lambda.invoke(params, (err, result) => {
            if (err) {
              context.fail({message:"Failed to notify slack channel"});
            } else {
              context.succeed({message: "Change was pushed to develop branch" });
            }
          });
      } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/master') {
          lambda.invoke(params, (err, result) => {
            if (err) {
              context.fail({message:"Failed to notify slack channel"});
            } else {
              context.succeed({message: "Change was pushed to master branch" });
            }
          });
      } else {
        params.Payload=JSON.stringify({"Subject":"Pipeline Error", "Message":"Pipeline request was received but with errors. Pipeline only accepts changes from a Fork with develop branch, develop branch and master branch"});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "Something is not correct...invalid scenario!!!" });
          }
        });
      }
    } else if (eventType == 'pull_request') {
      var pull_request = snsMessage.pull_request;
      var pr_repo_full_name = snsMessage.repository.full_name;
      var pr_url = pull_request.html_url;
      var pr_username = pull_request.user.login;
      var pr_slackSubject = "[" + pr_repo_full_name + "]:";

      if (pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
        pr_slackSubject += " New PR opened by " + pr_username + " URL <" + pr_url + ">";
      } if (pull_request.merged === false && snsMessage.action === 'closed') {
        pr_slackSubject += " PR URL <" + pr_url + ">" + " is closed by " + pr_username;
      } else if (pull_request.merged === true && snsMessage.action === 'closed'){
        var mergedBy = pull_request.merged_by.login;
        pr_slackSubject += " PR URL <" + pr_url + ">" + " is merged by " + mergedBy;
      }
      if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
        params.Payload=JSON.stringify({"Subject":pr_slackSubject, "Message":"A new pull request was created for merge into develop branch. Please review and merge!!!"});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "New pull request created on develop branch" });
          }
        });

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === false && snsMessage.action === 'closed') {
        params.Payload=JSON.stringify({"Subject":pr_slackSubject, "Message":"Pull request was closed on develop branch."});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "New pull request created on develop branch" });
          }
        });

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === true) {
        params.Payload=JSON.stringify({"Subject":pr_slackSubject, "Message":"Pull request was merged into develop branch. Starting development pipeline"});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "Development pipeline started" });
          }
        });

      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === false && (snsMessage.action === 'opened' || snsMessage.action === 'reopened')) {
        params.Payload=JSON.stringify({"Subject":pr_slackSubject, "Message":"A new pull request was created for merge into master branch. Please review and merge!!!"});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "New pull request created on master branch" });
          }
        });
      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === false && snsMessage.action === 'closed') {
        params.Payload=JSON.stringify({"Subject":pr_slackSubject, "Message":"Pull request was closed on master branch."});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "New pull request created on master branch" });
          }
        });
      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === true) {
        params.Payload=JSON.stringify({"Subject":pr_slackSubject, "Message":"Pull request was merged into master branch. Starting staging (QA) pipeline"});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "Staging pipeline started" });
          }
        });
      } else {
        params.Payload=JSON.stringify({"Subject":"Pipeline Error", "Message":"Pipeline request was received but with errors. Pipeline only accepts changes from pull requests on develop and master branch"});
        lambda.invoke(params, (err, result) => {
          if (err) {
            context.fail({message:"Failed to notify slack channel"});
          } else {
            context.succeed({message: "Something is not correct...invalid scenario!!!" });
          }
        });
      }
    } else {
      params.Payload=JSON.stringify({"Subject":"Pipeline Error", "Message":"Pipeline request was received but with errors. Pipeline only accepts changes from pull requests on develop and master branch"});
      lambda.invoke(params, (err, result) => {
        if (err) {
          context.fail({message:"Failed to notify slack channel"});
        } else {
          context.succeed({message: "Something is not correct...invalid scenario!!!" });
        }
      });
    }
};
