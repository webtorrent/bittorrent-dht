var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('immutable put', function (t) {
  t.plan(4)

  var dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)
  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', function () {
    var dht2 = new DHT({ bootstrap: dht1.toArray() })
    dht2.on('ready', function () {
      var value = Buffer(500).fill('abc')
      dht1.put({ value: value }, function (err, hash) {
        t.ifError(err)
        t.equal(
          hash.toString('hex'),
          '3ab87d68b1be9dc63da13faf18a7d2376ccd938a' // sha1 of the value
        )
        dht2.get(hash, function (err, buf) {
          t.ifError(err)
          t.equal(buf.toString('utf8'), value.toString('utf8'),
            'got back what we put in'
          )
        })
      })
    })
  })
  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })
})
