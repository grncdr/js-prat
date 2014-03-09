var through = require('through2')

module.exports = prat

function prat (fn) {
  return prat.ify(through.obj(function (promise, _, next) {
    this.push(promise.then(fn))
    next()
  }))
}

prat.ify = function pratify (stream) {
  stream.then = function (fn) {
    return stream.pipe(prat(fn))
  }
  return stream
}
