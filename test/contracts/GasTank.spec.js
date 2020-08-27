const { contract, web3 } = require('@nomiclabs/buidler');

contract('GasTank', accounts => {
	const [, owner, accountOne] = accounts;

	let GasTank;
	before(async () => {
		[{ token: synth }] = await Promise.all([
			mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
		]);

		({ GasTank: gasTank } = await setupAllContracts({
			accounts,
			mocks: {
				SynthsUSD: synth,
			},
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
});
