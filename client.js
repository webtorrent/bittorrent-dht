// TODO:
// - Use the same DHT object for looking up multiple torrents
// - Persist the routing table for later bootstrapping
// - Use actual DHT data structure with "buckets" (follow spec)
// - Add the method that allows us to list ourselves in the DHT
// - Use a fast Set to make addPeer / removePeer faster

module.exports = DHT

var bncode = require('bncode')
var bufferEqual = require('buffer-equal')
var compact2string = require('compact2string')
var debug = require('debug')('bittorrent-dht')
var dgram = require('dgram')
var EventEmitter = require('events').EventEmitter
var hat = require('hat')
var inherits = require('inherits')
var KBucket = require('k-bucket')
var string2compact = require('string2compact')
var once = require('once')
var portfinder = require('portfinder')
var Rusha = require('rusha-browserify') // Fast SHA1 (works in browser)

portfinder.basePort = Math.floor(Math.random() * 60000) + 1025 // ports above 1024

var BOOTSTRAP_NODES = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881'
]
var BOOTSTRAP_TIMEOUT = 5000
var MAX_QUERY_PER_SECOND = 200
var MAX_REQUESTS = 3
var QUEUE_QUERY_INTERVAL = Math.floor(1000 / MAX_QUERY_PER_SECOND)
var SEND_TIMEOUT = 2000

var SECRET_ENTROPY = 128 // entropy of token secrets
var ROTATE_INTERVAL = 5 * 60 * 1000 // rotate secrets every 5 minutes

var K = 8 // number of nodes per bucket

var MESSAGE_TYPE = {
  QUERY: 'q',
  RESPONSE: 'r',
  ERROR: 'e'
}
var ERROR_TYPE = {
  GENERIC: 201,
  SERVER: 202,
  PROTOCOL: 203, // malformed packet, invalid arguments, or bad token
  METHOD_UNKNOWN: 204
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

  if (!opts) opts = {}
  if (!opts.nodeId) opts.nodeId = hat(160)

  self.nodeId = idToBuffer(opts.nodeId)

  if (opts.bootstrap === false) {
    self.queue = []
  } else if (Array.isArray(opts.bootstrap)) {
    self.queue = [].concat(opts.bootstrap)
  } else {
    self.queue = [].concat(BOOTSTRAP_NODES)
  }

  self.listening = false
  self._closed = false
  self.port = null

  self.nodes = new KBucket({
    localNodeId: self.nodeId
  })

  /**
   * Lookup cache to prevent excessive GC.
   * @type {Object} addr:string -> [host:string, port:number]
   */
  self._addrData = {}

  /**
   * Pending transactions (unresolved requests to peers)
   * @type {Object} addr:string -> array of pending transactions
   */
  self.transactions = {}

  /**
   * Peer address data (tracker storage)
   * @type {Object} infoHash:string -> Set of peers
   */
  self.peers = {}

  self.reqs = {} // ?

  // Number of peers we still need to find to satisfy the last call to findPeers
  self.missingPeers = 0 // ?

  // Create socket and attach listeners
  self.socket = dgram.createSocket('udp4')
  self.socket.on('message', self._onData.bind(self))
  self.socket.on('listening', self._onListening.bind(self))
  self.socket.on('error', function () {}) // throw away errors

  self._rotateSecrets()
  self._rotateInterval = setInterval(self._rotateSecrets.bind(self), ROTATE_INTERVAL)
  self._rotateInterval.unref()
}

/**
 * Start listening for UDP messages on given port.
 * @param  {number} port
 * @param  {function=} onlistening added as handler for listening event
 */
DHT.prototype.listen = function (port, onlistening) {
  var self = this
  if (typeof port === 'function') {
    onlistening = port
    port = undefined
  }

  if (self._closed || self.listening) {
    return
  }

  if (onlistening)
    self.once('listening', onlistening)

  function onPort (err, port) {
    if (err) return self.emit('error', err)
    self.port = port
    self.socket.bind(self.port)
  }

  if (port) {
    onPort(null, port)
  } else {
    portfinder.getPort(onPort)
  }
}

/**
 * Called when DHT is listening for UDP messages.
 * @return {[type]} [description]
 */
