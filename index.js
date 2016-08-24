const EventEmitter = require('events').EventEmitter;
const inherits = require('inherits');
const async = require('async');
const debug = require('debug')('emitter-rethinkdb');

function Emitter(r, opts) {
  var self = this;
  if (!(this instanceof Emitter)) return new Emitter(r, opts);

  if (!r || !r.getPoolMaster()) {
    throw new Error('Incorrect rethinkdbdash instance passed. let r = require(\'rethinkdbdash\')(conf)');
  }

  if (!opts || !opts.table || !opts.db) {
    throw new Error('Pass in db/table pair to write events to. Make sure to configure it in DB beforehand.');
  }

  opts = opts || {};
  opts.db = opts.db || 'test';
  opts.table = opts.table || 'events';
  opts.persist = (typeof opts.persist === 'undefined') ? true : opts.persist;

  this.queue = async.queue(function (task, cb) {
    debug('Dequeued task', task);

    r.db(opts.db)
      .table(opts.table)
      .insert({
        args: task.args,
        ts: r.now(),
      })
      .run(function (err, status) {
        if (err) {
          return cb(err);
        }

        debug('Inserted into database', task);
        if (opts.persist) {
          cb(null, status);
        } else {
          r.db(opts.db)
            .table(opts.table)
            .get(status.generated_keys[0])
            .delete()
            .run(cb);
        }
      })
  });

  function connect() {
    r.db(opts.db)
      .table(opts.table)
      .changes()
      .run(function (err, cursor) {
        if (err) {
          self.emit('error', err);
          return console.log('Error while starting changefeed', err);
        }

        cursor.each(function (err, data) {

          if (err && !cursor.connection.open) {
            debug('Cursor connection not open')
            return;
          }

          if (err) {
            self.emit('error', err);
            return console.log('Cursor error', err);
          }

          if (!data.new_val) {
            return;
          }

          debug('Received task from database', data.new_val);
          self.emit.apply(self, data.new_val.args)
        })
      });
  }

  r.getPoolMaster().on('healthy', function (healthy) {
    if (healthy === true) {
      debug('RethinkDB connection pool is healthy');
      self.queue.resume();
      connect();
      self.emit('reconnect');
    } else {
      debug('Error: RethinkDB connection pool is not healthy');
      self.queue.pause();
      self.emit('disconnect');
    }
  });

  var _this = this;
  Emitter.setupDB(r, opts, function (err, data) {
    if (err) {
      throw err;
    } else {
      _this.queue.pause();
      // check health by using private variable till method is exposed
      if (r.getPoolMaster()._healthy) {
        debug('Connecting...');
        _this.queue.resume();
        connect();
        self.emit('connect');
      }
    }
  });
}

Emitter.setupDB = function (r, opts, callback) {
  r.dbList().then(function (list) {
    if (list.indexOf(opts.db) === -1) {
      r.dbCreate(opts.db)
        .then(async.apply(setupEventsTable, r, opts))
        .error(async.apply(errorHandler, 'Failed to create database - ' + opts.db));
    } else {
      setupEventsTable(r, opts);
    }
  }).error(async.apply(errorHandler, 'Failed to fetch list of databases'));

  function setupEventsTable(r, opts) {
    r.db(opts.db)
      .tableList()
      .then(function (list) {
        if (list.indexOf(opts.table) === -1) {
          r.db(opts.db)
            .tableCreate(opts.table)
            .then(async.apply(callback, null))
            .error(async.apply(errorHandler, 'Failed to create table ' + opts.table + ' in ' + opts.db));
        } else {
          callback(null);
        }
      })
      .error(async.apply(errorHandler, 'Failed to fetch list of tables in ' + opts.db));
  }

  function errorHandler(message, error) {
    debug(message, error);
    callback(new Error(message));
  }
};

Emitter.prototype.trigger = function () {
  var self = this;
  var args = [].slice.call(arguments);

  if (['connect', 'disconnect', 'reconnect', 'error'].indexOf(args[0]) !== -1)
    throw new Error('Reserved event name');

  debug('Adding task into queue', { args });
  this.queue.push({
    args: args
  }, function (err) {
    if (err) {
      self.emit('error', err);
      return console.log('Error inserting task into database', err);
    }
  })
}

Emitter.prototype.kill = function () {
  this.queue.kill();
  debug('Emitter killed');
}

inherits(Emitter, EventEmitter);

module.exports = Emitter;