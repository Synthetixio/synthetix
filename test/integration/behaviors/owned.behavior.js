const {
	acceptOwnership,
	nominateOwnership,
	verifyNomination,
	verifyOwnership,
} = require('../utils/owned');

function itCanManageOwnedContracts({ ctx }) {
	let owner, user;

	describe('nomination functionality', () => {
		before('identify users', async () => {
			owner = ctx.users.owner;
			user = ctx.users.someUser;
		});

		describe('when user is nominated to own all contracts', () => {
			before('nominate user', async () => {
				await nominateOwnership({ ctx, address: user.address, privateKey: owner.pk });
			});

			it('shows that user is nominated', async () => {
				await verifyNomination({ ctx, address: user.address });
			});

			describe('when user accepts ownership', () => {
				before('accept ownership', async () => {
					await acceptOwnership({ ctx, address: user.address, privateKey: user.pk });
				});

				it('shows that user is the new owner', async () => {
					await verifyOwnership({ ctx, address: user.address });
				});

				describe('when owner is nominated back', () => {
					before('nominate owner', async () => {
						await nominateOwnership({ ctx, address: owner.address, privateKey: user.pk });
					});

					it('shows that owner is nominated', async () => {
						await verifyNomination({ ctx, address: owner.address });
					});

					describe('when owner accepts ownership again', () => {
						before('accept ownership', async () => {
							await acceptOwnership({ ctx, address: owner.address, privateKey: owner.pk });
						});

						it('shows that owner is the new owner', async () => {
							await verifyOwnership({ ctx, address: owner.address });
						});
					});
				});
			});
		});
	});
}

module.exports = {
	itCanManageOwnedContracts,
};
