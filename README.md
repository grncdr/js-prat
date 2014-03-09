# prat

Easy peasy promise-aware transform streams.

## Example

First we'll create a source stream emits Promises for the numbers 0 to 9:

```javascript
var Promise = require('bluebird')
var from = require('from')
var reduce = require('stream-reduce')
var prat = require('./')

var source = from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(Promise.resolve))
```

Then we can transform the stream of promises using `prat`:

```javascript
var assert = require('assert')
var through = require('through2')

function double (n) { return n * 2 }

function sumPromises () {
  var total = 0

  return through.obj(function (promisedNumber, _, next) {
    promisedNumber.then(function (n) {
      total += n
      next()
    }, next)
  }, function (done) {
    this.push(total)
    done()
  })
}

var exampleCounter = 0
function checkTotal (n) {
  assert.equal(n, 24)
  console.log('ok - example ' + (++exampleCounter))
}

source
  .pipe(prat(double))
  .pipe(prat(Math.sqrt))
  .pipe(prat(Math.floor))
  .pipe(sumPromises())
  .on('data', checkTotal)
```

## Using `.then` and `prat.ify`

Transform streams created by `prat` have a `.then(fn)` method that is equivalent
to `.pipe(prat(fn))`: for each promise `p` in the stream, a new promise is
created using `p.then(fn)`.

This greatly simplifies stacking up transform streams as the transform functions
don't need to be aware that they are part of a stream at all.

```javascript
source.pipe(prat(double))
  .then(Math.sqrt)
  .then(Math.floor)
  .pipe(sumPromises())
  .on('data', checkTotal)
```

That first `.pipe` call can also be avoided by using `prat.ify`:

```javascript
prat.ify(source)
  .then(double)
  .then(Math.sqrt)
  .then(Math.floor)
  .pipe(sumPromises())
  .on('data', checkTotal)
```

Finally, being able to return a new Promise from `fn` means you can use any
promise-returning function just as easily:

```javascript
var EnterpriseIntegerDoublingServer = {
  double: function (n) {
    return new Promise(function (resolve) {
      setTimeout(resolve.bind(null, n * 2), 500)
    })
  }
}

prat.ify(source)
  .then(EnterpriseIntegerDoublingServer.double)
  .then(Math.sqrt)
  .then(Math.floor)
  .pipe(sumPromises())
  .on('data', checkTotal)
```

In the above example, all the calls to the `EnterpriseIntegerDoublingServer` are
performed in parallel, because the promises are not actually resolved until
`sumPromises()`. If you want to control this behaviour, you can use
[`resolve-promise-stream`](http://npm.im/resolve-promise-stream) to wait on each
individual promise in the stream before continuing.

## License

MIT
