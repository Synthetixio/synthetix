const { contract } = require('@nomiclabs/buidler');
const { getUsers } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('../contracts/common');
const { toUnit, fastForward } = require('../utils')();
const { toBytes32 } = require('../..');
const {
	detectNetworkName,
	connectContracts,
	getEther,
	getsUSD,
	exchangeSynths,
	readSetting,
} = require('./utils');

contract('Synthetix (prod tests)', accounts => {
	const [, user] = accounts;

	let owner;

	let network;

	let Synthetix, SynthetixState, AddressResolver, SystemSettings;

	let exchangeLogs;

	before('prepare', async () => {
		network = await detectNetworkName();

		({ Synthetix, SynthetixState, AddressResolver, SystemSettings } = await connectContracts({
			network,
			requests: [
				{ contractName: 'Synthetix' },
				{ contractName: 'SynthetixState' },
				{ contractName: 'AddressResolver' },
				{ contractName: 'SystemSettings' },
				{ contractName: 'ProxyERC20', abiName: 'Synthetix' },
			],
		}));

		// Skip any possibly active wwaiting periods.
		await fastForward(await readSetting({ network, setting: 'waitingPeriodSecs' }));

		[owner] = getUsers({ network }).map(user => user.address);

		await getEther({
			amount: toUnit('10'),
			account: owner,
			fromAccount: accounts[7],
			network,
		});
		await getsUSD({ amount: toUnit('1000'), account: user, fromAccount: owner, network });
	});

	it('has the expected resolver set', async () => {
		assert.equal(await Synthetix.resolver(), AddressResolver.address);
	});

	it('has the expected owner set', async () => {
		assert.equal(await Synthetix.owner(), owner);
	});

	it('does not report any rate to be stale or invalid', async () => {
		assert.isFalse(await Synthetix.anySynthOrSNXRateIsInvalid());
	});

	it('reports matching totalIssuedSynths and debtLedger', async () => {
		const totalIssuedSynths = await Synthetix.totalIssuedSynths(toBytes32('sUSD'));
		const debtLedgerLength = await SynthetixState.debtLedgerLength();

		assert.isFalse(debtLedgerLength > 0 && totalIssuedSynths === 0);
	});
});
