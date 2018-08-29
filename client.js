module.exports = DHT

var bencode = require('bencode')
var Buffer = require('safe-buffer').Buffer
var debug = require('debug')('bittorrent-dht')
var equals = require('buffer-equals')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var KBucket = require('k-bucket')
var krpc = require('k-rpc')
var LRU = require('lru')
var randombytes = require('randombytes')
var simpleSha1 = require('simple-sha1')
var records = require('record-cache')
var low = require('last-one-wins')

var ROTATE_INTERVAL = 5 * 60 * 1000 // rotate secrets every 5 minutes
var BUCKET_OUTDATED_TIMESPAN = 15 * 60 * 1000 // check nodes in bucket in 15 minutes old buckets

inherits(DHT, EventEmitter)

function DHT (opts) {
  if (!(this instanceof DHT)) return new DHT(opts)
  if (!opts) opts = {}

  var self = this

  this._tables = LRU({ maxAge: ROTATE_INTERVAL, max: opts.maxTables || 1000 })
  this._values = LRU(opts.maxValues || 1000)
  this._peers = records({
    maxAge: opts.maxAge || 0,
    maxSize: opts.maxPeers || 10000
  })

  this._secrets = null
  this._hash = opts.hash || sha1
  this._hashLength = this._hash(Buffer.from('')).length
  this._rpc = opts.krpc || krpc(Object.assign({ idLength: this._hashLength }, opts))
  this._rpc.on('query', onquery)
  this._rpc.on('node', onnode)
  this._rpc.on('warning', onwarning)
  this._rpc.on('error', onerror)
  this._rpc.on('listening', onlistening)
  this._rotateSecrets()
  this._verify = opts.verify || null
  this._host = opts.host || null
  this._interval = setInterval(rotateSecrets, ROTATE_INTERVAL)
  this._runningBucketCheck = false
  this._bucketCheckTimeout = null
  this._bucketOutdatedTimeSpan = opts.timeBucketOutdated || BUCKET_OUTDATED_TIMESPAN

  this.listening = false
  this.destroyed = false
  this.nodeId = this._rpc.id
  this.nodes = this._rpc.nodes

  // ensure only *one* ping it running at the time to avoid infinite async
  // ping recursion, and make the latest one is always ran, but inbetween ones
  // are disregarded
  var onping = low(ping)

  this._rpc.on('ping', function (older, swap) {
    onping({ older: older, swap: swap })
  })

  process.nextTick(bootstrap)

  EventEmitter.call(this)
  this._debug('new DHT %s', this.nodeId)

  function ping (opts, cb) {
    var older = opts.older
    var swap = opts.swap

    self._debug('received ping', older)
    self._checkNodes(older, false, function (_, deadNode) {
      if (deadNode) {
        self._debug('swaping dead node with newer', deadNode)
        swap(deadNode)
        return cb()
      }

      self._debug('no node added, all other nodes ok')
      cb()
    })
  }

  function onlistening () {
    self.listening = true
    self._debug('listening %d', self.address().port)
    self.updateBucketTimestamp()
    self._setBucketCheckInterval()
    self.emit('listening')
  }

  function onquery (query, peer) {
    self._onquery(query, peer)
  }

  function rotateSecrets () {
    self._rotateSecrets()
  }

  function bootstrap () {
    if (!self.destroyed) self._bootstrap(opts.bootstrap !== false)
  }

  function onwarning (err) {
    self.emit('warning', err)
  }

  function onerror (err) {
    self.emit('error', err)
  }

  function onnode (node) {
    self.emit('node', node)
  }
}

DHT.prototype._setBucketCheckInterval = function () {
  var self = this
  var interval = 1 * 60 * 1000 // check age of bucket every minute

  this._runningBucketCheck = true
  queueNext()

  function checkBucket () {
    const diff = Date.now() - self._rpc.nodes.metadata.lastChange

    if (diff < self._bucketOutdatedTimeSpan) return queueNext()

    self._pingAll(function () {
      if (self.destroyed) return

      if (self.nodes.toArray().length < 1) {
        // node is currently isolated,
        // retry with initial bootstrap nodes
        self._bootstrap(true)
      }

      queueNext()
    })
  }

  function queueNext () {
    if (!self._runningBucketCheck || self.destroyed) return
    var nextTimeout = Math.floor(Math.random() * interval + interval / 2)
    self._bucketCheckTimeout = setTimeout(checkBucket, nextTimeout)
  }
}

DHT.prototype._pingAll = function (cb) {
  this._checkAndRemoveNodes(this.nodes.toArray(), cb)
}

