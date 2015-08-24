var common = require('./common')
var DHT = require('../')
var test = require('tape')
var sha = require('sha.js')
var bencode = require('bencode')

var ed = require('ed25519-supercop')

// test vectors from http://bittorrent.org/beps/bep_0044.html
test('dht store test vectors', function (t) {
  t.plan(6)

  var pub = Buffer(
    '77ff84905a91936367c01360803104f92432fcd904a43511876df5cdf3e7e548',
    'hex'
  )
  var priv = Buffer(
    'e06d3183d14159228433ed599221b80bd0a5ce8352e4bdf0262f76786ef1c74d'
    + 'b7e7a9fea2c0eb269d61e3b38e450a22e754941ac78479d6c54e1faf6037881d',
    'hex'
  )
  var value = 'Hello World!'

  var dht = new DHT({ bootstrap: false, verify: ed.verify })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    var opts = {
      k: pub,
      seq: 1,
      v: value
    }
    var svalue = bencode.encode({
      seq: opts.seq,
      v: opts.v
    }).slice(1, -1)
    t.equal(svalue.toString(), '3:seqi1e1:v12:Hello World!')

    var sig = ed.sign(svalue, pub, priv)
    opts.sig = sig
    t.equal(
      sig.toString('hex'),
      '305ac8aeb6c9c151fa120f120ea2cfb923564e11552d06a5d856091e5e853cff'
      + '1260d3f39e4999684aa92eb73ffd136e6f4f3ecbfda0ce53a1608ecd7ae21f01'
    )
    var expectedHash = sha('sha1').update(opts.k).digest()

    dht.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

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
        t.equal(res.seq, 0)
      })
    })
  })
})
