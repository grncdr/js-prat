# prat

![Build Status](https://travis-ci.org/grncdr/js-prat.svg?branch=master)

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

Transform streams created by `prat` have some convenience methods:

 * `prat.ify(stream)` is equivalent to `stream.pipe(prat(identity))`.
 * `map([limit,] fn)` is equivalent to `pipe(prat(fn))`.
 * `reduce(memo, fn)` takes an initial value and returns a promise for the result of repeatedly calling `memo = fn(memo, chunk)` for each chunk in the stream.
 * `tap` is the same as map, but only inspects objects instead of replacing them.

Using the above we could rewrite our weather example like this:

```javascript
var ws = prat.ify(from(cities)).map(getWeather).reduce({}, function (report, w) {
    report[w.name] = w.main && Math.round(w.main.temp) + '° C, ' + w.weather[0].description
    return report;
  })
  .then(console.log);
```

## Errors

Thrown errors and promise rejections will be emitted as normal `'error'` events from the stream. As with all node streams, `'error'` events are *not* forwarded when you pipe to another stream, and unhandled `'error'` events will crash your process.

## License

MIT
