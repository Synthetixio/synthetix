/* PublicHavven.sol: expose the internal functions in Havven
 * for testing purposes.
 */

pragma solidity ^0.4.23;


import "contracts/Havven.sol";
import "contracts/TokenState.sol";


// Public getters for all items in the Havven contract, used for debugging/testing
contract PublicHavven is Havven {
    // generate getters for constants
    uint constant public MIN_FEE_PERIOD_DURATION = 1 days;
    uint constant public MAX_FEE_PERIOD_DURATION = 26 weeks;

    uint constant public MAX_ISSUANCE_RATIO = UNIT;

    constructor(address _proxy, TokenState _state, address _owner, address _oracle, uint _price, address[] _issuers, Havven _oldHavven)
        Havven(_proxy, _state, _owner, _oracle, _price, _issuers, _oldHavven)
        public
    {}

     /**
     * @notice Allow the owner of this contract to endow any address with havvens
     * from the initial supply.
     * @dev Since the entire initial supply resides in the havven contract,
     * this disallows the foundation from withdrawing fees on undistributed balances.
     * This function can also be used to retrieve any havvens sent to the Havven contract itself.
     * Only callable by the contract owner.
     */
    function endow(address to, uint value)
        external
        optionalProxy_onlyOwner
    {
        address sender = this;
        /* If they have enough available Havvens, it could be that
         * their havvens are escrowed, however the transfer would then
         * fail. This means that escrowed havvens are locked first,
         * and then the actual transferable ones. */
        require(nominsIssued[sender] == 0 || value <= transferableHavvens(sender), "Insufficient transferrable havvens");
        /* Perform the transfer: if there is a problem,
         * an exception will be thrown in this call. */
        tokenState.setBalanceOf(sender, safeSub(tokenState.balanceOf(sender), value));
        tokenState.setBalanceOf(to, safeAdd(tokenState.balanceOf(to), value));
        emitTransfer(sender, to, value);
    }

    function setFeePeriodStartTime(uint value)
        external
        optionalProxy_onlyOwner
    {
        feePeriodStartTime = value;
    }

    function setLastFeePeriodStartTime(uint value)
        external
        optionalProxy_onlyOwner
    {
        lastFeePeriodStartTime = value;
    }

    function setTotalIssuanceData(uint cbs, uint lab, uint lm)
        external
        optionalProxy_onlyOwner
    {
        totalIssuanceData.currentBalanceSum = cbs;
        totalIssuanceData.lastAverageBalance = lab;
        totalIssuanceData.lastModified = lm;
    }
    
    function setIssuanceData(address account, uint cbs, uint lab, uint lm)
        external
        optionalProxy_onlyOwner
    {
        issuanceData[account].currentBalanceSum = cbs;
        issuanceData[account].lastAverageBalance = lab;
        issuanceData[account].lastModified = lm;
    }

    function setNominsIssued(address account, uint value)
        external
        optionalProxy_onlyOwner
    {
        nominsIssued[account] = value;
    }

    function currentTime()
        public
        returns (uint)
    {
        return now;
    }
}
