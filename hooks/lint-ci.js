const fs = require('fs');
const CLIEngine = require('eslint').CLIEngine;

const argv = process.argv.slice(2);
const cli = new CLIEngine({
	fix: false,
	extensions: argv[2].split(','),
	useEslintrc: true,
});

console.log('Starting to lint..');

// Lint all files
const report = cli.executeOnFiles(argv[0]);

// get the default formatter
const consoleFormatter = cli.getFormatter();

console.log('Lint finished');

// output to console
console.log(consoleFormatter(report.results));

// Output to sarif format
const otherFormatter = cli.getFormatter('@microsoft/eslint-formatter-sarif/sarif.js');

console.log('Saving sarif report..');

fs.writeFile('lint-results.sarif', otherFormatter(report.results), 'utf8', () => {
	console.log('Sarif report saved');
	if (report.errorCount > 0) {
		console.log('Errors found, exiting..');
		process.exit(1);
	} else {
		console.log('No errors found');
		process.exit(0);
	}
});
