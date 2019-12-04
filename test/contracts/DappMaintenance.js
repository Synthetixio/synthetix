const DappMaintenance = artifacts.require('DappMaintenance');

contract.only('DappMaintenance', async accounts => {
	let dappMaintenance;

	beforeEach(async () => {
		dappMaintenance = await DappMaintenance.deployed();
	});

	const [deployerAccount, owner, address1] = accounts;

	it('should set dapp maintenance for all if owner', async () => {
		const isMaintenanceOn = true;
		assert.isFalse(await dappMaintenance.isPausedMintr());
		assert.isFalse(await dappMaintenance.isPausedSX());
		const transaction = await dappMaintenance.setMaintenanceModeAll(isMaintenanceOn, {
			from: owner,
		});
		assert.eventsEqual(
			transaction,
			'MintrMaintenance',
			{
				isPaused: isMaintenanceOn,
			},
			'SXMaintenance',
			{
				isPaused: isMaintenanceOn,
			}
		);
		assert.isTrue(await dappMaintenance.isPausedMintr());
		assert.isTrue(await dappMaintenance.isPausedSX());
	});

	it('should not set dapp maintenance for all if not owner', async () => {
		const isMaintenanceOn = true;
		assert.isFalse(await dappMaintenance.isPausedMintr());
		assert.isFalse(await dappMaintenance.isPausedSX());
		await assert.revert(dappMaintenance.setMaintenanceModeAll(isMaintenanceOn, { from: address1 }));
	});

	it('should set dapp maintenance for Mintr if owner', async () => {
		const isMaintenanceOn = true;
		assert.isFalse(await dappMaintenance.isPausedMintr());
		const transaction = await dappMaintenance.setMaintenanceModeMintr(isMaintenanceOn, {
			from: owner,
		});
		assert.eventEqual(transaction, 'MintrMaintenance', {
			isPaused: isMaintenanceOn,
		});
		assert.isTrue(await dappMaintenance.isPausedMintr());
	});

	it('should not set dapp maintenance for Mintr if not owner', async () => {
		const isMaintenanceOn = true;
		assert.isFalse(await dappMaintenance.isPausedMintr());
		await assert.revert(
			dappMaintenance.setMaintenanceModeMintr(isMaintenanceOn, { from: address1 })
		);
	});

	it('should set dapp maintenance for SynthetixExchange if owner', async () => {
		const isMaintenanceOn = true;
		assert.isFalse(await dappMaintenance.isPausedSX());
		const transaction = await dappMaintenance.setMaintenanceModeSX(isMaintenanceOn, {
			from: owner,
		});
		assert.eventEqual(transaction, 'SXMaintenance', {
			isPaused: isMaintenanceOn,
		});
		assert.isTrue(await dappMaintenance.isPausedSX());
	});

	it('should not set dapp maintenance for SynthetixExchange if not owner', async () => {
		const isMaintenanceOn = true;
		assert.isFalse(await dappMaintenance.isPausedSX());
		await assert.revert(dappMaintenance.setMaintenanceModeSX(isMaintenanceOn, { from: address1 }));
	});
});
