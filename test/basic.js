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
  dht.destroy()
  t.end()
})

test('call `addNode` with nodeId argument', function (t) {
  t.plan(2)

  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var nodeId = common.randomId()

  dht.on('node', function (addr, _nodeId) {
    t.equal(addr, '127.0.0.1:9999')
    t.deepEqual(_nodeId, nodeId)
    dht.destroy()
  })

  dht.addNode('127.0.0.1:9999', nodeId)
})

test('call `addNode` without nodeId argument', function (t) {
  t.plan(2)

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(function () {
    var port = dht1.address().port

    // If `nodeId` is undefined, then the peer will be pinged to learn their node id.
    dht2.addNode('127.0.0.1:' + port)

    dht2.on('node', function (addr, _nodeId) {
      t.equal(addr, '127.0.0.1:' + port)
      t.deepEqual(_nodeId, dht1.nodeId)
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
  dht.addNode('127.0.0.1:9999')

  dht.on('node', function () {
    // No 'node' event should be emitted if the added node does not respond to ping
    t.fail('somehow found a node, even though no node actually responded')
  })

  setTimeout(function () {
    t.pass('no "node" event emitted for 2 seconds')
    dht.destroy()
  }, 2000)
})
