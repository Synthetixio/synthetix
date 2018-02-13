/* PublicHavven.sol: expose the internal functions in Havven
 * for testing purposes.
 */

pragma solidity ^0.4.19;


import "contracts/Havven.sol";


// Public getters for all items in the Havven contract, used for debugging/testing
contract PublicHavven is Havven {

    function PublicHavven(address _owner)
        Havven(_owner)
        public
    {
        // Because ganache does not reset the timestamp when reverting.
        setupDuration = 50000 weeks;
    }

    function _currentBalanceSum(address account)
        public
        view
        returns (uint)
    {
        return currentBalanceSum[account];
    }

    function _lastTransferTimestamp(address account)
        public
        view
        returns (uint)
    {
        return lastTransferTimestamp[account];
    }

    function _hasWithdrawnLastPeriodFees(address account)
        public
        view
        returns (bool)
    {
        return hasWithdrawnLastPeriodFees[account];
    }

    function _lastFeePeriodStartTime()
        public
        view
        returns (uint)
    {
        return lastFeePeriodStartTime;
    }

    function _penultimateFeePeriodStartTime()
        public
        view
        returns (uint)
    {
        return penultimateFeePeriodStartTime;
    }

    function _MIN_FEE_PERIOD_DURATION_SECONDS()
        public
        view
        returns (uint)
    {
        return MIN_FEE_PERIOD_DURATION_SECONDS;
    }

    function _MAX_FEE_PERIOD_DURATION_SECONDS()
        public
        view
        returns (uint)
    {
        return MAX_FEE_PERIOD_DURATION_SECONDS;
    }
    
    function _adjustFeeEntitlement(address account, uint preBalance)
        public
    {
        return adjustFeeEntitlement(account, preBalance);
    }

    function _rolloverFee(address account, uint lastTransferTime, uint preBalance)
        public
    {
        return rolloverFee(account, lastTransferTime, preBalance);
    }

    function _checkFeePeriodRollover()
        public
    {
        checkFeePeriodRollover();
    }
}
