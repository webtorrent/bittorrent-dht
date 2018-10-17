const common = require('./common')
const DHT = require('../')
const test = require('tape')

test('local immutable put/get', t => {
  t.plan(3)

  const dht = new DHT({ bootstrap: false })
  t.once('end', () => {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', () => {
    const value = common.fill(500, 'abc')
    dht.put({ v: value }, (_, hash) => {
      t.equal(
        hash.toString('hex'),
        '3a34a097641348623d123acfba3aa589028f241e' // sha1 of the value
      )
      dht.get(hash, (err, res) => {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), value.toString('utf8'),
          'got back what we put in'
        )
      })
    })
  })
})

test('delegated put', t => {
  t.plan(5)

  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })
  const dht3 = new DHT({ bootstrap: false })
  const dht4 = new DHT({ bootstrap: false })

  t.once('end', () => {
    dht1.destroy()
    dht2.destroy()
    dht3.destroy()
    dht4.destroy()
  })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)
  common.failOnWarningOrError(t, dht3)
  common.failOnWarningOrError(t, dht4)

  let pending = 4
  dht1.listen(() => {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })

  dht2.listen(() => {
    dht1.addNode({ host: '127.0.0.1', port: dht2.address().port })
    dht1.once('node', ready)
  })

  dht3.listen(() => {
    dht4.addNode({ host: '127.0.0.1', port: dht3.address().port })
    dht4.once('node', ready)
  })

  dht4.listen(() => {
    dht3.addNode({ host: '127.0.0.1', port: dht4.address().port })
    dht3.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    const value = common.fill(500, 'abc')
    const opts = {
      v: value
    }

    dht1.put(opts, (err, hash) => {
      t.error(err)

      dht2.get(hash, (err, res) => {
        t.error(err)

        dht3.put(res, err => {
          t.error(err)

          dht4.get(hash, (err, res) => {
            t.error(err)
            t.equal(res.v.toString('utf8'), opts.v.toString('utf8'), 'got back what we put in')
          })
        })
      })
    })
  }
})

test('multi-party immutable put/get', t => {
  t.plan(4)

  const dht1 = new DHT({ bootstrap: false })
  const dht2 = new DHT({ bootstrap: false })
  t.once('end', () => {
    dht1.destroy()
    dht2.destroy()
  })

  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  let pending = 2
  dht1.listen(() => {
    dht2.addNode({ host: '127.0.0.1', port: dht1.address().port })
    dht2.once('node', ready)
  })
  dht2.listen(() => {
    dht1.addNode({ host: '127.0.0.1', port: dht2.address().port })
    dht1.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    const value = common.fill(500, 'abc')
    dht1.put({ v: value }, (err, hash) => {
      t.error(err)

      t.equal(
        hash.toString('hex'),
        '3a34a097641348623d123acfba3aa589028f241e' // sha1 of the value
      )

      dht2.get(hash, (err, res) => {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), value.toString('utf8'),
          'got back what we put in on another node'
        )
      })
    })
  }
})
