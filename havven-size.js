const havven = require('./build/contracts/Havven.json');

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

console.log('Max: ', formatBytes(24576));
console.log('Current: ', formatBytes(hexToBytes(havven.bytecode).length, 10));
