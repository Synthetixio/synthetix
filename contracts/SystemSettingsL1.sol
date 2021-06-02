pragma solidity ^0.5.16;

// Inheritance
import "./MixinSystemSettingsL1.sol";
import "./SystemSettings.sol";

// https://docs.synthetix.io/contracts/source/contracts/systemsettingsl1
contract SystemSettingsL1 is MixinSystemSettingsL1, SystemSettings {
    // Atomic block volume limit is encoded as uint192.
    uint public constant MAX_ATOMIC_VOLUME_PER_BLOCK = uint192(-1);

    // TWAP window must be between 30min and 1 day.
    uint public constant MIN_ATOMIC_TWAP_PRICE_WINDOW = 1800;
    uint public constant MAX_ATOMIC_TWAP_PRICE_WINDOW = 86400;

    constructor(address _owner, address _resolver) public SystemSettings(_owner, _resolver) {}

    // ========== VIEWS ==========

    // SIP-120 Atomic exchanges
    // max allowed volume per block for atomic exchanges
    function atomicMaxVolumePerBlock() external view returns (uint) {
        return getAtomicMaxVolumePerBlock();
    }

    // SIP-120 Atomic exchanges
    // time window (in seconds) for TWAP prices when considered for atomic exchanges
    function atomicTwapPriceWindow() external view returns (uint) {
        return getAtomicTwapPriceWindow();
    }

    // SIP-120 Atomic exchanges
    // equivalent asset to use for a synth when considering external prices for atomic exchanges
    function atomicEquivalentForDexPricing(bytes32 currencyKey) external view returns (address) {
        return getAtomicEquivalentForDexPricing(currencyKey);
    }

    // SIP-120 Atomic exchanges
    // fee rate override for atomic exchanges into a synth
    function atomicExchangeFeeRate(bytes32 currencyKey) external view returns (uint) {
        return getAtomicExchangeFeeRate(currencyKey);
    }

    // SIP-120 Atomic exchanges
    // price dampener for chainlink prices when considered for atomic exchanges
    function atomicPriceBuffer(bytes32 currencyKey) external view returns (uint) {
        return getAtomicPriceBuffer(currencyKey);
    }

    // ========== RESTRICTED ==========

    function setAtomicMaxVolumePerBlock(uint _maxVolume) external onlyOwner {
        require(_maxVolume <= MAX_ATOMIC_VOLUME_PER_BLOCK, "Atomic max volume exceed maximum uint192");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_ATOMIC_MAX_VOLUME_PER_BLOCK, _maxVolume);
        emit AtomicMaxVolumePerBlockUpdated(_maxVolume);
    }

    function setAtomicTwapPriceWindow(uint _window) external onlyOwner {
        require(_window >= MIN_ATOMIC_TWAP_PRICE_WINDOW, "Atomic twap window under minimum 30 min");
        require(_window <= MAX_ATOMIC_TWAP_PRICE_WINDOW, "Atomic twap window exceed maximum 1 day");
        flexibleStorage().setUIntValue(SETTING_CONTRACT_NAME, SETTING_ATOMIC_TWAP_PRICE_WINDOW, _window);
        emit AtomicTwapPriceWindowUpdated(_window);
    }

    function setAtomicEquivalentForDexPricing(bytes32 _currencyKey, address _equivalent) external onlyOwner {
        flexibleStorage().setAddressValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTING_ATOMIC_EQUIVALENT_FOR_DEX_PRICING, _currencyKey)),
            _equivalent
        );
        emit AtomicEquivalentForDexPricingUpdated(_currencyKey, _equivalent);
    }

    function setAtomicExchangeFeeRate(bytes32 _currencyKey, uint256 _exchangeFeeRate) external onlyOwner {
        require(_exchangeFeeRate <= MAX_EXCHANGE_FEE_RATE, "MAX_EXCHANGE_FEE_RATE exceeded");
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTING_ATOMIC_EXCHANGE_FEE_RATE, _currencyKey)),
            _exchangeFeeRate
        );
        emit AtomicExchangeFeeUpdated(_currencyKey, _exchangeFeeRate);
    }

    function setAtomicPriceBuffer(bytes32 _currencyKey, uint _buffer) external onlyOwner {
        flexibleStorage().setUIntValue(
            SETTING_CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTING_ATOMIC_PRICE_BUFFER, _currencyKey)),
            _buffer
        );
        emit AtomicPriceBufferUpdated(_currencyKey, _buffer);
    }

    event AtomicMaxVolumePerBlockUpdated(uint newMaxVolume);
    event AtomicTwapPriceWindowUpdated(uint newWindow);
    event AtomicEquivalentForDexPricingUpdated(bytes32 synthKey, address equivalent);
    event AtomicExchangeFeeUpdated(bytes32 synthKey, uint newExchangeFeeRate);
    event AtomicPriceBufferUpdated(bytes32 synthKey, uint newBuffer);
}
