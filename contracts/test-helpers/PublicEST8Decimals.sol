pragma solidity ^0.8.8;

import "../ExternStateToken.sol";

contract PublicEST8Decimals is ExternStateToken {
    uint8 public constant DECIMALS = 8;

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        string memory _name,
        string memory _symbol,
        uint _totalSupply,
        address _owner
    ) ExternStateToken(_proxy, _tokenState, _name, _symbol, _totalSupply, DECIMALS, _owner) {}

    function transfer(address to, uint value) external optionalProxy returns (bool) {
        return _transferByProxy(messageSender, to, value);
    }

    function transferFrom(
        address from,
        address to,
        uint value
    ) external optionalProxy returns (bool) {
        return _transferFromByProxy(messageSender, from, to, value);
    }

    // Index all parameters to make them easier to find in raw logs (as this will be emitted via a proxy and not decoded)
    event Received(address indexed sender, uint256 indexed inputA, bytes32 indexed inputB);

    function somethingToBeProxied(uint256 inputA, bytes32 inputB) external {
        emit Received(messageSender, inputA, inputB);
    }
}
