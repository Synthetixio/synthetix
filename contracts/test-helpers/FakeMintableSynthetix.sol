pragma solidity ^0.5.16;

import "../MintableSynthetix.sol";


contract FakeMintableSynthetix is MintableSynthetix {
    address public from;
    address public to;
    uint public value;

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        address _owner,
        uint _totalSupply,
        address _resolver
    ) public MintableSynthetix(_proxy, _tokenState, _owner, _totalSupply, _resolver) {}

    function emitTransfer(
        address _from,
        address _to,
        uint _value
    ) internal {
        from = _from;
        to = _to;
        value = _value;
    }
}
