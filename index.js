var mongo = require('mongodb').MongoClient;
var Transaction = require('./transaction');

mongo.connect('mongodb://localhost:27017/transactions', function(err, db) {
  if (err) return console.log(err);
  
  db.dropDatabase(function(err) {
    if (err) return console.log(err);
    
    db.collection('posts').insert([ 
      {title: 'Hello', cat: 'World'},
      {title: 'Hi', cat: 'World'},
      {title: 'Bye', cat: 'Planet'},
    ], function(err, results) {
      console.log(results);
    
      Transaction(db)
        .step(function(t, context, next) {
          t.collection('posts').findAndModify({ cat: 'World' }, [], { $set: { cat: 'Me' } }, function(err, result) {
            if (err) return console.log(err);
            context.post1 = result;
            next();
          });
        })
        .step(function(t, context, next) {
          t.collection('posts').findAndModify({ cat: 'World' }, [], { $set: { cat: 'Me' } }, function(err, result) {
            if (err) return console.log(err);
            context.posts2 = result;
            next();
          });
        })
        .step(function(t, context, next) {
          t.collection('posts').findAndModify({ cat: 'World' }, [], { $set: { cat: 'Me' } }, function(err, result) {
            if (err) return console.log(err);
            context.posts3 = result;
            next('Testing an Error, will roll all transactions back');
            // next();
          });
        })
        .commit(function(err, context) {
          if (err) {
            console.log('Done with errors\n', err);
          
            db.collection('posts').find().toArray(function(err, results) {
              console.log(results);
            });
          
          } else {
            console.log('Done\n', context);
            
            db.collection('posts').find().toArray(function(err, results) {
              console.log(results);
            });
          }
        });
      });    
  });
});
