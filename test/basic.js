var compact2string = require('compact2string')
var DHT = require('../')
var hat = require('hat')
var portfinder = require('portfinder')
var Server = require('../').Server
var test = require('tape')

test('`ping` query send and response', function (t) {
  t.plan(3)
  var dht1 = new DHT({ bootstrap: [] })
  var dht2 = new DHT({ bootstrap: [] })

  dht1.on('warning', function (err) { t.fail(err) })
  dht2.on('warning', function (err) { t.fail(err) })

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht1.listen(port, function () {
      dht2._sendPing('127.0.0.1', port, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`find_node` query for exact match (with one in table)', function (t) {
  t.plan(4)
  var targetNodeId = new Buffer(hat(160), 'hex')

  var dht1 = new DHT({ bootstrap: [] })
  var dht2 = new DHT({ bootstrap: [] })

  dht1.on('warning', function (err) { t.fail(err) })
  dht2.on('warning', function (err) { t.fail(err) })

  dht1.addNode('255.255.255.255:6969', targetNodeId)

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht1.listen(port, function () {
      dht2._sendFindNode('127.0.0.1', port, targetNodeId, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)
        t.deepEqual(
          res.nodes.map(function (node) { return node.addr }),
          [ '255.255.255.255:6969' ]
        )

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`find_node` query (with many in table)', function (t) {
  t.plan(4)
  var dht1 = new DHT({ bootstrap: [] })
  var dht2 = new DHT({ bootstrap: [] })

  dht1.on('warning', function (err) { t.fail(err) })
  dht2.on('warning', function (err) { t.fail(err) })

  dht1.addNode('1.1.1.1:6969', new Buffer(hat(160), 'hex'))
  dht1.addNode('10.10.10.10:6969', new Buffer(hat(160), 'hex'))
  dht1.addNode('255.255.255.255:6969', new Buffer(hat(160), 'hex'))

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht1.listen(port, function () {
      var targetNodeId = new Buffer(hat(160), 'hex')
      dht2._sendFindNode('127.0.0.1', port, targetNodeId, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)
        t.deepEqual(
          res.nodes.map(function (node) { return node.addr }).sort(),
          [ '1.1.1.1:6969', '10.10.10.10:6969', '255.255.255.255:6969' ]
        )

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`get_peers` query to node with *no* peers in table', function (t) {
  t.plan(5)
  var dht1 = new DHT({ bootstrap: [] })
  var dht2 = new DHT({ bootstrap: [] })

  dht1.on('warning', function (err) { t.fail(err) })
  dht2.on('warning', function (err) { t.fail(err) })

  dht1.addNode('1.1.1.1:6969', new Buffer(hat(160), 'hex'))
  dht1.addNode('2.2.2.2:6969', new Buffer(hat(160), 'hex'))

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht1.listen(port, function () {
      var targetInfoHash = new Buffer(hat(160), 'hex')
      dht2._sendGetPeers('127.0.0.1', port, targetInfoHash, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)
        t.ok(Buffer.isBuffer(res.token))
        t.deepEqual(
          res.nodes.map(function (node) { return node.addr }).sort(),
          [ '1.1.1.1:6969', '2.2.2.2:6969' ]
        )

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`get_peers` query to node with peers in table', function (t) {
  t.plan(5)

  var dht1 = new DHT({ bootstrap: [] })
  var dht2 = new DHT({ bootstrap: [] })

  dht1.on('warning', function (err) { t.fail(err) })
  dht2.on('warning', function (err) { t.fail(err) })

  var targetInfoHash = new Buffer(hat(160), 'hex')

  dht1.addPeer('1.1.1.1:6969', targetInfoHash)
  dht1.addPeer('10.10.10.10:6969', targetInfoHash)
  dht1.addPeer('255.255.255.255:6969', targetInfoHash)

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht1.listen(port, function () {
      dht2._sendGetPeers('127.0.0.1', port, targetInfoHash, function (err, res) {
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
})

test('`announce_peer` query with bad token', function (t) {
  t.plan(3)
  portfinder.getPort(function (err, port) {
    t.error(err)

    var dht1 = new DHT({ bootstrap: [] })
    var dht2 = new DHT({ bootstrap: [] })

    dht1.on('warning', function (err) { t.fail(err) })
    dht2.on('warning', function (err) { t.fail(err) })

    var infoHash = new Buffer(hat(160), 'hex')

    dht1.listen(port, function () {
      var token = new Buffer('bad token')
      dht2._sendAnnouncePeer('127.0.0.1', port, infoHash, 9999, token, function (err, res) {
        t.ok(err, 'got error')
        t.ok(err.message.indexOf('bad token') !== -1)

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`announce_peer` query gets ack response', function (t) {
  t.plan(6)

  var dht1 = new DHT({ bootstrap: [] })
  var dht2 = new DHT({ bootstrap: [] })

  dht1.on('warning', function (err) { t.fail(err) })
  dht2.on('warning', function (err) { t.fail(err) })

  var infoHash = new Buffer(hat(160), 'hex')
  var host = '127.0.0.1'

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht1.listen(port, function () {
      dht2._sendGetPeers(host, port, infoHash, function (err, res1) {
        t.error(err)
        t.deepEqual(res1.id, dht1.nodeId)
        t.ok(Buffer.isBuffer(res1.token))

        dht2._sendAnnouncePeer(host, port, infoHash, 9999, res1.token, function (err, res2) {
            t.error(err)
            t.deepEqual(res1.id, dht1.nodeId)

            dht1.destroy()
            dht2.destroy()
          }
        )
      })
    })
  })
})


test('Find nodes (Pride & Prejudice)', function (t) {
  t.plan(2)

  var infoHash = '1E69917FBAA2C767BCA463A96B5572785C6D8A12' // Pride & Prejudice

  var dht = new DHT()
  dht.lookup(infoHash)

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
  })

  dht.once('peer', function (peer) {
    t.pass('Found at least one peer that has the file')
    dht.destroy()
  })
})
