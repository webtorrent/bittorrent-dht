var common = require('./common')
var DHT = require('../')
var ed = require('ed25519-supercop')
var test = require('tape')

test('dht.toJSON: re-use dht nodes with `bootstrap` option', function (t) {
  t.plan(1)

  var dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', function () {
    var dht2 = new DHT({ bootstrap: dht1.toJSON().nodes })

    dht2.on('ready', function () {
      t.deepEqual(dht2.toJSON().nodes, dht1.toJSON().nodes)
      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('dht.toJSON: re-use dht nodes by calling dht.addNode', function (t) {
  t.plan(1)

  var dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', function () {
    var dht2 = new DHT({ bootstrap: false })

    dht1.toJSON().nodes.forEach(function (node) {
      dht2.addNode(node)
    })

    dht2.on('ready', function () {
      t.deepEqual(dht2.toJSON().nodes, dht1.toJSON().nodes)
      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('dht.toJSON: BEP44 immutable value', function (t) {
  t.plan(10)

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function () {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })

  function ready () {
    var value = common.fill(500, 'abc')
    dht1.put(value, function (_, hash) {
      var json1 = dht1.toJSON()
      t.equal(json1.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json1.values[hash.toString('hex')].id, dht1.nodeId.toString('hex'))
      t.equal(json1.values[hash.toString('hex')].seq, undefined)
      t.equal(json1.values[hash.toString('hex')].sig, undefined)
      t.equal(json1.values[hash.toString('hex')].k, undefined)

      var json2 = dht2.toJSON()
      t.equal(json2.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].id, dht1.nodeId.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].seq, undefined)
      t.equal(json2.values[hash.toString('hex')].sig, undefined)
      t.equal(json2.values[hash.toString('hex')].k, undefined)
    })
  }
})

test('dht.toJSON: BEP44 mutable value', function (t) {
  t.plan(10)

  var keypair = ed.createKeyPair(ed.createSeed())
  var dht1 = new DHT({ bootstrap: false, verify: ed.verify })
  var dht2 = new DHT({ bootstrap: false, verify: ed.verify })

  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function () {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })

  function ready () {
    var value = common.fill(500, 'abc')
    var opts = {
      k: keypair.publicKey,
      sign: common.sign(keypair),
      seq: 0,
      v: value
    }

    dht1.put(opts, function (_, hash) {
      var json1 = dht1.toJSON()
      t.equal(json1.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json1.values[hash.toString('hex')].id, dht1.nodeId.toString('hex'))
      t.equal(json1.values[hash.toString('hex')].seq, 0)
      t.equal(typeof json1.values[hash.toString('hex')].sig, 'string')
      t.equal(typeof json1.values[hash.toString('hex')].k, 'string')

      var json2 = dht2.toJSON()
      t.equal(json2.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].id, dht1.nodeId.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].seq, 0)
      t.equal(typeof json2.values[hash.toString('hex')].sig, 'string')
      t.equal(typeof json2.values[hash.toString('hex')].k, 'string')
    })
  }
})
