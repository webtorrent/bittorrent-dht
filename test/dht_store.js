var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('local immutable put', function (t) {
  t.plan(3)

  var dht = new DHT({ bootstrap: false })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    var value = Buffer(500).fill('abc')
    dht.put({ value: value }, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        '3ab87d68b1be9dc63da13faf18a7d2376ccd938a' // sha1 of the value
      )
      dht.get(hash, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString('utf8'), value.toString('utf8'),
          'got back what we put in'
        )
      })
    })
  })
})
