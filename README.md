# BeanlineJS
*"In accelerator physics, a beamline refers to the trajectory of the beam of accelerated particles, including the overall construction of the path segment (vacuum tube, magnets, diagnostic devices) along a specific path of an accelerator facility. This part is either*
  * *the line in a linear accelerator along which a beam of particles travels, or*
  * *the path leading from a cyclic accelerator to the experimental endstation (as in synchrotron light sources or cyclotrons)."*

**This beamline will facilitate in accelerate the build, test, release and deployment of node.js based lambda functions quickly and efficiently across various facilities (regions).**

#Setup Beamline
You can setup your own Beamline by using below simple steps. **Please note that for Beamline to work you will have to create accounts using vendor services that may result in $$ cost. Please go through the pricing model of each services offered by the vendors prior to using these services**.

## Prerequisites
* You will need AWS Account
  * [How to create AWS Account?](http://docs.aws.amazon.com/lambda/latest/dg/getting-started.html)
  * [Generate ACCESS_KEY and SECRET_KEY of your AWS Account](http://docs.aws.amazon.com/general/latest/gr/managing-aws-access-keys.html)
    * This is used for integrating AWS Simple Notification Service (SNS) with GitHub repository. Unfortunately GitHub's Amazon SNS integration does not work with IAM Role.

* You will need GitHub Account
  * [How to create GitHub Account?](https://help.github.com/articles/signing-up-for-a-new-github-account/)
  * [How to generate GitHub personal access token?](https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/)
    * You will need this token to create new pull requests and respective branches

* You will need Slack Account
  * [How to create Slack Account?](https://slack.com/create#email)
  * [How to create Slack channels?](https://get.slack.help/hc/en-us/articles/201402297-Create-a-channel)
  * [How to create incoming Webhook on Slack channel?](https://www.programmableweb.com/news/how-to-integrate-webhooks-slack-api/how-to/2015/10/20)
    * You will need this webhook to send notifications from Beamline to your Slack channels

## Setup