DHT.prototype.removeBucketCheckInterval = function () {
  this._runningBucketCheck = false
  clearTimeout(this._bucketCheckTimeout)
}

DHT.prototype.updateBucketTimestamp = function () {
  this._rpc.nodes.metadata.lastChange = Date.now()
}

DHT.prototype._checkAndRemoveNodes = function (nodes, cb) {
  var self = this

  this._checkNodes(nodes, true, function (_, node) {
    if (node) self.removeNode(node.id)
    cb(null, node)
  })
}

DHT.prototype._checkNodes = function (nodes, force, cb) {
  var self = this

  test(nodes)

  function test (acc) {
    var current = null

    while (acc.length) {
      current = acc.pop()
      if (!current.id || force) break
      if (Date.now() - (current.seen || 0) > 10000) break // not pinged within 10s
      current = null
    }

    if (!current) return cb(null)

    self._sendPing(current, function (err) {
      if (!err) {
        self.updateBucketTimestamp()
        return test(acc)
      }
      cb(null, current)
    })
  }
}

DHT.prototype.addNode = function (node) {
  var self = this
  if (node.id) {
    node.id = toBuffer(node.id)
    var old = !!this._rpc.nodes.get(node.id)
    this._rpc.nodes.add(node)
    if (!old) {
      this.emit('node', node)
      this.updateBucketTimestamp()
    }
    return
  }
  this._sendPing(node, function (_, node) {
    if (node) self.addNode(node)
  })
}

DHT.prototype.removeNode = function (id) {
  this._rpc.nodes.remove(toBuffer(id))
}

DHT.prototype._sendPing = function (node, cb) {
  var self = this
  var expectedId = node.id
  this._rpc.query(node, { q: 'ping' }, function (err, pong, node) {
    if (err) return cb(err)
    if (!pong.r || !pong.r.id || !Buffer.isBuffer(pong.r.id) || pong.r.id.length !== self._hashLength) {
      return cb(new Error('Bad reply'))
    }
    if (Buffer.isBuffer(expectedId) && !expectedId.equals(pong.r.id)) {
      return cb(new Error('Unexpected node id'))
    }

    self.updateBucketTimestamp()
    cb(null, {
      id: pong.r.id,
      host: node.host || node.address,
      port: node.port
    })
  })
}

DHT.prototype.toJSON = function () {
  var self = this
  var values = {}
  Object.keys(this._values.cache).forEach(function (key) {
    var value = self._values.cache[key].value
    values[key] = {
      v: value.v.toString('hex'),
      id: value.id.toString('hex')
    }
    if (value.seq != null) values[key].seq = value.seq
    if (value.sig != null) values[key].sig = value.sig.toString('hex')
    if (value.k != null) values[key].k = value.k.toString('hex')
  })
  return {
    nodes: this._rpc.nodes.toArray().map(toNode),
    values: values
  }
}

DHT.prototype.put = function (opts, cb) {
  if (Buffer.isBuffer(opts) || typeof opts === 'string') opts = { v: opts }
  var isMutable = !!opts.k
  if (opts.v === undefined) {
    throw new Error('opts.v not given')
  }
  if (opts.v.length >= 1000) {
    throw new Error('v must be less than 1000 bytes in put()')
  }
  if (isMutable && opts.cas !== undefined && typeof opts.cas !== 'number') {
    throw new Error('opts.cas must be an integer if provided')
  }
  if (isMutable && opts.k.length !== 32) {
    throw new Error('opts.k ed25519 public key must be 32 bytes')
  }
  if (isMutable && typeof opts.sign !== 'function' && !Buffer.isBuffer(opts.sig)) {
    throw new Error('opts.sign function or options.sig signature is required for mutable put')
  }
  if (isMutable && opts.salt && opts.salt.length > 64) {
    throw new Error('opts.salt is > 64 bytes long')
  }
  if (isMutable && opts.seq === undefined) {
    throw new Error('opts.seq not provided for a mutable update')
  }
  if (isMutable && typeof opts.seq !== 'number') {
    throw new Error('opts.seq not an integer')
  }

  return this._put(opts, cb)
}

