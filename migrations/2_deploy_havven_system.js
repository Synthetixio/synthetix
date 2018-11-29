const { table } = require('table');

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const SynthetixEscrow = artifacts.require('SynthetixEscrow');
const SynthetixState = artifacts.require('SynthetixState');
// const IssuanceController = artifacts.require('./IssuanceController.sol');
const Nomin = artifacts.require('Nomin');
const Owned = artifacts.require('Owned');
const Proxy = artifacts.require('Proxy');
const PublicSafeDecimalMath = artifacts.require('PublicSafeDecimalMath');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const TokenState = artifacts.require('TokenState');

// Update values before deployment
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

module.exports = async function(deployer, network, accounts) {
	const [deployerAccount, owner, oracle, feeAuthority] = accounts;

	// Note: This deployment script is not used on mainnet, it's only for testing deployments.

	// The Owned contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Owned
	// ----------------
	await deployer.deploy(Owned, owner, { from: deployerAccount });

	// ----------------
	// Safe Decimal Math library
	// ----------------
	console.log('Deploying SafeDecimalMath...');
	await deployer.deploy(SafeDecimalMath, { from: deployerAccount });

	// The PublicSafeDecimalMath contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Public Safe Decimal Math Library
	// ----------------
	deployer.link(SafeDecimalMath, PublicSafeDecimalMath);
	await deployer.deploy(PublicSafeDecimalMath, { from: deployerAccount });

	// ----------------
	// Exchange Rates
	// ----------------
	console.log('Deploying ExchangeRates...');
	deployer.link(SafeDecimalMath, ExchangeRates);
	const exchangeRates = await deployer.deploy(
		ExchangeRates,
		owner,
		oracle,
		[web3.utils.asciiToHex('nUSD'), web3.utils.asciiToHex('SNX')],
		[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
		{ from: deployerAccount }
	);

	// ----------------
	// Fee Pool
	// ----------------
	console.log('Deploying FeePoolProxy...');
	// constructor(address _owner)
	const feePoolProxy = await Proxy.new(owner, { from: deployerAccount });

	console.log('Deploying FeePool...');
	// constructor(address _proxy, address _owner, Synthetix _synthetix, address _feeAuthority, uint _transferFeeRate, uint _exchangeFeeRate)
	deployer.link(SafeDecimalMath, FeePool);
	const feePool = await deployer.deploy(
		FeePool,
		feePoolProxy.address,
		owner,
		ZERO_ADDRESS,
		feeAuthority,
		web3.utils.toWei('0.0015', 'ether'),
		web3.utils.toWei('0.0015', 'ether'),
		{ from: deployerAccount }
	);

	await feePoolProxy.setTarget(feePool.address, { from: owner });

	// ----------------
	// Synthetix State
	// ----------------
	console.log('Deploying SynthetixState...');
	// constructor(address _owner, address _associatedContract)
	deployer.link(SafeDecimalMath, SynthetixState);
	const synthetixState = await deployer.deploy(SynthetixState, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	// ----------------
	// Synthetix
	// ----------------
	console.log('Deploying SynthetixProxy...');
	// constructor(address _owner)
	const synthetixProxy = await Proxy.new(owner, { from: deployerAccount });

	console.log('Deploying SynthetixTokenState...');
	// constructor(address _owner, address _associatedContract)
	const synthetixTokenState = await TokenState.new(owner, deployerAccount, {
		from: deployerAccount,
	});

	console.log('Deploying Synthetix...');
	// constructor(address _proxy, TokenState _tokenState, Synthetix _synthetixState,
	//     address _owner, ExchangeRates _exchangeRates, FeePool _feePool
	// )
	deployer.link(SafeDecimalMath, Synthetix);
	const synthetix = await deployer.deploy(
		Synthetix,
		synthetixProxy.address,
		synthetixTokenState.address,
		synthetixState.address,
		owner,
		ExchangeRates.address,
		FeePool.address,
		{
			from: deployerAccount,
			gas: 8000000,
		}
	);

	console.log('Deploying SynthetixEscrow...');
	const synthetixEscrow = await deployer.deploy(SynthetixEscrow, owner, synthetix.address, {
		from: deployerAccount,
	});

	// ----------------------
	// Connect Token State
	// ----------------------
	// Set initial balance for the owner to have all Havvens.
	await synthetixTokenState.setBalanceOf(owner, web3.utils.toWei('100000000'), {
		from: deployerAccount,
	});

	await synthetixTokenState.setAssociatedContract(synthetix.address, { from: owner });

	// ----------------------
	// Connect Synthetix State
	// ----------------------
	await synthetixState.setAssociatedContract(synthetix.address, { from: owner });

	// ----------------------
	// Connect Proxy
	// ----------------------
	await synthetixProxy.setTarget(synthetix.address, { from: owner });

	// ----------------------
	// Connect Escrow
	// ----------------------
	await synthetix.setEscrow(SynthetixEscrow.address, { from: owner });

	// ----------------------
	// Connect FeePool
	// ----------------------
	await feePool.setSynthetix(synthetix.address, { from: owner });

	// ----------------
	// Nomins
	// ----------------
	const currencyKeys = ['HDR', 'nUSD', 'nAUD', 'nEUR'];
	const nomins = [];

	for (const currencyKey of currencyKeys) {
		console.log(`Deploying NominTokenState for ${currencyKey}...`);
		const tokenState = await deployer.deploy(TokenState, owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		console.log(`Deploying NominProxy for ${currencyKey}...`);
		const proxy = await deployer.deploy(Proxy, owner, { from: deployerAccount });

		console.log(`Deploying ${currencyKey} Nomin...`);

		// constructor(address _proxy, TokenState _tokenState, Synthetix _synthetix, FeePool _feePool,
		//	string _tokenName, string _tokenSymbol, uint _decimals, address _owner, bytes4 _currencyKey
		// )
		const nomin = await deployer.deploy(
			Nomin,
			proxy.address,
			tokenState.address,
			synthetix.address,
			feePool.address,
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
		// Connect Synthetix to Nomin
		// ----------------------
		console.log(`Adding ${currencyKey} to Synthetix contract...`);
		await synthetix.addNomin(nomin.address, { from: owner });

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
	// SNX: 0.1 USD
	await exchangeRates.updateRates(
		currencyKeys.concat(['SNX']).map(web3.utils.asciiToHex),
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
	// 	synthetix.address,
	// 	nomin.address,
	// 	oracle,
	// 	ethUSD,
	// 	snxUSD,
	// 	{ from: deployerAccount }
	// );

	const tableData = [
		['Contract', 'Address'],
		['Exchange Rates', ExchangeRates.address],
		['Fee Pool', FeePool.address],
		['Fee Pool Proxy', feePoolProxy.address],
		['Synthetix State', synthetixState.address],
		['Synthetix Token State', synthetixTokenState.address],
		['Synthetix Proxy', synthetixProxy.address],
		['Synthetix', Synthetix.address],
		['Synthetix Escrow', SynthetixEscrow.address],
		['Owned', Owned.address],
		['SafeDecimalMath', SafeDecimalMath.address],

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
