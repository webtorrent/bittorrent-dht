var Buffer = require('safe-buffer').Buffer
var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('`ping` query send and response', function (t) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function () {
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'ping'
    }, function (err, res) {
      t.error(err)
      t.deepEqual(res.r.id, dht1.nodeId)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`find_node` query for exact match (with one in table)', function (t) {
  t.plan(3)
  var targetNodeId = common.randomId()

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({host: '255.255.255.255', port: 6969, id: targetNodeId})

  dht1.listen(function () {
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'find_node',
      a: {target: targetNodeId}
    }, function (err, res) {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.deepEqual(res.r.nodes.length, 2 * 26)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`find_node` query (with many in table)', function (t) {
  t.plan(3)
  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({host: '1.1.1.1', port: 6969, id: common.randomId()})
  dht1.addNode({host: '10.10.10.10', port: 6969, id: common.randomId()})
  dht1.addNode({host: '255.255.255.255', port: 6969, id: common.randomId()})

  dht1.listen(function () {
    var targetNodeId = common.randomId()
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'find_node',
      a: {target: targetNodeId}
    }, function (err, res) {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.deepEqual(res.r.nodes.length, 26 * 4)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`get_peers` query to node with *no* peers in table', function (t) {
  t.plan(4)
  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({host: '1.1.1.1', port: 6969, id: common.randomId()})
  dht1.addNode({host: '2.2.2.2', port: 6969, id: common.randomId()})

  dht1.listen(function () {
    var targetInfoHash = common.randomId()
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'get_peers',
      a: {
        info_hash: targetInfoHash
      }
    }, function (err, res) {
      t.error(err)
      t.deepEqual(res.r.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res.r.token))
      t.deepEqual(res.r.nodes.length, 3 * 26)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`get_peers` query to node with peers in table', function (t) {
  t.plan(4)

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var targetInfoHash = common.randomId()

  dht1._addPeer({ host: '1.1.1.1', port: 6969 }, targetInfoHash)
  dht1._addPeer({ host: '10.10.10.10', port: 6969 }, targetInfoHash)
  dht1._addPeer({ host: '255.255.255.255', port: 6969 }, targetInfoHash)

  dht1.listen(function () {
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'get_peers',
      a: {
        info_hash: targetInfoHash
      }
    }, function (err, res) {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res.r.token))
      t.deepEqual(res.r.values.length, 3)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`announce_peer` query with bad token', function (t) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var infoHash = common.randomId()

  dht1.listen(function () {
    var token = Buffer.from('bad token')
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'announce_peer',
      a: {
        info_hash: infoHash,
        port: 9999,
        token: token
      }
    }, function (err, res) {
      t.ok(err, 'got error')
      t.ok(err.message.indexOf('bad token') !== -1)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`announce_peer` with bad port', function (t) {
  t.plan(1)

  var dht1 = new DHT({ bootstrap: false })
  dht1.listen(function () {
    var dht2 = new DHT({ bootstrap: '127.0.0.1:' + dht1.address().port, timeout: 100 })
    var infoHash = common.randomId()

    dht2.announce(infoHash, 99999, function (err) {
      dht1.destroy()
      dht2.destroy()
      t.ok(err, 'had error')
    })
  })
})

test('`announce_peer` query gets ack response', function (t) {
  t.plan(5)

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var infoHash = common.randomId()

  dht1.listen(function () {
    var port = dht1.address().port
    dht2._rpc.query({
      host: '127.0.0.1',
      port: port
    }, {
      q: 'get_peers',
      a: {
        info_hash: infoHash
      }
    }, function (err, res1) {
      t.error(err)

      t.deepEqual(res1.r.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res1.r.token))

      dht2._rpc.query({
        host: '127.0.0.1',
        port: port
      }, {
        q: 'announce_peer',
        a: {
          info_hash: infoHash,
          port: 9999,
          token: res1.r.token
        }
      }, function (err, res2) {
        t.error(err)
        t.deepEqual(res2.r.id, dht1.nodeId)

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})
