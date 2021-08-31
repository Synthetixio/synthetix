pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./Pausable.sol";
import "./Wrapper.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IFlexibleStorage.sol";

// https://docs.synthetix.io/contracts/source/contracts/wrapperfactory
contract WrapperFactory is Owned, MixinResolver {
    bytes32 internal constant CONTRACT_FLEXIBLESTORAGE = "FlexibleStorage";

    bytes32 internal constant WRAPPER_FACTORY_CONTRACT_NAME = "WrapperFactory";
    uint internal constant WRAPPER_VERSION = 1;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_FLEXIBLESTORAGE;
    }

    function flexibleStorage() internal view returns (IFlexibleStorage) {
        return IFlexibleStorage(requireAndGetAddress(CONTRACT_FLEXIBLESTORAGE));
    }

    // ========== VIEWS ==========
    // Returns the version of a wrapper created by this wrapper factory
    // Used by MultiCollateralSynth to know if it should trust the wrapper contract
    function isWrapper(address possibleWrapper) external view returns (bool) {
        return flexibleStorage().getUIntValue(WRAPPER_FACTORY_CONTRACT_NAME, bytes32(uint(address(possibleWrapper)))) > 0;
    }

    // Returns sum of totalIssuedSynths for all wrappers deployed by this contract
    function totalIssuedSynths() external view returns (uint) {
        return 0; // stub
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function createWrapper(
        IERC20 token,
        bytes32 currencyKey,
        bytes32 synthContractName
    ) external onlyOwner returns (address) {
        // Create the wrapper instance
        Wrapper wrapper = new Wrapper(owner, address(resolver), token, currencyKey, synthContractName);

        // Register it so that MultiCollateralSynth knows to trust it
        flexibleStorage().setUIntValue(WRAPPER_FACTORY_CONTRACT_NAME, bytes32(uint(address(wrapper))), WRAPPER_VERSION);

        return address(wrapper);
    }

    function distributeFees() external {}
}
