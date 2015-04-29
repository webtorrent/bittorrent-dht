var EC = require('elliptic').ec
var bpad = require('./bpad.js')

module.exports = function (kp, v) {
  var k = Buffer(kp.getPublic(true, 'hex'), 'hex')
  var sig = kp.sign(v)
  return {
    k: bpad(32, Buffer(kp.getPublic(true, 'hex'), 'hex').slice(1)),
    v: v,
    sig: Buffer.concat([
      bpad(32, Buffer(sig.r.toArray())),
      bpad(32, Buffer(sig.s.toArray()))
    ])
  }
}
