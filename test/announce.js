const common = require('./common')
const DHT = require('../')
const test = require('tape')

test('`announce` with {host: false}', t => {
  t.plan(3)
  const dht = new DHT({ bootstrap: false, host: false })
  common.failOnWarningOrError(t, dht)

  const infoHash = common.randomId()
  dht.announce(infoHash, 6969, err => {
    t.pass(err instanceof Error, 'announce should fail')
    dht.lookup(infoHash, (err, n) => {
      t.error(err)
      t.equal(n, 0, 'lookup should find nothing')
      dht.destroy()
    })
  })
})

test('`announce` with {host: "127.0.0.1"}', t => {
  t.plan(3)
  const dht = new DHT({ bootstrap: false, host: '127.0.0.1' })
  common.failOnWarningOrError(t, dht)

  const infoHash = common.randomId()
  dht.announce(infoHash, 6969, err => {
    t.pass(err instanceof Error, 'announce should fail')
    dht.lookup(infoHash, err => {
      t.error(err)
      dht.destroy()
    })

    dht.on('peer', peer => {
      t.deepEqual(peer, { host: '127.0.0.1', port: 6969 })
    })
  })
})

test('announce with implied port', t => {
  t.plan(2)
  const dht1 = new DHT({ bootstrap: false })
  const infoHash = common.randomId()

  dht1.listen(() => {
    const dht2 = new DHT({ bootstrap: `127.0.0.1:${dht1.address().port}` })

    dht1.on('announce', peer => {
      t.deepEqual(peer, { host: '127.0.0.1', port: dht2.address().port })
    })

    dht2.announce(infoHash, () => {
      dht2.once('peer', peer => {
        t.deepEqual(peer, { host: '127.0.0.1', port: dht2.address().port })
        dht1.destroy()
        dht2.destroy()
      })

      dht2.lookup(infoHash)
    })
  })
})

test('`announce` and no cache timeout', t => {
  t.plan(2)
  const dht1 = new DHT({ bootstrap: false, maxAge: Infinity })
  const infoHash = common.randomId()

  dht1.listen(() => {
    const dht2 = new DHT({ bootstrap: `127.0.0.1:${dht1.address().port}`, maxAge: Infinity })
    let cnt = 0

    dht1.on('peer', peer => {
      cnt++
    })

    dht1.once('announce', peer => {
      t.deepEqual(peer, { host: '127.0.0.1', port: 1337 })

      dht1.lookup(infoHash, () => {
        setTimeout(() => {
          dht1.lookup(infoHash, () => {
            t.equal(cnt, 2, 'finds peers two times')
            dht1.destroy()
            dht2.destroy()
          })
        }, 100)
      })
    })

    dht2.announce(infoHash, 1337)
  })
})

test('`announce` and cache timeout', t => {
  t.plan(2)
  const dht1 = new DHT({ bootstrap: false, maxAge: 50 })
  const infoHash = common.randomId()

  dht1.listen(() => {
    const dht2 = new DHT({ bootstrap: `127.0.0.1:${dht1.address().port}`, maxAge: 50 })
    let cnt = 0

    dht1.on('peer', peer => {
      cnt++
    })

    dht1.once('announce', peer => {
      t.deepEqual(peer, { host: '127.0.0.1', port: 1337 })

      dht1.lookup(infoHash, () => {
        setTimeout(() => {
          dht1.lookup(infoHash, () => {
            t.equal(cnt, 1, 'just found a peer one time')
            dht1.destroy()
            dht2.destroy()
          })
        }, 100)
      })
    })

    dht2.announce(infoHash, 1337)
  })
})

test('`announce` twice and cache timeout for one announce', t => {
  const dht1 = new DHT({ bootstrap: false, maxAge: 50 })
  const infoHash = common.randomId()

  dht1.listen(() => {
    const dht2 = new DHT({ bootstrap: `127.0.0.1:${dht1.address().port}`, maxAge: 50 })

    dht2.announce(infoHash, 1337, () => {
      dht2.announce(infoHash, 1338, () => {
        let found = {}
        const interval = setInterval(() => {
          dht2.announce(infoHash, 1338)
        }, 10)

        dht2.on('peer', peer => {
          found[`${peer.host}:${peer.port}`] = true
        })

        dht2.lookup(infoHash, () => {
          t.same(found, { '127.0.0.1:1337': true, '127.0.0.1:1338': true }, 'found two peers')
          found = {}
          setTimeout(() => {
            dht2.lookup(infoHash, () => {
              t.same(found, { '127.0.0.1:1338': true }, 'found one peer')
              clearInterval(interval)
              dht1.destroy()
              dht2.destroy()
              t.end()
            })
          }, 100)
        })
      })
    })
  })
})
