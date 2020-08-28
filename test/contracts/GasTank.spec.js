const { contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { setupAllContracts } = require('./setup');

contract('GasTank', accounts => {
	const [, owner, accountOne] = accounts;

	let gasTank, addressResolver;
	before(async () => {
		({ GasTank: gasTank, AddressResolver: addressResolver } = await setupAllContracts({
			accounts,
			contracts: [
				'GasTank',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'SystemSettings',
				'DelegateApprovals',
			],
		}));
	});

	describe('Basic parameters', () => {
		it('Parameters are set properly', async () => {
			assert.equal(await gasTank.owner(), owner);
			assert.equal(await gasTank.resolver(), addressResolver.address);
		});
	});
	describe('currentGasPrice', () => {});
});
