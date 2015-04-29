var EC = require('elliptic').ec
var Sig = require('elliptic/lib/elliptic/ec/signature.js')

module.exports = function (k, v, sig) {
  var ec = new EC('ed25519')
  var kp2 = ec.keyFromPublic('02' + k.toString('hex'), 'hex')
  if (kp2.verify(v, new Sig(toDER(sig)))) return true

  var kp3 = ec.keyFromPublic('03' + k.toString('hex'), 'hex')
  if (kp3.verify(v, new Sig(toDER(sig)))) return true

  return false
}

function toDER (buf) {
  var r = buf.slice(0, 32)
  var s = buf.slice(32, 64)
  if (r[0] & 0x80) r = [ 0 ].concat(r)
  if (s[0] & 0x80) s = [ 0 ].concat(s)
  var total = r.length + s.length + 4
  return Buffer.concat([
    Buffer([ 0x30, total, 0x02, r.length ]), r,
    Buffer([ 0x02, s.length ]), s
  ])
}
