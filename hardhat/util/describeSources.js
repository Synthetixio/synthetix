const fs = require('fs');
const path = require('path');

async function describeSources({ hre }) {
	const { asts, sources } = await _collectSourcesAndAsts({ hre });

	const descriptions = _processFiles({ asts, sources });

	await _writeOutput({ hre, descriptions });

	return descriptions;
}

// ------------------------------
// Collecting inputs and outputs
// ------------------------------

async function _collectSourcesAndAsts({ hre }) {
	// Get a list of all output .dbg.json file paths
	const artifactPaths = await hre.artifacts.getArtifactPaths();
	const dbgPaths = artifactPaths.map(artifactPath => artifactPath.replace('json', 'dbg.json'));

	// Sweep .dbg.json files and collect all asts
	const asts = [];
	const sources = [];
	for (const dbgPath of dbgPaths) {
		// Locate the associated build info file, which contains the ast
		const dbg = JSON.parse(fs.readFileSync(dbgPath, 'utf8'));
		const buildInfoFileName = path.basename(dbg.buildInfo);
		const buildInfoPath = path.resolve(hre.config.paths.artifacts, 'build-info', buildInfoFileName);
		const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));

		// Build the contract key to find the associated ast from the path
		// i.e. 'contracts/Synthetix'
		const reducedPath = dbgPath.replace(`${hre.config.paths.artifacts}/`, '');
		const pathComponents = reducedPath.split('/');

		// Only include the ones under 'contracts/'
		if (pathComponents[0] !== 'contracts') {
			continue;
		}

		// Exclude test-helpers
		if (pathComponents.some(component => component === 'test-helpers')) {
			continue;
		}

		const contractKey = pathComponents.slice(0, pathComponents.length - 1).join('/');
		asts.push(buildInfo.output.sources[contractKey].ast);
		sources.push(buildInfo.input.sources[contractKey].content);
	}

	return { sources, asts };
}

// ----------------
// Writting output
// ----------------

async function _writeOutput({ hre, descriptions }) {
	const artifactPaths = await hre.config.paths.artifacts;

	const outputFolderPath = path.resolve(artifactPaths, '../', 'ast');
	if (!fs.existsSync(outputFolderPath)) {
		fs.mkdirSync(outputFolderPath);
	}

	const outputFilePath = path.resolve(outputFolderPath, 'asts.json');
	const content = JSON.stringify(descriptions, null, 2);
	fs.writeFileSync(outputFilePath, content);
}

// --------------------
// AST node processing
// --------------------

function _processFiles({ asts, sources }) {
	const descriptions = {};
	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		const ast = asts[i];

		descriptions[ast.absolutePath] = _processFile({ source, ast });
	}

	return descriptions;
}

function _processFile({ source, ast }) {
	const { contracts, libraries, interfaces } = _processContracts({ source, ast });

	return {
		imports: _processImports({ ast }),
		contracts,
		libraries,
		interfaces,
	};
}

function _processImports({ ast }) {
	const imports = [];

	for (const node of ast.nodes) {
		if (node.nodeType === 'ImportDirective') {
			imports.push(node.file);
		}
	}

	return imports;
}

function _processContracts({ source, ast }) {
	const contracts = {};
	const libraries = {};
	const interfaces = {};

	for (const node of ast.nodes) {
		if (node.nodeType === 'ContractDefinition') {
			let target = contracts;
			if (node.contractKind === 'library') {
				target = libraries;
			} else if (node.contractKind === 'interface') {
				target = interfaces;
			}

			target[node.name] = {
				functions: _processFunctions({
					source,
					nodes: _filterNodes({ node, type: 'FunctionDefinition' }),
				}),
				events: _processEvents({ source, nodes: _filterNodes({ node, type: 'EventDefinition' }) }),
				variables: _processVariables({
					source,
					nodes: _filterNodes({ node, type: 'VariableDeclaration' }),
				}),
				modifiers: _processModifiers({
					source,
					nodes: _filterNodes({ node, type: 'ModifierDefinition' }),
				}),
				structs: _processStructs({
					source,
					nodes: _filterNodes({ node, type: 'StructDefinition' }),
				}),
				inherits: node.baseContracts.map(contract => contract.baseName.name),
			};
		}
	}

	return { contracts, libraries, interfaces };
}

