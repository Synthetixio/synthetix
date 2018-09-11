const { table } = require('table');
const web3 = require('web3');

const Havven = artifacts.require('./Havven.sol');
const HavvenEscrow = artifacts.require('./HavvenEscrow.sol');
const IssuanceController = artifacts.require('./IssuanceController.sol');
const Nomin = artifacts.require('./Nomin.sol');
const Owned = artifacts.require('./Owned.sol');
const Proxy = artifacts.require('./Proxy.sol');
const TokenState = artifacts.require('./TokenState.sol');

// Update values before deployment
const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const ethUSD = '274411589120931162910';
const havUSD = '116551110814936098';

const totalSupplyNomin = '1241510914838889387806256';

module.exports = async function(deployer, network, accounts) {
	const [deployerAccount, owner, oracle, fundsWallet] = accounts;

	// Note: This deployment script is not used on mainnet, it's only for testing deployments.
	// ----------------
	// Owned
	// ----------------
	const owned = await deployer.deploy(Owned, owner, { from: deployerAccount });

	// ----------------
	// Havven
	// ----------------
	console.log('Deploying HavvenProxy...');
	// constructor(address _owner)
	const havvenProxy = await Proxy.new(owner, { from: deployerAccount });

	console.log('Deploying HavvenTokenState...');
	// constructor(address _owner, address _associatedContract)
	const havvenTokenState = await TokenState.new(owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log('Deploying Havven...');
	// constructor(address _proxy, TokenState _tokenState, address _owner, address _oracle,
	//             uint _price, address[] _issuers, Havven _oldHavven)
	const havven = await deployer.deploy(
		Havven,
		havvenProxy.address,
		havvenTokenState.address,
		owner,
		oracle,
		havUSD,
		[],
		ZERO_ADDRESS,
		{
			from: deployerAccount,
			gas: 8000000,
		}
	);

	console.log('Deploying HavvenEscrow...');
	const havvenEscrow = await deployer.deploy(HavvenEscrow, owner, havven.address, {
		from: deployerAccount,
	});

	// ----------------
	// Nomin
	// ----------------
	console.log('Deploying NominTokenState...');
	const nominTokenState = await TokenState.new(owner, ZERO_ADDRESS, { from: deployerAccount });
	console.log('Deploying NominProxy...');
	const nominProxy = await Proxy.new(owner, { from: deployerAccount });
	console.log('Deploying Nomin...');
	const nomin = await deployer.deploy(
		Nomin,
		nominProxy.address,
		nominTokenState.address,
		havven.address,
		totalSupplyNomin,
		owner,
		{ from: deployerAccount }
	);

	// --------------------
	// Issuance Controller
	// --------------------
	console.log('Deploying IssuanceController...');
	const issuanceController = await deployer.deploy(
		IssuanceController,
		owner,
		fundsWallet,
		havven.address,
		nomin.address,
		oracle,
		ethUSD,
		havUSD,
		{ from: deployerAccount }
	);

	// ----------------------
	// Connect Token States
	// ----------------------
	await havvenTokenState.setAssociatedContract(havven.address, { from: owner });
	await nominTokenState.setAssociatedContract(nomin.address, { from: owner });

	// ----------------------
	// Connect Proxies
	// ----------------------
	await havvenProxy.setTarget(havven.address, { from: owner });
	await nominProxy.setTarget(nomin.address, { from: owner });

	// ----------------------
	// Connect Havven to Nomin
	// ----------------------
	await havven.setNomin(nomin.address, { from: owner });

	// ----------------------
	// Connect Escrow
	// ----------------------
	await havven.setEscrow(havvenEscrow.address, { from: owner });

	console.log();
	console.log();
	console.log(' Successfully deployed all contracts:');
	console.log();
	console.log(
		table([
			['Contract', 'Address'],

			['Owned', Owned.address],

			['Havven Token State', havvenTokenState.address],
			['Havven Proxy', havvenProxy.address],
			['Havven', Havven.address],
			['Havven Escrow', HavvenEscrow.address],

			['Nomin Token State', nominTokenState.address],
			['Nomin Proxy', nominProxy.address],
			['Nomin', Nomin.address],

			['Issuance Controller', IssuanceController.address],
		])
	);
};
