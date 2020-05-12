const crypto = require('crypto')
const ed = require('bittorrent-dht-sodium')
const ip = require('ip')

exports.failOnWarningOrError = (t, dht) => {
  dht.on('warning', err => { t.fail(err) })
  dht.on('error', err => { t.fail(err) })
}

exports.randomHost = () => {
  return ip.toString(crypto.randomBytes(4))
}

exports.randomPort = () => {
  return crypto.randomBytes(2).readUInt16LE(0)
}

exports.randomAddr = () => {
  return { host: exports.randomHost(), port: exports.randomPort() }
}

exports.randomId = () => {
  return crypto.randomBytes(20)
}

exports.addRandomNodes = (dht, num) => {
  for (let i = 0; i < num; i++) {
    dht.addNode({
      id: exports.randomId(),
      host: exports.randomHost(),
      port: exports.randomPort()
    })
  }
}

exports.addRandomPeers = (dht, num) => {
  for (let i = 0; i < num; i++) {
    dht._addPeer(exports.randomAddr(), exports.randomId())
  }
}

exports.fill = (n, s) => {
  const bs = Buffer.from(s)
  const b = Buffer.allocUnsafe(n)
  for (let i = 0; i < n; i++) {
    b[i] = bs[i % bs.length]
  }
  return b
}

exports.sign = keypair => {
  return buf => {
    return ed.sign(buf, keypair.sk)
  }
}
