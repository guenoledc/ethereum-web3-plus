
//#########################################################################################
// ETHEREUM FUNCTIONS
// Created by G. de Cadoudal - march 2017
// adds functions and objects to the web3 instance by modifying Web3 prototype
//#########################################################################################



// assumes that the web3 variable is initialized outside this package and connected to a node.
if(!module.parent) {console.log("use require() to load this package"); return; }
var fs=require('fs');
var Web3 = module.parent.require('web3');
var EventSynchronizer = require("./event-watcher.js");

var SolidityCompiler = function(web3) {
	this.web3 = web3; // instance of the connection to the geth node
	this.DeployedLib = {} ; // a map of library name to their deployed address
	this.DictContract= {} ; // a map with the result of the compilation and what is needed for the initialization
	this.LibToken={}; // a map of the library name to their token in the compiled class to do the replacing
	this.MissingLibs={}; // a map with the tokens found in the code after replacement
}
SolidityCompiler.prototype.compile = function(sourceFile) {
	this.compileInline('import "'+sourceFile+'";');
}
SolidityCompiler.prototype.compileInline = function(sourceInline) {
	var eth=this.web3.eth;
	var filled = "________________________________________"; // used for lib token creation below
	var compiled = eth.compile.solidity(sourceInline);
	for( var obj in compiled ) {
		var name=obj.split(":")[1];
		this.DictContract[name] = {
			abi: compiled[obj].info.abiDefinition,
			code: compiled[obj].code,
			contract: eth.contract(compiled[obj].info.abiDefinition) };
		this.LibToken[name]= ("__"+obj.substr(0,36)+filled).substr(0,40); // 40 is the size of the target address
	}
	// replacing the lib totens with their address in all compiled contracts
	var reLib = /__.*?__+/g;
	for(name in this.DictContract) {
		for(lib in this.DeployedLib) {
			var rex=RegExp(this.LibToken[lib], "g"); // match "__<source of the lib cut at 36 char>__"
			this.DictContract[name].code=this.DictContract[name].code.replace(rex, this.DeployedLib[lib].replace("0x",""));
		}
		var m=reLib.exec(this.DictContract[name].code);
		while(m) {
			if(!this.MissingLibs[m[0]]) this.MissingLibs[m[0]]={count:0, contracts:[]};
			this.MissingLibs[m[0]].count++;
			if(this.MissingLibs[m[0]].contracts.indexOf(name)<0)
				this.MissingLibs[m[0]].contracts.push(name);
			m = reLib.exec(m["input"]); // find next
		}
	}
}
SolidityCompiler.prototype.displaySizes = function() {
	for(e in this.DictContract)
		console.log("Compiled", e, "code length:", this.DictContract[e].code.length-2); // remove length of "0x"
}
SolidityCompiler.prototype.displayMissingLibs = function() {
	for(l in this.MissingLibs)
		console.log("Missing library:", l, "in", this.MissingLibs[l].contracts.join(", "));
}
SolidityCompiler.prototype.addDeployedLib = function(lib, address) {
	if(!lib) return false;
	if(!address) return delete this.DeployedLib[lib];
	
	this.DeployedLib[lib]=address;
	return true;
}
SolidityCompiler.prototype.displayDeployedLibs = function() {
	for(l in this.DeployedLib)
		console.log("Library", l, ":",this.DeployedLib[l]);
}
SolidityCompiler.prototype.getCode = function(contract) {
	if(!contract) return null;
	if(!this.DictContract[contract]) return null;
	return this.DictContract[contract].code;
}
SolidityCompiler.prototype.getContract = function(contract) {
	if(!contract) return null;
	if(!this.DictContract[contract]) return null;
	return this.DictContract[contract].contract;
}


Web3.prototype.solidityCompiler = function() { // here this is the Web3 instance
	this.solidityCompiler = new SolidityCompiler(this);
	return this.solidityCompiler;
}


