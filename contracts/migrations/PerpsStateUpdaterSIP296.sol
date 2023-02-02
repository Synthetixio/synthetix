pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../Owned.sol";

import "../interfaces/IPerpsV2MarketBaseTypes.sol";
import "../interfaces/IPerpsV2MarketState.sol";

contract PerpsStateUpdaterSIP296 is Owned, IPerpsV2MarketBaseTypes {
    address public oldStateAddress;
    address public newStateAddress;

    constructor(
        address _owner,
        address _oldStateAddress,
        address _newStateAddress
    ) public Owned(_owner) {
        oldStateAddress = _oldStateAddress;
        newStateAddress = _newStateAddress;
    }

    function execute() external onlyOwner {
        IPerpsV2MarketState oldState = IPerpsV2MarketState(oldStateAddress);
        IPerpsV2MarketState newState = IPerpsV2MarketState(newStateAddress);

        // Check states match (market key and base asset)
        require(oldState.marketKey() == newState.marketKey(), "Wrong market key");
        require(oldState.baseAsset() == newState.baseAsset(), "Wrong base asset");

        // Copy atomic values
        newState.setMarketSize(oldState.marketSize());
        newState.setMarketSkew(oldState.marketSkew());
        newState.setEntryDebtCorrection(oldState.entryDebtCorrection());
        newState.setFundingLastRecomputed(oldState.fundingLastRecomputed());
        newState.setFundingRateLastRecomputed(oldState.fundingRateLastRecomputed());
        newState.setNextPositionId(oldState.nextPositionId());

        // fundingSequence
        uint fundingSequenceLength = oldState.fundingSequenceLength();
        for (uint i = 0; i < fundingSequenceLength; i++) {
            newState.pushFundingSequence(oldState.fundingSequence(i));
        }

        // positions
        address[] memory positions = oldState.getPositionAddressesPage(0, oldState.getPositionAddressesLength());
        uint positionsLength = positions.length;
        for (uint i = 0; i < positionsLength; i++) {
            address account = positions[i];
            Position memory position = oldState.positions(account);

            newState.updatePosition(
                account,
                position.id,
                position.lastFundingIndex,
                position.margin,
                position.lastPrice,
                position.size
            );
        }

        // delayedOrders
        address[] memory delayedOrders = oldState.getDelayedOrderAddressesPage(0, oldState.getDelayedOrderAddressesLength());
        uint delayedOrdersLength = delayedOrders.length;
        for (uint i = 0; i < delayedOrdersLength; i++) {
            address account = delayedOrders[i];
            DelayedOrder memory delayOrder = oldState.delayedOrders(account);

            newState.updateDelayedOrder(
                account,
                delayOrder.isOffchain,
                delayOrder.sizeDelta,
                delayOrder.priceImpactDelta,
                delayOrder.targetRoundId,
                delayOrder.commitDeposit,
                delayOrder.keeperDeposit,
                delayOrder.executableAtTime,
                delayOrder.intentionTime,
                delayOrder.trackingCode
            );
        }

        // positionFlaggers (added in new state, not )
    }
}
