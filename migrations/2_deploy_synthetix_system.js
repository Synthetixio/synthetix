const { table } = require('table');
const { gray, green } = require('chalk');

const { toBytes32 } = require('../.');

const AddressResolver = artifacts.require('AddressResolver');
const SystemStatus = artifacts.require('SystemStatus');
const EtherCollateral = artifacts.require('EtherCollateral');
const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const FeePoolState = artifacts.require('FeePoolState');
const FeePoolEternalStorage = artifacts.require('FeePoolEternalStorage');
const IssuanceEternalStorage = artifacts.require('IssuanceEternalStorage');
const EternalStorage = artifacts.require('EternalStorage');
const DelegateApprovals = artifacts.require('DelegateApprovals');
const Synthetix = artifacts.require('Synthetix');
const Exchanger = artifacts.require('Exchanger');
const ExchangeState = artifacts.require('ExchangeState');
const Issuer = artifacts.require('Issuer');
const SynthetixEscrow = artifacts.require('SynthetixEscrow');
const RewardEscrow = artifacts.require('RewardEscrow');
const RewardsDistribution = artifacts.require('RewardsDistribution');
const SynthetixState = artifacts.require('SynthetixState');
const SupplySchedule = artifacts.require('SupplySchedule');
const Synth = artifacts.require('Synth');
const MultiCollateralSynth = artifacts.require('MultiCollateralSynth');
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

// Update values before deployment
const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('100000000');

