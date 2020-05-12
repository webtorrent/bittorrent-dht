var common = require('./common')
var DHT = require('../')
var ed = require('ed25519-supercop')
var test = require('tape')

test('backoff algorithm with > 8 nodes', function (t) {
  // dht1 <---
  //          |---> 9 nodes
  // dht2 <---

  t.plan(2)

  var nodes = 9
  var dhts = []
  var pending = 2

  var dht1 = new DHT({ bootstrap: false, verify: ed.verify })
  var dht2 = new DHT({ bootstrap: false, verify: ed.verify })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(listen)
  dht2.listen(listen)

  function listen () {
    if (--pending !== 0) return
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
  }

  function addNodes () {
    var pending = dhts.length
    dhts.forEach(function (d) {
      d.addNode({ host: '127.0.0.1', port: dht1.address().port })
      d.addNode({ host: '127.0.0.1', port: dht2.address().port })
      d.once('node', function () {
        if (--pending === 0) ready()
      })
    })
  }
  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
    for (var i = 0; i < dhts.length; i++) {
      dhts[i].destroy()
    }
  })

  function ready () {
    var keypair = ed.createKeyPair(ed.createSeed())
    var value = common.fill(500, 'abc')
    var opts = {
      k: keypair.publicKey,
      sign: common.sign(keypair),
      seq: 0,
      v: value,
      backoff: true
    }

    dht1.put(opts, function (err, hash) {
      t.error(err)
      opts.seq++
      var onput = dht1._onput // save the onput function
      dht1._onput = function () {
        t.fail('shouldn\'t put')
        onput.apply(dht1, arguments) // call the original onput function
      }
      dht2.put(opts, function (err, hash) {
        t.error(err)
      })
    })
  }
})

test('backoff algorithm with < 8 nodes', function (t) {
  // dht1 <---
  //          |---> 4 nodes
  // dht2 <---

  t.plan(3)

  var nodes = 4
  var dhts = []
  var pending = 2

  var dht1 = new DHT({ bootstrap: false, verify: ed.verify })
  var dht2 = new DHT({ bootstrap: false, verify: ed.verify })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(listen)
  dht2.listen(listen)

  function listen () {
    if (--pending !== 0) return
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
  }

  function addNodes () {
    var pending = dhts.length
    dhts.forEach(function (d) {
      d.addNode({ host: '127.0.0.1', port: dht1.address().port })
      d.addNode({ host: '127.0.0.1', port: dht2.address().port })
      d.once('node', function () {
        if (--pending === 0) ready()
      })
    })
  }
  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
    for (var i = 0; i < dhts.length; i++) {
      dhts[i].destroy()
    }
  })

  function ready () {
    var keypair = ed.createKeyPair(ed.createSeed())
    var value = common.fill(500, 'abc')
    var opts = {
      k: keypair.publicKey,
      sign: common.sign(keypair),
      seq: 0,
      v: value,
      backoff: true
    }

    dht1.put(opts, function (err, hash) {
      t.error(err)
      opts.seq++
      var onput = dht1._onput // save the onput function
      dht1._onput = function () {
        t.pass('should put')
        onput.apply(dht1, arguments) // call the original onput function
      }
      dht2.put(opts, function (err, hash) {
        t.error(err)
      })
    })
  }
})
