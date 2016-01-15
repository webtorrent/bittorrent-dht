var test = require('tape')
var DHT = require('../../')

test('Set and get before ready is emitted', function (t) {
  var dht1 = new DHT()
  var dht2 = new DHT()

  dht1.put({v: 'myvalue'}, function (err, hash, n) {
    t.error(err)
    t.ok(hash)
    dht2.get(hash, function (err, value) {
      t.error(err)
      t.same(value.v.toString(), 'myvalue')
      dht1.destroy()
      dht2.destroy()
      t.end()
    })
  })
})
