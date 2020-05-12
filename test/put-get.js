const common = require('./common')
const DHT = require('../')
const test = require('tape')
const ed = require('bittorrent-dht-sodium')
const bencode = require('bencode')

test('dht store with salt', t => {
  t.plan(3)

  const dht = new DHT({ bootstrap: false, verify: ed.verify })
  t.once('end', () => {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.listen(() => {
    dht.addNode({ host: '127.0.0.1', port: dht.address().port })
    dht.once('node', ready)
  })

  function ready () {
    const keys = ed.keygen()
    const publicKey = keys.pk
    const secretKey = keys.sk

    const opts = {
      seq: 1,
      v: Buffer.from('hello world'),
      salt: Buffer.from('mysalt')
    }

    opts.k = publicKey

    const toEncode = { salt: opts.salt, seq: opts.seq, v: opts.v }

    const encoded = bencode
      .encode(toEncode)
      .slice(1, -1)
      .toString()

    opts.sig = ed
      .sign(Buffer.from(encoded), secretKey)

    dht.put(opts, (_, hash) => {
      dht.get(hash, (err, res) => {
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
