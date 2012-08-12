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

var binding = process.binding('evals');

module.exports = Script;
Script.Script = Script;

function Script(code, ctx, filename) {
  if (!(this instanceof Script)) {
    return new Script(code, ctx, filename);
  }

  var ns = new binding.NodeScript(code, ctx, filename);

  // 为这个 Script 对象绑定所有的函数
  Object.keys(binding.NodeScript.prototype).forEach(function(f) {
    if (typeof binding.NodeScript.prototype[f] === 'function') {
      this[f] = function() {
        if (!(this instanceof Script)) {
          throw new TypeError('invalid call to ' + f);
        }
        return ns[f].apply(ns, arguments);
      };
    }
  }, this);
}

Script.createScript = function(code, ctx, name) {
  return new Script(code, ctx, name);
};

// Thanks to:
//    http://www.cnblogs.com/rubylouvre/archive/2011/11/25/2262521.html
//    http://docs.cnodejs.net/cman/vm.html
//    http://nodejs.org/api/vm.html

// 创建一个新 context 对象
Script.createContext = binding.NodeScript.createContext;

// 指定是上下文对象，区别是一个普通对象或一个 context 对象
Script.runInContext = binding.NodeScript.runInContext;
Script.runInThisContext = binding.NodeScript.runInThisContext;

// 相当于在一个全新的 context 中执行代码，不会影响当前作用域
Script.runInNewContext = binding.NodeScript.runInNewContext;
