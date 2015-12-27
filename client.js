module.exports = DHT
module.exports.dgram = require('dgram') // allow override for chrome apps (chrome-dgram)

var addrToIPPort = require('addr-to-ip-port')
var bencode = require('bencode')
var bufferEqual = require('buffer-equal')
var compact2string = require('compact2string')
var debug = require('debug')('bittorrent-dht')
var dns = require('dns')
var EventEmitter = require('events').EventEmitter
var hat = require('hat')
var inherits = require('inherits')
var isIP = require('is-ip')
var KBucket = require('k-bucket')
var networkAddress = require('network-address')
var once = require('once')
var os = require('os')
var parallel = require('run-parallel')
var publicAddress = require('./lib/public-address')
var sha1 = require('simple-sha1')
var string2compact = require('string2compact')

var BOOTSTRAP_NODES = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881'
]

var BOOTSTRAP_TIMEOUT = 10000
var K = module.exports.K = 20 // number of nodes per bucket
var MAX_CONCURRENCY = 6 // α from Kademlia paper
var ROTATE_INTERVAL = 5 * 60 * 1000 // rotate secrets every 5 minutes
var SECRET_ENTROPY = 160 // entropy of token secrets
var SEND_TIMEOUT = 2000
var UINT16 = 0xffff

var MESSAGE_TYPE = module.exports.MESSAGE_TYPE = {
  QUERY: 'q',
  RESPONSE: 'r',
  ERROR: 'e'
}
var ERROR_TYPE = module.exports.ERROR_TYPE = {
  GENERIC: 201,
  SERVER: 202,
  PROTOCOL: 203, // malformed packet, invalid arguments, or bad token
  METHOD_UNKNOWN: 204
}

var LOCAL_HOSTS = { 4: [], 6: [] }
var interfaces = os.networkInterfaces()
for (var i in interfaces) {
  for (var j = 0; j < interfaces[i].length; j++) {
    var face = interfaces[i][j]
    if (face.family === 'IPv4') LOCAL_HOSTS[4].push(face.address)
    if (face.family === 'IPv6') LOCAL_HOSTS[6].push(face.address)
  }
}

inherits(DHT, EventEmitter)

/**
 * A DHT client implementation. The DHT is the main peer discovery layer for BitTorrent,
 * which allows for trackerless torrents.
 * @param {string|Buffer} opts
 */
function DHT (opts) {
  var self = this
  if (!(self instanceof DHT)) return new DHT(opts)
  EventEmitter.call(self)
  if (!debug.enabled) self.setMaxListeners(0)

  if (!opts) opts = {}

  self.nodeId = idToHexString(opts.nodeId || hat(160))
  self.nodeIdBuffer = idToBuffer(self.nodeId)

  self._debug('new DHT %s', self.nodeId)

  self.ready = false
  self.listening = false
  self.destroyed = false

  self._binding = false
  self._port = null
  self._ipv = opts.ipv || 4
  self._rotateInterval = null
  self._verify = opts.verify

  /**
   * Query Handlers table
   * @type {Object} string -> function
   */
  self.queryHandler = {
    ping: self._onPing,
    find_node: self._onFindNode,
    get_peers: self._onGetPeers,
    announce_peer: self._onAnnouncePeer,
    put: self._onPut,
    get: self._onGet
  }

  /**
   * Routing table
   * @type {KBucket}
   */
  self.nodes = new KBucket({
    localNodeId: self.nodeIdBuffer,
    numberOfNodesPerKBucket: K,
    numberOfNodesToPing: MAX_CONCURRENCY
  })

  /**
   * Cache of routing tables used during a lookup. Saved in this object so we can access
   * each node's unique token for announces later.
   * TODO: Clean up tables after 5 minutes.
   * @type {Object} infoHash:string -> KBucket
   */
  self.tables = {}

  /**
   * Pending transactions (unresolved requests to peers)
   * @type {Object} addr:string -> array of pending transactions
   */
  self.transactions = {}

  /**
   * Peer address data (tracker storage)
   * @type {Object} infoHash:string -> Object {index:Object, list:Array.<Buffer>}
   */
  self.peers = {}

  /**
   * Secrets for token generation.
   */
  self.secrets = null

  /**
   * IP addresses of the local DHT node. Used to store the peer, controlling this DHT
   * node, into the local table when `client.announce()` is called.
   * @type {Array.<string>}
   */
  self.localAddresses = [ networkAddress.ipv4() ]

  publicAddress(function (err, ip) {
    if (err) return self._debug('failed to get public ip: %s', err.message || err)
    self.localAddresses.push(ip)
  })

  // Create socket and attach listeners
  self.socket = module.exports.dgram.createSocket('udp' + self._ipv)
  self.socket.on('message', self._onData.bind(self))
  self.socket.on('listening', self._onListening.bind(self))
  self.socket.on('error', noop) // throw away errors

  self._rotateSecrets()
  self._rotateInterval = setInterval(self._rotateSecrets.bind(self), ROTATE_INTERVAL)
  if (self._rotateInterval.unref) self._rotateInterval.unref()

  process.nextTick(function () {
    if (opts.bootstrap === false) {
        // Emit `ready` right away because the user does not want to bootstrap. Presumably,
        // the user will call addNode() to populate the routing table manually.
      self.ready = true
      self.emit('ready')
    } else if (typeof opts.bootstrap === 'string') {
      self._bootstrap([ opts.bootstrap ])
    } else if (Array.isArray(opts.bootstrap)) {
      self._bootstrap(fromArray(opts.bootstrap))
    } else {
      // opts.bootstrap is undefined or true
      self._bootstrap(BOOTSTRAP_NODES)
    }
  })

  self.on('ready', function () {
    self._debug('emit ready')
  })
}

/**
 * Start listening for UDP messages on given port.
 * @param  {number} port
 * @param  {string} address
 * @param  {function=} onlistening added as handler for listening event
 */
