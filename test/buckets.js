var Buckets = require('../buckets')
var test = require('tape')

test('Insert into bucket', function (t) {
  t.plan(1)

  var Bucket = new Buckets()
  Bucket.insertNode({ id: 1 })

  if (Bucket.findBucket(1).nodes[0].id === 1) {
    t.pass('Found node inside bucket')
  }
})

test('Remove a bucket', function (t) {
  t.plan(1)

  var Bucket = new Buckets()

  var bucketToRemove = Bucket.findBucket(1)
  Bucket._remove(bucketToRemove)

  if (Bucket.buckets.length === 0) {
    t.pass('A bucket was removed')
  }

})

test('Split a bucket into two', function (t) {
  t.plan(1)

  var Bucket = new Buckets()

  for (var i = 0; i < 9; i++) {
    Bucket.insertNode({ id: i })
  }

  if (Bucket.buckets[0].nodes.length === 8 && Bucket.buckets[1].nodes.length === 1) {
    t.pass('A bucket was split into two')
  }
})

test('Find a bucket', function (t) {
  t.plan(1)

  var Bucket = new Buckets()

  var foundBucket = Bucket.findBucket(0)

  if (foundBucket.min === 0 && foundBucket.max === Math.pow(2,160)) {
    t.pass('A bucket was found')
  }
})

test('Insert a node', function (t) {
  t.plan(1)

  var Bucket = new Buckets()

  Bucket.insertNode({ id: 0 })

  if (Bucket.buckets[0].nodes[0].id === 0) {
    t.pass('A node was inserted')
  }
})


