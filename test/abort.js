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

  dht.on('node', function () {
    t.fail('should not find nodes')
  })

  dht.on('peer', function () {
    t.fail('should not find peers')
  })

  var abort = dht.lookup(common.randomId())
  abort()

  setTimeout(function () {
    dht.destroy()
  }, 500)

  t.end()
})
