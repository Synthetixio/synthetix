pragma solidity ^0.5.16;

// https://docs.synthetix.io/contracts/source/contracts/MinimalProxyFactory
contract MinimalProxyFactory {
    function _cloneAsMinimalProxy(address _base, string memory _revertMsg) internal returns (address clone) {
        bytes memory createData = _generateMinimalProxyCreateData(_base);

        assembly {
            clone := create(
                0, // no value
                add(createData, 0x20), // data
                55 // data is always 55 bytes (10 constructor + 45 code)
            )
        }

        // If CREATE fails for some reason, address(0) is returned
        require(clone != address(0), _revertMsg);
    }

    function _generateMinimalProxyCreateData(address _base) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                //---- constructor -----
                bytes10(0x3d602d80600a3d3981f3),
                //---- proxy code -----
                bytes10(0x363d3d373d3d3d363d73),
                _base,
                bytes15(0x5af43d82803e903d91602b57fd5bf3)
            );
    }
}