DHT.prototype._put = function (opts, cb) {
  if (!cb) cb = noop

  var isMutable = !!opts.k
  var v = typeof opts.v === 'string' ? Buffer.from(opts.v) : opts.v
  var key = isMutable
    ? this._hash(opts.salt ? Buffer.concat([opts.k, opts.salt]) : opts.k)
    : this._hash(bencode.encode(v))

  var table = this._tables.get(key.toString('hex'))
  if (!table) return this._preput(key, opts, cb)

  var message = {
    q: 'put',
    a: {
      id: this._rpc.id,
      token: null, // queryAll sets this
      v: v
    }
  }

  if (isMutable) {
    if (typeof opts.cas === 'number') message.a.cas = opts.cas
    if (opts.salt) message.a.salt = opts.salt
    message.a.k = opts.k
    message.a.seq = opts.seq
    if (typeof opts.sign === 'function') message.a.sig = opts.sign(encodeSigData(message.a))
    else if (Buffer.isBuffer(opts.sig)) message.a.sig = opts.sig
  } else {
    this._values.set(key.toString('hex'), message.a)
  }

  this._rpc.queryAll(table.closest(key), message, null, function (err, n) {
    if (err) return cb(err, key, n)
    cb(null, key, n)
  })

  return key
}

DHT.prototype._preput = function (key, opts, cb) {
  var self = this

  this._closest(key, {
    q: 'get',
    a: {
      id: this._rpc.id,
      target: key
    }
  }, null, function (err, n) {
    if (err) return cb(err)
    self.put(opts, cb)
  })

  return key
}

DHT.prototype.get = function (key, opts, cb) {
  key = toBuffer(key)
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }

  if (!opts) opts = {}
  var verify = opts.verify || this._verify
  var hash = this._hash
  var value = this._values.get(key.toString('hex')) || null

  if (value && (opts.cache !== false)) {
    value = createGetResponse(this._rpc.id, null, value)
    return process.nextTick(done)
  }

  this._closest(key, {
    q: 'get',
    a: {
      id: this._rpc.id,
      target: key
    }
  }, onreply, done)

  function done (err) {
    if (err) return cb(err)
    cb(null, value)
  }

  function onreply (message) {
    var r = message.r
    if (!r || !r.v) return true

    var isMutable = r.k || r.sig

    if (opts.salt) r.salt = Buffer.from(opts.salt)

    if (isMutable) {
      if (!verify || !r.sig || !r.k) return true
      if (!verify(r.sig, encodeSigData(r), r.k)) return true
      if (equals(hash(r.salt ? Buffer.concat([r.k, r.salt]) : r.k), key)) {
        if (!value || r.seq > value.seq) value = r
      }
    } else {
      if (equals(hash(bencode.encode(r.v)), key)) {
        value = r
        return false
      }
    }

    return true
  }
}

DHT.prototype.announce = function (infoHash, port, cb) {
  if (typeof port === 'function') return this.announce(infoHash, 0, port)
  infoHash = toBuffer(infoHash)
  if (!cb) cb = noop

  var table = this._tables.get(infoHash.toString('hex'))
  if (!table) return this._preannounce(infoHash, port, cb)

  if (this._host) {
    var dhtPort = this.listening ? this.address().port : 0
    this._addPeer(
      { host: this._host, port: port || dhtPort },
      infoHash,
      { host: this._host, port: dhtPort }
    )
  }

  var message = {
    q: 'announce_peer',
    a: {
      id: this._rpc.id,
      token: null, // queryAll sets this
      info_hash: infoHash,
      port: port,
      implied_port: port ? 0 : 1
    }
  }

  this._debug('announce %s %d', infoHash, port)
  this._rpc.queryAll(table.closest(infoHash), message, null, cb)
}

DHT.prototype._preannounce = function (infoHash, port, cb) {
  var self = this

  this.lookup(infoHash, function (err) {
    if (self.destroyed) return cb(new Error('dht is destroyed'))
    if (err) return cb(err)
    self.announce(infoHash, port, cb)
  })
}

DHT.prototype.lookup = function (infoHash, cb) {
  infoHash = toBuffer(infoHash)
  if (!cb) cb = noop
  var self = this
  var aborted = false

  this._debug('lookup %s', infoHash)
  process.nextTick(emit)
  this._closest(infoHash, {
    q: 'get_peers',
    a: {
      id: this._rpc.id,
      info_hash: infoHash
    }
  }, onreply, cb)

  function emit (values, from) {
    if (!values) values = self._peers.get(infoHash.toString('hex'), 100)
    var peers = decodePeers(values)
    for (var i = 0; i < peers.length; i++) {
      self.emit('peer', peers[i], infoHash, from || null)
    }
  }

  function onreply (message, node) {
    if (aborted) return false
    if (message.r.values) emit(message.r.values, node)
  }

  return function abort () { aborted = true }
}

DHT.prototype.address = function () {
  return this._rpc.address()
}

// listen([port], [address], [onlistening])
DHT.prototype.listen = function () {
  this._rpc.bind.apply(this._rpc, arguments)
}

