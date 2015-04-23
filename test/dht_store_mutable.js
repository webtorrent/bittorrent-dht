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
      k: Buffer(keypair.getPublic().x.toArray()), // public key (32 bytes)
      seq: 0,
      value: value,
      sig: Buffer.concat([
        Buffer(sig.r.toArray()),
        Buffer(sig.s.toArray())
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
