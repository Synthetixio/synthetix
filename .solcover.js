module.exports = {
  skipFiles: ['test-helpers/PublicSafeDecimalMath.sol', 'test-helpers/PublicMath.sol'],
  client: require('ganache-cli'), // use ganache-cli version listed in dev deps
  providerOptions: {
    default_balance_ether: 10000000000000, // extra zero just in case (coverage consumes more gas)
    time: new Date("2019-03-06T00:00:00"),
  }
};