DHT.prototype._onListening = function () {
  var self = this
  self.listening = true
  self.emit('listening', self.port)
}

/**
 * Destroy and cleanup the DHT.
 * @param  {function=} cb
 */
DHT.prototype.destroy = function (cb) {
  var self = this
  if (!cb) cb = function () {}

  self.listening = false
  self._closed = true
  self.port = null

  // garbage collect large data structures
  self.nodes = null
  self.peers = null
  self._addrData = null

  clearInterval(self._rotateInterval)

  try {
    self.socket.close()
  } catch (err) {
    // ignore error, socket was either already closed / not yet bound
  }
  cb(null)
}

/**
 * Add a DHT node to the routing table.
 * @param {string|Buffer} nodeId
 * @param {string=} addr
 */
DHT.prototype.addNode = function (nodeId, addr) {
  var self = this
  nodeId = idToBuffer(nodeId)

  if (addr === undefined) {
    // we don't know node's address -- add node to queue
    // TODO
  } else {
    // we know node's address -- add node to table
    self.nodes.add({
      id: nodeId,
      addr: addr
    })
  }
}

/**
 * Remove a DHT node from the routing table.
 * @param  {string|Buffer} nodeId
 */
DHT.prototype.removeNode = function (nodeId) {
  var self = this
  var contact = self.nodes.get(idToBuffer(nodeId))
  if (contact) {
    self.nodes.remove(contact)
  }
}

DHT.prototype.addPeer = function (infoHash, addr) {
  var self = this
  infoHash = idToHexString(infoHash)

  var peers = self.peers[infoHash]
  if (!peers) {
    peers = self.peers[infoHash] = []
  }

  var compactPeerInfo = string2compact(addr)

  // TODO: make this faster using a set
  var exists = peers.some(function (peer) {
    return bufferEqual(peer, compactPeerInfo)
  })

  if (!exists) {
    peers.push(compactPeerInfo)
  }
}

DHT.prototype.removePeer = function (infoHash, addr) {
  var self = this
  infoHash = idToHexString(infoHash)

  var peers = self.peers[infoHash]
  if (peers) {
    var compactPeerInfo = string2compact(addr)

    // TODO: make this faster using a set
    peers.some(function (peer, index) {
      if (bufferEqual(peer, compactPeerInfo)) {
        peers.splice(removeIndex, 1)
        return true // abort early
      }
    })
  }
}

// TODO: remove
// DHT.prototype.query = function (addr) {
//   var self = this
//   if (self.missingPeers <= 0 || self._closed)
//     return

//   var addrData = getAddrData(addr)
//   var host = addrData[0]
//   var port = addrData[1]

//   if (!(port > 0 && port < 65535)) {
//     return
//   }

//   self._send(self.message, host, port, function () {
//     setTimeout(function () {
//       self.reqs[addr] = (self.reqs[addr] || 0) + 1
//       if (!self.nodes[addr] && self.reqs[addr] < MAX_REQUESTS) {
//         self.query.call(self, addr)
//       }
//     }, SEND_TIMEOUT)
//   })
// }

/**
 * Send a UDP message to the given host and port.
 * @param  {string} host
 * @param  {number} port
 * @param  {Object} message
 * @param  {function=} cb  called once message has been sent
 */
DHT.prototype._send = function (host, port, message, cb) {
  var self = this
  if (!cb) cb = function () {}

  message = bncode.encode(message)
  self.socket.send(message, 0, message.length, port, host, cb)
}

/**
 * Send "ping" query to given host and port.
 * @param {string} host
 * @param {number} port
 * @param {function} cb called with response
 */
DHT.prototype._sendPing = function (host, port, cb) {
  var self = this
  var addr = host + ':' + port

  var transactionId = self._getTransactionId(addr, cb)
  var message = {
    t: transactionIdToBuffer(transactionId),
    y: MESSAGE_TYPE.QUERY,
    q: 'ping',
    a: {
      id: self.nodeId
    }
  }
  self._send(host, port, message)
}

/**
 * Called when another node sends a "ping" query.
 * @param  {string} host
 * @param  {number} port
 * @param  {Object} message
 */
DHT.prototype._onPing = function (host, port, message) {
  var self = this
  var res = {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: {
      id: self.nodeId
    }
  }

  self._send(host, port, res)
}

