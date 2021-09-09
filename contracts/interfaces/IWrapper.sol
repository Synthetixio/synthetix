pragma solidity >=0.4.24;

import "./IERC20.sol";

// https://docs.synthetix.io/contracts/source/interfaces/iwrapper
interface IWrapper {
    function mint(uint amount) external;

    function burn(uint amount) external;

    function capacity() external view returns (uint);

    function totalIssuedSynths() external view returns (uint);

    function calculateMintFee(uint amount) external view returns (uint);

    function calculateBurnFee(uint amount) external view returns (uint);

    function maxTokenAmount() external view returns (uint256);

    function mintFeeRate() external view returns (uint256);

    function burnFeeRate() external view returns (uint256);
}
