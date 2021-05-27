import "./interfaces/IKeeper.sol";
import "./interfaces/IFuturesMarket.sol";

contract FuturesKeepers {
    function requestConfirmationKeeper(address market, address account) {
        keeperRegistry().registerUpkeep(address(this), 9e6, address(this), this.checkOrderConfirmed.encode(market, account));
    }

    function checkOrderConfirmed(address market, address account) returns (bool upkeepNeeded, bytes memory performData) {
        upkeepNeeded = IFuturesMarket(market).canConfirm(account);
        performData = IFuturesMarket(market).confirmOrder.encode(account);
    }

    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData) {
        (upkeepNeeded, performData) = abi.decode(address(this).call(checkData), (bool, bytes));
    }

    function performUpkeep(bytes calldata performData) external {
        (address target, bytes _calldata) = abi.decode(performData);
        target.call(_calldata);
    }
}

// https://docs.synthetix.io/contracts/source/contracts/FuturesConfirmationKeeper
contract FuturesConfirmationKeeper is MixinResolver, IKeeper {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_FUTURES_MARKET = "SynthsETH";

    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData) {
        (address futuresMarket, address account) = abi.decode(checkData, (address, address));
        upkeepNeeded = IFuturesMarket(futuresMarket).canConfirmOrder(account);
        performData = abi.encodePacked(IFuturesMarket(futuresMarket).confirmOrder.encode(account));
    }

    function performUpkeep(bytes calldata performData) external {
        (address futuresMarket, bytes _calldata) = abi.decode(performData, (address, bytes));
        IFuturesMarket(futuresMarket).call(_calldata);

        // TODO: cancel the upkeep.
    }
}
