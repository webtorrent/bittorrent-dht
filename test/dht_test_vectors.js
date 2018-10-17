const Buffer = require('safe-buffer').Buffer
const common = require('./common')
const DHT = require('../')
const test = require('tape')
const crypto = require('crypto')
const ed = require('ed25519-supercop')

// test vectors from http://bittorrent.org/beps/bep_0044.html
test('dht store test vectors', t => {
  t.plan(6)

  const pub = Buffer.from(
    '77ff84905a91936367c01360803104f92432fcd904a43511876df5cdf3e7e548',
    'hex'
  )
  const priv = Buffer.from(
    'e06d3183d14159228433ed599221b80bd0a5ce8352e4bdf0262f76786ef1c74d' +
    'b7e7a9fea2c0eb269d61e3b38e450a22e754941ac78479d6c54e1faf6037881d',
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
        const sig = ed.sign(buf, pub, priv)
        t.equal(
          sig.toString('hex'),
          '305ac8aeb6c9c151fa120f120ea2cfb923564e11552d06a5d856091e5e853cff' +
          '1260d3f39e4999684aa92eb73ffd136e6f4f3ecbfda0ce53a1608ecd7ae21f01'
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
