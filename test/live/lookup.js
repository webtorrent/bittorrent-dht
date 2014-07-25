var DHT = require('../../')
var test = require('tape')

var pride = '1E69917FBAA2C767BCA463A96B5572785C6D8A12'.toLowerCase() // Pride & Prejudice
var leaves = 'D2474E86C95B19B8BCFDB92BC12C9D44667CFA36'.toLowerCase() // Leaves of Grass

test('Default bootstrap server returns at least one node', function (t) {
  t.plan(1)

  var dht = new DHT()

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
    dht.destroy()
  })
})

test('Default bootstrap server returns a peer for one torrent', function (t) {
  t.plan(4)

  var dht = new DHT()

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
  })

  dht.on('ready', function () {
    t.pass('dht ready')

    dht.lookup(pride)

    dht.once('peer', function (peer, infoHash) {
      t.pass('Found at least one peer that has the file')
      t.equal(infoHash, pride)
      dht.destroy()
    })
  })
})

test('Default bootstrap server returns a peer for two torrents (simultaneously)', function (t) {
  t.plan(3)

  var dht = new DHT()

  dht.on('ready', function () {
    t.pass('dht ready')

    dht.lookup(pride)
    dht.lookup(leaves)

    var prideDone = false
    var leavesDone = false
    dht.on('peer', function (peer, infoHash) {
      if (!prideDone && infoHash === pride) {
        prideDone = true
        t.pass('Found at least one peer for Pride & Prejudice')
      }
      if (!leavesDone && infoHash === leaves) {
        leavesDone = true
        t.pass('Found at least one peer for Leaves of Grass')
      }
      if (leavesDone && prideDone) {
        dht.destroy()
      }
    })
  })
})