DHT.prototype.listen = function (port, address, onlistening) {
  var self = this
  if (self.destroyed) throw new Error('dht is destroyed')
  if (self._binding || self.listening) throw new Error('dht is already listening')

  if (typeof port === 'string') {
    onlistening = address
    address = port
    port = undefined
  }
  if (typeof port === 'function') {
    onlistening = port
    port = undefined
    address = undefined
  }
  if (typeof address === 'function') {
    onlistening = address
    address = undefined
  }

  if (onlistening) self.once('listening', onlistening)

  self._binding = true

  self._debug('listen %s', port)
  self.socket.bind(port, address)
}

/**
 * Called when DHT is listening for UDP messages.
 */
DHT.prototype._onListening = function () {
  var self = this
  self._binding = false
  self.listening = true
  self._port = self.socket.address().port

  self._debug('emit listening %s', self._port)
  self.emit('listening')
}

DHT.prototype.address = function () {
  var self = this
  return self.socket.address()
}

/**
 * Announce that the peer, controlling the querying node, is downloading a torrent on a
 * port.
 * @param  {string|Buffer} infoHash
 * @param  {number} port
 * @param  {function=} cb
 */
DHT.prototype.announce = function (infoHash, port, cb) {
  var self = this
  if (!cb) cb = noop
  if (self.destroyed) throw new Error('dht is destroyed')

  var infoHashBuffer = idToBuffer(infoHash)
  infoHash = idToHexString(infoHash)

  self._debug('announce %s %s', infoHash, port)

  self.localAddresses.forEach(function (address) {
    self._addPeer(address + ':' + port, infoHash)
  })

  // TODO: it would be nice to not use a table when a lookup is in progress
  var table = self.tables[infoHash]
  if (table) {
    process.nextTick(function () {
      onClosest(null, table.closest({ id: infoHashBuffer }, K))
    })
  } else {
    self._lookup(infoHash, onClosest)
  }

  function onClosest (err, closest) {
    if (err) return cb(err)
    closest.forEach(function (contact) {
      self._sendAnnouncePeer(contact.addr, infoHashBuffer, port, contact.token)
    })
    self._debug('announce end %s %s', infoHash, port)
    cb(null)
  }
}

/**
 * Write arbitrary mutable and immutable data to the DHT.
 * Specified in BEP44: http://bittorrent.org/beps/bep_0044.html
 * @param {Object} opts
 * @param {function=} cb
 */
