/* PublicNomin.sol: expose the internal functions in Nomin
 * for testing purposes.
 */
pragma solidity 0.4.23;


import "contracts/Nomin.sol";
import "contracts/TokenState.sol";


contract PublicNomin is Nomin {

    uint constant MAX_TRANSFER_FEE_RATE = UNIT;  // allow for 100% fees

    constructor(address _proxy, address _havven, address _owner, TokenState initialState)
        Nomin(_proxy, _havven, _owner, initialState)
        public {}
    
    function debugEmptyFeePool()
        public
    {
        state.setBalanceOf(address(this), 0);
    }

    function debugFreezeAccount(address target)
        optionalProxy
        public
    {
        require(!frozen[target]);
        uint balance = state.balanceOf(target);
        state.setBalanceOf(address(this), safeAdd(state.balanceOf(address(this)), balance));
        state.setBalanceOf(target, 0);
        frozen[target] = true;
        emitAccountFrozen(target, balance);
        emitTransfer(target, address(this), balance);
    }

    function giveNomins(address account, uint amount)
        optionalProxy
        public
    {
        state.setBalanceOf(account, safeAdd(amount, state.balanceOf(account)));
        totalSupply = safeAdd(totalSupply, amount);
    }

    function clearNomins(address account)
        optionalProxy
        public
    {
        totalSupply = safeSub(totalSupply, state.balanceOf(account));
        state.setBalanceOf(account, 0);
    }

    function generateFees(uint amount)
        optionalProxy
        public
    {
        totalSupply = safeAdd(totalSupply, amount);
        state.setBalanceOf(address(this), safeAdd(balanceOf(address(this)), amount));
    }
}
