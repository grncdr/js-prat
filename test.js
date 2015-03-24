'use strict'
var Bluebird = require('bluebird')
var from = require('from2')
var test = require('blue-tape')

var prat = require('./')

function append (array, value) {
  array.push(value)
  return array
}

test('Sync transform', function (t) {
  return from.obj(['a', 'b', 'c', 'd']).pipe(prat(function (letter) {
    return letter.toUpperCase()
  })).reduce([], append).then(function (result) {
    t.deepEqual(result, ['A', 'B', 'C', 'D'])
  })
})

test('Async transform', function (t) {
  return from.obj(['a', 'b', 'c', 'd'])
    .pipe(prat(Bluebird.resolve))
    .map(function (letter) {
      return letter.toUpperCase()
    })
    .reduce([], append)
    .then(function (result) {
      t.deepEqual(result, ['A', 'B', 'C', 'D'])
    })
})

test('Dropping', function (t) {
  return from.obj([1, 2, 3, 4, 5, 6])
    .pipe(prat(function (n) {
      if (n % 3 === 0) {
        return n
      }
    }))
    .reduce([], append)
    .then(function (result) {
      t.deepEqual(result, [3, 6])
    })
})

test('Async concurrency', function (t) {
  var delay = 300
  return from.obj([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).pipe(prat({concurrency: 3}, function (n) {
    return Bluebird.resolve(n * 2).delay(delay -= 30)
  }))
  .reduce([], append)
  .then(function (result) {
    t.deepEqual(result, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
  })
})

test('Async errors', function (t) {
  var result = []
  return new Bluebird(function (resolve) {
    from.obj([1, 2, 3, 4]).pipe(prat({concurrency: 2}, function (n) {
      if (n === 3) {
        throw new Error('oh noes!')
      }
      return n
    })).on('data', function (n) {
      result.push(n)
    }).on('error', function (error) {
      t.equal(error.message, 'oh noes!')
      t.deepEqual(result, [1, 2])
      resolve()
    })
  })
})

test('prat.ify', function (t) {
  return prat.ify(from.obj([1, 2, 3])).reduce(0, function (total, value) {
    return total + value
  }).then(function (total) {
    t.equal(total, 6)
  })
})

test('Prat#filter', function (t) {
  return prat.ify(from.obj([1, 2, 3, 4, 5]))
    .filter(function (n) {
      return n % 2 === 0
    })
    .reduce([], append)
    .then(function (result) {
      t.deepEqual(result, [2, 4])
    })
})

test('Prat#filter (async)', function (t) {
  return prat.ify(from.obj([1, 2, 3, 4, 5]))
    .filter({concurrency: 10}, function (n) {
      return Bluebird.resolve(n % 2 === 0).delay(100)
    })
    .reduce([], append)
    .then(function (result) {
      t.deepEqual(result, [2, 4])
    })
})

test('prat.ctor', function (t) {
  var tripler = prat.ctor(function (v) {
    return Bluebird.resolve(v * 3)
  })

  return from.obj([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .pipe(tripler({concurrency: 3}))
    .reduce([], append)
    .then(function (result) {
      t.deepEqual(result, [3, 6, 9, 12, 15, 18, 21, 24, 27, 30])
    })
})

test('prat.ctor with defaults', function (t) {
  var tripler = prat.ctor({ concurrency: 3 }, function (v) {
    return Bluebird.resolve(v * 3)
  })

  return from.obj([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .pipe(tripler())
    .reduce([], append)
    .then(function (result) {
      t.deepEqual(result, [3, 6, 9, 12, 15, 18, 21, 24, 27, 30])
    })
})

test('prat.ctor with defaults & override', function (t) {
  var tripler = prat.ctor({ concurrency: 3 }, function (v) {
    return Bluebird.resolve(v * 3)
  })

  return from.obj([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .pipe(tripler({ concurrency: 5 }))
    .reduce([], append)
    .then(function (result) {
      t.deepEqual(result, [3, 6, 9, 12, 15, 18, 21, 24, 27, 30])
    })
})
