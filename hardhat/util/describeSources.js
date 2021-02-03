const fs = require('fs');
const path = require('path');

async function describeSources({ hre }) {
	const asts = await _collectAsts({ hre });
  const descriptions = _processAsts({ asts });

  const description = descriptions['contracts/AddressResolver.sol'];
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

function _processFunctions({ node }) {
  const functions = [];

  for (node of node.nodes) {
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

function _processEvents({ node }) {

}

function _processVariables({ node }) {
  const variables = [];

  for (node of node.nodes) {
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

function _processModifiers({ node }) {

}

function _processStructs({ node }) {

}

function _processInheritance({ node }) {

}

function _processContracts({ ast }) {
  const contracts = {};

  for (let node of ast.nodes) {
    if (node.nodeType === 'ContractDefinition') {
      contracts[node.name] = {
        functions: _processFunctions({ node }),
        events: _processEvents({ node }),
        variables: _processVariables({ node }),
        modifiers: _processModifiers({ node }),
        structs: _processStructs({ node }),
        inherits: _processInheritance({ node }),
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
