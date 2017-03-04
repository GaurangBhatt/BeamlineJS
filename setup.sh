#!/bin/bash

# Build pipeline-manager lambda function
cd notification-line
#npm run all

cd ../pipeline-manager
#npm run all

cd ../beamline
#npm run all

cd ../
source ./setup.properties



## Create Amazon SNS integration on the repositories
IFS=',' read -a url_array <<< "${REPOSITORY_HOOKS_URLS}"
for url in ${url_array[@]};
do
  curl -v -b -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: token ${GITHUB_PERSONAL_TOKEN}" \
  -d '{
  	"name": "amazonsns",
  	"active": true,
  	"events": ["push", "pull_request"],
    "config": {
      "aws_key": "'"${AWS_ACCESS_KEY}"'",
      "aws_secret": "'"${AWS_SECRET_KEY}"'",
      "sns_topic": "arn:aws:sns:us-east-1:686218048045:lambci-InvokeTopic-PM42PQ3NNG61",
      "sns_region": "'"${PRIMARY_AWS_REGION}"'"
    }
  }' \
  "${url}"
done