DHT.prototype.destroy = function (cb) {
  if (this.destroyed) {
    if (cb) process.nextTick(cb)
    return
  }
  this.destroyed = true
  var self = this
  clearInterval(this._interval)
  this.removeBucketCheckInterval()
  this._peers.destroy()
  this._debug('destroying')
  this._rpc.destroy(function () {
    self.emit('close')
    if (cb) cb()
  })
}

DHT.prototype._onquery = function (query, peer) {
  var q = query.q.toString()
  this._debug('received %s query from %s:%d', q, peer.address, peer.port)
  if (!query.a) return

  switch (q) {
    case 'ping':
      return this._rpc.response(peer, query, { id: this._rpc.id })

    case 'find_node':
      return this._onfindnode(query, peer)

    case 'get_peers':
      return this._ongetpeers(query, peer)

    case 'announce_peer':
      return this._onannouncepeer(query, peer)

    case 'get':
      return this._onget(query, peer)

    case 'put':
      return this._onput(query, peer)
  }
}

DHT.prototype._onfindnode = function (query, peer) {
  var target = query.a.target
  if (!target) return this._rpc.error(peer, query, [203, '`find_node` missing required `a.target` field'])

  this.emit('find_node', target)

  var nodes = this._rpc.nodes.closest(target)
  this._rpc.response(peer, query, { id: this._rpc.id }, nodes)
}

DHT.prototype._ongetpeers = function (query, peer) {
  var host = peer.address || peer.host
  var infoHash = query.a.info_hash
  if (!infoHash) return this._rpc.error(peer, query, [203, '`get_peers` missing required `a.info_hash` field'])

  this.emit('get_peers', infoHash)

  var r = { id: this._rpc.id, token: this._generateToken(host) }
  var peers = this._peers.get(infoHash.toString('hex'))

  if (peers.length) {
    r.values = peers
    this._rpc.response(peer, query, r)
  } else {
    this._rpc.response(peer, query, r, this._rpc.nodes.closest(infoHash))
  }
}

DHT.prototype._onannouncepeer = function (query, peer) {
  var host = peer.address || peer.host
  var port = query.a.implied_port ? peer.port : query.a.port
  if (!port || typeof port !== 'number' || port <= 0 || port > 65535) return
  var infoHash = query.a.info_hash
  var token = query.a.token
  if (!infoHash || !token) return

  if (!this._validateToken(host, token)) {
    return this._rpc.error(peer, query, [203, 'cannot `announce_peer` with bad token'])
  }

  this.emit('announce_peer', infoHash, { host: host, port: peer.port })

  this._addPeer({ host: host, port: port }, infoHash, { host: host, port: peer.port })
  this._rpc.response(peer, query, { id: this._rpc.id })
}

DHT.prototype._addPeer = function (peer, infoHash, from) {
  this._peers.add(infoHash.toString('hex'), encodePeer(peer.host, peer.port))
  this.emit('announce', peer, infoHash, from)
}

DHT.prototype._onget = function (query, peer) {
  var host = peer.address || peer.host
  var target = query.a.target
  if (!target) return
  var token = this._generateToken(host)
  var value = this._values.get(target.toString('hex'))

  this.emit('get', target, value)

  if (!value) {
    var nodes = this._rpc.nodes.closest(target)
    this._rpc.response(peer, query, { id: this._rpc.id, token: token }, nodes)
  } else {
    this._rpc.response(peer, query, createGetResponse(this._rpc.id, token, value))
  }
}

DHT.prototype._onput = function (query, peer) {
  var host = peer.address || peer.host

  var a = query.a
  if (!a) return
  var v = query.a.v
  if (!v) return
  var id = query.a.id
  if (!id) return

  var token = a.token
  if (!token) return

  if (!this._validateToken(host, token)) {
    return this._rpc.error(peer, query, [203, 'cannot `put` with bad token'])
  }
  if (v.length > 1000) {
    return this._rpc.error(peer, query, [205, 'data payload too large'])
  }

  var isMutable = !!(a.k || a.sig)
  if (isMutable && !a.k && !a.sig) return

  var key = isMutable
    ? this._hash(a.salt ? Buffer.concat([a.k, a.salt]) : a.k)
    : this._hash(bencode.encode(v))
  var keyHex = key.toString('hex')

  this.emit('put', key, v)

  if (isMutable) {
    if (!this._verify) return this._rpc.error(peer, query, [400, 'verification not supported'])
    if (!this._verify(a.sig, encodeSigData(a), a.k)) return
    var prev = this._values.get(keyHex)
    if (prev && typeof a.cas === 'number' && prev.seq !== a.cas) {
      return this._rpc.error(peer, query, [301, 'CAS mismatch, re-read and try again'])
    }
    if (prev && typeof prev.seq === 'number' && !(a.seq > prev.seq)) {
      return this._rpc.error(peer, query, [302, 'sequence number less than current'])
    }
    this._values.set(keyHex, { v: v, k: a.k, salt: a.salt, sig: a.sig, seq: a.seq, id: id })
  } else {
    this._values.set(keyHex, { v: v, id: id })
  }

  this._rpc.response(peer, query, { id: this._rpc.id })
}

