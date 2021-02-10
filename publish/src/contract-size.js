'use strict';

const path = require('path');
const { table } = require('table');
const { gray, green, yellow, red, bgRed } = require('chalk');

function formatBytes(bytes, decimals) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const dm = decimals <= 0 ? 0 : decimals || 2;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function hexToBytes(hex) {
	if (hex.substr(0, 2) === '0x') hex = hex.slice(2);

	const bytes = [];
	for (let c = 0; c < hex.length; c += 2) {
		bytes.push(parseInt(hex.substr(c, 2), 16));
	}

	return bytes;
}

const pcentToColorFnc = ({ pcent, content }) => {
	const percentage = pcent.slice(0, -1);
	return percentage > 95
		? bgRed(content)
		: percentage > 85
		? red(content)
		: percentage > 60
		? yellow(content)
		: percentage > 25
		? content
		: gray(content);
};

const sizeChange = ({ prevSizeIfAny, length }) => {
	if (
		!prevSizeIfAny ||
		prevSizeIfAny.length === 0 ||
		length === 0 ||
		prevSizeIfAny.length === length
	) {
		return '';
	}
	const amount = length / prevSizeIfAny.length;
	const pcentChange = ((amount - 1) * 100).toFixed(2);
	return (pcentChange > 0 ? red : green)(`Change of ${pcentChange}%`);
};

const sizeOfContracts = ({ contractToObjectMap }) => {
	return Object.entries(contractToObjectMap)
		.map(([file, object]) => {
			// Max contract size as defined in EIP-170
			// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-170.md
			const max = 0x6000;
			const decimalsToDisplay = 2;

			const { length } = hexToBytes(object);

			return {
				file: path.basename(file, '.json'),
				length,
				bytes: formatBytes(length, decimalsToDisplay),
				pcent: `${((length / max) * 100).toFixed(decimalsToDisplay)}%`,
			};
		})
		.sort((left, right) => right.length - left.length);
};

module.exports = {
	logContractSizes({ previousSizes = [], contractToObjectMap }) {
		const config = {
			border: Object.entries({
				topBody: `─`,
				topJoin: `┬`,
				topLeft: `┌`,
				topRight: `┐`,

				bottomBody: `─`,
				bottomJoin: `┴`,
				bottomLeft: `└`,
				bottomRight: `┘`,

				bodyLeft: `│`,
				bodyRight: `│`,
				bodyJoin: `│`,

				joinBody: `─`,
				joinLeft: `├`,
				joinRight: `┤`,
				joinJoin: `┼`,
			}).reduce((memo, [key, val]) => {
				memo[key] = gray(val);
				return memo;
			}, {}),
		};
		const entries = sizeOfContracts({ contractToObjectMap });
		const tableData = [
			['Contract', 'Size', 'Percent of Limit', 'Increase'].map(x => yellow(x)),
		].concat(
			entries.reverse().map(({ file, length, pcent }) => {
				const prevSizeIfAny = previousSizes.find(candidate => candidate.file === file);

				return [file, length, pcent, sizeChange({ prevSizeIfAny, length })].map(content =>
					pcentToColorFnc({ pcent, content })
				);
			})
		);
		console.log(table(tableData, config));

		return entries;
	},
	sizeOfContracts,

	pcentToColorFnc,

	sizeChange,
};
