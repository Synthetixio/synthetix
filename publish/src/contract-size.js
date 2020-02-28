'use strict';

const glob = require('glob');
const path = require('path');

function formatBytes(bytes, decimals) {
	if (bytes === 0) return '0 Bytes';
	var k = 1024;
	var dm = decimals <= 0 ? 0 : decimals || 2;
	var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	var i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function hexToBytes(hex) {
	if (hex.substr(0, 2) === '0x') hex = hex.slice(2);

	for (var bytes = [], c = 0; c < hex.length; c += 2) {
		bytes.push(parseInt(hex.substr(c, 2), 16));
	}

	return bytes;
}

module.exports = {
	sizeOfFile({ filePath }) {
		// Max contract size as defined in EIP-170
		// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-170.md
		const max = 0x6000;
		const decimalsToDisplay = 2;

		const { evm } = require(filePath);
		const { length } = hexToBytes(evm.bytecode.object);

		return {
			file: path.basename(filePath, '.json'),
			length,
			bytes: formatBytes(length, decimalsToDisplay),
			pcent: `${((length / max) * 100).toFixed(decimalsToDisplay)}%`,
		};
	},
	sizeOfAllInPath({ compiledPath }) {
		return new Promise((resolve, reject) => {
			glob(path.join(compiledPath, '*.json'), (err, files) => {
				if (err) {
					return reject(err);
				}

				const contracts = [];

				for (const file of files) {
					contracts.push(module.exports.sizeOfFile({ filePath: file }));
				}

				contracts.sort((left, right) => right.length - left.length);

				resolve(contracts);
			});
		});
	},
};
