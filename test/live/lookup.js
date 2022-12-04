const DHT = require('../../')
const test = require('tape')

const pride = '1E69917FBAA2C767BCA463A96B5572785C6D8A12'.toLowerCase() // Pride & Prejudice
const leaves = 'D2474E86C95B19B8BCFDB92BC12C9D44667CFA36'.toLowerCase() // Leaves of Grass

test('Default bootstrap server returns at least one node', t => {
  t.plan(1)

  const dht = new DHT()

  dht.once('node', node => {
    t.pass('Found at least one other DHT node')
    dht.destroy()
  })
})

test('Default bootstrap server returns a peer for one torrent', t => {
  t.plan(4)

  const dht = new DHT()

  dht.once('node', node => {
    t.pass('Found at least one other DHT node')
  })

  dht.on('ready', () => {
    t.pass('dht ready')

    dht.lookup(pride)

    dht.once('peer', (peer, infoHash) => {
      t.pass('Found at least one peer that has the file')
      t.equal(infoHash.toString('hex'), pride)
      dht.destroy()
    })
  })
})

test('Default bootstrap server returns a peer for two torrents (simultaneously)', t => {
  t.plan(3)

  const dht = new DHT()

  dht.on('ready', () => {
    t.pass('dht ready')

    dht.lookup(pride)
    dht.lookup(leaves)

    let prideDone = false
    let leavesDone = false
    dht.on('peer', (peer, infoHash) => {
      if (!prideDone && infoHash.toString('hex') === pride) {
        prideDone = true
        t.pass('Found at least one peer for Pride & Prejudice')
      }
      if (!leavesDone && infoHash.toString('hex') === leaves) {
        leavesDone = true
        t.pass('Found at least one peer for Leaves of Grass')
      }
      if (leavesDone && prideDone) {
        dht.destroy()
      }
    })
  })
})

test.only('Find peers before ready is emitted', t => {
  t.plan(3)

  const dht = new DHT()
  const then = Date.now()

  dht.once('node', node => {
    t.pass('Found at least one other DHT node')
  })

  dht.once('peer', (peer, infoHash) => {
    t.pass('Found at least one peer that has the file')
    t.equal(infoHash.toString('hex'), pride, `Found a peer in ${Date.now() - then} ms`)
    dht.destroy()
  })

  dht.lookup(pride)
})
