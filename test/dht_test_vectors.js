const common = require('./common')
const DHT = require('../')
const test = require('tape')
const crypto = require('crypto')
const ed = require('bittorrent-dht-sodium')

// test vectors from http://bittorrent.org/beps/bep_0044.html
test('dht store test vectors - test 1 (mutable)', t => {
  t.plan(5)

  const pub = Buffer.from(
    '77ff84905a91936367c01360803104f92432fcd904a43511876df5cdf3e7e548',
    'hex'
  )
  const value = 'Hello World!'

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
    const opts = {
      k: pub,
      seq: 1,
      v: value,
      sign (buf) {
        t.equal(buf.toString(), '3:seqi1e1:v12:Hello World!')
        const sig = Buffer.from(
          '305ac8aeb6c9c151fa120f120ea2cfb923564e11552d06a5d856091e5e853cff' +
          '1260d3f39e4999684aa92eb73ffd136e6f4f3ecbfda0ce53a1608ecd7ae21f01',
          'hex'
        )
        return sig
      }
    }

    const expectedHash = crypto.createHash('sha1').update(opts.k).digest()

    dht.put(opts, (_, hash) => {
      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )

      dht.get(hash, (err, res) => {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
        t.equal(res.seq, 1)
      })
    })
  }
})

test('dht store test vectors - test 2 (mutable with salt)', t => {
  t.plan(5)

  const pub = Buffer.from(
    '77ff84905a91936367c01360803104f92432fcd904a43511876df5cdf3e7e548',
    'hex'
  )
  const value = 'Hello World!'

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
    const opts = {
      k: pub,
      seq: 1,
      v: Buffer.from(value),
      salt: Buffer.from('foobar'),
      sign (buf) {
        t.equal(buf.toString(), '4:salt6:foobar3:seqi1e1:v12:Hello World!', 'encodings match')
        const sig = Buffer.from(
          '6834284b6b24c3204eb2fea824d82f88883a3d95e8b4a21b8c0ded553d17d17d' +
          'df9a8a7104b1258f30bed3787e6cb896fca78c58f8e03b5f18f14951a87d9a08',
          'hex'
        )
        return sig
      }
    }

    dht.put(opts, (_, hash) => {
      t.equal(
        hash.toString('hex'),
        '411eba73b6f087ca51a3795d9c8c938d365e32c1',
        'hashes match'
      )

      dht.get(hash, (err, res) => {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
        t.equal(res.seq, 1)
      })
    })
  }
})
