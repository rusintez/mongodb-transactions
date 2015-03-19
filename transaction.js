var Queue = require('queue');

var Transaction = function(db, options) {
  if (!(this instanceof Transaction)) {
    return new Transaction(db);
  }
  
  this.steps  = [];
  this.db     = db;
  this.tns    = this.db.collection('__transactions');
  this.options = options || {};
  this.options.timeout = this.options.timeout || 10000;
  this.context = {};
}

Transaction.prototype.step = function(step) {
  this.steps.push(step);
  return this;
}

Transaction.prototype.commit = function(callback) {
  
  var queue = new Queue(this.context);
  var self = this;
  
  // create an empty transaction
  queue.add(function(context, next) {
    self.tns.insert({ 
      step: 0, 
      steps: self.steps.length,
      data: [],
      expires: new Date((new Date()).getTime() + self.options.timeout)
    }, {
      w: 1
    }, function(err, results) {
      if (err) return next(err);
      context.t = results[0];
      next();
    });
  });
  
  self.steps.forEach(function(step) {
    queue.add(function(context, next) {
      step(DBProxy(self, context), context, next);
    });
  });

  queue.add(function(context, next) {
    self.tns.remove({ _id: context.t._id }, { w: 1 }, function(err) {
      if (err) return next(err);
      next();
    });
  });

  queue.end(function(err, context) {
    if (err) return self.rollback(err, callback);
    callback(null, context);
  });
}

var ops = {
  findAndModify: function(t, step, callback) {
    
    var col = t.db.collection(step.col);
        
    var queue = new Queue();
    
    step.documents.forEach(function(doc) {
      if (doc) {
        queue.add(function(next) {
          col.update({ _id: doc._id }, doc, next);
        });
      }
    });
    
    queue.end(function(err) {
      if (err) return callback(['Rolling back']);
      callback();
    });
    
  }
};

Transaction.prototype.rollback = function(error, callback) {
  var self = this;
  this.tns.findOne({ 
    _id: this.context.t._id
  }, function(err, t) {
    if (err) return callback(err); // let it expire ?
    var queue = new Queue();
    
    t.data.reverse().forEach(function(step) {
      queue.add(function(next) {
        ops[step.op](self, step, next);
      });
    });
    
    queue.end(function(err) {
      if (err) return callback([err, error]);
      self.tns.remove({ _id: t._id }, function(err) {
        if (err) return callback([err, error]);
        callback(error);
      });
    });
    
  });
}

function DBProxy(transaction) {
  if (!(this instanceof DBProxy)) {
    return new DBProxy(transaction);
  }
  
  this.transaction = transaction;
}

DBProxy.prototype.collection = function(name, options) {
  return new CollectionProxy(this.transaction, name, options);
}

function CollectionProxy(transaction, name, options) {
  this.t = transaction;
  this.name = name;
  this.options = options || {};
  this.col = this.t.db.collection(name, options);
}

CollectionProxy.prototype.findAndModify = function(query, sort, params, options, cb) {
  
  if (typeof options === 'function') {
    cb = options;
    options = { w: 1 };
  }
  
  var _query = JSON.parse(JSON.stringify(query));
  _query.__transaction = { $exists: false };
  
  var self = this;
  var tid = self.t.context.t._id;
  var context = self.t.context;
    
  self.col.findAndModify(_query, sort, { 
    $set: {
      __transaction: tid
    }
  }, { 
    w: 1,
  }, function(err, result) {  
    if (err) return cb(err);
        
    self.t.tns.findAndModify({ 
      _id: tid 
    }, [], { 
      $push: { 
        data: {
          documents: [result], 
          op: 'findAndModify',
          col: self.name
        }
      },
      $inc: {
        step: 1
      }
    }, function(err, t) {
      if (err) return cb(err);
      
      context.t = t;
      query.__transaction = tid;
      
      params.$unset = params.$unset || {};
      params.$unset.__transaction = true;
      
      
      self.col.findAndModify(query, sort, params, {
        w: 1,
        new: true
      }, cb);
    });
  });
}

exports = module.exports = Transaction;






