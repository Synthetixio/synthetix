pragma solidity ^0.5.16;

// Inheritance
import "./BaseCollateralManager.sol";

contract CollateralManagerWithInverse is BaseCollateralManager {
    /* ========== STATE VARIABLES ========== */

    mapping(bytes32 => bytes32) public synthToInverseSynth;

    /* ========== CONSTRUCTOR ========== */
    constructor(
        CollateralManagerState _state,
        address _owner,
        address _resolver,
        uint _maxDebt,
        uint _baseBorrowRate,
        uint _baseShortRate
    ) public BaseCollateralManager(_owner, _resolver, _maxDebt, _baseBorrowRate, _baseShortRate) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory staticAddresses = new bytes32[](2);
        staticAddresses[0] = CONTRACT_ISSUER;
        staticAddresses[1] = CONTRACT_EXRATES;

        // we want to cache the name of the synth and the name of its corresponding iSynth
        bytes32[] memory shortAddresses;
        uint length = _shortableSynths.elements.length;

        if (length > 0) {
            shortAddresses = new bytes32[](length * 2);

            for (uint i = 0; i < length; i++) {
                shortAddresses[i] = _shortableSynths.elements[i];
                shortAddresses[i + length] = synthToInverseSynth[_shortableSynths.elements[i]];
            }
        }

        bytes32[] memory synthAddresses = combineArrays(shortAddresses, _synths.elements);

        if (synthAddresses.length > 0) {
            addresses = combineArrays(synthAddresses, staticAddresses);
        } else {
            addresses = staticAddresses;
        }
    }

    /* ---------- State Information ---------- */

    // TODO: Enforce a maximum?
    function getShortRate(bytes32 synthKey) public view returns (uint shortRate, bool rateIsInvalid) {
        rateIsInvalid = _exchangeRates().rateIsInvalid(synthKey);

        // get the long supply of
        uint longSupply = IERC20(address(_synth(shortableSynthsByKey[synthKey]))).totalSupply();
        uint inverseSupply = IERC20(address(_synth(synthToInverseSynth[synth]))).totalSupply();
        // add the iSynth to supply properly reflect the market skew.
        uint shortSupply = state.short(synthKey).add(inverseSupply);

        // in this case, the market is skewed long so its free to short.
        if (longSupply > shortSupply) {
            return (0, rateIsInvalid);
        }

        // otherwise workout the skew towards the short side.
        uint skew = shortSupply.sub(longSupply);

        // divide through by the size of the market
        // TOOD: add a maximum here
        uint proportionalSkew = skew.divideDecimal(longSupply.add(shortSupply)).divideDecimal(SECONDS_IN_A_YEAR);

        // finally, add the base short rate.
        shortRate = proportionalSkew.add(baseShortRate);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // When we add a shortable synth, we need to know the iSynth as well
    // This is so we can get the proper skew for the short rate.
    function addShortableSynths(bytes32[] calldata requiredSynthNamesInResolver, bytes32[] calldata synthKeys)
        external
        onlyOwner
    {
        require(requiredSynthNamesInResolver.length == synthKeys.length, "Input array length mismatch");

        for (uint i = 0; i < requiredSynthNamesInResolver.length; i++) {
            // setting these explicitly for clarity
            // Each entry in the array is [Synth, iSynth]
            bytes32 synth = requiredSynthNamesInResolver[i];

            if (!_shortableSynths.contains(synth)) {
                // Add it to the address set lib.
                _shortableSynths.add(synth);

                // store the mapping to the iSynth so we can get its total supply for the borrow rate.
                shortableSynthsByKey[synthKeys[i]] = synth;

                emit ShortableSynthAdded(synth);

                // now the associated synth key to the CollateralManagerState
                state.addShortCurrency(synthKeys[i]);
            }
        }

        rebuildCache();
    }

    function areShortableSynthsSet(bytes32[] calldata requiredSynthNamesInResolver, bytes32[] calldata synthKeys)
        external
        view
        returns (bool)
    {
        require(requiredSynthNamesInResolver.length == synthKeys.length, "Input array length mismatch");

        if (_shortableSynths.elements.length != requiredSynthNamesInResolver.length) {
            return false;
        }

        // first check contract state
        for (uint i = 0; i < requiredSynthNamesInResolver.length; i++) {
            // bytes32 synthName = requiredSynthNamesInResolver[i];
            // if (!_shortableSynths.contains(synthName) || synthToInverseSynth[synthName] == bytes32(0)) {
            //     return false;
            // }
        }

        // now check everything added to external state contract
        for (uint i = 0; i < synthKeys.length; i++) {
            if (state.getShortRatesLength(synthKeys[i]) == 0) {
                return false;
            }
        }

        return true;
    }

    function removeShortableSynths(bytes32[] calldata synths) external onlyOwner {
        for (uint i = 0; i < synths.length; i++) {
            if (_shortableSynths.contains(synths[i])) {
                // Remove it from the the address set lib.
                _shortableSynths.remove(synths[i]);

                bytes32 synthKey = _synth(synths[i]).currencyKey();

                state.removeShortCurrency(synthKey);

                // remove the inverse mapping.
                // delete synthToInverseSynth[synths[i]];

                emit ShortableSynthRemoved(synths[i]);
            }
        }
    }

    /* ---------- STATE MUTATIONS ---------- */

    function updateBorrowRates(uint rate) internal {
        state.updateBorrowRates(rate);
    }

    function updateShortRates(bytes32 currency, uint rate) internal {
        state.updateShortRates(currency, rate);
    }

    function updateBorrowRatesCollateral(uint rate) external onlyCollateral {
        state.updateBorrowRates(rate);
    }

    function updateShortRatesCollateral(bytes32 currency, uint rate) external onlyCollateral {
        state.updateShortRates(currency, rate);
    }

    function incrementLongs(bytes32 synth, uint amount) external onlyCollateral {
        state.incrementLongs(synth, amount);
    }

    function decrementLongs(bytes32 synth, uint amount) external onlyCollateral {
        state.decrementLongs(synth, amount);
    }

    function incrementShorts(bytes32 synth, uint amount) external onlyCollateral {
        state.incrementShorts(synth, amount);
    }

    function decrementShorts(bytes32 synth, uint amount) external onlyCollateral {
        state.decrementShorts(synth, amount);
    }

    function accrueInterest(
        uint interestIndex,
        bytes32 currency,
        bool isShort
    ) external onlyCollateral returns (uint difference, uint index) {
        // 1. Get the rates we need.
        (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) =
            isShort ? getShortRatesAndTime(currency, interestIndex) : getRatesAndTime(interestIndex);

        // 2. Get the instantaneous rate.
        (uint rate, bool invalid) = isShort ? getShortRate(currency) : getBorrowRate();

        require(!invalid);

        // 3. Get the time since we last updated the rate.
        // TODO: consider this in the context of l2 time.
        uint timeDelta = block.timestamp.sub(lastUpdated).mul(1e18);

        // 4. Get the latest cumulative rate. F_n+1 = F_n + F_last
        uint latestCumulative = lastRate.add(rate.multiplyDecimal(timeDelta));

        // 5. Return the rate differential and the new interest index.
        difference = latestCumulative.sub(entryRate);
        index = newIndex;

        // 5. Update rates with the lastest cumulative rate. This also updates the time.
        isShort ? updateShortRates(currency, latestCumulative) : updateBorrowRates(latestCumulative);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyCollateral {
        bool isMultiCollateral = hasCollateral(msg.sender);

        require(isMultiCollateral, "Only collateral contracts");
        _;
    }

    // ========== EVENTS ==========
    event MaxDebtUpdated(uint maxDebt);
    event LiquidationPenaltyUpdated(uint liquidationPenalty);
    event BaseBorrowRateUpdated(uint baseBorrowRate);
    event BaseShortRateUpdated(uint baseShortRate);

    event CollateralAdded(address collateral);
    event CollateralRemoved(address collateral);

    event SynthAdded(bytes32 synth);
    event SynthRemoved(bytes32 synth);

    event ShortableSynthAdded(bytes32 synth);
    event ShortableSynthRemoved(bytes32 synth);
}
