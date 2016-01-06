var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('local immutable put/get', function (t) {
  t.plan(3)

  var dht = new DHT({ bootstrap: false })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    var value = fill(500, 'abc')
    dht.put({ v: value }, function (_, hash) {
      t.equal(
        hash.toString('hex'),
        '3a34a097641348623d123acfba3aa589028f241e' // sha1 of the value
      )
      dht.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), value.toString('utf8'),
          'got back what we put in'
        )
      })
    })
  })
})

test('multi-party immutable put/get', function (t) {
  t.plan(4)

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })
  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var pending = 2
  dht1.listen(function () {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })
  dht2.listen(function () {
    dht1.addNode({ host: '127.0.0.1', port: dht2.address().port })
    dht1.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    var value = fill(500, 'abc')
    dht1.put({ v: value }, function (err, hash) {
      t.error(err)

      t.equal(
        hash.toString('hex'),
        '3a34a097641348623d123acfba3aa589028f241e' // sha1 of the value
      )

      dht2.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), value.toString('utf8'),
          'got back what we put in on another node'
        )
      })
    })
  }
})

function fill (n, s) {
  var bs = Buffer(s)
  var b = new Buffer(n)
  for (var i = 0; i < n; i++) {
    b[i] = bs[i % bs.length]
  }
  return b
}
