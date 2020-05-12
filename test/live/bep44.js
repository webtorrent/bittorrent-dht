const test = require('tape')
const DHT = require('../../')
const ed = require('bittorrent-dht-sodium')

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
    k: k.pk,
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
    return ed.sign(buf, k.sk)
  }
})

test('put mutable (salted)', function (t) {
  const dht1 = new DHT()
  const dht2 = new DHT({ verify: ed.verify })
  const k = kp()
  const salt = ed.salt()

  dht1.put({
    k: k.pk,
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
    return ed.sign(buf, k.sk)
  }
})

function kp () {
  return ed.keygen()
}
