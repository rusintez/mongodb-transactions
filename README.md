# mongodb transactions

tldr; Proof of concept of mongodb transactions in node.js that support (!) `.findAndModify`.

### Usage

    $ git clone git@github.com:rusintez/mongodb-transactions.git mt
    $ cd mt
    $ npm install
    $ node index.js

### API

```javascript

var transaction = require('./transaction');
var request = require('superagent');

transaction(db) // <-- node-mongo-native db
  .step(function(t, context, next) {
    // TODO: `t` should mimic as much node-mongo-native API as possible (even dropDatabase, back it in a separated db)
    t.collection('articles').findAndModify({ cat: 'World' }, [], { $set: { title: 'Hello' } }, function(err, article) {
      if (err) return next(err);
      context.article = article;
      next();
    });
  })
  .step(function(t, context, next) { // let's index it in elasticsearch
    var url = 'http://localhost:9200/production/articles/' + context.article._id;
    request().put(url).send(context.article).end(function(response) {
      if ([200, 201].indexOf(response.statusCode) === -1) {
        next('Cant index, rolling back');
      } else {
        context.articleIndex = response.body;
        next();
      }
    });
  })
  .commit(function(err, context) {
    // now, when elasticsearch is down, transaction will rollback
  });

```

### Author

Vladimir Popov <rusintez@gmail.com>

### License

MIT