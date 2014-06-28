var crypto = require('crypto')
var hat = require('hat')
var ip = require('ip')

exports.failOnWarningOrError = function (t, dht) {
  dht.on('warning', function (err) { t.fail(err) })
  dht.on('error', function (err) { t.fail(err) })
}

exports.randomAddr = function () {
  var host = ip.toString(crypto.randomBytes(4))
  var port = crypto.randomBytes(2).readUInt16LE(0)
  return host + ':' + port
}

exports.randomId = function () {
  return new Buffer(hat(160), 'hex')
}

exports.addRandomNodes = function (dht, num) {
  for (var i = 0; i < num; i++) {
    dht.addNode(exports.randomAddr(), exports.randomId())
  }
}

exports.addRandomPeers = function (dht, num) {
  for (var i = 0; i < num; i++) {
    dht._addPeer(exports.randomAddr(), exports.randomId())
  }
}
