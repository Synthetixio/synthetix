pragma solidity ^0.5.16;

// Inheritance
import "./Synth.sol";

// Internal references
import "./interfaces/ICollateralManager.sol";
import "./interfaces/IEtherCollateralsUSD.sol";
import "./interfaces/IEtherCollateral.sol";
import "./interfaces/IEtherWrapper.sol";

// https://docs.synthetix.io/contracts/source/contracts/multicollateralsynth
contract MultiCollateralSynth is Synth {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_COLLATERALMANAGER = "CollateralManager";
    bytes32 private constant CONTRACT_ETH_COLLATERAL = "EtherCollateral";
    bytes32 private constant CONTRACT_ETH_COLLATERAL_SUSD = "EtherCollateralsUSD";
    bytes32 private constant CONTRACT_ETHER_WRAPPER = "EtherWrapper";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        string memory _tokenName,
        string memory _tokenSymbol,
        address _owner,
        bytes32 _currencyKey,
        uint _totalSupply,
        address _resolver
    ) public Synth(_proxy, _tokenState, _tokenName, _tokenSymbol, _owner, _currencyKey, _totalSupply, _resolver) {}

    /* ========== VIEWS ======================= */

    function collateralManager() internal view returns (ICollateralManager) {
        return ICollateralManager(requireAndGetAddress(CONTRACT_COLLATERALMANAGER));
    }

    function etherCollateral() internal view returns (IEtherCollateral) {
        return IEtherCollateral(requireAndGetAddress(CONTRACT_ETH_COLLATERAL));
    }

    function etherCollateralsUSD() internal view returns (IEtherCollateralsUSD) {
        return IEtherCollateralsUSD(requireAndGetAddress(CONTRACT_ETH_COLLATERAL_SUSD));
    }

    function etherWrapper() internal view returns (IEtherWrapper) {
        return IEtherWrapper(requireAndGetAddress(CONTRACT_ETHER_WRAPPER));
    }

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = Synth.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_COLLATERALMANAGER;
        newAddresses[1] = CONTRACT_ETH_COLLATERAL;
        newAddresses[2] = CONTRACT_ETH_COLLATERAL_SUSD;
        newAddresses[3] = CONTRACT_ETHER_WRAPPER;
        addresses = combineArrays(existingAddresses, newAddresses);
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
        bool isEtherCollateral = msg.sender == address(etherCollateral());
        bool isEtherCollateralsUSD = msg.sender == address(etherCollateralsUSD());
        bool isEtherWrapper = msg.sender == address(etherWrapper());
        bool isMultiCollateral = collateralManager().hasCollateral(msg.sender);

        require(
            isFeePool ||
                isExchanger ||
                isIssuer ||
                isEtherCollateral ||
                isEtherCollateralsUSD ||
                isEtherWrapper ||
                isMultiCollateral,
            "Only FeePool, Exchanger, Issuer or MultiCollateral contracts allowed"
        );
        _;
    }
}
