var auto = require('run-auto')
var DHT = require('../')
var portfinder = require('portfinder')
var Server = require('../').Server
var test = require('tape')

test('Ping', function (t) {

  portfinder.getPort(function (err, port) {
    t.error(err, 'got port')

    var dht1 = new DHT({ bootstrap: [] })
    var dht2 = new DHT({ bootstrap: [] })

    dht1.listen(port, function () {
      dht2.ping('127.0.0.1', port, function (err, res) {
        t.error(err, 'got response')
        // TODO

        dht1.destroy()
        dht2.destroy()
        t.end()
      })
    })
  })

})

// var infoHash = '1E69917FBAA2C767BCA463A96B5572785C6D8A12' // Pride & Prejudice

// test('Find nodes (Pride & Prejudice)', function (t) {
//   t.plan(2)

//   // auto({
//   //   port: function (cb) {
//   //     portfinder.getPort(cb)
//   //   },

//   //   server: ['port', function (cb) {
//   //     var server = new Server()
//   //     server.listen
//   //   }]
//   // })

//   var dht = new DHT({
//     // bootstrap: []
//   })
//   dht.setInfoHash(infoHash)
//   dht.findPeers(300)

//   dht.once('node', function (peer) {
//     t.pass('Found at least one other DHT node')
//   })

//   dht.once('peer', function (peer) {
//     t.pass('Found at least one peer that has the file')
//     dht.destroy()
//   })
// })
