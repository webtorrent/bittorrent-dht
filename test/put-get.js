var common = require('./common')
var DHT = require('../')
var test = require('tape')
var ed = require('bittorrent-dht-sodium')
var bencode = require('bencode')

test('dht store with salt', function (t) {
  t.plan(3)

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
    var keys = ed.keygen()
    var publicKey = keys.pk
    var secretKey = keys.sk

    var opts = {
      seq: 1,
      v: Buffer.from('hello world'),
      salt: Buffer.from('mysalt')
    }

    opts.k = publicKey

    var toEncode = { salt: opts.salt, seq: opts.seq, v: opts.v }

    var encoded = bencode
      .encode(toEncode)
      .slice(1, -1)
      .toString()

    opts.sig = ed
      .sign(Buffer.from(encoded), secretKey)

    dht.put(opts, function (_, hash) {
      dht.get(hash, function (err, res) {
        t.ifError(err)

        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )

        t.equal(res.seq, 1)
        t.end()
      })
    })
  }
})
