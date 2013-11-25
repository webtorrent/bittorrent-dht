var DHT = require('../')
var once = require('once')
var test = require('tape')

// TODO: Improve reliability by not using live network

test('Find nodes (Pride & Prejudice)', function (t) {
  t.plan(1)

  var hash = '1E69917FBAA2C767BCA463A96B5572785C6D8A12' // Pride & Prejudice
  var dht = new DHT(new Buffer(hash, 'hex'))
  dht.findPeers(300)

  dht.on('node', once(function (peer) {
    t.pass('Found at least one other DHT node')
    dht.close()
  }))

  // TODO
  // dht.on('peer', once(function (peer) {
  //   t.pass('Found at least one peer that has the file')
  // }))
})