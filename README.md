# bittorrent-dht [![travis][travis-image]][travis-url] [![npm][npm-image]][npm-url] [![downloads][downloads-image]][downloads-url]

[travis-image]: https://img.shields.io/travis/feross/bittorrent-dht.svg?style=flat
[travis-url]: https://travis-ci.org/feross/bittorrent-dht
[npm-image]: https://img.shields.io/npm/v/bittorrent-dht.svg?style=flat
[npm-url]: https://npmjs.org/package/bittorrent-dht
[downloads-image]: https://img.shields.io/npm/dm/bittorrent-dht.svg?style=flat
[downloads-url]: https://npmjs.org/package/bittorrent-dht

### Simple, robust, BitTorrent DHT implementation

Node.js implementation of the [BitTorrent DHT protocol](http://www.bittorrent.org/beps/bep_0005.html). BitTorrent DHT is the main peer discovery layer for BitTorrent, which allows for trackerless torrents. DHTs are awesome!

This module is used by [WebTorrent](http://webtorrent.io).

### features

- complete implementation of the DHT protocol in JavaScript
- follows [the spec](http://www.bittorrent.org/beps/bep_0005.html)
- robust and well-tested (comprehensive test suite, and used by [WebTorrent](http://webtorrent.io) and [peerflix](https://github.com/mafintosh/peerflix))
- efficient recursive lookup algorithm minimizes UDP traffic
- supports multiple, concurrent lookups using the same routing table

Also see [bittorrent-tracker](https://github.com/feross/bittorrent-tracker).

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

dht.on('peer', function (addr, hash, from) {
  console.log('found potential peer ' + addr + ' through ' + from)
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


#### `dht.lookup(infoHash, [callback])`

Find peers for the given info hash.

This does a recursive lookup in the DHT. Potential peers that are discovered are emitted
as `peer` events. See the `peer` event below for more info.

`infoHash` can be a string or Buffer. `callback` is called when the recursive lookup has
terminated, and is called with two paramaters. The first is an `Error` or null. The second
is an array of the K closest nodes. You usually don't need to use this info and can simply
listen for `peer` events.

Note: `dht.lookup()` should only be called after the ready event has fired, otherwise the
lookup may fail because the DHT routing table doesn't contain enough nodes.


#### `dht.listen([port], [address], [onlistening])`

Make the DHT listen on the given `port`. If `port` is undefined, an available port is
automatically picked.

If `address` is undefined, the DHT will try to listen on all addresses.

If `onlistening` is defined, it is attached to the `listening` event.


#### `dht.announce(infoHash, port, [callback])`

Announce that the peer, controlling the querying node, is downloading a torrent on a port.

If `dht.announce` is called soon (< 5 minutes) after `dht.lookup`, then the routing table
generated during the lookup can be re-used, because the "tokens" sent by each node will
still be valid.

If `dht.announce` is called and there is no cached routing table, then a `dht.lookup` will
first be performed to discover relevant nodes and get valid "tokens" from each of them.
This will take longer.

A "token" is an opaque value that must be presented for a node to announce that its
controlling peer is downloading a torrent. It must present the token received from the
same queried node in a recent query for peers. This is to prevent malicious hosts from
signing up other hosts for torrents. **All token management is handled internally by this
module.**

`callback` will be called when the announce operation has completed, and is called with
a single parameter that is an `Error` or null.


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

// some time passes ...

// initialize a new dht with the same routing table as the first
var dht2 = new DHT({ bootstrap: arr })
```


#### `dht.addNode(addr, [nodeId])`

Manually add a node to the DHT routing table. If there is space in the routing table (or
an unresponsive node can be evicted to make space), the node will be added. If not, the
node will not be added. This is useful to call when a peer wire sends a `PORT` message to
share their DHT port.

If `nodeId` is undefined, then the peer will be pinged to learn their node id. If the peer does not respond, the will not be added to the routing table.


#### `dht.destroy([callback])`

Destroy the DHT. Closes the socket and cleans up large data structure resources.


### events

#### `dht.on('ready', function () { ... })`

Emitted when the DHT is ready to handle lookups (i.e. the routing table is sufficiently
populated via the bootstrap nodes).

Note: If you initialize the DHT with the `{ bootstrap: false }` option, then the 'ready'
event will fire on the next tick even if there are not any nodes in the routing table.
It is assumed that you will manually populate the routing table with `dht.addNode` if you
pass this option.


#### `dht.on('listening', function (port) { ... })`

Emitted when the DHT is listening.


#### `dht.on('peer', function (addr, infoHash, from) { ... })`

Emitted when a potential peer is found. `addr` is of the form `IP_ADDRESS:PORT`.
`infoHash` is the torrent info hash of the swarm that the peer belongs to. Emitted
in response to a `lookup(infoHash)` call.


#### `dht.on('error', function (err) { ... })`

Emitted when the DHT has a fatal error.


#### internal events

#### `dht.on('node', function (addr, nodeId, from) { ... })`

Emitted when the DHT finds a new node.


#### `dht.on('announce', function (addr, infoHash) { ... })`

Emitted when a peer announces itself in order to be stored in the DHT.


#### `dht.on('warning', function (err) { ... })`

Emitted when the DHT gets an unexpected message from another DHT node. This is purely
informational.


### further reading

- [BitTorrent DHT protocol](http://www.bittorrent.org/beps/bep_0005.html)
- [Kademlia: A Peer-to-peer Information System Based on the XOR Metric](http://www.cs.rice.edu/Conferences/IPTPS02/109.pdf)


### license

MIT. Copyright (c) [Feross Aboukhadijeh](http://feross.org).
