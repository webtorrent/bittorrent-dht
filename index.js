// TODO:
// - Use the same DHT object for looking up multiple torrents
// - Persist the routing table for later bootstrapping
// - Use actual DHT data structure with "buckets" (follow spec)

module.exports = DHT

var bencode = require('bncode')
var compact2string = require('compact2string')
var crypto = require('crypto')
var dgram = require('dgram')
var hat = require('hat')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')

var MAX_NODES = 5000
var REQ_TIMEOUT = 2000
var MAX_REQUESTS = 3
var BOOTSTRAP_TIMEOUT = 5000
var BOOTSTRAP_NODES = [
  'dht.transmissionbt.com:6881',
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881'
]

function parseNodeInfo (compact) {
  try {
    var nodes = []
    for (var i = 0; i < compact.length; i += 26) {
      nodes.push(compact2string(compact.slice(i + 20, i + 26)))
    }
    return nodes
  } catch (err) {
    console.warn('Invalid node info ' + compact)
    return []
  }
}

function parsePeerInfo (list) {
  try {
    return list.map(compact2string)
  } catch (err) {
    console.warn('Invalid peer info ' + list)
    return []
  }
}

inherits(DHT, EventEmitter)

/**
 * Create a new DHT
 * @param {string|Buffer} infoHash
 */
function DHT (infoHash) {
  var self = this
  EventEmitter.call(self)

  // Support infoHash as string or Buffer
  if (typeof infoHash === 'string') {
    infoHash = new Buffer(infoHash, 'hex')
  } else if (!Buffer.isBuffer(infoHash)) {
    throw new Error('DHT() requires string or buffer infoHash')
  }

  self.infoHash = infoHash
  self.nodes = {}
  self.peers = {}
  self.reqs = {}
  self.queue = [].concat(BOOTSTRAP_NODES)

  // Number of nodes we still need to find to satisfy the last call to findPeers
  self.missingPeers = 0

  this.nodeId = hat(160)
  console.log('DHT node id: ' + this.nodeId)

  self.requestId = 1
  self.pendingRequests = {}

  self.message = {
    t: self.requestId.toString(),
    y: 'q',
    q: 'get_peers',
    a: {
      id: self.nodeId,
      info_hash: self.infoHash
    }
  }
  console.log('created message: ' + JSON.stringify(self.message))
  self.message = bencode.encode(self.message)

  self.pendingRequests[self.requestId] = 1

  self.socket = dgram.createSocket('udp4')
  self.socket.on('message', self._onData.bind(self))
}

DHT.prototype.close = function () {
  var self = this
  self.socket.unref()
  self.socket.close()

  self._closed = true
}

/**
 * Called when client finds a new DHT node
 * @param  {string} addr
 */
DHT.prototype._handleNode = function (addr) {
  var self = this
  if (self.nodes[addr]) {
    // console.log('already know about this node!')
    return
  }

  process.nextTick(function () {
    self.emit('node', addr, self.infoHash.toString('hex'))
  })

  self.query(addr)
  // if (self.queue.length < 50) self.queue.push(addr) // TODO: remove this?
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

  process.nextTick(function () {
    self.emit('peer', addr, self.infoHash.toString('hex'))
  })
}

DHT.prototype._onData = function (data, rinfo) {
  var self = this
  var addr = rinfo.address + ':' + rinfo.port

  var message
  try {
    // console.log('got response from ' + addr)
    message = bencode.decode(data)
    if (!message) throw new Error('message is undefined')
  } catch (err) {
    console.error('Failed to decode data from node ' + addr + ' ' + err.message)
    return
  }

  if (!message.t || (message.t.toString() !== self.requestId.toString())) {
    console.log('wrong message requestId: ', message.t && message.t.toString(), self.requestId && self.requestId.toString(), addr)
    return
  }

  // Mark that we've seen this node (the one we received data from)
  self.nodes[addr] = true
  delete self.reqs[addr]

  var r = message && message.r

  if (r && Buffer.isBuffer(r.nodes)) {
    // console.log('got nodes')
    parseNodeInfo(r.nodes).forEach(self._handleNode.bind(self))
  }
  if (r && Array.isArray(r.values)) {
    // console.log('got peers')
    parsePeerInfo(r.values).forEach(self._handlePeer.bind(self))
  }
}

DHT.prototype.query = function (addr) {
  var self = this
  var numNodes = Object.keys(self.nodes).length
  if (numNodes > MAX_NODES || self.missingPeers <= 0 || self._closed) return

  var host = addr.split(':')[0]
  var port = Number(addr.split(':')[1])
  self.socket.send(self.message, 0, self.message.length, port, host, function () {
    setTimeout(function () {
      self.reqs[addr] = (self.reqs[addr] || 0) + 1
      if (!self.nodes[addr] && self.reqs[addr] < MAX_REQUESTS) {
        self.query.call(self, addr);
      }
    }, REQ_TIMEOUT)
  })
}

DHT.prototype.findPeers = function (num) {
  var self = this
  if (!num) num = 1

  // TODO: keep track of missing nodes for each `findPeers` call separately!
  self.missingPeers += num

  while (self.queue.length) {
    self.query(self.queue.pop())
  }

  // If we are connected to no nodes after timeout period, then retry with
  // the bootstrap nodes.
  setTimeout(function () {
    if (Object.keys(self.nodes).length === 0) {
      console.log('No nodes replied, retry with bootstrap nodes')
      self.queue.push.apply(self.queue, BOOTSTRAP_NODES)
      self.missingPeers -= num
      self.findPeers(num)
    }
  }, BOOTSTRAP_TIMEOUT)
}
