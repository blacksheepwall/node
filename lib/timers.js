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

// 有相同 timeout 的 timer 的背后，同一时间内只会有一个定时器。如果某个函数设置了很多个 timer，其背后都只是存放到一个链表中
// Thanks to
//    http://nodejs.org/api/timers.html
//    http://deadhorse.me/nodejs/2012/08/01/timer_in_node.html

var Timer = process.binding('timer_wrap').Timer;
var L = require('_linklist');
var assert = require('assert').ok;

// Timeout values > TIMEOUT_MAX are set to 1.
var TIMEOUT_MAX = 2147483647; // 2^31-1

var debug;
if (process.env.NODE_DEBUG && /timer/.test(process.env.NODE_DEBUG)) {
  debug = function() { require('util').error.apply(this, arguments); };
} else {
  debug = function() { };
}


// IDLE TIMEOUTS
//
// Because often many sockets will have the same idle timeout we will not
// use one timeout watcher per item. It is too much overhead.  Instead
// we'll use a single watcher for all sockets with the same timeout value
// and a linked list. This technique is described in the libev manual:
// http://pod.tst.eu/http://cvs.schmorp.de/libev/ev.pod#Be_smart_about_timeouts


// 保存所有的 list, timers
// 其中：key = time (毫秒)
//      value = list
var lists = {};

// 初始化的时候，为每个 list 设置一个定时器
function insert(item, msecs) {
  item._idleStart = Date.now();
  item._idleTimeout = msecs;

  if (msecs < 0) return;

  var list;

  if (lists[msecs]) {
    list = lists[msecs];
  } else {
    list = new Timer();
    list.start(msecs, 0);

    L.init(list);

    lists[msecs] = list;

    // 当定时器到时，从头到尾遍历 list ，把所有到时的 timer 都触发，
    // 然后从 list 中删除，遇到未到时的 timer，重新设置一个定时器
    list.ontimeout = function() {
      debug('timeout callback ' + msecs);

      var now = Date.now();
      debug('now: ' + (new Date(now)));

      var first;
      while (first = L.peek(list)) {
        var diff = now - first._idleStart;
        if (diff + 1 < msecs) {
          list.start(msecs - diff, 0);
          debug(msecs + ' list wait because diff is ' + diff);
          return;
        } else {
          L.remove(first);
          assert(first !== L.peek(list));

          if (!first._onTimeout) continue;

          // v0.4 compatibility: if the timer callback throws and the user's
          // uncaughtException handler ignores the exception, other timers that
          // expire on this tick should still run. If #2582 goes through, this
          // hack should be removed.
          //
          // https://github.com/joyent/node/issues/2631
          if (first.domain) {
            if (first.domain._disposed) continue;
            first.domain.enter();
          }
          try {
            first._onTimeout();
          } catch (e) {
            if (!process.listeners('uncaughtException').length) throw e;
            process.emit('uncaughtException', e);
          }
          if (first.domain) first.domain.exit();
        }
      }

      debug(msecs + ' list empty');
      assert(L.isEmpty(list));
      list.close();
      delete lists[msecs];
    };
  }

  L.append(list, item);
  assert(!L.isEmpty(list)); // list is not empty
}


var unenroll = exports.unenroll = function(item) {
  L.remove(item);

  var list = lists[item._idleTimeout];
  // 如果 list 为空，则停止计时器
  debug('unenroll');
  if (list && L.isEmpty(list)) {
    debug('unenroll: list empty');
    list.close();
    delete lists[item._idleTimeout];
  }
  // 如果稍后要执行 active 操作，那么在此要确保不再重复设置定时器
  item._idleTimeout = -1;
};


// 注册对象，但并不启动计时
exports.enroll = function(item, msecs) {
  // 如果该对象已存在于 list 中，则先取消注册对象
  if (item._idleNext) unenroll(item);

  item._idleTimeout = msecs;
  L.init(item);
};


// call this whenever the item is active (not idle)
// it will reset its timeout.
// 所有 timer 按照超时时间分组，所有超时时间相同的 timer 都存放到一个 list 里面，按时间顺序排列
exports.active = function(item) {
  var msecs = item._idleTimeout;
  if (msecs >= 0) {

    var list = lists[msecs];
    if (!list || L.isEmpty(list)) {
      insert(item, msecs);
    } else {
      item._idleStart = Date.now();
      L.append(list, item);
    }
  }
};


