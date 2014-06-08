// TODO:
// - Use the same DHT object for looking up multiple torrents
// - Persist the routing table for later bootstrapping
// - Use actual DHT data structure with "buckets" (follow spec)
// - Add the method that allows us to list ourselves in the DHT
// - https://github.com/czzarr/node-bitwise-xor

module.exports = DHT

var bncode = require('bncode')
var compact2string = require('compact2string')
var debug = require('debug')('bittorrent-dht')
var dgram = require('dgram')
var EventEmitter = require('events').EventEmitter
var hat = require('hat')
var inherits = require('inherits')
var KBucket = require('k-bucket')
var once = require('once')
var portfinder = require('portfinder')

portfinder.basePort = Math.floor(Math.random() * 60000) + 1025 // ports above 1024

var BOOTSTRAP_NODES = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881'
]
var BOOTSTRAP_TIMEOUT = 5000
var MAX_NODES = 5000
var MAX_QUERY_PER_SECOND = 200
var MAX_REQUESTS = 3
var QUEUE_QUERY_INTERVAL = Math.floor(1000 / MAX_QUERY_PER_SECOND)
var SEND_TIMEOUT = 2000

var MESSAGE_TYPE = { QUERY: 'q', RESPONSE: 'r', ERROR: 'e' }

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

  self.nodeId = typeof opts.nodeId === 'string'
    ? new Buffer(opts.nodeId, 'hex')
    : opts.nodeId

  if (opts.bootstrap === false) {
    self.queue = []
  } else if (Array.isArray(opts.bootstrap)) {
    self.queue = [].concat(opts.bootstrap)
  } else {
    self.queue = [].concat(BOOTSTRAP_NODES)
  }

  self.nodes = new KBucket({
    localNodeId: self.nodeId
  })

  self.requests = []

  // Address data cache
  // addr:string -> [host:string, port:number]
  self._addrData = {}

  self.peers = {}
  self.reqs = {}

  // Number of peers we still need to find to satisfy the last call to findPeers
  self.missingPeers = 0

  self.port = null
  self.requestId = 1
  self.pendingRequests = {}

  self.pendingRequests[self.requestId] = 1

  self.listening = false
  self._closed = false

  // Create socket and attach listeners
  self.socket = dgram.createSocket('udp4')
  self.socket.on('message', self._onData.bind(self))
  self.socket.on('listening', self._onListening.bind(self))
  self.socket.on('error', function () {}) // throw away errors
}

DHT.prototype.destroy = function (cb) {
  var self = this
  if (!cb) cb = function () {}
  self.listening = false
  self._closed = true
  try {
    self.socket.close()
  } catch (err) {
    // ignore error, socket was either already closed / not yet bound
  }
  cb(null)
}

// TODO: support setting multiple infohashes
DHT.prototype.setInfoHash = function (infoHash) {
  var self = this
  self.infoHash = typeof infoHash === 'string'
    ? new Buffer(infoHash, 'hex')
    : infoHash

  self.message = {
    t: self.requestId.toString(),
    y: 'q',
    q: 'get_peers',
    a: {
      id: self.nodeId,
      info_hash: self.infoHash
    }
  }
}

/**
 * Given an address/port string, return an array where arr[0] is host, and arr[1] is port
 * (as a Number). This uses a cache, so we don't need to keep creating new arrays. This
 * helps out the GC.
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

DHT.prototype.query = function (addr) {
  var self = this
  if (self.nodes.count() > MAX_NODES || self.missingPeers <= 0 || self._closed)
    return

  var addrData = getAddrData(addr)
  var host = addrData[0]
  var port = addrData[1]

  if (!(port > 0 && port < 65535)) {
    return
  }

  self._send(self.message, host, port, function () {
    setTimeout(function () {
      self.reqs[addr] = (self.reqs[addr] || 0) + 1
      if (!self.nodes[addr] && self.reqs[addr] < MAX_REQUESTS) {
        self.query.call(self, addr)
      }
    }, SEND_TIMEOUT)
  })
}

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
 * @param  {string} host
 * @param  {number} port
 */
