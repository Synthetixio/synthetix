// Source adapted from  https://github.com/EthWorks/Doppelganger/blob/master/contracts/Doppelganger.sol

/* solium-disable security/no-inline-assembly */
pragma solidity 0.4.25;


contract GenericMock {
    mapping(bytes4 => bytes) mockConfig;

    function() public {
        bytes memory ret = mockConfig[msg.sig];
        assembly {
            return(add(ret, 0x20), mload(ret))
        }
    }

    function mockReturns(bytes4 key, bytes value) public {
        mockConfig[key] = value;
    }
}
