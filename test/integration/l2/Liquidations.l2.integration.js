const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanLiquidate } = require('../behaviors/liquidations.behavior');
const { ethers } = require('hardhat');

// Load Compiled
const path = require('path');
const {
	constants: { BUILD_FOLDER },
} = require('../../..');
const buildPath = path.join(__dirname, '..', '..', '..', `${BUILD_FOLDER}-ovm`);
const { loadCompiledFiles } = require('../../../publish/src/solidity');
const { compiled } = loadCompiledFiles({ buildPath });

describe('Liquidations (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	before(async () => {
		const {
			abi,
			evm: {
				bytecode: { object: bytecode },
			},
		} = compiled['MockAggregatorV2V3'];
		const MockAggregatorFactory = new ethers.ContractFactory(abi, bytecode, ctx.users.owner);
		const MockAggregator = await MockAggregatorFactory.deploy();
		ctx.contracts.MockAggregator = MockAggregator;
	});

	itCanLiquidate({ ctx });
});
