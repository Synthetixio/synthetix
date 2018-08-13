/* PublicNomin.sol: expose the internal functions in Nomin
 * for testing purposes.
 */
pragma solidity ^0.4.23;


import "contracts/Havven.sol";
import "contracts/Nomin.sol";


contract PublicNomin is Nomin {

    uint constant MAX_TRANSFER_FEE_RATE = UNIT;  // allow for 100% fees

    constructor(address _proxy, TokenState _tokenState, Havven _havven,
                uint _totalSupply,
                address _owner)
        Nomin(_proxy, _tokenState, _havven, _totalSupply, _owner)
        public {}
    
    function debugEmptyFeePool()
        public
    {
        tokenState.setBalanceOf(FEE_ADDRESS, 0);
    }

    function debugFreezeAccount(address target)
        optionalProxy
        public
    {
        require(!frozen[target], "Target address must not be frozen");
        uint balance = tokenState.balanceOf(target);
        tokenState.setBalanceOf(FEE_ADDRESS, safeAdd(tokenState.balanceOf(FEE_ADDRESS), balance));
        tokenState.setBalanceOf(target, 0);
        frozen[target] = true;
        emitAccountFrozen(target, balance);
        emitTransfer(target, FEE_ADDRESS, balance);
    }

    function giveNomins(address account, uint amount)
        optionalProxy
        public
    {
        tokenState.setBalanceOf(account, safeAdd(amount, tokenState.balanceOf(account)));
        totalSupply = safeAdd(totalSupply, amount);
    }

    function clearNomins(address account)
        optionalProxy
        public
    {
        totalSupply = safeSub(totalSupply, tokenState.balanceOf(account));
        tokenState.setBalanceOf(account, 0);
    }

    function generateFees(uint amount)
        optionalProxy
        public
    {
        totalSupply = safeAdd(totalSupply, amount);
        tokenState.setBalanceOf(FEE_ADDRESS, safeAdd(balanceOf(FEE_ADDRESS), amount));
    }

    /* Allow havven to issue a certain number of
     * nomins from a target address */
    function publicIssue(address target, uint amount)
        public
    {
        tokenState.setBalanceOf(target, safeAdd(tokenState.balanceOf(target), amount));
        totalSupply = safeAdd(totalSupply, amount);
        emitTransfer(address(0), target, amount);
        emitIssued(target, amount);
    }

    /* Allow havven to burn a certain number of
     * nomins from a target address */
    function publicBurn(address target, uint amount)
        public
    {
        tokenState.setBalanceOf(target, safeSub(tokenState.balanceOf(target), amount));
        totalSupply = safeSub(totalSupply, amount);
        emitTransfer(target, address(0), amount);
        emitBurned(target, amount);
    }
}
