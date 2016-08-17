# emitter-rethinkdb
Simple RethinkDB-backed emitter to pass events between servers.

If you would like to pass events between multiple servers in a scalable environment, you can use this as a simple pub-sub mechanism backed by RethinkDB. Generally you would use `redis` for it, but you can use RethinkDB instead if you would like to have:

1. Persistence of events
2. You already have RethinkDB in your stack and would not like to add another DB.

You can also use this library to persist a timeline of events into RethinkDB simply by emitting them.

This module relies on [rethinkdbdash](https://github.com/neumino/rethinkdbdash) driver, along with the [change feeds](http://rethinkdb.com/api/javascript/changes/) feature of RethinkDB. It handles failures and reconnections, but it will not re-emit the events persisted into the DB during the down time.

Any connected client can trigger an event, which then emits events on all other connected clients.

## Usage

```js
// Please create the test/events db/table pair beforehand,

var r = require('rethinkdbdash')();
var opts = {
  db: 'test', // name of the database to store the events
  table: 'events', // name of the table to store the events
  persist: true, // defaults to true, if false, it will delete events after adding
};
var emitter = require('emitter-rethinkdb')(r, opts)

emitter.trigger('beep', 'boop')

emitter.on('beep', function(d){
  console.log(d)
})

// optional stuff

emitter.on('connect', function() {
  console.log('connecting...')
})
.on('disconnect', function() {
  console.log('disconnected!')
})
.on('reconnect', function() {
  console.log('reconnecting...')
})
.on('error', function(err) {
  console.log('error', err)
})

// use this to empty the events queue
// emitter.kill()

```

## Installation

```
npm install @paramaggarwal/emitter-rethinkdb
```

## Contribute

- Implement reliable restart of events in case of failure. The events are stored in the database with a `ts` timestamp added to them. Each time we receive an event, we need to keep the latest time stamp value with us. Then when we attempt to reconnect, we need to query for all events since that timestamp as follows:

```
r.table('foo').changes({includeInitial: true}).run() // first time
r.table('foo').between(<last>, r.max, {index: 'updatedAt'}).changes().run() // next time on reconnect, when `<last>` is the value of `updatedAt` for the last change.
```

- Automatically create configured db/table if not found when starting up. Currently, the library expects that the db/table already exists in RethinkDB.


## Credits

This library is forked from https://github.com/1N50MN14/emitter-rethinkdb to use `rethinkdbdash` which has reconnection and connection pooling built in.

## License

(MIT)

Copyright (c) 2016 Param Aggarwal &lt;paramaggarwal@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
