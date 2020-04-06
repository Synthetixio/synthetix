pragma solidity 0.4.25;

import "./SafeDecimalMath.sol";
import "./Synth.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynthetix.sol";


// https://docs.synthetix.io/contracts/PurgeableSynth
contract PurgeableSynth is Synth {
    using SafeDecimalMath for uint;

    // The maximum allowed amount of tokenSupply in equivalent sUSD value for this synth to permit purging
    uint public maxSupplyToPurgeInUSD = 100000 * SafeDecimalMath.unit(); // 100,000

    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _proxy,
        TokenState _tokenState,
        string _tokenName,
        string _tokenSymbol,
        address _owner,
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

    /**
     * @notice Function that allows owner to exchange any number of holders back to sUSD (for frozen or deprecated synths)
     * @param addresses The list of holders to purge
     */
    function purge(address[] addresses) external optionalProxy_onlyOwner {
        IExchangeRates exRates = exchangeRates();

        uint maxSupplyToPurge = exRates.effectiveValue("sUSD", maxSupplyToPurgeInUSD, currencyKey);

        // Only allow purge when total supply is lte the max or the rate is frozen in ExchangeRates
        require(
            totalSupply <= maxSupplyToPurge || exRates.rateIsFrozen(currencyKey),
            "Cannot purge as total supply is above threshold and rate is not frozen."
        );

        for (uint i = 0; i < addresses.length; i++) {
            address holder = addresses[i];

            uint amountHeld = balanceOf(holder);

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
        proxy._emit(abi.encode(value), 2, PURGED_SIG, bytes32(account), 0, 0);
    }
}
