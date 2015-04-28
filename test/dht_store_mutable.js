var common = require('./common')
var DHT = require('../')
var test = require('tape')
var EC = require('elliptic').ec
var sha = require('sha.js')

test('local mutable put/get', function (t) {
  t.plan(3)

  var keypair = new EC('ed25519').genKeyPair()

  var dht = new DHT({ bootstrap: false })
  t.once('end', function () {
    dht.destroy()
  })
  common.failOnWarningOrError(t, dht)

  dht.on('ready', function () {
    var value = Buffer(500).fill('abc')
    var sig = keypair.sign(value)
    var opts = {
      k: bpad(32, Buffer(keypair.getPublic().x.toArray())),
      seq: 0,
      v: value,
      sig: Buffer.concat([
        bpad(32, Buffer(sig.r.toArray())),
        bpad(32, Buffer(sig.s.toArray()))
      ])
    }
    var expectedHash = sha('sha1').update(opts.k).digest()

    dht.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )
      dht.get(hash, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
      })
    })
  })
})

test('multiparty mutable put/get', function (t) {
  t.plan(3)

  var keypair = new EC('ed25519').genKeyPair()

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var pending = 2
  dht1.listen(function () {
    dht2.addNode('127.0.0.1:' + dht1.address().port)
    dht2.once('node', ready)
  })

  dht2.listen(function () {
    dht1.addNode('127.0.0.1:' + dht2.address().port)
    dht1.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    var value = Buffer(500).fill('abc')
    var sig = keypair.sign(value)
    var opts = {
      k: bpad(32, Buffer(keypair.getPublic().x.toArray())),
      seq: 0,
      v: value,
      sig: bpad(64, Buffer.concat([
        Buffer(sig.r.toArray()),
        Buffer(sig.s.toArray())
      ]))
    }
    var expectedHash = sha('sha1').update(opts.k).digest()

    dht1.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )
      dht2.get(hash, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
      })
    })
  }
})

test('multiparty mutable put/get sequence', function (t) {
  t.plan(9)

  var keypair = new EC('ed25519').genKeyPair()

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var pending = 2
  dht1.listen(function () {
    dht2.addNode('127.0.0.1:' + dht1.address().port)
    dht2.once('node', ready)
  })

  dht2.listen(function () {
    dht1.addNode('127.0.0.1:' + dht2.address().port)
    dht1.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    var value = Buffer(500).fill('abc')
    var sig = keypair.sign(value)
    var opts = {
      k: bpad(32, Buffer(keypair.getPublic().x.toArray())),
      seq: 0,
      v: value,
      sig: Buffer.concat([
        bpad(32, Buffer(sig.r.toArray())),
        bpad(32, Buffer(sig.s.toArray()))
      ])
    }
    var expectedHash = sha('sha1').update(opts.k).digest()

    dht1.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )
      dht2.get(hash, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
        putSomethingElse()
      })
    })

    function putSomethingElse () {
      opts.seq ++
      opts.v = Buffer(32).fill('whatever')
      var sig = keypair.sign(opts.v)
      opts.sig = Buffer.concat([
        bpad(32, Buffer(sig.r.toArray())),
        bpad(32, Buffer(sig.s.toArray()))
      ])

      dht1.put(opts, function (errors, hash) {
        errors.forEach(t.error.bind(t))

        t.equal(
          hash.toString('hex'),
          expectedHash.toString('hex'),
          'hash of the public key (again)'
        )
        dht2.get(hash, function (err, buf) {
          t.ifError(err)
          t.equal(buf.toString('utf8'), opts.v.toString('utf8'),
            'second update under the same key'
          )
          yetStillMore()
        })
      })
    }

    function yetStillMore () {
      opts.seq ++
      opts.v = Buffer(999).fill('cool')
      var sig = keypair.sign(opts.v)
      opts.sig = Buffer.concat([
        bpad(32, Buffer(sig.r.toArray())),
        bpad(32, Buffer(sig.s.toArray()))
      ])

      dht1.put(opts, function (errors, hash) {
        errors.forEach(t.error.bind(t))

        t.equal(
          hash.toString('hex'),
          expectedHash.toString('hex'),
          'hash of the public key (yet again)'
        )
        dht2.get(hash, function (err, buf) {
          t.ifError(err)
          t.equal(buf.toString('utf8'), opts.v.toString('utf8'),
            'third update under the same key'
          )
        })
      })
    }
  }
})

