var DHT = require('../../')
var test = require('tape')
var common = require('../common')

var pride = '1E69917FBAA2C767BCA463A96B5572785C6D8A12'.toLowerCase() // Pride & Prejudice
var leaves = 'D2474E86C95B19B8BCFDB92BC12C9D44667CFA36'.toLowerCase() // Leaves of Grass

// Ubuntu torrents from http://torrent.ubuntu.com:6969/

var ubuntuDesktop = '0403fb4728bd788fbcb67e87d6feb241ef38c75a' // ubuntu-16.10-desktop-amd64.iso
var ubuntuServer = 'bf6f2be549a8aca5776638b59b2bca53d7bbc748' // ubuntu-16.10-server-amd64.iso

common.wrapTest(test, 'Default bootstrap server returns at least one node', function (t, ipv6) {
  t.plan(1)

  var dht = new DHT({ipv6: ipv6})

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
    dht.destroy()
  })
})

common.wrapTest(test, 'Default bootstrap server returns a peer for one torrent', function (t, ipv6) {
  t.plan(4)

  var dht = new DHT({ipv6: ipv6})
  var torrent = ipv6 ? ubuntuDesktop : pride

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
  })

  dht.on('ready', function () {
    t.pass('dht ready')

    dht.lookup(torrent)

    dht.once('peer', function (peer, infoHash) {
      t.pass('Found at least one peer that has the file')
      t.equal(infoHash.toString('hex'), torrent)
      dht.destroy()
    })
  })
})

common.wrapTest(test, 'Default bootstrap server returns a peer for two torrents (simultaneously)', function (t, ipv6) {
  t.plan(3)

  var dht = new DHT({ipv6: ipv6})

  dht.on('ready', function () {
    t.pass('dht ready')

    var torrent1 = ipv6 ? ubuntuDesktop : pride
    var torrent2 = ipv6 ? ubuntuServer : leaves

    dht.lookup(torrent1)
    dht.lookup(torrent2)

    var torrent1Done = false
    var torrent2Done = false
    dht.on('peer', function (peer, infoHash) {
      if (!torrent1Done && infoHash.toString('hex') === torrent1) {
        torrent1Done = true
        t.pass('Found at least one peer for ' + (ipv6 ? 'Ubuntu Desktop' : 'Pride & Prejudice'))
      }
      if (!torrent2Done && infoHash.toString('hex') === torrent2) {
        torrent2Done = true
        t.pass('Found at least one peer for ' + (ipv6 ? 'Ubuntu Server' : 'Leaves of Grass'))
      }
      if (torrent2Done && torrent1Done) {
        dht.destroy()
      }
    })
  })
})

common.wrapTest(test.only, 'Find peers before ready is emitted', function (t, ipv6) {
  t.plan(3)
  2
  var dht = new DHT({ipv6: ipv6})
  var then = Date.now()

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
  })

  dht.once('peer', function (peer, infoHash) {
    t.pass('Found at least one peer that has the file')
    t.equal(infoHash.toString('hex'), ipv6 ? ubuntuDesktop : pride, 'Found a peer in ' + (Date.now() - then) + ' ms')
    dht.destroy()
  })

  dht.lookup(ipv6 ? ubuntuDesktop : pride)
})
