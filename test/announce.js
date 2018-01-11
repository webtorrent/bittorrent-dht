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

test('`announce` and no cache timeout', function (t) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false, maxAge: Infinity })
  var infoHash = common.randomId()

  dht1.listen(function () {
    var dht2 = new DHT({ bootstrap: '127.0.0.1:' + dht1.address().port, maxAge: Infinity })
    var cnt = 0

    dht1.on('peer', function (peer) {
      cnt++
    })

    dht1.once('announce', function (peer) {
      t.deepEqual(peer, {host: '127.0.0.1', port: 1337})

      dht1.lookup(infoHash, function () {
        setTimeout(function () {
          dht1.lookup(infoHash, function () {
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

test('`announce` and cache timeout', function (t) {
  t.plan(2)
  var dht1 = new DHT({ bootstrap: false, maxAge: 50 })
  var infoHash = common.randomId()

  dht1.listen(function () {
    var dht2 = new DHT({ bootstrap: '127.0.0.1:' + dht1.address().port, maxAge: 50 })
    var cnt = 0

    dht1.on('peer', function (peer) {
      cnt++
    })

    dht1.once('announce', function (peer) {
      t.deepEqual(peer, {host: '127.0.0.1', port: 1337})

      dht1.lookup(infoHash, function () {
        setTimeout(function () {
          dht1.lookup(infoHash, function () {
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

test('`announce` twice and cache timeout for one announce', function (t) {
  var dht1 = new DHT({ bootstrap: false, maxAge: 50 })
  var infoHash = common.randomId()

  dht1.listen(function () {
    var dht2 = new DHT({ bootstrap: '127.0.0.1:' + dht1.address().port, maxAge: 50 })

    dht2.announce(infoHash, 1337, function () {
      dht2.announce(infoHash, 1338, function () {
        var found = {}
        var interval = setInterval(function () {
          dht2.announce(infoHash, 1338)
        }, 10)

        dht2.on('peer', function (peer) {
          found[peer.host + ':' + peer.port] = true
        })

        dht2.lookup(infoHash, function () {
          t.same(found, {'127.0.0.1:1337': true, '127.0.0.1:1338': true}, 'found two peers')
          found = {}
          setTimeout(function () {
            dht2.lookup(infoHash, function () {
              t.same(found, {'127.0.0.1:1338': true}, 'found one peer')
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
