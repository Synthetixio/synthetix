pragma solidity ^0.5.16;

import "../FuturesMarket.sol";

contract TestableFuturesMarket is FuturesMarket {
    constructor(address _resolver, bytes32 _baseAsset) public FuturesMarket(_resolver, _baseAsset) {}

    function entryDebtCorrection() external view returns (int) {
        return _entryDebtCorrection;
    }

    function proportionalSkew() external view returns (int) {
        (uint price, ) = assetPrice();
        return _proportionalSkew(price);
    }

    function maxFundingRate() external view returns (uint) {
        return _maxFundingRate(baseAsset);
    }

    /*
     * The maximum size in base units of an order on each side of the market that will not exceed the max market value.
     */
    function maxOrderSizes()
        external
        view
        returns (
            uint long,
            uint short,
            bool invalid
        )
    {
        uint price;
        (price, invalid) = assetPrice();
        int sizeLimit = int(_maxMarketValueUSD(baseAsset)).divideDecimal(int(price));
        (uint longSize, uint shortSize) = marketSizes();
        long = uint(sizeLimit.sub(_min(int(longSize), sizeLimit)));
        short = uint(sizeLimit.sub(_min(int(shortSize), sizeLimit)));
        return (long, short, invalid);
    }

    /**
     * The minimal margin at which liquidation can happen. Is the sum of liquidationBuffer and liquidationFee.
     * Reverts if position size is 0.
     * @param account address of the position account
     * @return lMargin liquidation margin to maintain in sUSD fixed point decimal units
     */
    function liquidationMargin(address account) external view returns (uint lMargin) {
        require(positions[account].size != 0, "0 size position");
        (uint price, ) = assetPrice();
        return _liquidationMargin(int(positions[account].size), price);
    }

    /*
     * Equivalent to the position's notional value divided by its remaining margin.
     */
    function currentLeverage(address account) external view returns (int leverage, bool invalid) {
        (uint price, bool isInvalid) = assetPrice();
        Position storage position = positions[account];
        uint remainingMargin_ = _remainingMargin(position, price);
        return (_currentLeverage(position, price, remainingMargin_), isInvalid);
    }
}