/**
 * Send "find_node" query to given host and port.
 * @param {string} host
 * @param {number} port
 * @param {Buffer} targetNodeId
 * @param {function} cb called with response
 */
DHT.prototype._sendFindNode = function (host, port, targetNodeId, cb) {
  var self = this
  var addr = host + ':' + port

  var transactionId = self._getTransactionId(addr, cb)
  var message = {
    t: transactionIdToBuffer(transactionId),
    y: MESSAGE_TYPE.QUERY,
    q: 'find_node',
    a: {
      id: self.nodeId,
      target: targetNodeId
    }
  }
  self._send(host, port, message)
}

/**
 * Called when another node sends a "find_node" query.
 * @param  {string} host
 * @param  {number} port
 * @param  {Object} message
 */
DHT.prototype._onFindNode = function (host, port, message) {
  var self = this

  var targetNodeId = message.a && message.a.target

  if (!targetNodeId) {
    var errMessage = '`find_node` missing required `message.a.target` field'
    debug(errMessage)
    self._sendError(host, port, message.t, ERROR_TYPE.PROTOCOL, errMessage)
    return
  }

  // Get the target node id if it exists in the routing table. Otherwise, get the
  // K closest nodes.
  var contacts = self.nodes.get(targetNodeId)
    || self.nodes.closest({ id: targetNodeId }, K)
    || []

  if (!Array.isArray(contacts)) {
    contacts = [ contacts ]
  }

  // Convert nodes to "compact node info" representation
  var nodes = self._contactsToCompact(contacts)

  var res = {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: {
      id: self.nodeId,
      nodes: nodes
    }
  }

  self._send(host, port, res)
}

/**
 * Send "get_peers" query to given host and port.
 * @param {string} host
 * @param {number} port
 * @param {Buffer|string} infoHash
 * @param {function} cb called with response
 */
DHT.prototype._sendGetPeers = function (host, port, infoHash, cb) {
  var self = this
  var addr = host + ':' + port
  infoHash = idToBuffer(infoHash)

  var transactionId = self._getTransactionId(addr, cb)
  var message = {
    t: transactionIdToBuffer(transactionId),
    y: MESSAGE_TYPE.QUERY,
    q: 'get_peers',
    a: {
      id: self.nodeId,
      info_hash: infoHash
    }
  }
  self._send(host, port, message)
}

/**
 * Called when another node sends a "get_peers" query.
 * @param  {string} host
 * @param  {number} port
 * @param  {Object} message
 */
DHT.prototype._onGetPeers = function (host, port, message) {
  var self = this

  var targetInfoHash = idToHexString(message.a && message.a.info_hash)
  if (!targetInfoHash) {
    var errMessage = '`get_peers` missing required `message.a.info_hash` field'
    debug(errMessage)
    self._sendError(host, port, message.t, ERROR_TYPE.PROTOCOL, errMessage)
    return
  }

  var res = {
    t: message.t,
    y: MESSAGE_TYPE.RESPONSE,
    r: {
      id: self.nodeId,
      token: self._getToken(host)
    }
  }

  var peers = self.peers[targetInfoHash]
  if (peers) {
    // We know of peers for the target info hash. Peers are stored as an array of
    // compact peer info, so return it as-is.
    res.r.values = peers
  } else {
    // No peers, so return the K closest nodes instead.
    var contacts = self.nodes.closest({ id: targetInfoHash }, K)
    // Convert nodes to "compact node info" representation
    res.r.nodes = self._contactsToCompact(contacts)
  }

  self._send(host, port, res)
}

/**
 * Send an error to given host and port.
 * @param  {string} host
 * @param  {number} port
 * @param  {Buffer|number} transactionId
 * @param  {number} code
 * @param  {string} message
 */
DHT.prototype._sendError = function (host, port, transactionId, code, message) {
  var self = this

  if (transactionId && !Buffer.isBuffer(transactionId)) {
    transactionId = transactionIdToBuffer(transactionId)
  }

  var message = {
    y: MESSAGE_TYPE.ERROR,
    e: [code, message]
  }

  if (transactionId) {
    message.t = transactionId
  }

  self._send(host, port, message)
}