// should be called with
// 1: contract name
// 2..N: the contract constructor parameters
// returns the txHash to be watched with waitFor
Web3.prototype.newInstanceTxOld = function(){
	var args=Array.prototype.slice.call(arguments);
	var name=args.shift(); // extract the name and leave the rest
	if(typeof this.solidityCompiler !== 'object') return null; // the compiler has not been created 
	var c = this.solidityCompiler.getContract(name);
	if(!c) return null;
	// add the ethereum attributes
	args.push({ data:this.solidityCompiler.getCode(name), gas:this.eth.getBlock('latest').gasLimit });
	//console.log("args for new", args);
	// call the new function. there is no callback so the return value is the TxHash
	var tx= c.new.apply(c, args);
	return tx.transactionHash;
}

// Optimisation of the gas to be used. 
Web3.prototype.newInstanceTx = function(){
	var args=Array.prototype.slice.call(arguments);
	var name=args.shift(); // extract the name and leave the rest
	if(typeof this.solidityCompiler !== 'object') return null; // the compiler has not been created
	var c = this.solidityCompiler.getContract(name);
	if(!c) return null;
	// add the ethereum attributes
	args.push({ data:this.solidityCompiler.getCode(name) });//, gas:this.eth.getBlock('latest').gasLimit });
	//console.log("args for new before gas", args);
	var data=c.new.getData.apply(c, args);
	var gas = this.eth.estimateGas({data:data});
	//console.log("args for new", args);
	// call the new function. there is no callback so the return value is the TxHash
	var tx= this.eth.sendTransaction({data:data, gas:gas});
	return tx;
}


Web3.prototype.instanceAt = function(name, address) {
	if(typeof this.solidityCompiler !== 'object') return null; // the compiler has not been created
	var c = this.solidityCompiler.getContract(name);
	if(!c) return null;
	return c.at(address);
}

Web3.prototype.instanceLibrary = function(name) {
	if(typeof this.solidityCompiler !== 'object') return null; // the compiler has not been created
	if(!this.solidityCompiler.DeployedLib[name]) return null; // the library is not deployed
	//console.log("instanceLibrary:", name, this.solidityCompiler.DeployedLib[name]);
	return this.instanceAt(name, this.solidityCompiler.DeployedLib[name]);
}


var isArray = function (object) {
	return object instanceof Array;
};

var isFunction = function (object) {
	return typeof object === 'function';
};

var isObject = function (object) {
	return typeof object === 'object';
};

var extractCallback = function (args) {
	if (isFunction(args[args.length - 1])) {
		return args.pop(); // modify the args array!
	}
};
var extractOptions = function (args) {
	var options = { // set the default
		canonicalAfter:0,
		dropAfter:99999999 }
	if (isObject(args[args.length - 1])) {
		var opt = args.pop(); // modify the args array!
		if( opt.canonicalAfter ) options.canonicalAfter=opt.canonicalAfter;
		if( opt.dropAfter ) options.dropAfter=opt.dropAfter;
		if( opt.groupId ) options.groupId=opt.groupId;
	}
	return options;
};

