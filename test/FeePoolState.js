const FeePool = artifacts.require('FeePool');
const FeePoolState = artifacts.require('FeePoolState');
const Synthetix = artifacts.require('Synthetix');
const ExchangeRates = artifacts.require('ExchangeRates');

const { getWeb3, getContractInstance, sendParameters } = require('../utils/web3Helper');

const {
	currentTime,
	fastForward,
	toPreciseUnit,
	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');
const web3 = getWeb3();

contract.only('FeePoolState', async function(accounts) {
	const [
		deployerAccount,
		owner,
		oracle,
		feeAuthority,
		account1,
		account2,
		account3,
		account4,
	] = accounts;

	const [sUSD, sEUR, sAUD, sBTC, SNX] = ['sUSD', 'sEUR', 'sAUD', 'sBTC', 'SNX'].map(
		web3.utils.asciiToHex
	);

	let feePool, feePoolState, synthetix, exchangeRates;

	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC],
			['0.5', '1.25', '0.1', '4000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	// fastForward to the next period, close the current and update the rates as they will be stale
	const closeFeePeriod = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });
		await updateRatesWithDefaults();
	};

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		feePoolState = await FeePoolState.deployed();
		feePool = await FeePool.deployed();
		exchangeRates = await ExchangeRates.deployed();
		synthetix = await Synthetix.deployed();

		// Send a price update to guarantee we're not stale.
		await updateRatesWithDefaults();
	});

	it('should set constructor params on deployment', async function() {
		const instance = await FeePoolState.new(owner, feePool.address, { from: deployerAccount });
		assert.equal(await instance.feePool(), feePool.address);
		assert.equal(await instance.owner(), owner);
	});

	describe('Appending Account issuance record', async function() {
		async function checkIssuanceLedgerData(
			address,
			issuanceLedgerIndex,
			expectedEntryIndex,
			expectedDebtPercentage
		) {
			const accountLedger = await feePoolState.accountIssuanceLedger(address, issuanceLedgerIndex); // accountIssuanceLedger[address][index]
			console.log(
				'ledger from feepool',
				issuanceLedgerIndex,
				accountLedger.debtEntryIndex.toString(),
				accountLedger.debtPercentage.toString()
			);
			assert.bnEqual(accountLedger.debtEntryIndex, expectedEntryIndex);
			assert.bnEqual(accountLedger.debtPercentage, expectedDebtPercentage);
		}

		const issuanceData = [
			{ address: account3, debtRatio: '1', debtEntryIndex: '0' },
			{ address: account3, debtRatio: '1', debtEntryIndex: '1' },
			{ address: account3, debtRatio: '1', debtEntryIndex: '2' },
			{ address: account3, debtRatio: '1', debtEntryIndex: '3' },
			{ address: account3, debtRatio: '1', debtEntryIndex: '4' },
			{ address: account3, debtRatio: '0.5', debtEntryIndex: '5' },
		];

		it.only('should append account issuance record for curent feePeriod', async function() {
			await feePool.setSynthetix(account1, { from: owner });

			// mint more synths and append to ledger in Period[0]
			await feePool.appendAccountIssuanceRecord(
				issuanceData[0].address,
				toPreciseUnit(issuanceData[0].debtRatio),
				issuanceData[0].debtEntryIndex,
				{ from: account1 }
			);

			// check the latest accountIssuance for account1
			await checkIssuanceLedgerData(
				issuanceData[0].address,
				0,
				issuanceData[0].debtEntryIndex,
				toPreciseUnit(issuanceData[0].debtRatio)
			);

			// reset synthetix to Synthetix
			await feePool.setSynthetix(Synthetix.address, { from: owner });

			await closeFeePeriod();

			await feePool.setSynthetix(account1, { from: owner });

			// mint more synths and append to ledger in Period[1]
			await feePool.appendAccountIssuanceRecord(
				issuanceData[1].address,
				toPreciseUnit(issuanceData[1].debtRatio),
				issuanceData[1].debtEntryIndex,
				{ from: account1 }
			);

			// accountIssuanceLedger[0] has new issuanceData
			await checkIssuanceLedgerData(
				issuanceData[1].address,
				0,
				issuanceData[1].debtEntryIndex,
				toPreciseUnit(issuanceData[1].debtRatio)
			);
		});

		it('should append account issuance record twice for each feePeriod, up to feePeriod length', async function() {
			const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
			const initialDebtRatio = toUnit('1');
			const secondDebtRatio = toUnit('.5');
			let entryIndexCounter = 0;

			// loop through the feePeriods
			for (let i = 0; i < length; i++) {
				await feePool.setSynthetix(account1, { from: owner });

				// write an entry to debt ledger in Period[0]
				console.log(
					'appending data, debt ratio, debtEntryIndex',
					initialDebtRatio,
					entryIndexCounter
				);
				await feePool.appendAccountIssuanceRecord(account3, initialDebtRatio, entryIndexCounter, {
					from: account1,
				});
				entryIndexCounter++;
				// overwrite the previous entry to debt ledger in Period[0]
				console.log(
					'appending data, debt ratio, debtEntryIndex',
					secondDebtRatio,
					entryIndexCounter
				);
				await feePool.appendAccountIssuanceRecord(account3, secondDebtRatio, entryIndexCounter, {
					from: account1,
				});
				entryIndexCounter++;

				// reset synthetix to Synthetix
				await feePool.setSynthetix(Synthetix.address, { from: owner });

				// Close the period to lock in this entry and start writing to [0]
				await closeFeePeriod();
			}
			// address, issuanceLedgerIndex, expectedEntryIndex, expectedDebtPercentage
			await checkIssuanceLedgerData(account3, 0, '11', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 1, '9', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 2, '7', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 3, '5', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 4, '3', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 5, '1', secondDebtRatio);
		});
	});
});
