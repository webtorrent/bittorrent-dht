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
    var value = Buffer(500).fill('abc')
    dht.put({ v: value }, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        '3ab87d68b1be9dc63da13faf18a7d2376ccd938a' // sha1 of the value
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
  t.plan(3)

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
    dht2.addNode('127.0.0.1:' + dht1.address().port)
    dht2.once('node', ready)
  })
  dht2.listen(function () {
    dht1.addNode('127.0.0.1:' + dht2.address().port)
    dht1.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    var value = Buffer(500).fill('abc')
    dht1.put({ v: value }, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        '3ab87d68b1be9dc63da13faf18a7d2376ccd938a' // sha1 of the value
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
