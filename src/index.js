'use strict'
require('dotenv').config();
const crypto = require('../lib/crypto');
const keypairs = require('chainsql-keypairs');
const EventManager = require('./eventManager')
const _ = require('lodash');

const RippleAPI = require('chainsql-lib').ChainsqlLibAPI;
const Submit = require('./submit');
const Ripple = require('./ripple');
const chainsqlError = require('../lib/error');

_.assign(RippleAPI.prototype, {
	prepareTable: require('./tablePayment'),
	prepareTx: require('./txPayment')
})
const addressCodec = require('chainsql-address-codec');
const validate = require('../lib/validate')
const Connection = require('./connect');
const Table = require('./table');
const Contract = require('./smartContract');
const util = require('../lib/util');
const opType = require('../lib/config').opType;
const getFee = util.getFee;
const getSequence = util.getSequence;
const convertStringToHex = util.convertStringToHex;
const getTableSequence = util.getTableSequence;
const getUserToken = util.getUserToken;
const getTxJson = util.getTxJson;
const generateToken = util.generateToken;
const decodeToken = util.decodeToken;

class ChainsqlAPI extends Submit {
	constructor() {
		super();
		this.tab = null;
		this.query = {};
		this.exec = '';
		this.token = '';
		this.perm = {
			insert: 'lsfInsert',
			delete: 'lsfDelete',
			update: 'lsfUpdate',
			select: 'lsfSelect',
			execute: 'lsfExecute'
		};
		this.transaction = false;
		this.cache = [];
		this.strictMode = false;
		this.needVerify = 1;
	}

	submit (cb) {
		var that = this;
		if (that.transaction) {
			throw new Error('you are now in transaction,can not be submit');
		} else {
			let cbResult = util.parseCb(cb);

			if(cbResult.isFunction) {
				super.submit(cbResult.expectOpt).then(result => {
					cb(null, result);
				}).catch(error => {
					cb(error, null);
				});
			} else {
				return new Promise((resolve, reject) => {
					super.submit(cbResult.expectOpt).then(result => {
						resolve(result);
					}).catch(error => {
						reject(error);
					});
				});
			}
		}
	}
};

ChainsqlAPI.prototype.connect = function (url, cb) {
	let ra = new RippleAPI({
		server: url
	});
	let con = new Connection();
	con.api = ra;
	this.api = ra;
	this.ChainsqlAPI = this;
	this.connect = con;
	this.event = new EventManager(this);
	if ((typeof cb) != 'function') {
		return con.connect();
	} else {
		con.connect().then(function (data) {
			cb(null, data)
		}).catch(function (err) {
			cb(err);
		});
	}
}
ChainsqlAPI.prototype.disconnect = function (cb) {
	if ((typeof cb) != 'function') {
		return this.api.disconnect();
	} else {
		this.api.disconnect().then(function (data) {
			cb(null, data)
		}).catch(function (err) {
			cb(err);
		});
	}
}
ChainsqlAPI.prototype.as = function (account) {
	if(!account.secret || !account.address){
		throw chainsqlError("c.as parameter invalid,must contain 'secret' and 'address'"); 
	}
	this.connect.as(account);
}
ChainsqlAPI.prototype.use = function (address) {
	this.connect.use(address);
}
ChainsqlAPI.prototype.setRestrict = function (mode) {
	this.strictMode = mode;
}
ChainsqlAPI.prototype.setNeedVerify = function (isNeed) {
	isNeed ? this.needVerify = 1 : this.needVerify = 0;
}
ChainsqlAPI.prototype.table = function (name) {
	this.tab = new Table(name, this);
	if (this.transaction) {
		this.tab.transaction = this.transaction;
		this.tab.cache = this.cache;
	}
	this.tab.strictMode = this.strictMode;
	this.tab.event = this.event;
	return this.tab;
}

ChainsqlAPI.prototype.contract = function(jsonInterface, address, options) {
  this.contractObj = new Contract(this, jsonInterface, address, options);
  return this.contractObj;
}

