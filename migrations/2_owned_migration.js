var Owned = artifacts.require("./Owned.sol");

module.exports = function(deployer, network, accounts) {
  const deployerAcct = accounts[0];
  const owner = accounts[1];
  deployer.deploy(Owned, owner, { from: deployerAcct });
};
