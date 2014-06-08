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
var portfinder = require('portfinder')

// Use random port above 1024
portfinder.basePort = Math.floor(Math.random() * 60000) + 1025

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
var REQ_TIMEOUT = 2000

function parseNodeInfo (compact) {
  try {
    var nodes = []
    for (var i = 0; i < compact.length; i += 26) {
      nodes.push(compact2string(compact.slice(i + 20, i + 26)))
    }
    return nodes
  } catch (err) {
    debug('Invalid node info ' + compact)
    return []
  }
}

function parsePeerInfo (list) {
  try {
    return list.map(compact2string)
  } catch (err) {
    debug('Invalid peer info ' + list)
    return []
  }
}

inherits(DHT, EventEmitter)

/**
 * Create a new DHT
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

  self.nodes = {}
  self.nodesCounter = 0
  self.nodesList = null // list cache
  self.peers = {}
  self.reqs = {}

  if (opts.bootstrap === false) {
    self.queue = []
  } else if (Array.isArray(opts.bootstrap)) {
    self.queue = [].concat(opts.bootstrap)
  } else {
    self.queue = [].concat(BOOTSTRAP_NODES)
  }

  self.listening = false
  self._closed = false

  self.port = 0
  self.requestId = 1
  self.pendingRequests = {}
  // Number of peers we still need to find to satisfy the last call to findPeers
  self.missingPeers = 0

  self.pendingRequests[self.requestId] = 1

  self.socket = dgram.createSocket('udp4')
  self.socket.on('message', self._onData.bind(self))
  self.socket.on('listening', self._onListening.bind(self))
  self.socket.on('error', function () {}) // throw away errors
}

DHT.prototype.close = function () {
  var self = this
  self.listening = false
  self._closed = true
  try {
    self.socket.close()
  } catch (err) {
    // ignore error, socket was either already closed / not yet bound
  }
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
  self.message = bncode.encode(self.message)
}

// addr:string -> [host:string, port:number]
var addrDataCache = {}

/**
 * Given an address/port string, return an array where arr[0] is host, and arr[1] is port
 * (as a Number). This uses a cache, so we don't need to keep creating new arrays. This
 * helps out the GC.
 * @param  {string} addr
 * @return {Array.<*>}
 */
function getAddrData (addr) {
  if (!addrDataCache[addr]) {
    var array = addr.split(':')
    array[1] = Number(array[1])
    addrDataCache[addr] = array
  }
  return addrDataCache[addr]
}

/**
 * Get the number of nodes in the DHT. This uses a simple counter to avoid repeatedly
 * creating new arrays with Object.keys.
 * @return {number}
 */
DHT.prototype.getNodesNum = function () {
  var self = this
  return self.nodesCounter
}

/**
 * Get a list of all nodes in the DHT. Uses a cached list when possible.
 * @return {Array.<string>}
 */
DHT.prototype.getNodesList = function () {
  var self = this
  if (!self.nodesList) {
    self.nodesList = Object.keys(self.nodes)
  }
  return self.nodesList
}

DHT.prototype.query = function (addr) {
  var self = this
  var numNodes = self.getNodesNum()
  if (numNodes > MAX_NODES || self.missingPeers <= 0 || self._closed) return

  var host = getAddrData(addr)[0]
  var port = getAddrData(addr)[1]
  if (!(port > 0 && port < 65535)) return
  self.socket.send(self.message, 0, self.message.length, port, host, function () {
    setTimeout(function () {
      self.reqs[addr] = (self.reqs[addr] || 0) + 1
      if (!self.nodes[addr] && self.reqs[addr] < MAX_REQUESTS) {
        self.query.call(self, addr)
      }
    }, REQ_TIMEOUT)
  })
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
    if (self.getNodesNum() === 0) {
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
  }

  if (port)
    onPort(null, port)
  else
    portfinder.getPort(onPort)

  self.socket.bind(port)
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
  var addr = rinfo.address + ':' + rinfo.port

  var message
  try {
    debug('Got DHT response from ' + addr)
    message = bncode.decode(data)
    if (!message) throw new Error('message is undefined')
  } catch (err) {
    debug('Failed to decode DHT data from node ' + addr + ' ' + err.message)
    return
  }

  if (!message.t || (message.t.toString() !== self.requestId.toString())) {
    debug('DHT received wrong message requestId: ', message.t && message.t.toString(), self.requestId && self.requestId.toString(), addr)
    return
  }

  if (!self.nodes[addr]) {
    // If this is a new peer, then invalidate the cache (will be recalculated lazily)
    // and update the counter.
    self.nodesCounter++
    self.nodesList = null

    // Mark that we've seen this node (the one we received data from)
    self.nodes[addr] = true
  }

  // Reset outstanding req count to 0 (better than using "delete" which invalidates
  // the V8 inline cache
  self.reqs[addr] = 0

  var r = message && message.r

  if (r && Buffer.isBuffer(r.nodes)) {
    parseNodeInfo(r.nodes).forEach(self._handleNode.bind(self))
  }
  if (r && Array.isArray(r.values)) {
    parsePeerInfo(r.values).forEach(self._handlePeer.bind(self))
  }
}
