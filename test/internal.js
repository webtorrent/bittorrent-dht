var Buffer = require('safe-buffer').Buffer
var common = require('./common')
var DHT = require('../')
var test = require('tape')

common.wrapTest(test, '`ping` query send and response', function (t, ipv6) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var dht2 = new DHT({ bootstrap: false, ipv6: ipv6 })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function () {
    dht2._rpc.query({
      host: common.localHost(ipv6, true),
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

common.wrapTest(test, '`find_node` query for exact match (with one in table)', function (t, ipv6) {
  t.plan(3)
  var targetNodeId = common.randomId()

  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var dht2 = new DHT({ bootstrap: false, ipv6: ipv6 })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({host: common.randomHost(ipv6), port: 6969, id: targetNodeId})

  dht1.listen(function () {
    dht2._rpc.query({
      host: common.localHost(ipv6, true),
      port: dht1.address().port
    }, {
      q: 'find_node',
      a: {target: targetNodeId}
    }, function (err, res) {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.deepEqual(getNodes(res, ipv6).length, 2 * getNodeLength(ipv6))

      dht1.destroy()
      dht2.destroy()
    })
  })
})

common.wrapTest(test, '`find_node` query (with many in table)', function (t, ipv6) {
  t.plan(3)
  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var dht2 = new DHT({ bootstrap: false, ipv6: ipv6 })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({host: common.randomHost(ipv6), port: 6969, id: common.randomId()})
  dht1.addNode({host: common.randomHost(ipv6), port: 6969, id: common.randomId()})
  dht1.addNode({host: common.randomHost(ipv6), port: 6969, id: common.randomId()})

  dht1.listen(function () {
    var targetNodeId = common.randomId()
    dht2._rpc.query({
      host: common.localHost(ipv6, true),
      port: dht1.address().port
    }, {
      q: 'find_node',
      a: {target: targetNodeId}
    }, function (err, res) {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.deepEqual(getNodes(res, ipv6).length, getNodeLength(ipv6) * 4)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

common.wrapTest(test, '`get_peers` query to node with *no* peers in table', function (t, ipv6) {
  t.plan(4)
  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var dht2 = new DHT({ bootstrap: false, ipv6: ipv6 })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({host: common.randomHost(ipv6), port: 6969, id: common.randomId()})
  dht1.addNode({host: common.randomHost(ipv6), port: 6969, id: common.randomId()})

  dht1.listen(function () {
    var targetInfoHash = common.randomId()
    dht2._rpc.query({
      host: common.localHost(ipv6, true),
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
      t.deepEqual(getNodes(res, ipv6).length, 3 * getNodeLength(ipv6))

      dht1.destroy()
      dht2.destroy()
    })
  })
})

common.wrapTest(test, '`get_peers` query to node with peers in table', function (t, ipv6) {
  t.plan(4)

  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var dht2 = new DHT({ bootstrap: false, ipv6: ipv6 })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var targetInfoHash = common.randomId()

  dht1._addPeer({ host: common.randomHost(ipv6), port: 6969 }, targetInfoHash)
  dht1._addPeer({ host: common.randomHost(ipv6), port: 6969 }, targetInfoHash)
  dht1._addPeer({ host: common.randomHost(ipv6), port: 6969 }, targetInfoHash)

  dht1.listen(function () {
    dht2._rpc.query({
      host: common.localHost(ipv6, true),
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

common.wrapTest(test, '`announce_peer` query with bad token', function (t, ipv6) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var dht2 = new DHT({ bootstrap: false, ipv6: ipv6 })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var infoHash = common.randomId()

  dht1.listen(function () {
    var token = Buffer.from('bad token')
    dht2._rpc.query({
      host: common.localHost(ipv6, true),
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

common.wrapTest(test, '`announce_peer` query gets ack response', function (t, ipv6) {
  t.plan(5)

  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var dht2 = new DHT({ bootstrap: false, ipv6: ipv6 })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var infoHash = common.randomId()

  dht1.listen(function () {
    var port = dht1.address().port
    dht2._rpc.query({
      host: common.localHost(ipv6, true),
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
        host: common.localHost(ipv6, true),
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

function getNodes (res, ipv6) {
  return ipv6 ? res.r.nodes6 : res.r.nodes
}

function getNodeLength (ipv6) {
  // 20 byte node id + 2 byte port (22 bytes total)
  // 16-byte IPv6 address, or 4-byte IPv4 address
  return 22 + (ipv6 ? 16 : 4)
}
