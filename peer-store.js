var LRU = require('lru')

module.exports = PeerStore

function PeerStore (opts) {
  if (!(this instanceof PeerStore)) return new PeerStore(opts)
  if (!opts) opts = {}
  this.max = opts.max || 10000
  this.maxAge = opts.maxAge || Infinity
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
  var node = peers.map.get(id)
  if (node) {
    node.modified = Date.now()
    return
  }

  node = {index: peers.values.length, peer: peer, modified: Date.now()}
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

PeerStore.prototype.get = function (key, n) {
  var node = this.peers.get(key)
  if (!node) return []
  var picked = pick(this, node.values, n || 100)
  if (picked.length) return picked
  this.peers.remove(key)
  return []
}

function swap (list, a, b) {
  if (a === b) return
  var tmp = list[a]
  list[a] = list[b]
  list[b] = tmp
  list[a].index = a
  list[b].index = b
}

function pick (self, values, n) {
  var ptr = 0
  var res = []
  var now = Date.now()

  while (values.length && res.length < n && ptr < values.length) {
    var next = ptr + (Math.random() * (values.length - ptr)) | 0
    var val = values[next]

    if (now - val.modified < self.maxAge) {
      res.push(val.peer)
      swap(values, ptr++, next)
    } else {
      swap(values, values.length - 1, next)
      values.pop()
      self.used--
    }
  }

  return res
}
