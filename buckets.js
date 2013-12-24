module.exports = Buckets

function Buckets () {
  var self = this

  self.buckets = [{ min: 0, max: Math.pow(2,160), nodes: [] }]
}

Buckets.prototype._insert = function (bucket) {
  var self = this
  var buckets = self.buckets;

  var i;
  for (i = 0 ; i < buckets.length; i++) {
    if (buckets[i].min > bucket.min) {
      break
    }
  }

  self.buckets.splice(i, 0, bucket)
}

Buckets.prototype._remove = function (bucket) {
  var self = this
  var buckets = self.buckets;

  var i;
  for (i = 0 ; i < buckets.length; i++) {
    if (buckets[i].min === bucket.min && buckets[i].max === bucket.max) {
      break
    }
  }

  self.buckets.splice(i, 1)
}

Buckets.prototype._split = function (bucket) {
  var self = this

  self._remove(bucket)

  var less = { min: bucket.min, max: (bucket.min + bucket.max) / 2, nodes: [] }
  var more = { min: (bucket.min + bucket.max) / 2, max: bucket.max, nodes: [] }
  bucket.nodes.forEach(function (node) {
    var correctBucket = (node.id >= less.min && node.id < less.max) ? less : more
    correctBucket.nodes.push(node);
  });

  self._insert(more)
  self._insert(less)
}

Buckets.prototype.findBucket = function (id) {
  var self = this
  var buckets = self.buckets

  var min = 0
  var max = buckets.length
  var index = Math.floor((min + max) / 2)

  while (buckets[index].min > id || buckets[index].max <= id) {
    if (buckets[index].min > id) {
      max = index
      index = Math.floor((min + index) / 2)
    } else {
      min = index
      index = Math.ceil((max + index) / 2)
    }
  }

  return buckets[index]
}

Buckets.prototype.insertNode = function (node) {
  var self = this

  var bucket = self.findBucket(node.id)
  if (bucket.nodes.length === 8) {
    self._split(bucket)
    self.insertNode(node)
  } else {
    bucket.nodes.push(node)
  }
}