DHT.prototype.put = function (opts, cb) {
  var self = this
  if (self.destroyed) throw new Error('dht is destroyed')

  var isMutable = opts.k
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
  if (isMutable && typeof opts.sign !== 'function') {
    throw new Error('opts.sign function required for mutable put')
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
  return self._put(opts, cb)
}

/**
 * put() without type checks for internal use
 * @param {Object} opts
 * @param {function=} cb
 */
DHT.prototype._put = function (opts, cb) {
  var self = this
  var pending = 0
  var errors = []
  var isMutable = opts.k
  var hash = isMutable
    ? sha1.sync(opts.salt ? Buffer.concat([ opts.salt, opts.k ]) : opts.k)
    : sha1.sync(bencode.encode(opts.v))
  var hashBuffer = idToBuffer(hash)

  if (self.nodes.toArray().length === 0) {
    process.nextTick(function () {
      addLocal(null, [])
    })
  } else {
    self._lookup(hash, {findNode: true}, onLookup)
  }

  function onLookup (err, nodes) {
    if (err) return cb(err)
    nodes.forEach(function (node) {
      put(node)
    })
    addLocal()
  }

  function addLocal () {
    var localData = {
      id: self.nodeIdBuffer,
      v: opts.v
    }
    var localAddr = '127.0.0.1:' + self._port
    if (isMutable) {
      if (opts.cas) localData.cas = opts.cas
      localData.sig = opts.sign(encodeSigData(opts))
      localData.k = opts.k
      localData.seq = opts.seq
      localData.token = idToBuffer(opts.token || self._generateToken(localAddr))
    }
    self.nodes.add({
      id: hashBuffer,
      addr: localAddr,
      data: localData
    })
    if (pending === 0) {
      process.nextTick(function () { cb(errors, hash) })
    }
  }
  return hash

  function put (node) {
    if (node.data) return // skip data nodes
    pending += 1

    var t = self._getTransactionId(node.addr, putOnGet)
    self._send(node.addr, {
      a: {
        id: self.nodeIdBuffer,
        target: hashBuffer
      },
      t: transactionIdToBuffer(t),
      y: 'q',
      q: 'get'
    })

    function putOnGet (err, res) {
      if (err) return next(node)(err)

      var t = self._getTransactionId(node.addr, next(node))
      var data = {
        a: {
          id: opts.id || self.nodeIdBuffer,
          v: opts.v,
          token: res && res.token
        },
        t: transactionIdToBuffer(t),
        y: 'q',
        q: 'put'
      }

      if (isMutable) {
        data.a.seq = opts.seq
        data.a.sig = opts.sign(encodeSigData(opts))
        data.a.k = opts.k
        if (opts.salt) data.a.salt = opts.salt
        if (typeof opts.cas === 'number') data.a.cas = opts.cas
      }

      self._send(node.addr, data)
    }
  }

  function next (node) {
    return function (err) {
      if (err) {
        err.address = node.addr
        errors.push(err)
      }
      if (--pending === 0) cb(errors, hash)
    }
  }
}

DHT.prototype.get = function (hash, cb) {
  var self = this
  if (self.destroyed) throw new Error('dht is destroyed')

  var hashBuffer = idToBuffer(hash)
  var local = self.nodes.get(hashBuffer)
  if (local && local.data) {
    return process.nextTick(function () {
      cb(null, local.data)
    })
  }

  self._lookup(hash, {get: true}, cb)
}

DHT.prototype._onPut = function (addr, message) {
  var self = this
  var msg = message.a
  if (!msg || !msg.v || !msg.id) {
    return self._sendError(addr, message.t, 203, 'not enough parameters')
  }

  var isMutable = message.a.k || message.a.sig
  self._debug('put from %s', addr)

  var data = {
    id: message.a.id,
    addr: addr,
    v: message.a.v
  }
  if (data.v && data.v.length > 1000) {
    return self._sendError(addr, message.t, 205, 'data payload too large')
  }
  if (isMutable && !msg.k) {
    return self._sendError(addr, message.t, 203, 'missing public key')
  }

  var hash
  if (isMutable) {
    hash = msg.salt
      ? sha1.sync(Buffer.concat([ msg.salt, msg.k ]))
      : sha1.sync(msg.k)
  } else {
    hash = sha1.sync(bencode.encode(data.v))
  }
  var hashBuffer = idToBuffer(hash)

  if (isMutable) {
    if (!self._verify) {
      return self._sendError(addr, message.t, 400, 'verification not supported')
    }
    var sdata = encodeSigData(msg)
    if (!msg.sig || !Buffer.isBuffer(msg.sig) || !self._verify(msg.sig, sdata, msg.k)) {
      return self._sendError(addr, message.t, 206, 'invalid signature')
    }
    var prev = self.nodes.get(hashBuffer)
    if (prev && prev.data && prev.data.seq !== undefined && typeof msg.cas === 'number') {
      if (msg.cas !== prev.data.seq) {
        return self._sendError(addr, message.t, 301,
          'CAS mismatch, re-read and try again')
      }
    }
    if (prev && prev.data && prev.data.seq !== undefined) {
      if (msg.seq === undefined || msg.seq <= prev.data.seq) {
        return self._sendError(addr, message.t, 302,
          'sequence number less than current')
      }
    }

    data.sig = msg.sig
    data.k = msg.k
    data.seq = msg.seq
    data.token = msg.token
    if (msg.salt && msg.salt.length > 64) {
      return self._sendError(addr, message.t, 207, 'salt too big')
    }
    if (msg.salt) data.salt = msg.salt
  }

  self.nodes.add({ id: hashBuffer, addr: addr, data: data })
  self._send(addr, {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: { id: self.nodeIdBuffer }
  })
}

DHT.prototype._onGet = function (addr, message) {
  var self = this
  var msg = message.a
  if (!msg) return self._debug('skipping malformed get request from %s', addr)
  if (!msg.target) return self._debug('missing a.target in get() from %s', addr)

  var addrData = addrToIPPort(addr)
  var hashBuffer = message.a.target
  var rec = self.nodes.get(hashBuffer)
  if (rec && rec.data) {
    msg = {
      t: message.t,
      y: MESSAGE_TYPE.RESPONSE,
      r: {
        id: self.nodeIdBuffer,
        nodes: [], // found, so we don't need to know the nodes
        nodes6: [],
        v: rec.data.v
      }
    }
    var isMutable = rec.data.k || rec.data.sig
    if (isMutable) {
      msg.r.k = rec.data.k
      msg.r.seq = rec.data.seq
      msg.r.sig = rec.data.sig
      msg.r.token = rec.data.token
      if (rec.data.salt) {
        msg.r.salt = rec.data.salt
      }
      if (rec.data.cas) {
        msg.r.cas = rec.data.cas
      }
    }
    self._send(addr, msg)
  } else {
    self._lookup(hashBuffer, function (err, nodes) {
      if (err && self.destroyed) return
      if (err) return self._sendError(addr, message.t, 201, err)

      var res = {
        t: message.t,
        y: MESSAGE_TYPE.RESPONSE,
        r: {
          token: idToBuffer(self._generateToken(addrData[0])),
          id: self.nodeIdBuffer,
          nodes: nodes.map(function (node) {
            return node.addr
          }),
          nodes6: [] // todo: filter the addrs
        }
      }
      if (rec && rec.data && rec.data.k) res.k = rec.data.k
      if (rec && rec.data && rec.data.seq) res.seq = rec.data.seq
      if (rec && rec.data && rec.data.sig) res.sig = rec.data.sig
      if (rec && rec.data && rec.data.token) res.token = rec.data.token
      if (rec && rec.data && rec.data.v) res.v = rec.data.v
      self._send(addr, res)
    })
  }
}

/**
 * Destroy and cleanup the DHT.
 * @param  {function=} cb
 */
DHT.prototype.destroy = function (cb) {
  var self = this
  if (self.destroyed) throw new Error('dht is destroyed')

  if (cb) cb = once(cb)
  else cb = noop

  if (self._binding) return self.once('listening', self.destroy.bind(self, cb))
  self._debug('destroy')

  self.destroyed = true
  self.listening = false

  // garbage collect large data structures
  self.nodes = null
  self.tables = null
  self.transactions = null
  self.peers = null

  clearInterval(self._rotateInterval)

  self.socket.on('close', cb)

  try {
    self.socket.close()
  } catch (err) {
    // ignore error, socket was either already closed / not yet bound
    process.nextTick(function () {
      cb(null)
    })
  }
}

/**
 * Add a DHT node to the routing table.
 * @param {string} addr
 * @param {string|Buffer} nodeId
 * @param {string=} from addr
 */
DHT.prototype.addNode = function (addr, nodeId) {
  var self = this
  if (self.destroyed) throw new Error('dht is destroyed')

  // If `nodeId` is undefined, then the peer will be pinged to learn their node id.
  // If the peer does not respond, the will not be added to the routing table.
  if (nodeId == null) {
    self._sendPing(addr, function (err, res) {
      if (err) {
        self._debug('skipping addNode %s; peer did not respond: %s', addr, err.message)
      }
      // No need to call `self._addNode()` explicitly here. `_onData` automatically
      // attempts to add every node the client gets a message from to the routing table.
    })
    return
  }

  var nodeIdBuffer = idToBuffer(nodeId)
  if (nodeIdBuffer.length !== 20) throw new Error('invalid node id length')

  self._addNode(addr, nodeIdBuffer)
}

/**
 * Internal version of `addNode` that doesn't throw errors on invalid arguments, but
 * silently fails instead. Useful for dealing with potentially bad data from the network.
 * @param {string} addr
 * @param {string|Buffer} nodeId
 * @param {string=} from addr
 * @return {boolean} was the node valid and new and added to the table
 */
DHT.prototype._addNode = function (addr, nodeId, from) {
  var self = this
  if (self.destroyed) return

  var nodeIdBuffer = idToBuffer(nodeId)
  nodeId = idToHexString(nodeId)

  if (nodeIdBuffer.length !== 20) {
    self._debug('skipping addNode %s %s; invalid id length', addr, nodeId)
    return
  }

  if (self._addrIsSelf(addr) || nodeId === self.nodeId) {
    self._debug('skip addNode %s %s; that is us!', addr, nodeId)
    return
  }

  var existing = self.nodes.get(nodeIdBuffer)
  if (existing && existing.addr === addr) return

  self.nodes.add({
    id: nodeIdBuffer,
    addr: addr
  })

  process.nextTick(function () {
    self.emit('node', addr, nodeId, from)
  })

  self._debug('addNode %s %s discovered from %s', nodeId, addr, from)
}

/**
 * Remove a DHT node from the routing table.
 * @param  {string|Buffer} nodeId
 */
DHT.prototype.removeNode = function (nodeId) {
  var self = this
  if (self.destroyed) throw new Error('dht is destroyed')

  var nodeIdBuffer = idToBuffer(nodeId)
  var contact = self.nodes.get(nodeIdBuffer)
  if (contact) {
    self._debug('removeNode %s %s', contact.nodeId, contact.addr)
    self.nodes.remove(contact)
  }
}

/**
 * Store a peer in the DHT. Called when a peer sends a `announce_peer` message.
 * @param {string} addr
 * @param {Buffer|string} infoHash
 */
DHT.prototype._addPeer = function (addr, infoHash) {
  var self = this
  if (self.destroyed) return
  infoHash = idToHexString(infoHash)

  var peers = self.peers[infoHash]
  if (!peers) {
    peers = self.peers[infoHash] = {
      index: {}, // addr -> true
      list: [] // compactAddr
    }
  }

  if (!peers.index[addr]) {
    peers.index[addr] = true
    peers.list.push(string2compact(addr))
    self._debug('addPeer %s %s', addr, infoHash)
    self.emit('announce', addr, infoHash)
  }
}

/**
 * Remove a peer from the DHT.
 * @param  {string} addr
 * @param  {Buffer|string} infoHash
 */
DHT.prototype._removePeer = function (addr, infoHash) {
  var self = this
  if (self.destroyed) return

  infoHash = idToHexString(infoHash)

  var peers = self.peers[infoHash]
  if (peers && peers.index[addr]) {
    peers.index[addr] = null
    var compactPeerInfo = string2compact(addr)
    peers.list.some(function (peer, index) {
      if (bufferEqual(peer, compactPeerInfo)) {
        peers.list.splice(index, 1)
        self._debug('removePeer %s %s', addr, infoHash)
        return true // abort early
      }
    })
  }
}

/**
 * Join the DHT network. To join initially, connect to known nodes (either public
 * bootstrap nodes, or known nodes from a previous run of bittorrent-client).
 * @param  {Array.<string|Object>} nodes
 */
DHT.prototype._bootstrap = function (nodes) {
  var self = this
  if (self.destroyed) return

  self._debug('bootstrap with %s', JSON.stringify(nodes))

  var contacts = nodes.map(function (obj) {
    if (typeof obj === 'string') {
      return { addr: obj }
    } else {
      return obj
    }
  })

  self._resolveContacts(contacts, function (err, contacts) {
    if (self.destroyed) return
    if (err) return self.emit('error', err)

    // add all non-bootstrap nodes to routing table
    contacts
      .filter(function (contact) {
        return !!contact.id
      })
      .forEach(function (contact) {
        self._addNode(contact.addr, contact.id, contact.from)
      })

    // get addresses of bootstrap nodes
    var addrs = contacts
      .filter(function (contact) {
        return !contact.id
      })
      .map(function (contact) {
        return contact.addr
      })

    lookup()

    function lookup () {
      self._lookup(self.nodeId, {
        findNode: true,
        addrs: addrs.length ? addrs : null
      }, function (err) {
        if (err) return self._debug('lookup error during bootstrap: %s', err.message)

        // emit `ready` once the recursive lookup for our own node ID is finished
        // (successful or not), so that later get_peer lookups will have a good shot at
        // succeeding.
        if (!self.ready) {
          self.ready = true
          self.emit('ready')
        }
      })
      startBootstrapTimeout()
    }

    function startBootstrapTimeout () {
      var bootstrapTimeout = setTimeout(function () {
        if (self.destroyed) return
        // If 0 nodes are in the table after a timeout, retry with bootstrap nodes
        if (self.nodes.count() === 0) {
          self._debug('No DHT bootstrap nodes replied, retry')
          lookup()
        }
      }, BOOTSTRAP_TIMEOUT)
      if (bootstrapTimeout.unref) bootstrapTimeout.unref()
    }
  })
}

/**
 * Resolve the DNS for nodes whose hostname is a domain name (often the case for
 * bootstrap nodes).
 * @param  {Array.<Object>} contacts array of contact objects with domain addresses
 * @param  {function} cb
 */
DHT.prototype._resolveContacts = function (contacts, cb) {
  var self = this
  var tasks = contacts.map(function (contact) {
    return function (cb) {
      var addrData = addrToIPPort(contact.addr)
      if (isIP(addrData[0])) {
        cb(null, contact)
      } else {
        dns.lookup(addrData[0], self._ipv, function (err, host) {
          if (err) return cb(null, null)
          contact.addr = host + ':' + addrData[1]
          cb(null, contact)
        })
      }
    }
  })
  parallel(tasks, function (err, contacts) {
    if (err) return cb(err)
    // filter out hosts that don't resolve
    contacts = contacts.filter(function (contact) { return !!contact })
    cb(null, contacts)
  })
}

/**
 * Perform a recurive node lookup for the given nodeId. If isFindNode is true, then
 * `find_node` will be sent to each peer instead of `get_peers`.
 * @param {Buffer|string} id node id or info hash
 * @param {Object=} opts
 * @param {boolean} opts.findNode
 * @param {Array.<string>} opts.addrs
 * @param {function} cb called with K closest nodes
 */
DHT.prototype.lookup = function (id, opts, cb) {
  var self = this
  if (self.destroyed) throw new Error('dht is destroyed')
  self._lookup(id, opts, cb)
}

/**
 * lookup() for private use. If DHT is destroyed, returns an error via callback.
 */
DHT.prototype._lookup = function (id, opts, cb) {
  var self = this

  if (self.destroyed) {
    return process.nextTick(function () {
      cb(new Error('dht is destroyed'))
    })
  }

  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}

  if (cb) cb = once(cb)
  else cb = noop

  var idBuffer = idToBuffer(id)
  id = idToHexString(id)

  if (self._binding) return self.once('listening', self._lookup.bind(self, id, opts, cb))
  if (!self.listening) return self.listen(self._lookup.bind(self, id, opts, cb))
  if (idBuffer.length !== 20) throw new Error('invalid node id / info hash length')

  self._debug('lookup %s %s', (opts.findNode ? '(find_node)' : '(get_peers)'), id)

  // Return local peers, if we have any in our table
  var peers = self.peers[id]
  if (peers) {
    peers = parsePeerInfo(peers.list)
    peers.forEach(function (peerAddr) {
      self._debug('emit peer %s %s from %s', peerAddr, id, 'local')
      self.emit('peer', peerAddr, id, 'local')
    })
  }

  var table = new KBucket({
    localNodeId: idBuffer,
    numberOfNodesPerKBucket: K,
    numberOfNodesToPing: MAX_CONCURRENCY
  })

  // NOT the same table as the one used for the lookup, as that table may have nodes without tokens
  if (!self.tables[id]) {
    self.tables[id] = new KBucket({
      localNodeId: idBuffer,
      numberOfNodesPerKBucket: K,
      numberOfNodesToPing: MAX_CONCURRENCY
    })
  }

  var tokenful = self.tables[id]

  function add (contact) {
    if (self._addrIsSelf(contact.addr) || bufferEqual(contact.id, self.nodeIdBuffer)) return
    if (contact.token) tokenful.add(contact)

    table.add(contact)
  }

  var queried = {}
  var pending = 0 // pending queries

  if (opts.addrs) {
    // kick off lookup with explicitly passed nodes (usually, bootstrap servers)
    opts.addrs.forEach(query)
  } else {
    // kick off lookup with nodes in the main table
    queryClosest()
  }

  function query (addr) {
    pending += 1
    queried[addr] = true

    if (opts.get) {
      self._sendGet(addr, idBuffer, onResponse.bind(null, addr))
    } else if (opts.findNode) {
      self._sendFindNode(addr, idBuffer, onResponse.bind(null, addr))
    } else {
      self._sendGetPeers(addr, idBuffer, onResponse.bind(null, addr))
    }
  }

  function queryClosest () {
    self.nodes.closest({ id: idBuffer }, K).forEach(function (contact) {
      query(contact.addr)
    })
  }

  // Note: `_sendFindNode` and `_sendGetPeers` will insert newly discovered nodes into
  // the routing table, so that's not done here.
  function onResponse (addr, err, res) {
    if (cb.called) return
    if (self.destroyed) return cb(new Error('dht is destroyed'))
    if (opts.get && res && res.v) {
      var isMutable = res.k || res.sig
      var sdata = encodeSigData(res)
      if (isMutable && !self._verify) {
        self._debug('ed25519 verify not provided')
      } else if (isMutable && !self._verify(res.sig, sdata, res.k)) {
        self._debug('invalid mutable hash from %s', addr)
      } else if (!isMutable && sha1.sync(bencode.encode(res.v)) !== id) {
        self._debug('invalid immutable hash from %s', addr)
      } else {
        return cb(null, res)
      }
    }

    pending -= 1
    var nodeIdBuffer = res && res.id
    var nodeId = idToHexString(nodeIdBuffer)

    // ignore errors - they are just timeouts
    if (err) {
      self._debug('got lookup error: %s', err.message)
    } else {
      self._debug('got lookup response from %s', nodeId)

      // add node that sent this response
      var contact = table.get(nodeIdBuffer) || { id: nodeIdBuffer, addr: addr }
      contact.token = res && res.token
      add(contact)

      // add nodes to this routing table for this lookup
      if (res && res.nodes) {
        res.nodes.forEach(function (contact) {
          add(contact)
        })
      }
    }

    // find closest unqueried nodes
    var candidates = table.closest({ id: idBuffer }, K)
      .filter(function (contact) {
        return !queried[contact.addr]
      })

    while (pending < MAX_CONCURRENCY && candidates.length) {
      // query as many candidates as our concurrency limit will allow
      query(candidates.pop().addr)
    }

    if (pending === 0 && candidates.length === 0) {
      // recursive lookup should terminate because there are no closer nodes to find
      self._debug('terminating lookup %s %s',
          (opts.findNode ? '(find_node)' : '(get_peers)'), id)

      var closest = (opts.findNode ? table : tokenful).closest({ id: idBuffer }, K)
      self._debug('K closest nodes are:')
      closest.forEach(function (contact) {
        self._debug('  ' + contact.addr + ' ' + idToHexString(contact.id))
      })
      if (opts.get) return cb(new Error('hash not found'))
      cb(null, closest)
    }
  }
}

