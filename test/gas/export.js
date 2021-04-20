const fs = require('fs');

function main() {
	const data = JSON.parse(fs.readFileSync('test/gas/measurements.json'));

	let str = '';
	Object.keys(data).map(numSynthsKey => {
		const entry = data[numSynthsKey];

		const properties = Object.keys(entry);
		if (str === '') {
			str += `synths,${properties.join(',')}\n`;
		}
		str += `${numSynthsKey.split('_')[0]},${properties.map(prop => Math.ceil(entry[prop].avg))}\n`;
	});

	fs.writeFileSync('test/gas/measurements.csv', str);
}

main();
