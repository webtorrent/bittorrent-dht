var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('persist dht', function (t) {
  t.plan(1)

  var dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', function () {
    var dht2 = new DHT({ bootstrap: dht1.toArray() })

    dht2.on('ready', function () {
      t.deepEqual(dht2.toArray(), dht1.toArray())
      dht1.destroy()
      dht2.destroy()
    })
  })

})