/**
 * Called when another node sends a UDP message
 * @param {Buffer} data
 * @param {Object} rinfo
 */
DHT.prototype._onData = function (data, rinfo) {
  var self = this
  var addr = rinfo.address + ':' + rinfo.port
  var message, errMessage

  try {
    message = bencode.decode(data)
    if (!message) throw new Error('message is empty')
  } catch (err) {
    errMessage = err.message + ' from ' + addr + ' (' + data + ')'
    self._debug(errMessage)
    self.emit('warning', new Error(errMessage))
    return
  }

  var type = message.y && message.y.toString()

  if (type !== MESSAGE_TYPE.QUERY && type !== MESSAGE_TYPE.RESPONSE &&
      type !== MESSAGE_TYPE.ERROR) {
    errMessage = 'unknown message type ' + type + ' from ' + addr
    self._debug(errMessage)
    self.emit('warning', new Error(errMessage))
    return
  }

  // self._debug('got data %s from %s', JSON.stringify(message), addr)

  // Attempt to add every (valid) node that we see to the routing table.
  // TODO: If the node is already in the table, just update the "last heard from" time
  var nodeIdBuffer = (message.r && message.r.id) || (message.a && message.a.id)
  if (nodeIdBuffer) {
    // self._debug('adding (potentially) new node %s %s', idToHexString(nodeId), addr)
    self._addNode(addr, nodeIdBuffer, addr)
  }

  if (type === MESSAGE_TYPE.QUERY) {
    self._onQuery(addr, message)
  } else if (type === MESSAGE_TYPE.RESPONSE || type === MESSAGE_TYPE.ERROR) {
    self._onResponseOrError(addr, type, message)
  }
}

