const L2CrossDomainMessengerArtifact = require('@eth-optimism/rollup-contracts/build/ovm_artifacts/L2CrossDomainMessenger');
const { ethers, Wallet, ContractFactory, Contract } = require('ethers');

const {
	deployAndRegister,
	getContractInterface,
	getContractFactory,
} = require('@eth-optimism/rollup-contracts');

const l1Url = 'http://127.0.0.1:9545';
const l2Url = 'http://127.0.0.1:8545';
const addressResolverContractAddress = '0x887d5bCe748d8336218c94E55450f42d3a86E141';
const l1Provider = new ethers.providers.JsonRpcProvider(l1Url);
const l2Provider = new ethers.providers.JsonRpcProvider(l2Url);

const l1Owner = new Wallet(
	'0xdf8b81d840b9cafc8cd68cf94f093726b174b5f109eba11a3f2a559e5f9e8bce',
	l1Provider
);

const l2Owner = new Wallet(
	'0xdf8b81d840b9cafc8cd68cf94f093726b174b5f109eba11a3f2a559e5f9e8bce',
	l2Provider
);

const deployMessengers = async () => {
	const AddressResolver = new Contract(
		addressResolverContractAddress,
		getContractInterface('AddressResolver'),
		l1Owner
	);

	const L1CrossDomainMessengerFactory = await getContractFactory('L1CrossDomainMessenger');

	console.log(`deploying L1CrossDomainMessenger...`);

	const L1CrossDomainMessenger = await deployAndRegister(
		AddressResolver,
		'L1CrossDomainMessenger',
		{
			factory: L1CrossDomainMessengerFactory.connect(l1Owner),
			params: [AddressResolver.address],
			signer: l1Owner,
		}
	);
	console.log(`deployed L1CrossDomainMessenger to`, l1Url, ` at:`, L1CrossDomainMessenger.address);

	const L2CrossDomainMessengerFactory = new ContractFactory(
		L2CrossDomainMessengerArtifact.abi,
		L2CrossDomainMessengerArtifact.bytecode,
		l2Owner
	);
	console.log(`deploying L2CrossDomainMessenger...`);

	const L2CrossDomainMessenger = await L2CrossDomainMessengerFactory.connect(l2Owner).deploy(
		'0x4200000000000000000000000000000000000001', // L1 message sender precompile
		'0x4200000000000000000000000000000000000000' // L2 To L1 Message Passer Precompile
	);
	console.log(`deployed L2CrossDomainMessenger to`, l2Url, ` at:`, L2CrossDomainMessenger.address);
	// const receipt = await l2Provider.getTransactionReceipt(
	//   L2CrossDomainMessenger.deployTransaction.hash
	// )

	const l2SetTargetTx = await L2CrossDomainMessenger.connect(l2Owner).setTargetMessengerAddress(
		L1CrossDomainMessenger.address
	);
	console.log(
		'Set L2 target address to ',
		L1CrossDomainMessenger.address,
		'w/ tx hash:',
		l2SetTargetTx.hash
	);

	const l1SetTargetTx = await L1CrossDomainMessenger.connect(l1Owner).setTargetMessengerAddress(
		L2CrossDomainMessenger.address
	);
	console.log(
		'Set L1 target address to ',
		L2CrossDomainMessenger.address,
		'w/ tx hash:',
		l1SetTargetTx.hash
	);
};
(async () => {
	await deployMessengers();
})();
