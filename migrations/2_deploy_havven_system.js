const { table } = require('table');

const ExchangeRates = artifacts.require('./ExchangeRates.sol');
const Havven = artifacts.require('./Havven.sol');
const HavvenEscrow = artifacts.require('./HavvenEscrow.sol');
// const IssuanceController = artifacts.require('./IssuanceController.sol');
const Nomin = artifacts.require('./Nomin.sol');
const Owned = artifacts.require('./Owned.sol');
const Proxy = artifacts.require('./Proxy.sol');
const TokenState = artifacts.require('./TokenState.sol');

// Update values before deployment
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

module.exports = async function(deployer, network, accounts) {
	const [deployerAccount, owner, oracle] = accounts;

	// Note: This deployment script is not used on mainnet, it's only for testing deployments.

	// The Owned contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Owned
	// ----------------
	await deployer.deploy(Owned, owner, { from: deployerAccount });

	// ----------------
	// Exchange Rates
	// ----------------
	console.log('Deploying ExchangeRates...');
	const exchangeRates = await deployer.deploy(
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
	const havvenTokenState = await TokenState.new(owner, deployerAccount, {
		from: deployerAccount,
	});

	console.log('Deploying Havven...');
	// address _proxy, TokenState _tokenState, address _owner, ExchangeRates _exchangeRates, address _feeAuthority, uint _transferFeeRate, uint _exchangeFeeRate, Havven _oldHavven)
	const havven = await deployer.deploy(
		Havven,
		havvenProxy.address,
		havvenTokenState.address,
		owner,
		ExchangeRates.address,
		oracle,
		web3.utils.toWei('0.0015', 'ether'),
		web3.utils.toWei('0.0015', 'ether'),
		ZERO_ADDRESS,
		{
			from: deployerAccount,
			gas: 128062383,
		}
	);

	console.log('Deploying HavvenEscrow...');
	const havvenEscrow = await deployer.deploy(HavvenEscrow, owner, havven.address, {
		from: deployerAccount,
	});

	// ----------------------
	// Connect Token State
	// ----------------------
	// Set initial balance for the owner to have all Havvens.
	await havvenTokenState.setBalanceOf(owner, web3.utils.toWei('100000000'), {
		from: deployerAccount,
	});

	await havvenTokenState.setAssociatedContract(havven.address, { from: owner });

	// ----------------------
	// Connect Proxy
	// ----------------------
	await havvenProxy.setTarget(havven.address, { from: owner });

	// ----------------------
	// Connect Escrow
	// ----------------------
	await havven.setEscrow(havvenEscrow.address, { from: owner });

	// Mark the owner as an issuer.
	await havven.setIssuer(owner, true, { from: owner });

	// ----------------
	// Nomins
	// ----------------
	const currencyKeys = ['HDR', 'nUSD', 'nAUD', 'nEUR'];
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

	// Initial prices
	const { timestamp } = await web3.eth.getBlock('latest');

	// nUSD: 1 USD
	// nAUD: 0.5 USD
	// nEUR: 1.25 USD
	// HAV: 0.1 USD
	await exchangeRates.updateRates(
		currencyKeys.concat(['HAV']).map(web3.utils.asciiToHex),
		['1', '1', '0.5', '1.25', '0.1'].map(number => web3.utils.toWei(number, 'ether')),
		timestamp,
		{ from: oracle }
	);

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
		['Fee Pool', FeePool.address],
		['Havven Token State', havvenTokenState.address],
		['Havven Proxy', havvenProxy.address],
		['Havven', Havven.address],
		['Havven Escrow', HavvenEscrow.address],
		['Owned', Owned.address],

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
