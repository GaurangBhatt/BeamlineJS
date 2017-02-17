var argv = require('yargs').argv;
var fs = require('fs');
var archiver = require('archiver');

var build_dir = argv.build_dir;
var project_name = argv.project_name;

zip = function() {
  // create a file to stream archive data to.
  var output = fs.createWriteStream(build_dir + '/' + project_name + '.zip');
  var archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
  });

  // listen for all archive data to be written
  output.on('close', function() {
    console.log(archive.pointer() + ' total bytes');
    console.log('archiver has been finalized and the output file descriptor has closed.');
  });

  // good practice to catch this error explicitly
  archive.on('error', function(err) {
    console.log(err);
    throw err;
  });

  // pipe archive data to the file
  archive.pipe(output);

  // append a index.js from stream
  var index_file = build_dir + '/' + project_name + '/' + 'index.js';
  archive.append(fs.createReadStream(index_file), { name: 'index.js' });

  // append node_modules
  var module_dir = build_dir + "/" + project_name + "/" + "node_modules";
  archive.directory(module_dir,'node_modules');

  // finalize the archive (ie we are done appending files but streams have to finish yet)
  archive.finalize();
};

zip();
