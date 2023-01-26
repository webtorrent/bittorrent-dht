import { EventEmitter } from 'events'
import bencode from 'bencode'
import Debug from 'debug'
import KBucket from 'k-bucket'
import krpc from 'k-rpc'
import low from 'last-one-wins'
import LRU from 'lru'
import randombytes from 'randombytes'
import records from 'record-cache'
import crypto from 'crypto'

const debug = Debug('bittorrent-dht')

const ROTATE_INTERVAL = 5 * 60 * 1000 // rotate secrets every 5 minutes
const BUCKET_OUTDATED_TIMESPAN = 15 * 60 * 1000 // check nodes in bucket in 15 minutes old buckets

class DHT extends EventEmitter {
  constructor (opts = {}) {
    super()

    this._tables = new LRU({ maxAge: ROTATE_INTERVAL, max: opts.maxTables || 1000 })
    this._values = new LRU(opts.maxValues || 1000)
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
    const onping = low(ping)

    this._rpc.on('ping', (older, swap) => {
      onping({ older, swap })
    })

    process.nextTick(bootstrap)

    this._debug('new DHT %s', this.nodeId)

    const self = this

    function ping (opts, cb) {
      const older = opts.older
      const swap = opts.swap

      self._debug('received ping', older)
      self._checkNodes(older, false, (_, deadNode) => {
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

  _setBucketCheckInterval () {
    const self = this
    const interval = 1 * 60 * 1000 // check age of bucket every minute

    this._runningBucketCheck = true
    queueNext()

    function checkBucket () {
      const diff = Date.now() - self._rpc.nodes.metadata.lastChange

      if (diff < self._bucketOutdatedTimeSpan) return queueNext()

      self._pingAll(() => {
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
      const nextTimeout = Math.floor(Math.random() * interval + interval / 2)
      self._bucketCheckTimeout = setTimeout(checkBucket, nextTimeout)
    }
  }

  _pingAll (cb) {
    this._checkAndRemoveNodes(this.nodes.toArray(), cb)
  }

  removeBucketCheckInterval () {
    this._runningBucketCheck = false
    clearTimeout(this._bucketCheckTimeout)
  }

  updateBucketTimestamp () {
    this._rpc.nodes.metadata.lastChange = Date.now()
  }

  _checkAndRemoveNodes (nodes, cb) {
    const self = this

    this._checkNodes(nodes, true, (_, node) => {
      if (node) self.removeNode(node.id)
      cb(null, node)
    })
  }

  _checkNodes (nodes, force, cb) {
    const self = this

    test(nodes)

    function test (acc) {
      let current = null

      while (acc.length) {
        current = acc.pop()
        if (!current.id || force) break
        if (Date.now() - (current.seen || 0) > 10000) break // not pinged within 10s
        current = null
      }

      if (!current) return cb(null)

      self._sendPing(current, err => {
        if (!err) {
          self.updateBucketTimestamp()
          return test(acc)
        }
        cb(null, current)
      })
    }
  }

  addNode (node) {
    const self = this
    if (node.id) {
      node.id = toBuffer(node.id)
      const old = !!this._rpc.nodes.get(node.id)
      this._rpc.nodes.add(node)
      if (!old) {
        this.emit('node', node)
        this.updateBucketTimestamp()
      }
      return
    }
    this._sendPing(node, (_, node) => {
      if (node) self.addNode(node)
    })
  }

  removeNode (id) {
    this._rpc.nodes.remove(toBuffer(id))
  }

  _sendPing (node, cb) {
    const self = this
    const expectedId = node.id
    this._rpc.query(node, { q: 'ping' }, (err, pong, node) => {
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

  toJSON () {
    const self = this
    const values = {}
    Object.keys(this._values.cache).forEach(key => {
      const value = self._values.cache[key].value
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
      values
    }
  }

  put (opts, cb) {
    if (Buffer.isBuffer(opts) || typeof opts === 'string') opts = { v: opts }
    const isMutable = !!opts.k
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

  _put (opts, cb) {
    if (!cb) cb = noop

    const isMutable = !!opts.k
    const v = typeof opts.v === 'string' ? Buffer.from(opts.v) : opts.v
    const key = isMutable
      ? this._hash(opts.salt ? Buffer.concat([opts.k, opts.salt]) : opts.k)
      : this._hash(bencode.encode(v))

    const table = this._tables.get(key.toString('hex'))
    if (!table) return this._preput(key, opts, cb)

    const message = {
      q: 'put',
      a: {
        id: this._rpc.id,
        token: null, // queryAll sets this
        v
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

    this._rpc.queryAll(table.closest(key), message, null, (err, n) => {
      if (err) return cb(err, key, n)
      cb(null, key, n)
    })

    return key
  }

  _preput (key, opts, cb) {
    const self = this

    this._closest(key, {
      q: 'get',
      a: {
        id: this._rpc.id,
        target: key
      }
    }, null, (err, n) => {
      if (err) return cb(err)
      self.put(opts, cb)
    })

    return key
  }

  get (key, opts, cb) {
    key = toBuffer(key)
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }

    if (!opts) opts = {}
    const verify = opts.verify || this._verify
    const hash = this._hash
    let value = this._values.get(key.toString('hex')) || null

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
      const r = message.r
      if (!r || !r.v) return true

      const isMutable = r.k || r.sig

      if (opts.salt) r.salt = Buffer.from(opts.salt)

      if (isMutable) {
        if (!verify || !r.sig || !r.k) return true
        if (!verify(r.sig, encodeSigData(r), r.k)) return true
        if (hash(r.salt ? Buffer.concat([r.k, r.salt]) : r.k).equals(key)) {
          if (!value || r.seq > value.seq) value = r
        }
      } else {
        if (hash(bencode.encode(r.v)).equals(key)) {
          value = r
          return false
        }
      }

      return true
    }
  }

  announce (infoHash, port, cb) {
    if (typeof port === 'function') return this.announce(infoHash, 0, port)
    infoHash = toBuffer(infoHash)
    if (!cb) cb = noop

    const table = this._tables.get(infoHash.toString('hex'))
    if (!table) return this._preannounce(infoHash, port, cb)

    if (this._host) {
      const dhtPort = this.listening ? this.address().port : 0
      this._addPeer(
        { host: this._host, port: port || dhtPort },
        infoHash,
        { host: this._host, port: dhtPort }
      )
    }

    const message = {
      q: 'announce_peer',
      a: {
        id: this._rpc.id,
        token: null, // queryAll sets this
        info_hash: infoHash,
        port,
        implied_port: port ? 0 : 1
      }
    }

    this._debug('announce %s %d', infoHash, port)
    this._rpc.queryAll(table.closest(infoHash), message, null, cb)
  }

  _preannounce (infoHash, port, cb) {
    const self = this

    this.lookup(infoHash, err => {
      if (self.destroyed) return cb(new Error('dht is destroyed'))
      if (err) return cb(err)
      self.announce(infoHash, port, cb)
    })
  }

  lookup (infoHash, cb) {
    infoHash = toBuffer(infoHash)
    if (!cb) cb = noop
    const self = this
    let aborted = false

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
      const peers = decodePeers(values)
      for (let i = 0; i < peers.length; i++) {
        self.emit('peer', peers[i], infoHash, from || null)
      }
    }

    function onreply (message, node) {
      if (aborted) return false
      if (message.r.values) emit(message.r.values, node)
    }

    return function abort () { aborted = true }
  }

  address () {
    return this._rpc.address()
  }

  // listen([port], [address], [onlistening])
  listen (...args) {
    this._rpc.bind(...args)
  }

  destroy (cb) {
    if (this.destroyed) {
      if (cb) process.nextTick(cb)
      return
    }
    this.destroyed = true
    const self = this
    clearInterval(this._interval)
    this.removeBucketCheckInterval()
    this._peers.destroy()
    this._debug('destroying')
    this._rpc.destroy(() => {
      self.emit('close')
      if (cb) cb()
    })
  }

  _onquery (query, peer) {
    if (query.q === undefined || query.q === null) return

    const q = query.q.toString()
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

  _onfindnode (query, peer) {
    const target = query.a.target
    if (!target) return this._rpc.error(peer, query, [203, '`find_node` missing required `a.target` field'])

    this.emit('find_node', target)

    const nodes = this._rpc.nodes.closest(target)
    this._rpc.response(peer, query, { id: this._rpc.id }, nodes)
  }

  _ongetpeers (query, peer) {
    const host = peer.address || peer.host
    const infoHash = query.a.info_hash
    if (!infoHash) return this._rpc.error(peer, query, [203, '`get_peers` missing required `a.info_hash` field'])

    this.emit('get_peers', infoHash)

    const r = { id: this._rpc.id, token: this._generateToken(host) }
    const peers = this._peers.get(infoHash.toString('hex'))

    if (peers.length) {
      r.values = peers
      this._rpc.response(peer, query, r)
    } else {
      this._rpc.response(peer, query, r, this._rpc.nodes.closest(infoHash))
    }
  }

  _onannouncepeer (query, peer) {
    const host = peer.address || peer.host
    const port = query.a.implied_port ? peer.port : query.a.port
    if (!port || typeof port !== 'number' || port <= 0 || port > 65535) return
    const infoHash = query.a.info_hash
    const token = query.a.token
    if (!infoHash || !token) return

    if (!this._validateToken(host, token)) {
      return this._rpc.error(peer, query, [203, 'cannot `announce_peer` with bad token'])
    }

    this.emit('announce_peer', infoHash, { host, port: peer.port })

    this._addPeer({ host, port }, infoHash, { host, port: peer.port })
    this._rpc.response(peer, query, { id: this._rpc.id })
  }

  _addPeer (peer, infoHash, from) {
    this._peers.add(infoHash.toString('hex'), encodePeer(peer.host, peer.port))
    this.emit('announce', peer, infoHash, from)
  }

  _onget (query, peer) {
    const host = peer.address || peer.host
    const target = query.a.target
    if (!target) return
    const token = this._generateToken(host)
    const value = this._values.get(target.toString('hex'))

    this.emit('get', target, value)

    if (!value) {
      const nodes = this._rpc.nodes.closest(target)
      this._rpc.response(peer, query, { id: this._rpc.id, token }, nodes)
    } else {
      this._rpc.response(peer, query, createGetResponse(this._rpc.id, token, value))
    }
  }

  _onput (query, peer) {
    const host = peer.address || peer.host

    const a = query.a
    if (!a) return
    const v = query.a.v
    if (!v) return
    const id = query.a.id
    if (!id) return

    const token = a.token
    if (!token) return

    if (!this._validateToken(host, token)) {
      return this._rpc.error(peer, query, [203, 'cannot `put` with bad token'])
    }
    if (v.length > 1000) {
      return this._rpc.error(peer, query, [205, 'data payload too large'])
    }

    const isMutable = !!(a.k || a.sig)
    if (isMutable && !a.k && !a.sig) return

    const key = isMutable
      ? this._hash(a.salt ? Buffer.concat([a.k, a.salt]) : a.k)
      : this._hash(bencode.encode(v))
    const keyHex = key.toString('hex')

    this.emit('put', key, v)

    if (isMutable) {
      if (!this._verify) return this._rpc.error(peer, query, [400, 'verification not supported'])
      if (!this._verify(a.sig, encodeSigData(a), a.k)) return
      const prev = this._values.get(keyHex)
      if (prev && typeof a.cas === 'number' && prev.seq !== a.cas) {
        return this._rpc.error(peer, query, [301, 'CAS mismatch, re-read and try again'])
      }
      if (prev && typeof prev.seq === 'number' && !(a.seq > prev.seq)) {
        return this._rpc.error(peer, query, [302, 'sequence number less than current'])
      }
      this._values.set(keyHex, { v, k: a.k, salt: a.salt, sig: a.sig, seq: a.seq, id })
    } else {
      this._values.set(keyHex, { v, id })
    }

    this._rpc.response(peer, query, { id: this._rpc.id })
  }

  _bootstrap (populate) {
    const self = this
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

  _closest (target, message, onmessage, cb) {
    const self = this

    const table = new KBucket({
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

  _debug () {
    if (!debug.enabled) return
    const args = [].slice.call(arguments)
    args[0] = `[${this.nodeId.toString('hex').substring(0, 7)}] ${args[0]}`
    for (let i = 1; i < args.length; i++) {
      if (Buffer.isBuffer(args[i])) args[i] = args[i].toString('hex')
    }
    debug(...args)
  }

  _validateToken (host, token) {
    const tokenA = this._generateToken(host, this._secrets[0])
    const tokenB = this._generateToken(host, this._secrets[1])
    return token.equals(tokenA) || token.equals(tokenB)
  }

  _generateToken (host, secret) {
    if (!secret) secret = this._secrets[0]
    return this._hash(Buffer.concat([Buffer.from(host), secret]))
  }

  _rotateSecrets () {
    if (!this._secrets) {
      this._secrets = [randombytes(this._hashLength), randombytes(this._hashLength)]
    } else {
      this._secrets[1] = this._secrets[0]
      this._secrets[0] = randombytes(this._hashLength)
    }
  }
}

function noop () {}

function sha1 (buf) {
  return crypto.createHash('sha1').update(buf).digest()
}

function createGetResponse (id, token, value) {
  const r = { id, token, v: value.v }
  if (value.sig) {
    r.sig = value.sig
    r.k = value.k
    if (typeof value.seq === 'number') r.seq = value.seq
  }
  return r
}

function encodePeer (host, port) {
  const buf = Buffer.allocUnsafe(6)
  const ip = host.split('.')
  for (let i = 0; i < 4; i++) buf[i] = parseInt(ip[i] || 0, 10)
  buf.writeUInt16BE(port, 4)
  return buf
}

function decodePeers (buf) {
  const peers = []

  try {
    for (let i = 0; i < buf.length; i++) {
      const port = buf[i].readUInt16BE(4)
      if (!port) continue
      peers.push({
        host: parseIp(buf[i], 0),
        port
      })
    }
  } catch (err) {
    // do nothing
  }

  return peers
}

function parseIp (buf, offset) {
  return `${buf[offset++]}.${buf[offset++]}.${buf[offset++]}.${buf[offset++]}`
}

function encodeSigData (msg) {
  const ref = { seq: msg.seq || 0, v: msg.v }
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

export default DHT
