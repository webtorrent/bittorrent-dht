var test = require('tape')
var dht = require('../')

test('testing', function (t) {
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
