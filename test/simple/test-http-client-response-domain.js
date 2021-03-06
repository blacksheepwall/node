// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var common = require('../common'),
    assert = require('assert'),
    http = require('http'),
    domain = require('domain');

var gotDomainError = false;
var d;

process.on('exit', function() {
  assert(gotDomainError);
});

// first fire up a simple HTTP server
var server = http.createServer(function(req, res) {
  res.writeHead(200);
  res.end();
  server.close();
});
server.listen(common.PIPE, function() {
  // create a domain
  d = domain.create();
  d.run(test);
});

function test() {

  d.on('error', function(err) {
    gotDomainError = true;
    assert.equal('should be caught by domain', err.message);
  });

  var req = http.get({
    socketPath: common.PIPE,
    headers: {'Content-Length':'1'},
    method: 'POST',
    path: '/'
  });
  req.on('response', function(res) {
    res.on('end', function() {
      res.emit('error', new Error('should be caught by domain'));
    });
  });
  req.end();
}
