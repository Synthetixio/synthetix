/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       MultiCollateralSynth.sol

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

MultiCollateralSynth synths are a subclass of Synth that allows the
multiCollateral contract to issue and burn synths.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./Synth.sol";


contract MultiCollateralSynth is Synth {
    /* ========== CONSTRUCTOR ========== */
    bytes32 public multiCollateralKey;

    constructor(
        address _proxy,
        TokenState _tokenState,
        string _tokenName,
        string _tokenSymbol,
        address _owner,
        bytes32 _currencyKey,
        uint _totalSupply,
        address _resolver,
        bytes32 _multiCollateralKey
    ) public Synth(_proxy, _tokenState, _tokenName, _tokenSymbol, _owner, _currencyKey, _totalSupply, _resolver) {
        multiCollateralKey = _multiCollateralKey;
    }

    /* ========== VIEWS ======================= */

    function multiCollateral() internal view returns (address) {
        require(resolver.getAddress(multiCollateralKey) != address(0), "Resolver is missing multiCollateral address");
        return resolver.getAddress(multiCollateralKey);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Function that allows multi Collateral to issue a certain number of synths from an account.
     * @param account Account to issue synths to
     * @param amount Number of synths
     */
    function issue(address account, uint amount) external onlyMultiCollateralOrSynthetix {
        super._internalIssue(account, amount);
    }

    /**
     * @notice Function that allows multi Collateral to burn a certain number of synths from an account.
     * @param account Account to burn synths from
     * @param amount Number of synths
     */
    function burn(address account, uint amount) external onlyMultiCollateralOrSynthetix {
        super._internalBurn(account, amount);
    }

    /* ========== MODIFIERS ========== */

    // Contracts directly interacting with multiCollateralSynth to issue and burn
    modifier onlyMultiCollateralOrSynthetix() {
        bool isSynthetix = msg.sender == address(synthetix());
        bool isMultiCollateral = msg.sender == address(multiCollateral());

        require(isMultiCollateral || isSynthetix, "Only multicollateral, Synthetix allowed");
        _;
    }
}