module.exports = async function(deployer, network, accounts) {
	const [deployerAccount, owner, oracle, fundsWallet] = accounts;

	// Note: This deployment script is not used on mainnet, it's only for testing deployments.
	const deployedContracts = [];

	const deploy = async (...args) => {
		const contract = await deployer.deploy(...args);
		deployedContracts.push(contract);
		return contract;
	};

	// The Owned contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Owned
	// ----------------
	await deploy(Owned, owner, { from: deployerAccount });

	// ----------------
	// Safe Decimal Math library
	// ----------------
	console.log(gray('Deploying SafeDecimalMath...'));
	await deploy(SafeDecimalMath, { from: deployerAccount });

	// ----------------
	// Math library
	// ----------------
	console.log(gray('Deploying Math library...'));
	await deployer.link(SafeDecimalMath, MathLib);
	await deploy(MathLib, { from: deployerAccount });

	// The PublicSafeDecimalMath contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Public Safe Decimal Math Library
	// ----------------
	await deployer.link(SafeDecimalMath, PublicSafeDecimalMath);
	await deploy(PublicSafeDecimalMath, { from: deployerAccount });

	// The PublicMath contract is not used in a standalone way on mainnet, this is for testing
	// ----------------
	// Public Math Library
	// ----------------
	await deployer.link(SafeDecimalMath, PublicMath);
	await deployer.link(MathLib, PublicMath);
	await deploy(PublicMath, { from: deployerAccount });

	// ----------------
	// AddressResolver
	// ----------------
	console.log(gray('Deploying AddressResolver...'));
	const resolver = await deploy(AddressResolver, owner, { from: deployerAccount });

	console.log(gray('Deploying SystemStatus...'));
	const systemStatus = await deploy(SystemStatus, owner, { from: deployerAccount });

	// ----------------
	// Exchange Rates
	// ----------------
	console.log(gray('Deploying ExchangeRates...'));
	await deployer.link(SafeDecimalMath, ExchangeRates);
	const exchangeRates = await deploy(
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
	console.log(gray('Deploying SynthetixEscrow...'));
	const escrow = await deploy(SynthetixEscrow, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log(gray('Deploying RewardEscrow...'));
	const rewardEscrow = await deploy(RewardEscrow, owner, ZERO_ADDRESS, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	// ----------------
	// Synthetix State
	// ----------------
	console.log(gray('Deploying SynthetixState...'));
	// constructor(address _owner, address _associatedContract)
	await deployer.link(SafeDecimalMath, SynthetixState);
	const synthetixState = await deploy(SynthetixState, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	// ----------------
	// Delegate Approval
	// ----------------
	console.log(gray('Deploying Delegate Approvals EternalStorage...'));
	const delegateApprovalsEternalStorage = await deploy(EternalStorage, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log(gray('Deploying Delegate Approvals...'));
	const delegateApprovals = await deploy(
		DelegateApprovals,
		owner,
		delegateApprovalsEternalStorage.address,
		{
			from: deployerAccount,
		}
	);

	// set associatedContract on delegateApprovalsEternalStorage
	await delegateApprovalsEternalStorage.setAssociatedContract(delegateApprovals.address, {
		from: owner,
	});

	// ----------------
	// Fee Pool
	// ----------------
	console.log(gray('Deploying FeePoolProxy...'));
	// constructor(address _owner)
	const feePoolProxy = await Proxy.new(owner, { from: deployerAccount });

	console.log(gray('Deploying FeePoolState...'));
	await deployer.link(SafeDecimalMath, FeePoolState);
	const feePoolState = await deploy(FeePoolState, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log(gray('Deploying FeePoolEternalStorage...'));
	await deployer.link(SafeDecimalMath, FeePoolEternalStorage);
	const feePoolEternalStorage = await deploy(FeePoolEternalStorage, owner, ZERO_ADDRESS, {
		from: deployerAccount,
	});

	console.log(gray('Deploying FeePool...'));
	await deployer.link(SafeDecimalMath, FeePool);
	const feePool = await deploy(
		FeePool,
		feePoolProxy.address,
		owner,
		web3.utils.toWei('0.0030', 'ether'),
		resolver.address,
		{ from: deployerAccount }
	);

	await feePoolProxy.setTarget(feePool.address, { from: owner });

	// Set feePool on feePoolState & rewardEscrow
	await feePoolState.setFeePool(feePool.address, { from: owner });

	await rewardEscrow.setFeePool(feePool.address, { from: owner });
	// Set feePoolEternalStorage
	await feePoolEternalStorage.setAssociatedContract(feePool.address, { from: owner });

	// ----------------------
	// Deploy RewardDistribution
	// ----------------------
	console.log(gray('Deploying RewardsDistribution...'));
	const rewardsDistribution = await deploy(
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

	// ----------------
	// Synthetix
	// ----------------
	console.log(gray('Deploying SupplySchedule...'));
	// constructor(address _owner)
	await deployer.link(SafeDecimalMath, SupplySchedule);
	await deployer.link(MathLib, SupplySchedule);

	const lastMintEvent = 0; // No mint event, weeksSinceIssuance will use inflation start date
	const weeksOfRewardSupply = 0;
	const supplySchedule = await deploy(SupplySchedule, owner, lastMintEvent, weeksOfRewardSupply, {
		from: deployerAccount,
	});

	console.log(gray('Deploying SynthetixProxy...'));
	// constructor(address _owner)
	const synthetixProxy = await Proxy.new(owner, { from: deployerAccount });

	console.log(gray('Deploying SynthetixTokenState...'));
	// constructor(address _owner, address _associatedContract)
	const synthetixTokenState = await TokenState.new(owner, deployerAccount, {
		from: deployerAccount,
	});

	console.log(gray('Deploying Synthetix...'));
	await deployer.link(SafeDecimalMath, Synthetix);
	const block = await web3.eth.getBlock('latest');
	const synthetix = await deploy(
		Synthetix,
		synthetixProxy.address,
		synthetixTokenState.address,
		owner,
		SYNTHETIX_TOTAL_SUPPLY,
		resolver.address,
		{
			from: deployerAccount,
			gas: block.gasLimit,
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
	// Connect Proxy
	// ----------------------
	await synthetixProxy.setTarget(synthetix.address, { from: owner });

	// ----------------------
	// Connect Escrow to Synthetix
	// ----------------------
	await escrow.setSynthetix(synthetix.address, { from: owner });
	await rewardEscrow.setSynthetix(synthetix.address, { from: owner });

	// ----------------------
	// Connect SupplySchedule
	// ----------------------
	await supplySchedule.setSynthetixProxy(synthetixProxy.address, { from: owner });

	// ----------------------
	// Connect RewardsDistribution
	// ----------------------
	await rewardsDistribution.setAuthority(synthetix.address, { from: owner });
	await rewardsDistribution.setSynthetixProxy(synthetixProxy.address, { from: owner });

	// ----------------
	// Synths
	// ----------------
	const currencyKeys = ['sUSD', 'sAUD', 'sEUR', 'sBTC', 'iBTC', 'sETH'];
	// const currencyKeys = ['sUSD', 'sETH'];
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
		// ['172', '1.20'].map(number =>
		['0.5', '1.25', '0.1', '5000', '4000', '172'].map(number => web3.utils.toWei(number, 'ether')),
		timestamp,
		{ from: oracle }
	);

	const synths = [];

	await deployer.link(SafeDecimalMath, PurgeableSynth);

	for (const currencyKey of currencyKeys) {
		console.log(gray(`Deploying SynthTokenState for ${currencyKey}...`));
		const tokenState = await deploy(TokenState, owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		console.log(gray(`Deploying SynthProxy for ${currencyKey}...`));
		const proxy = await deploy(Proxy, owner, { from: deployerAccount });

		let SynthSubclass = Synth;
		// Determine class of Synth
		if (currencyKey === 'sETH') {
			SynthSubclass = MultiCollateralSynth;
		}

		const synthParams = [
			SynthSubclass,
			proxy.address,
			tokenState.address,
			`Synth ${currencyKey}`,
			currencyKey,
			owner,
			toBytes32(currencyKey),
			web3.utils.toWei('0'),
			resolver.address,
			{ from: deployerAccount },
		];

		if (currencyKey === 'sETH') {
			synthParams.splice(synthParams.length - 1, 0, toBytes32('EtherCollateral'));
		}

		console.log(`Deploying ${currencyKey} Synth...`);

		const synth = await deploy(...synthParams);

		console.log(gray(`Setting associated contract for ${currencyKey} token state...`));
		await tokenState.setAssociatedContract(synth.address, { from: owner });

		console.log(gray(`Setting proxy target for ${currencyKey} proxy...`));
		await proxy.setTarget(synth.address, { from: owner });

		// ----------------------
		// Connect Synthetix to Synth
		// ----------------------
		console.log(gray(`Adding ${currencyKey} to Synthetix contract...`));
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
	console.log(gray('Deploying Depot...'));
	await deployer.link(SafeDecimalMath, Depot);
	const depot = await deploy(Depot, owner, fundsWallet, resolver.address, {
		from: deployerAccount,
	});

	// --------------------
	// EtherCollateral
	// --------------------
	console.log('Deploying EtherCollateral...');
	// Needs the SynthsETH & SynthsUSD in the address resolver
	const sETHSynth = synths.find(synth => synth.currencyKey === 'sETH');
	const sUSDSynth = synths.find(synth => synth.currencyKey === 'sUSD');
	await deployer.link(SafeDecimalMath, EtherCollateral);
	const etherCollateral = await deploy(EtherCollateral, owner, resolver.address, {
		from: deployerAccount,
	});

	// ----------------
	// Self Destructible
	// ----------------
	console.log(gray('Deploying SelfDestructible...'));
	await deploy(SelfDestructible, owner, { from: deployerAccount });

	// ----------------
	// Exchanger
	// ----------------
	console.log(gray('Deploying Exchanger...'));
	await deployer.link(SafeDecimalMath, Exchanger);
	const exchanger = await deploy(Exchanger, owner, resolver.address, {
		from: deployerAccount,
	});

	// ----------------
	// ExchangeState
	// ----------------
	console.log(gray('Deploying ExchangeState...'));
	// await deployer.link(SafeDecimalMath, ExchangeState);
	const exchangeState = await deploy(ExchangeState, owner, exchanger.address, {
		from: deployerAccount,
	});

	// ----------------
	// Issuer
	// ----------------
	console.log(gray('Deploying Issuer...'));
	await deployer.link(SafeDecimalMath, Issuer);
	const issuer = await deploy(Issuer, owner, resolver.address, { from: deployerAccount });

	console.log(gray('Deploying IssuanceEternalStorage...'));
	const issuanceEternalStorage = await deployer.deploy(
		IssuanceEternalStorage,
		owner,
		issuer.address,
		{
			from: deployerAccount,
		}
	);

	// ----------------------
	// Connect Synthetix State to the Issuer
	// ----------------------
	console.log(gray('Setting associated contract of SynthetixState to Issuer...'));
	await synthetixState.setAssociatedContract(issuer.address, { from: owner });

	// -----------------
	// Updating Resolver
	// -----------------
	console.log(gray('Adding addresses to Resolver...'));

	// Note: this is a list that is suppossed to correspond to the total list of
	// MixinResolver.getResolverAddressesRequired() (see deploy script which pulls that down).
	// As this migration script is being EOL in favor of the deploy script,
	// we are accepting of this shortcoming for now and are hardcoding the addresses.
	await resolver.importAddresses(
		[
			'DelegateApprovals',
			'Depot',
			'EtherCollateral',
			'Exchanger',
			'ExchangeRates',
			'ExchangeState',
			'FeePool',
			'FeePoolEternalStorage',
			'FeePoolState',
			'Issuer',
			'IssuanceEternalStorage',
			'RewardEscrow',
			'RewardsDistribution',
			'SupplySchedule',
			'Synthetix',
			'SynthetixEscrow',
			'SynthetixState',
			'SynthsETH',
			'SynthsUSD',
			'SystemStatus',
		].map(toBytes32),
		[
			delegateApprovals.address,
			depot.address,
			etherCollateral.address,
			exchanger.address,
			exchangeRates.address,
			exchangeState.address,
			feePool.address,
			feePoolEternalStorage.address,
			feePoolState.address,
			issuer.address,
			issuanceEternalStorage.address,
			rewardEscrow.address,
			rewardsDistribution.address,
			supplySchedule.address,
			synthetix.address,
			escrow.address,
			synthetixState.address,
			sETHSynth.synth.address,
			sUSDSynth.synth.address,
			systemStatus.address,
		],
		{ from: owner }
	);

	// now call setResolverAndSyncCache on all contracts with it
	await Promise.all(
		deployedContracts
			.filter(
				contract => contract && contract.abi.find(({ name }) => name === 'setResolverAndSyncCache')
			)
			.map(contract => contract.setResolverAndSyncCache(resolver.address, { from: owner }))
	);

	const tableData = [
		['Contract', 'Address'],
		['AddressResolver', resolver.address],
		['DelegateApprovals', delegateApprovals.address],
		['EtherCollateral', etherCollateral.address],
		['Exchange Rates', exchangeRates.address],
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
		['SelfDestructible', SelfDestructible.address],
		['Issuer', issuer.address],
		['Issuance Eternal Storage', issuanceEternalStorage.address],
	];

	for (const synth of synths) {
		tableData.push([`${synth.currencyKey} Synth`, synth.synth.address]);
		tableData.push([`${synth.currencyKey} Proxy`, synth.proxy.address]);
		tableData.push([`${synth.currencyKey} Token State`, synth.tokenState.address]);
	}

	console.log();
	console.log(gray(table(tableData)));
	console.log();
	console.log(green('Successfully deployed all contracts:'));
	console.log();
};
