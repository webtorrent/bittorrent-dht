const common = require('./common')
const DHT = require('../')
const test = require('tape')

test('adding a node updates the lastChange property', t => {
  t.plan(3)

  const now = Date.now()
  const dht = new DHT({ bootstrap: false })

  t.notOk(dht._rpc.nodes.metadata.lastChange, 'lastChanged not set')

  setTimeout(() => {
    dht.addNode({ host: '127.0.0.1', port: 9999, id: common.randomId() })
    t.equal(typeof dht._rpc.nodes.metadata.lastChange, 'number')
    t.ok(
      dht._rpc.nodes.metadata.lastChange > now,
      'lastChange timestamp is older'
    )
    dht.destroy()
  }, 50)
})

test('same node doesn´t change the lastChange property', t => {
  t.plan(3)

  const dht = new DHT({ bootstrap: false })

  t.notOk(dht._rpc.nodes.metadata.lastChange, 'lastChanged not set')

  const nodeId = common.randomId()
  let lastChanged
  setTimeout(() => {
    dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })

    t.equal(typeof dht._rpc.nodes.metadata.lastChange, 'number')
    lastChanged = dht._rpc.nodes.metadata.lastChange

    setTimeout(() => {
      dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })
      t.equal(dht._rpc.nodes.metadata.lastChange, lastChanged)
      dht.destroy()
    }, 1)
  }, 1)
})

test('same node doesn´t change the lastChange property', t => {
  t.plan(3)

  const dht = new DHT({ bootstrap: false })

  t.notOk(dht._rpc.nodes.metadata.lastChange, 'lastChanged not set')

  const nodeId = common.randomId()
  let lastChanged
  setTimeout(() => {
    dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })

    t.equal(typeof dht._rpc.nodes.metadata.lastChange, 'number')
    lastChanged = dht._rpc.nodes.metadata.lastChange

    setTimeout(() => {
      dht.addNode({ host: '127.0.0.1', port: 9999, id: nodeId })
      t.equal(dht._rpc.nodes.metadata.lastChange, lastChanged)
      dht.destroy()
    }, 1)
  }, 1)
})

test('_checkNodes: skips good nodes', t => {
  t.plan(5)
  const dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  dht1.on('ready', () => {
    t.pass('dht1 `ready` event fires because { bootstrap: false }')
    t.equal(dht1.ready, true)

    dht1.listen(() => {
      const port = dht1.address().port
      t.pass(`dht1 listening on port ${port}`)

      // dht2 will get all 3 nodes from dht1 and should also emit a `ready` event
      const dht2 = new DHT({ bootstrap: `127.0.0.1:${port}` })
      common.failOnWarningOrError(t, dht2)

      dht2.on('ready', () => {
        const nodes = dht1.nodes.toArray()

        dht1._checkNodes(nodes, true, (err, data) => {
          t.notOk(err, 'no error')
          t.notOk(data, 'no broken nodes')
          dht1.destroy()
          dht2.destroy()
        })
      })
    })
  })
})

test('_checkNodes: returns the bad one', t => {
  t.plan(5)
  const dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  dht1.on('ready', () => {
    t.pass('dht1 `ready` event fires because { bootstrap: false }')
    t.equal(dht1.ready, true)

    const nodeId = common.randomId()
    const badNode = { host: '127.0.0.1', port: 9999, id: nodeId }
    dht1.addNode(badNode)

    dht1.listen(() => {
      const port = dht1.address().port
      t.pass(`dht1 listening on port ${port}`)

      // dht2 will get all 3 nodes from dht1 and should also emit a `ready` event
      const dht2 = new DHT({ bootstrap: `127.0.0.1:${port}` })
      common.failOnWarningOrError(t, dht2)

      dht2.on('ready', () => {
        const goodNodes = dht1.nodes.toArray()
        const goodNode = goodNodes[0]
        const nodes = [goodNode, goodNode, badNode, goodNode]

        dht1._checkNodes(nodes, true, (err, data) => {
          t.notOk(err, 'no error')
          t.equal(data.id, badNode.id)
          dht1.destroy()
          dht2.destroy()
        })
      })
    })
  })
})

test('_checkAndRemoveNodes: removes bad nodes', t => {
  t.plan(6)
  const dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  dht1.on('ready', () => {
    t.pass('dht1 `ready` event fires because { bootstrap: false }')
    t.equal(dht1.ready, true)

    const nodeId = common.randomId()

    dht1.listen(() => {
      const port = dht1.address().port
      t.pass(`dht1 listening on port ${port}`)

      // dht2 will get all 3 nodes from dht1 and should also emit a `ready` event
      const dht2 = new DHT({ bootstrap: `127.0.0.1:${port}` })
      common.failOnWarningOrError(t, dht2)

      dht2.on('ready', () => {
        t.equal(dht1.nodes.toArray().length, 1)
        const goodNodes = dht1.nodes.toArray()
        const goodNode = goodNodes[0]
        const badNode = { host: '127.0.0.1', port: 9999, id: nodeId }
        dht1.addNode(badNode)

        t.equal(dht1.nodes.toArray().length, 2)

        const nodes = [goodNode, goodNode, badNode, goodNode]
        dht1._checkAndRemoveNodes(nodes, (_, data) => {
          t.equal(dht1.nodes.toArray().length, 1)
          dht1.destroy()
          dht2.destroy()
        })
      })
    })
  })
})
