pragma solidity ^0.5.16;

// Inheritance
import "./Synth.sol";


// https://docs.synthetix.io/contracts/source/contracts/multicollateralsynth
contract MultiCollateralSynth is Synth {
    bytes32 public multiCollateralKey;

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        string memory _tokenName,
        string memory _tokenSymbol,
        address _owner,
        bytes32 _currencyKey,
        uint _totalSupply,
        address _resolver,
        bytes32 _multiCollateralKey
    ) public Synth(_proxy, _tokenState, _tokenName, _tokenSymbol, _owner, _currencyKey, _totalSupply, _resolver) {
        multiCollateralKey = _multiCollateralKey;
    }

    /* ========== VIEWS ======================= */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = Synth.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = multiCollateralKey;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function multiCollateral() internal view returns (address) {
        return requireAndGetAddress(multiCollateralKey);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Function that allows multi Collateral to issue a certain number of synths from an account.
     * @param account Account to issue synths to
     * @param amount Number of synths
     */
    function issue(address account, uint amount) external onlyInternalContracts {
        super._internalIssue(account, amount);
    }

    /**
     * @notice Function that allows multi Collateral to burn a certain number of synths from an account.
     * @param account Account to burn synths from
     * @param amount Number of synths
     */
    function burn(address account, uint amount) external onlyInternalContracts {
        super._internalBurn(account, amount);
    }

    /* ========== MODIFIERS ========== */

    // Contracts directly interacting with multiCollateralSynth to issue and burn
    modifier onlyInternalContracts() {
        bool isFeePool = msg.sender == address(feePool());
        bool isExchanger = msg.sender == address(exchanger());
        bool isIssuer = msg.sender == address(issuer());
        bool isMultiCollateral = msg.sender == address(multiCollateral());

        require(
            isFeePool || isExchanger || isIssuer || isMultiCollateral,
            "Only FeePool, Exchanger, Issuer or MultiCollateral contracts allowed"
        );
        _;
    }
}
