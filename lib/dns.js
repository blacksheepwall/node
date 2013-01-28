// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// 'Software'), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// DNS模块

// Thanks to
//    http://docs.cnodejs.net/cman/dns.html
//    http://nodejs.org/api/dns.html

var cares = process.binding('cares_wrap'),
    net = require('net'),
    isIp = net.isIP;


function errnoException(errorno, syscall) {
  // TODO make this more compatible with ErrnoException from src/node.cc
  // Once all of Node is using this function the ErrnoException from
  // src/node.cc should be removed.

  // For backwards compatibility. libuv returns ENOENT on NXDOMAIN.
  if (errorno == 'ENOENT') {
    errorno = 'ENOTFOUND';
  }

  var e = new Error(syscall + ' ' + errorno);

  e.errno = e.code = errorno;
  e.syscall = syscall;
  return e;
}


// c-ares invokes a callback either synchronously or asynchronously,
// but the dns API should always invoke a callback asynchronously.
//
// This function makes sure that the callback is invoked asynchronously.
// It returns a function that invokes the callback within nextTick().
//
// To avoid invoking unnecessary nextTick(), `immediately` property of
// returned function should be set to true after c-ares returned.
//
// Usage:
//
// function someAPI(callback) {
//   callback = makeAsync(callback);
//   channel.someAPI(..., callback);
//   callback.immediately = true;
// }
function makeAsync(callback) {
  if (typeof callback !== 'function') {
    return callback;
  }
  return function asyncCallback() {
    if (asyncCallback.immediately) {
      // The API already returned, we can invoke the callback immediately.
      callback.apply(null, arguments);
    } else {
      var args = arguments;
      process.nextTick(function() {
        callback.apply(null, args);
      });
    }
  };
}


// 将一个域名（例如'google.com'）解析成为找到的第一个 A(IPv4) 或者 AAAA(IPv6) 记录
// 回调函数有 (err, address, family) 这三个参数：
//    address 参数是一个代表 IPv4 或 IPv6 地址的字符串
//    family 是一个表示地址版本的整数4或6（并不一定和调用 lookup 时传入的 family 参数值相同）
exports.lookup = function(domain, family, callback) {
  // parse arguments
  if (arguments.length === 2) {
    callback = family;
    family = 0;
  } else if (!family) {
    family = 0;
  } else {
    family = +family;
    if (family !== 4 && family !== 6) {
      throw new Error('invalid argument: `family` must be 4 or 6');
    }
  }
  callback = makeAsync(callback);

  if (!domain) {
    callback(null, null, family === 6 ? 6 : 4);
    return {};
  }

  // Hack required for Windows because Win7 removed the
  // localhost entry from c:\WINDOWS\system32\drivers\etc\hosts
  // See http://daniel.haxx.se/blog/2011/02/21/localhost-hack-on-windows/
  // TODO Remove this once c-ares handles this problem.
  if (process.platform == 'win32' && domain == 'localhost') {
    callback(null, '127.0.0.1', 4);
    return {};
  }

  var matchedFamily = net.isIP(domain);
  if (matchedFamily) {
    callback(null, domain, matchedFamily);
    return {};
  }

  function onanswer(addresses) {
    if (addresses) {
      if (family) {
        callback(null, addresses[0], family);
      } else {
        callback(null, addresses[0], addresses[0].indexOf(':') >= 0 ? 6 : 4);
      }
    } else {
      callback(errnoException(errno, 'getaddrinfo'));
    }
  }

  var wrap = cares.getaddrinfo(domain, family);

  if (!wrap) {
    throw errnoException(errno, 'getaddrinfo');
  }

  wrap.oncomplete = onanswer;

  callback.immediately = true;
  return wrap;
};


function resolver(bindingName) {
  var binding = cares[bindingName];

  return function query(name, callback) {
    function onanswer(status, result) {
      if (!status) {
        callback(null, result);
      } else {
        callback(errnoException(errno, bindingName));
      }
    }

    callback = makeAsync(callback);
    var wrap = binding(name, onanswer);
    if (!wrap) {
      throw errnoException(errno, bindingName);
    }

    callback.immediately = true;
    return wrap;
  }
}


var resolveMap = {};

exports.resolve4 = resolveMap.A = resolver('queryA');
exports.resolve6 = resolveMap.AAAA = resolver('queryAaaa');
exports.resolveCname = resolveMap.CNAME = resolver('queryCname');
exports.resolveMx = resolveMap.MX = resolver('queryMx');
exports.resolveNs = resolveMap.NS = resolver('queryNs');
exports.resolveTxt = resolveMap.TXT = resolver('queryTxt');
exports.resolveSrv = resolveMap.SRV = resolver('querySrv');
exports.reverse = resolveMap.PTR = resolver('getHostByAddr');

// 将域名（比如'google.com'）按照参数rrtype所指定类型的解析结果放到一个数组中
// 合法的类型为 A（IPV4地址），AAAA（IPV6地址），MX（邮件交换记录），TXT（文本记录），SRV（SRV记录），和PTR（用于反向IP解析）
// 回调函数接受两个参数：(err, addresses)，参数 address 中的每一项的类型根据所要求的记录类型进行判断
// 当有错误发生时，参数 err 的内容是一个 Error 对象的实例，err.errno 属性是下面错误代码列表中的一个
exports.resolve = function(domain, type_, callback_) {
  var resolver, callback;
  if (typeof type_ == 'string') {
    resolver = resolveMap[type_];
    callback = callback_;
  } else {
    resolver = exports.resolve4;
    callback = type_;
  }

  if (typeof resolver === 'function') {
    return resolver(domain, callback);
  } else {
    throw new Error('Unknown type "' + type + '"');
  }
};

// ERROR CODES
exports.NODATA = 'ENODATA';
exports.FORMERR = 'EFORMERR';
exports.SERVFAIL = 'ESERVFAIL';
exports.NOTFOUND = 'ENOTFOUND';
exports.NOTIMP = 'ENOTIMP';
exports.REFUSED = 'EREFUSED';
exports.BADQUERY = 'EBADQUERY';
exports.ADNAME = 'EADNAME';
exports.BADFAMILY = 'EBADFAMILY';
exports.BADRESP = 'EBADRESP';
exports.CONNREFUSED = 'ECONNREFUSED';
exports.TIMEOUT = 'ETIMEOUT';
exports.EOF = 'EOF';
exports.FILE = 'EFILE';
exports.NOMEM = 'ENOMEM';
exports.DESTRUCTION = 'EDESTRUCTION';
exports.BADSTR = 'EBADSTR';
exports.BADFLAGS = 'EBADFLAGS';
exports.NONAME = 'ENONAME';
exports.BADHINTS = 'EBADHINTS';
exports.NOTINITIALIZED = 'ENOTINITIALIZED';
exports.LOADIPHLPAPI = 'ELOADIPHLPAPI';
exports.ADDRGETNETWORKPARAMS = 'EADDRGETNETWORKPARAMS';
exports.CANCELLED = 'ECANCELLED';