/**
 * Called when another node sends a query.
 * @param  {string} addr
 * @param  {Object} message
 */
DHT.prototype._onQuery = function (addr, message) {
  var self = this
  var query = message.q.toString()

  if (typeof self.queryHandler[query] === 'function') {
    self.queryHandler[query].call(self, addr, message)
  } else {
    var errMessage = 'unexpected query type'
    self._debug(errMessage)
    self._sendError(addr, message.t, ERROR_TYPE.METHOD_UNKNOWN, errMessage)
  }
}

/**
 * Called when another node sends a response or error.
 * @param  {string} addr
 * @param  {string} type
 * @param  {Object} message
 */
DHT.prototype._onResponseOrError = function (addr, type, message) {
  var self = this
  if (self.destroyed) return

  var transactionId = Buffer.isBuffer(message.t) && message.t.length === 2 &&
    message.t.readUInt16BE(0)

  var transaction = self.transactions && self.transactions[addr] &&
    self.transactions[addr][transactionId]

  var err = null
  if (type === MESSAGE_TYPE.ERROR) {
    err = new Error(Array.isArray(message.e) ? message.e.join(' ') : undefined)
  }

  if (!transaction || !transaction.cb) {
    // unexpected message!
    var errMessage
    if (err) {
      errMessage = 'got unexpected error from ' + addr + ' ' + err.message
      self._debug(errMessage)
      self.emit('warning', new Error(errMessage))
    } else {
      errMessage = 'got unexpected message from ' + addr + ' ' + JSON.stringify(message)
      self._debug(errMessage)
      self.emit('warning', new Error(errMessage))
    }
    return
  }

  transaction.cb(err, message.r)
}