ChainsqlAPI.prototype.generateAddress = function () {
	var account;
	var keypair;
	let ripple = new RippleAPI();
	if (arguments.length == 0) {
		account = ripple.generateAddress();
		keypair = keypairs.deriveKeypair(account.secret);
	} else {
		if(typeof(arguments[0]) === "object" ) {
			account = ripple.generateAddress(arguments[0]);
			keypair = keypairs.deriveKeypair(account.secret);
		} else {
			keypair = keypairs.deriveKeypair(arguments[0]);
			account = {
				secret: arguments[0],
				address: keypairs.deriveAddress(keypair.publicKey)
			}
		}
	}
	var opt = {
		version: 35
	}
	var buf = Buffer.from(keypair.publicKey, 'hex');
	account.publicKey = addressCodec.encode(buf, opt);
	// account.publickKey = keypair.publicKey;

	return account;
}

// active account
function paymentSetting(ChainSQL, account, resolve, reject) {
	try {
		let userInfo = {
			"domain": "www.peersafe.com",
			"memos": [{
				"type": "USERINFO",
				"format": "plain/text",
				"data": ""
			}]
		};
		//设置用户信息
		userInfo.memos[0].data = JSON.stringify(_.omit(data, ['pwd']));
		ChainSQL.api.prepareSettings(account.address, userInfo)
			.then(function (data) {
				//console.log('prepareSettings: ', JSON.stringify(data));
				try {
					let signedRet = ChainSQL.api.sign(data.txJSON, account.secret);
					return ChainSQL.api.submit(signedRet.signedTransaction);
				}
				catch (error) {
					//console.log('sign prepareSettings failure.', JSON.stringify(error));
					reject(error);
				}
			})
			.then(function (data) {
				//console.log('sign prepareSetting: ', JSON.stringify(data));
				if (data.resultCode === 'tesSUCCESS') {
					resolve({
						status: 0,
						message: ''
					});
				} else {
					reject({
						status: -1,
						message: data.resultMessage
					});
				}
			})
			.catch(function (error) {
				reject(error);
			});
	}
	catch (error) {
		reject(error);
	}

}

ChainsqlAPI.prototype.pay = function (account, amount, memos) {
	let ripple = new Ripple(this);
	return ripple.preparePayment(account, amount, memos);
}

ChainsqlAPI.prototype.accountSet = function (opt) {
	let ripple = new Ripple(this);
	return ripple.accountSet(opt);
}

ChainsqlAPI.prototype.getTransferFee = function (issuerAddr) {
	let ripple = new Ripple(this);
	return ripple.getTransferFee(issuerAddr);
}

ChainsqlAPI.prototype.trustSet = function (amount) {
	let ripple = new Ripple(this);
	return ripple.trustSet(amount);
}

ChainsqlAPI.prototype.escrowCreate = function (sDestAddr, amount, opt) {
	let ripple = new Ripple(this);
	return ripple.escrowCreate(sDestAddr, amount, opt);
}

ChainsqlAPI.prototype.escrowExecute = function (sOwnerAddr, nCreateEscrowSeq) {
	let ripple = new Ripple(this);
	return ripple.escrowExecute(sOwnerAddr, nCreateEscrowSeq);
}

ChainsqlAPI.prototype.escrowCancel = function (sOwnerAddr, nCreateEscrowSeq) {
	let ripple = new Ripple(this);
	return ripple.escrowCancel(sOwnerAddr, nCreateEscrowSeq);
}

ChainsqlAPI.prototype.payToContract = function (contractAddr, value, gas) {
	let ripple = new Ripple(this);
	return ripple.payToContract(contractAddr, value, gas);
}

