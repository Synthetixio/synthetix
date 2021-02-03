const fs = require('fs');
const path = require('path');

async function describeSources({ hre }) {
	const { asts, sources } = await _collectSourcesAndAsts({ hre });

  const descriptions = {};
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const ast = asts[i];

    descriptions[ast.absolutePath] = _processFile({ source, ast });
  }

  const description = descriptions['contracts/Depot.sol'];
  console.log(JSON.stringify(description, null, 2));
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
  for (dbgPath of dbgPaths) {
    // Locate the associated build info file, which contains the ast
    const dbg = JSON.parse(fs.readFileSync(dbgPath, 'utf8'));
    const buildInfoFileName = path.basename(dbg.buildInfo);
    const buildInfoPath = path.resolve(hre.config.paths.artifacts, 'build-info', buildInfoFileName);
    const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));

    // Build the contract key to find the associated ast from the path
    // i.e. 'contracts/Synthetix'
    const pathComponents = dbgPath.split(path.sep);
    const lastIdx = pathComponents.length - 1;
    const contractKey = `${pathComponents[lastIdx - 2]}/${pathComponents[lastIdx -1]}`

    // Only include the ones under 'contracts/'
    if (contractKey.includes('contracts/')) {
      asts.push(buildInfo.output.sources[contractKey].ast);
      sources.push(buildInfo.input.sources[contractKey].content);
    }
  }

  return { sources, asts };
}

// --------------------
// AST node processing
// --------------------

function _processFile({ source, ast }) {
  return {
    imports: _processImports({ ast }),
    contracts: _processContracts({ source, ast })
  };
}

function _processImports({ ast }) {
  const imports = [];

  for (let node of ast.nodes) {
    if (node.nodeType === 'ImportDirective') {
      imports.push(node.file);
    }
  }

  return imports;
}

function _processContracts({ source, ast }) {
  const contracts = {};

  for (let node of ast.nodes) {
    if (node.nodeType === 'ContractDefinition') {
      contracts[node.name] = {
        functions: _processFunctions({ source, nodes: _filterNodes({ node, type: 'FunctionDefinition' }) }),
        events: _processEvents({ source, nodes: _filterNodes({ node, type: 'EventDefinition' }) }),
        variables: _processVariables({ source, nodes: _filterNodes({ node, type: 'VariableDeclaration' }) }),
        modifiers: _processModifiers({ source, nodes: _filterNodes({ node, type: 'ModifierDefinition' }) }),
        structs: _processStructs({ source, nodes: _filterNodes({ node, type: 'StructDefinition' }) }),
        inherits: node.baseContracts.map(contract => contract.baseName.name),
      }
    }
  }

  return contracts;
}

function _processStructs({ source, nodes }) {
  const structs = [];

  for (let node of nodes) {
    structs.push({
      name: node.name,
      members: node.members.map(member => {
        return {
          name: member.name,
          type: member.typeDescriptions.typeString,
        }
      }),
      lineNumber: _getLineNumber({ source, node }),
    });
  }

  return structs;
}

function _processFunctions({ source, nodes }) {
  const functions = [];

  for (let node of nodes) {
    const isConstructor = node.name.length === 0;
    const name = isConstructor ? 'constructor' : node.name;
    const mutability = node.stateMutability === 'nonpayable' ? '' : ` ${node.stateMutability}`;

    functions.push({
      name,
      signature: `${name}${_processParameterList({ parameters: node.parameters.parameters })}${mutability}`,
      returns: _processParameterList({ parameters: node.returnParameters.parameters }),
      modifiers: isConstructor ? [] : node.modifiers.map(modifier => modifier.modifierName.name),
      visibility: node.visibility,
      lineNumber: _getLineNumber({ source, node }),
    }); }

  return functions;
}

function _processEvents({ source, nodes }) {
  const events = [];

  for (let node of nodes) {
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

  for (let node of nodes) {
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

  for (let node of nodes) {
    modifiers.push({
      name: node.name,
      signature: `${node.name}${_processParameterList({ parameters: node.parameters.parameters })}`,
      visibility: node.visibility,
      lineNumber: _getLineNumber({ source, node }),
    });
  }

  return modifiers;
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

function _processParameterList({ parameters }) {
  let str = '(';

  const processed = [];
  for (let parameter of parameters) {
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

function _filterNodes({ node, type }) {
  return node.nodes.filter(node => node.nodeType === type);
}

module.exports = describeSources;
