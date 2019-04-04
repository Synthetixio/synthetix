const Web3 = require('web3');

const methodCallGasLimit = 1000000;
const contractDeploymentGasLimit = 8000000;

// use globally injected web3 to find the currentProvider and wrap with web3 v1.0
// update web3.eth / default accounts here before returning
const getWeb3 = () => {
	const wrappedWeb3 = new Web3(web3.currentProvider);
	return wrappedWeb3;
};

// assumes passed-in web3 is v1.0 and creates a function to receive artifacts helper
const getContractInstance = web3 => artifact => {
	const deployedAddress = artifact.networks[artifact.network_id].address;
	const instance = new web3.eth.Contract(artifact.abi, deployedAddress);

	// copy all methods() to instance level
	return instance;
};

const sendParameters = (options, type = 'method-call') => ({
	from: options.from || web3.eth.defaultAccount,
	gas: type === 'method-call' ? methodCallGasLimit : contractDeploymentGasLimit,
	gasPrice: web3.utils.toWei('5', 'gwei'),
});

module.exports = { getWeb3, getContractInstance, sendParameters };
