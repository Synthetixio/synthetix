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

    constructor(
        address _proxy,
        TokenState _tokenState,
        string _tokenName,
        string _tokenSymbol,
        address _owner,
        bytes32 _currencyKey,
        uint _totalSupply,
        address _resolver
    ) public Synth(_proxy, _tokenState, _tokenName, _tokenSymbol, _owner, _currencyKey, _totalSupply, _resolver) {}

    /* ========== VIEWS ======================= */

    function multiCollateral() internal view returns (address) {
        require(resolver.getAddress("MultiCollateral") != address(0), "Resolver is missing MultiCollateral address");
        return resolver.getAddress("MultiCollateral");
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

    modifier onlyMultiCollateralOrSynthetix() {
        bool isSynthetix = msg.sender == address(synthetix());
        address _multiCollateral = multiCollateral();
        bool isMultiCollateral = (messageSender == _multiCollateral || msg.sender == _multiCollateral);

        require(isMultiCollateral || isSynthetix, "Only multicollateral, Synthetix allowed");
        _;
    }
}
