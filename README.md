# BeanlineJS
*"In accelerator physics, a beamline refers to the trajectory of the beam of accelerated particles, including the overall construction of the path segment (vacuum tube, magnets, diagnostic devices) along a specific path of an accelerator facility. This part is either*
  * *the line in a linear accelerator along which a beam of particles travels, or*
  * *the path leading from a cyclic accelerator to the experimental endstation (as in synchrotron light sources or cyclotrons)."*

**This beamline will facilitate in accelerate the build, test, release and deployment of node.js based lambda functions quickly and efficiently across various facilities (regions).**

### Features


#Setup Beamline
You can setup your own Beamline by using below simple steps. **Please note that for Beamline to work you will have to create accounts using vendor services that may result in $$ cost. Please go through the pricing model of each services offered by the vendors prior to using these services**.

It will create following three AWS Lambda functions:

### [Function - slack-notify](https://github.com/GaurangBhatt/BeamlineJS/blob/master/notification-line/README.md)
This function is used for sending Slack notifications to your slack channel(s).

### [Function - pipeline-manager](https://github.com/GaurangBhatt/BeamlineJS/blob/master/pipeline-manager/README.md)
This function manages the overall execution of BeamlineJS. It parses the GitHub event and then initiates the pipeline based on the event.

### [Function - beamlineJS](https://github.com/GaurangBhatt/BeamlineJS/blob/master/beamline/README.md)
This function will perform the continuous integration and deployment of CLIENT based on the Beamline configuration provided by the CLIENT.

*CLIENT- Is the AWS Lambda function which will be integrated and deployed using BeamlineJS*

## Prerequisites
* You will need AWS Account
  * [How to create AWS Account?](http://docs.aws.amazon.com/lambda/latest/dg/getting-started.html)
  * [Generate ACCESS_KEY and SECRET_KEY of your AWS Account](http://docs.aws.amazon.com/general/latest/gr/managing-aws-access-keys.html)
    * This is used for integrating AWS Simple Notification Service (SNS) with GitHub repository. Unfortunately GitHub's Amazon SNS integration does not work with IAM Role.

* You will need AWS CLI installed on your machine
  * [How to install AWS CLI?](http://docs.aws.amazon.com/cli/latest/userguide/installing.html)
  * [How to configure AWS Profile?](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html)
    * Configure profile in all regions where you want Beamline.

* You will need GitHub Account
  * [How to create GitHub Account?](https://help.github.com/articles/signing-up-for-a-new-github-account/)
  * [How to generate GitHub personal access token?](https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/)
    * You will need this token to create new pull requests and respective branches

* You will need Slack Account
  * [How to create Slack Account?](https://slack.com/create#email)
  * [How to create Slack channels?](https://get.slack.help/hc/en-us/articles/201402297-Create-a-channel)
  * [How to create incoming Webhook on Slack channel?](https://www.programmableweb.com/news/how-to-integrate-webhooks-slack-api/how-to/2015/10/20)
    * You will need webhooks to send notifications from Beamline to your Slack channels

* You will need NPM
   * [How to install NPM on Mac?](http://blog.teamtreehouse.com/install-node-js-npm-mac)
   * [How to install NPM on Windows?](http://blog.teamtreehouse.com/install-node-js-npm-windows)

* CLIENT
  * Will have to follow [Vincent Driessen's successful branching model](http://nvie.com/posts/a-successful-git-branching-model/).
  In summary:
  * Developer will
    - Develop on fork repository's develop branch
    - Merge from master to fork repository's develop to resolve any conflicts
    - push commits to fork repository's develop branch
  * BeamlineJS will enforce following flow
    - Automatically create a new pull request to merge new PR branch of fork repository into base repository's develop branch
    - Developers will use the GitHub console to review and merge the new pull request
    - Automatically create a new pull request to merge new PR branch of base repository's develop branch into base repository's master branch
    - Developers will use the GitHub console to review and merge changes into master branch

## Setup
*I have tested these steps only on MAC. I don't see a reason why it will not work on Windows. You will need something like GitBash to run these steps on Windows*

* Clone BeamlineJS repository on your local machine
```
git clone https://github.com/GaurangBhatt/BeamlineJS.git
```

* Navigate into your cloned repository's home directory and run following commands

  * Copy setup.properties.rename file and create setup.properties file
    ```
    cp setup.properties.rename setup.properties
    ```
    * Update setup.properties file to change
      * AWS_PROFILE_NAME - name of your configured profile using AWS Secret key and access key
      * INFRASTRUCTURE_PREFIX - to any string value of your choice
      * GITHUB_PERSONAL_TOKEN - to your personal token
      * S3_BUCKET_NAME - name of your S3 bucket
      * AWS_REGIONS - provide comma separated list of all regions where you want to install/setup BeamlineJS
      * PRIMARY_AWS_REGION - Set the primary region. This will integrate the SNS topic of this region to your repository via repository hooks
      * REPOSITORY_HOOKS_URLS - comma separated list of all repository hook URLs to which you want to add Amazon SNS integration

  * Install and setup BeamlineJS
    ```
    chmod +x setup.sh
    ./setup.sh
    ```
