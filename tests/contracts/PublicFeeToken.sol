pragma solidity ^0.4.23;

import "contracts/FeeToken.sol";

contract PublicFeeToken is FeeToken {
    constructor(address _proxy, TokenState _tokenState,
                string _name, string _symbol, uint _totalSupply,
                uint _transferFeeRate,
                address _feeAuthority, address _owner)
        FeeToken(_proxy, _tokenState,
                 _name, _symbol, _totalSupply, _transferFeeRate,
                 _feeAuthority, _owner)
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

    function transferSenderPaysFee(address to, uint value)
        optionalProxy
        external
    {
        _transferSenderPaysFee_byProxy(messageSender, to, value);
    }

    function transferFromSenderPaysFee(address from, address to, uint value)
        optionalProxy
        external
    {
        _transferFromSenderPaysFee_byProxy(messageSender, from, to, value);
    }

    function giveTokens(address account, uint amount)
        optionalProxy
        public
    {
        tokenState.setBalanceOf(account, safeAdd(amount, tokenState.balanceOf(account)));
        totalSupply = safeAdd(totalSupply, amount);
    }

    function clearTokens(address account)
        optionalProxy
        public
    {
        totalSupply = safeSub(totalSupply, tokenState.balanceOf(account));
        tokenState.setBalanceOf(account, 0);
    }

}
