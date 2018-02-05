/* PublicHavven.sol: expose the internal functions in Havven
 * for testing purposes.
 */

pragma solidity ^0.4.19;


import "contracts/Havven.sol";



contract PublicHavven is Havven {
    // Public getters for all items in the Havven contract, used for debugging/testing
    function PublicHavven(address _owner)
        Havven(_owner)
        public
    {}

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

    function _minFeePeriodDurationSeconds()
        public
        view
        returns (uint)
    {
        return minFeePeriodDurationSeconds;
    }

    function _maxFeePeriodDurationSeconds()
        public
        view
        returns (uint)
    {
        return maxFeePeriodDurationSeconds;
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

    function _postCheckFeePeriodRollover()
        postCheckFeePeriodRollover
        public
    {}
}
