var test = require('tape')
var parallel = require('run-parallel')
var common = require('./common')
var DHT = require('../')

test('announce+lookup with 2-20 DHTs', function (t) {
  var from = 2
  var to = 20

  var numRunning = to - from + 1
  for (var i = from; i <= to; i++) {
    runAnnounceLookupTest(i)
  }

  function runAnnounceLookupTest (numInstances) {
    findPeers(numInstances, t, function (err, dhts) {
      if (err) throw err

      dhts.forEach(function (dht) {
        for (var infoHash in dht.tables) {
          var table = dht.tables[infoHash]
          table.toArray().forEach(function (contact) {
            t.ok(contact.token, 'contact has token')
          })
        }

        process.nextTick(function () {
          dht.destroy(function () {
            if (--numRunning === 0) t.end()
          })
        })
      })
    })
  }
})

/**
 *  Initialize [numInstances] dhts, have one announce an infoHash, and another perform a
 *  lookup. Times out after a while.
 */
function findPeers (numInstances, t, cb) {
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
  parallel(dhts.map(function (dht) {
    return function (cb) {
      dht.listen(function () {
        cb(null)
      })
    }
  }), function () {
    // add each other to routing tables
    makeFriends(dhts)

    // lookup from other DHTs
    dhts[0].announce(infoHash, 9998, function () {
      dhts[1].lookup(infoHash)
    })
  })

  dhts[1].on('peer', function (addr, hash) {
    t.equal(hash, infoHash)
    t.equal(Number(addr.split(':')[1]), 9998)
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
    dhts[i].addNode('127.0.0.1:' + next.address().port, next.nodeId)
  }
}
