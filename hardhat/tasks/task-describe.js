const { task } = require('hardhat/config');
const { gray, green } = require('chalk');

const describeSources = require('../util/describeSources');

task('describe').setAction(async (taskArguments, hre) => {
	await hre.run('compile', taskArguments);

	console.log(gray('Processing Solidity sources and output ASTs...'));
	const descriptions = await describeSources({ hre });
	console.log(green(`Done describing ${Object.keys(descriptions).length} sources 💯`));
});
