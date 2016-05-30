var Buffer = require('safe-buffer').Buffer
var crypto = require('crypto')
var ed = require('ed25519-supercop')
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

exports.fill = function (n, s) {
  var bs = Buffer(s)
  var b = Buffer.allocUnsafe(n)
  for (var i = 0; i < n; i++) {
    b[i] = bs[i % bs.length]
  }
  return b
}

exports.sign = function (keypair) {
  return function (buf) {
    return ed.sign(buf, keypair.publicKey, keypair.secretKey)
  }
}
