/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       FeePoolState.sol
version:    1.0
author:     Clinton Ennis
            Jackson Chan
date:       2019-04-05

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

The FeePoolState simply stores the accounts issuance ratio for
each fee period in the FeePool.

This is use to caclulate the correct allocation of fees/rewards
owed to minters of the stablecoin total supply

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./SelfDestructible.sol";
import "./SafeDecimalMath.sol";
import "./LimitedSetup.sol";
import "./interfaces/IFeePool.sol";

contract FeePoolState is SelfDestructible, LimitedSetup {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== STATE VARIABLES ========== */

    uint8 constant public FEE_PERIOD_LENGTH = 6;

    address public feePool;

    // The IssuanceData activity that's happened in a fee period.
    struct IssuanceData {
        uint224 debtPercentage;
        uint32 debtEntryIndex;
    }

    // The IssuanceData activity that's happened in a fee period.
    mapping(address => IssuanceData[FEE_PERIOD_LENGTH]) private _accountIssuanceLedger;
    mapping(address => uint256) private _currentAccountPeriod;

    /**
     * @dev Constructor.
     * @param _owner The owner of this contract.
     */
    constructor(address _owner, IFeePool _feePool)
        SelfDestructible(_owner)
        LimitedSetup(6 weeks)
        public
    {
        feePool = _feePool;
    }

    function _accountIssuanceLedgerStorage(address account, uint256 index) internal view returns(IssuanceData storage) {
        uint256 shiftedIndex = _currentAccountPeriod[account].add(index).mod(FEE_PERIOD_LENGTH);
        return _accountIssuanceLedger[account][shiftedIndex];
    }

    function _setAccountIssuanceLedgerStorage(address account, uint256 index, IssuanceData memory data) internal {
        uint256 shiftedIndex = _currentAccountPeriod[account].add(index).mod(FEE_PERIOD_LENGTH);
        _accountIssuanceLedger[account][shiftedIndex] = data;
    }

    /* ========== SETTERS ========== */

    /**
     * @notice set the FeePool contract as it is the only authority to be able to call
     * appendAccountIssuanceRecord with the onlyFeePool modifer
     * @dev Must be set by owner when FeePool logic is upgraded
     */
    function setFeePool(IFeePool _feePool)
        external
        onlyOwner
    {
        feePool = _feePool;
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Get an accounts issuanceData for
     * @param account users account
     * @param index Index in the array to retrieve. Upto FEE_PERIOD_LENGTH
     */
    function getAccountsDebtEntry(address account, uint index)
        public
        view
        returns (uint debtPercentage, uint debtEntryIndex)
    {
        require(index < FEE_PERIOD_LENGTH, "index exceeds the FEE_PERIOD_LENGTH");

        IssuanceData storage data = _accountIssuanceLedgerStorage(account, index);
        return (
            data.debtPercentage,
            data.debtEntryIndex
        );
    }

    /**
     * @notice Find the oldest debtEntryIndex for the corresponding closingDebtIndex
     * @param account users account
     * @param closingDebtIndex the last periods debt index on close
     */
    function applicableIssuanceData(address account, uint closingDebtIndex)
        external
        view
        returns (uint, uint)
    {
        IssuanceData[FEE_PERIOD_LENGTH] storage issuanceData = _accountIssuanceLedger[account];
        uint start = _currentAccountPeriod[account];
        
        // We want to use the user's debtEntryIndex at when the period closed
        // Find the oldest debtEntryIndex for the corresponding closingDebtIndex
        for (uint i = 0; i < FEE_PERIOD_LENGTH; i++) {
            uint index = start.add(i).mod(FEE_PERIOD_LENGTH);
            if (closingDebtIndex >= issuanceData[index].debtEntryIndex) {
                return (issuanceData[index].debtPercentage, issuanceData[index].debtEntryIndex);
            }
        }
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Logs an accounts issuance data in the current fee period which is then stored historically
     * @param account Message.Senders account address
     * @param debtRatio Debt percentage this account has locked after minting or burning their synth
     * @param debtEntryIndex The index in the global debt ledger. synthetix.synthetixState().issuanceData(account)
     * @param currentPeriodStartDebtIndex The startingDebtIndex of the current fee period
     * @dev onlyFeePool to call me on synthetix.issue() & synthetix.burn() calls to store the locked SNX
     * per fee period so we know to allocate the correct proportions of fees and rewards per period
      accountIssuanceLedger[account][0] has the latest locked amount for the current period. This can be update as many time
      accountIssuanceLedger[account][1-3] has the last locked amount for a previous period they minted or burned
     */
    function appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex, uint currentPeriodStartDebtIndex)
        external
        onlyFeePool
    {
        // Is the current debtEntryIndex within this fee period
        if (_accountIssuanceLedgerStorage(account, 0).debtEntryIndex < currentPeriodStartDebtIndex) {
             // If its older then shift the previous IssuanceData entries periods down to make room for the new one.
            issuanceDataIndexOrder(account);
        }
        
        // Always store the latest IssuanceData entry at [0]
        _setAccountIssuanceLedgerStorage(
            account,
            0,
            IssuanceData({
                debtPercentage: uint224(debtRatio),
                debtEntryIndex: uint32(debtEntryIndex)
            })
        );
    }

    /**
     * @notice Pushes down the entire array of debt ratios per fee period
     */
    function issuanceDataIndexOrder(address account)
        private
    {
        uint256 start = _currentAccountPeriod[account];
        _currentAccountPeriod[account] = start.add(FEE_PERIOD_LENGTH).sub(1).mod(FEE_PERIOD_LENGTH);
    }

    /**
     * @notice Import issuer data from synthetixState.issuerData on FeePeriodClose() block #
     * @dev Only callable by the contract owner, and only for 6 weeks after deployment.
     * @param accounts Array of issuing addresses
     * @param ratios Array of debt ratios
     * @param periodToInsert The Fee Period to insert the historical records into
     * @param feePeriodCloseIndex An accounts debtEntryIndex is valid when within the fee peroid,
     * since the input ratio will be an average of the pervious periods it just needs to be
     * > recentFeePeriods[periodToInsert].startingDebtIndex
     * < recentFeePeriods[periodToInsert - 1].startingDebtIndex
     */
    function importIssuerData(address[] accounts, uint[] ratios, uint periodToInsert, uint feePeriodCloseIndex)
        external
        onlyOwner
        onlyDuringSetup
    {
        require(accounts.length == ratios.length, "Length mismatch");

        for (uint8 i = 0; i < accounts.length; i++) {
            _setAccountIssuanceLedgerStorage(
                accounts[i],
                periodToInsert,
                IssuanceData({
                    debtPercentage: uint224(ratios[i]),
                    debtEntryIndex: uint32(feePeriodCloseIndex)
                })
            );
            emit IssuanceDebtRatioEntry(accounts[i], ratios[i], feePeriodCloseIndex);
        }
    }

    /* ========== MODIFIERS ========== */

    modifier onlyFeePool
    {
        require(msg.sender == address(feePool), "Only the FeePool contract can perform this action");
        _;
    }

    /* ========== Events ========== */
    event IssuanceDebtRatioEntry(address indexed account, uint debtRatio, uint feePeriodCloseIndex);
}
