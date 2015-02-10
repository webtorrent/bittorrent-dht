var common = require('./common')
var DHT = require('../')
var test = require('tape')
var fs = require('fs')
var os = require('os')

test('persist dht to Array', function (t) {
  t.plan(1)

  var dht1 = new DHT({ bootstrap: false, persist: false })
  common.failOnWarningOrError(t, dht1)

  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', function () {
    var dht2 = new DHT({ bootstrap: dht1.toArray(), persist: false })

    dht2.on('ready', function () {
      t.deepEqual(dht2.toArray(), dht1.toArray())
      dht1.destroy()
      dht2.destroy()
    })
  })
})

// https://github.com/feross/bittorrent-dht/pull/36
test('bootstrap and listen to custom port', function (t) {
  t.plan(4)

  var dht = new DHT({ bootstrap: [ '1.2.3.4:1000' ] })
  common.failOnWarningOrError(t, dht)

  t.ok(!dht.listening)
  dht.listen(12345)
  t.ok(!dht.listening)

  // bootstrapping should wait until next tick, so user has a chance to
  // listen to a custom port
  dht.on('listening', function () {
    t.ok(dht.listening)
    t.equal(dht.port, 12345)
  })

  dht.on('ready', function () {
    dht.destroy()
  })
})

test('persist dht to tmp file', function (t) {
  t.plan(1)

  var tmpFile = os.tmpdir() + '/DHT.json'
  fs.writeFileSync(tmpFile, '') // ensure empty persist file
  var dht1 = new DHT({ bootstrap: false, persist: tmpFile })
  common.failOnWarningOrError(t, dht1)

  common.addRandomNodes(dht1, DHT.K)

  dht1.on('ready', function () {
    dht1.persist()
    var dht1Nodes = dht1.toArray()
    dht1.destroy()

    var dht2 = new DHT({ bootstrap: false, persist: tmpFile })
    common.failOnWarningOrError(t, dht2)

    dht2.on('ready', function () {
      t.deepEqual(dht2.toArray(), dht1Nodes)
      dht2.destroy()
    })
  })
})
