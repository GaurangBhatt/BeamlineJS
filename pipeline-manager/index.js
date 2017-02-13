exports.handler = function(event, context) {
    var snsEvent = event.Records[0].Sns;
    var eventType = ((snsEvent.MessageAttributes || {})['X-Github-Event'] || {}).Value;
    var snsMessage = JSON.parse(snsEvent.Message);

    if (eventType == 'push') {
      if (snsMessage.repository.fork === true && snsMessage.ref === 'refs/heads/develop') {
          context.succeed({ message: "started fork pipeline" });
      } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/develop') {
          context.succeed({ message: "started notification pipeline" });
      } else if (snsMessage.repository.fork === false && snsMessage.ref === 'refs/heads/master') {
          context.succeed({ message: "started notification pipeline" });
      } else {
        context.fail({message: "Something is not correct...invalid scenario!!!"});
      }
    } else if (eventType == 'pull_request') {
      var pull_request = snsMessage.pull_request;
      if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === false) {
        context.succeed({ message: "started notification pipeline" });
      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'develop' && pull_request.merged === true) {
        context.succeed({ message: "started development pipeline" });
      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === false) {
        context.succeed({ message: "started notification pipeline" });
      } else if (pull_request.base.repo.fork === false && pull_request.head.ref === 'develop' && pull_request.base.ref === 'master' && pull_request.merged === true) {
        context.succeed({ message: "started staging pipeline" });
      } else {
        context.fail({message: "Something is not correct...invalid scenario!!!"});
      }
    } else {
      context.fail({message: "Something is not correct...invalid scenario!!!"});
    }
};
