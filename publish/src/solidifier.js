'use strict';

const nodePath = require('path');
const parser = require('solidity-parser-antlr');

const getImportsInFile = contents => {
	const ast = parser.parse(contents, { tolerant: true, loc: true });
	const imports = [];

	// Search for import directives
	parser.visit(ast, {
		ImportDirective: node => imports.push(node),
	});

	return imports;
};

const getPragmasInFile = contents => {
	const ast = parser.parse(contents, { tolerant: true, loc: true });
	const pragmas = [];

	// Search for import directives
	parser.visit(ast, {
		PragmaDirective: node => pragmas.push(node),
	});

	return pragmas;
};

const getFileContents = fileObject =>
	new Promise((resolve, reject) => {
		if (fileObject.textContents) {
			return resolve(fileObject.textContents);
		} else {
			const reader = new window.FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error);

			reader.readAsText(fileObject);
		}
	});

const removeExcessWhitespace = contents => {
	const lines = contents.split(/\r?\n/);
	const resultingLines = [];

	let whitespaceLineCounter = 0;
	const whitespacePattern = /^[\s\r\n]*$/;
	for (const line of lines) {
		if (whitespacePattern.test(line)) {
			whitespaceLineCounter++;
		} else {
			whitespaceLineCounter = 0;
		}

		if (whitespaceLineCounter <= 2) {
			resultingLines.push(line);
		}
	}

	return resultingLines.join('\n');
};

// Loc is "location" as defined by solidity-parser-antlr.
const removeByLoc = (contents, loc) => {
	const lines = contents.split(/\r?\n/);
	const startLine = loc.start.line - 1;
	const endLine = loc.end.line - 1;

	if (startLine === endLine) {
		const line = lines[startLine];

		const left = line.substring(0, loc.start.column);
		const right = line.substring(loc.end.column + 1);

		lines[startLine] = left + right;
	} else {
		lines[startLine] = lines[startLine].substring(0, loc.start.column);
		lines[endLine] = lines[endLine].substring(loc.end.column);

		for (let i = startLine + 1; i < endLine; i++) {
			lines[i] = '';
		}
	}

	return lines.join('\n');
};

const resolvePath = (workingDirectory, relativePath) => {
	const base = workingDirectory ? workingDirectory.split('/') : [];

	// Ok, now walk through the relative path, ignoring '.' and construct a new path.
	for (const chunk of relativePath.split('/')) {
		if (chunk === '..') {
			base.pop();
		} else if (chunk !== '.') {
			base.push(chunk);
		}
	}

	return base.join('/');
};

// Depth first visit, outputting the leaves first.
const visit = async ({ path, workingDirectory, files, visited, insertFileNames }) => {
	if (visited.has(path)) return '';
	visited.add(path);

	if (!files[path])
		throw new Error(
			`Unable to find contract at path '${path}'. Most likely you need to start from a different base directory when you drag your contracts in, or it is also possible that your contracts don't compile.`
		);
	let contents = await getFileContents(files[path]);

	// Fix import path so they'll always be relative
	const relativeImportPath = nodePath.join(path, '..');
	const importStatements = getImportsInFile(contents).map(x => {
		if (x.path[0] === '.') {
			return Object.assign(
				{},
				{ ...x },
				{
					path: nodePath.join(relativeImportPath, x.path),
				}
			);
		}
		return x;
	});

	// Remove the import statements first so the line numbers match up.
	for (const importStatement of importStatements) {
		contents = removeByLoc(contents, importStatement.loc);
	}

	// Now flatten and jam onto the top of the file.
	let contentsToAppend = '';

	for (const importStatement of importStatements) {
		contentsToAppend += `

${await visit({
	path: resolvePath(workingDirectory, importStatement.path),
	workingDirectory,
	files,
	visited,
	insertFileNames,
})}`;
	}

	let result = contentsToAppend;

	if (insertFileNames) {
		result += `

////////////////// ${path} //////////////////`;
	}

	result += `

${contents}`;

	return result;
};

module.exports = {
	flatten: async ({ files, path, insertFileNames, stripExcessWhitespace }) => {
		const visited = new Set();

		let content = await visit({ path, files, visited, insertFileNames });

		// Now we need to strip all but the first pragma statement.
		const pragmas = getPragmasInFile(content);

		// Ignore the first one.
		pragmas.shift();

		// Strip the rest
		for (const pragma of pragmas) {
			content = removeByLoc(content, pragma.loc);
		}

		if (stripExcessWhitespace) {
			content = removeExcessWhitespace(content);
		}

		return `/* ===============================================
* Flattened with Solidifier by Coinage
* 
* https://solidifier.coina.ge
* ===============================================
*/
${content}
`;
	},
};
