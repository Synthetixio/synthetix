const { table } = require('table');

const { toBytes32 } = require('../.');

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const FeePoolState = artifacts.require('FeePoolState');
const FeePoolEternalStorage = artifacts.require('FeePoolEternalStorage');
const DelegateApprovals = artifacts.require('DelegateApprovals');
const Synthetix = artifacts.require('Synthetix');
const SynthetixEscrow = artifacts.require('SynthetixEscrow');
const RewardEscrow = artifacts.require('RewardEscrow');
const RewardsDistribution = artifacts.require('RewardsDistribution');
const SynthetixState = artifacts.require('SynthetixState');
const SupplySchedule = artifacts.require('SupplySchedule');
const Synth = artifacts.require('Synth');
const Owned = artifacts.require('Owned');
const Proxy = artifacts.require('Proxy');
// const ProxyERC20 = artifacts.require('ProxyERC20');
const PublicSafeDecimalMath = artifacts.require('PublicSafeDecimalMath');
const PublicMath = artifacts.require('PublicMath');
const PurgeableSynth = artifacts.require('PurgeableSynth');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const MathLib = artifacts.require('Math');
const TokenState = artifacts.require('TokenState');
const Depot = artifacts.require('Depot');
const SelfDestructible = artifacts.require('SelfDestructible');
const DappMaintenance = artifacts.require('DappMaintenance');

// Update values before deployment
const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('100000000');

