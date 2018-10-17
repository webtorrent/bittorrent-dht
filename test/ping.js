const test = require('tape')
const DHT = require('../')

test('ping should clear clones', t => {
  const dht1 = new DHT({ bootstrap: false })

  dht1.listen(10000, () => {
    let dht2 = new DHT({ bootstrap: ['127.0.0.1:10000'] })

    dht2.on('ready', () => {
      dht2.destroy(() => {
        dht2 = new DHT({ bootstrap: ['127.0.0.1:10000'] })
        dht2.on('ready', ping)
        dht2.listen(20000)
      })
    })

    dht2.listen(20000)

    function ping () {
      t.same(dht1.nodes.toArray().length, 2, 'have two nodes')
      dht1._pingAll(() => {
        t.same(dht1.nodes.toArray().length, 1, 'should remove all nodes')
        done()
      })
    }

    function done () {
      dht1.destroy(() => {
        dht2.destroy(() => {
          t.end()
        })
      })
    }
  })
})

test('ping should clear with three nodes', t => {
  const dht1 = new DHT({ bootstrap: false })
  let dht3

  dht1.listen(10000, () => {
    const dht2 = new DHT({ bootstrap: ['127.0.0.1:10000'] })

    dht2.on('ready', () => {
      dht2.destroy(() => {
        dht3 = new DHT({ bootstrap: ['127.0.0.1:10000'] })
        dht3.on('ready', ping)
        dht3.listen(20000)
      })
    })

    dht2.listen(20000)

    function ping () {
      t.same(dht3.nodes.toArray().length, 1, 'has one node')
      t.same(dht1.nodes.toArray().length, 2, 'have two nodes')
      dht1._pingAll(() => {
        dht3._pingAll(() => {
          t.same(dht3.nodes.toArray().length, 1, 'dht 3 should remove all nodes')
          t.same(dht1.nodes.toArray().length, 1, 'dht 1 should remove all nodes')
          done()
        })
      })
    }

    function done () {
      dht1.destroy(() => {
        dht2.destroy(() => {
          dht3.destroy(() => {
            t.end()
          })
        })
      })
    }
  })
})
