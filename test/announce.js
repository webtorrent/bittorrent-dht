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

test('`announce` and `unannounce` with {host: "127.0.0.1"}', function (t) {
  t.plan(6)
  var dht = new DHT({ bootstrap: false, host: '127.0.0.1' })
  common.failOnWarningOrError(t, dht)

  var infoHash = common.randomId()
  var unannounced = false

  dht.announce(infoHash, 6969, function (err) {
    t.pass(err instanceof Error, 'announce should fail')
    dht.lookup(infoHash, function (err) {
      t.error(err)
      dht.unannounce(infoHash, 6969, function (err) {
        t.pass(err instanceof Error, 'unannounce should fail')
        unannounced = true
        dht.lookup(infoHash, function (err) {
          t.error(err)
          dht.destroy()
        })
      })
    })

    dht.on('unannounce', function () {
      t.pass('should unannounce')
    })

    dht.on('peer', function (peer) {
      if (unannounced) t.fail('peer should be unannounced')
      t.deepEqual(peer, { host: '127.0.0.1', port: 6969 })
    })
  })
})

test('announce and unannounce with implied port', function (t) {
  t.plan(4)
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
        dht2.unannounce(infoHash, function (err) {
          t.error(err)
          dht2.on('peer', function (peer) {
            t.fail('should be no peers')
          })
          dht2.lookup(infoHash, function (err) {
            t.error(err)
            dht1.destroy()
            dht2.destroy()
          })
        })
      })

      dht2.lookup(infoHash)
    })
  })
})
