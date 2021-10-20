pragma solidity ^0.8.8;

interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external;
}

contract MockFuturesMarket {
    bytes32 public baseAsset;
    uint public debt;
    bool public invalid;
    IFuturesMarketManagerInternal public manager;

    constructor(
        IFuturesMarketManagerInternal _manager,
        bytes32 _baseAsset,
        uint _debt,
        bool _invalid
    ) {
        manager = _manager;
        baseAsset = _baseAsset;
        debt = _debt;
        invalid = _invalid;
    }

    function setManager(IFuturesMarketManagerInternal _manager) external {
        manager = _manager;
    }

    function setBaseAsset(bytes32 _baseAsset) external {
        baseAsset = _baseAsset;
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
