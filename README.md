# Documentation page for ethereum-web3-plus

Package that sits on top of web3 package by frozeman.
This package adds 2 main functionalities:
- The Solidity compilation simplified with automatic linkeage of libraries and contract deployment simplification
- A block watcher and a waitFor (and waitForAll from version 0.2.2)function to get notified when a submitted transaction is completed and considered canonical. 
Note that in this version the solidity compiler is the one loaded by the geth node.
- A simplified eventSynchronizer (from version 0.2.4) that mixed with the [multi-http-provider] auto resubscribe capability makes life easier to get the history of events from the blocks and listen to new ones. 


You need to run a local Ethereum node to use this library.

## Installation

### Node.js

```bash
npm install ethereum-web3-plus --save
```

### Meteor.js

```bash
meteor npm install ethereum-web3-plus --save 
```

## Usage

Loading the packages. Second require will modify Web3 prototype
```js
var Web3 = require('web3');
require('ethereum-web3-plus'); // modify Web3 prototype

```

### Initializing Web3 API normally. 
Also see web3 package documentation
```js
let ethereum_url = "http://localhost:8545";
web3 = new Web3(new Web3.providers.HttpProvider(ethereum_url));
console.log("Connected to Geth console", web3.version.node, "on block", eth.blockNumber);
eth.defaultAccount = eth.coinbase;
web3.personal.unlockAccount(eth.defaultAccount, "capture your password here", 10);

output: Connected to Geth console Geth/v1.5.8-stable-f58fb322/darwin/go1.7.5 on block 62353

```

### Using the solidity compiler functionality:
Note the path resolution is relative to the path where the geth node is running.
- So if the geth node runs in /home/user/guenole/ethereum, "./sources/file.sol" will be resolved as /home/user/guenole/ethereum/sources/file.sol
- You can specify an absolute path but be carefull that libraries will use the full path and cut after 36 chars. So if you have an absolute path of /home/user/guenole/ethereum/sources/library.sol containing a library Library you will have a library token being __/home/user/guenole/ethereum/sources/__ because the fullpath is truncated at 36 char to fit 40chars with the __ on both side.
- A workaround is to create symbolic link to the sources path either from the geth node path or from the root (/)

```js
var compiler = web3.solidityCompiler();
compiler.addDeployedLib("MapString", "0x48f59e9fbce7880a11acd90dc2f99b28accc47f6");
compiler.addDeployedLib("MapAddress", "0xdb3d0da48c1962f5e31abd9f9904160729da9358");
compiler.addDeployedLib("MapAddressWithProps", "0x87614301dd92d49447b926941940c85533b7e147");
compiler.compile("./sources/example.sol"); // path either absolute or relative to geth running node.
compiler.compileInline("contract MyContract {uint i;}"); // from version 0.2.1, allow to compile source from a string. If import are required, specify them in the inline code with same path constraints as above.
compiler.displaySizes();  // display all contract found and compiled and their code size (important to check they are as small as possible)
compiler.displayMissingLibs(); // display libraries that have not been found in the deployed libs and that are required.

output: Compiled Example code length: 1440
```

### Using the contract functions
```js
// request the publication of the contract. Returns the tx hash of that request
var tx = web3.newInstanceTx("Example", any constructor params);

// convert a contract address into an javascript object
var address = "0x4435dee6dd53ffad11cf4ebb85cea2e51ea62434";
var E = web3.instanceAt("Example", address);
```

### Using the block watcher functionalities
```js
bw= web3.BlockWatcherStart(func);
```
It is possible to pass a function in parameter to the BlockWatcherStart function to wrap the callbacks.
This function parameter is optional and if not supplied, a simplest version is used (simpleWrapper below). 
This is necessary for some environments like Meteor where the callback must run in the proper context (eg Fiber).
So the function must work as follow: accept a callback as unique parameter. When called it should return a new function that wrap the callback.
```js
simpleWrapper = function(f) { 
	return function() { return f.apply(f, arguments); }
}

// for instance in Meteor
web3.BlockWatcherStart(Meteor.bindEnvironment);
```

