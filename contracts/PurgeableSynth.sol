pragma solidity ^0.5.16;

// Inheritance
import "./Synth.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal References
import "./interfaces/IExchangeRates.sol";


// https://docs.synthetix.io/contracts/source/contracts/purgeablesynth
contract PurgeableSynth is Synth {
    using SafeDecimalMath for uint;

    // The maximum allowed amount of tokenSupply in equivalent sUSD value for this synth to permit purging
    uint public maxSupplyToPurgeInUSD = 100000 * SafeDecimalMath.unit(); // 100,000

    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        string memory _tokenName,
        string memory _tokenSymbol,
        address payable _owner,
        bytes32 _currencyKey,
        uint _totalSupply,
        address _resolver
    ) public Synth(_proxy, _tokenState, _tokenName, _tokenSymbol, _owner, _currencyKey, _totalSupply, _resolver) {
        appendToAddressCache(CONTRACT_EXRATES);
    }

    /* ========== VIEWS ========== */

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function purge(address[] calldata addresses) external optionalProxy_onlyOwner {
        IExchangeRates exRates = exchangeRates();

        uint maxSupplyToPurge = exRates.effectiveValue("sUSD", maxSupplyToPurgeInUSD, currencyKey);

        // Only allow purge when total supply is lte the max or the rate is frozen in ExchangeRates
        require(
            totalSupply <= maxSupplyToPurge || exRates.rateIsFrozen(currencyKey),
            "Cannot purge as total supply is above threshold and rate is not frozen."
        );

        for (uint i = 0; i < addresses.length; i++) {
            address holder = addresses[i];

            uint amountHeld = tokenState.balanceOf(holder);

            if (amountHeld > 0) {
                exchanger().exchange(holder, currencyKey, amountHeld, "sUSD", holder);
                emitPurged(holder, amountHeld);
            }
        }
    }

    /* ========== EVENTS ========== */
    event Purged(address indexed account, uint value);
    bytes32 private constant PURGED_SIG = keccak256("Purged(address,uint256)");

    function emitPurged(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, PURGED_SIG, addressToBytes32(account), 0, 0);
    }
}
