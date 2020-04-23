'use strict';

const fs = require('fs');
const path = require('path');
const { gray } = require('chalk');
const { task } = require('@nomiclabs/buidler/config');

const sourceFolder = './contracts';
const legacyArtifactsFolder = '../build/legacy/artifacts';
const latestArtifactsFolder = '../build/artifacts';

task('compile', 'compilation step', async (taskArguments, bre, runSuper) => {
	await runSuper();

	const sourcePath = path.join(__dirname, sourceFolder);
	const legacyArtifactsPath = path.join(__dirname, legacyArtifactsFolder);
	const latestArtifactsPath = path.join(__dirname, latestArtifactsFolder);

	if (!fs.existsSync(latestArtifactsPath)) {
		fs.mkdirSync(latestArtifactsPath);
	}
	const sourceFiles = fs.readdirSync(sourcePath);

	// for all source files
	sourceFiles.forEach(srcFile => {
		const file = srcFile.split('.sol')[0];

		let legacyCompiledFile = path.join(legacyArtifactsPath, file + '.json');

		// If the legacy file has a different contract name, use the one in the mapping
		if (!fs.existsSync(legacyCompiledFile)) {
			const legacyNameMapping = {
				SynthetixEscrow: 'HavvenEscrow',
			};

			legacyCompiledFile = path.join(legacyArtifactsPath, legacyNameMapping[file] + '.json');
		}

		if (process.env.DEBUG) {
			console.log(gray(`${file}: Copying legacy contract JSON to artifacts folder...`));
		}

		fs.copyFileSync(legacyCompiledFile, path.join(latestArtifactsPath, file + '_Legacy.json'));
	});
});

module.exports = {
	solc: {
		version: '0.4.25',
	},
	paths: {
		sources: sourceFolder,
		artifacts: legacyArtifactsFolder,
		cache: '../build/legacy/cache',
	},
};
