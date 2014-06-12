# bittorrent-dht [![build](https://img.shields.io/travis/feross/bittorrent-dht.svg)](https://travis-ci.org/feross/bittorrent-dht) [![npm](https://img.shields.io/npm/v/bittorrent-dht.svg)](https://npmjs.org/package/bittorrent-dht) [![npm downloads](https://img.shields.io/npm/dm/bittorrent-dht.svg)](https://npmjs.org/package/bittorrent-dht) [![gittip](https://img.shields.io/gittip/feross.svg)](https://www.gittip.com/feross/)

### Simple, robust, BitTorrent DHT implementation

Node.js implementation of the [BitTorrent DHT protocol](http://www.bittorrent.org/beps/bep_0005.html). BitTorrent DHT is the main peer discovery layer for BitTorrent, which allows for trackerless torrents. DHTs are awesome!

This module is used by [WebTorrent](http://webtorrent.io).

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


#### `dht.destroy([callback])`

Destroy the DHT. Closes the socket and cleans up large data structure resources.


### events

#### self.on('ready', function () { ... })

Emitted when the DHT is ready to handle lookups (i.e. the routing table contains at least K nodes, discovered via the bootstrap nodes).


#### self.on('peer', function (addr, infoHash) { ... })

Emitted when a potential peer is found. `addr` is of the form `IP_ADDRESS:PORT`.
`infoHash` is the torrent info hash of the swarm that the peer belongs to. Emitted
in response to a `lookup(infoHash)` call.


#### self.on('node', function (addr) { ... })

Emitted when the DHT finds a new node.


#### self.on('listening', function () { ... })

Emitted when the DHT is listening.


#### self.on('warning', function (err) { ... })

Emitted when the DHT gets an unexpected message from another DHT node. This is purely
informational.


#### self.on('error', function (err) { ... })

Emitted when the DHT has a fatal error.


### license

MIT. Copyright (c) [Feross Aboukhadijeh](http://feross.org).
