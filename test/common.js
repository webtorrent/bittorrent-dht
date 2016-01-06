var crypto = require('crypto')
var ip = require('ip')

exports.failOnWarningOrError = function (t, dht) {
  dht.on('warning', function (err) { t.fail(err) })
  dht.on('error', function (err) { t.fail(err) })
}

exports.randomHost = function () {
  return ip.toString(crypto.randomBytes(4))
}

exports.randomPort = function () {
  return crypto.randomBytes(2).readUInt16LE(0)
}

exports.randomAddr = function () {
  return { host: exports.randomHost(), port: exports.randomPort() }
}

exports.randomId = function () {
  return crypto.randomBytes(20)
}

exports.addRandomNodes = function (dht, num) {
  for (var i = 0; i < num; i++) {
    dht.addNode({
      id: exports.randomId(),
      host: exports.randomHost(),
      port: exports.randomPort()
    })
  }
}

exports.addRandomPeers = function (dht, num) {
  for (var i = 0; i < num; i++) {
    dht._addPeer(exports.randomAddr(), exports.randomId())
  }
}
