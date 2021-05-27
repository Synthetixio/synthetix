pragma solidity ^0.5.16;

import "./interfaces/IKeeper.sol";
import "./interfaces/IFuturesKeepers.sol";
import "./interfaces/IKeeperRegistry.sol";
import "./interfaces/IFuturesMarket.sol";
import "./MixinResolver.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesConfirmationKeeper
contract FuturesKeepers is MixinResolver, IFuturesKeepers, IKeeper {
    mapping(bytes32 => uint256) confirmationUpkeeps;
    mapping(bytes32 => uint256) liquidationUpkeeps;

    bytes32 internal constant CONTRACT_KEEPER_REGISTRY = "KeeperRegistry";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) public MixinResolver(_resolver) {}

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinResolver.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_KEEPER_REGISTRY;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function keeperRegistry() internal view returns (IKeeperRegistry) {
        return IKeeperRegistry(requireAndGetAddress(CONTRACT_KEEPER_REGISTRY));
    }

    //
    // Order confirmations.
    //

    function requestConfirmationKeeper(address market, address account) external {
        return _requestConfirmationKeeper(market, account);
    }

    function confirmOrder(address market, address account) public {
        IFuturesMarket(market).confirmOrder(account);
    }

    function checkOrderConfirmed(address market, address account)
        public
        returns (bool upkeepNeeded, bytes memory performData)
    {
        // Check.
        upkeepNeeded = IFuturesMarket(market).canConfirmOrder(account);
        // Perform.
        performData = abi.encodeWithSelector(this.confirmOrder.selector, market, account);
    }

    function _requestConfirmationKeeper(address market, address account) internal {
        uint upkeepId =
            keeperRegistry().registerUpkeep(
                address(this),
                9e6,
                address(this),
                abi.encodeWithSelector(this.checkOrderConfirmed.selector, market, account)
            );

        bytes32 id = sha256(abi.encodePacked(market, account));
        confirmationUpkeeps[id] = upkeepId;
    }

    function cancelConfirmationKeeper(address market, address account) public {
        bytes32 id = sha256(abi.encodePacked(market, account));
        uint upkeepId = confirmationUpkeeps[id];
        keeperRegistry().cancelUpkeep(upkeepId);
        delete confirmationUpkeeps[id];
    }

    //
    // Order liquidations.
    //

    function requestLiquidationKeeper(address market, address account) public {
        return _requestLiquidationKeeper(market, account);
    }

    function _requestLiquidationKeeper(address market, address account) internal {
        uint upkeepId =
            keeperRegistry().registerUpkeep(
                address(this),
                9e6,
                address(this),
                abi.encodeWithSelector(this.checkLiquidation.selector, market, account)
            );

        bytes32 id = sha256(abi.encodePacked(market, account));
        liquidationUpkeeps[id] = upkeepId;
    }

    function cancelLiquidationKeeper(address market, address account) public {
        bytes32 id = sha256(abi.encodePacked(market, account));
        uint upkeepId = liquidationUpkeeps[id];
        keeperRegistry().cancelUpkeep(upkeepId);
        delete liquidationUpkeeps[id];
    }

    function checkLiquidation(address market, address account) public returns (bool upkeepNeeded, bytes memory performData) {
        // Check.
        upkeepNeeded = IFuturesMarket(market).canLiquidate(account);
        // Perform.
        performData = abi.encodeWithSelector(this.liquidatePosition.selector, market, account);
    }

    function liquidatePosition(address market, address account) public {
        IFuturesMarket(market).liquidatePosition(account);
    }

    //
    // Generic functions that integrate with the ChainLink Keeper system.
    //

    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData) {
        (bool success, bytes memory returnData) = address(this).call(checkData);
        (upkeepNeeded, performData) = abi.decode(returnData, (bool, bytes));
    }

    function performUpkeep(bytes calldata performData) external {
        // (address target, bytes memory _calldata) = abi.decode(performData, (address, _calldata));
        address(this).call(performData);
    }
}
