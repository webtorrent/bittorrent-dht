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
  t.plan(5)

  var dht = new DHT({ bootstrap: false })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    var value = common.fill(500, 'abc')
    dht.put({ v: value }, function (_, hash) {
      var json = dht.toJSON()
      t.equal(json.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json.values[hash.toString('hex')].id, dht.nodeId.toString('hex'))
      t.equal(json.values[hash.toString('hex')].seq, undefined)
      t.equal(json.values[hash.toString('hex')].sig, undefined)
      t.equal(json.values[hash.toString('hex')].k, undefined)
    })
  })
})

test('dht.toJSON: BEP44 mutable value', function (t) {
  t.plan(5)

  var keypair = ed.createKeyPair(ed.createSeed())

  var dht = new DHT({ bootstrap: false, verify: ed.verify })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    var value = common.fill(500, 'abc')
    var opts = {
      k: keypair.publicKey,
      sign: common.sign(keypair),
      seq: 0,
      v: value
    }

    dht.put(opts, function (_, hash) {
      var json = dht.toJSON()
      t.equal(json.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json.values[hash.toString('hex')].id, dht.nodeId.toString('hex'))
      t.equal(json.values[hash.toString('hex')].seq, 0)
      t.equal(typeof json.values[hash.toString('hex')].sig, 'string')
      t.equal(typeof json.values[hash.toString('hex')].k, 'string')
    })
  })
})
