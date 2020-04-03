const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5');
usePlugin('solidity-coverage');

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
};
