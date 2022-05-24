pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./MixinResolver.sol";

// types
import "./interfaces/IPerpsInterfacesV2.sol";

contract PerpsStorageV2 is IPerpsStorageV2External, IPerpsStorageV2Internal, IPerpsTypesV2, MixinResolver {
    bytes32 internal constant PERPSENGINEV2_CONTRACT_NAME = "PerpsEngineV2";

    /* ========== PUBLIC STATE ========== */

    mapping(bytes32 => MarketScalars) public marketScalars;
    // getter marketScalars(bytes32) (MarketScalars)

    mapping(bytes32 => FundingEntry[]) public fundingSequences;
    // getter fundingSequence(bytes32, uint) (FundingEntry)

    mapping(bytes32 => mapping(address => Position)) public positions;
    // getter positions(bytes32, address) (Position)

    mapping(bytes32 => mapping(uint => address)) public positionIdToAccount;
    // getter positionIdToAccount(bytes32, uint) (address)

    bytes32 public constant CONTRACT_NAME = "PerpsStorageV2";

    /* ========== INTERNAL STATE ========== */

    /* ========== MODIFIERS ========== */

    modifier onlyEngine() {
        require(msg.sender == requireAndGetAddress(PERPSENGINEV2_CONTRACT_NAME), "only engine");
        _;
    }

    modifier requireInit(bytes32 marketKey) {
        require(marketScalars[marketKey].baseAsset != bytes32(0), "market not initialised");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) public MixinResolver(_resolver) {}

    /* ========== EXTERNAL VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinResolver.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = PERPSENGINEV2_CONTRACT_NAME;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function fundingSequenceLength(bytes32 marketKey) external view returns (uint) {
        return fundingSequences[marketKey].length;
    }

    function lastFundingEntry(bytes32 marketKey) public view requireInit(marketKey) returns (FundingEntry memory entry) {
        FundingEntry[] memory sequence = fundingSequences[marketKey];
        return sequence[sequence.length - 1];
    }

    /* ========== EXTERNAL STORAGE MUTATIVE (to be refactored) ========== */

    function initMarket(bytes32 marketKey, bytes32 baseAsset) external onlyEngine {
        // validate input
        require(marketKey != bytes32(0), "market key cannot be empty");
        require(baseAsset != bytes32(0), "asset key cannot be empty");
        // load market
        MarketScalars storage market = marketScalars[marketKey];
        // check is not initialized already
        require(market.baseAsset == bytes32(0), "already initialized");
        // set asset
        market.baseAsset = baseAsset;
        // initialise the funding sequence with 0 initially accrued, so that the first usable funding index is 1.
        fundingSequences[marketKey].push(FundingEntry(0, block.timestamp));
    }

    function positionWithInit(bytes32 marketKey, address account)
        public
        onlyEngine
        requireInit(marketKey)
        returns (Position memory)
    {
        Position storage position = positions[marketKey][account];

        // if position has no id, it wasn't initialized, initialize it:
        if (position.id == 0) {
            // set marketKey
            position.marketKey = marketKey;
            // id
            marketScalars[marketKey].lastPositionId++; // increment position id
            uint id = marketScalars[marketKey].lastPositionId;
            position.id = id;
            // update owner mapping
            positionIdToAccount[marketKey][id] = account;
        }

        return position; // returns memory
    }

    function pushFundingEntry(bytes32 marketKey, int funding) external onlyEngine requireInit(marketKey) {
        fundingSequences[marketKey].push(FundingEntry(funding, block.timestamp));
    }

    function storePosition(
        bytes32 marketKey,
        address account,
        uint newMargin,
        uint newLocked,
        int newSize,
        uint price
    ) external onlyEngine requireInit(marketKey) {
        // ensure it's initialized
        positionWithInit(marketKey, account);
        // load the storage
        Position storage position = positions[marketKey][account];
        // update values according to inputs
        position.margin = newMargin;
        position.lockedMargin = newLocked;
        position.size = newSize;
        position.lastPrice = price;
        // update funding entry to last entry
        position.lastFundingEntry = lastFundingEntry(marketKey);
    }

    function storeMarketAggregates(
        bytes32 marketKey,
        uint marketSize,
        int marketSkew,
        int entryDebtCorrection
    ) external onlyEngine requireInit(marketKey) {
        MarketScalars storage market = marketScalars[marketKey];
        market.marketSize = marketSize;
        market.marketSkew = marketSkew;
        market.entryDebtCorrection = entryDebtCorrection;
    }
}
