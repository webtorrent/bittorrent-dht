module.exports = function bpad (n, buf) {
  if (buf.length === n) return buf
  if (buf.length < n) {
    var b = new Buffer(n)
    buf.copy(b, n - buf.length)
    for (var i = 0; i < n - buf.length; i++) b[i] = 0
    return b
  }
}