DHT.prototype.ping = function (host, port, cb) {
  var self = this
  var addr = host + ':' + port

  var transactionId = self._getTransactionId(addr, cb)
  debug(transactionId)
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
 * Get a transaction Id
 * @param  {[type]}   addr [description]
 * @param  {Function} cb   [description]
 * @return {[type]}        [description]
 */
DHT.prototype._getTransactionId = function (addr, cb) {
  var self = this
  cb = once(cb)
  var reqs = self.requests[addr]
  if (!reqs) {
    reqs = self.requests[addr] = []
    reqs.nextTransactionId = 1
  }
  var transactionId = reqs.nextTransactionId
  reqs.nextTransactionId += 1

  function onTimeout () {
    cb(new Error('query timed out'))
  }

  function onResponse (err, data) {
    reqs[transactionId] = null
    cb(err, data)
  }

  reqs[transactionId] = {
    cb: onResponse,
    timeout: setTimeout(onTimeout, SEND_TIMEOUT)
  }

  return transactionId
}

DHT.prototype._queryQueue = function () {
  var self = this
  if (self.queue.length) {
    self.query(self.queue.pop())
  } else {
    clearInterval(self.queueInterval)
    self.queueInterval = null
  }
}

/* Start querying queue, if not already */
DHT.prototype.queryQueue = function () {
  var self = this
  if (!self.queryInterval) {
    self.queryInterval = setInterval(self._queryQueue.bind(self), QUEUE_QUERY_INTERVAL)
    self.queryInterval.unref()
  }
}

DHT.prototype.findPeers = function (num) {
  var self = this
  if (self._closed) return
  if (!num) num = 1

  // TODO: keep track of missing peers for each `findPeers` call separately!
  self.missingPeers += num

  // Start querying queue
  self.queryQueue()

  // If we are connected to no nodes after timeout period, then retry with
  // the bootstrap nodes.
  setTimeout(function () {
    if (self.nodes.count() === 0) {
      debug('No DHT nodes replied, retry with bootstrap nodes')
      self.queue.push.apply(self.queue, BOOTSTRAP_NODES)
      self.missingPeers = 0
      self.findPeers(num)
    }
  }, BOOTSTRAP_TIMEOUT)
}

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

DHT.prototype._onListening = function () {
  var self = this
  self.listening = true
  self.emit('listening', self.port)
}

/**
 * Called when client finds a new DHT node
 * @param  {string} addr
 */
DHT.prototype._handleNode = function (addr) {
  var self = this
  if (self.nodes[addr]) {
    return
  }

  // TODO: Something like this might be needed for safety. (?)
  //if (self.queue.length < 10000) self.queue.push(addr)
  self.queue.push(addr)
  self.queryQueue()

  self.emit('node', addr, self.infoHash.toString('hex'))
}

/**
 * Called when client finds a new peer
 * @param  {string} addr
 */
DHT.prototype._handlePeer = function (addr) {
  var self = this
  if (self.peers[addr]) return
  self.peers[addr] = true
  self.missingPeers = Math.max(0, self.missingPeers - 1)

  self.emit('peer', addr, self.infoHash.toString('hex'))
}

/**
 * Called when someone sends us a UDP message
 * @param {Buffer} data
 * @param {Object} rinfo
 */
DHT.prototype._onData = function (data, rinfo) {
  var self = this
  var host = rinfo.address
  var port = rinfo.port
  var addr = host + ':' + port

  var message
  try {
    message = bncode.decode(data)
    if (!message) throw new Error('message is empty')
  } catch (err) {
    debug('bad message from ' + addr + ' ' + err.message)
    return
  }

  debug('got message from ' + addr + ' ' + JSON.stringify(message))

  var type = message.y.toString()

  if (type === MESSAGE_TYPE.QUERY) {
    var query = message.q.toString()
    if (query === 'ping') {
      self._onPing(host, port, message)
    } else {
      debug('unexpected query type ' + query)
    }

  } else if (type === MESSAGE_TYPE.RESPONSE || type === MESSAGE_TYPE.ERROR) {
    var err
    if (type === MESSAGE_TYPE.ERROR) {
      err = new Error(Array.isArray(message.e) ? message.e.join(' ') : undefined)
    } else {
      err = null
    }

    var reqs = self.requests[addr]
    var transactionId = Buffer.isBuffer(message.t) && message.t.readUInt16BE(0)
    var transaction = reqs && reqs[transactionId]
    if (!transaction || !transaction.cb) {
      if (type === MESSAGE_TYPE.ERROR) {
        debug('got unexpected error from ' + addr + ' ' + err.message)
      } else {
        debug('got unexpected message from ' + addr + ' ' + JSON.stringify(message))
      }
      return
    }

    transaction.cb(err, message.r)
    clearTimeout(transaction.timeout)

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

function parseNodeInfo (nodeInfo) {
  try {
    var nodes = []
    for (var i = 0; i < nodeInfo.length; i += 26) {
      nodes.push(compact2string(nodeInfo.slice(i + 20, i + 26)))
    }
    return nodes
  } catch (err) {
    debug('Error parsing node info ' + nodeInfo)
    return []
  }
}

function parsePeerInfo (list) {
  try {
    return list.map(compact2string)
  } catch (err) {
    debug('Error parsing peer info ' + list)
    return []
  }
}

/**
 * Convert a transacation id (number) to a 16-bit buffer to send on the wire as the
 * transaction id ("t" field).
 * @param  {number} transactionId
 * @return {Buffer}
 */
function transactionIdToBuffer (transactionId) {
  var buf = new Buffer(2)
  buf.writeUInt16BE(transactionId, 0)
  return buf
}
