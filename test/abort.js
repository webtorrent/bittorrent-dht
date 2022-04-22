import test from 'tape'
import DHT from '../index.js'
import * as common from './common.js'

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
