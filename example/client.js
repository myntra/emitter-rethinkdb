// EXAMPLE
// Please create the test/events db/table pair beforehand,
// or help submit a PR to have the library ensure it. Thanks!

var r = require('rethinkdbdash')();
var opts = {
  db: 'test',
  table: 'events',
  persist: true,
};
var emitter = require('../index')(r, opts)

emitter.trigger('beep', 'boop')

emitter.on('beep', function(d){
	console.log(d)
})

// optional stuff

emitter.on('connect', function(conn){
  console.log('connected!')
})
.on('disconnect', function(err){
  console.log('disconnected!')
})
.on('reconnect', function(number, delay){
  console.log('reconnecting in ', delay, 'ms.', 'total retries so far is ', number)
})
.on('error', function(err){
  console.log('error', err)
})
