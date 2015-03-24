# prat

![Build Status](https://travis-ci.org/grncdr/js-prat.svg?branch=master)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)

Easy peasy promise-aware transform streams.

## Example

First we'll write a function that returns a promise for a cities local weather:

```javascript
var questor = require('questor');

var baseUri ='http://api.openweathermap.org/data/2.5/weather?units=metric&q=';

function getWeather (city) {
  var uri = baseUri + encodeURIComponent(city);
  return questor(uri).get('body').then(JSON.parse);
}
```

Then we'll pipe some data through it:

```javascript
var prat = require('prat')
var from = require('from2')

var cities = [
  'Berlin,de',
  'Victoria,ca',
  'Las Palmas de Gran Canaria',
  'Tokyo',
  'Paris',
  'Calgary',
  'Phoenix',
  'Johannesburg'
]

var weather = from(cities).pipe(prat(getWeather));
```

By default each item will be processed serially, you can also control maximum number of concurrent operations by passing an options object as the first argument to `prat`:

```javascript
var weather = from(cities).pipe(prat({concurrency: 5}, getWeather));
```

`prat` maintains the ordering of it's inputs even when processing multiple operations concurrently. It will also work just fine with synchronous functions:

```javascript
var concat = require('concat-stream');
var namesAndDescriptions = weather.pipe(prat(function (w) {
  return [w.name, w.main && w.main.temp, w.weather[0].description];
}));
```

Finally, we'll log out our results:

```javascript
namesAndDescriptions.on('data', console.log);
```

## Convenience methods

`prat` exposes a few convenience methods for common streaming operations.

### `prat.ify(stream)`

This is equivalent to `stream.pipe(prat(identity))`. Useful because of the instance methods belowk

### `prat.map(stream, opts?, fn)`

This is equivalent to `stream.pipe(prat(opts, fn))`, but also forwards errors. `fn` may return a promise for each value in the stream.

### `prat.filter(stream, opts?, predicate)`

Equivalent to `prat.map(stream, opts, function (it) { return predicate(it) && it })`, with the caveat that the predicate function may return a promise.

### `prat.reduce(stream, initialValue, reducer)`

Takes an initial value and returns a promise for the result of repeatedly calling `memo = fn(memo, chunk)` for each chunk in the stream. The reducer function can return a promise.

## Instance methods

Transform streams created by `prat` also have instance methods corresponding to each of the convenience methods. E.g. `prat.ify(stream).map(fn)` is the same as `prat.map(stream, fn)`

Using the above we could rewrite our weather example like this:

```javascript
var ws = prat.map(from(cities), getWeather).reduce({}, function (report, w) {
    report[w.name] = w.main && Math.round(w.main.temp) + '° C, ' + w.weather[0].description
    return report;
  })
  .then(console.log);
```

## Errors

Thrown errors and promise rejections will be emitted as normal `'error'` events from the stream. As with all node streams, `'error'` events are **not** forwarded when you pipe to another stream, and unhandled `'error'` events will crash your process.

However, errors *will* be propagated when using [instance methods](#instance-methods) that return a new stream (`.map` and `.filter`). When using `prat.reduce`, any errors in the source stream will cause the promise to be rejected. This means you can chain multiple `map` and `filter` stages before a `reduce` stage, and any errors will be propagated forward to reject the `reduce` promise.

## License

MIT
