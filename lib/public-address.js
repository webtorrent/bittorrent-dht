var get = require('simple-get')
var thunky = require('thunky')

module.exports = thunky(function publicAddress (cb) {
  var req = get.concat('https://myexternalip.com/raw', function (err, data, res) {
    if (err) return cb(err)
    if (res.statusCode !== 200) return cb(new Error('got status ' + res.statusCode))

    var ip = data.toString().replace(/\n/g, '')
    cb(null, ip)
  })
  req.on('socket', function (socket) {
    if (socket.unref) socket.unref()
  })
})
