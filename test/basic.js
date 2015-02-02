var common = require('./common')
var DHT = require('../')
var test = require('tape')
var Chance = require('chance')

test('`ping` query send and response', function (t) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function (port) {
    dht2._sendPing('127.0.0.1:' + port, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`find_node` query for exact match (with one in table)', function (t) {
  t.plan(3)

  var targetAddr = '255.255.255.255:6969'
  var targetNodeId = DHT.generateNodeId(targetAddr)

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode(targetAddr, targetNodeId)

  dht1.listen(function (port) {
    dht2._sendFindNode('127.0.0.1:' + port, targetNodeId, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)
      t.deepEqual(
        res.nodes.map(function (node) { return node.addr }),
        [ targetAddr, '127.0.0.1:' + dht2.port ]
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

  var addrs = ['1.1.1.1:6969',
               '10.10.10.10:6969',
               '255.255.255.255:6969']

  addrs.forEach(function (addr) {
    dht1.addNode(addr, DHT.generateNodeId(addr))
  })

  dht1.listen(function (port) {
    var targetNodeId = common.randomId()
    dht2._sendFindNode('127.0.0.1:' + port, targetNodeId, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)
      t.deepEqual(
        res.nodes.map(function (node) { return node.addr }).sort(),
        addrs.concat(['127.0.0.1:' + dht2.port]).sort()
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

  var addrs = ['1.1.1.1:6969', '2.2.2.2:6969']

  dht1.addNode(addrs[0], DHT.generateNodeId(addrs[0]))
  dht1.addNode(addrs[1], DHT.generateNodeId(addrs[1]))

  dht1.listen(function (port) {
    var targetInfoHash = common.randomId()
    dht2._sendGetPeers('127.0.0.1:' + port, targetInfoHash, function (err, res) {
      t.error(err)
      t.deepEqual(res.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res.token))
      t.deepEqual(
        res.nodes.map(function (node) { return node.addr }).sort(),
        addrs.concat(['127.0.0.1:' + dht2.port]).sort()
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

  dht1.listen(function (port) {
    dht2._sendGetPeers('127.0.0.1:' + port, targetInfoHash, function (err, res) {
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

  dht1.listen(function (port) {
    var token = new Buffer('bad token')
    dht2._sendAnnouncePeer('127.0.0.1:' + port, infoHash, 9999, token, function (err, res) {
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

  dht1.listen(function (port) {
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

// test vectors at http://www.bittorrent.org/beps/bep_0042.html
test('test vectors for node ID generation', function (t) {
  t.plan(5)

  var ips = ['124.31.75.21',
             '21.75.31.124',
             '65.23.51.170',
             '84.124.73.14',
             '43.213.53.83']

  var randoms = [1, 86, 22, 65, 90]

  var ids = ['5fbfbff10c5d6a4ec8a88e4c6ab4c28b95eee401',
             '5a3ce9c14e7a08645677bbd1cfe7d8f956d53256',
             'a5d43220bc8f112a3d426c84764f8c2a1150e616',
             '1b0321dd1bb1fe518101ceef99462b947a01ff41',
             'e56f6cbf5b7c4be0237986d5243b87aa6d51305a']

  for (var i = 0; i < 5; i++) {
    var prefix = DHT.calculateIdPrefix(ips[i], randoms[i] & 0x7)
    t.ok(DHT.idPrefixMatches(prefix, ids[i]),
      'expected: ' + prefix.toString('hex') +
      'actual id: ' + ids[i].toString('hex'))
  }
})

test('generate and validate node IDs for IPv4 and IPv6', function (t) {
  var numAddresses = 100
  var idsPerAddr = 100
  var chance = new Chance()

  t.plan(1)

  var idsValid = []

  for (var i = 0; i < numAddresses; i++) {
    var addr4 = chance.ip()
    var addr6 = chance.ipv6()

    for (var j = 0; j < idsPerAddr; j++) {
      var id4 = DHT.generateNodeId(addr4)
      idsValid.push(DHT.isValidNodeId(addr4, id4))

      var id6 = DHT.generateNodeId(addr6)
      idsValid.push(DHT.isValidNodeId(addr6, id6))
    }
  }

  t.ok(idsValid.every(function (v) { return v }))
})
