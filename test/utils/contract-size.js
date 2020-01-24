const glob = require('glob');
const path = require('path');
const { table } = require('table');

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

// Max contract size as defined in EIP-170
// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-170.md
const max = 0x6000;
const decimalsToDisplay = 2;

let tableData = [['Contract', 'Size', 'Percent of Limit']];

glob(path.join(__dirname, '..', '..', 'build/compiled/*.json'), (err, files) => {
	if (err) {
		console.log(err);
		process.exit(1);
	}

	const contracts = [];

	for (const file of files) {
		const { evm } = require(file);
		const { length } = hexToBytes(evm.bytecode.object);

		contracts.push({ file, length });
	}

	contracts.sort((left, right) => right.length - left.length);

	tableData = tableData.concat(
		contracts.map(({ file, length }) => [
			path.basename(file, '.json'),
			formatBytes(length, decimalsToDisplay),
			`${((length / max) * 100).toFixed(decimalsToDisplay)}%`,
		])
	);

	tableData.push(['Maximum Size', formatBytes(max, decimalsToDisplay), '']);

	console.log(table(tableData));
});
