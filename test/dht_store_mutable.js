var common = require('./common')
var DHT = require('../')
var bpad = require('../lib/bpad.js')
var test = require('tape')
var EC = require('elliptic').ec
var sha = require('sha.js')

test('local mutable put/get', function (t) {
  t.plan(4)

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
      dht.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'got back what we put in'
        )
        t.equal(res.seq, 0)
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
      dht2.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
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
      dht2.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
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
        dht2.get(hash, function (err, res) {
          t.ifError(err)
          t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
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
        dht2.get(hash, function (err, res) {
          t.ifError(err)
          t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
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
      dht2.get(hash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), fopts.v.toString('utf8'),
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
        dht2.get(hash, function (err, res) {
          t.ifError(err)
          t.equal(res.v.toString('utf8'), sopts.v.toString('utf8'),
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
        dht2.get(hash, function (err, res) {
          t.ifError(err)
          t.equal(res.v.toString('utf8'), fopts.v.toString('utf8'),
            'update with a different salt'
          )
        })
      })
    }
  }
})

test('transitive mutable update', function (t) {
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

      dht3.get(expectedHash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'got node 1 update from node 3'
        )
      })
    })
  }
})

test('mutable update mesh', function (t) {
  t.plan(9)
  /*
    0 <-> 1 <-> 2
          ^     ^
          |     |
          v     v
          3 <-> 4 <-> 5
          ^           ^
          |           |
          v           v
          6 <-> 7 <-> 8

    tests: 0 to 8, 4 to 6, 1 to 5
  */
  var edges = [
    [0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [3, 6],
    [4, 5], [5, 8], [6, 7], [7, 8]
  ]

  var dht = []
  var pending = 0
  for (var i = 0; i < 9; i++) {
    (function (i) {
      var d = new DHT({ bootstrap: false })
      dht.push(d)
      common.failOnWarningOrError(t, d)
      pending++
      d.listen(function () {
        if (--pending === 0) addEdges()
      })
    })(i)
  }

  function addEdges () {
    var pending = edges.length
    for (var i = 0; i < edges.length; i++) {
      (function (e) {
        dht[e[1]].addNode('127.0.0.1:' + dht[e[0]].address().port)
        dht[e[1]].once('node', function () {
          if (--pending === 0) ready()
        })
      })(edges[i])
    }
  }

  t.once('end', function () {
    for (var i = 0; i < dht.length; i++) {
      dht[i].destroy()
    }
  })

  function ready () {
    send(0, 8, Buffer(100).fill('abc'))
    send(4, 6, Buffer(20).fill('xyz'))
    send(1, 5, Buffer(500).fill('whatever'))
  }

  function send (srci, dsti, value) {
    var src = dht[srci], dst = dht[dsti]
    var keypair = new EC('ed25519').genKeyPair()
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
    var xhash = sha('sha1').update(opts.k).digest()
    src.put(opts, function (errors, hash) {
      errors.forEach(t.error.bind(t))
      t.equal(hash.toString('hex'), xhash.toString('hex'))

      dst.get(xhash, function (err, res) {
        t.ifError(err)
        t.equal(res.v.toString('utf8'), opts.v.toString('utf8'),
          'from ' + srci + ' to ' + dsti
        )
      })
    })
  }
})
