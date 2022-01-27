const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getSource, getTarget } = require('../../..');

function connectContracts({ ctx }) {
	const { useOvm } = ctx;
	const network = ctx.fork ? 'mainnet' : 'local';

	const allTargets = getTarget({ fs, path, network, useOvm });

	ctx.contracts = {};
	Object.entries(allTargets).map(([name, target]) => {
		ctx.contracts[name] = new ethers.Contract(
			getTarget({ fs, path, network, useOvm, contract: name }).address,
			getSource({ fs, path, network, useOvm, contract: target.source }).abi,
			ctx.provider
		);
	});

	_ensureWETH({ ctx });
}

function _ensureWETH({ ctx }) {
	if (!ctx.contracts.WETH) {
		if (ctx.useOvm) {
			ctx.contracts.WETH = new ethers.Contract(
				'0x4200000000000000000000000000000000000006',
				_loadCustomAbi({ name: 'WETH' }),
				ctx.provider
			);
		} else if (ctx.fork) {
			ctx.contracts.WETH = new ethers.Contract(
				'0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH on mainnet L1
				_loadCustomAbi({ name: 'WETH' }),
				ctx.provider
			);
		}
	}
}

function _loadCustomAbi({ name }) {
	return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/WETH.json'), 'utf8'));
}

module.exports = {
	connectContracts,
};
