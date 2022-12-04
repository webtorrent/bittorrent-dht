const common = require('./common')
const DHT = require('../')
const test = require('tape')

test('explicitly set nodeId', t => {
  const nodeId = common.randomId()

  const dht = new DHT({
    nodeId,
    bootstrap: false
  })

  common.failOnWarningOrError(t, dht)

  dht.on('node', () => {
    t.fail('should not find nodes')
  })

  dht.on('peer', () => {
    t.fail('should not find peers')
  })

  const abort = dht.lookup(common.randomId())
  abort()

  setTimeout(() => {
    dht.destroy()
  }, 500)

  t.end()
})