/**
 * Send a UDP message to the given addr.
 * @param  {string} addr
 * @param  {Object} message
 * @param  {function=} cb  called once message has been sent
 */
DHT.prototype._send = function (addr, message, cb) {
  var self = this
  if (self._binding) return self.once('listening', self._send.bind(self, addr, message, cb))
  if (!cb) cb = noop
  var addrData = addrToIPPort(addr)
  var host = addrData[0]
  var port = addrData[1]

  if (!(port > 0 && port < 65535)) {
    return
  }

  // self._debug('send %s to %s', JSON.stringify(message), addr)
  message = bencode.encode(message)
  self.socket.send(message, 0, message.length, port, host, cb)
}

DHT.prototype._query = function (data, addr, cb) {
  var self = this

  if (!data.a) data.a = {}
  if (!data.a.id) data.a.id = self.nodeIdBuffer

  var transactionId = self._getTransactionId(addr, cb)
  var message = {
    t: transactionIdToBuffer(transactionId),
    y: MESSAGE_TYPE.QUERY,
    q: data.q,
    a: data.a
  }

  if (data.q === 'find_node') {
    self._debug('sent find_node %s to %s', data.a.target.toString('hex'), addr)
  } else if (data.q === 'get_peers') {
    self._debug('sent get_peers %s to %s', data.a.info_hash.toString('hex'), addr)
  }

  self._send(addr, message)
}

/**
 * Send "ping" query to given addr.
 * @param {string} addr
 * @param {function} cb called with response
 */
DHT.prototype._sendPing = function (addr, cb) {
  var self = this
  self._query({ q: 'ping' }, addr, cb)
}

/**
 * Called when another node sends a "ping" query.
 * @param  {string} addr
 * @param  {Object} message
 */
DHT.prototype._onPing = function (addr, message) {
  var self = this
  var res = {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: {
      id: self.nodeIdBuffer
    }
  }

  self._debug('got ping from %s', addr)
  self._send(addr, res)
}

/**
 * Send "find_node" query to given addr.
 * @param {string} addr
 * @param {Buffer|string} nodeId
 * @param {function} cb called with response
 */
DHT.prototype._sendFindNode = function (addr, nodeId, cb) {
  var self = this
  var nodeIdBuffer = idToBuffer(nodeId)

  function onResponse (err, res) {
    if (err) return cb(err)
    if (res.nodes) {
      res.nodes = parseNodeInfo(res.nodes)
      res.nodes.forEach(function (node) {
        self._addNode(node.addr, node.id, addr)
      })
    }
    cb(null, res)
  }

  var data = {
    q: 'find_node',
    a: {
      id: self.nodeIdBuffer,
      target: nodeIdBuffer
    }
  }

  self._query(data, addr, onResponse)
}

DHT.prototype._sendGet = function (addr, nodeId, cb) {
  var self = this
  var nodeIdBuffer = idToBuffer(nodeId)

  function onResponse (err, res) {
    if (err) return cb(err)
    if (res.nodes) {
      res.nodes = parseNodeInfo(res.nodes)
      res.nodes.forEach(function (node) {
        self._addNode(node.addr, node.id, addr)
      })
    }
    cb(null, res)
  }

  var data = {
    q: 'get',
    a: {
      id: self.nodeIdBuffer,
      target: nodeIdBuffer
    }
  }

  self._query(data, addr, onResponse)
}