/*
 * DOM-style timers
 */


exports.setTimeout = function(callback, after) {
  var timer;

  after *= 1; // coalesce to number or NaN

  if (!(after >= 1 && after <= TIMEOUT_MAX)) {
    after = 1; // schedule on next tick, follows browser behaviour
  }

  timer = new Timeout(after);

  if (arguments.length <= 2) {
    timer._onTimeout = callback;
  } else {
    /*
     * Sometimes setTimeout is called with arguments, EG
     *
     *   setTimeout(callback, 2000, "hello", "world")
     *
     * If that's the case we need to call the callback with
     * those args. The overhead of an extra closure is not
     * desired in the normal case.
     */
    var args = Array.prototype.slice.call(arguments, 2);
    timer._onTimeout = function() {
      callback.apply(timer, args);
    }
  }

  if (process.domain) timer.domain = process.domain;

  exports.active(timer);

  return timer;
};


exports.clearTimeout = function(timer) {
  if (timer && (timer.ontimeout || timer._onTimeout)) {
    timer.ontimeout = timer._onTimeout = null;
    if (timer instanceof Timer || timer instanceof Timeout) {
      timer.close(); // for after === 0
    } else {
      exports.unenroll(timer);
    }
  }
};


exports.setInterval = function(callback, repeat) {
  var timer = new Timer();

  if (process.domain) timer.domain = process.domain;

  repeat *= 1; // coalesce to number or NaN

  if (!(repeat >= 1 && repeat <= TIMEOUT_MAX)) {
    repeat = 1; // schedule on next tick, follows browser behaviour
  }

  var args = Array.prototype.slice.call(arguments, 2);
  timer.ontimeout = function() {
    callback.apply(timer, args);
  }

  timer.start(repeat, repeat);
  return timer;
};


exports.clearInterval = function(timer) {
  if (timer instanceof Timer) {
    timer.ontimeout = null;
    timer.close();
  }
};

var Timeout = function(after) {
  this._idleTimeout = after;
  this._idlePrev = this;
  this._idleNext = this;
  this._when = Date.now() + after;
};

Timeout.prototype.unref = function() {
  if (!this._handle) {
    exports.unenroll(this);
    this._handle = new Timer();
    this._handle.ontimeout = this._onTimeout;
    this._handle.start(this._when - Date.now(), 0);
    this._handle.domain = this.domain;
    this._handle.unref();
  } else {
    this._handle.unref();
  }
};

Timeout.prototype.ref = function() {
  if (this._handle)
    this._handle.ref();
};

Timeout.prototype.close = function() {
  this._onTimeout = null;
  if (this._handle) {
    this._handle.ontimeout = null;
    this._handle.close();
  } else {
    exports.unenroll(this);
  }
};


var immediateTimer = null;
var immediateQueue = { started: false };
L.init(immediateQueue);


function lazyImmediateInit() { // what's in a name?
  if (immediateTimer) return;
  immediateTimer = new Timer;
  immediateTimer.ontimeout = processImmediate;
}


function processImmediate() {
  var immediate;
  if (L.isEmpty(immediateQueue)) {
    immediateTimer.stop();
    immediateQueue.started = false;
  } else {
    immediate = L.shift(immediateQueue);

    if (immediate.domain) immediate.domain.enter();

    immediate._onTimeout();

    if (immediate.domain) immediate.domain.exit();
  }
};


exports.setImmediate = function(callback) {
  var immediate = {}, args;

  L.init(immediate);

  immediate._onTimeout = callback;

  if (arguments.length > 1) {
    args = Array.prototype.slice.call(arguments, 1);
    immediate._onTimeout = function() {
      callback.apply(null, args);
    };
  }

  if (!immediateQueue.started) {
    lazyImmediateInit();
    immediateTimer.start(0, 1);
    immediateQueue.started = true;
  }

  if (process.domain) immediate.domain = process.domain;

  L.append(immediateQueue, immediate);

  return immediate;
};


exports.clearImmediate = function(immediate) {
  if (!immediate) return;

  immediate._onTimeout = undefined;

  L.remove(immediate);

  if (L.isEmpty(immediateQueue)) {
    immediateTimer.stop();
    immediateQueue.started = false;
  }
};
