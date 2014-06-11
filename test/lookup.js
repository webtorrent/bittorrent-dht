var DHT = require('../')
var hat = require('hat')
var portfinder = require('portfinder')
var test = require('tape')

// function createNetwork (num) {
//   var dhts = []
//   for (var i = 0; i < num; i++) {
//     dhts.push(new DHT())
//   }
// }

test('Find nodes (Pride & Prejudice)', function (t) {
  t.plan(2)

  var dht = new DHT()

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
    dht.destroy(function () {
      t.pass('dht destroyed')
    })
  })
})

test('Find nodes (Pride & Prejudice)', function (t) {
  t.plan(2)

  var infoHash = '1E69917FBAA2C767BCA463A96B5572785C6D8A12' // Pride & Prejudice

  var dht = new DHT()
  setTimeout(function () {
    // HACK HACK HACK
    dht.lookup(infoHash)
  }, 10000)

  dht.once('node', function (node) {
    t.pass('Found at least one other DHT node')
  })

  dht.once('peer', function (peer) {
    t.pass('Found at least one peer that has the file')
    dht.destroy()
  })
})