var BlockWatcher = function(web3, bindEnvironment) {
	var self=this;
	this.web3 = web3
	this.tx_group={}; // dictionnary with group of tx in the form uid : {txhash1:true, txhash2:true, count:2}
	this.tx_wait={}; // dictionary txHash => {gas: <requested gas>, args: [p1, p2], cb:<callback>}
	this.filter;
	this.newBlock =
		   bindEnvironment(function(err, blockHash) {
						   if(err) {
						   console.log("error captured in the block watcher. stop and restart.", err);
						   self.stop();
						   self.start();
						   } else {
						   var block = self.web3.eth.getBlock(blockHash, false);
						   //console.log("new block ", block.number);
						   
						   for(var i=0; i<block.transactions.length; i++) {
						       var txHash=block.transactions[i];
						       if(self.tx_wait[txHash]) {// the tx Hash exists in the dictionary
						            var txwait = self.tx_wait[txHash];
						            console.log("transaction watched found", txHash, "waiting",txwait.canonicalAfter,"block(s)");
									txwait.startBlock=block.number;
									txwait.receipt=self.web3.eth.getTransactionReceipt(txHash);
						       } // end if tx exists in the wait dictionary
						   } // end for each transaction
						   
						   // go through all waiting transactions and check those that should be processed
						   for(tx in self.tx_wait) {
						      var txwait = self.tx_wait[tx];
						      var txgroup = self.tx_group;
						   
							  // to protect against a case where the receipt would not be loaded while available, load it if 2 blocks have passed
						      if(!txwait.receipt && block.number >= txwait.startBlock + 2) {
						           txwait.receipt=self.web3.eth.getTransactionReceipt(tx);
						           if(txwait.receipt) txwait.startBlock=txwait.receipt.blockNumber; // update the startBlock
						      }
						      // process the normal situation where the tx is mined and the tx is cannonical
						      if(txwait.receipt && block.number >= txwait.startBlock + txwait.canonicalAfter) {
						   
						              var receipt=txwait.receipt;
									  var callback = txwait.cb;
						              var cb_args = txwait.args;
						              cb_args.unshift(tx);
						              cb_args.push(receipt.contractAddress || receipt.to);
						              if(txwait.gas<=receipt.gasUsed)
						              cb_args.push("full gas used:"+receipt.gasUsed)
						              else if(receipt.contractAddress
								              && self.web3.eth.getCode(receipt.contractAddress)=="0x")
						                   cb_args.push("created contract has no bytecodes");
						              else cb_args.push(null); // No error
						              // remove the txHash from the wait dictionary
						              delete self.tx_wait[tx];
									   // manage the case of a group
									   if(txwait.group && txgroup[txwait.group] && txgroup[txwait.group][tx]) {
											 txgroup[txwait.group].count--; // reduce the number of tx in the group
											 delete txgroup[txwait.group][tx]; // remove the tx from the group
											 cb_args.push(txgroup[txwait.group].count); // adds the nb of remaining tx in the group to the callback args
											 if(txgroup[txwait.group].count==0) delete txgroup[txwait.group]; // remove the group when done
									   }
						              // call the callback
						              callback.apply(null, cb_args);
						   
						      // process the case where the receipt is not available and we have waited for enough block to consider it dead
						      } else if(block.number >= self.tx_wait[tx].startBlock+self.tx_wait[tx].dropAfter) {
						             console.log("transaction watched timeout", txHash, "after",self.tx_wait[tx].dropAfter,"blocks");
						             var callback = txwait.cb;
						             var cb_args = txwait.args;
						             cb_args.unshift(tx);
						             cb_args.push(null); // no contract address
						             cb_args.push("maximum number of blocks reached. Tx still not mined!");
						             // remove the txHash from the wait dictionary
						             delete self.tx_wait[tx];
						               // manage the case of a group
									   if(txwait.group && txgroup[txwait.group] && txgroup[txwait.group][tx]) {
										   txgroup[txwait.group].count--; // reduce the number of tx in the group
										   delete txgroup[txwait.group][tx]; // remove the tx from the group
										   cb_args.push(txgroup[txwait.group].count); // adds the nb of remaining tx in the group to the callback args
										   if(txgroup[txwait.group].count==0) delete txgroup[txwait.group]; // remove the group when done
									   }
						             // call the callback
						             callback.apply(null, cb_args);
						       }
						   }
						   //self.saveState();
						   } // end if no error
						   });
	this.start = function() {
		if(this.filter) { this.filter.stopWatching(); this.filter=null; } // clear any previous watching and filter
		if(!this.filter) this.filter = this.web3.eth.filter('latest');
		console.log("Starting the block watcher");
		this.filter.watch(this.newBlock);
		//this.loadState();
	}
	this.stop = function() {
		this.filter.stopWatching();
		this.filter=null;
	}
	
	this.waitFor = function(txHash, gas, args, callback, options) {
		this.tx_wait[txHash]={gas: gas, args: args, cb: callback,
			startBlock: options.startBlock || this.web3.eth.blockNumber,
			canonicalAfter: options.canonicalAfter || 0,
			dropAfter:options.dropAfter || 99999999 };
		if(options.groupId) {
			if(!this.tx_group[options.groupId]) this.tx_group[options.groupId]={count:0}; // init the group
			var group=this.tx_group[options.groupId];
			group[txHash]=true; // add the tx to the group
			group.count++; // increase by one.
			this.tx_wait[txHash].group=options.groupId; // record the link to the group
		}
		console.log("Transaction",txHash, "added to the watch", (options.groupId?"in group":""));
		return txHash;
	}
}


