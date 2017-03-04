# LambdaJS-Pipeline Manager
This function takes care of managing the Beamline by parsing the GitHub event. It will start the Beamline only if
* a new commit is pushed into your fork repository and pipeline integration is turned on on your fork repository **OR**
* a new pull request is successfully merged into a branch and pipeline integration is turned on on your fork repository

## Stage
