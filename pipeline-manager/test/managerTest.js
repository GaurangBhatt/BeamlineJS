'use strict';

const chai = require('chai');
const should = chai.should();
const os = require('os');
const manager = require('../index.js');

const fork_push_event = require('./git_events/fork_push_event.json');
const invalid_push_event = require('./git_events/invalid_push_event.json');
const invalid_event = require('./git_events/invalid_event.json');
const invalid_pr_event = require('./git_events/invalid_pull_request_event.json');
const develop_push_event = require('./git_events/develop_push_event.json');
const master_push_event = require('./git_events/master_push_event.json');
const new_pr_fork_into_dev_branch_not_merged = require('./git_events/new_pr_fork_into_main_repo_develop_branch.json');
const new_pr_fork_into_dev_branch_merged = require('./git_events/pr_merged_into_main_repo_develop_branch.json');
const new_pr_dev_into_master_branch_not_merged = require('./git_events/new_pr_main_repo_develop_into_master_branch.json');
const new_pr_dev_into_master_branch_merged = require('./git_events/pr_merged_into_main_repo_master_branch.json');

describe('Test - pipeline manager', function() {

  it ('it should start fork pipeline if it is fork push event', function (done) {
    manager.handler(fork_push_event, context);
    done();
  });

  it ('it should start notification pipeline if it is develop branch and PR is not merged', function (done) {
    manager.handler(new_pr_fork_into_dev_branch_not_merged, context);
    done();
  });

  it ('it should start development pipeline if it is develop branch and PR is merged', function (done) {
    manager.handler(new_pr_fork_into_dev_branch_merged, context);
    done();
  });

  it ('it should start notification pipeline to notify that PR is pushed to develop branch', function (done) {
    manager.handler(develop_push_event, context);
    done();
  });

  it ('it should start notification pipeline if it is master branch and PR is not merged', function (done) {
    manager.handler(new_pr_dev_into_master_branch_not_merged, context);
    done();
  });

  it ('it should start staging/qa pipeline if it is master branch and PR is merged', function (done) {
    manager.handler(new_pr_dev_into_master_branch_merged, context);
    done();
  });

  it ('it should start notification pipeline to notify that PR is pushed to master branch', function (done) {
    manager.handler(master_push_event, context);
    done();
  });

  it ('it should not do anything if the push is on a branch that is not develop or master', function (done) {
    manager.handler(invalid_push_event, context);
    done();
  });

  it ('it should not do anything if the git event is not push or pull_request', function (done) {
    manager.handler(invalid_event, context);
    done();
  });

  it ('it should not do anything if the PR merged is on a branch that is not develop or master', function (done) {
    manager.handler(invalid_pr_event, context);
    done();
  });
});