ChainsqlAPI.prototype.createTable = function (name, raw, inputOpt) {
	validate.create(name, raw);
	var opt = inputOpt ? inputOpt : {};
	let that = this;
	var confidential = false;
	if (opt.confidential) {
		confidential = opt.confidential;
	}
	// console.log(JSON.stringify(opt.operationRule));
	if (that.transaction) {
		var json = {
			OpType: opType['t_create'],
			TableName: name,
			Raw: raw,
			confidential: confidential,
			OperationRule: opt.operationRule ? convertStringToHex(JSON.stringify(opt.operationRule)) : undefined
		};

		this.cache.push(json);
		return;
	} else {
		let payment = {
			TransactionType: 'TableListSet',
			Account: that.connect.address,
			OpType: opType['t_create'],
			Tables: [{
				Table: {
					TableName: name
				}
			}],
			Raw: raw,
			OperationRule: opt.operationRule ? opt.operationRule : undefined,
			Confidential: confidential ? true : false,
		};

		if (confidential) {
			var token = generateToken(that.connect.secret);
			var symKey = decodeToken(that, token);
			if(that.connect.secret === "gmAlg") {
				payment.raw = crypto.symEncrypt(symKey, payment.raw, "gmAlg").toUpperCase();
			} else {
				payment.raw = crypto.symEncrypt(symKey, payment.raw).toUpperCase();
			}
			
			payment.token = token.toUpperCase();
		} else {
			payment.raw = convertStringToHex(payment.raw);
		}

		if (payment.operationRule) {
			payment.operationRule = convertStringToHex(payment.operationRule);
		}
		this.payment = payment;
		return this;
	}
}

ChainsqlAPI.prototype.recreateTable = function (name) {
	let that = this;
	if (that.transaction) {
		var json = {
			OpType: opType['t_recreate'],
			TableName: name,
			confidential: confidential
		};
		this.cache.push(json);
		return;
	} else {
		let payment = {
			TransactionType: 'TableListSet',
			Account: that.connect.address,
			OpType: opType['t_recreate'],
			Tables: [{
				Table: {
					TableName: name
				}
			}],
		};
		this.payment = payment;
		return this;
	}
}

ChainsqlAPI.prototype.dropTable = function (name) {
	let that = this;
	if (that.transaction) {
		this.cache.push({
			OpType: opType['t_drop'],
			TableName: name
		});
		return;
	} else {
		let payment = {
			TransactionType: 'TableListSet',
			Account: that.connect.address,
			OpType: opType['t_drop'],
			Tables: [{
				Table: {
					TableName: name
				}
			}],
		};
		this.payment = payment;
		return this;
	}
}
ChainsqlAPI.prototype.renameTable = function (oldName, newName) {
	if (newName == '' || !newName) {
		throw chainsqlError("Table new name can not be empty")
	}
	let that = this;
	if (that.transaction) {
		this.cache.push({
			OpType: opType['t_rename'],
			TableName: name,
			Raw: raw
		});
		return;
	} else {
		let payment = {
			TransactionType: 'TableListSet',
			Account: that.connect.address,
			OpType: opType['t_rename'],
			Tables: [{
				Table: {
					TableName: oldName,
					TableNewName: newName
				}
			}],
		}

		this.payment = payment;
		return this;
	}
}
ChainsqlAPI.prototype.grant = function (name, user, flags, publicKey) {
	if (!(name && user && flags)) throw chainsqlError('args is not enough');
	if (!util.checkUserMatchPublicKey(user, publicKey)) {
		throw chainsqlError('Publickey does not match User');
	}

	let that = this;
	if (that.transaction) {
		this.cache.push({
			OpType: opType['t_grant'],
			TableName: name,
			Raw: [flags],
			publicKey: publicKey,
			User: user
		});
		return;
	} else {
		let payment = {
			TransactionType: 'TableListSet',
			Account: that.connect.address,
			OpType: opType['t_grant'],
			Tables: [{
				Table: {
					TableName: name
				}
			}],
			Raw: [flags],
			User: user,
			name: name,
			publicKey: publicKey
		};
		this.payment = payment;
		return this;
	}
}

ChainsqlAPI.prototype.getAccountInfo = function (address, cb) {
	if ((typeof cb) === "undefined") {
		return this.api.getAccountInfo(address);
	} else if ((typeof cb) === "function") {
		this.api.getAccountInfo(address).then(function (data) {
			cb(null, data);
		}).catch(function (err) {
			cb(err, null);
		});
	} else {
		throw chainsqlError("wrong params, please check");
	}
};

