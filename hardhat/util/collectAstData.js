const fs = require('fs');
const path = require('path');

async function collectAstData({ hre, taskArguments }) {
	const asts = await _collectAsts({ hre });

	for (ast of asts) {
	  console.log(ast.);
	}
}

async function _collectAsts({ hre }) {
  // Get a list of all output .dbg.json files
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

    // Build the contract key to find the associated ast
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

module.exports = collectAstData;
