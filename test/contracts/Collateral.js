'use strict';

const { artifacts, contract } = require('hardhat');

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

let Collateral;

contract('Collateral @ovm-skip', async accounts => {
	before(async () => {
		Collateral = artifacts.require(`Collateral`);
	});

	it('should ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: Collateral.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'Proxy'],
			expected: [
				'addRewardsContracts',
				'addSynths',
				'setCanOpenLoans',
				'setInteractionDelay',
				'setIssueFeeRate',
				'setManager',
				'setMinCratio',
			],
		});
	});
});
