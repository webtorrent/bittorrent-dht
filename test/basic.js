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

  t.deepEqual(dht.nodeId, nodeId)
  dht.destroy()
  t.end()
})

test('call `addNode` with nodeId argument', function (t) {
  t.plan(3)

  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var nodeId = common.randomId()

  dht.on('node', function (node) {
    t.equal(node.host, '127.0.0.1')
    t.equal(node.port, 9999)
    t.deepEqual(node.id, nodeId)
    dht.destroy()
  })

  dht.addNode({host: '127.0.0.1', port: 9999, id: nodeId})
})

test('call `addNode` without nodeId argument', function (t) {
  t.plan(3)

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function () {
    var port = dht1.address().port

    // If `nodeId` is undefined, then the peer will be pinged to learn their node id.
    dht2.addNode({host: '127.0.0.1', port: port})

    dht2.on('node', function (node) {
      t.equal(node.host, '127.0.0.1')
      t.equal(node.port, port)
      t.deepEqual(node.id, dht1.nodeId)
      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('call `addNode` without nodeId argument, and invalid addr', function (t) {
  t.plan(1)

  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  // If `nodeId` is undefined, then the peer will be pinged to learn their node id.
  // If the peer DOES NOT RESPOND, the will not be added to the routing table.
  dht.addNode({host: '127.0.0.1', port: 9999})

  dht.on('node', function () {
    // No 'node' event should be emitted if the added node does not respond to ping
    t.fail('somehow found a node, even though no node actually responded')
  })

  setTimeout(function () {
    t.pass('no "node" event emitted for 2 seconds')
    dht.destroy()
  }, 2000)
})

test('`addNode` only emits events for new nodes', function (t) {
  t.plan(1)

  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  dht.on('node', function () {
    if (--togo < 0) t.fail()
  })

  var nodeId = common.randomId()
  dht.addNode({host: '127.0.0.1', port: 9999, id: nodeId})
  dht.addNode({host: '127.0.0.1', port: 9999, id: nodeId})
  dht.addNode({host: '127.0.0.1', port: 9999, id: nodeId})

  var togo = 1
  setTimeout(function () {
    dht.destroy()
    t.pass()
  }, 100)
})

test('send message while binding (listen)', function (t) {
  t.plan(1)

  var a = new DHT({ bootstrap: false })
  a.listen(function () {
    var port = a.address().port
    var b = new DHT({ bootstrap: false })
    b.listen()
    b._sendPing({host: '127.0.0.1', port: port}, function (err) {
      t.error(err)
      a.destroy()
      b.destroy()
    })
  })
})
