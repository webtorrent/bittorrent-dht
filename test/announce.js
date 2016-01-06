var common = require('./common')
var DHT = require('../')
var test = require('tape')

test('`announce` with {host: false}', function (t) {
  t.plan(3)
  var dht = new DHT({ bootstrap: false, host: false })
  common.failOnWarningOrError(t, dht)

  var infoHash = common.randomId()
  dht.announce(infoHash, 6969, function (err) {
    t.pass(err instanceof Error, 'announce should fail')
    dht.lookup(infoHash, function (err, n) {
      t.error(err)
      t.equal(n, 0, 'lookup should find nothing')
      dht.destroy()
    })
  })
})

test('`announce` with {host: "127.0.0.1"}', function (t) {
  t.plan(3)
  var dht = new DHT({ bootstrap: false, host: '127.0.0.1' })
  common.failOnWarningOrError(t, dht)

  var infoHash = common.randomId()
  dht.announce(infoHash, 6969, function (err) {
    t.pass(err instanceof Error, 'announce should fail')
    dht.lookup(infoHash, function (err) {
      t.error(err)
      dht.destroy()
    })

    dht.on('peer', function (peer) {
      t.deepEqual(peer, { host: '127.0.0.1', port: 6969 })
    })
  })
})

test('announce with implied port', function (t) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false })
  var infoHash = common.randomId()

  dht1.listen(function () {
    var dht2 = new DHT({bootstrap: '127.0.0.1:' + dht1.address().port})

    dht1.on('announce', function (peer) {
      t.deepEqual(peer, {host: '127.0.0.1', port: dht2.address().port})
    })

    dht2.announce(infoHash, function () {
      dht2.once('peer', function (peer) {
        t.deepEqual(peer, {host: '127.0.0.1', port: dht2.address().port})
        dht1.destroy()
        dht2.destroy()
      })

      dht2.lookup(infoHash)
    })
  })
})
