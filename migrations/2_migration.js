const Owned = artifacts.require("./Owned.sol");

const HavvenTokenState = artifacts.require("./TokenState.sol");
const HavvenProxy = artifacts.require("./Proxy.sol");

const NominTokenState = artifacts.require("./TokenState.sol");
const NominProxy = artifacts.require("./Proxy.sol");

const Havven = artifacts.require("./Havven.sol");
const HavvenEscrow = artifacts.require("./HavvenEscrow.sol");

const Nomin = artifacts.require("./Nomin.sol");

const IssuanceController = artifacts.require("./IssuanceController.sol");

const ZERO_ADDRS = "0x0000000000000000000000000000000000000000";

// Update values before deployment
const ethUSD = 274411589120931162910;
const havUSD = 116551110814936098;

const totalSupplyNomin = 1241510914838889387806256;


module.exports = function(deployer, network, accounts) {
  const deployerAcct = accounts[0];

  const owner = accounts[1];
  const fundsWallet = accounts[2];
  const oracle = accounts[3];

  let ownedContInst;

  let havTokenState;
  let havProxy;
  let havvContInst;

  let nominTokenState;
  let nominProxy;
  let nominContInst;

  let havvenEscrContInst;
  let issuanceContInst;

  // TODO Only deployed for testing purposes
  deployer.then(function () {
    return Owned.new(owner, { from: deployerAcct });
  }).then(function (instance) {
    ownedContInst = instance;
    return HavvenTokenState.new(owner, ZERO_ADDRS, { from: deployerAcct });
  }).then(function (instance) {
    havTokenState = instance;
    return HavvenProxy.new(owner, { from: deployerAcct });
  }).then(function (instance) {
    havProxy = instance;
    return Havven.new(havProxy.address, havTokenState.address, owner, oracle, havUSD, [], ZERO_ADDRS, { from: deployerAcct });
  }).then(function (instance) {
    havvContInst = instance;
    return NominTokenState.new(owner, ZERO_ADDRS, { from: deployerAcct });
  }).then(function (instance) {
    nominTokenState = instance;
    return NominProxy.new(owner, { from: deployerAcct });
  }).then(function (instance) {
    nominProxy = instance;
    return Nomin.new(nominProxy.address, nominTokenState.address, havvContInst.address, totalSupplyNomin, owner, { from: deployerAcct });
  }).then(function (instance) {
    nominContInst = instance;
    return HavvenEscrow.new(owner, havvContInst.address, { from: deployerAcct });
  }).then(function (instance) {
    havvenEscrContInst = instance;
    return IssuanceController.new(owner, fundsWallet, havvContInst.address, nominContInst.address, oracle, ethUSD, havUSD, { from: deployerAcct });
  }).then(function (instance) {
    issuanceContInst = instance;

    console.log(`ownedContInst addrs is ${ownedContInst.address}`);
    console.log(`havTokenState addrs is ${havTokenState.address}`);
    console.log(`havProxy addrs is ${havProxy.address}`);
    console.log(`havvContInst addrs is ${havvContInst.address}`);
    console.log(`nominTokenState addrs is ${nominTokenState.address}`);
    console.log(`nominProxy addrs is ${nominProxy.address}`);
    console.log(`nominContInst addrs is ${nominContInst.address}`);
    console.log(`havvenEscrContInst addrs is ${havvenEscrContInst.address}`);
    console.log(`issuanceContInst addrs is ${issuanceContInst.address}`);

  });

};
