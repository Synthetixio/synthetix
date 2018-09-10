const { table } = require('table');

const Havven = artifacts.require('./Havven.sol');
const HavvenEscrow = artifacts.require('./HavvenEscrow.sol');
const IssuanceController = artifacts.require('./IssuanceController.sol');
const Nomin = artifacts.require('./Nomin.sol');
const Owned = artifacts.require('./Owned.sol');
const Proxy = artifacts.require('./Proxy.sol');
const TokenState = artifacts.require('./TokenState.sol');

// Update values before deployment
const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const ethUSD = 274411589120931162910;
const havUSD = 116551110814936098;

const totalSupplyNomin = 1241510914838889387806256;

module.exports = async function(deployer, network, accounts) {
	const [deployerAccount, owner, oracle, fundsWallet] = accounts;

	// Note: This deployment script is not used on mainnet, it's only for testing deployments.
	// ----------------
	// Owned
	// ----------------
	console.log('Deploying Owned...');
	const owned = await Owned.new(owner, { from: deployerAccount });

	// ----------------
	// Havven
	// ----------------
	console.log('Deploying HavvenTokenState...');
	const havvenTokenState = await TokenState.new(owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});
	console.log('Deploying HavvenProxy...');
	const havvenProxy = await Proxy.new(owner, { from: deployerAccount });
	console.log('Deploying Havven...');
	const havven = await Havven.new(
		havvenProxy.address,
		havvenTokenState.address,
		owner,
		oracle,
		havUSD,
		[],
		ZERO_ADDRESS,
		{
			from: deployerAccount,
			gasLimit: 6000000,
		}
	);

	console.log('Deploying HavvenEscrow...');
	const havvenEscrow = await HavvenEscrow.new(owner, havven.address, {
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
	const nomin = await Nomin.new(
		nominProxy.address,
		nominTokenState.address,
		havvContInst.address,
		totalSupplyNomin,
		owner,
		{ from: deployerAccount }
	);

	// --------------------
	// Issuance Controller
	// --------------------
	console.log('Deploying IssuanceController...');
	const issuanceController = await IssuanceController.new(
		owner,
		fundsWallet,
		havven.address,
		nomin.address,
		oracle,
		ethUSD,
		havUSD,
		{ from: deployerAccount }
	);

	const data = [
		['Contract', 'Address'],

		['Owned', owned.address],

		['Havven Token State', havvenTokenState.address],
		['Havven Proxy', havvenProxy.address],
		['Havven', havven.address],
		['Havven Escrow', havvenEscrow.address],

		['Nomin Token State', nominTokenState.address],
		['Nomin Proxy', nominProxy.address],
		['Nomin', nomin.address],

		['Issuance Controller', issuanceController.address],
	];

	console.log(table(data));
};
