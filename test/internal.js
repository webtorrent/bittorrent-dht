const common = require('./common')
const DHT = require('../')
const test = require('tape')

test('`ping` query send and response', t => {
  t.plan(2)
  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(() => {
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'ping'
    }, (err, res) => {
      t.error(err)
      t.deepEqual(res.r.id, dht1.nodeId)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`find_node` query for exact match (with one in table)', t => {
  t.plan(3)
  const targetNodeId = common.randomId()

  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({ host: '255.255.255.255', port: 6969, id: targetNodeId })

  dht1.listen(() => {
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'find_node',
      a: { target: targetNodeId }
    }, (err, res) => {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.deepEqual(res.r.nodes.length, 2 * 26)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`find_node` query (with many in table)', t => {
  t.plan(3)
  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({ host: '1.1.1.1', port: 6969, id: common.randomId() })
  dht1.addNode({ host: '10.10.10.10', port: 6969, id: common.randomId() })
  dht1.addNode({ host: '255.255.255.255', port: 6969, id: common.randomId() })

  dht1.listen(() => {
    const targetNodeId = common.randomId()
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'find_node',
      a: { target: targetNodeId }
    }, (err, res) => {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.deepEqual(res.r.nodes.length, 26 * 4)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`get_peers` query to node with *no* peers in table', t => {
  t.plan(4)
  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.addNode({ host: '1.1.1.1', port: 6969, id: common.randomId() })
  dht1.addNode({ host: '2.2.2.2', port: 6969, id: common.randomId() })

  dht1.listen(() => {
    const targetInfoHash = common.randomId()
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'get_peers',
      a: {
        info_hash: targetInfoHash
      }
    }, (err, res) => {
      t.error(err)
      t.deepEqual(res.r.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res.r.token))
      t.deepEqual(res.r.nodes.length, 3 * 26)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`get_peers` query to node with peers in table', t => {
  t.plan(4)

  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  const targetInfoHash = common.randomId()

  dht1._addPeer({ host: '1.1.1.1', port: 6969 }, targetInfoHash)
  dht1._addPeer({ host: '10.10.10.10', port: 6969 }, targetInfoHash)
  dht1._addPeer({ host: '255.255.255.255', port: 6969 }, targetInfoHash)

  dht1.listen(() => {
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'get_peers',
      a: {
        info_hash: targetInfoHash
      }
    }, (err, res) => {
      t.error(err)

      t.deepEqual(res.r.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res.r.token))
      t.deepEqual(res.r.values.length, 3)

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`announce_peer` query with bad token', t => {
  t.plan(2)
  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  const infoHash = common.randomId()

  dht1.listen(() => {
    const token = Buffer.from('bad token')
    dht2._rpc.query({
      host: '127.0.0.1',
      port: dht1.address().port
    }, {
      q: 'announce_peer',
      a: {
        info_hash: infoHash,
        port: 9999,
        token
      }
    }, (err, res) => {
      t.ok(err, 'got error')
      t.ok(err.message.includes('bad token'))

      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('`announce_peer` with bad port', t => {
  t.plan(1)

  const dht1 = new DHT({ bootstrap: false })
  dht1.listen(() => {
    const dht2 = new DHT({ bootstrap: `127.0.0.1:${dht1.address().port}`, timeout: 100 })
    const infoHash = common.randomId()

    dht2.announce(infoHash, 99999, err => {
      dht1.destroy()
      dht2.destroy()
      t.ok(err, 'had error')
    })
  })
})

test('`announce_peer` query gets ack response', t => {
  t.plan(5)

  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  const infoHash = common.randomId()

  dht1.listen(() => {
    const port = dht1.address().port
    dht2._rpc.query({
      host: '127.0.0.1',
      port
    }, {
      q: 'get_peers',
      a: {
        info_hash: infoHash
      }
    }, (err, res1) => {
      t.error(err)

      t.deepEqual(res1.r.id, dht1.nodeId)
      t.ok(Buffer.isBuffer(res1.r.token))

      dht2._rpc.query({
        host: '127.0.0.1',
        port
      }, {
        q: 'announce_peer',
        a: {
          info_hash: infoHash,
          port: 9999,
          token: res1.r.token
        }
      }, (err, res2) => {
        t.error(err)
        t.deepEqual(res2.r.id, dht1.nodeId)

        dht1.destroy()
        dht2.destroy()
      })
    })
  })
})
