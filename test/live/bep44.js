const test = require('tape')
const DHT = require('../../')
const ed = require('ed25519-supercop')

test('Set and get before ready is emitted', t => {
  const dht1 = new DHT()
  const dht2 = new DHT()

  dht1.put({ v: 'myvalue' }, (err, hash, n) => {
    t.error(err)
    t.ok(hash)
    dht2.get(hash, (err, value) => {
      t.error(err)
      t.same(value.v.toString(), 'myvalue')
      dht1.destroy()
      dht2.destroy()
      t.end()
    })
  })
})

test('put mutable', t => {
  const dht1 = new DHT()
  const dht2 = new DHT({ verify: ed.verify })
  const k = kp()

  dht1.put({
    k: k.publicKey,
    v: 'myvalue',
    sign,
    seq: 0
  }, (err, hash, n) => {
    t.error(err)
    t.ok(hash)
    dht2.get(hash, (err, value) => {
      t.error(err)
      t.same(value.v.toString(), 'myvalue')
      dht1.destroy()
      dht2.destroy()
      t.end()
    })
  })

  function sign (buf) {
    return ed.sign(buf, k.publicKey, k.secretKey)
  }
})

test('put mutable (salted)', t => {
  const dht1 = new DHT()
  const dht2 = new DHT({ verify: ed.verify })
  const k = kp()
  const salt = ed.createSeed().slice(0, 20)

  dht1.put({
    k: k.publicKey,
    v: 'myvalue',
    sign,
    seq: 0,
    salt
  }, (err, hash, n) => {
    t.error(err)
    t.ok(hash)
    dht2.get(hash, (_, value) => {
      t.ok(!value, 'salt required')
      dht2.get(hash, { salt }, (err, value) => {
        t.error(err)
        t.same(value.v.toString(), 'myvalue')
        dht1.destroy()
        dht2.destroy()
        t.end()
      })
    })
  })

  function sign (buf) {
    return ed.sign(buf, k.publicKey, k.secretKey)
  }
})

function kp () {
  return ed.createKeyPair(ed.createSeed())
}
