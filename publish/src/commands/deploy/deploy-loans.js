'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

module.exports = async ({ account, addressOf, deployer, getDeployParameter, network, useOvm }) => {
	console.log(gray(`\n------ DEPLOY ANCILLARY CONTRACTS ------\n`));

	const { ReadProxyAddressResolver } = deployer.deployedContracts;

	await deployer.deployContract({
		name: 'Depot',
		deps: ['ProxySynthetix', 'SynthsUSD', 'FeePool'],
		args: [account, account, addressOf(ReadProxyAddressResolver)],
	});

	let WETH_ADDRESS = (await getDeployParameter('WETH_ERC20_ADDRESSES'))[network];

	if (network === 'local') {
		// On local, deploy a mock WETH token.
		// OVM already has a deployment of WETH, however since we use
		// Hardhat for the local-ovm environment, we must deploy
		// our own.
		const weth = await deployer.deployContract({
			name: 'WETH',
			source: useOvm ? 'MockWETH' : 'WETH',
		});
		weth.skipResolver = true;
		WETH_ADDRESS = weth.address;
	}

	if (!WETH_ADDRESS) {
		throw new Error('WETH address is not known');
	}

	await deployer.deployContract({
		name: 'EtherWrapper',
		source: useOvm ? 'EmptyEtherWrapper' : 'EtherWrapper',
		deps: ['AddressResolver'],
		args: useOvm ? [] : [account, addressOf(ReadProxyAddressResolver), WETH_ADDRESS],
	});

	if (!useOvm) {
		await deployer.deployContract({
			name: 'NativeEtherWrapper',
			deps: ['AddressResolver'],
			args: [account, addressOf(ReadProxyAddressResolver)],
		});
	}

	// ----------------
	// LINK Wrapper
	// ----------------

	let LINK_ADDRESS = (await getDeployParameter('LINK_ERC20_ADDRESSES'))[network];

	if (network === 'local') {
		// On local, deploy a mock WETH token.
		// OVM already has a deployment of WETH, however since we use
		// Hardhat for the local-ovm environment, we must deploy
		// our own.
		const link = await deployer.deployContract({
			name: 'LINK',
			source: 'MockToken',
		});
		link.skipResolver = true;
		LINK_ADDRESS = link.address;
	}

	if (!LINK_ADDRESS) {
		throw new Error('LINK address is not known');
	}

	await deployer.deployContract({
		name: 'LinkWrapper',
		source: useOvm ? 'EmptyLinkWrapper' : 'LinkWrapper',
		deps: ['AddressResolver'],
		args: useOvm ? [] : [account, addressOf(ReadProxyAddressResolver), LINK_ADDRESS],
	});

	// ----------------
	// Multi Collateral System
	// ----------------

	const collateralManagerDefaults = await getDeployParameter('COLLATERAL_MANAGER');

	console.log(gray(`\n------ DEPLOY MULTI COLLATERAL ------\n`));

	await deployer.deployContract({
		name: 'CollateralUtil',
		args: [addressOf(ReadProxyAddressResolver)],
	});

	const collateralManagerState = await deployer.deployContract({
		name: 'CollateralManagerState',
		args: [account, account],
	});

	const useEmptyCollateralManager = useOvm;
	const collateralManager = await deployer.deployContract({
		name: 'CollateralManager',
		source: useEmptyCollateralManager ? 'EmptyCollateralManager' : 'CollateralManager',
		args: useEmptyCollateralManager
			? []
			: [
					addressOf(collateralManagerState),
					account,
					addressOf(ReadProxyAddressResolver),
					collateralManagerDefaults['MAX_DEBT'],
					collateralManagerDefaults['BASE_BORROW_RATE'],
					collateralManagerDefaults['BASE_SHORT_RATE'],
			  ],
	});

	const collateralStateEth = await deployer.deployContract({
		name: 'CollateralStateEth',
		source: 'CollateralState',
		args: [account, account],
	});

	await deployer.deployContract({
		name: 'CollateralEth',
		args: [
			addressOf(collateralStateEth),
			account,
			addressOf(collateralManager),
			addressOf(ReadProxyAddressResolver),
			toBytes32('sETH'),
			(await getDeployParameter('COLLATERAL_ETH'))['MIN_CRATIO'],
			(await getDeployParameter('COLLATERAL_ETH'))['MIN_COLLATERAL'],
		],
	});

	const collateralStateErc20 = await deployer.deployContract({
		name: 'CollateralStateErc20',
		source: 'CollateralState',
		args: [account, account],
	});

	let RENBTC_ADDRESS = (await getDeployParameter('RENBTC_ERC20_ADDRESSES'))[network];
	if (!RENBTC_ADDRESS) {
		if (network !== 'local') {
			throw new Error('renBTC address is not known');
		}

		// On local, deploy a mock renBTC token to use as the underlying in CollateralErc20
		const renBTC = await deployer.deployContract({
			name: 'MockToken',
			args: ['renBTC', 'renBTC', 8],
		});

		// this could be undefined in an env where MockToken is not listed in the config flags
		RENBTC_ADDRESS = renBTC ? renBTC.address : undefined;
	}

	await deployer.deployContract({
		name: 'CollateralErc20',
		source: 'CollateralErc20',
		args: [
			addressOf(collateralStateErc20),
			account,
			addressOf(collateralManager),
			addressOf(ReadProxyAddressResolver),
			toBytes32('sBTC'),
			(await getDeployParameter('COLLATERAL_RENBTC'))['MIN_CRATIO'],
			(await getDeployParameter('COLLATERAL_RENBTC'))['MIN_COLLATERAL'],
			RENBTC_ADDRESS, // if undefined then this will error as expected.
			8,
		],
	});

	const collateralStateShort = await deployer.deployContract({
		name: 'CollateralStateShort',
		source: 'CollateralState',
		args: [account, account],
	});

	await deployer.deployContract({
		name: 'CollateralShort',
		args: [
			addressOf(collateralStateShort),
			account,
			addressOf(collateralManager),
			addressOf(ReadProxyAddressResolver),
			toBytes32('sUSD'),
			(await getDeployParameter('COLLATERAL_SHORT'))['MIN_CRATIO'],
			(await getDeployParameter('COLLATERAL_SHORT'))['MIN_COLLATERAL'],
		],
	});

	return {
		collateralManagerDefaults,
		useEmptyCollateralManager,
	};
};
