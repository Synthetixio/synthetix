const fs = require('fs');
const path = require('path');

async function describeSources({ hre }) {
	const asts = await _collectAsts({ hre });
	// const ast = asts.find(ast => ast.absolutePath === 'contracts/Depot.sol');
  // console.log(JSON.stringify(ast, null, 2));

  const descriptions = _processAsts({ asts });
  const description = descriptions['contracts/Depot.sol'];
  console.log(JSON.stringify(description, null, 2));
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

function _processFunctions({ nodes }) {
  const functions = [];

  for (let node of nodes) {
    if (node.nodeType === 'FunctionDefinition') {
      const isConstructor = node.name.length === 0;
      const name = isConstructor ? 'constructor' : node.name;
      const mutability = node.stateMutability === 'nonpayable' ? '' : ` ${node.stateMutability}`;

      functions.push({
        name,
        signature: `${name}${_processParameterList({ parameters: node.parameters.parameters })}${mutability}`,
        returns: _processParameterList({ parameters: node.returnParameters.parameters }),
        modifiers: isConstructor ? [] : node.modifiers.map(modifier => modifier.modifierName.name),
        visibility: node.visibility,
      });
    }
  }

  return functions;
}

function _processEvents({ nodes }) {
  const events = [];

  for (let node of nodes) {
    if (node.nodeType === 'EventDefinition') {
      events.push({
        name: node.name,
        parameters: _processParameterList({ parameters: node.parameters.parameters }),
      });
    }
  }

  return events;
}

function _processVariables({ nodes }) {
  const variables = [];

  for (let node of nodes) {
    if (node.nodeType === 'VariableDeclaration') {
      variables.push({
        name: node.name,
        type: node.typeDescriptions.typeString,
        visibility: node.visibility,
      });
    }
  }

  return variables;
}

function _processModifiers({ nodes }) {
  const modifiers = [];

  for (let node of nodes) {
    if (node.nodeType === 'ModifierDefinition') {
      modifiers.push({
        name: node.name,
        signature: `${node.name}${_processParameterList({ parameters: node.parameters.parameters })}`,
        visibility: node.visibility,
      });
    }
  }

  return modifiers;
}

function _processStructs({ nodes }) {
  const structs = [];

  for (let node of nodes) {
    if (node.nodeType === 'StructDefinition') {
      structs.push({
        name: node.name,
        members: node.members.map(member => {
          return {
            name: member.name,
            type: member.typeDescriptions.typeString,
          }
        }),
      });
    }
  }

  return structs;
}

function _processContracts({ ast }) {
  const contracts = {};

  for (let node of ast.nodes) {
    if (node.nodeType === 'ContractDefinition') {
      contracts[node.name] = {
        functions: _processFunctions({ nodes: node.nodes }),
        events: _processEvents({ nodes: node.nodes }),
        variables: _processVariables({ nodes: node.nodes }),
        modifiers: _processModifiers({ nodes: node.nodes }),
        structs: _processStructs({ nodes: node.nodes }),
        inherits: node.baseContracts.map(contract => contract.baseName.name),
      }
    }
  }

  return contracts;
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

function _processAsts({ asts }) {
  const descriptions = {};

  for (ast of asts) {
    descriptions[ast.absolutePath] = {
      imports: _processImports({ ast }),
      contracts: _processContracts({ ast })
    }
  }

  return descriptions;
}

async function _collectAsts({ hre }) {
  // Get a list of all output .dbg.json file paths
  const artifactPaths = await hre.artifacts.getArtifactPaths();
  const dbgPaths = artifactPaths.map(artifactPath => artifactPath.replace('json', 'dbg.json'));

  // Sweep .dbg.json files and collect all asts
  const asts = [];
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
      const ast = buildInfo.output.sources[contractKey].ast;
      asts.push(ast);
    }
  }

  return asts;
}

module.exports = describeSources;
