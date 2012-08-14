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

// 操作系统模块
// Thanks to
// 		http://nodejs.org/api/os.html
var binding = process.binding('os');
var util = require('util');

// 返回当前操作系统的主机名
exports.hostname = binding.getHostname;

// 返回一个数组，该数组存储着系统1分钟，5分钟，以及15分钟的负载均值
exports.loadavg = binding.getLoadAvg;

// 返回当前系统的正常运行时间，时间以秒为单位
exports.uptime = binding.getUptime;

// 返回系统存储的剩余空间，该值以字节（byte）为单位
exports.freemem = binding.getFreeMem;

// 返回系统存储空间总值，该值以字节（byte）为单位
exports.totalmem = binding.getTotalMem;

// 返回一个对象数组，该数组包含了关于系统每个 CPU /内核的信息：
// 型号，速度（以 MHz 为单位），以及 CPU 时间使用情况（包含CPU时间片在用户态、改变过优先级的用户进程、内核态、空闲、以及 IRQ 各方面的消耗）
exports.cpus = binding.getCPUs;

// 返回当前操作系统名称
exports.type = binding.getOSType;

// 返回发行版本
exports.release = binding.getOSRelease;

// 返回网络信息
exports.networkInterfaces = binding.getInterfaceAddresses;

// 返回系统架构信息
exports.arch = function() {
  return process.arch;
};

// 返回操作系统平台
exports.platform = function() {
  return process.platform;
};

// 返回系统默认的临时文件存放目录
exports.tmpDir = function() {
  return process.env.TMPDIR ||
         process.env.TMP ||
         process.env.TEMP ||
         (process.platform === 'win32' ? 'c:\\windows\\temp' : '/tmp');
};

// 返回网络信息
exports.getNetworkInterfaces = util.deprecate(function() {
  return exports.networkInterfaces();
}, 'getNetworkInterfaces is now called `os.networkInterfaces`.');

exports.EOL = process.platform === 'win32' ? '\r\n' : '\n';
