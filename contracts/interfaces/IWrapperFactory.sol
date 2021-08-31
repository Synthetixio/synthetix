pragma solidity >=0.4.24;

import "./IERC20.sol";

// https://docs.synthetix.io/contracts/source/interfaces/iwrapperfactory
interface IWrapperFactory {
    function isWrapper(address possibleWrapper) external view returns (bool);

    function totalIssuedSynths() external view returns (uint);

    function createWrapper(IERC20 token, bytes32 currencyKey) external returns (address);

    function distributeFees() external;
}
