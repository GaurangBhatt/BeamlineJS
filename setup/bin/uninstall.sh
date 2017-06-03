cd ../../
source ./setup/config/setup.properties
source ./setup/config/lambda.properties

slack_notify_fn_name=${INFRASTRUCTURE_PREFIX}'-slack-notify'
pipeline_manager_fn_name=${INFRASTRUCTURE_PREFIX}'-pipeline-manager'
beamline_fn_name=${INFRASTRUCTURE_PREFIX}'-beamlineJS'
sns_topic_name=${INFRASTRUCTURE_PREFIX}'-beamlineJS'
iam_role_name=${INFRASTRUCTURE_PREFIX}'-beamlineJS'

function error_exit
{
  if [[ $1 == 255 || $1 == 2 ]];
  then
    echo "$2" 1>&2
  fi;
}

## Setup Beamline infrastructure in all AWS regions
IFS=',' read -a region_array <<< "${AWS_REGIONS}"
for region in ${region_array[@]}
do
  snsTopicARN=`aws --profile ${AWS_PROFILE_NAME} --region ${region} sns list-topics --output text | cut -f2 | grep ${sns_topic_name}`
  return_code=$?
  echo "Return code:"${return_code}
  error_exit ${return_code} "Error getting SNS Topic ARN..."

  aws --profile ${AWS_PROFILE_NAME} --region ${region} sns delete-topic --topic-arn ${snsTopicARN}
  return_code=$?
  echo "Return code:"${return_code}": deleted SNS topic:"${snsTopicARN}
  error_exit ${return_code} "Error getting SNS Topic ARN..."${snsTopicARN}

  aws --profile ${AWS_PROFILE_NAME} --region ${region} lambda delete-function --function-name ${beamline_fn_name}
  return_code=$?
  echo "Return code:"${return_code}": deleted lambda function:"${beamline_fn_name}
  error_exit ${return_code} "Error while deleting.."${beamline_fn_name}

  aws --profile ${AWS_PROFILE_NAME} --region ${region} lambda delete-function --function-name ${pipeline_manager_fn_name}
  return_code=$?
  echo "Return code:"${return_code}": deleted lambda function:"${pipeline_manager_fn_name}
  error_exit ${return_code} "Error while deleting.."${pipeline_manager_fn_name}

  aws --profile ${AWS_PROFILE_NAME} --region ${region} lambda delete-function --function-name ${slack_notify_fn_name}
  return_code=$?
  echo "Return code:"${return_code}": deleted lambda function:"${slack_notify_fn_name}
  error_exit ${return_code} "Error while deleting.."${slack_notify_fn_name}

  aws --profile ${AWS_PROFILE_NAME} --region ${region} s3 rm s3://${S3_BUCKET_NAME}'-'${INFRASTRUCTURE_PREFIX}'-'${region} --recursive
  return_code=$?
  echo "Return code:"${return_code}": deleted everything from S3 bucket function:"${S3_BUCKET_NAME}'-'${INFRASTRUCTURE_PREFIX}'-'${region}
  error_exit ${return_code} "Error while deleting from S3.."${S3_BUCKET_NAME}'-'${INFRASTRUCTURE_PREFIX}'-'${region}

  aws --profile ${AWS_PROFILE_NAME} --region ${region} s3 rb s3://${S3_BUCKET_NAME}'-'${INFRASTRUCTURE_PREFIX}'-'${region} --force
  return_code=$?
  echo "Return code:"${return_code}": deleted S3 bucket:"${S3_BUCKET_NAME}'-'${INFRASTRUCTURE_PREFIX}'-'${region}
  error_exit ${return_code} "Error while deleting S3.."${S3_BUCKET_NAME}'-'${INFRASTRUCTURE_PREFIX}'-'${region}

  aws --profile ${AWS_PROFILE_NAME} --region ${region} cloudformation delete-stack --stack-name beamline-s3-stack-${region}
  return_code=$?
  echo "Return code:"${return_code}": deleted stack:beamline-s3-stack-"${region}
  error_exit ${return_code} "Error while deleting stack..beamline-s3-stack-"${region}

  aws --profile ${AWS_PROFILE_NAME} --region ${region} cloudformation delete-stack --stack-name beamline-iam-role-stack
  return_code=$?
  echo "Return code:"${return_code}": deleted stack:beamline-iam-role-stack"
  error_exit ${return_code} "Error while deleting stack:beamline-iam-role-stack"

  aws --profile ${AWS_PROFILE_NAME} --region ${region} cloudformation delete-stack --stack-name beamline-sns-topic-stack-${region}
  return_code=$?
  echo "Return code:"${return_code}": deleted stack:beamline-sns-topic-stack-"${region}
  error_exit ${return_code} "Error while deleting stack..beamline-sns-topic-stack-"${region}

  ## disable SNS integration only if region is primary region
  if [[ ${region} == ${PRIMARY_AWS_REGION} ]];
  then
    ## Disable Amazon SNS integration on the repositories
    IFS=',' read -a url_array <<< "${REPOSITORY_HOOKS_URLS}"
    for url in ${url_array[@]};
    do
      curl -v -b -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: token ${GITHUB_PERSONAL_TOKEN}" \
      -d '{
      	"name": "amazonsns",
      	"active": false,
      	"events": ["push", "pull_request"],
        "config": {
          "aws_key": "'"${AWS_ACCESS_KEY}"'",
          "aws_secret": "'"${AWS_SECRET_KEY}"'",
          "sns_topic": "'"${snsTopicARN}"'",
          "sns_region": "'"${PRIMARY_AWS_REGION}"'"
        }
      }' \
      "${url}"
    done
  fi;
done;