DHT.prototype._bootstrap = function (populate) {
  var self = this
  if (!populate) return process.nextTick(ready)

  this._rpc.populate(self._rpc.id, {
    q: 'find_node',
    a: {
      id: self._rpc.id,
      target: self._rpc.id
    }
  }, ready)

  function ready () {
    if (self.ready) return

    self._debug('emit ready')
    self.ready = true
    self.emit('ready')
  }
}

DHT.prototype._closest = function (target, message, onmessage, cb) {
  var self = this

  var table = new KBucket({
    localNodeId: target,
    numberOfNodesPerKBucket: this._rpc.k
  })

  this._rpc.closest(target, message, onreply, done)

  function done (err, n) {
    if (err) return cb(err)
    self._tables.set(target.toString('hex'), table)
    self._debug('visited %d nodes', n)
    cb(null, n)
  }

  function onreply (message, node) {
    if (!message.r) return true

    if (message.r.token && message.r.id && Buffer.isBuffer(message.r.id) && message.r.id.length === self._hashLength) {
      self._debug('found node %s (target: %s)', message.r.id, target)
      table.add({
        id: message.r.id,
        host: node.host || node.address,
        port: node.port,
        token: message.r.token
      })
    }

    if (!onmessage) return true
    return onmessage(message, node)
  }
}

DHT.prototype._debug = function () {
  if (!debug.enabled) return
  var args = [].slice.call(arguments)
  args[0] = '[' + this.nodeId.toString('hex').substring(0, 7) + '] ' + args[0]
  for (var i = 1; i < args.length; i++) {
    if (Buffer.isBuffer(args[i])) args[i] = args[i].toString('hex')
  }
  debug.apply(null, args)
}

DHT.prototype._validateToken = function (host, token) {
  var tokenA = this._generateToken(host, this._secrets[0])
  var tokenB = this._generateToken(host, this._secrets[1])
  return equals(token, tokenA) || equals(token, tokenB)
}

DHT.prototype._generateToken = function (host, secret) {
  if (!secret) secret = this._secrets[0]
  return this._hash(Buffer.concat([Buffer.from(host), secret]))
}

DHT.prototype._rotateSecrets = function () {
  if (!this._secrets) {
    this._secrets = [randombytes(this._hashLength), randombytes(this._hashLength)]
  } else {
    this._secrets[1] = this._secrets[0]
    this._secrets[0] = randombytes(this._hashLength)
  }
}

function noop () {}

function sha1 (buf) {
  return Buffer.from(simpleSha1.sync(buf), 'hex')
}

function createGetResponse (id, token, value) {
  var r = { id: id, token: token, v: value.v }
  if (value.sig) {
    r.sig = value.sig
    r.k = value.k
    if (typeof value.seq === 'number') r.seq = value.seq
  }
  return r
}

function encodePeer (host, port) {
  var buf = Buffer.allocUnsafe(6)
  var ip = host.split('.')
  for (var i = 0; i < 4; i++) buf[i] = parseInt(ip[i] || 0, 10)
  buf.writeUInt16BE(port, 4)
  return buf
}

function decodePeers (buf) {
  var peers = []

  try {
    for (var i = 0; i < buf.length; i++) {
      var port = buf[i].readUInt16BE(4)
      if (!port) continue
      peers.push({
        host: parseIp(buf[i], 0),
        port: port
      })
    }
  } catch (err) {
    // do nothing
  }

  return peers
}

function parseIp (buf, offset) {
  return buf[offset++] + '.' + buf[offset++] + '.' + buf[offset++] + '.' + buf[offset++]
}

function encodeSigData (msg) {
  var ref = { seq: msg.seq || 0, v: msg.v }
  if (msg.salt) ref.salt = msg.salt
  return bencode.encode(ref).slice(1, -1)
}

function toNode (node) {
  return {
    host: node.host,
    port: node.port
  }
}

function toBuffer (str) {
  if (Buffer.isBuffer(str)) return str
  if (ArrayBuffer.isView(str)) return Buffer.from(str.buffer, str.byteOffset, str.byteLength)
  if (typeof str === 'string') return Buffer.from(str, 'hex')
  throw new Error('Pass a buffer or a string')
}
