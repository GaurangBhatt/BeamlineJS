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

slack_notify_fn_name=${INFRASTRUCTURE_PREFIX}'-slack-notify'
pipeline_manager_fn_name=${INFRASTRUCTURE_PREFIX}'-pipeline-manager'
beamline_fn_name=${INFRASTRUCTURE_PREFIX}'-beamlineJS'
sns_topic_name=${INFRASTRUCTURE_PREFIX}'-beamline'

function error_exit
{
  if [[ $1 == 255 || $1 == 2 ]];
  then
    echo "$2" 1>&2
    exit 1
  fi;
}

## Setup Beamline infrastructure in all AWS regions
IFS=',' read -a region_array <<< "${AWS_REGIONS}"
for region in ${region_array[@]}
do
  ## Create S3 bucket if not exists
  result=`aws --profile ${AWS_PROFILE_NAME} --region ${region} s3 ls s3://${INFRASTRUCTURE_PREFIX}'-'${S3_BUCKET_NAME}'-'${region}`
  statusCode=$?
  if [[ ${statusCode} != 0 ]];
  then
    aws --profile ${AWS_PROFILE_NAME} --region ${region} cloudformation create-stack \
        --stack-name "beamline-s3-stack-${region}" \
        --template-body file://create_s3_bucket.json \
        --parameters \
        ParameterKey=BucketNameParam,ParameterValue=${INFRASTRUCTURE_PREFIX}'-'${S3_BUCKET_NAME}'-'${region}

    return_code=$?
    echo "Return code:"${return_code}
    error_exit ${return_code} "Error creating S3 stack..."

    echo "Creating S3 bucket with bucket name:"${INFRASTRUCTURE_PREFIX}'-'${S3_BUCKET_NAME}'-'${region}
    sleep 30
    set -e
    stack_status=`aws --profile ${AWS_PROFILE_NAME} --region ${region} cloudformation describe-stacks --stack-name beamline-s3-stack-${region} --max-items 1 --output text | cut -f 7`
    if [[ -z ${stack_status} ]];
    then
       stack_status=CHECK_AGAIN
    fi;
    while [ ${stack_status} != CREATE_COMPLETE ]
    do
        echo ${stack_status}
        sleep 10
        stack_status=`aws --profile ${AWS_PROFILE_NAME} --region ${region} cloudformation describe-stacks --stack-name beamline-s3-stack-${region} --max-items 1 --output text | cut -f 7`
        if [[ -z ${stack_status} ]];
        then
           stack_status=CHECK_AGAIN
        fi;
        if [ ${stack_status} == ROLLBACK_COMPLETE ]
        then
           exit 1
        fi;
    done;
    set +e
  else
    echo "S3 bucket already exists..."
  fi;

  ## Upload Beamline lambda functions code to S3 buckets
  aws --profile ${AWS_PROFILE_NAME} --region ${region} s3 cp ./pipeline-manager/pipeline-manager-1.0.0.zip s3://${INFRASTRUCTURE_PREFIX}'-'${S3_BUCKET_NAME}'-'${region}/INFRA/pipeline-manager.zip
  aws --profile ${AWS_PROFILE_NAME} --region ${region} s3 cp ./notification-line/notification-line-1.0.0.zip s3://${INFRASTRUCTURE_PREFIX}'-'${S3_BUCKET_NAME}'-'${region}/INFRA/notification-line.zip
  aws --profile ${AWS_PROFILE_NAME} --region ${region} s3 cp ./beamline/beamline-1.0.0.zip s3://${INFRASTRUCTURE_PREFIX}'-'${S3_BUCKET_NAME}'-'${region}/INFRA/beamline.zip

  ## Create IAM role
  

  ## Create or update Beamline lambda functions


  ## Create or Update SNS Topic & subscription
  snsTopicARN=`aws --profile ${AWS_PROFILE_NAME} --region ${region} sns list-topics --output text | cut -f2 | grep ${sns_topic_name}`
  echo ${snsTopicARN}
  if [[ -z ${snsTopicARN} ]]
  then
    echo "Creating SNS Topic..."
  else
    echo "Updating SNS Topic..."
  fi;

  ## setup SNS integration only if region is primary region
  if [[ ${region} == ${PRIMARY_AWS_REGION} ]];
  then
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
  fi;
done