module.exports = async function(deployer, network, accounts) {
	const [deployerAccount, owner, oracle, fundsWallet, gasLimitOracle] = accounts;

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

	// ----------------
	// Math library
	// ----------------
	console.log('Deploying Math library...');
	deployer.link(SafeDecimalMath, MathLib);
	await deployer.deploy(MathLib, { from: deployerAccount });

	// The PublicSafeDecimalMath contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Public Safe Decimal Math Library
	// ----------------
	deployer.link(SafeDecimalMath, PublicSafeDecimalMath);
	await deployer.deploy(PublicSafeDecimalMath, { from: deployerAccount });

	// The PublicMath contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Public Math Library
	// ----------------
	deployer.link(SafeDecimalMath, PublicMath);
	deployer.link(MathLib, PublicMath);
	await deployer.deploy(PublicMath, { from: deployerAccount });

	// ----------------
	// Exchange Rates
	// ----------------
	console.log('Deploying ExchangeRates...');
	deployer.link(SafeDecimalMath, ExchangeRates);
	const exchangeRates = await deployer.deploy(
		ExchangeRates,
		owner,
		oracle,
		[toBytes32('SNX')],
		[web3.utils.toWei('0.2', 'ether')],
		{ from: deployerAccount }
	);

	// ----------------
	// Escrow
	// ----------------
	console.log('Deploying SynthetixEscrow...');
	const escrow = await deployer.deploy(SynthetixEscrow, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log('Deploying RewardEscrow...');
	const rewardEscrow = await deployer.deploy(RewardEscrow, owner, ZERO_ADDRESS, ZERO_ADDRESS, {
		from: deployerAccount,
	});

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
	// Fee Pool - Delegate Approval
	// ----------------
	console.log('Deploying Delegate Approvals...');
	const delegateApprovals = await deployer.deploy(DelegateApprovals, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	// ----------------
	// Fee Pool
	// ----------------
	console.log('Deploying FeePoolProxy...');
	// constructor(address _owner)
	const feePoolProxy = await Proxy.new(owner, { from: deployerAccount });

	console.log('Deploying FeePoolState...');
	deployer.link(SafeDecimalMath, FeePoolState);
	const feePoolState = await deployer.deploy(FeePoolState, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log('Deploying FeePoolEternalStorage...');
	deployer.link(SafeDecimalMath, FeePoolEternalStorage);
	const feePoolEternalStorage = await deployer.deploy(FeePoolEternalStorage, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log('Deploying FeePool...');

	deployer.link(SafeDecimalMath, FeePool);
	const feePool = await deployer.deploy(
		FeePool,
		feePoolProxy.address,
		owner,
		ZERO_ADDRESS,
		feePoolState.address,
		feePoolEternalStorage.address,
		synthetixState.address,
		rewardEscrow.address,
		ZERO_ADDRESS,
		web3.utils.toWei('0.0030', 'ether'),
		{ from: deployerAccount }
	);

	await feePoolProxy.setTarget(feePool.address, { from: owner });

	// Set feePool on feePoolState & rewardEscrow
	await feePoolState.setFeePool(feePool.address, { from: owner });
	await rewardEscrow.setFeePool(feePool.address, { from: owner });

	// Set delegate approval on feePool
	// Set feePool as associatedContract on delegateApprovals & feePoolEternalStorage
	await feePool.setDelegateApprovals(delegateApprovals.address, { from: owner });
	await delegateApprovals.setAssociatedContract(feePool.address, { from: owner });
	await feePoolEternalStorage.setAssociatedContract(feePool.address, { from: owner });

	// ----------------------
	// Deploy RewardDistribution
	// ----------------------
	console.log('Deploying RewardsDistribution...');
	const rewardsDistribution = await deployer.deploy(
		RewardsDistribution,
		owner,
		ZERO_ADDRESS, // Authority = Synthetix Underlying
		ZERO_ADDRESS, // Synthetix ProxyERC20
		rewardEscrow.address,
		feePoolProxy.address, // FeePoolProxy
		{
			from: deployerAccount,
		}
	);

	// Configure FeePool with the RewardsDistribution contract
	await feePool.setRewardsAuthority(rewardsDistribution.address, { from: owner });

	// ----------------
	// Synthetix
	// ----------------
	console.log('Deploying SupplySchedule...');
	// constructor(address _owner)
	deployer.link(SafeDecimalMath, SupplySchedule);
	deployer.link(MathLib, SupplySchedule);

	const lastMintEvent = 0; // No mint event, weeksSinceIssuance will use inflation start date
	const weeksOfRewardSupply = 0;
	const supplySchedule = await deployer.deploy(
		SupplySchedule,
		owner,
		lastMintEvent,
		weeksOfRewardSupply,
		{
			from: deployerAccount,
		}
	);

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
		supplySchedule.address,
		rewardEscrow.address,
		escrow.address,
		rewardsDistribution.address,
		SYNTHETIX_TOTAL_SUPPLY,
		{
			from: deployerAccount,
			gas: 8000000,
		}
	);

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
	// Connect Escrow to Synthetix
	// ----------------------
	await escrow.setSynthetix(synthetix.address, { from: owner });
	await rewardEscrow.setSynthetix(synthetix.address, { from: owner });

	// ----------------------
	// Connect FeePool
	// ----------------------
	await feePool.setSynthetix(synthetix.address, { from: owner });

	// ----------------------
	// Connect SupplySchedule
	// ----------------------
	await supplySchedule.setSynthetixProxy(synthetixProxy.address, { from: owner });

	// ----------------------
	// Connect RewardsDistribution
	// ----------------------
	await rewardsDistribution.setAuthority(synthetix.address, { from: owner });
	await rewardsDistribution.setSynthetixProxy(synthetixProxy.address, { from: owner });

	// ----------------------
	// Setup Gas Price Limit
	// ----------------------
	const gasLimit = web3.utils.toWei('25', 'gwei');

	await synthetix.setGasLimitOracle(gasLimitOracle, { from: owner });
	await synthetix.setGasPriceLimit(gasLimit, { from: gasLimitOracle });

	// ----------------
	// Synths
	// ----------------
	const currencyKeys = ['XDR', 'sUSD', 'sAUD', 'sEUR', 'sBTC', 'iBTC'];
	// Initial prices
	const { timestamp } = await web3.eth.getBlock('latest');
	// sAUD: 0.5 USD
	// sEUR: 1.25 USD
	// sBTC: 0.1
	// iBTC: 5000 USD
	// SNX: 4000 USD
	await exchangeRates.updateRates(
		currencyKeys
			.filter(currency => currency !== 'sUSD')
			.concat(['SNX'])
			.map(toBytes32),
		['5', '0.5', '1.25', '0.1', '5000', '4000'].map(number => web3.utils.toWei(number, 'ether')),
		timestamp,
		{ from: oracle }
	);

	const synths = [];

	deployer.link(SafeDecimalMath, PurgeableSynth);

	for (const currencyKey of currencyKeys) {
		console.log(`Deploying SynthTokenState for ${currencyKey}...`);
		const tokenState = await deployer.deploy(TokenState, owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		console.log(`Deploying SynthProxy for ${currencyKey}...`);
		const proxy = await deployer.deploy(Proxy, owner, { from: deployerAccount });

		console.log(`Deploying ${currencyKey} Synth...`);

		// constructor(address _proxy, TokenState _tokenState, Synthetix _synthetix, FeePool _feePool,
		//	string _tokenName, string _tokenSymbol, uint _decimals, address _owner, bytes4 _currencyKey
		// )
		const synth = await deployer.deploy(
			Synth,
			proxy.address,
			tokenState.address,
			synthetixProxy.address,
			feePoolProxy.address,
			`Synth ${currencyKey}`,
			currencyKey,
			owner,
			toBytes32(currencyKey),
			web3.utils.toWei('0'),
			{ from: deployerAccount }
		);

		console.log(`Setting associated contract for ${currencyKey} token state...`);
		await tokenState.setAssociatedContract(synth.address, { from: owner });

		console.log(`Setting proxy target for ${currencyKey} proxy...`);
		await proxy.setTarget(synth.address, { from: owner });

		// ----------------------
		// Connect Synthetix to Synth
		// ----------------------
		console.log(`Adding ${currencyKey} to Synthetix contract...`);
		await synthetix.addSynth(synth.address, { from: owner });

		synths.push({
			currencyKey,
			tokenState,
			proxy,
			synth,
		});
	}

	// --------------------
	// Depot
	// --------------------
	console.log('Deploying Depot...');
	const sUSDSynth = synths.find(synth => synth.currencyKey === 'sUSD');
	deployer.link(SafeDecimalMath, Depot);
	await deployer.deploy(
		Depot,
		owner,
		fundsWallet,
		synthetix.address,
		sUSDSynth.synth.address,
		feePool.address,
		oracle,
		web3.utils.toWei('500'),
		web3.utils.toWei('.10'),
		{ from: deployerAccount }
	);

	// ----------------------
	// Deploy DappMaintenance
	// ----------------------
	console.log('Deploying DappMaintenance...');
	await deployer.deploy(DappMaintenance, owner, {
		from: deployerAccount,
	});

	// ----------------
	// Self Destructible
	// ----------------
	console.log('Deploying SelfDestructible...');
	await deployer.deploy(SelfDestructible, owner, { from: deployerAccount });

	const tableData = [
		['Contract', 'Address'],
		['Exchange Rates', ExchangeRates.address],
		['Fee Pool', FeePool.address],
		['Fee Pool Proxy', feePoolProxy.address],
		['Fee Pool State', feePoolState.address],
		['Fee Pool Eternal Storage', feePoolEternalStorage.address],
		['Synthetix State', synthetixState.address],
		['Synthetix Token State', synthetixTokenState.address],
		['Synthetix Proxy', synthetixProxy.address],
		['Synthetix', Synthetix.address],
		['Synthetix Escrow', SynthetixEscrow.address],
		['Reward Escrow', RewardEscrow.address],
		['Rewards Distribution', RewardsDistribution.address],
		['Depot', Depot.address],
		['Owned', Owned.address],
		['SafeDecimalMath', SafeDecimalMath.address],
		['DappMaintenance', DappMaintenance.address],
		['SelfDestructible', SelfDestructible.address],
	];

	for (const synth of synths) {
		tableData.push([`${synth.currencyKey} Synth`, synth.synth.address]);
		tableData.push([`${synth.currencyKey} Proxy`, synth.proxy.address]);
		tableData.push([`${synth.currencyKey} Token State`, synth.tokenState.address]);
	}

	console.log();
	console.log();
	console.log(' Successfully deployed all contracts:');
	console.log();
	console.log(table(tableData));
};
