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

test('`announce` event fires for each added peer (100x)', function (t) {
  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var numPeers = 0
  dht.on('announce', function () {
    numPeers += 1
    if (numPeers === 100) {
      t.pass('100 peers added, 100 `announce` events emitted')
      t.end()
    }
  })

  common.addRandomPeers(dht, 100)
})

test('`announce` event fires for each added peer (10000x)', function (t) {
  var dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  var numPeers = 0
  dht.on('announce', function () {
    numPeers += 1
    if (numPeers === 10000) {
      t.pass('10000 peers added, 10000 `announce` events emitted')
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
  t.plan(4)

  // dht1 will simulate an existing node (with a populated routing table)
  var dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  dht1.on('ready', function () {
    t.pass('dht1 `ready` event fires because { bootstrap: false }')

    common.addRandomNodes(dht1, 3)
    t.equal(dht1.nodes.count(), 3, 'dht1 has 3 nodes')

    dht1.listen(function (port) {
      t.pass('dht1 listening on port ' + port)

      // dht2 will get all 3 nodes from dht1 and should also emit a `ready` event
      var dht2 = new DHT({ bootstrap: '127.0.0.1:' + port })
      common.failOnWarningOrError(t, dht2)

      dht2.on('ready', function () {
        // 5 nodes because dht1 also optimistically captured dht2's addr and included it
        t.equal(dht1.nodes.count(), 4, 'dht2 gets 5 nodes from dht1 and fires `ready`')

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})