ChainsqlAPI.prototype.getAccountTransactions = function (address, opts, cb) {
	let callback, newOpt, singleArg;
	let isCallback = false;
	switch (arguments.length) {
	case 1:
		newOpt = {};
		break;
	case 2:
		singleArg = arguments[1];
		if ((typeof singleArg) === "function") {
			callback = singleArg;
			isCallback = true;
		} else if ((typeof singleArg) === "object") {
			newOpt = singleArg;
		} else {
			throw chainsqlError("wrong params, please check");
		}
		break;
	case 3:
		newOpt = opts;
		if ((typeof cb) === "function") {
			callback = cb;
			isCallback = true;
		} else {
			throw chainsqlError("wrong params, please check");
		}
		break;
	default:
		throw chainsqlError("wrong params, please check");
	}

	if (isCallback) {
		this.api.getTransactions(address, newOpt).then(function (data) {
			callback(null, data);
		}).catch(function (err) {
			callback(err, null);
		});
	} else {
		return this.api.getTransactions(address, newOpt);
	}
};

ChainsqlAPI.prototype.getTransaction = function (hash, cb) {
	if ((typeof cb) != 'function') {
		return this.api.getTransaction(hash);
	} else {
		this.api.getTransaction(hash).then(function (data) {
			cb(null, data);
		}).catch(function (err) {
			cb(err);
		});
	}
}

ChainsqlAPI.prototype.getServerInfo = function (cb) {
	if ((typeof cb) != 'function') {
		return this.api.getServerInfo();
	} else {
		this.api.getServerInfo().then(function (data) {
			cb(null, data);
		}).catch(function (err) {
			cb(err);
		});
	}
}

ChainsqlAPI.prototype.getUnlList = function (cb) {
	return this.api.connection.request({
		command: 'unl_list'
	}).then(function (data) {
		if ((typeof cb) != 'function') {
			return data;
		} else {
			cb(null, data);
		}
	}).catch(function (err) {
		cb(err);
	})
};

ChainsqlAPI.prototype.getLedger = function (opts, cb) {
	let callback, newOpt, singleArg;
	let isCallback = false;
	switch(arguments.length) {
	case 0:
		newOpt = {};
		break;
	case 1:
		singleArg = arguments[0];
		if((typeof singleArg) === "function") {
			callback = singleArg;
			isCallback = true;
		} else if((typeof singleArg) === "object") {
			newOpt = singleArg;
		} else {
			throw chainsqlError("wrong params, please check");
		}
		break;
	case 2:
		newOpt = opts;
		if ((typeof cb) === "function") {
			callback = cb;
			isCallback = true;
		} else {
			throw chainsqlError("wrong params, please check");
		}
		break;
	default:
		throw chainsqlError("wrong params, please check");
	}

	if(isCallback) {
		this.api.getLedger(newOpt).then(function (data) {
			callback(null, data);
		}).catch(function (err) {
			callback(err, null);
		});
	} else {
		return this.api.getLedger(newOpt);
	}
};

ChainsqlAPI.prototype.getLedgerVersion = function (cb) {
	if ((typeof cb) === "undefined") {
		return this.api.getLedgerVersion();
	} else if ((typeof cb) === "function") {
		this.api.getLedgerVersion().then(function (data) {
			cb(null, data);
		}).catch(function (err) {
			cb(err, null);
		});
	} else {
		throw chainsqlError("wrong params, please check");
	}
};

ChainsqlAPI.prototype.beginTran = function () {
	if (this.connect && this.connect.address) {
		this.cache = [];
		this.transaction = true;
		return;
	}
}

