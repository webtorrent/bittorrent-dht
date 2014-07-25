var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('`node` event fires for each added node (100x)', function (t) {
  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var numNodes = 0
  dht.on('node', function () {
    numNodes += 1
    if (numNodes === 100) {
      t.pass('100 nodes added, 100 `node` events emitted')
      t.end()
    }
  })

  common.addRandomNodes(dht, 100)
})

test('`node` event fires for each added node (10000x)', function (t) {
  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var numNodes = 0
  dht.on('node', function () {
    numNodes += 1
    if (numNodes === 10000) {
      t.pass('10000 nodes added, 10000 `node` events emitted')
      t.end()
    }
  })

  common.addRandomNodes(dht, 10000)
})

test('`peer` event fires for each added peer (100x)', function (t) {
  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var numPeers = 0
  dht.on('peer', function () {
    numPeers += 1
    if (numPeers === 100) {
      t.pass('100 peers added, 100 `peer` events emitted')
      t.end()
    }
  })

  common.addRandomPeers(dht, 100)
})

test('`peer` event fires for each added peer (10000x)', function (t) {
  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var numPeers = 0
  dht.on('peer', function () {
    numPeers += 1
    if (numPeers === 10000) {
      t.pass('10000 peers added, 10000 `peer` events emitted')
      t.end()
    }
  })

  common.addRandomPeers(dht, 10000)
})

test('`listening` event fires', function (t) {
  t.plan(2)
  var dht = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht)

  dht.listen(function (port) {
    t.pass('listen() onlistening shorthand gets called')
  })
  dht.on('listening', function () {
    t.pass('`listening` event fires')
    dht.destroy()
  })
})

test('`ready` event fires when bootstrap === false', function (t) {
  t.plan(1)
  var dht = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    t.pass('`ready` event fires')
    dht.destroy()
  })
})

test('`ready` event fires when there are K nodes', function (t) {
  t.plan(3)

  // dht1 will simulate an existing node (with a populated routing table)
  var dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  dht1.on('ready', function () {
    t.equal(dht1.nodes.count(), DHT.K, '`ready` event fires when K nodes are available')
  })

  // add K nodes to dht1
  common.addRandomNodes(dht1, DHT.K)

  dht1.listen(function (port) {
    t.pass('dht listening on port ' + port)

    // dh2 will get all K nodes from dht1 and should also emit a `ready` event
    var dht2 = new DHT({ bootstrap: '127.0.0.1:' + port })
    common.failOnWarningOrError(t, dht2)

    dht2.on('ready', function () {
      t.equal(dht1.nodes.count(), DHT.K, 'dht2 gets K nodes from dht1 and fires `ready`')

      dht1.destroy()
      dht2.destroy()
    })
  })
})