/**
 * Given an "address:port" string, return an array [address:string, port:number].
 * Uses a cache to prevent excessive array allocations.
 * @param  {string} addr
 * @return {Array.<*>}
 */
DHT.prototype._getAddrData = function (addr) {
  var self = this
  if (!self._addrData[addr]) {
    var array = addr.split(':')
    array[1] = Number(array[1])
    self._addrData[addr] = array
  }
  return self._addrData[addr]
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
    reqs = self.transactions[addr] = []
    reqs.nextTransactionId = 1
  }
  var transactionId = reqs.nextTransactionId
  reqs.nextTransactionId += 1

  function onTimeout () {
    reqs[transactionId] = null
    fn(new Error('query timed out'))
  }

  function onResponse (err, data) {
    clearTimeout(reqs[transactionId].timeout)
    reqs[transactionId] = null
    fn(err, data)
  }

  reqs[transactionId] = {
    cb: onResponse,
    timeout: setTimeout(onTimeout, SEND_TIMEOUT)
  }

  return transactionId
}

/**
 * Generate token (for response to `get_peers` query). Tokens are the SHA1 hash of
 * the IP address concatenated onto a secret that changes every five minutes. Tokens up
 * to ten minutes old are accepted.
 * @param {string} host
 * @param {Buffer=} secret force token to use this secret, otherwise use current one
 * @return {Buffer}
 */
DHT.prototype._getToken = function (host, secret) {
  var self = this
  if (!secret) secret = self.secrets[0]
  return sha1(Buffer.concat([new Buffer(host, 'utf8'), secret]))
}

/**
 * Checks if a token is valid for a given node's IP address.
 *
 * @param  {Buffer} token
 * @param  {string} host
 * @return {boolean}
 */
DHT.prototype._isValidToken = function (token, host) {
  var self = this
  var validToken0 = self._getToken(host, self.secrets[0])
  var validToken1 = self._getToken(host, self.secrets[1])
  return bufferEqual(token, validToken0) || bufferEqual(token, validToken1)
}

/**
 * Rotate secrets. Secrets are rotated every 5 minutes and tokens up to ten minutes
 * old are accepted.
 */
