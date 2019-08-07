var common = require('./common')
var DHT = require('../')
var test = require('tape')
var crypto = require('crypto')
var ed = require('ed25519-supercop')

// test vectors from http://bittorrent.org/beps/bep_0044.html
test('dht store test vectors - test 1 (mutable)', function (t) {
  t.plan(6)

  var pub = Buffer.from(
    '77ff84905a91936367c01360803104f92432fcd904a43511876df5cdf3e7e548',
    'hex'
  )
  var priv = Buffer.from(
    'e06d3183d14159228433ed599221b80bd0a5ce8352e4bdf0262f76786ef1c74d' +
    'b7e7a9fea2c0eb269d61e3b38e450a22e754941ac78479d6c54e1faf6037881d',
    'hex'
  )
  var value = 'Hello World!'

  var dht = new DHT({ bootstrap: false, verify: ed.verify })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.listen(function () {
    dht.addNode({ host: '127.0.0.1', port: dht.address().port })
    dht.once('node', ready)
  })

  function ready () {
    var opts = {
      k: pub,
      seq: 1,
      v: value,
      sign: function (buf) {
        t.equal(buf.toString(), '3:seqi1e1:v12:Hello World!')
        var sig = ed.sign(buf, pub, priv)
        t.equal(
          sig.toString('hex'),
          '305ac8aeb6c9c151fa120f120ea2cfb923564e11552d06a5d856091e5e853cff' +
          '1260d3f39e4999684aa92eb73ffd136e6f4f3ecbfda0ce53a1608ecd7ae21f01'
        )
        return sig
      }
    }

    var expectedHash = crypto.createHash('sha1').update(opts.k).digest()

    dht.put(opts, function (_, hash) {
      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )

      dht.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
        t.equal(res.seq, 1)
      })
    })
  }
})

test('dht store test vectors - test 2 (mutable with salt)', function (t) {
  t.plan(6)

  var pub = Buffer.from(
    '77ff84905a91936367c01360803104f92432fcd904a43511876df5cdf3e7e548',
    'hex'
  )
  var priv = Buffer.from(
    'e06d3183d14159228433ed599221b80bd0a5ce8352e4bdf0262f76786ef1c74d' +
    'b7e7a9fea2c0eb269d61e3b38e450a22e754941ac78479d6c54e1faf6037881d',
    'hex'
  )
  var value = 'Hello World!'

  var dht = new DHT({ bootstrap: false, verify: ed.verify })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.listen(function () {
    dht.addNode({ host: '127.0.0.1', port: dht.address().port })
    dht.once('node', ready)
  })

  function ready () {
    var opts = {
      k: pub,
      seq: 1,
      v: Buffer.from(value),
      salt: Buffer.from('foobar'),
      sign: function (buf) {
        t.equal(buf.toString(), '4:salt6:foobar3:seqi1e1:v12:Hello World!', 'encodings match')
        var sig = ed.sign(buf, pub, priv)
        t.equal(
          sig.toString('hex'),
          '6834284b6b24c3204eb2fea824d82f88883a3d95e8b4a21b8c0ded553d17d17d' +
          'df9a8a7104b1258f30bed3787e6cb896fca78c58f8e03b5f18f14951a87d9a08',
          'signatures match'
        )
        return sig
      }
    }

    dht.put(opts, function (_, hash) {
      t.equal(
        hash.toString('hex'),
        '411eba73b6f087ca51a3795d9c8c938d365e32c1',
        'hashes match'
      )

      dht.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
        t.equal(res.seq, 1)
      })
    })
  }
})
