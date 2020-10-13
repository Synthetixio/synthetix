const { artifacts, contract } = require('@nomiclabs/buidler');
const { setupAllContracts } = require('./setup');

contract('SecondaryDeposit', accounts => {
	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			await setupAllContracts({
				accounts,
				contracts: [
					'Synthetix',
					'Issuer',
					'RewardEscrow',
					'SecondaryDeposit'
				]
			});
		});

		it('dummy', async () => {
		});
	});
});
