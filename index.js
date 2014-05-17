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
  'dht.transmissionbt.com:6881',
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881'
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
 * @param {string|Buffer} infoHash
 */
function DHT (opts) {
  if (!(this instanceof DHT)) return new DHT(opts)
  EventEmitter.call(this)

  if (!opts) opts = {}
  if (!opts.nodeId) opts.nodeId = hat(160)

  this.nodeId = typeof opts.nodeId === 'string'
    ? new Buffer(opts.nodeId, 'hex')
    : opts.nodeId

  this.nodes = {}
  this.nodesCounter = 0;
  this.nodesList = null; //list cache
  this.peers = {}
  this.reqs = {}
  this.queue = [].concat(BOOTSTRAP_NODES)

  this.port = 0
  this.requestId = 1
  this.pendingRequests = {}
  // Number of peers we still need to find to satisfy the last call to findPeers
  this.missingPeers = 0

  this.pendingRequests[this.requestId] = 1

  this.socket = dgram.createSocket('udp4')
  this.socket.on('message', this._onData.bind(this))
  this.socket.on('listening', this._onListening.bind(this))
  this.socket.on('error', function () {}) // throw away errors
}

DHT.prototype.close = function () {
  this.listening = false
  this._closed = true
  this.socket.close()
}

// TODO: support setting multiple infohashes
DHT.prototype.setInfoHash = function (infoHash) {
  this.infoHash = typeof infoHash === 'string'
    ? new Buffer(infoHash, 'hex')
    : infoHash

  this.message = {
    t: this.requestId.toString(),
    y: 'q',
    q: 'get_peers',
    a: {
      id: this.nodeId,
      info_hash: this.infoHash
    }
  }
  // console.log('Created DHT message: ' + JSON.stringify(this.message))
  this.message = bncode.encode(this.message)
}
var addrDataIndex = {};
var getAddrData = function(addr) {
  //less work for GC; can not recreate often used arrays (by respliting string)
  if (!addrDataIndex[addr]) {
    var array = addr.split(':');
    array[1] = Number(array[1]);
    addrDataIndex[addr] = array;

  }
  return addrDataIndex[addr];
};

DHT.prototype.getNodesNum = function() {
  //we can return "this.getNodesList().length", but Object.keys is really heavy operation, so we use simple counter
  return this.nodesCounter;
};

DHT.prototype.getNodesList = function() {
  if (!this.nodesList) {
    this.nodesList = Object.keys(this.nodes);
  }
  return this.nodesList;
};
DHT.prototype.query = function (addr) {
  

  var numNodes = this.getNodesNum();
  if (numNodes > MAX_NODES || this.missingPeers <= 0 || this._closed) return

  var host = getAddrData(addr)[0]
  var port = getAddrData(addr)[1]
  if (!(port > 0 && port < 65535)) return
  this.socket.send(this.message, 0, this.message.length, port, host, function () {
    setTimeout(function () {
      this.reqs[addr] = (this.reqs[addr] || 0) + 1
      if (!this.nodes[addr] && this.reqs[addr] < MAX_REQUESTS) {
        this.query.call(this, addr)
      }
    }.bind(this), REQ_TIMEOUT)
  }.bind(this))
}

DHT.prototype._queryQueue = function() {
  if (this.queue.length) {
    this.query(this.queue.pop())
  } else {
    clearInterval(this.queueInterval)
    this.queueInterval = null
  }
}

/* Start querying queue, if not already */
DHT.prototype.queryQueue = function() {
  if (!this.queryInterval) {
    this.queryInterval = setInterval(this._queryQueue.bind(this), QUEUE_QUERY_INTERVAL)
    this.queryInterval.unref()
  }
}

DHT.prototype.findPeers = function (num) {
  if (this._closed) return
  if (!num) num = 1

  // TODO: keep track of missing peers for each `findPeers` call separately!
  this.missingPeers += num

  // Start querying queue
  this.queryQueue()

  // If we are connected to no nodes after timeout period, then retry with
  // the bootstrap nodes.
  setTimeout(function () {
    if (this.getNodesNum() === 0) {
      debug('No DHT nodes replied, retry with bootstrap nodes')
      this.queue.push.apply(this.queue, BOOTSTRAP_NODES)
      this.missingPeers = 0
      this.findPeers(num)
    }
  }.bind(this), BOOTSTRAP_TIMEOUT)
}

DHT.prototype.listen = function (port, onlistening) {
  if (typeof port === 'function') {
    onlistening = port
    port = undefined
  }

  if (onlistening)
    this.once('listening', onlistening)

  var onPort = function (err, port) {
    if (err)
      return this.emit('error', err)
    this.port = port
  }.bind(this)

  if (port)
    onPort(null, port)
  else
    portfinder.getPort(onPort)

  this.socket.bind(port)
}

DHT.prototype._onListening = function () {
  this.listening = true
  this.emit('listening', this.port)
}

/**
 * Called when client finds a new DHT node
 * @param  {string} addr
 */
DHT.prototype._handleNode = function (addr) {
  if (this.nodes[addr]) {
    // console.log('already know about this node!')
    return
  }

  //if (this.queue.length < 10000) this.queue.push(addr) // TODO: Something like this might be needed for safety. (?)
  this.queue.push(addr)
  this.queryQueue()

  this.emit('node', addr, this.infoHash.toString('hex'))
}

/**
 * Called when client finds a new peer
 * @param  {string} addr
 */
DHT.prototype._handlePeer = function (addr) {
  if (this.peers[addr]) return
  this.peers[addr] = true
  this.missingPeers = Math.max(0, this.missingPeers - 1)

  this.emit('peer', addr, this.infoHash.toString('hex'))
}

DHT.prototype._onData = function (data, rinfo) {
  var addr = rinfo.address + ':' + rinfo.port

  var message
  try {
    // console.log('got response from ' + addr)
    message = bncode.decode(data)
    if (!message) throw new Error('message is undefined')
  } catch (err) {
    debug('Failed to decode data from node ' + addr + ' ' + err.message)
    return
  }

  if (!message.t || (message.t.toString() !== this.requestId.toString())) {
    // console.log('DHT received wrong message requestId: ', message.t && message.t.toString(), this.requestId && this.requestId.toString(), addr)
    return
  }

  if (!this.nodes[addr]) {
    //we invalidate cache and change counter only if something changes
    this.nodesCounter++;


    // Mark that we've seen this node (the one we received data from)
    this.nodes[addr] = true;

    //we must invalidate list cache, we will recalcalate list when we will need it (lazy)
    this.nodesList = null; 
  }

  
  

  this.reqs[addr] = null;// null is better since "delete" invalidates inline cache

  var r = message && message.r

  if (r && Buffer.isBuffer(r.nodes)) {
    // console.log('got nodes')
    parseNodeInfo(r.nodes).forEach(this._handleNode.bind(this))
  }
  if (r && Array.isArray(r.values)) {
    // console.log('got peers')
    parsePeerInfo(r.values).forEach(this._handlePeer.bind(this))
  }
}
