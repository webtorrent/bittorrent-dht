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

  t.deepEqual(dht.nodeId, nodeId)
  dht.destroy()
  t.end()
})

test('call `addNode` with nodeId argument', t => {
  t.plan(3)

  const dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  const nodeId = common.randomId()

  dht.on('node', node => {
    t.equal(node.host, '127.0.0.1')
    t.equal(node.port, 9999)
    t.deepEqual(node.id, nodeId)
    dht.destroy()
  })

  dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })
})

test('call `addNode` without nodeId argument', t => {
  t.plan(3)

  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(() => {
    const port = dht1.address().port

    // If `nodeId` is undefined, then the peer will be pinged to learn their node id.
    dht2.addNode({ host: '127.0.0.1', port })

    dht2.on('node', node => {
      t.equal(node.host, '127.0.0.1')
      t.equal(node.port, port)
      t.deepEqual(node.id, dht1.nodeId)
      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('call `addNode` without nodeId argument, and invalid addr', t => {
  t.plan(1)

  const dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  // If `nodeId` is undefined, then the peer will be pinged to learn their node id.
  // If the peer DOES NOT RESPOND, the will not be added to the routing table.
  dht.addNode({ host: '127.0.0.1', port: 9999 })

  dht.on('node', () => {
    // No 'node' event should be emitted if the added node does not respond to ping
    t.fail('somehow found a node, even though no node actually responded')
  })

  setTimeout(() => {
    t.pass('no "node" event emitted for 2 seconds')
    dht.destroy()
  }, 2000)
})

test('`addNode` only emits events for new nodes', t => {
  t.plan(1)
  let togo = 1

  const dht = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht)

  dht.on('node', () => {
    if (--togo < 0) t.fail()
  })

  const nodeId = common.randomId()
  dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })
  dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })
  dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })

  setTimeout(() => {
    dht.destroy()
    t.pass()
  }, 100)
})

test('send message while binding (listen)', t => {
  t.plan(1)

  const a = new DHT({ bootstrap: false })
  a.listen(() => {
    const port = a.address().port
    const b = new DHT({ bootstrap: false })
    b.listen()
    b._sendPing({ host: '127.0.0.1', port }, err => {
      t.error(err)
      a.destroy()
      b.destroy()
    })
  })
})
