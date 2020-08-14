pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarket.sol";
import "../interfaces/IERC20.sol";


interface IBinaryOption {
    /* ========== VIEWS / VARIABLES ========== */

    function market() external view returns (IBinaryOptionMarket);

    function bidOf(address account) external view returns (uint);

    function totalBids() external view returns (uint);

    function balanceOf(address account) external view returns (uint);

    function totalSupply() external view returns (uint);

    function claimableBalanceOf(address account) external view returns (uint);

    function totalClaimableSupply() external view returns (uint);
}
