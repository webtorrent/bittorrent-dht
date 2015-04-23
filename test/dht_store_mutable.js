var common = require('./common')
var DHT = require('../')
var test = require('tape')
var EC = require('elliptic').ec
var sha = require('sha.js')

test('local mutable put/get', function (t) {
  t.plan(3)

  var keypair = new EC('ed25519').genKeyPair()

  var dht = new DHT({ bootstrap: false })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    var value = Buffer(500).fill('abc')
    var sig = keypair.sign(value)
    var opts = {
      k: bpad(32, Buffer(keypair.getPublic().x.toArray())),
      seq: 0,
      value: value,
      sig: Buffer.concat([
        bpad(32, Buffer(sig.r.toArray())),
        bpad(32, Buffer(sig.s.toArray()))
      ])
    }
    var expectedHash = sha('sha1').update(opts.k).digest()
 
    dht.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )
      dht.get(hash, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString('utf8'), opts.value.toString('utf8'),
          'got back what we put in'
        )
      })
    })
  })
})

test('multiparty mutable put/get', function (t) {
  t.plan(3)

  var keypair = new EC('ed25519').genKeyPair()

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })
 
  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var pending = 2
  dht1.listen(function () {
    dht2.addNode('127.0.0.1:' + dht1.address().port)
    dht2.once('node', ready)
  })
 
  dht2.listen(function () {
    dht1.addNode('127.0.0.1:' + dht2.address().port)
    dht1.once('node', ready)
  })

  function ready () {
    if (-- pending !== 0) return
    var value = Buffer(500).fill('abc')
    var sig = keypair.sign(value)
    var opts = {
      k: bpad(32, Buffer(keypair.getPublic().x.toArray())),
      seq: 0,
      value: value,
      sig: bpad(64, Buffer.concat([
        Buffer(sig.r.toArray()),
        Buffer(sig.s.toArray())
      ]))
    }
    var expectedHash = sha('sha1').update(opts.k).digest()
 
    dht1.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )
      dht2.get(hash, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString('utf8'), opts.value.toString('utf8'),
          'got back what we put in'
        )
      })
    })
  }
})

function bpad (n, buf) {
  if (buf.length === n) return buf
  if (buf.length < n) {
    var b = new Buffer(n)
    buf.copy(b, n - buf.length)
    for (var i = 0; i < n - buf.length; i++) b[i] = 0
    return b
  }
}
