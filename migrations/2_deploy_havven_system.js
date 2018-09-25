const { table } = require('table');
const web3 = require('web3');

const ExchangeRates = artifacts.require('./ExchangeRates.sol');
const Havven = artifacts.require('./Havven.sol');
const HavvenEscrow = artifacts.require('./HavvenEscrow.sol');
const IssuanceController = artifacts.require('./IssuanceController.sol');
const Nomin = artifacts.require('./Nomin.sol');
const Owned = artifacts.require('./Owned.sol');
const Proxy = artifacts.require('./Proxy.sol');
const TokenState = artifacts.require('./TokenState.sol');

// Update values before deployment
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

module.exports = async function(deployer, network, accounts) {
	const [deployerAccount, owner, oracle] = accounts;

	// Note: This deployment script is not used on mainnet, it's only for testing deployments.
	// ----------------
	// Owned
	// ----------------
	await deployer.deploy(Owned, owner, { from: deployerAccount });

	// ----------------
	// Exchange Rates
	// ----------------
	console.log('Deploying ExchangeRates...');
	await deployer.deploy(
		ExchangeRates,
		owner,
		oracle,
		[web3.utils.asciiToHex('nUSD'), web3.utils.asciiToHex('HAV')],
		[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
		{ from: deployerAccount }
	);

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
	// constructor(address _proxy, TokenState _tokenState, address _owner, ExchangeRates _exchangeRates, Havven _oldHavven)
	const havven = await deployer.deploy(
		Havven,
		havvenProxy.address,
		havvenTokenState.address,
		owner,
		ExchangeRates.address,
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

	// ----------------------
	// Connect Token States
	// ----------------------
	await havvenTokenState.setAssociatedContract(havven.address, { from: owner });

	// ----------------------
	// Connect Proxies
	// ----------------------
	await havvenProxy.setTarget(havven.address, { from: owner });

	// ----------------------
	// Connect Escrow
	// ----------------------
	await havven.setEscrow(havvenEscrow.address, { from: owner });

	// ----------------
	// Nomins
	// ----------------
	const currencyKeys = ['nUSD', 'nAUD', 'nEUR'];
	const nomins = [];

	for (const currencyKey of currencyKeys) {
		console.log(`Deploying NominTokenState for ${currencyKey}...`);
		const tokenState = await TokenState.new(owner, ZERO_ADDRESS, { from: deployerAccount });
		console.log(`Deploying NominProxy for ${currencyKey}...`);
		const proxy = await Proxy.new(owner, { from: deployerAccount });
		console.log(`Deploying ${currencyKey} Nomin...`);
		const nomin = await Nomin.new(
			proxy.address,
			tokenState.address,
			havven.address,
			`Nomin ${currencyKey}`,
			currencyKey,
			owner,
			web3.utils.asciiToHex(currencyKey),
			{ from: deployerAccount }
		);

		console.log(`Setting associated contract for ${currencyKey} token state...`);
		await tokenState.setAssociatedContract(nomin.address, { from: owner });

		console.log(`Setting proxy target for ${currencyKey} proxy...`);
		await proxy.setTarget(nomin.address, { from: owner });

		// ----------------------
		// Connect Havven to Nomin
		// ----------------------
		console.log(`Adding ${currencyKey} to Havven contract...`);
		await havven.addNomin(nomin.address, { from: owner });

		nomins.push({
			currencyKey,
			tokenState,
			proxy,
			nomin,
		});
	}

	// --------------------
	// Issuance Controller
	// --------------------
	// console.log('Deploying IssuanceController...');
	// await deployer.deploy(
	// 	IssuanceController,
	// 	owner,
	// 	fundsWallet,
	// 	havven.address,
	// 	nomin.address,
	// 	oracle,
	// 	ethUSD,
	// 	havUSD,
	// 	{ from: deployerAccount }
	// );

	const tableData = [
		['Contract', 'Address'],

		['Exchange Rates', ExchangeRates.address],

		['Owned', Owned.address],

		['Havven Token State', havvenTokenState.address],
		['Havven Proxy', havvenProxy.address],
		['Havven', Havven.address],
		['Havven Escrow', HavvenEscrow.address],

		// ['Issuance Controller', IssuanceController.address],
	];

	for (const nomin of nomins) {
		tableData.push([`${nomin.currencyKey} Nomin`, nomin.nomin.address]);
		tableData.push([`${nomin.currencyKey} Proxy`, nomin.proxy.address]);
		tableData.push([`${nomin.currencyKey} Token State`, nomin.tokenState.address]);
	}

	console.log();
	console.log();
	console.log(' Successfully deployed all contracts:');
	console.log();
	console.log(table(tableData));
};