/**
 * Called when another node sends a "find_node" query.
 * @param  {string} addr
 * @param  {Object} message
 */
DHT.prototype._onFindNode = function (addr, message) {
  var self = this

  var nodeIdBuffer = message.a && message.a.target
  var nodeId = idToHexString(nodeIdBuffer)

  if (!nodeIdBuffer) {
    var errMessage = '`find_node` missing required `a.target` field'
    self._debug(errMessage)
    self._sendError(addr, message.t, ERROR_TYPE.PROTOCOL, errMessage)
    return
  }
  self._debug('got find_node %s from %s', nodeId, addr)

  // Convert nodes to "compact node info" representation
  var nodes = convertToNodeInfo(self.nodes.closest({ id: nodeIdBuffer }, K))

  var res = {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: {
      id: self.nodeIdBuffer,
      nodes: nodes
    }
  }

  self._send(addr, res)
}

/**
 * Send "get_peers" query to given addr.
 * @param {string} addr
 * @param {Buffer|string} infoHash
 * @param {function} cb called with response
 */
DHT.prototype._sendGetPeers = function (addr, infoHash, cb) {
  var self = this
  var infoHashBuffer = idToBuffer(infoHash)
  infoHash = idToHexString(infoHash)

  function onResponse (err, res) {
    if (err) return cb(err)
    if (res.nodes) {
      res.nodes = parseNodeInfo(res.nodes)
      res.nodes.forEach(function (node) {
        self._addNode(node.addr, node.id, addr)
      })
    }
    if (res.values) {
      res.values = parsePeerInfo(res.values)
      res.values.forEach(function (peerAddr) {
        self._debug('emit peer %s %s from %s', peerAddr, infoHash, addr)
        self.emit('peer', peerAddr, infoHash, addr)
      })
    }
    cb(null, res)
  }

  var data = {
    q: 'get_peers',
    a: {
      id: self.nodeIdBuffer,
      info_hash: infoHashBuffer
    }
  }

  self._query(data, addr, onResponse)
}

/**
 * Called when another node sends a "get_peers" query.
 * @param  {string} addr
 * @param  {Object} message
 */
DHT.prototype._onGetPeers = function (addr, message) {
  var self = this
  var addrData = addrToIPPort(addr)

  var infoHashBuffer = message.a && message.a.info_hash
  if (!infoHashBuffer) {
    var errMessage = '`get_peers` missing required `a.info_hash` field'
    self._debug(errMessage)
    self._sendError(addr, message.t, ERROR_TYPE.PROTOCOL, errMessage)
    return
  }
  var infoHash = idToHexString(infoHashBuffer)
  self._debug('got get_peers %s from %s', infoHash, addr)

  var res = {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: {
      id: self.nodeIdBuffer,
      token: idToBuffer(self._generateToken(addrData[0]))
    }
  }

  var peers = self.peers[infoHash] && self.peers[infoHash].list
  if (peers) {
    // We know of peers for the target info hash. Peers are stored as an array of
    // compact peer info, so return it as-is.
    res.r.values = peers
  } else {
    // No peers, so return the K closest nodes instead. Convert nodes to "compact node
    // info" representation
    res.r.nodes = convertToNodeInfo(self.nodes.closest({ id: infoHashBuffer }, K))
  }

  self._send(addr, res)
}

/**
 * Send "announce_peer" query to given host and port.
 * @param {string} addr
 * @param {Buffer|string} infoHash
 * @param {number} port
 * @param {Buffer} token
 * @param {function=} cb called with response
 */
DHT.prototype._sendAnnouncePeer = function (addr, infoHash, port, token, cb) {
  var self = this
  var infoHashBuffer = idToBuffer(infoHash)
  if (!cb) cb = noop

  var data = {
    q: 'announce_peer',
    a: {
      id: self.nodeIdBuffer,
      info_hash: infoHashBuffer,
      port: port,
      token: token,
      implied_port: 0
    }
  }

  self._query(data, addr, cb)
}

/**
 * Called when another node sends a "announce_peer" query.
 * @param  {string} addr
 * @param  {Object} message
 */
DHT.prototype._onAnnouncePeer = function (addr, message) {
  var self = this
  var errMessage
  var addrData = addrToIPPort(addr)

  var infoHashBuffer = message.a && message.a.info_hash
  if (!infoHashBuffer) {
    errMessage = '`announce_peer` missing required `a.info_hash` field'
    self._debug(errMessage)
    self._sendError(addr, message.t, ERROR_TYPE.PROTOCOL, errMessage)
    return
  }
  var infoHash = idToHexString(infoHashBuffer)

  var tokenBuffer = message.a && message.a.token
  var token = idToHexString(tokenBuffer)
  if (!self._isValidToken(token, addrData[0])) {
    errMessage = 'cannot `announce_peer` with bad token'
    self._sendError(addr, message.t, ERROR_TYPE.PROTOCOL, errMessage)
    return
  }

  var port = message.a.implied_port !== 0
    ? addrData[1] // use port of udp packet
    : message.a.port // use port in `announce_peer` message

  self._debug(
    'got announce_peer %s %s from %s with token %s',
    infoHash, port, addr, token
  )

  self._addPeer(addrData[0] + ':' + port, infoHash)

  // send acknowledgement
  var res = {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: {
      id: self.nodeIdBuffer
    }
  }
  self._send(addr, res)
}

/**
 * Send an error to given host and port.
 * @param  {string} addr
 * @param  {Buffer|number} transactionId
 * @param  {number} code
 * @param  {string} errMessage
 */
DHT.prototype._sendError = function (addr, transactionId, code, errMessage) {
  var self = this

  if (transactionId && !Buffer.isBuffer(transactionId)) {
    transactionId = transactionIdToBuffer(transactionId)
  }

  var message = {
    y: MESSAGE_TYPE.ERROR,
    e: [code, errMessage]
  }

  if (transactionId) {
    message.t = transactionId
  }

  self._debug('sent error %s to %s', JSON.stringify(message), addr)
  self._send(addr, message)
}

/**
 * Get a transaction id, and (optionally) set a function to be called
 * @param  {string}   addr
 * @param  {function} fn
 */
