const common = require('./common')
const DHT = require('../')
const once = require('once')
const parallel = require('run-parallel')
const test = require('tape')

const from = 2
const to = 20

for (let i = from; i <= to; i++) {
  runAnnounceLookupTest(i)
}

function runAnnounceLookupTest (numInstances) {
  test(`horde: announce+lookup with ${numInstances} DHTs`, t => {
    let numRunning = numInstances
    findPeers(numInstances, t, (err, dhts) => {
      if (err) throw err

      dhts.forEach(dht => {
        for (const infoHash in dht.tables) {
          const table = dht.tables[infoHash]
          table.toJSON().nodes.forEach(contact => {
            t.ok(contact.token, 'contact has token')
          })
        }

        process.nextTick(() => {
          dht.destroy(err => {
            t.error(err, 'destroyed dht')
            if (--numRunning === 0) t.end()
          })
        })
      })
    })
  })
}

/**
 *  Initialize [numInstances] dhts, have one announce an infoHash, and another perform a
 *  lookup. Times out after a while.
 */
function findPeers (numInstances, t, cb) {
  cb = once(cb)
  const dhts = []
  const timeoutId = setTimeout(() => {
    cb(new Error(`Timed out for ${numInstances} instances`))
  }, 20000)

  const infoHash = common.randomId().toString('hex')

  for (let i = 0; i < numInstances; i++) {
    const dht = new DHT({ bootstrap: false })

    dhts.push(dht)
    common.failOnWarningOrError(t, dht)
  }

  // wait until every dht is listening
  const tasks = dhts.map(dht => {
    return cb => {
      dht.listen(cb)
    }
  })

  parallel(tasks, () => {
    // add each other to routing tables
    makeFriends(dhts)

    // lookup from other DHTs
    dhts[0].announce(infoHash, 9998, () => {
      dhts[1].lookup(infoHash)
    })
  })

  dhts[1].on('peer', (peer, hash) => {
    t.equal(hash.toString('hex'), infoHash)
    t.equal(peer.port, 9998)
    clearTimeout(timeoutId)
    cb(null, dhts)
  })
}

/**
 * Add every dht address to the dht "before" it.
 * This should guarantee that any dht can be located (with enough queries).
 */
function makeFriends (dhts) {
  const len = dhts.length
  for (let i = 0; i < len; i++) {
    const next = dhts[(i + 1) % len]
    dhts[i].addNode({ host: '127.0.0.1', port: next.address().port, id: next.nodeId })
  }
}
