var common = require('./common')
var DHT = require('../')
var test = require('tape')

common.wrapTest(test, '`announce` with {host: false}', function (t, ipv6) {
  t.plan(3)
  var dht = new DHT({ bootstrap: false, host: false, ipv6: ipv6 })
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

common.wrapTest(test, '`announce` with {host: "127.0.0.1"}', function (t, ipv6) {
  t.plan(3)

  var dht = new DHT({ bootstrap: false, ipv6: ipv6, host: common.localHost(ipv6) })
  common.failOnWarningOrError(t, dht)

  var infoHash = common.randomId()
  dht.announce(infoHash, 6969, function (err) {
    t.pass(err instanceof Error, 'announce should fail')
    dht.lookup(infoHash, function (err) {
      t.error(err)
      dht.destroy()
    })

    dht.on('peer', function (peer) {
      t.deepEqual(peer, { host: common.localHost(ipv6), port: 6969 })
    })
  })
})

common.wrapTest(test, 'announce with implied port', function (t, ipv6) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false, ipv6: ipv6 })
  var infoHash = common.randomId()

  dht1.listen(function () {
    var dht2 = new DHT({ipv6: ipv6, bootstrap: (ipv6 ? '[::1]:' : '127.0.0.1:') + dht1.address().port}) // Test parsing port

    dht1.on('announce', function (peer) {
      t.deepEqual(peer, {host: common.localHost(ipv6), port: dht2.address().port})
    })

    dht2.announce(infoHash, function () {
      dht2.once('peer', function (peer) {
        t.deepEqual(peer, {host: common.localHost(ipv6), port: dht2.address().port})
        dht1.destroy()
        dht2.destroy()
      })

      dht2.lookup(infoHash)
    })
  })
})
