var common = require('./common')
var DHT = require('../')
var ed = require('ed25519-supercop')
var test = require('tape')

test('backoff algorithm', function (t) {
  t.plan(2)

  var nodes = 9
  var dhts = []
  var pending = 0

  var dht = new DHT({ bootstrap: false, verify: ed.verify })
  common.failOnWarningOrError(t, dht)
  dht.listen(function () {
    for (var i = 0; i < nodes; i++) {
      (function (i) {
        var d = new DHT({ bootstrap: false, verify: ed.verify })
        dhts.push(d)
        common.failOnWarningOrError(t, d)
        pending++
        d.listen(function () {
          if (--pending === 0) addNodes()
        })
      })(i)
    }
  })

  function addNodes() {
    var pending = dhts.length
    dhts.forEach(function (d) {
      d.addNode({ host: '127.0.0.1', port: dht.address().port })
      d.once('node', function () {
        if (--pending === 0) ready()
      })
    })
  }
  t.once('end', function () {
    dht.destroy()
    for (var i = 0; i < dhts.length; i++) {
      dhts[i].destroy()
    }
  })

  function ready() {
    var keypair = ed.createKeyPair(ed.createSeed())
    var value = common.fill(500, 'abc')
    var opts = {
      k: keypair.publicKey,
      sign: common.sign(keypair),
      seq: 0,
      v: value,
      backoff: true
    }
    dht.put(opts, function (err, hash) {
      t.error(err)
      opts.seq++
      dht.put(opts, function (err, hash) {
        t.error(err)
      })
    })

  }

})
