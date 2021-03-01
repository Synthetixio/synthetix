pragma solidity ^0.5.16;

// Inheritance
import "./interfaces/IERC20.sol";
import "./ExternStateToken.sol";
import "./MixinResolver.sol";
import "./interfaces/ISynthetix.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./TokenState.sol";
import "./interfaces/ISynthetixState.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IRewardsDistribution.sol";
import "./interfaces/IVirtualSynth.sol";


contract BaseSynthetix is IERC20, ExternStateToken, MixinResolver, ISynthetix {
    // ========== STATE VARIABLES ==========

    // Available Synths which can be used with the system
    string public constant TOKEN_NAME = "Synthetix Network Token";
    string public constant TOKEN_SYMBOL = "SNX";
    uint8 public constant DECIMALS = 18;
    bytes32 public constant sUSD = "sUSD";

    // ========== ADDRESS RESOLVER CONFIGURATION ==========
    bytes32 private constant CONTRACT_SYNTHETIXSTATE = "SynthetixState";
    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDSDISTRIBUTION = "RewardsDistribution";

    // ========== CONSTRUCTOR ==========

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        address _owner,
        uint _totalSupply,
        address _resolver
    )
        public
        ExternStateToken(_proxy, _tokenState, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _owner)
        MixinResolver(_resolver)
    {}

    // ========== VIEWS ==========

    // Note: use public visibility so that it can be invoked in a subclass
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](5);
        addresses[0] = CONTRACT_SYNTHETIXSTATE;
        addresses[1] = CONTRACT_SYSTEMSTATUS;
        addresses[2] = CONTRACT_EXCHANGER;
        addresses[3] = CONTRACT_ISSUER;
        addresses[4] = CONTRACT_REWARDSDISTRIBUTION;
    }

    function synthetixState() internal view returns (ISynthetixState) {
        return ISynthetixState(requireAndGetAddress(CONTRACT_SYNTHETIXSTATE));
    }

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function rewardsDistribution() internal view returns (IRewardsDistribution) {
        return IRewardsDistribution(requireAndGetAddress(CONTRACT_REWARDSDISTRIBUTION));
    }

    function debtBalanceOf(address account, bytes32 currencyKey) external view returns (uint) {
        return issuer().debtBalanceOf(account, currencyKey);
    }

    function totalIssuedSynths(bytes32 currencyKey) external view returns (uint) {
        return issuer().totalIssuedSynths(currencyKey, false);
    }

    function totalIssuedSynthsExcludeEtherCollateral(bytes32 currencyKey) external view returns (uint) {
        return issuer().totalIssuedSynths(currencyKey, true);
    }

    function availableCurrencyKeys() external view returns (bytes32[] memory) {
        return issuer().availableCurrencyKeys();
    }

    function availableSynthCount() external view returns (uint) {
        return issuer().availableSynthCount();
    }

    function availableSynths(uint index) external view returns (ISynth) {
        return issuer().availableSynths(index);
    }

    function synths(bytes32 currencyKey) external view returns (ISynth) {
        return issuer().synths(currencyKey);
    }

    function synthsByAddress(address synthAddress) external view returns (bytes32) {
        return issuer().synthsByAddress(synthAddress);
    }

    function isWaitingPeriod(bytes32 currencyKey) external view returns (bool) {
        return exchanger().maxSecsLeftInWaitingPeriod(messageSender, currencyKey) > 0;
    }

    function anySynthOrSNXRateIsInvalid() external view returns (bool anyRateInvalid) {
        return issuer().anySynthOrSNXRateIsInvalid();
    }

    function maxIssuableSynths(address account) external view returns (uint maxIssuable) {
        return issuer().maxIssuableSynths(account);
    }

    function remainingIssuableSynths(address account)
        external
        view
        returns (
            uint maxIssuable,
            uint alreadyIssued,
            uint totalSystemDebt
        )
    {
        return issuer().remainingIssuableSynths(account);
    }

    function collateralisationRatio(address _issuer) external view returns (uint) {
        return issuer().collateralisationRatio(_issuer);
    }

    function collateral(address account) external view returns (uint) {
        return issuer().collateral(account);
    }

    function transferableSynthetix(address account) external view returns (uint transferable) {
        (transferable, ) = issuer().transferableSynthetixAndAnyRateIsInvalid(account, tokenState.balanceOf(account));
    }

    function _canTransfer(address account, uint value) internal view returns (bool) {
        (uint initialDebtOwnership, ) = synthetixState().issuanceData(account);

        if (initialDebtOwnership > 0) {
            (uint transferable, bool anyRateIsInvalid) = issuer().transferableSynthetixAndAnyRateIsInvalid(
                account,
                tokenState.balanceOf(account)
            );
            require(value <= transferable, "Cannot transfer staked or escrowed SNX");
            require(!anyRateIsInvalid, "A synth or SNX rate is invalid");
        }
        return true;
    }

    // ========== MUTATIVE FUNCTIONS ==========

    function exchange(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    ) external exchangeActive(sourceCurrencyKey, destinationCurrencyKey) optionalProxy returns (uint amountReceived) {
        return exchanger().exchange(messageSender, sourceCurrencyKey, sourceAmount, destinationCurrencyKey, messageSender);
    }

    function settle(bytes32 currencyKey)
        external
        optionalProxy
        returns (
            uint reclaimed,
            uint refunded,
            uint numEntriesSettled
        )
    {
        return exchanger().settle(messageSender, currencyKey);
    }

    function exchangeOnBehalf(
        address exchangeForAddress,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    ) external exchangeActive(sourceCurrencyKey, destinationCurrencyKey) optionalProxy returns (uint amountReceived) {
        return
            exchanger().exchangeOnBehalf(
                exchangeForAddress,
                messageSender,
                sourceCurrencyKey,
                sourceAmount,
                destinationCurrencyKey
            );
    }

    function exchangeWithTracking(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address originator,
        bytes32 trackingCode
    ) external exchangeActive(sourceCurrencyKey, destinationCurrencyKey) optionalProxy returns (uint amountReceived) {
        return
            exchanger().exchangeWithTracking(
                messageSender,
                sourceCurrencyKey,
                sourceAmount,
                destinationCurrencyKey,
                messageSender,
                originator,
                trackingCode
            );
    }

    function exchangeOnBehalfWithTracking(
        address exchangeForAddress,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address originator,
        bytes32 trackingCode
    ) external exchangeActive(sourceCurrencyKey, destinationCurrencyKey) optionalProxy returns (uint amountReceived) {
        return
            exchanger().exchangeOnBehalfWithTracking(
                exchangeForAddress,
                messageSender,
                sourceCurrencyKey,
                sourceAmount,
                destinationCurrencyKey,
                originator,
                trackingCode
            );
    }

    function transfer(address to, uint value) external optionalProxy systemActive returns (bool) {
        // Ensure they're not trying to exceed their locked amount -- only if they have debt.
        _canTransfer(messageSender, value);

        // Perform the transfer: if there is a problem an exception will be thrown in this call.
        _transferByProxy(messageSender, to, value);

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint value
    ) external optionalProxy systemActive returns (bool) {
        // Ensure they're not trying to exceed their locked amount -- only if they have debt.
        _canTransfer(from, value);

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        return _transferFromByProxy(messageSender, from, to, value);
    }

    function issueSynths(uint amount) external issuanceActive optionalProxy {
        return issuer().issueSynths(messageSender, amount);
    }

    function issueSynthsOnBehalf(address issueForAddress, uint amount) external issuanceActive optionalProxy {
        return issuer().issueSynthsOnBehalf(issueForAddress, messageSender, amount);
    }

    function issueMaxSynths() external issuanceActive optionalProxy {
        return issuer().issueMaxSynths(messageSender);
    }

    function issueMaxSynthsOnBehalf(address issueForAddress) external issuanceActive optionalProxy {
        return issuer().issueMaxSynthsOnBehalf(issueForAddress, messageSender);
    }

    function burnSynths(uint amount) external issuanceActive optionalProxy {
        return issuer().burnSynths(messageSender, amount);
    }

    function burnSynthsOnBehalf(address burnForAddress, uint amount) external issuanceActive optionalProxy {
        return issuer().burnSynthsOnBehalf(burnForAddress, messageSender, amount);
    }

    function burnSynthsToTarget() external issuanceActive optionalProxy {
        return issuer().burnSynthsToTarget(messageSender);
    }

    function burnSynthsToTargetOnBehalf(address burnForAddress) external issuanceActive optionalProxy {
        return issuer().burnSynthsToTargetOnBehalf(burnForAddress, messageSender);
    }

    function exchangeWithVirtual(
        bytes32,
        uint,
        bytes32,
        bytes32
    ) external returns (uint, IVirtualSynth) {
        _notImplemented();
    }

    function mint() external returns (bool) {
        _notImplemented();
    }

    function liquidateDelinquentAccount(address, uint) external returns (bool) {
        _notImplemented();
    }

    function mintSecondary(address, uint) external {
        _notImplemented();
    }

    function mintSecondaryRewards(uint) external {
        _notImplemented();
    }

    function burnSecondary(address, uint) external {
        _notImplemented();
    }

    function _notImplemented() internal pure {
        revert("Cannot be run on this layer");
    }

    // ========== MODIFIERS ==========

    modifier systemActive() {
        _systemActive();
        _;
    }

    function _systemActive() private {
        systemStatus().requireSystemActive();
    }

    modifier issuanceActive() {
        _issuanceActive();
        _;
    }

    function _issuanceActive() private {
        systemStatus().requireIssuanceActive();
    }

    modifier exchangeActive(bytes32 src, bytes32 dest) {
        _exchangeActive(src, dest);
        _;
    }

    function _exchangeActive(bytes32 src, bytes32 dest) private {
        systemStatus().requireExchangeBetweenSynthsAllowed(src, dest);
    }

    modifier onlyExchanger() {
        _onlyExchanger();
        _;
    }

    function _onlyExchanger() private {
        require(msg.sender == address(exchanger()), "Only Exchanger can invoke this");
    }

    // ========== EVENTS ==========
    event SynthExchange(
        address indexed account,
        bytes32 fromCurrencyKey,
        uint256 fromAmount,
        bytes32 toCurrencyKey,
        uint256 toAmount,
        address toAddress
    );
    bytes32 internal constant SYNTHEXCHANGE_SIG = keccak256(
        "SynthExchange(address,bytes32,uint256,bytes32,uint256,address)"
    );

    function emitSynthExchange(
        address account,
        bytes32 fromCurrencyKey,
        uint256 fromAmount,
        bytes32 toCurrencyKey,
        uint256 toAmount,
        address toAddress
    ) external onlyExchanger {
        proxy._emit(
            abi.encode(fromCurrencyKey, fromAmount, toCurrencyKey, toAmount, toAddress),
            2,
            SYNTHEXCHANGE_SIG,
            addressToBytes32(account),
            0,
            0
        );
    }

    event ExchangeTracking(bytes32 indexed trackingCode, bytes32 toCurrencyKey, uint256 toAmount);
    bytes32 internal constant EXCHANGE_TRACKING_SIG = keccak256("ExchangeTracking(bytes32,bytes32,uint256)");

    function emitExchangeTracking(
        bytes32 trackingCode,
        bytes32 toCurrencyKey,
        uint256 toAmount
    ) external onlyExchanger {
        proxy._emit(abi.encode(toCurrencyKey, toAmount), 2, EXCHANGE_TRACKING_SIG, trackingCode, 0, 0);
    }

    event ExchangeReclaim(address indexed account, bytes32 currencyKey, uint amount);
    bytes32 internal constant EXCHANGERECLAIM_SIG = keccak256("ExchangeReclaim(address,bytes32,uint256)");

    function emitExchangeReclaim(
        address account,
        bytes32 currencyKey,
        uint256 amount
    ) external onlyExchanger {
        proxy._emit(abi.encode(currencyKey, amount), 2, EXCHANGERECLAIM_SIG, addressToBytes32(account), 0, 0);
    }

    event ExchangeRebate(address indexed account, bytes32 currencyKey, uint amount);
    bytes32 internal constant EXCHANGEREBATE_SIG = keccak256("ExchangeRebate(address,bytes32,uint256)");

    function emitExchangeRebate(
        address account,
        bytes32 currencyKey,
        uint256 amount
    ) external onlyExchanger {
        proxy._emit(abi.encode(currencyKey, amount), 2, EXCHANGEREBATE_SIG, addressToBytes32(account), 0, 0);
    }
}
