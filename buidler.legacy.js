'use strict';

const fs = require('fs');
const path = require('path');
const { gray } = require('chalk');
const { task } = require('@nomiclabs/buidler/config');

const sourceFolder = './legacy/contracts';
const legacyArtifactsFolder = './build/artifacts-legacy';
const latestArtifactsFolder = './build/artifacts';

task('compile', 'compilation', async (taskArguments, bre, runSuper) => {
	await runSuper();

	const sourcePath = path.join(__dirname, sourceFolder);
	const legacyArtifactsPath = path.join(__dirname, legacyArtifactsFolder);
	const latestArtifactsPath = path.join(__dirname, latestArtifactsFolder);
	if (!fs.existsSync(latestArtifactsFolder)) {
		fs.mkdirSync(latestArtifactsFolder);
	}
	const sourceFiles = fs.readdirSync(sourcePath);

	// for all source files
	sourceFiles.forEach(srcFile => {
		const file = srcFile.split('.sol')[0];

		console.log(gray(`${file}: Copying legacy contract JSON to artifacts folder...`));
		fs.copyFileSync(
			path.join(legacyArtifactsPath, file + '.json'),
			path.join(latestArtifactsPath, file + '_Legacy.json')
		);
	});
});

module.exports = {
	solc: {
		version: '0.4.25',
	},
	paths: {
		sources: sourceFolder,
		artifacts: legacyArtifactsFolder,
		cache: './build/cache',
	},
};
