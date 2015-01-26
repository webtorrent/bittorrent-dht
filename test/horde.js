
var test = require('tape');
var hat = require('hat')
var parallel = require('run-parallel')
var common = require('./common');
var DHT = require('../')

test('announce+lookup with 3-10 DHTs', function (t) {
  var from = 3
  var to = 10

  var tasks = []
  var numRunning = to - from + 1
  for (var i = from; i <= to; i++) {
    runAnnounceLookupTest(i)
  }

  function runAnnounceLookupTest(numInstances) {
    findPeers(numInstances, t, function(err, dhts) {
      t.error(err)

      dhts.forEach(function(dht) {
        for (var infoHash in dht.tables) {
          var table = dht.tables[infoHash]
          table.toArray().forEach(function(contact) {
            t.ok(contact.token, 'contact has token')
          })
        }

        dht.destroy(function() {
          if (--numRunning === 0) t.end()          
        })
      })
    });
  }
})

/**
 *  Initialize [numInstances] dhts, have one announce an infoHash and another perform a lookup
 *  Times out after a while
 */
function findPeers(numInstances, t, cb) {
  var dhts = [];
  var timeoutId = setTimeout(function() {
    cb(new Error('Timed out for ' + numInstances + ' instances'), dhts)
  }, 20000);

  var infoHash = common.randomId().toString('hex')

  for (var i = 0; i < numInstances; i++) {
    var iStr = '' + i
    var nodeId = hat(160)
    var dht = new DHT({ 
      bootstrap: false, 
      nodeId: nodeId 
    })

    dhts.push(dht)
    common.failOnWarningOrError(t, dht)
  }

  // wait till everyone's listening
  parallel(dhts.map(function(dht) {
    return function(cb) {
      dht.listen(function(port) {
        cb(null, port);
      })
    }
  }), function(err, ports) {
    // add each other to routing tables
    makeFriends(dhts);
    dhts[0].announce(infoHash, 9998, function() {
      dhts[1].lookup(infoHash)
    })
  })

  dhts[1].on('peer', function(addr, hash) {
    if (hash === infoHash) {
      clearTimeout(timeoutId)
      cb(null, dhts)
    }
  })
}

/**
 *  Adds every dht in [dhts] to every other dht's routing table
 */
function makeFriends(dhts) {
  for (var i = 0; i < dhts.length; i++) {
    for (var j = i + 1; j < dhts.length; j++) {
      var d1 = dhts[i]
      var d2 = dhts[j]
      d1.addNode('127.0.0.1:' + d2.port, d2.nodeId)
      d2.addNode('127.0.0.1:' + d1.port, d1.nodeId)
    }
  }
}