var inherits = require('inherits');
var Transform = require('readable-stream').Transform;
var Bluebird = require('bluebird');
var reduce = require('stream-reduce');

var STATE = typeof Symbol === 'undefined' ? '@@prat' : Symbol('prat');

module.exports = Prat;
var ID = 0

inherits(Prat, Transform);
function Prat (opts, fn) {
  if (!(this instanceof Prat)) {
    return new Prat(opts, fn);
  }
  if (typeof opts === 'function') {
    fn = opts;
    opts = {concurrency: 1}
  }
  Transform.call(this, {highWaterMark: opts.highWaterMark, objectMode: true});

  this[STATE] = {
    id: ++ID,
    flushCallback: false,
    promises: [],
    concurrency: opts.concurrency,
    transform: this._transformAsync || fn
  };
}

Prat.ctor = function (defaults, fn) {
  if (typeof defaults === 'function') {
    fn = defaults
    defaults = {}
  }

  inherits(Transform, Prat);
  function Transform (opts) {
    if (!(this instanceof Transform)) {
      return new Transform(opts);
    }
    for (var k in defaults) if (!(k in opts)) opts[k] = defaults[k];
    Prat.call(this, opts);
  }

  Transform.prototype._transformAsync = fn;

  return Transform;
}

Prat.ify = function pratify (stream) {
  stream.map = function (fn) {
    return stream.pipe(Prat(fn));
  };
  return stream;
};

Prat.prototype.map = function (limit, fn) {
  return this.pipe(new Prat(limit, fn));
};

Prat.prototype.reduce = function (init, fn) {
  var self = this;
  return new Bluebird(function (resolve, reject) {
    self
      .pipe(reduce(
        function (memoPromise, value) {
          return memoPromise.then(function (memo) {
            return fn(memo, value);
          });
        },
        Bluebird.resolve(init)
      ))
      .on('data', resolve)
      .on('error', reject);
  });
};

Prat.prototype['@@iterator'] = function () {
}

Prat.prototype.tap = function (limit, fn) {
  return this.pipe(new Prat(limit, function (item) {
    return Bluebird.resolve(fn(item)).return(item);
  }));
};

Prat.prototype._transform = function (value, encoding, callback) {
  var self = this;
  var state = self[STATE];

  var promise = Bluebird.resolve(value).then(state.transform);

  promise.catch(function (error) {
    // swallow errors, they will be emitted by `handleSettled`
  }).then(function () {
    handleSettled(self);
  }).done(); // allow handleSettled to throw on unhandled 'error' events

  if (state.promises.push(promise) < state.concurrency) {
    // we want to transform another chunk right away
    callback();
  } else {
    // wait for the currently "blocking" promise to resolve before proceeding
    state.promises[0].finally(function () {
      callback();
    });
  }
};

function handleSettled (stream) {
  var state = stream[STATE];
  var promises = state.promises;

  while (promises.length && !promises[0].isPending()) {
    var promise = promises.shift();

    if (promise.isFulfilled()) {
      stream.push(promise.value());
    } else {
      stream.emit('error', promise.reason());
    }
  }

  if (state.flushCallback && !promises.length) {
    state.flushCallback();
  }
}

Prat.prototype._flush = function (cb) {
  var self = this;
  var state = self[STATE];

  if (state.promises.length) {
    state.flushCallback = cleanup
  } else {
    cleanup()
  }

  function cleanup (err) {
    self[STATE] = null;
    cb(err);
  }
};

function onSuccess (stream, queue, promise, value) {
  var i = queue.indexOf(promise);
  if (i === 0) {
    // Front of the queue, push value immediately and exit
    return pushValue();
  }

  // Wait for preceding promise before pushing
  queue[i] = queue[i - 1].then(function () {
    var i = queue.indexOf(promise)
    if (i < 0) {
      return;
    }
    if (i === 0) {
      pushValue();
    } else {
      queue[i] = queue[i - 1].then(pushValue)
    }
  });

  function pushValue () {
    assert(promise === queue[0],
           'Can only proceed when promise is at front of queue');
    queue.shift();
    stream.push(value);
    if (!queue.length) {
      stream.emit('__queue_cleared__');
    }
  }
}