DHT.prototype._getTransactionId = function (addr, fn) {
  var self = this
  fn = once(fn)
  var reqs = self.transactions[addr]
  if (!reqs) {
    reqs = self.transactions[addr] = {}
    reqs.nextTransactionId = 0
  }
  var transactionId = reqs.nextTransactionId
  reqs.nextTransactionId = UINT16 & (reqs.nextTransactionId + 1)

  function onTimeout () {
    reqs[transactionId] = null
    fn(new Error('query timed out'))
  }

  function onResponse (err, res) {
    clearTimeout(reqs[transactionId].timeout)
    reqs[transactionId] = null
    fn(err, res)
  }

  var timeout = setTimeout(onTimeout, SEND_TIMEOUT)
  if (timeout.unref) timeout.unref()
  reqs[transactionId] = {
    cb: onResponse,
    timeout: timeout
  }

  return transactionId
}

/**
 * Generate token (for response to `get_peers` query). Tokens are the SHA1 hash of
 * the IP address concatenated onto a secret that changes every five minutes. Tokens up
 * to ten minutes old are accepted.
 * @param {string} host
 * @param {string=} secret force token to use this secret, otherwise use current one
 * @return {string}
 */
DHT.prototype._generateToken = function (host, secret) {
  var self = this
  if (!secret) secret = self.secrets[0]
  return sha1.sync(host + secret)
}

/**
 * Checks if a token is valid for a given node's IP address.
 *
 * @param  {string} token
 * @param  {string} host
 * @return {boolean}
 */
DHT.prototype._isValidToken = function (token, host) {
  var self = this
  var validToken0 = self._generateToken(host, self.secrets[0])
  var validToken1 = self._generateToken(host, self.secrets[1])
  return token === validToken0 || token === validToken1
}

/**
 * Rotate secrets. Secrets are rotated every 5 minutes and tokens up to ten minutes
 * old are accepted.
 */
DHT.prototype._rotateSecrets = function () {
  var self = this

  function createSecret () {
    return hat(SECRET_ENTROPY)
  }

  // Initialize secrets array
  // self.secrets[0] is the current secret, used to generate new tokens
  // self.secrets[1] is the last secret, which is still accepted
  if (!self.secrets) {
    self.secrets = [ createSecret(), createSecret() ]
    return
  }

  self.secrets[1] = self.secrets[0]
  self.secrets[0] = createSecret()
}

/**
 * Get a string that can be used to initialize and bootstrap the DHT in the
 * future.
 * @return {Array.<Object>}
 */
DHT.prototype.toArray = function () {
  var self = this
  var nodes = self.nodes.toArray().filter(dropData).map(function (contact) {
    // to remove properties added by k-bucket, like `distance`, etc.
    return {
      id: contact.id.toString('hex'),
      addr: contact.addr
    }
  })
  return nodes

  function dropData (x) { return !x.data }
}

DHT.prototype._addrIsSelf = function (addr) {
  var self = this
  return self._port &&
    LOCAL_HOSTS[self._ipv].some(function (host) { return host + ':' + self._port === addr })
}

DHT.prototype._debug = function () {
  var self = this
  var args = [].slice.call(arguments)
  args[0] = '[' + self.nodeId.substring(0, 7) + '] ' + args[0]
  debug.apply(null, args)
}

/**
 * Parse saved string
 * @param  {Array.<Object>} nodes
 * @return {Buffer}
 */
function fromArray (nodes) {
  nodes.forEach(function (node) {
    if (node.id) node.id = idToBuffer(node.id)
  })
  return nodes
}

/**
 * Convert "contacts" from the routing table into "compact node info" representation.
 * @param  {Array.<Object>} contacts
 * @return {Buffer}
 */
function convertToNodeInfo (contacts) {
  return Buffer.concat(contacts.map(function (contact) {
    return Buffer.concat([ contact.id, string2compact(contact.addr) ])
  }))
}

/**
 * Parse "compact node info" representation into "contacts".
 * @param  {Buffer} nodeInfo
 * @return {Array.<string>}  array of
 */
function parseNodeInfo (nodeInfo) {
  var contacts = []
  try {
    for (var i = 0; i < nodeInfo.length; i += 26) {
      contacts.push({
        id: nodeInfo.slice(i, i + 20),
        addr: compact2string(nodeInfo.slice(i + 20, i + 26))
      })
    }
  } catch (err) {
    debug('error parsing node info ' + nodeInfo)
  }
  return contacts
}

/**
 * Parse list of "compact addr info" into an array of addr "host:port" strings.
 * @param  {Array.<Buffer>} list
 * @return {Array.<string>}
 */
function parsePeerInfo (list) {
  try {
    return list.map(compact2string)
  } catch (err) {
    debug('error parsing peer info ' + list)
    return []
  }
}

/**
 * Ensure a transacation id is a 16-bit buffer, so it can be sent on the wire as
 * the transaction id ("t" field).
 * @param  {number|Buffer} transactionId
 * @return {Buffer}
 */
function transactionIdToBuffer (transactionId) {
  if (Buffer.isBuffer(transactionId)) {
    return transactionId
  } else {
    var buf = new Buffer(2)
    buf.writeUInt16BE(transactionId, 0)
    return buf
  }
}

/**
 * Ensure info hash or node id is a Buffer.
 * @param  {string|Buffer} id
 * @return {Buffer}
 */
function idToBuffer (id) {
  if (Buffer.isBuffer(id)) {
    return id
  } else {
    return new Buffer(id, 'hex')
  }
}

/**
 * Ensure info hash or node id is a hex string.
 * @param  {string|Buffer} id
 * @return {Buffer}
 */
function idToHexString (id) {
  if (Buffer.isBuffer(id)) {
    return id.toString('hex')
  } else {
    return id
  }
}

function encodeSigData (msg) {
  var ref = { seq: msg.seq || 0, v: msg.v }
  if (msg.salt) ref.salt = msg.salt
  return bencode.encode(ref).slice(1, -1)
}

function noop () {}
