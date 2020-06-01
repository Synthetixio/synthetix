pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarket.sol";
import "../interfaces/IERC20.sol";

contract IBinaryOption is IERC20 {
    IBinaryOptionMarket public market;
    mapping(address => uint) public bidOf;
    uint public totalBids;

    function price() public view returns (uint);
    function claimableBy(address account) public view returns (uint);
    function totalClaimable() public view returns (uint);
    function totalExercisable() external view returns (uint);

    event Issued(address indexed account, uint value);
    event Burned(address indexed account, uint value);
}
