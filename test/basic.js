var auto = require('run-auto')
var compact2string = require('compact2string')
var DHT = require('../')
var hat = require('hat')
var portfinder = require('portfinder')
var Server = require('../').Server
var test = require('tape')

test('`ping` query send and response', function (t) {
  t.plan(3)
  portfinder.getPort(function (err, port) {
    t.error(err)

    var dht1 = new DHT({ bootstrap: [] })
    var dht2 = new DHT({ bootstrap: [] })

    dht1.on('warning', function (err) { t.fail(err) })
    dht2.on('warning', function (err) { t.fail(err) })

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
  portfinder.getPort(function (err, port) {
    t.error(err)

    var targetNodeId = new Buffer(hat(160), 'hex')

    var dht1 = new DHT({ bootstrap: [] })
    var dht2 = new DHT({ bootstrap: [] })

    dht1.on('warning', function (err) { t.fail(err) })
    dht2.on('warning', function (err) { t.fail(err) })

    dht1.addNode(targetNodeId, '255.255.255.255:6969')

    dht1.listen(port, function () {
      dht2._sendFindNode('127.0.0.1', port, targetNodeId, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)
        t.equal(compact2string(res.nodes), '255.255.255.255:6969')

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`find_node` query for exact match (with many in table)', function (t) {
  t.plan(4)
  portfinder.getPort(function (err, port) {
    t.error(err)

    var dht1 = new DHT({ bootstrap: [] })
    var dht2 = new DHT({ bootstrap: [] })

    dht1.on('warning', function (err) { t.fail(err) })
    dht2.on('warning', function (err) { t.fail(err) })

    dht1.addNode(new Buffer(hat(160), 'hex'), '1.1.1.1:6969')
    dht1.addNode(new Buffer(hat(160), 'hex'), '10.10.10.10:6969')
    dht1.addNode(new Buffer(hat(160), 'hex'), '255.255.255.255:6969')

    dht1.listen(port, function () {
      var targetNodeId = new Buffer(hat(160), 'hex')
      dht2._sendFindNode('127.0.0.1', port, targetNodeId, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)
        t.deepEqual(
          compact2string.multi(res.nodes).sort(),
          ['1.1.1.1:6969', '10.10.10.10:6969', '255.255.255.255:6969'].sort()
        )

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`get_peers` query to node with *no* peers in table', function (t) {
  t.plan(5)
  portfinder.getPort(function (err, port) {
    t.error(err)

    var dht1 = new DHT({ bootstrap: [] })
    var dht2 = new DHT({ bootstrap: [] })

    dht1.on('warning', function (err) { t.fail(err) })
    dht2.on('warning', function (err) { t.fail(err) })

    dht1.addNode(new Buffer(hat(160), 'hex'), '1.1.1.1:6969')

    dht1.listen(port, function () {
      var targetInfoHash = new Buffer(hat(160), 'hex')
      dht2._sendGetPeers('127.0.0.1', port, targetInfoHash, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)
        t.ok(Buffer.isBuffer(res.token))
        t.equal(compact2string(res.nodes), '1.1.1.1:6969')

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

test('`get_peers` query to node with peers in table', function (t) {
  t.plan(5)
  portfinder.getPort(function (err, port) {
    t.error(err)

    var dht1 = new DHT({ bootstrap: [] })
    var dht2 = new DHT({ bootstrap: [] })

    dht1.on('warning', function (err) { t.fail(err) })
    dht2.on('warning', function (err) { t.fail(err) })

    var targetInfoHash = new Buffer(hat(160), 'hex')

    dht1.addPeer(targetInfoHash, '1.1.1.1:6969')
    dht1.addPeer(targetInfoHash, '10.10.10.10:6969')
    dht1.addPeer(targetInfoHash, '255.255.255.255:6969')

    dht1.listen(port, function () {
      dht2._sendGetPeers('127.0.0.1', port, targetInfoHash, function (err, res) {
        t.error(err)
        t.deepEqual(res.id, dht1.nodeId)
        t.ok(Buffer.isBuffer(res.token))
        t.deepEqual(
          res.values.map(compact2string),
          ['1.1.1.1:6969', '10.10.10.10:6969', '255.255.255.255:6969']
        )

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})

// var infoHash = '1E69917FBAA2C767BCA463A96B5572785C6D8A12' // Pride & Prejudice

// test('Find nodes (Pride & Prejudice)', function (t) {
//   t.plan(2)

//   // auto({
//   //   port: function (cb) {
//   //     portfinder.getPort(cb)
//   //   },

//   //   server: ['port', function (cb) {
//   //     var server = new Server()
//   //     server.listen
//   //   }]
//   // })

//   var dht = new DHT({
//     // bootstrap: []
//   })
//   dht.setInfoHash(infoHash)
//   dht.findPeers(300)

//   dht.once('node', function (peer) {
//     t.pass('Found at least one other DHT node')
//   })

//   dht.once('peer', function (peer) {
//     t.pass('Found at least one peer that has the file')
//     dht.destroy()
//   })
// })