### web3.waitFor
Waiting for transactions to be mined
```js
web3.waitFor(  web3.newInstanceTx("Example"), "Param1",
			 function(tx, p1, contract, err) {
			      console.log("callback:", tx, p1, contract, err);
			      if(contract) E = web3.instanceAt("Example", contract);
			 }, 
			 {canonicalAfter:2, dropAfter:5}  );


// when you want to stop watching the blocks
bw.stop();
```
waitFor returns the txHash if successfully registered in the watcher and in case of error, the callback is called and the return of that callback (if any) is returned. 
waitFor takes the following parameters:
```
- 1   : a valid tx hash returned by any of the web3 calls
- 2..N: any parameters to be passed to the callback
- N+1 : a callback in the form function(txHash, p2, ..., pN, contractAddress, error)
       where txHash is the hash of the transaction that was waited to be executed
             p2, ..., pN the custom paramters passed to the waitFor
             contractAddress is the newly created contract in case the transaction is deploying a contract 
                       or the address of the contract (or account) to which the transaction was made
- N+2 : (optional) an object with the following attributes 
      - canonicalAfter: <number>, default=0. tells the watcher to call the callback only canonicalAfter blocks after the transaction has been mined. This allow to control possible small soft forks and be sure to get valid transactions.
      - dropAfter: <number>, default=99999999. tells the watcher to drop this transaction if not mined after dropAfter blocks. This in case the local node has been killed before sending the tx to other nodes and/or the watcher loosing the events listener. 
```

### web3.waitForAll (from version 0.2.2) 
works like waitFor except that it takes an array of txHash as first parameter
```js
var E = web3.instanceAt("Example", contract); // Example is a compiled contract
var tx=[];
tx.push(E.function1({gas:200000});
tx.push(E.function2({gas:100000});
tx.push(E.function3({gas:300000});

web3.waitForAll(tx, "Your param", 
		function(tx, p1, contract, err, remaining) {
			console.log("callback:", tx, p1, contract, err, "remaining txs:", remaining);
			if(remaining==0) console.log("All tx have been mined. Proceed to something else");
          }, {canonicalAfter:5 } );

output: 
   callback: 0x1a3129963097798fa1a413b8093abb345d350e4a29e09c54d3a5887360b856f0, Your param, 0x4435dee6dd53ffad11cf4ebb85cea2e51ea62434, null, 2
   callback: 0x664ac8d55aaec1d38be109ddb7de4abdc75f11ea8a94992df3a71619af537f13, Your param, 0x4435dee6dd53ffad11cf4ebb85cea2e51ea62434, null, 1
   callback: 0x1261b9900b1d00c54749f63831bbfb8c1a9cafcd9638e1d90e41b17c3305ff5d, Your param, 0x4435dee6dd53ffad11cf4ebb85cea2e51ea62434, null, 0
   All tx have been mined. Proceed to something else
```
The function returns an array with the result of waitFor for each txHash. 
The callback passed to waitForAll is expected to receive an additional parameter being the number of remaining transactions waiting to be mined after this one. Note that the same callback is called once for each transaction in the array.

### web3.eventSynchronizer - History (from version 0.2.4)
This wrap the web3 event and filter mecanism and expose what I have felt was not so easy to use when you need to listen to events for all existing contracts and when you need to separate the logic of historical events and new events.

Let's assume you have a solidity contract like:
```sol
contract EventGenerator {
     event Happening(bytes32 indexed code, uint indexed index, bytes32 indexed key, bytes16[] data );
	function doEvent(bytes32 code, uint index, bytes32 key, bytes16[] data ) {
		Happening(code, index, key, data);
	}
}
```
You get it compiled with the web3.solidityCompiler (see above) and generate some events (and wait they are mined).
```js
var EvtGenAdd = "0xbc6d217aa83f97d848a9bc2541a870154069c7a8";
EvtGen = web3.instanceAt("EventGenerator", EvtGenAdd);
web3.waitForAll( [
	EvtGen.doEvent("Code", "14", "Key", ["data1", "data2"]),
	EvtGen.doEvent("Codex", "13", "Other", ["data1", "data2"]) ],
	function(tx, contract, err, remaining) {if(!remaining) console.log("Completed");} );
```

