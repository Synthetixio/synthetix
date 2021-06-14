const { bootstrapL1 } = require('../utils/bootstrap');
const { getLocalPrivateKey } = require('../../test-utils/wallets');

const {
	constants: { OVM_GAS_PRICE_GWEI },
} = require('../../..');

const commands = {
	nominate: require('../../../publish/src/commands/nominate').nominate,
};

describe.only('Owned integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	let user1, user2;

	describe('nomination functionality', () => {
		before('identify users', async () => {
			user1 = ctx.users.someUser;
			user2 = ctx.users.otherUser;
		});

		function _applicableContracts({ ctx }) {
			return Object.entries(ctx.contracts)
				.filter(([name, contract]) => !['WETH'].includes(name))
				.filter(([name, contract]) => contract.functions.nominatedOwner)
				.map(([name, contract]) => name);
		}

		async function _nominate({ ctx, address }) {
			const privateKey = getLocalPrivateKey({ index: 0 });

			await commands.nominate({
				network: 'local',
				privateKey,
				yes: true,
				newOwner: address,
				contracts: _applicableContracts({ ctx }),
				useFork: ctx.useFork,
				gasPrice: ctx.useOvm ? OVM_GAS_PRICE_GWEI : '1',
				gasLimit: ctx.useOvm ? undefined : '8000000',
				useOvm: ctx.useOvm,
				providerUrl: ctx.provider.connection.url,
			});
		}

		async function _verify({ ctx, address }) {
			const contractNames = _applicableContracts({ ctx });
			for (const name of contractNames) {
				const contract = ctx.contracts[name];

				if (contract.functions.nominatedOwner) {
					const nominated = await contract.nominatedOwner();
					assert.equal(nominated, address);
				}
			}
		}

		describe('when user1 is nominated', () => {
			before('nominate user1', async () => {
				await _nominate({ ctx, address: user1.address });
			});

			it('shows that user1 is nominated', async () => {
				await _verify({ ctx, address: user1.address });
			});

			describe('when user2 is nominated', () => {
				before('nominate user2', async () => {
					await _nominate({ ctx, address: user2.address });
				});

				it('shows that user2 is nominated', async () => {
					await _verify({ ctx, address: user2.address });
				});
			});
		});
	});
});
