var test = require('tape')
var dht = require('../')

test('ping should clear clones', function (t) {
  var dht1 = dht({bootstrap: false})

  dht1.listen(10000, function () {
    var dht2 = dht({bootstrap: ['127.0.0.1:10000']})

    dht2.on('ready', function () {
      dht2.destroy(function () {
        dht2 = dht({bootstrap: ['127.0.0.1:10000']})
        dht2.on('ready', ping)
        dht2.listen(20000)
      })
    })

    dht2.listen(20000)

    function ping () {
      t.same(dht1.nodes.toArray().length, 2, 'have two nodes')
      dht1._pingAll(function () {
        t.same(dht1.nodes.toArray().length, 1, 'should remove all nodes')
        done()
      })
    }

    function done () {
      dht1.destroy(function () {
        dht2.destroy(function () {
          t.end()
        })
      })
    }
  })
})

test('ping should clear with three nodes', function (t) {
  var dht1 = dht({bootstrap: false})
  var dht3

  dht1.listen(10000, function () {
    var dht2 = dht({bootstrap: ['127.0.0.1:10000']})

    dht2.on('ready', function () {
      dht2.destroy(function () {
        dht3 = dht({bootstrap: ['127.0.0.1:10000']})
        dht3.on('ready', ping)
        dht3.listen(20000)
      })
    })

    dht2.listen(20000)

    function ping () {
      t.same(dht3.nodes.toArray().length, 1, 'has one node')
      t.same(dht1.nodes.toArray().length, 2, 'have two nodes')
      dht1._pingAll(function () {
        dht3._pingAll(function () {
          t.same(dht3.nodes.toArray().length, 1, 'dht 3 should remove all nodes')
          t.same(dht1.nodes.toArray().length, 1, 'dht 1 should remove all nodes')
          done()
        })
      })
    }

    function done () {
      dht1.destroy(function () {
        dht2.destroy(function () {
          dht3.destroy(function () {
            t.end()
          })
        })
      })
    }
  })
})
