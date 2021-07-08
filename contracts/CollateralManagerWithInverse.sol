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
    ) public BaseCollateralManager(_state, _owner, _resolver, _maxDebt, _baseBorrowRate, _baseShortRate) {}

    /* ========== VIEWS ========== */

    /* ---------- State Information ---------- */

    // override _requiredShortAddresses
    function _requiredShortAddresses(uint length) internal view returns (bytes32[] memory shortAddresses) {
        shortAddresses = new bytes32[](length * 2);
        for (uint i = 0; i < length; i++) {
            shortAddresses[i] = _shortableSynths.elements[i];
            shortAddresses[i + length] = synthToInverseSynth[_shortableSynths.elements[i]];
        }
        return shortAddresses;
    }

    // override getShortRate inverseSupply for L1 iSynths
    function _getInverseSupply(bytes32 synth) internal view returns (uint) {
        return IERC20(address(BaseCollateralManager._synth(synthToInverseSynth[synth]))).totalSupply();
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // When we add a shortable synth, we need to know the iSynth as well
    // This is so we can get the proper skew for the short rate.
    function addShortableSynthsWithInverses(
        bytes32[2][] calldata requiredSynthAndInverseNamesInResolver,
        bytes32[] calldata synthKeys
    ) external onlyOwner {
        require(requiredSynthAndInverseNamesInResolver.length == synthKeys.length, "Input array length mismatch");

        for (uint i = 0; i < requiredSynthAndInverseNamesInResolver.length; i++) {
            // setting these explicitly for clarity
            // Each entry in the array is [Synth, iSynth]
            bytes32 synth = requiredSynthAndInverseNamesInResolver[i][0];
            bytes32 iSynth = requiredSynthAndInverseNamesInResolver[i][1];

            if (!_shortableSynths.contains(synth)) {
                // Add it to the address set lib.
                _shortableSynths.add(synth);

                // store the mapping to the iSynth so we can get its total supply for the borrow rate.
                synthToInverseSynth[synth] = iSynth;

                shortableSynthsByKey[synthKeys[i]] = synth;

                emit ShortableSynthAdded(synth);

                // now the associated synth key to the CollateralManagerState
                state.addShortCurrency(synthKeys[i]);
            }
        }

        rebuildCache();
    }

    function removeShortableSynths(bytes32[] calldata synths) external onlyOwner {
        for (uint i = 0; i < synths.length; i++) {
            if (_shortableSynths.contains(synths[i])) {
                // Remove it from the the address set lib.
                _shortableSynths.remove(synths[i]);

                bytes32 synthKey = _synth(synths[i]).currencyKey();

                state.removeShortCurrency(synthKey);

                // remove the inverse mapping.
                delete synthToInverseSynth[synths[i]];

                emit ShortableSynthRemoved(synths[i]);
            }
        }
    }
}
