pragma solidity 0.4.25;


interface IMixinResolver {
    function populateLocalLookup(bytes32[] names) external;
}
