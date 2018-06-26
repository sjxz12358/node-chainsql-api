"use strict";

const ChainsqlAPI = require('../src/index').ChainsqlAPI;
const chainsql = new ChainsqlAPI();

const user = {
	secret: "xnoPBzXtMeMyMHUVTgbuqAfg1SUTb",
	address: "zHb9CJAWyB4zj91VRWn96DkukG4bwdtyTh"
};
const abi = '[{"constant":false,"inputs":[],"name":"return2int","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"returnMixType","outputs":[{"name":"","type":"uint256"},{"name":"","type":"string"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"returnString","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"getTxOrigin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"a","type":"uint256"}],"name":"multiply","outputs":[{"name":"d","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"getMem","outputs":[{"name":"mem","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[],"payable":true,"stateMutability":"payable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"name":"number","type":"uint256"},{"indexed":false,"name":"result","type":"uint256"}],"name":"multiplylog","type":"event"}]';
const contractAddr = "zNecALSS6cnGeCLUqY9sL4j7qPVuBZGsN3";

main();

async function main(){
    await chainsql.connect("ws://127.0.0.1:5215");

    chainsql.as(user);

    const myContract = chainsql.contract(JSON.parse(abi), contractAddr);
    const inputData = "645c9ac8";
    myContract.localCall(inputData).submit(function(err, result){
        console.log(err);
        console.log(result);
    })
}