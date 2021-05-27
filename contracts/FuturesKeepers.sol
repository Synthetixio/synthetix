import "./interfaces/IKeeper.sol";
import "./interfaces/IFuturesMarket.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesConfirmationKeeper
contract FuturesKeepers is IKeeper {
    mapping(bytes32 => uint256) confirmationUpkeeps;
    mapping(bytes32 => uint256) liquidationUpkeeps;

    // 
    // Order confirmations.
    // 

    function requestConfirmationKeeper(address market, address account) {
        uint upkeepId = keeperRegistry().registerUpkeep(address(this), 9e6, address(this), this.checkOrderConfirmed.encode(market, account));
        
        bytes32 id = sha256(abi.encodePacked(market, account));
        confirmationUpkeeps[id] = upkeepId;
    }

    function cancelConfirmationKeeper(address market, address account) {
        bytes32 id = sha256(abi.encodePacked(market, account));
        uint upkeepId = confirmationUpkeeps[id];
        cancelUpkeep(upkeepId);
        delete confirmationUpkeeps[id];
    }

    function checkOrderConfirmed(address market, address account) returns (bool upkeepNeeded, bytes memory performData) {
        // Check.
        upkeepNeeded = IFuturesMarket(market).canConfirm(account);
        // Perform.
        performData = IFuturesMarket(market).confirmOrder.encode(account);
    }


    // 
    // Order liquidations.
    // 

    function requestLiquidationKeeper(address market, address account) {
        uint upkeepId = keeperRegistry().registerUpkeep(address(this), 9e6, address(this), this.checkLiquidation.encode(market, account));
        
        bytes32 id = sha256(abi.encodePacked(market, account));
        liquidationUpkeeps[id] = upkeepId;
    }

    function cancelLiquidationKeeper(address market, address account) {
        bytes32 id = sha256(abi.encodePacked(market, account));
        uint upkeepId = liquidationUpkeeps[id];
        cancelUpkeep(upkeepId);
        delete liquidationUpkeeps[id];
    }

    function checkLiquidation(address market, address account) returns (bool upkeepNeeded, bytes memory performData) {
        // Check.
        upkeepNeeded = IFuturesMarket(market).canLiquidate(account);
        // Perform.
        performData = IFuturesMarket(market).liquidatePosition.encode(account);
    }


    // 
    // Generic functions that integrate with the ChainLink Keeper system.
    // 

    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData) {
        (upkeepNeeded, performData) = abi.decode(address(this).call(checkData), (bool, bytes));
    }

    function performUpkeep(bytes calldata performData) external {
        (address target, bytes _calldata) = abi.decode(performData);
        target.call(_calldata);
    }
}