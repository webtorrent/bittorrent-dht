var common = require('./common')
var DHT = require('../')
var portfinder = require('portfinder')
var test = require('tape')

test('`listening` event fires', function (t) {
  t.plan(3)
  var dht = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht)

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht.listen(port, function () {
      t.pass('listen() onlistening shorthand gets called')
    })
    dht.on('listening', function () {
      t.pass('`listening` event fires')
      dht.destroy()
    })
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
    t.equal(dht1.nodes.count(), DHT.K, '`ready` event fires when K nodes are available')
  })

  // add K nodes to dht1
  for (var i = 0; i < DHT.K; i++) {
    dht1.addNode(common.randomAddr(), common.randomNodeId())
  }

  portfinder.getPort(function (err, port) {
    t.error(err)
    dht1.listen(port, function () {
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
})