function _processStructs({ source, nodes }) {
	const structs = [];

	for (const node of nodes) {
		structs.push({
			name: node.name,
			members: node.members.map(member => {
				return {
					name: member.name,
					type: member.typeDescriptions.typeString,
				};
			}),
			lineNumber: _getLineNumber({ source, node }),
		});
	}

	return structs;
}

function _processFunctions({ source, nodes }) {
	const functions = [];

	for (const node of nodes) {
		const isConstructor = node.name.length === 0;
		const name = isConstructor ? 'constructor' : node.name;
		const stateMutability = node.stateMutability === 'nonpayable' ? '' : `${node.stateMutability}`;

		functions.push({
			name,
			signature: `${name}${_processParameterList({
				parameters: node.parameters.parameters,
			})}${stateMutability ? ' ' + stateMutability : ''}`,
			returns: _processParameterList({ parameters: node.returnParameters.parameters }),
			modifiers: isConstructor ? [] : node.modifiers.map(modifier => modifier.modifierName.name),
			visibility: node.visibility,
			lineNumber: _getLineNumber({ source, node }),
			requires: _processRequires({ source, body: node.body }),
			events: _processEmits({ body: node.body }),
			stateMutability,
		});
	}

	return functions;
}

function _processEmits({ body }) {
	const emits = [];

	if (!body) {
		return emits;
	}

	for (const node of body.statements) {
		if (node.nodeType === 'EmitStatement') {
			emits.push(`${node.eventCall.expression.name}`);
		}
	}

	return emits;
}

function _processEvents({ source, nodes }) {
	const events = [];

	for (const node of nodes) {
		events.push({
			name: node.name,
			parameters: _processParameterList({ parameters: node.parameters.parameters }),
			lineNumber: _getLineNumber({ source, node }),
		});
	}

	return events;
}

function _processVariables({ source, nodes }) {
	const variables = [];

	for (const node of nodes) {
		variables.push({
			name: node.name,
			type: node.typeDescriptions.typeString,
			visibility: node.visibility,
			lineNumber: _getLineNumber({ source, node }),
		});
	}

	return variables;
}

function _processModifiers({ source, nodes }) {
	const modifiers = [];

	for (const node of nodes) {
		const parameters = _processParameterList({ parameters: node.parameters.parameters });
		modifiers.push({
			name: node.name,
			signature: `${node.name}${parameters}`,
			visibility: node.visibility,
			parameters,
			lineNumber: _getLineNumber({ source, node }),
		});
	}

	return modifiers;
}

function _processParameterList({ parameters }) {
	let str = '(';

	const processed = [];
	for (const parameter of parameters) {
		if (parameter.name.length > 0) {
			processed.push(`${parameter.typeDescriptions.typeString} ${parameter.name}`);
		} else {
			processed.push(parameter.typeDescriptions.typeString);
		}
	}

	str += processed.join(', ');

	str += ')';

	return str;
}

function _processRequires({ source, body }) {
	const requires = [];

	if (!body) {
		return requires;
	}

	for (const node of body.statements) {
		if (node.nodeType === 'ExpressionStatement' || node.nodeType === 'FunctionCall') {
			const expression = node.expression.expression;

			if (expression && expression.name && expression.name.toLowerCase().includes('require')) {
				let name = expression.name;

				if (expression.name === 'require') {
					const lastArgument = expression.argumentTypes.pop();
					const revertReason = lastArgument.typeString
						.replace('literal_string ', '')
						.replace(/\\/g, '')
						.replace(/"/g, '');

					name = `require(..., "${revertReason}")`;
				}

				requires.push({
					name,
					lineNumber: _getLineNumber({ source, node }),
				});
			}
		}
	}

	return requires;
}

// ----------
// Utilities
// ----------

function _getLineNumber({ source, node }) {
	const charOffset = +node.src.split(':')[0];
	const firstHalf = source.substring(0, charOffset);
	const breaks = firstHalf.match(/\n/g) || [];

	return 1 + breaks.length;
}

function _filterNodes({ node, type }) {
	return node.nodes.filter(node => node.nodeType === type);
}

module.exports = describeSources;