Web3.prototype.blockWatcher=null;


// function to be called back when the txHash (first argument) is mined in a block
// accepts as many parameters that are all passed to the callback
// eg waitFor(txHash, p1, p2, callback, options) will call callback(txHash, p1, p2, contractAddress, error)
// error checked are the "out of gas" and the non creation of object "code=0x00"
// optional options is { canonicalAfter: 0, dropAfter: 99999999} with those default values
// calls the callback only canonicalAfter blocks after the block of the mining of the tx
// stop waiting this transation after dropAfter blocs and call the callback with an error
Web3.prototype.waitFor = function() {
	// callback expected is function(txHash, rest of the args passed to this functions before the callback)
	var args=Array.prototype.slice.call(arguments);
	var options = extractOptions(args);
	var callback = extractCallback(args);
	if(!callback) return false; // no point in doing something there is no callback
	var txHash = args.shift() ; // first param is the tx Hash
	if(isArray(txHash)) return this.waitForAll.apply(this, arguments);
	var tx=this.eth.getTransaction(this.toHex(txHash));
	if(!tx) { // the first argument is not an existing txHash !!
		args.unshift(txHash);
		args.push(null);
		args.push("the provided txHash does not exists in the geth node. Check your code.");
		return callback.apply(null,args);
	}
	var gas=tx.gas; // the requested max gas that will be compared to the gasUsed of the transaction receipt
	if(tx.blockNumber) // if the transaction is already in a block, use it as a start point of watching.
		options.startBlock = tx.blockNumber;

	if(!this.blockWatcher) {;
		args.unshift(txHash);
		args.push(null);
		args.push("the blockWatcher has not been created yet. Use BlockWatcherStart();");
		return callback.apply(null,args);
	}
	return this.blockWatcher.waitFor(txHash, gas, args, callback, options);
}
Web3.prototype.waitForAll = function() {
	var args=Array.prototype.slice.call(arguments);
	var options = extractOptions(args);
	var callback = extractCallback(args);
	if(!callback) return false; // no point in doing something there is no callback
	var txHashs = args.shift() ; // first param is the tx Hash array
	if(!isArray(txHashs)) {console.log("waitForAll expects an array of txHash"); return null;}
	if(txHashs.length<1) {console.log("waitForAll expects a non empty array of txHash"); return null;}
	options.groupId = txHashs[0];
	args.push(callback);
	args.push(options);
	var result=[];
	for(var i=0; i<txHashs.length; i++) result.push(this.waitFor.apply(this,[txHashs[i]].concat(args) ));
	return result;
}


Web3.prototype.BlockWatcherStart = function(bindEnvironment) {
	// in case no environment binding is provided, use an identity one
	if(!bindEnvironment) bindEnvironment=function(f) { return function() { return f.apply(f, arguments); } }
	if(!this.blockWatcher) this.blockWatcher = new BlockWatcher(this, bindEnvironment);
	this.blockWatcher.start();
	return this.blockWatcher;
}

Web3.prototype.completeLog = function(log) {
	if(!log) return;
	if(!log.transactionHash) return;
	tx = this.eth.getTransaction(log.transactionHash);
	if(!tx) return;
	log.txSender = tx.from;
	log.txTarget = tx.to;
}


Web3.prototype.eventSynchronizer = function(ContractDotEvents, filters) {
	return new EventSynchronizer(this, ContractDotEvents, filters);
}

