const fs = require('fs');
const path = require('path');
const mustache = require('mustache');
const YamlValidator = require('yaml-validator');
const execa = require('execa');

async function main() {
	const template = fs.readFileSync(path.join(__dirname, 'config.template.yml'), 'utf-8');

	// Mustache lingo:
	// "partials" = snippets of code to be injected in a template

	// Builds an object like:
	/*
	  {
			"job-abc": "<job content>",
			"workflow-xyz": "<job content>",
			...
			"commands": "<generated list of all command file names>"
			"workflows": "<generated list of all workflow file names>"
			...
		}
		*/
	const partials = {
		...buildPartialsForDirectory(path.join(__dirname, 'src/commands')),
		...buildPartialsForDirectory(path.join(__dirname, 'src/jobs')),
		...buildPartialsForDirectory(path.join(__dirname, 'src/workflows')),
		...readPartialsInDirectory(path.join(__dirname, 'src/snippets'), false, false),
	};

	// Get rid of all commented lines before processing partials.
	const commentedLinesRegex = /^\s*#.*/gm;
	Object.keys(partials).map(
		key => (partials[key] = partials[key].replace(commentedLinesRegex, ''))
	);

	let output = mustache.render(template, {}, partials);

	const emptyLinesRegex = /^\s*\n/gm;
	output = output.replace(emptyLinesRegex, '');

	const outputPath = path.join(__dirname, 'config.yml');
	fs.writeFileSync(outputPath, output);

	// Run a yaml validator to make sure everything looks pretty
	const validator = new YamlValidator();
	validator.validate([outputPath]);

	// Also run circleci validation if circleci is in path
	try {
		await execa('circleci', ['config', 'validate']);
	} catch (error) {
		console.log(error.stderr);
	}
}

function buildPartialsForDirectory(dirPath) {
	return {
		[path.basename(dirPath)]: buildPartialsArrayFromDirectory(dirPath),
		...readPartialsInDirectory(dirPath),
	};
}

function buildPartialsArrayFromDirectory(dirPath) {
	let array = '';

	fs.readdirSync(dirPath).forEach(file => {
		array += `{{> ${file}}}\n\n`;
	});

	return array;
}

function readPartialsInDirectory(dirPath, includeName = true, indent = true) {
	const files = {};

	fs.readdirSync(dirPath).forEach(file => {
		const filePath = path.join(dirPath, file);
		const fileName = file.split('.')[0];

		const indentationString = indent ? '  ' : '';
		if (includeName) {
			files[file] = `${fileName}:\n${readFileWithIndentation(filePath, indentationString)}`;
		} else {
			files[file] = readFileWithIndentation(filePath, indentationString);
		}
	});

	return files;
}

function readFileWithIndentation(filePath, indentationString) {
	let contents = fs.readFileSync(filePath, 'utf-8');

	contents = indentationString + contents.split('\n').join(`\n${indentationString}`);

	return contents;
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
