var common = require('./common')
var DHT = require('../')
var ed = require('ed25519-supercop')
var test = require('tape')
var crypto = require('crypto')

test('local return number of nodes with item', function (t) {
  t.plan(2)

  var keypair = ed.createKeyPair(ed.createSeed())

  var dht1 = new DHT({ bootstrap: false, verify: ed.verify })
  var dht2 = new DHT({ bootstrap: false, verify: ed.verify })
  var dht3 = new DHT({ bootstrap: false, verify: ed.verify })
  var dht4 = new DHT({ bootstrap: false, verify: ed.verify })

  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
    dht3.destroy()
    dht4.destroy()
  })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)
  common.failOnWarningOrError(t, dht3)
  common.failOnWarningOrError(t, dht4)

  var pending = 4
  dht1.listen(function () {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })

  dht2.listen(function () {
    dht1.addNode({ host: '127.0.0.1', port: dht2.address().port })
    dht1.once('node', ready)
  })

  dht3.listen(function () {
    dht4.addNode({ host: '127.0.0.1', port: dht3.address().port })
    dht4.once('node', ready)
  })

  dht4.listen(function () {
    dht3.addNode({ host: '127.0.0.1', port: dht4.address().port })
    dht3.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    var value = common.fill(500, 'abc')
    var opts = {
      k: keypair.publicKey,
      seq: 0,
      sign: common.sign(keypair),
      v: value,
      backoff: true
    }

    dht1.put(opts, function (err, hash) {
      t.error(err)
      opts.seq++;
      dht2.put(opts, function (err, hash) {
        t.error(err)
      })

    })
  }
})
