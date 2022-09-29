pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IFuturesV2MarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external;
}

contract MockFuturesV2Market {
    bytes32 public baseAsset;
    bytes32 public marketKey;
    uint public debt;
    bool public invalid;
    IFuturesV2MarketManagerInternal public manager;

    constructor(
        IFuturesV2MarketManagerInternal _manager,
        bytes32 _baseAsset,
        bytes32 _marketKey,
        uint _debt,
        bool _invalid
    ) public {
        manager = _manager;
        baseAsset = _baseAsset;
        marketKey = _marketKey;
        debt = _debt;
        invalid = _invalid;
    }

    function setManager(IFuturesV2MarketManagerInternal _manager) external {
        manager = _manager;
    }

    function setBaseAsset(bytes32 _baseAsset) external {
        baseAsset = _baseAsset;
    }

    function setMarketKey(bytes32 _marketKey) external {
        marketKey = _marketKey;
    }

    function setMarketDebt(uint _debt) external {
        debt = _debt;
    }

    function setInvalid(bool _invalid) external {
        invalid = _invalid;
    }

    function marketDebt() external view returns (uint _debt, bool _invalid) {
        return (debt, invalid);
    }

    function issueSUSD(address account, uint amount) external {
        manager.issueSUSD(account, amount);
    }

    function burnSUSD(address account, uint amount) external {
        manager.burnSUSD(account, amount);
    }
}