DHT.prototype._rotateSecrets = function () {
  var self = this

  function createSecret () {
    return new Buffer(hat(SECRET_ENTROPY), 'hex')
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
 * Convert "contacts" from the routing table into "compact node info" representation.
 * @param  {Array.<Object>} nodes
 * @return {Buffer}
 */
DHT.prototype._contactsToCompact = function (contacts) {
  var self = this
  return string2compact(contacts.map(function (contact) {
    return contact.addr
  }))
}

// DHT.prototype._queryQueue = function () {
//   var self = this
//   if (self.queue.length) {
//     self.query(self.queue.pop())
//   } else {
//     clearInterval(self.queueInterval)
//     self.queueInterval = null
//   }
// }

// /* Start querying queue, if not already */
// DHT.prototype.queryQueue = function () {
//   var self = this
//   if (!self.queryInterval) {
//     self.queryInterval = setInterval(self._queryQueue.bind(self), QUEUE_QUERY_INTERVAL)
//     self.queryInterval.unref()
//   }
// }

// DHT.prototype.findPeers = function (num) {
//   var self = this
//   if (self._closed) return
//   if (!num) num = 1

//   // TODO: keep track of missing peers for each `findPeers` call separately!
//   self.missingPeers += num

//   // Start querying queue
//   self.queryQueue()

//   // If we are connected to no nodes after timeout period, then retry with
//   // the bootstrap nodes.
//   setTimeout(function () {
//     if (self.nodes.count() === 0) {
//       debug('No DHT nodes replied, retry with bootstrap nodes')
//       self.queue.push.apply(self.queue, BOOTSTRAP_NODES)
//       self.missingPeers = 0
//       self.findPeers(num)
//     }
//   }, BOOTSTRAP_TIMEOUT)
// }


// /**
//  * Called when client finds a new DHT node
//  * @param  {string} addr
//  */
// DHT.prototype._handleNode = function (addr) {
//   var self = this
//   if (self.nodes[addr]) {
//     return
//   }

//   // TODO: Something like this might be needed for safety. (?)
//   //if (self.queue.length < 10000) self.queue.push(addr)
//   self.queue.push(addr)
//   self.queryQueue()

//   self.emit('node', addr, self.infoHash.toString('hex'))
// }

// /**
//  * Called when client finds a new peer
//  * @param  {string} addr
//  */
// DHT.prototype._handlePeer = function (addr) {
//   var self = this
//   if (self.peers[addr]) return
//   self.peers[addr] = true
//   self.missingPeers = Math.max(0, self.missingPeers - 1)

//   self.emit('peer', addr, self.infoHash.toString('hex'))
// }

/**
 * Called when someone sends a UDP message
 * @param {Buffer} data
 * @param {Object} rinfo
 */
DHT.prototype._onData = function (data, rinfo) {
  var self = this
  var host = rinfo.address
  var port = rinfo.port
  var addr = host + ':' + port

  try {
    var message = bncode.decode(data)
    if (!message) throw new Error('message is empty')
  } catch (err) {
    debug('bad message from ' + addr + ' ' + err.message)
    return
  }

  debug('got message from ' + addr + ' ' + JSON.stringify(message))

  var type = message.y.toString()

  if (type === MESSAGE_TYPE.QUERY) {
    self._onQuery(host, port, message)
  } else if (type === MESSAGE_TYPE.RESPONSE || type === MESSAGE_TYPE.ERROR) {
    self._onResponseOrError(host, port, type, message)
  } else {
    debug('unknown message type ' + type)
  }

  // // Mark that we've seen this node (the one we received data from)
  // self.nodes[addr] = true

  // // Reset outstanding req count to 0 (better than using "delete" which invalidates
  // // the V8 inline cache
  // self.reqs[addr] = 0

  // var r = message && message.r

  // if (r && Buffer.isBuffer(r.nodes)) {
  //   parseNodeInfo(r.nodes).forEach(self._handleNode.bind(self))
  // }
  // if (r && Array.isArray(r.values)) {
  //   parsePeerInfo(r.values).forEach(self._handlePeer.bind(self))
  // }
}

DHT.prototype._onQuery = function (host, port, message) {
  var self = this
  var query = message.q.toString()

  if (query === 'ping') {
    self._onPing(host, port, message)
  } else if (query === 'find_node') {
    self._onFindNode(host, port, message)
  } else if (query === 'get_peers') {
    self._onGetPeers(host, port, message)
  } else {
    var errMessage = 'unexpected query type ' + query
    debug(errMessage)
    self._sendError(host, port, message.t, ERROR_TYPE.METHOD_UNKNOWN, errMessage)
  }
}

DHT.prototype._onResponseOrError = function (host, port, type, message) {
  var self = this

  var addr = host + ':' + port
  var transactionId = Buffer.isBuffer(message.t) && message.t.readUInt16BE(0)

  var transaction = self.transactions[addr] && self.transactions[addr][transactionId]

  var err = null
  if (type === MESSAGE_TYPE.ERROR) {
    err = new Error(Array.isArray(message.e) ? message.e.join(' ') : undefined)
  }

  if (transaction && transaction.cb) {
    transaction.cb(err, message.r)
  } else {
    if (err) {
      var errMessage = 'got unexpected error from ' + addr + ' ' + err.message
      debug(errMessage)
      self.emit('warning', new Error(err))
    } else {
      debug('got unexpected message from ' + addr + ' ' + JSON.stringify(message))
      self._sendError(host, port, message.t, ERROR_TYPE.GENERIC, 'unexpected message')
    }
  }
}

// function parseNodeInfo (nodeInfo) {
//   try {
//     var nodes = []
//     for (var i = 0; i < nodeInfo.length; i += 26) {
//       nodes.push(compact2string(nodeInfo.slice(i + 20, i + 26)))
//     }
//     return nodes
//   } catch (err) {
//     debug('Error parsing node info ' + nodeInfo)
//     return []
//   }
// }

// function parsePeerInfo (list) {
//   try {
//     return list.map(compact2string)
//   } catch (err) {
//     debug('Error parsing peer info ' + list)
//     return []
//   }
// }

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

function sha1 (buf) {
  return (new Rusha()).digestFromBuffer(buf)
}