test('salted multikey multiparty mutable put/get sequence', function (t) {
  t.plan(9)

  var keypair = new EC('ed25519').genKeyPair()

  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })

  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)

  var pending = 2
  dht1.listen(function () {
    dht2.addNode('127.0.0.1:' + dht1.address().port)
    dht2.once('node', ready)
  })

  dht2.listen(function () {
    dht1.addNode('127.0.0.1:' + dht2.address().port)
    dht1.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    var fvalue = Buffer(500).fill('abc')
    var fsig = keypair.sign(fvalue)
    var fopts = {
      k: bpad(32, Buffer(keypair.getPublic().x.toArray())),
      seq: 0,
      salt: Buffer('first'),
      sig: Buffer.concat([
        bpad(32, Buffer(fsig.r.toArray())),
        bpad(32, Buffer(fsig.s.toArray()))
      ]),
      v: fvalue
    }
    var svalue = Buffer(20).fill('z')
    var ssig = keypair.sign(svalue)
    var sopts = {
      k: fopts.k,
      seq: 0,
      salt: Buffer('second'),
      sig: Buffer.concat([
        bpad(32, Buffer(ssig.r.toArray())),
        bpad(32, Buffer(ssig.s.toArray()))
      ]),
      v: svalue
    }
    var first = sha('sha1').update('first').update(fopts.k).digest()
    var second = sha('sha1').update('second').update(sopts.k).digest()

    dht1.put(fopts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        first.toString('hex'),
        'first hash'
      )
      dht2.get(hash, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString('utf8'), fopts.v.toString('utf8'),
          'got back what we put in'
        )
        putSecondKey()
      })
    })

    function putSecondKey () {
      dht1.put(sopts, function (errors, hash) {
        errors.forEach(t.error.bind(t))

        t.equal(
          hash.toString('hex'),
          second.toString('hex'),
          'second hash'
        )
        dht2.get(hash, function (err, buf) {
          t.ifError(err)
          t.equal(buf.toString('utf8'), sopts.v.toString('utf8'),
            'second update under the same key'
          )
          yetStillMore()
        })
      })
    }

    function yetStillMore () {
      fopts.seq ++
      fopts.v = Buffer(999).fill('cool')
      var sig = keypair.sign(fopts.v)
      fopts.sig = Buffer.concat([
        bpad(32, Buffer(sig.r.toArray())),
        bpad(32, Buffer(sig.s.toArray()))
      ])

      dht1.put(fopts, function (errors, hash) {
        errors.forEach(t.error.bind(t))

        t.equal(
          hash.toString('hex'),
          first.toString('hex'),
          'first salt (again)'
        )
        dht2.get(hash, function (err, buf) {
          t.ifError(err)
          t.equal(buf.toString('utf8'), fopts.v.toString('utf8'),
            'update with a different salt'
          )
        })
      })
    }
  }
})

test('transitive mutable update', function (t) {
  console.error('DISABLED transitive mutable update test')
  return t.end()
  /*
  t.plan(3)

  var keypair = new EC('ed25519').genKeyPair()

  // dht1 <-> dht2 <-> dht3
  var dht1 = new DHT({ bootstrap: false })
  var dht2 = new DHT({ bootstrap: false })
  var dht3 = new DHT({ bootstrap: false })

  t.once('end', function () {
    dht1.destroy()
    dht2.destroy()
    dht3.destroy()
  })
  common.failOnWarningOrError(t, dht1)
  common.failOnWarningOrError(t, dht2)
  common.failOnWarningOrError(t, dht3)

  var pending = 2
  dht1.listen(function () {
    dht2.addNode('127.0.0.1:' + dht1.address().port)
    dht2.once('node', ready)
  })

  dht2.listen(function () {
    dht3.addNode('127.0.0.1:' + dht2.address().port)
    dht3.once('node', ready)
  })

  function ready () {
    if (--pending !== 0) return
    var value = Buffer(500).fill('abc')
    var sig = keypair.sign(value)
    var opts = {
      k: bpad(32, Buffer(keypair.getPublic().x.toArray())),
      seq: 0,
      v: value,
      sig: Buffer.concat([
        bpad(32, Buffer(sig.r.toArray())),
        bpad(32, Buffer(sig.s.toArray()))
      ])
    }
    var expectedHash = sha('sha1').update(opts.k).digest()

    dht1.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))

      t.equal(
        hash.toString('hex'),
        expectedHash.toString('hex'),
        'hash of the public key'
      )

      setTimeout(function () {
        dht3.get(expectedHash, function (err, buf) {
          t.ifError(err)
          t.equal(buf.toString('utf8'), opts.v.toString('utf8'),
            'got node 1 update from node 3'
          )
        })
      }, 1000)
    })
  }
  */
})

function bpad (n, buf) {
  if (buf.length === n) return buf
  if (buf.length < n) {
    var b = new Buffer(n)
    buf.copy(b, n - buf.length)
    for (var i = 0; i < n - buf.length; i++) b[i] = 0
    return b
  }
}
