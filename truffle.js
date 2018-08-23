const HDWalletProvider = require("truffle-hdwallet-provider");

const mnemonic = "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      provider: function() {
        return new HDWalletProvider(mnemonic, "http://127.0.0.1:8545/", 0, 10);
      },
      gas: 6000000,
      gasPrice: 20000000000,
    },
    ropsten: {
      network_id: '3',
      gas: 4500000,
      gasPrice: 10000000000,
    },
    mainnet: {
      network_id: '1',
      gas: 4500000,
      gasPrice: 10000000000,
    },
  },
  mocha: {
    useColors: true
  }
};
