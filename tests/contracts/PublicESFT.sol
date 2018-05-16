pragma solidity 0.4.23;

import "contracts/ExternStateFeeToken.sol";

contract PublicESFT is ExternStateFeeToken {
    constructor(address _proxy, string _name, string _symbol, uint _transferFeeRate, address _feeAuthority,
                                   TokenState _state, address _owner)
        ExternStateFeeToken(_proxy, _name, _symbol, _transferFeeRate, _feeAuthority, _state, _owner)
        public
    {}

    function transfer(address to, uint value)
        optionalProxy
        external
    {
        _transfer_byProxy(messageSender, to, value);
    }

    function transferFrom(address from, address to, uint value)
        optionalProxy
        external
    {
        _transferFrom_byProxy(messageSender, from, to, value);
    }

    function giveTokens(address account, uint amount)
        optionalProxy
        public
    {
        state.setBalanceOf(account, safeAdd(amount, state.balanceOf(account)));
        totalSupply = safeAdd(totalSupply, amount);
    }

    function clearTokens(address account)
        optionalProxy
        public
    {
        totalSupply = safeSub(totalSupply, state.balanceOf(account));
        state.setBalanceOf(account, 0);
    }

}
