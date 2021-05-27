pragma solidity >=0.4.24;

interface IKeeperRegistry {
    event UpkeepRegistered(uint256 indexed id, uint32 executeGas, address admin);
    event UpkeepPerformed(uint256 indexed id, bool indexed success, address indexed from, uint96 payment, bytes performData);
    event UpkeepCanceled(uint256 indexed id, uint64 indexed atBlockHeight);

    function registerUpkeep(
        address target,
        uint32 gasLimit,
        address admin,
        bytes calldata checkData
    ) external returns (uint256 id);

    function performUpkeep(uint256 id, bytes calldata performData) external returns (bool success);

    function cancelUpkeep(uint256 id) external;

    function checkUpkeep(uint256 upkeepId, address from)
        external
        returns (
            bytes memory performData,
            uint256 maxLinkPayment,
            uint256 gasLimit,
            int256 gasWei,
            int256 linkEth
        );
}
