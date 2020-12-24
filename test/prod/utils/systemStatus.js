const { connectContract } = require('./connectContract');
const { gray } = require('chalk');

async function resumeSystem({ network, deploymentPath, owner }) {
	const SystemStatus = await connectContract({
		network,
		deploymentPath,
		contractName: 'SystemStatus',
	});

	const isSuspended = (await SystemStatus.systemSuspension()).suspended;
	if (isSuspended) {
		console.log(gray(`    > Resuming system...`));
		await SystemStatus.resumeSystem({
			from: owner,
		});
	}
}

module.exports = {
	resumeSystem,
};
