'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

module.exports = async ({
	account,
	addressOf,
	config,
	deployer,
	getDeployParameter,
	network,
	runStep,
	useOvm,
}) => {
	console.log(gray(`\n------ CONFIGURE LEGACY CONTRACTS VIA SETTERS ------\n`));

	const {
		DelegateApprovals,
		DelegateApprovalsEternalStorage,
		EternalStorageLiquidations,
		Exchanger,
		ExchangeState,
		FeePool,
		FeePoolEternalStorage,
		FeePoolState,
		Issuer,
		Liquidations,
		ProxyERC20,
		ProxyFeePool,
		ProxySynthetix,
		RewardEscrow,
		RewardEscrowV2,
		RewardsDistribution,
		SupplySchedule,
		Synthetix,
		SynthetixEscrow,
		SynthetixState,
		SystemStatus,
		TokenStateSynthetix,
	} = deployer.deployedContracts;

	// now configure everything
	if (network !== 'mainnet' && SystemStatus) {
		// On testnet, give the owner of SystemStatus the rights to update status
		const statusOwner = await SystemStatus.owner();
		await runStep({
			contract: 'SystemStatus',
			target: SystemStatus,
			read: 'accessControl',
			readArg: [toBytes32('System'), statusOwner],
			expected: ({ canSuspend } = {}) => canSuspend,
			write: 'updateAccessControls',
			writeArg: [
				['System', 'Issuance', 'Exchange', 'SynthExchange', 'Synth'].map(toBytes32),
				[statusOwner, statusOwner, statusOwner, statusOwner, statusOwner],
				[true, true, true, true, true],
				[true, true, true, true, true],
			],
			comment: 'Ensure the owner can suspend and resume the protocol',
		});
	}
	if (DelegateApprovals && DelegateApprovalsEternalStorage) {
		await runStep({
			contract: 'DelegateApprovalsEternalStorage',
			target: DelegateApprovalsEternalStorage,
			read: 'associatedContract',
			expected: input => input === addressOf(DelegateApprovals),
			write: 'setAssociatedContract',
			writeArg: addressOf(DelegateApprovals),
			comment: 'Ensure that DelegateApprovals contract is allowed to write to its EternalStorage',
		});
	}

	if (Liquidations && EternalStorageLiquidations) {
		await runStep({
			contract: 'EternalStorageLiquidations',
			target: EternalStorageLiquidations,
			read: 'associatedContract',
			expected: input => input === addressOf(Liquidations),
			write: 'setAssociatedContract',
			writeArg: addressOf(Liquidations),
			comment: 'Ensure the Liquidations contract is allowed to write to its EternalStorage',
		});
	}

	if (ProxyFeePool && FeePool) {
		await runStep({
			contract: 'ProxyFeePool',
			target: ProxyFeePool,
			read: 'target',
			expected: input => input === addressOf(FeePool),
			write: 'setTarget',
			writeArg: addressOf(FeePool),
			comment: 'Ensure the ProxyFeePool contract has the correct FeePool target set',
		});
	}

	if (FeePoolEternalStorage && FeePool) {
		await runStep({
			contract: 'FeePoolEternalStorage',
			target: FeePoolEternalStorage,
			read: 'associatedContract',
			expected: input => input === addressOf(FeePool),
			write: 'setAssociatedContract',
			writeArg: addressOf(FeePool),
			comment: 'Ensure the FeePool contract can write to its EternalStorage',
		});
	}

	if (FeePool && FeePoolState) {
		// Rewire FeePoolState if there is a FeePool upgrade
		await runStep({
			contract: 'FeePoolState',
			target: FeePoolState,
			read: 'feePool',
			expected: input => input === addressOf(FeePool),
			write: 'setFeePool',
			writeArg: addressOf(FeePool),
			comment: 'Ensure the FeePool contract can write to its State',
		});
	}

	if (Synthetix && ProxyERC20) {
		await runStep({
			contract: 'ProxyERC20',
			target: ProxyERC20,
			read: 'target',
			expected: input => input === addressOf(Synthetix),
			write: 'setTarget',
			writeArg: addressOf(Synthetix),
			comment: 'Ensure the SNX proxy has the correct Synthetix target set',
			// Skip solidity for this as on mainnet, as ProxySynthetix is the same and it will manage it
			skipSolidity: network === 'mainnet',
		});
		await runStep({
			contract: 'Synthetix',
			target: Synthetix,
			read: 'proxy',
			expected: input => input === addressOf(ProxyERC20),
			write: 'setProxy',
			writeArg: addressOf(ProxyERC20),
			comment: 'Ensure the Synthetix contract has the correct ERC20 proxy set',
		});
	}

	if (ProxySynthetix && Synthetix) {
		await runStep({
			contract: 'ProxySynthetix',
			target: ProxySynthetix,
			read: 'target',
			expected: input => input === addressOf(Synthetix),
			write: 'setTarget',
			writeArg: addressOf(Synthetix),
			comment: 'Ensure the SNX proxy has the correct Synthetix target set',
		});
	}

	if (Exchanger && ExchangeState) {
		// The ExchangeState contract has Exchanger as it's associated contract
		await runStep({
			contract: 'ExchangeState',
			target: ExchangeState,
			read: 'associatedContract',
			expected: input => input === Exchanger.address,
			write: 'setAssociatedContract',
			writeArg: Exchanger.address,
			comment: 'Ensure the Exchanger contract can write to its State',
		});
	}

	if (Exchanger && SystemStatus) {
		// SIP-65: ensure Exchanger can suspend synths if price spikes occur
		await runStep({
			contract: 'SystemStatus',
			target: SystemStatus,
			read: 'accessControl',
			readArg: [toBytes32('Synth'), addressOf(Exchanger)],
			expected: ({ canSuspend } = {}) => canSuspend,
			write: 'updateAccessControl',
			writeArg: [toBytes32('Synth'), addressOf(Exchanger), true, false],
			comment: 'Ensure the Exchanger contract can suspend synths - see SIP-65',
		});
	}

	// only reset token state if redeploying
	if (TokenStateSynthetix && config['TokenStateSynthetix'].deploy) {
		const initialIssuance = await getDeployParameter('INITIAL_ISSUANCE');
		await runStep({
			contract: 'TokenStateSynthetix',
			target: TokenStateSynthetix,
			read: 'balanceOf',
			readArg: account,
			expected: input => input === initialIssuance,
			write: 'setBalanceOf',
			writeArg: [account, initialIssuance],
			comment:
				'Ensure the TokenStateSynthetix contract has the correct initial issuance (WARNING: only for new deploys)',
		});
	}

	if (TokenStateSynthetix && Synthetix) {
		await runStep({
			contract: 'TokenStateSynthetix',
			target: TokenStateSynthetix,
			read: 'associatedContract',
			expected: input => input === addressOf(Synthetix),
			write: 'setAssociatedContract',
			writeArg: addressOf(Synthetix),
			comment: 'Ensure the Synthetix contract can write to its TokenState contract',
		});
	}

	if (SynthetixState && Issuer) {
		const IssuerAddress = addressOf(Issuer);
		// The SynthetixState contract has Issuer as it's associated contract (after v2.19 refactor)
		await runStep({
			contract: 'SynthetixState',
			target: SynthetixState,
			read: 'associatedContract',
			expected: input => input === IssuerAddress,
			write: 'setAssociatedContract',
			writeArg: IssuerAddress,
			comment: 'Ensure that Synthetix can write to its State contract',
		});
	}

	if (RewardEscrow && Synthetix) {
		await runStep({
			contract: 'RewardEscrow',
			target: RewardEscrow,
			read: 'synthetix',
			expected: input => input === addressOf(Synthetix),
			write: 'setSynthetix',
			writeArg: addressOf(Synthetix),
			comment: 'Ensure the legacy RewardEscrow contract is connected to the Synthetix contract',
		});
	}

	if (RewardEscrow && FeePool) {
		await runStep({
			contract: 'RewardEscrow',
			target: RewardEscrow,
			read: 'feePool',
			expected: input => input === addressOf(FeePool),
			write: 'setFeePool',
			writeArg: addressOf(FeePool),
			comment: 'Ensure the legacy RewardEscrow contract is connected to the FeePool contract',
		});
	}

	if (SupplySchedule && Synthetix) {
		await runStep({
			contract: 'SupplySchedule',
			target: SupplySchedule,
			read: 'synthetixProxy',
			expected: input => input === addressOf(ProxyERC20),
			write: 'setSynthetixProxy',
			writeArg: addressOf(ProxyERC20),
			comment: 'Ensure the SupplySchedule is connected to the SNX proxy for reading',
		});
	}

	if (Synthetix && RewardsDistribution) {
		await runStep({
			contract: 'RewardsDistribution',
			target: RewardsDistribution,
			read: 'authority',
			expected: input => input === addressOf(Synthetix),
			write: 'setAuthority',
			writeArg: addressOf(Synthetix),
			comment: 'Ensure the RewardsDistribution has Synthetix set as its authority for distribution',
		});

		await runStep({
			contract: 'RewardsDistribution',
			target: RewardsDistribution,
			read: 'synthetixProxy',
			expected: input => input === addressOf(ProxyERC20),
			write: 'setSynthetixProxy',
			writeArg: addressOf(ProxyERC20),
			comment: 'Ensure the RewardsDistribution can find the Synthetix proxy to read and transfer',
		});
	}

	// RewardEscrow on RewardsDistribution should be set to new RewardEscrowV2
	if (RewardEscrowV2 && RewardsDistribution) {
		await runStep({
			contract: 'RewardsDistribution',
			target: RewardsDistribution,
			read: 'rewardEscrow',
			expected: input => input === addressOf(RewardEscrowV2),
			write: 'setRewardEscrow',
			writeArg: addressOf(RewardEscrowV2),
			comment: 'Ensure the RewardsDistribution can read the RewardEscrowV2 address',
		});
	}

	// ----------------
	// Setting ProxyERC20 Synthetix for SynthetixEscrow
	// ----------------

	// Skip setting unless redeploying either of these,
	if (config['Synthetix'].deploy || config['SynthetixEscrow'].deploy) {
		// Note: currently on mainnet SynthetixEscrow.Synthetix() does NOT exist
		// it is "havven" and the ABI we have here is not sufficient
		if (network === 'mainnet' && !useOvm) {
			await runStep({
				contract: 'SynthetixEscrow',
				target: SynthetixEscrow,
				read: 'havven',
				expected: input => input === addressOf(ProxyERC20),
				write: 'setHavven',
				writeArg: addressOf(ProxyERC20),
				comment:
					'Ensure the legacy token sale escrow can find the Synthetix proxy to read and transfer',
			});
		} else {
			await runStep({
				contract: 'SynthetixEscrow',
				target: SynthetixEscrow,
				read: 'synthetix',
				expected: input => input === addressOf(ProxyERC20),
				write: 'setSynthetix',
				writeArg: addressOf(ProxyERC20),
				comment: 'Ensure the token sale escrow can find the Synthetix proxy to read and transfer',
			});
		}
	}
};