function handleCommit(ChainSQL, object, resolve, reject) {
	var isFunction = false;

	let cbResult = util.parseCb(object);
	isFunction = cbResult.isFunction;

	var cb = function (error, data) {
		if (isFunction) {
			if (object == null)
				object = callback;
			object(error, data)
		} else {
			if (error) {
				reject(error);
			} else {
				resolve(data);
			}
		}
	}

	var ary = [];
	var secretMap = {};
	var cache = ChainSQL.cache;
	for (var i = 0; i < cache.length; i++) {
		var noRaw = [2, 3, 5, 7];
		if (noRaw.indexOf(cache[i].OpType) != -1) {
			continue;
		}

		if (cache[i].OpType == 1) {
			var key = ChainSQL.connect.address + cache[i].TableName;
			if (cache[i].confidential) {
				secretMap[key] = generateToken(ChainSQL.connect.secret);
			} else {
				secretMap[key] = " ";
			}
			//secretMap[cache[i].TableName] = generateToken(ChainSQL.connect.secret);
		}

		if (cache[i].OpType != 1) {
			var address = cache[i].Owner ? cache[i].Owner : ChainSQL.connect.address;
			var key = address + cache[i].TableName;
			if (!secretMap[key]) {
				ary.push(getUserToken(ChainSQL.api.connection, address, ChainSQL.connect.address, ChainSQL.cache[i].TableName));
			}
		}
	};

	Promise.all(ary).then(function (data) {
		for (var i = 0; i < data.length; i++) {
			for (var key in data[i]) {
				secretMap[key] = data[i][key];
			}
		};

		var payment = {
			"TransactionType": "SQLTransaction",
			"Account": ChainSQL.connect.address,
			"Statements": [],
			"StrictMode": ChainSQL.strictMode,
			"NeedVerify": ChainSQL.needVerify
		};

		for (var i = 0; i < cache.length; i++) {
			var address = cache[i].Owner ? cache[i].Owner : ChainSQL.connect.address;
			var key = address + cache[i].TableName;
			if (secretMap[key] && secretMap[key] != " ") {
				var token = secretMap[key];

				var secret = decodeToken(ChainSQL, token);
				if (cache[i].Raw) {
					if (cache[i].OpType != opType.t_grant) {
						const algType = ChainSQL.connect.secret === "gmAlg" ? "gmAlg" : "aes";
						cache[i].Raw = crypto.symEncrypt(secret, JSON.stringify(cache[i].Raw), algType).toUpperCase();
					} else {
						cache[i].Raw = convertStringToHex(JSON.stringify(cache[i].Raw));
					}
				};

				if (cache[i].OpType == opType['t_assign'] || cache[i].OpType == opType['t_grant']) {
					token = crypto.eciesEncrypt(secret, cache[i].publicKey);
				};

				if (cache[i].OpType == opType['t_assign'] || cache[i].OpType == opType['t_grant'] || cache[i].OpType == opType['t_create']) {
					cache[i].Token = token;
					//remove publicKey field
					delete cache[i].publicKey;
				}
			} else {
				cache[i].Raw = convertStringToHex(JSON.stringify(cache[i].Raw));
				delete cache[i].publicKey;
			}

			var tableName = cache[i].TableName;
			cache[i].Tables = [{
				Table: {
					TableName: convertStringToHex(tableName)
				}
			}];
			delete cache[i].TableName;
			delete cache[i].confidential;
			payment.Statements.push(cache[i]);
		}

		//clear transactin status
		ChainSQL.transaction = false;
		ChainSQL.cache = [];

		getTxJson(ChainSQL, payment).then(function (data) {
			var payment = data.tx_json;
			payment.Statements = convertStringToHex(JSON.stringify(payment.Statements));
			ChainSQL.api.prepareTx(payment).then(function (data) {
				//console.log(JSON.stringify(tx_json))
				var txJson = JSON.parse(data.txJSON);
				txJson.Fee = util.calcFee(txJson);
				data.txJSON = JSON.stringify(txJson);
				let signedRet = ChainSQL.api.sign(data.txJSON, ChainSQL.connect.secret);
				ChainSQL.handleSignedTx(ChainSQL, signedRet, cbResult.expectOpt, resolve, reject);
			}).catch(function (error) {
				cb(error, null);
			});
		}).catch(function (error) {
			ChainSQL.transaction = false;
			cb(error, null);
		});
	}).catch(error => {
		ChainSQL.transaction = false;
		cb(error, null);
	});
}

ChainsqlAPI.prototype.commit = function (cb) {
	var that = this;

	if ((typeof cb) != 'function') {
		return new Promise(function (resolve, reject) {
			handleCommit(that, cb, resolve, reject);
		});
	} else {
		handleCommit(that, cb, null, null);
	}
};

