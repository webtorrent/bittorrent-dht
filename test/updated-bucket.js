var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('adding a node updates the lastChange property', function (t) {
  t.plan(3)

  var now = Date.now()
  var dht = new DHT({ bootstrap: false })

  t.notOk(dht._rpc.nodes.lastChange, 'lastChanged not set')

  setTimeout(function () {
    dht.addNode({host: '127.0.0.1', port: 9999, id: common.randomId()})
    t.equal(typeof dht._rpc.nodes.lastChange, 'number')
    t.ok(
      dht._rpc.nodes.lastChange > now,
      'lastChange timestamp is older'
    )
    dht.destroy()
  }, 1)
})

test('same node doesn´t change the lastChange property', function (t) {
  t.plan(3)

  var dht = new DHT({ bootstrap: false })

  t.notOk(dht._rpc.nodes.lastChange, 'lastChanged not set')

  var nodeId = common.randomId()
  var lastChanged
  setTimeout(function () {
    dht.addNode({host: '127.0.0.1', port: 9999, id: nodeId})

    t.equal(typeof dht._rpc.nodes.lastChange, 'number')
    lastChanged = dht._rpc.nodes.lastChange

    setTimeout(function () {
      dht.addNode({host: '127.0.0.1', port: 9999, id: nodeId})
      t.equal(dht._rpc.nodes.lastChange, lastChanged)
      dht.destroy()
    }, 1)
  }, 1)
})
