var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('explicitly set nodeId', function (t) {
  var nodeId = common.randomId()

  var dht = new DHT({
    nodeId: nodeId,
    bootstrap: false
  })

  common.failOnWarningOrError(t, dht)

  t.equal(dht.nodeId, nodeId)
  t.end()
})

test('`ping` query send and response', function (t) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function () {
    dht2._sendPing('127.0.0.1:' + dht1.address().port, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)

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

  dht1.addNode('255.255.255.255:6969', targetNodeId)

  dht1.listen(function () {
    dht2._sendFindNode('127.0.0.1:' + dht1.address().port, targetNodeId, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)
      t.deepEqual(
        res.nodes.map(function (node) { return node.addr }),
        [ '255.255.255.255:6969', '127.0.0.1:' + dht2.address().port ]
      )

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

  dht1.addNode('1.1.1.1:6969', common.randomId())
  dht1.addNode('10.10.10.10:6969', common.randomId())
  dht1.addNode('255.255.255.255:6969', common.randomId())

  dht1.listen(function () {
    var targetNodeId = common.randomId()
    dht2._sendFindNode('127.0.0.1:' + dht1.address().port, targetNodeId, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)
      t.deepEqual(
        res.nodes.map(function (node) { return node.addr }).sort(),
        [ '1.1.1.1:6969', '10.10.10.10:6969', '127.0.0.1:' + dht2.address().port,
          '255.255.255.255:6969' ]
      )

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

  dht1.addNode('1.1.1.1:6969', common.randomId())
  dht1.addNode('2.2.2.2:6969', common.randomId())

  dht1.listen(function () {
    var targetInfoHash = common.randomId()
    dht2._sendGetPeers('127.0.0.1:' + dht1.address().port, targetInfoHash, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res.token))
      t.deepEqual(
        res.nodes.map(function (node) { return node.addr }).sort(),
        [ '1.1.1.1:6969', '127.0.0.1:' + dht2.address().port, '2.2.2.2:6969' ]
      )

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

  dht1._addPeer('1.1.1.1:6969', targetInfoHash)
  dht1._addPeer('10.10.10.10:6969', targetInfoHash)
  dht1._addPeer('255.255.255.255:6969', targetInfoHash)

  dht1.listen(function () {
    dht2._sendGetPeers('127.0.0.1:' + dht1.address().port, targetInfoHash, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res.token))
      t.deepEqual(
        res.values.sort(),
        ['1.1.1.1:6969', '10.10.10.10:6969', '255.255.255.255:6969']
      )

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
    var token = new Buffer('bad token')
    dht2._sendAnnouncePeer('127.0.0.1:' + dht1.address().port, infoHash, 9999, token, function (err, res) {
      t.ok(err, 'got error')
      t.ok(err.message.indexOf('bad token') !== -1)

      dht1.destroy()
      dht2.destroy()
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
    dht2._sendGetPeers('127.0.0.1:' + port, infoHash, function (err, res1) {
      t.error(err)
      t.deepEqual(res1.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res1.token))

      dht2._sendAnnouncePeer('127.0.0.1:' + port, infoHash, 9999, res1.token, function (err, res2) {
          t.error(err)
          t.deepEqual(res2.id, dht1.nodeId)

          dht1.destroy()
          dht2.destroy()
        }
      )
    })
  })
})