function handleGrantPayment(ChainSQL) {
	return new Promise((resolve, reject) => {
		if (ChainSQL.payment.opType != opType['t_grant'])
			reject(chainsqlError('Type of payment must be t_grant'));
		
		var name = ChainSQL.payment.name;
		var publicKey = ChainSQL.payment.publicKey;
		getUserToken(ChainSQL.api.connection, ChainSQL.connect.address, ChainSQL.connect.address, name).then(function (data) {
			var token = data[ChainSQL.connect.address + name];
			if (token != '') {
				var secret = decodeToken(ChainSQL, token);
				try {
					token = generateToken(publicKey, secret).toUpperCase();
				} catch (e) {
					reject(chainsqlError('your publicKey is not validate'));
				}
				ChainSQL.payment.token = token;
			}
			delete ChainSQL.payment.name;
			delete ChainSQL.payment.publicKey;

			resolve();
		}).catch(error => {
			reject(error);
		});
	})
}

ChainsqlAPI.prototype.sign = function (json, secret, option) {
	if (!json.Fee) {
		json.Fee = "50";
	}
	let ripple = new RippleAPI();
	return ripple.sign(JSON.stringify(json), secret, option);
};

// ChainsqlAPI.prototype.encrypt = function (plainText, listPublic) {

// }

// ChainsqlAPI.prototype.decrypt = function (cipher, secret) {

// }

ChainsqlAPI.prototype.getAccountTables = function (address, bGetDetailInfo = false) {
	var connection = this.api ? this.api.connection : this.connect.api.connection;
	return new Promise(function (resolve, reject) {
		connection.request({
			command: 'g_accountTables',
			account: address,
			detail: bGetDetailInfo
		}).then(function (data) {
			resolve(data);
		}).catch(function (err) {
			reject(err);
		});
	});
};

ChainsqlAPI.prototype.getTableAuth = function (owner, tableName, accounts) {
	var connection = this.api ? this.api.connection : this.connect.api.connection;
	var req = {
		command: 'table_auth',
		owner: owner,
		tablename: tableName
	};
	if (accounts && accounts.length > 0) {
		req.accounts = accounts;
	}
	return new Promise(function (resolve, reject) {
		connection.request(req).then(function (data) {
			resolve(data);
		}).catch(function (err) {
			reject(err);
		});
	});
};

ChainsqlAPI.prototype.getTableNameInDB = function (owner, tableName) {
	var that = this;
	return new Promise(function (resolve, reject) {
		util.getTableName(that, owner, tableName).then(function (data) {
			resolve(data.nameInDB);
		}).catch(function (err) {
			reject(err);
		});
	});
};

ChainsqlAPI.prototype.getBySqlAdmin = function (sql) {
	var connection = this.api ? this.api.connection : this.connect.api.connection;
	return new Promise(function (resolve, reject) {
		connection.request({
			command: 'r_get_sql_admin',
			sql: sql
		}).then(function (data) {
			resolve(data);
		}).catch(function (err) {
			reject(err);
		});
	});
};

ChainsqlAPI.prototype.getBySqlUser = function (sql) {
	var connect = this.connect;
	var json = {
		Account: connect.address,
		Sql: sql
	};
	return new Promise(function (resolve, reject) {
		util.getValidatedLedgerIndex(connect).then(function (ledgerVersion) {
			json.LedgerIndex = ledgerVersion;
			return util.signData(JSON.stringify(json), connect.secret);
		}).then(function (signed) {
			return connect.api.connection.request({
				command: 'r_get_sql_user',
				publicKey: signed.publicKey,
				signature: signed.signature,
				signingData: JSON.stringify(json),
				tx_json: json
			})
		}).then(function (data) {
			resolve(data);
		}).catch(function (err) {
			reject(err);
		});
	});
};

ChainsqlAPI.prototype.audit = function (owner, sql, target_path) {
	var connect = this.connect;
	var json = {
		command: 't_audit',
		tx_json: [owner, sql, target_path]
	}

	return new Promise(function (resolve, reject) {
		connect.api.connection.request(json).then(function (res) {
			resolve(res)
		}).catch(function (err) {
			reject(err)
		})
	})
}

ChainsqlAPI.prototype.stopAudit = function (nick_name) {
	var connect = this.connect;
	var json = {
		command: 't_auditstop',
		tx_json: [nick_name]
	}

	return new Promise(function (resolve, reject) {
		connect.api.connection.request(json).then(function (res) {
			resolve(res)
		}).catch(function (err) {
			reject(err)
		})
	})
}

