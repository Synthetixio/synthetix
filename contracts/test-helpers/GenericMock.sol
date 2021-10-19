// Source adapted from  https://github.com/EthWorks/Doppelganger/blob/master/contracts/Doppelganger.sol

pragma solidity ^0.8.8;

contract GenericMock {
    mapping(bytes4 => bytes) public mockConfig;

    // solhint-disable payable-fallback, no-complex-fallback
    fallback() external {
        bytes memory ret = mockConfig[msg.sig];
        assembly {
            return(add(ret, 0x20), mload(ret))
        }
    }

    function mockReturns(bytes4 key, bytes calldata value) external {
        mockConfig[key] = value;
    }
}