Then you want to get events corresponding to a filter from a certain block number *for any contract*:
```js
var es = web3.eventSynchronizer("EventGenerator.Happening", {index:[13,14], key:"Other"} );
es.historyFromBlock(63000, function(error, log) { 
		web3.completeLog(log); // optional: additional function to complete the content of the log message (see below)
		console.log("Log:",log); } );

output:
	Log: { address: '0xbc6d217aa83f97d848a9bc2541a870154069c7a8',
	blockNumber: 64511,
	transactionIndex: 0,
	transactionHash: '0x2e5260854c4fc22eac9f0888d3aeef7ce4c9d7210715ec8428519f8a4e39f031',
	blockHash: '0x5ce43d9745ec36eef9cd346022c8ec4d0250d8e8fc54e5993d6ff2de0826c35d',
	logIndex: 0,
	removed: false,
	event: 'Happening',
	args: 
	{ code: '0x436f646500000000000000000000000000000000000000000000000000000000',
	index: { [String: '13'] s: 1, e: 1, c: [Object] },
	key: '0x4f74686572000000000000000000000000000000000000000000000000000000',
	data: [] },
	isNew: false,
	contract: 'EventGenerator',
	txSender: '0x2725986748c1ec32fb1f99b4f1d2cbda62818b81',
	txTarget: '0xbc6d217aa83f97d848a9bc2541a870154069c7a8' }
```
The parameters are:
- a string event name in the form "contract-name.event-name" or an array of such event's names. Duplicates are removed; incorrect syntax are ignored; innexistant contract or event are ignored. if several event names are provided it means all events will be subscribed.
- a filterSet as an objects with fields being the names of the indexed param of the solidity event and value being (standard [web3-events] specifications)
  - null: any value is acceptable (or do not specify the field at all)
  - a value: the indexed field must have this value (other events are not received)
  - an array of values: logical OR on these values

In the log message 2 fields are added (vs the web3 model)
- isNew : false when received via the historyFromBloc and true if received via the startWatching
- contract : name of the contract as in the compilation process

### web3.eventSynchronizer - Watching (from version 0.2.4)
in the same way as above, you can get notifications when new events matching the filters are stored in the blockchain.
```js
es.startWatching(function(error, log) { 
		web3.completeLog(log); 
		console.log("New Log:",log); } );

setTimeout(function(){  es.stopWatching();   }, 5000); // stop after 5 seconds 
```
The log object has the same format as above, but the isNew flag is set to true.

### web3.completeLog  (from version 0.2.4)
This is a simple addOn to web3 to collect 2 fields from the transaction and add them to the log:
- txSender: the address of the account who sent the transaction. eth.getTransaction(hash).from.
- txtarget: the address of the account or contract to which the transaction was sent. eth.getTransaction(hash).to.

## Change log
### v 0.2.7
- 
- bug corrections
   - change name of historyFromBlock
   - control of a valid callback before calling

### v 0.2.6 and v 0.2.5
- Documentation corrections

### v 0.2.4
- addition of the web3.eventSynchronizer (see above)

### v 0.2.3
- documentation corrections

### v 0.2.2 
- addition of waitForAll

[multi-http-provider]: https://www.npmjs.com/package/multi-http-provider
[web3-events]: https://github.com/ethereum/wiki/wiki/JavaScript-API#contract-events

[npm-image]: https://badge.fury.io/js/web3.png
[npm-url]: https://npmjs.org/package/web3
[travis-image]: https://travis-ci.org/ethereum/web3.js.svg
[travis-url]: https://travis-ci.org/ethereum/web3.js
[dep-image]: https://david-dm.org/ethereum/web3.js.svg
[dep-url]: https://david-dm.org/ethereum/web3.js
[dep-dev-image]: https://david-dm.org/ethereum/web3.js/dev-status.svg
[dep-dev-url]: https://david-dm.org/ethereum/web3.js#info=devDependencies
[coveralls-image]: https://coveralls.io/repos/ethereum/web3.js/badge.svg?branch=master
[coveralls-url]: https://coveralls.io/r/ethereum/web3.js?branch=master
[waffle-image]: https://badge.waffle.io/ethereum/web3.js.svg?label=ready&title=Ready
[waffle-url]: http://waffle.io/ethereum/web3.js
