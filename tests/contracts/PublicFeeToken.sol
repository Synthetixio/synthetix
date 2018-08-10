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
        bytes memory empty;
        _transfer_byProxy(messageSender, to, value, empty);
    }

    function transfer(address to, uint value, bytes data)
        optionalProxy
        external
    {
        _transfer_byProxy(messageSender, to, value, data);
    }

    function transferFrom(address from, address to, uint value)
        optionalProxy
        external
    {
        bytes memory empty;
        _transferFrom_byProxy(messageSender, from, to, value, empty);
    }

    function transferFrom(address from, address to, uint value, bytes data)
        optionalProxy
        external
    {
        _transferFrom_byProxy(messageSender, from, to, value, data);
    }

    function transferSenderPaysFee(address to, uint value)
        optionalProxy
        external
    {
        bytes memory empty;
        _transferSenderPaysFee_byProxy(messageSender, to, value, empty);
    }

    function transferSenderPaysFee(address to, uint value, bytes data)
        optionalProxy
        external
    {
        _transferSenderPaysFee_byProxy(messageSender, to, value, data);
    }

    function transferFromSenderPaysFee(address from, address to, uint value)
        optionalProxy
        external
    {
        bytes memory empty;
        _transferFromSenderPaysFee_byProxy(messageSender, from, to, value, empty);
    }

    function transferFromSenderPaysFee(address from, address to, uint value, bytes data)
        optionalProxy
        external
    {
        _transferFromSenderPaysFee_byProxy(messageSender, from, to, value, data);
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
