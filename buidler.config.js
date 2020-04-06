const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5');
usePlugin('solidity-coverage');

const baseNetworkConfig = {
	allowUnlimitedContractSize: true,
	blockGasLimit: 0x1fffffffffffff,
	initialDate: '2019-03-06T00:00:00',
};
module.exports = {
	solc: {
		version: '0.4.25',
	},
	paths: {
		sources: './contracts',
		tests: './test/unit',
		artifacts: './build/artifacts',
		cache: './build/cache',
	},
	networks: {
		buidlerevm: baseNetworkConfig,
		coverage: Object.assign(
			{
				url: 'http://localhost:8545',
			},
			baseNetworkConfig
		),
	},
};
