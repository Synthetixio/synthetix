pragma solidity ^0.5.16;

import "./IBinaryOptionMarket.sol";
import "./IERC20.sol";

contract IBinaryOption is IERC20 {
    IBinaryOptionMarket public market;
    mapping(address => uint256) public bidOf;
    uint256 public totalBids;

    function price() public view returns (uint256);
    function claimableBy(address account) public view returns (uint256);
    function totalClaimable() public view returns (uint256);
    function totalExercisable() external view returns (uint256);

    event Issued(address indexed account, uint value);
    event Burned(address indexed account, uint value);
}
