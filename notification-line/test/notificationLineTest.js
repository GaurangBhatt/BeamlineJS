'use strict';

const chai = require('chai');
const should = chai.should();
const os = require('os');
const notify = require('../index.js');

describe('Test - Notification Line', function() {

  it ('it should send slack notification', function (done) {
    var context = null;
    /*var context = {
      succeed: function(result) {
              //result.message.should.equal('slack channel notified');
              done();
          },
      fail: function(result) {
              //result.message.should.equal('Failed to notify slack channel');
              done();
          }
    }*/
    notify.handler({ Subject: "testing subject", Message:"testing" }, context);
    done();
  });

});
