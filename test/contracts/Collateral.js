'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const Collateral = artifacts.require(`Collateral`);

contract('Collateral', async accounts => {
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
