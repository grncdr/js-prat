/// <reference path="typings/tsd.d.ts" />

import stream = require('stream')
import Bluebird = require('bluebird');
import events = require('events');

var inherits = <(c: Function, p: Function) => c> require('inherits');


/* istanbul ignore next */
var STATE = typeof Symbol === 'undefined' ? '@@pratState' : new Symbol('pratState');

export = Prat

interface Opts {
    concurrency?: number;
    highWaterMark?: number;
}

interface State<T> {
    promises: Bluebird<T>[];
    concurrency: number;
    transform: (it) => T | Bluebird<T>;
    flushCallback: (error: Error) => void;
}

class Prat<T> extends stream.Transform implements stream.Readable, events.EventEmitter {
    // This property is only used when for extending the Prat constructor
    _transformAsync: (it) => T | Bluebird<T>;

    // This declaration is required for compatibility with stream.Readable
    _read: (count?: number) => void;

    constructor(opts: Opts, fn: (it) => T | Bluebird<T>) {
        if (!(this instanceof Prat)) {
            return new Prat<T>(opts, fn);
        }

        if (typeof opts === 'function') {
            fn = <(it) => T | Bluebird<T>> opts;
            opts = { concurrency: 1 };
        }

        super({ highWaterMark: opts.highWaterMark, objectMode: true });

        this[STATE] = {
            flushCallback: null,
            promises: [],
            concurrency: opts.concurrency,
            transform: this._transformAsync || fn
        }
    }

    static ctor <U> (defaults, fn: (it) => U | Bluebird<U>) {
        if (typeof defaults === 'function') {
            fn = defaults;
            defaults = {};
        }

        function Constructor (opts?: Opts) : void {
            if (!(this instanceof Constructor)) {
                return new Constructor(opts);
            }
            opts = opts || {};
            for (var k in defaults) if (!(k in opts)) opts[k] = defaults[k];
            Prat.call(this, opts);
        }

        Constructor.prototype = Object.create(Prat.prototype, {
            constructor: { value: Constructor },
            _transformAsync: { value: fn }
        });

        return Constructor;
    }

    static ify <U> (stream: stream.Readable) : Prat<U> {
        var idStream = new IdStream<U>();

        stream.on('error', idStream.emit.bind(idStream, 'error'));

        return stream.pipe(idStream);
    }

    static reduce <U> (stream: stream.Readable, init: U, fn: (memo: U, chunk: any) => U | Promise<U>) : Promise<U> {
        var promise = Bluebird.resolve(init);

        function step () {
            var v = stream.read();
            if (v !== null) {
                promise = promise.then(function (memo) {
                    return <U> fn(memo, v);
                }).tap(step)
            }
        }

        return new Bluebird<U>(function(resolve, reject) {
            stream.on('error', reject);
            stream.on('readable', step);
            stream.on('end', function () {
                resolve(promise);
            })
        });
    }

    map<U>(opts: Opts, fn: (it: T) => U | Promise<U>): Prat<U> {
        return this.pipe(new Prat<U>(opts, fn));
    }

    filter(opts, fn: (it: T) => boolean|Promise<boolean>) : Prat<T> {
        if (typeof opts === 'function') {
            fn = opts;
            opts = {};
        }

        return this.map(opts, function(item) {
            return Bluebird.resolve(fn(item)).then(function(keep) {
                if (keep) {
                    return item;
                }
            });
        });
    }

    reduce<U>(init: U, fn: (memo: U, it: T) => U | Promise<U>) {
        return Prat.reduce(this, init, fn);
    }

    _transform(value, encoding, callback) {
        var self = this;
        var state = getState(self);

        var promise = <Promise<T>> Bluebird.resolve(value).then(state.transform);

        promise.catch(function(ignoredError) {
            // swallow errors, they will be emitted by `handleSettled`
        }).then(function() {
            handleSettled(self)
        }).done();
        // ^------ allow handleSettled to throw on unhandled 'error' events

        if (state.promises.push(promise) < state.concurrency) {
            // we want to transform another chunk right away
            callback();
        } else {
            // wait for the currently "blocking" promise to resolve before proceeding
            state.promises[0].finally(function() {
                callback();
            })
        }
    }


    _flush(cb) {
        var self = this;
        var state = getState(self);

        if (state.promises.length) {
            state.flushCallback = cleanup;
        } else {
            cleanup(null);
        }

        function cleanup(err) {
            cb(err);
        }
    }
}

function getState<T>(stream: Prat<T>): State<T> {
    return <State<T>> stream[STATE];
}

function handleSettled<T>(stream: Prat<T>) {
    var state = getState(stream);
    var promises = state.promises;

    while (promises.length && !promises[0].isPending()) {
        var promise = promises.shift();

        if (promise.isFulfilled()) {
            var value = promise.value();
            if (void (0) !== value) {
                stream.push(value);
            }
        } else {
            stream.emit('error', promise.reason());
        }
    }

    if (state.flushCallback && !promises.length) {
        state.flushCallback(null);
    }
}

class IdStream<T> extends Prat<T> {
    constructor() {
        super({}, (x) => x);
    }
}