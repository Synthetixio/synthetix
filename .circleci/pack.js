const fs = require('fs');
const path = require('path');
const mustache = require('mustache');

function main() {
	const data = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8');
	const template = fs.readFileSync(path.join(__dirname, 'config.template.yml'), 'utf-8');

	const partials = {
		...buildPartialsForDirectory(path.join(__dirname, 'src/commands')),
		...buildPartialsForDirectory(path.join(__dirname, 'src/jobs')),
		...buildPartialsForDirectory(path.join(__dirname, 'src/workflows')),
	};

	let output = mustache.render(template, data, partials);

	const emptyLinesRegex = /^\s*\n/gm;
	output = output.replace(emptyLinesRegex, '');

	fs.writeFileSync(path.join(__dirname, 'config.yml'), output);
}

function buildPartialsForDirectory(dirPath) {
	return {
		[path.basename(dirPath)]: buildPartialsArrayFromDirectory(dirPath),
		...readPartialsInDirectory(dirPath),
	}
}

function buildPartialsArrayFromDirectory(dirPath) {
	let array = '';

	fs.readdirSync(dirPath).forEach((file) => {
		array += `{{> ${file}}}\n\n`;
	});

	return array;
}

function readPartialsInDirectory(dirPath) {
	const files = {};

	fs.readdirSync(dirPath).forEach((file) => {
		const filePath = path.join(dirPath, file);
		const fileName = file.split('.')[0];

		files[file] = `${fileName}:\n${readFileWithIndentation(filePath, '  ')}`;
	});

	return files;
}

function readFileWithIndentation(filePath, indentationString) {
	let contents = fs.readFileSync(filePath, 'utf-8');

	contents = indentationString + contents.split('\n').join(`\n${indentationString}`);

	return contents;
}

main();
