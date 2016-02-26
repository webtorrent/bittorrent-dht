module.exports = DHT

var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var krpc = require('k-rpc')
var KBucket = require('k-bucket')
var crypto = require('crypto')
var bencode = require('bencode')
var equals = require('buffer-equals')
var LRU = require('lru')
var debug = require('debug')('bittorrent-dht')

var ROTATE_INTERVAL = 5 * 60 * 1000 // rotate secrets every 5 minutes

inherits(DHT, EventEmitter)

function DHT (opts) {
  if (!(this instanceof DHT)) return new DHT(opts)
  if (!opts) opts = {}

  var self = this

  this._tables = LRU({maxAge: ROTATE_INTERVAL, max: opts.maxTables || 1000})
  this._values = LRU(opts.maxValues || 1000)
  this._peers = new PeerStore(opts.maxPeers || 10000)

  this._secrets = null
  this._rpc = krpc(opts)
  this._rpc.on('query', onquery)
  this._rpc.on('node', onnode)
  this._rpc.on('warning', onwarning)
  this._rpc.on('error', onerror)
  this._rpc.on('listening', onlistening)
  this._rotateSecrets()
  this._verify = opts.verify || null
  this._host = opts.host || null
  this._interval = setInterval(rotateSecrets, ROTATE_INTERVAL)

  this.listening = false
  this.destroyed = false
  this.nodeId = this._rpc.id
  this.nodes = this._rpc.nodes

  process.nextTick(bootstrap)

  EventEmitter.call(this)
  this._debug('new DHT %s', this.nodeId)

  function onlistening () {
    self.listening = true
    self._debug('listening %d', self.address().port)
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

DHT.prototype.addNode = function (node) {
  var self = this
  if (node.id) {
    node.id = toBuffer(node.id)
    var old = !!this._rpc.nodes.get(node.id)
    this._rpc.nodes.add(node)
    if (!old) this.emit('node', node)
    return
  }
  this._sendPing(node, function (_, node) {
    if (node) self.addNode(node)
  })
}

DHT.prototype.removeNode = function (id) {
  this._rpc.nodes.remove({id: toBuffer(id)})
}

DHT.prototype._sendPing = function (node, cb) {
  this._rpc.query(node, {q: 'ping'}, function (err, pong, node) {
    if (err) return cb(err)
    if (!pong.r || !pong.r.id || !Buffer.isBuffer(pong.r.id) || pong.r.id.length !== 20) {
      return cb(new Error('Bad reply'))
    }
    cb(null, {
      id: pong.r.id,
      host: node.host || node.address,
      port: node.port
    })
  })
}

DHT.prototype.toJSON =
DHT.prototype.toArray = function () {
  return this._rpc.nodes.toArray().map(toNode)
}

DHT.prototype.put = function (opts, cb) {
  if (Buffer.isBuffer(opts) || typeof opts === 'string') opts = {v: opts}
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
  if (isMutable && !opts.k) {
    throw new Error('opts.k ed25519 public key required for mutable put')
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
  var v = typeof opts.v === 'string' ? new Buffer(opts.v) : opts.v
  var key = isMutable
    ? sha1(opts.salt ? Buffer.concat([opts.salt, opts.k]) : opts.k)
    : sha1(bencode.encode(v))

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
  }

  this._values.set(key.toString('hex'), message.a)
  this._rpc.queryAll(table.closest({id: key}), message, null, function (err, n) {
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
  var value = this._values.get(key.toString('hex')) || null

  if (value) {
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

    if (isMutable) {
      if (!verify || !r.sig || !r.k) return true
      if (!verify(r.sig, encodeSigData(r), r.k)) return true
      if (equals(sha1(r.salt ? Buffer.concat([r.salt, r.k]) : r.k), key)) {
        value = r
        return false
      }
    } else {
      if (equals(sha1(bencode.encode(r.v)), key)) {
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
      {host: this._host, port: port || dhtPort},
      infoHash,
      {host: this._host, port: dhtPort}
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
  this._rpc.queryAll(table.closest({id: infoHash}), message, null, cb)
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
    if (!values) values = self._peers.get(infoHash.toString('hex'))
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

DHT.prototype.listen = function (port, cb) {
  if (typeof port === 'function') return this.listen(0, port)
  this._rpc.bind(port, cb)
}

DHT.prototype.destroy = function (cb) {
  if (this.destroyed) {
    if (cb) process.nextTick(cb)
    return
  }
  this.destroyed = true
  var self = this
  clearInterval(this._interval)
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
      return this._rpc.response(peer, query, {id: this._rpc.id})

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

  var nodes = this._rpc.nodes.closest({ id: target })
  this._rpc.response(peer, query, {id: this._rpc.id}, nodes)
}

DHT.prototype._ongetpeers = function (query, peer) {
  var host = peer.address || peer.host
  var infoHash = query.a.info_hash
  if (!infoHash) return this._rpc.error(peer, query, [203, '`get_peers` missing required `a.info_hash` field'])

  var r = {id: this._rpc.id, token: this._generateToken(host)}
  var peers = this._peers.get(infoHash.toString('hex'))

  if (peers.length) {
    r.values = peers
    this._rpc.response(peer, query, r)
  } else {
    this._rpc.response(peer, query, r, this._rpc.nodes.closest({id: infoHash}))
  }
}

DHT.prototype._onannouncepeer = function (query, peer) {
  var host = peer.address || peer.host
  var port = query.a.implied_port ? peer.port : query.a.port
  if (!port || typeof port !== 'number') return
  var infoHash = query.a.info_hash
  var token = query.a.token
  if (!infoHash || !token) return

  if (!this._validateToken(host, token)) {
    return this._rpc.error(peer, query, [203, 'cannot `announce_peer` with bad token'])
  }

  this._addPeer({host: host, port: port}, infoHash, {host: host, port: peer.port})
  this._rpc.response(peer, query, {id: this._rpc.id})
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

  if (!value) {
    var nodes = this._rpc.nodes.closest({id: target})
    this._rpc.response(peer, query, {id: this._rpc.id, token: token}, nodes)
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
    ? sha1(a.salt ? Buffer.concat([a.salt, a.k]) : a.k)
    : sha1(bencode.encode(v))
  var keyHex = key.toString('hex')

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
    this._values.set(keyHex, {v: v, k: a.k, salt: a.salt, sig: a.sig, seq: a.seq})
  } else {
    this._values.set(keyHex, {v: v})
  }

  this._rpc.response(peer, query, {id: this._rpc.id})
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

    if (message.r.token && message.r.id && Buffer.isBuffer(message.r.id) && message.r.id.length === 20) {
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
  return crypto.createHash('sha1').update(new Buffer(host, 'utf8')).update(secret).digest()
}

DHT.prototype._rotateSecrets = function () {
  if (!this._secrets) {
    this._secrets = [crypto.randomBytes(20), crypto.randomBytes(20)]
  } else {
    this._secrets[1] = this._secrets[0]
    this._secrets[0] = crypto.randomBytes(20)
  }
}

function noop () {}

function sha1 (buf) {
  return crypto.createHash('sha1').update(buf).digest()
}

function createGetResponse (id, token, value) {
  var r = {id: id, token: token, v: value.v}
  if (value.sig) {
    r.sig = value.sig
    r.k = value.k
    if (value.salt) r.salt = value.salt
    if (typeof value.seq === 'number') r.seq = value.seq
  }
  return r
}

function encodePeer (host, port) {
  var buf = new Buffer(6)
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

function PeerStore (max) {
  this.max = max || 10000
  this.used = 0
  this.peers = LRU(Infinity)
}

PeerStore.prototype.add = function (key, peer) {
  var peers = this.peers.get(key)

  if (!peers) {
    peers = {
      values: [],
      map: LRU(Infinity)
    }
    this.peers.set(key, peers)
  }

  var id = peer.toString('hex')
  if (peers.map.get(id)) return

  var node = {index: peers.values.length, peer: peer}
  peers.map.set(id, node)
  peers.values.push(node)
  if (++this.used > this.max) this._evict()
}

PeerStore.prototype._evict = function () {
  var a = this.peers.peek(this.peers.tail)
  var b = a.map.remove(a.map.tail)
  var values = a.values
  swap(values, b.index, values.length - 1)
  values.pop()
  this.used--
  if (!values.length) this.peers.remove(this.peers.tail)
}

PeerStore.prototype.get = function (key) {
  var node = this.peers.get(key)
  if (!node) return []
  return pick(node.values, 100)
}

function swap (list, a, b) {
  if (a === b) return
  var tmp = list[a]
  list[a] = list[b]
  list[b] = tmp
  list[a].index = a
  list[b].index = b
}

function pick (values, n) {
  var len = Math.min(values.length, n)
  var ptr = 0
  var res = new Array(len)

  for (var i = 0; i < len; i++) {
    var next = ptr + (Math.random() * (values.length - ptr)) | 0
    res[ptr] = values[next].peer
    swap(values, ptr++, next)
  }

  return res
}

function toBuffer (str) {
  if (Buffer.isBuffer(str)) return str
  if (typeof str === 'string') return new Buffer(str, 'hex')
  throw new Error('Pass a buffer or a string')
}
