pragma solidity >=0.4.24;

import "./IWETH.sol";

// https://docs.synthetix.io/contracts/source/interfaces/ietherwrapper
contract IEtherWrapper {
    function mint(uint amount) external;

    function burn(uint amount) external;

    function capacity() external view returns (uint);

    function getBalance() external view returns (uint);

    function totalIssuedSynths() external view returns (uint);

    function calculateMintFee(uint amount) public view returns (uint);

    function calculateBurnFee(uint amount) public view returns (uint);

    function maxETH() public view returns (uint256);

    function mintFeeRate() public view returns (uint256);

    function burnFeeRate() public view returns (uint256);

    function weth() public view returns (IWETH);

    event Minted(address indexed account, uint amount, uint fee);
    event Burned(address indexed account, uint amount, uint fee);
}
