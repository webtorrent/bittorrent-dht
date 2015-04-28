var EC = require('elliptic').ec
var Sig = require('elliptic/lib/elliptic/ec/signature.js')

var ec = new EC('ed25519')
var kp = ec.genKeyPair()
var buf = new Buffer(20).fill('a')
var sig = kp.sign(buf)

var k = Buffer(kp.getPublic(true, 'hex'), 'hex')
console.log('k=' + k.toString('hex'), k.length)
var msg = {
  k: bpad(32, Buffer(kp.getPublic(true, 'hex'), 'hex').slice(1)),
  v: buf,
  sig: Buffer.concat([
    bpad(32, Buffer(sig.r.toArray())),
    bpad(32, Buffer(sig.s.toArray()))
  ])
}
console.log(verify(msg))

function verify (msg) {
  var ec = new EC('ed25519')
  var kp2 = ec.keyFromPublic('02' + msg.k.toString('hex'), 'hex')
  if (kp2.verify(msg.v, new Sig(toDER(msg.sig)))) return true

  var kp3 = ec.keyFromPublic('03' + msg.k.toString('hex'), 'hex')
  if (kp3.verify(msg.v, new Sig(toDER(msg.sig)))) return true

  return false
}

function toDER (buf) {
  var r = buf.slice(0, 32)
  var s = buf.slice(32, 64)
  if (r[0] & 0x80)
    r = [ 0 ].concat(r)
  if (s[0] & 0x80)
    s = [ 0 ].concat(s)
  var total = r.length + s.length + 4 
  return Buffer.concat([
    Buffer([ 0x30, total, 0x02, r.length ]), r,
    Buffer([ 0x02, s.length ]), s
  ])
}

function bpad (n, buf) {
  if (buf.length === n) return buf
  if (buf.length < n) {
    var b = new Buffer(n)
    buf.copy(b, n - buf.length)
    for (var i = 0; i < n - buf.length; i++) b[i] = 0
    return b
  }
}
