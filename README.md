# bittorrent-dht [![build](https://img.shields.io/travis/feross/bittorrent-dht.svg)](https://travis-ci.org/feross/bittorrent-dht) [![npm](https://img.shields.io/npm/v/bittorrent-dht.svg)](https://npmjs.org/package/bittorrent-dht) [![npm downloads](https://img.shields.io/npm/dm/bittorrent-dht.svg)](https://npmjs.org/package/bittorrent-dht) [![gittip](https://img.shields.io/gittip/feross.svg)](https://www.gittip.com/feross/)

### Simple, robust, BitTorrent DHT implementation

Node.js implementation of the [BitTorrent DHT protocol](http://www.bittorrent.org/beps/bep_0005.html). BitTorrent DHT is the main peer discovery layer for BitTorrent, which allows for trackerless torrents. DHTs are awesome!

This module is used by [WebTorrent](http://webtorrent.io).

### features

- complete implementation of the DHT protocol in JavaScript
- follows [the spec](http://www.bittorrent.org/beps/bep_0005.html)
- robust and well-tested (comprehensive test suite, and used by [WebTorrent](http://webtorrent.io) and [peerflix](https://github.com/mafintosh/peerflix))
- efficient recursive lookup algorithm minimizes UDP traffic
- supports multiple, concurrent lookups using the same routing table

### install

```
npm install bittorrent-dht
```

### example

```
npm install magnet-uri
```

```javascript
var DHT    = require('bittorrent-dht')
var magnet = require('magnet-uri')

var uri = 'magnet:?xt=urn:btih:e3811b9539cacff680e418124272177c47477157'
var parsed = magnet(uri)

console.log(parsed.infoHash) // 'e3811b9539cacff680e418124272177c47477157'

var dht = new DHT()

dht.listen(20000, function () {
  console.log('now listening')
})

dht.on('ready', function () {
  // DHT is ready to use (i.e. the routing table contains at least K nodes, discovered
  // via the bootstrap nodes)

  // find peers for the given torrent info hash
  dht.lookup(parsed.infoHash)
})

dht.on('peer', function (addr, hash) {
  console.log('found potential peer ' + addr)
})

```

### api

#### `dht = new DHT([opts])`

Create a new `dht` instance.

If `opts` is specified, then the default options (shown below) will be overridden.

``` js
{
  nodeId: '',   // 160-bit DHT node ID (Buffer or hex string, default: randomly generated)
  bootstrap: [] // bootstrap servers (default: router.bittorrent.com:6881, router.utorrent.com:6881, dht.transmissionbt.com:6881)
}
```

#### `dht.lookup(infoHash)`

Find peers for the given infoHash. `infoHash` can be a string or Buffer.

This does a recursive lookup in the DHT. Potential peers that are discovered are emitted
as `peer` events. See the `peer` event below for more info.

`dht.lookup()` should only be called after the ready event has fired, otherwise the lookup
may fail because the DHT routing table doesn't contain enough nodes.


#### `dht.listen([port], [onlistening])`

Make the DHT listen on the given `port`. If `port` is undefined, an available port is
automatically picked with [portfinder](https://github.com/indexzero/node-portfinder).

If `onlistening` is defined, it is attached to the `listening` event.


#### `arr = dht.toArray()`

Returns the nodes in the DHT as an array. This is useful for persisting the DHT
to disk between restarts of a BitTorrent client (as recommended by the spec). Each node in the array is an object with `id` (hex string) and `addr` (string) properties.

To restore the DHT nodes when instantiating a new `DHT` object, simply pass in the array as the value of the `bootstrap` option.

```js
var dht1 = new DHT()

// some time passes ...

// destroy the dht
var arr = dht1.toArray()
dht1.destroy()

// initialize a new dht with the same routing table as the first
var dht2 = new DHT({ bootstrap: arr })
```


#### `dht.destroy([callback])`

Destroy the DHT. Closes the socket and cleans up large data structure resources.


### events

#### `self.on('ready', function () { ... })`

Emitted when the DHT is ready to handle lookups (i.e. the routing table contains at least K nodes, discovered via the bootstrap nodes).


#### `self.on('peer', function (addr, infoHash) { ... })`

Emitted when a potential peer is found. `addr` is of the form `IP_ADDRESS:PORT`.
`infoHash` is the torrent info hash of the swarm that the peer belongs to. Emitted
in response to a `lookup(infoHash)` call.


#### `self.on('node', function (addr) { ... })`

Emitted when the DHT finds a new node.


#### `self.on('listening', function () { ... })`

Emitted when the DHT is listening.


#### `self.on('warning', function (err) { ... })`

Emitted when the DHT gets an unexpected message from another DHT node. This is purely
informational.


#### `self.on('error', function (err) { ... })`

Emitted when the DHT has a fatal error.


### further reading

- [BitTorrent DHT protocol](http://www.bittorrent.org/beps/bep_0005.html)
- [Kademlia: A Peer-to-peer Information System Based on the XOR Metric](http://www.cs.rice.edu/Conferences/IPTPS02/109.pdf)


### license

MIT. Copyright (c) [Feross Aboukhadijeh](http://feross.org).
