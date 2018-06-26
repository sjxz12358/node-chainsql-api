"use strict";

//var BaseContract = require('web3-eth-contract');
var abi = require('web3-eth-abi');
var utils = require('web3-utils');

const Contract = function Contract(connect, jsonInterface, address, options) {
    var _this = this;
    this.connect = connect;
    this.address = address;
    this.localCallInput = null;
    //BaseContract.apply(this, arguments);
    this.options = {};
    Object.defineProperty(this.options, 'jsonInterface', {
        set: function(value){
            _this.methods = {};
            _this.events = {};

            _this._jsonInterface = value.map(function(method) {
                var func,
                    funcName;

                if (method.name) {
                    funcName = utils._jsonInterfaceMethodToString(method);
                }
                // function
                if (method.type === 'function') {
                    method.signature = abi.encodeFunctionSignature(funcName);
                    // func = _this._createTxObject.bind({
                    //     method: method,
                    //     parent: _this
                    // });

                    // add method only if not one already exists
                    // if(!_this.methods[method.name]) {
                    //     _this.methods[method.name] = func;
                    // } else {
                    //     var cascadeFunc = _this._createTxObject.bind({
                    //         method: method,
                    //         parent: _this,
                    //         nextMethod: _this.methods[method.name]
                    //     });
                    //     _this.methods[method.name] = cascadeFunc;
                    // }

                    // definitely add the method based on its signature
                    //_this.methods[method.signature] = func;
                    _this.methods[method.signature] = method;

                    // add method by name
                    //_this.methods[funcName] = func;
                // event
                } else if (method.type === 'event') {
                    method.signature = abi.encodeEventSignature(funcName);
                    //var event = _this._on.bind(_this, method.signature);

                    // add method only if not already exists
                    // if(!_this.events[method.name] || _this.events[method.name].name === 'bound ')
                    //     _this.events[method.name] = event;

                    // definitely add the method based on its signature
                    //_this.events[method.signature] = event;
                    _this.events[method.signature] = method;

                    // add event by name
                    //_this.events[funcName] = event;
                }
                return method;
            });

            // add allEvents
            //_this.events.allEvents = _this._on.bind(_this, 'allevents');
            return _this._jsonInterface;
        },
        get: function(){
            return _this._jsonInterface;
        },
        enumerable: true
    });
    this.options.jsonInterface = jsonInterface;
};

Contract.prototype.localCall = function(inputData) {
    //if (!this.tab) throw new Error('you must appoint the table name');
    //if (this.exec !== '') throw new Error('Object can not hava function get');
    if (Object.prototype.toString.call(arguments[0]) === '[object Array]') {
      this.query = arguments[0];
    } else {
      this.query = Array.prototype.slice.call(arguments);
    }
    //get funcsign from inputData
    this.exec = 'c_localcall';
    this.localCallInput = inputData;
    this.curFuncSign = "0x" + inputData.slice(0,10);
    return this;
}

Contract.prototype.submit = function (callBack) {
    var that = this;
    //if (cb === undefined || cb === null) {
    //  cb = {expect:'send_success'};
    //}

    if (that.exec == 'c_localcall') {
        if (Object.prototype.toString.call(this.query[0]) !== '[object Array]') {
            this.query.unshift([]);
        };

        if ((typeof callBack) != 'function') {
            return new Promise(function (resolve, reject) {
                handleLocalCall(that, callBack, resolve, reject);
            });
        } else {
            handleLocalCall(that, callBack, null, null);
        }
    } else {
        //todo
    }
}  

function handleLocalCall(contractObj, object, resolve, reject) {
	var isFunction = false;
	if ((typeof object) === 'function') 
		isFunction = true
	
	var callBack = function(error, data) {
		if (isFunction) {
			object(error, data)
		} else {
			if (error) {
				resolve(error);
			} else {
				resolve(data);
			}
		}
	}
	
    var connect = contractObj.connect;
	//console.log('select \n\t', JSON.stringify(ChainSQL.query));
	connect.api.connection.request({
		command: 'c_localcall',
		tx_json: {
            Account : connect.address,
			ContractAddress : contractObj.address,
			ContractData : contractObj.localCallInput
		}
	}).then(function(data) {
		// if (data.status != 'success'){
		// 	callBack(new Error(data), null);
        // }
        //begin to decode return value,then get result and set to callBack
        //do some decode work
        const curFuncSign = contractObj.curFuncSign;
        const funcOutput = contractObj.methods[curFuncSign].outputs;
        var resultStr = "0x" + data.contract_local_call_result;
        var localcallResult = decodeMethodReturn(funcOutput, resultStr);
        callBack(null, localcallResult);
	}).catch(function(err) {
		callBack(err, null);
	})
}

/**
 * Decode method return values
 *
 * @method _decodeMethodReturn
 * @param {Array} outputs
 * @param {String} returnValues
 * @return {Object} decoded output return values
 */
var decodeMethodReturn = function (outputs, returnValues) {
    if (!returnValues) {
        return null;
    }

    returnValues = returnValues.length >= 2 ? returnValues.slice(2) : returnValues;
    var result = abi.decodeParameters(outputs, returnValues);

    if (result.__length__ === 1) {
        return result[0];
    } else {
        delete result.__length__;
        return result;
    }
};

module.exports = Contract;