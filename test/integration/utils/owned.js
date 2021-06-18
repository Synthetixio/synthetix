const { assert } = require('../../contracts/common');
const commands = {
	nominate: require('../../../publish/src/commands/nominate').nominate,
	owner: require('../../../publish/src/commands/owner').owner,
};
const {
	constants: { OVM_GAS_PRICE_GWEI },
} = require('../../..');

async function nominateOwnership({ ctx, address, privateKey }) {
	await commands.nominate({
		network: 'local',
		privateKey,
		yes: true,
		newOwner: address,
		contracts: _ownableContractsSample({ ctx }),
		useFork: ctx.useFork,
		gasPrice: ctx.useOvm ? OVM_GAS_PRICE_GWEI : '1',
		gasLimit: ctx.useOvm ? undefined : '8000000',
		useOvm: ctx.useOvm,
		providerUrl: ctx.provider.connection.url,
	});
}

async function verifyNomination({ ctx, address }) {
	const contractNames = _ownableContractsSample({ ctx });

	for (const name of contractNames) {
		const contract = ctx.contracts[name];

		assert.equal(
			await contract.nominatedOwner(),
			address,
			`${address} is not nominated to own ${name}`
		);
	}
}

async function acceptOwnership({ ctx, address, privateKey }) {
	await commands.owner({
		network: 'local',
		privateKey,
		yes: true,
		newOwner: address,
		useFork: ctx.useFork,
		gasPrice: ctx.useOvm ? OVM_GAS_PRICE_GWEI : '1',
		gasLimit: ctx.useOvm ? undefined : '200000',
		useOvm: ctx.useOvm,
		providerUrl: ctx.provider.connection.url,
	});
}

async function verifyOwnership({ ctx, address }) {
	const contractNames = _ownableContractsSample({ ctx });

	for (const name of contractNames) {
		const contract = ctx.contracts[name];

		assert.equal(await contract.owner(), address, `${address} does not own ${name}`);
	}
}

function _ownableContractsSample({ ctx, sampleSize = 3 }) {
	return Object.entries(ctx.contracts)
		.filter(([name, contract]) => !['WETH'].includes(name))
		.filter(([name, contract]) => contract.functions.nominatedOwner)
		.map(([name, contract]) => name)
		.slice(-sampleSize);
}

module.exports = {
	nominateOwnership,
	acceptOwnership,
	verifyOwnership,
	verifyNomination,
};
