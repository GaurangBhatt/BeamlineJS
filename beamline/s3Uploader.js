/*jshint esversion: 6 */

const path = require('path');
const async = require('async');
const fs = require('fs');
const AWS = require('aws-sdk');
const argv = require('yargs').argv;
const s3 = new AWS.S3();

const bucketName = argv.bucket_name;
const absoluteFilePath = argv.abs_file_path;
const fileName = argv.fileName;

function uploadMultipart(uploadCb) {
  s3.createMultipartUpload({ Bucket: bucketName, Key: fileName, ServerSideEncryption: 'AES256' }, (mpErr, multipart) => {
    if(!mpErr){
      console.log("multipart created", multipart.UploadId);
      fs.readFile(absoluteFilePath, (err, fileData) => {
        var partSize = 1024 * 1024 * 5;
        var parts = Math.ceil(fileData.length / partSize);
        async.timesSeries(parts, (partNum, next) => {
          var rangeStart = partNum*partSize;
          var end = Math.min(rangeStart + partSize, fileData.length);
          console.log("uploading ", fileName, " % ", (partNum/parts).toFixed(2));
          partNum++;
          async.retry((retryCb) => {
            s3.uploadPart({
              Body: fileData.slice(rangeStart, end),
              Bucket: bucketName,
              Key: fileName,
              PartNumber: partNum,
              UploadId: multipart.UploadId
            }, (err, mData) => {
              retryCb(err, mData);
            });
          }, (err, data)  => {
            //console.log(data);
            next(err, {ETag: data.ETag, PartNumber: partNum});
          });

        }, (err, dataPacks) => {
          s3.completeMultipartUpload({
            Bucket: bucketName,
            Key: fileName,
            MultipartUpload: {
              Parts: dataPacks
            },
            UploadId: multipart.UploadId
          }, uploadCb);
        });
      });
    }else{
      uploadCb(mpErr);
    }
  });
};

function uploadFile(uploadCb) {
  var fileName = path.basename(absoluteFilePath);
  var stats = fs.statSync(absoluteFilePath);
  var fileSizeInBytes = stats["size"];

  if(fileSizeInBytes < (1024*1024*5)) {
    async.retry((retryCb) => {
      fs.readFile(absoluteFilePath, (err, fileData) => {
        s3.putObject({
          Bucket: bucketName,
          Key: fileName,
          Body: fileData,
          ServerSideEncryption: 'AES256'
        }, retryCb);
      });
    }, uploadCb);
  }else{
    uploadMultipart(uploadCb);
  }
}

function upload() {
  uploadFile(function(result){});
}
upload();
