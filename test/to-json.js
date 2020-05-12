const common = require('./common')
const DHT = require('../')
const ed = require('bittorrent-dht-sodium')
const test = require('tape')

test('dht.toJSON: re-use dht nodes with `bootstrap` option', t => {
  t.plan(1)

  const dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', () => {
    const dht2 = new DHT({ bootstrap: dht1.toJSON().nodes })

    dht2.on('ready', () => {
      t.deepEqual(dht2.toJSON().nodes, dht1.toJSON().nodes)
      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('dht.toJSON: re-use dht nodes by calling dht.addNode', t => {
  t.plan(1)

  const dht1 = new DHT({ bootstrap: false })
  common.failOnWarningOrError(t, dht1)

  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', () => {
    const dht2 = new DHT({ bootstrap: false })

    dht1.toJSON().nodes.forEach(node => {
      dht2.addNode(node)
    })

    dht2.on('ready', () => {
      t.deepEqual(dht2.toJSON().nodes, dht1.toJSON().nodes)
      dht1.destroy()
      dht2.destroy()
    })
  })
})

test('dht.toJSON: BEP44 immutable value', t => {
  t.plan(10)

  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })

  t.once('end', () => {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(() => {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })

  function ready () {
    const value = common.fill(500, 'abc')
    dht1.put(value, (_, hash) => {
      const json1 = dht1.toJSON()
      t.equal(json1.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json1.values[hash.toString('hex')].id, dht1.nodeId.toString('hex'))
      t.equal(json1.values[hash.toString('hex')].seq, undefined)
      t.equal(json1.values[hash.toString('hex')].sig, undefined)
      t.equal(json1.values[hash.toString('hex')].k, undefined)

      const json2 = dht2.toJSON()
      t.equal(json2.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].id, dht1.nodeId.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].seq, undefined)
      t.equal(json2.values[hash.toString('hex')].sig, undefined)
      t.equal(json2.values[hash.toString('hex')].k, undefined)
    })
  }
})

test('dht.toJSON: BEP44 mutable value', t => {
  t.plan(5)

  const keypair = ed.keygen()
  const dht1 = new DHT({ bootstrap: false, verify: ed.verify })
  const dht2 = new DHT({ bootstrap: false, verify: ed.verify })

  t.once('end', () => {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  dht1.listen(() => {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })

  function ready () {
    const value = common.fill(500, 'abc')
    const opts = {
      k: keypair.pk,
      sign: common.sign(keypair),
      seq: 0,
      v: value
    }

    dht1.put(opts, (_, hash) => {
      const json2 = dht2.toJSON()
      t.equal(json2.values[hash.toString('hex')].v, value.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].id, dht1.nodeId.toString('hex'))
      t.equal(json2.values[hash.toString('hex')].seq, 0)
      t.equal(typeof json2.values[hash.toString('hex')].sig, 'string')
      t.equal(typeof json2.values[hash.toString('hex')].k, 'string')
    })
  }
})
