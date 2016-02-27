var common = require('./common')
var DHT = require('../')
var once = require('once')
var parallel = require('run-parallel')
var test = require('tape')

var from = 2
var to = 20

for (var i = from; i <= to; i++) {
  runAnnounceLookupTest(i)
}

function runAnnounceLookupTest (numInstances) {
  test('horde: announce+lookup with ' + numInstances + ' DHTs', function (t) {
    var numRunning = numInstances
    findPeers(numInstances, t, function (err, dhts) {
      if (err) throw err

      dhts.forEach(function (dht) {
        for (var infoHash in dht.tables) {
          var table = dht.tables[infoHash]
          table.toJSON().nodes.forEach(function (contact) {
            t.ok(contact.token, 'contact has token')
          })
        }

        process.nextTick(function () {
          dht.destroy(function (err) {
            t.error(err, 'destroyed dht')
            if (--numRunning === 0) t.end()
          })
        })
      })
    })
  })
}

/**
 *  Initialize [numInstances] dhts, have one announce an infoHash, and another perform a
 *  lookup. Times out after a while.
 */
function findPeers (numInstances, t, cb) {
  cb = once(cb)
  var dhts = []
  var timeoutId = setTimeout(function () {
    cb(new Error('Timed out for ' + numInstances + ' instances'))
  }, 20000)

  var infoHash = common.randomId().toString('hex')

  for (var i = 0; i < numInstances; i++) {
    var dht = new DHT({ bootstrap: false })

    dhts.push(dht)
    common.failOnWarningOrError(t, dht)
  }

  // wait until every dht is listening
  var tasks = dhts.map(function (dht) {
    return function (cb) {
      dht.listen(cb)
    }
  })

  parallel(tasks, function () {
    // add each other to routing tables
    makeFriends(dhts)

    // lookup from other DHTs
    dhts[0].announce(infoHash, 9998, function () {
      dhts[1].lookup(infoHash)
    })
  })

  dhts[1].on('peer', function (peer, hash) {
    t.equal(hash.toString('hex'), infoHash)
    t.equal(peer.port, 9998)
    clearTimeout(timeoutId)
    cb(null, dhts)
  })
}

/**
 * Add every dht address to the dht "before" it.
 * This should guarantee that any dht can be located (with enough queries).
 */
function makeFriends (dhts) {
  var len = dhts.length
  for (var i = 0; i < len; i++) {
    var next = dhts[(i + 1) % len]
    dhts[i].addNode({host: '127.0.0.1', port: next.address().port, id: next.nodeId})
  }
}
