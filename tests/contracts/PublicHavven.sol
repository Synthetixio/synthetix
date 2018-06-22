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

    constructor(address _proxy, TokenState _state, address _owner, address _oracle, uint _price, address[] _issuers, uint[] _issuedNomins)
        Havven(_proxy, _state, _owner, _oracle, _price, _issuers, _issuedNomins)
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
        require(nominsIssued[sender] == 0 || value <= availableHavvens(sender));
        /* Perform the transfer: if there is a problem,
         * an exception will be thrown in this call. */
        tokenState.setBalanceOf(sender, safeSub(tokenState.balanceOf(sender), value));
        tokenState.setBalanceOf(to, safeAdd(tokenState.balanceOf(to), value));
        emitTransfer(sender, to, value);
    }

    function currentTime()
        public
        returns (uint)
    {
        return now;
    }
}
