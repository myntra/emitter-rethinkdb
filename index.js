const uuid = require('node-uuid');
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
  opts.persist = (typeof opts.persist === 'undefined') ? true: opts.persist;

  this.id = uuid.v4();
  this.queue = async.queue(function (task, cb) {
    debug('Dequeued task', task);

    r.db(opts.db)
    .table(opts.table)
    .insert({
      args: task.args,
      ts: r.now(),
      src: self.id,
    })
    .run(function(err, status) {     
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
  this.queue.pause();

  function connect() {
    r.db(opts.db)
    .table(opts.table)
    .changes()
    .run(function(err, cursor) {
      if (err) {
	    	self.emit('error', err);
        return console.log('Error while starting changefeed', err);
      }

      cursor.each(function(err, data) {

        if (err && !cursor.connection.open) {
          debug('Cursor connection not open')
          return;
        }

        if (err) {
		    	self.emit('error', err);
          return console.log('Cursor error', err);
        }

        // only inserts
        if (!data.new_val) {
          return;
        }
        
        // ignore own event
        if (data.new_val.src === self.id) {
          return;
        }

        debug('Received task from database', data.new_val);
        self.emit.apply(self, data.new_val.args)
      })              
    });
  }

  // check health by using private variable till method is exposed
  if (r.getPoolMaster()._healthy) {
    debug('Connecting...');
    this.queue.resume();
    connect();
  	self.emit('connect');
  }

  r.getPoolMaster().on('healthy', function(healthy) {
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
}

Emitter.prototype.trigger = function() {
  var args = [].slice.call(arguments)
  
  if (['connect','disconnect','reconnect','error'].indexOf(args[0]) !== -1)
    throw new Error('Reserved event name');

  debug('Adding task into queue', {args});
  this.queue.push({
    args: args
  }, function(err) {
    if (err) {
    	self.emit('error', err);
      return console.log('Error inserting task into database', err);
    }
  })
}

Emitter.prototype.kill = function() {
  this.queue.kill();
  debug('Emitter killed');
}

inherits(Emitter, EventEmitter);

module.exports = Emitter;