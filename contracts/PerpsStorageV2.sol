pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./State.sol";

import "./interfaces/IPerpsInterfacesV2.sol";

contract PerpsStorageV2 is IPerpsStorageV2External, IPerpsStorageV2Internal, IPerpsTypesV2, State {
    /* ========== Events ========== */
    event MarketInitialised(bytes32 marketKey, bytes32 baseAsset);
    event PositionInitialised(bytes32 indexed marketKey, uint id, address account);
    event FundingUpdated(bytes32 indexed marketKey, int funding, uint timestamp);

    /* ========== PUBLIC STATE ========== */
    // storage is split between multiple variables instead of nesting in a single e.g. Market
    // struct so that at some getters are autogenerated and no state remains inaccessible

    mapping(bytes32 => MarketScalars) public marketScalars;
    // getter marketScalars(bytes32)(MarketScalars)

    mapping(bytes32 => FundingEntry) public lastFundingEntry;
    // getter lastFundingEntry(bytes32)(FundingEntry)

    mapping(bytes32 => mapping(uint => address)) public positionIdToAccount;
    // getter positionIdToAccount(bytes32, uint)(address)

    bytes32 public constant CONTRACT_NAME = "PerpsStorageV2";

    ////// Internal state

    mapping(bytes32 => mapping(address => Position)) internal _positions;

    /* ========== MODIFIERS ========== */

    modifier withMarket(bytes32 marketKey) {
        require(marketScalars[marketKey].baseAsset != bytes32(0), "Market not initialised");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _associatedContract) public Owned(_owner) State(_associatedContract) {}

    /* ========== EXTERNAL VIEWS ========== */

    /// most are autogenerated

    function positions(bytes32 marketKey, address account) public view returns (Position memory position) {
        position = _positions[marketKey][account];
        // ensure returned position always has the right market key as requested
        // even if position or market are not initialized
        position.marketKey = marketKey;
    }

    /* ========== EXTERNAL STORAGE MUTATIVE (to be refactored) ========== */

    function initMarket(bytes32 marketKey, bytes32 baseAsset) external onlyAssociatedContract {
        // validate input
        require(marketKey != bytes32(0), "Market key cannot be empty");
        require(baseAsset != bytes32(0), "Asset key cannot be empty");
        // load market
        MarketScalars storage market = marketScalars[marketKey];
        // check is not initialized already (can only be initialized once)
        // (it should be ok to re-initialize if no positions were created yet, but
        // this would only be needed if baseAsset was incorrectly set the first time, so is
        // an edge case that doesn't justify any added side effects concerns for a less strict check)
        require(market.baseAsset == bytes32(0), "Already initialized");
        // set asset
        market.baseAsset = baseAsset;
        // event
        emit MarketInitialised(marketKey, baseAsset);
        // initialise the funding with 0 initially accrued
        updateFunding(marketKey, 0);
    }

    function positionWithInit(bytes32 marketKey, address account)
        public
        onlyAssociatedContract
        withMarket(marketKey)
        returns (Position memory position)
    {
        position = positions(marketKey, account);

        // if position has no id, it wasn't initialized, initialize it:
        if (position.id == 0) {
            // id
            marketScalars[marketKey].lastPositionId++; // increment position id

            // user positions start from 1 to avoid clashing with default empty position
            uint id = marketScalars[marketKey].lastPositionId;
            position.id = id;

            // update funding entry according to current latest entry
            position.lastFundingEntry = lastFundingEntry[marketKey];

            // update owner mapping
            positionIdToAccount[marketKey][id] = account;

            // store it
            _positions[marketKey][account] = position;

            // event
            emit PositionInitialised(marketKey, id, account);
        }

        return position;
    }

    function updateFunding(bytes32 marketKey, int funding) public onlyAssociatedContract withMarket(marketKey) {
        lastFundingEntry[marketKey] = FundingEntry(funding, block.timestamp);
        emit FundingUpdated(marketKey, funding, block.timestamp);
    }

    function storePosition(
        bytes32 marketKey,
        address account,
        uint newMargin,
        uint newLocked,
        int newSize,
        uint price
    ) external onlyAssociatedContract withMarket(marketKey) returns (Position memory) {
        // load the storage
        Position storage position = _positions[marketKey][account];
        // ensure is initialized
        require(position.id != 0, "Position not initialized");
        // update values according to inputs
        position.margin = newMargin;
        position.lockedMargin = newLocked;
        position.size = newSize;
        position.lastPrice = price;
        // update funding entry to last entry
        position.lastFundingEntry = lastFundingEntry[marketKey];
        return position; // returns memory
    }

    function storeMarketAggregates(
        bytes32 marketKey,
        uint marketSize,
        int marketSkew,
        int entryDebtCorrection
    ) external onlyAssociatedContract withMarket(marketKey) {
        MarketScalars storage market = marketScalars[marketKey];
        market.marketSize = marketSize;
        market.marketSkew = marketSkew;
        market.entryDebtCorrection = entryDebtCorrection;
    }
}