ChainsqlAPI.prototype.auditPosition = function name(nick_name) {
	var connect = this.connect;
	var json = {
		command: 't_auditposition',
		tx_json: [nick_name]
	}

	return new Promise(function (resolve, reject) {
		connect.api.connection.request(json).then(function (res) {
			resolve(res)
		}).catch(function (err) {
			reject(err)
		})
	})
}

ChainsqlAPI.prototype.dump = function (owner, target_path) {
	var connect = this.connect;
	var json = {
		command: "t_dump",
		"tx_json": [owner, target_path]
	}

	return new Promise(function (resolve, reject) {
		connect.api.connection.request(json).then(function (res) {
			resolve(res)
		}).catch(function (err) {
			reject(err)
		})
	})
}

ChainsqlAPI.prototype.stopDump = function (owner, table) {
	var connect = this.connect
	var json = {
		command: "t_dumpstop",
		tx_json: [owner, table]
	}

	return new Promise(function (resolve, reject) {
		connect.api.connection.request(json).then(function (res) {
			resolve(res)
		}).catch(function (err) {
			reject(err)
		})
	})
}

ChainsqlAPI.prototype.dumpPosition = function name(owner, table) {
	var connect = this.connect
	var json = {
		command: "t_dumpposition",
		tx_json: [owner, table]
	}

	return new Promise(function (resolve, reject) {
		connect.api.connection.request(json).then(function (res) {
			resolve(res)
		}).catch(function (err) {
			reject(err)
		})
	})
}

ChainsqlAPI.prototype.checkAdminAuth = function () {
	var connect = this.connect
	var json = {
		id: 2,
		command: "peers"
	}

	return new Promise(function (resolve, reject) {
		connect.api.connection.request(json).then(function (res) {
			resolve(res)
		}).catch(function (err) {
			reject(err)
		})
	})
}

ChainsqlAPI.prototype.prepareJson = function(){
	let that = this;
	var payment = that.payment;
	switch (payment.OpType) {
		case opType['t_create']:

			if (payment.Confidential) {
				var token = generateToken(that.connect.secret);
				var symKey = decodeToken(that, token);
				if (that.connect.secret === "gmAlg") {
					payment.Raw = crypto.symEncrypt(symKey, payment.Raw, "gmAlg").toUpperCase();
				} else {
					payment.Raw = crypto.symEncrypt(symKey, payment.Raw).toUpperCase();
				}

				payment.Token = token.toUpperCase();
			} else {
				payment.Raw = convertStringToHex(payment.raw);
			}

			if (payment.OperationRule) {
				payment.OperationRule = convertStringToHex(JSON.stringify(payment.OperationRule));
			}

			payment.Tables[0].Table.TableName = convertStringToHex(payment.Tables[0].Table.TableName)
			break;

		case opType['t_recreate']:

			payment.Tables[0].Table.TableName = convertStringToHex(payment.Tables[0].Table.TableName)
			break
		case opType['t_drop']:

			payment.Tables[0].Table.TableName = convertStringToHex(payment.Tables[0].Table.TableName)
			break

		case opType['t_rename']:

			payment.Tables[0].Table.TableName = convertStringToHex(payment.Tables[0].Table.TableName)
			payment.Tables[0].Table.TableNewName = convertStringToHex(payment.Tables[0].Table.TableNewName)
			break
		case opType['t_grant']:

			payment.Tables[0].Table.TableName = convertStringToHex(payment.Tables[0].Table.TableName)
			payment.Raw = convertStringToHex(JSON.stringify(payment.Raw))
			break

		default:
			break;
	}
     
	return new Promise((resolve, reject) => {
		if (that.payment.opType === opType['t_grant']) {
			handleGrantPayment(that).then(() => {
				that.api.prepareTable(that, that.payment, resolve, reject);
			}).catch(error => {
				reject(error);
			});
		} else {
			that.api.prepareTable(that, that.payment, resolve, reject);
		}
	})
}

function callback(data, callback) {

}

module.exports = ChainsqlAPI;
