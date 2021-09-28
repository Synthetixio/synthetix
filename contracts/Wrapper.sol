pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IWrapper.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";

// Internal references
import "./Pausable.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IDebtCache.sol";
import "./interfaces/IWrapperFactory.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

// https://docs.synthetix.io/contracts/source/contracts/wrapper
contract Wrapper is Owned, Pausable, MixinResolver, MixinSystemSettings, IWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant ETH = "ETH";
    bytes32 internal constant SNX = "SNX";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTH_SUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_DEBTCACHE = "DebtCache";
    bytes32 private constant CONTRACT_WRAPPERFACTORY = "WrapperFactory";

    // ========== STATE VARIABLES ==========

    // NOTE: these values should ideally be `immutable` instead of public
    IERC20 public token;
    bytes32 public currencyKey;
    bytes32 public synthContractName;

    uint public targetSynthIssued;

    constructor(
        address _owner,
        address _resolver,
        IERC20 _token,
        bytes32 _currencyKey,
        bytes32 _synthContractName
    ) public Owned(_owner) MixinSystemSettings(_resolver) {
        token = _token;
        currencyKey = _currencyKey;
        synthContractName = _synthContractName;
        targetSynthIssued = 0;
    }

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](6);
        newAddresses[0] = CONTRACT_SYNTH_SUSD;
        newAddresses[1] = synthContractName;
        newAddresses[2] = CONTRACT_EXRATES;
        newAddresses[3] = CONTRACT_ISSUER;
        newAddresses[4] = CONTRACT_DEBTCACHE;
        newAddresses[5] = CONTRACT_WRAPPERFACTORY;
        addresses = combineArrays(existingAddresses, newAddresses);
        return addresses;
    }

    /* ========== INTERNAL VIEWS ========== */
    function synthsUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTH_SUSD));
    }

    function synth() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(synthContractName));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function debtCache() internal view returns (IDebtCache) {
        return IDebtCache(requireAndGetAddress(CONTRACT_DEBTCACHE));
    }

    function wrapperFactory() internal view returns (IWrapperFactory) {
        return IWrapperFactory(requireAndGetAddress(CONTRACT_WRAPPERFACTORY));
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    // ========== VIEWS ==========

    function capacity() public view returns (uint _capacity) {
        // capacity = max(maxETH - balance, 0)
        uint balance = getReserves();
        uint maxToken = maxTokenAmount();
        if (balance >= maxToken) {
            return 0;
        }
        return maxToken.sub(balance);
    }

    function totalIssuedSynths() public view returns (uint) {
        // synths issued by this contract is always exactly equal to the balance of reserves
        return exchangeRates().effectiveValue(currencyKey, targetSynthIssued, sUSD);
    }

    function getReserves() public view returns (uint) {
        return token.balanceOf(address(this));
    }

    function calculateMintFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(mintFeeRate());
    }

    function calculateBurnFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(burnFeeRate());
    }

    function maxTokenAmount() public view returns (uint256) {
        return getWrapperMaxTokenAmount(address(this));
    }

    function mintFeeRate() public view returns (uint256) {
        return getWrapperMintFeeRate(address(this));
    }

    function burnFeeRate() public view returns (uint256) {
        return getWrapperBurnFeeRate(address(this));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // Transfers `amountIn` token to mint `amountIn - fees` of currencyKey.
    // `amountIn` is inclusive of fees, calculable via `calculateMintFee`.
    function mint(uint amountIn) external notPaused {
        require(amountIn <= token.allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amountIn <= token.balanceOf(msg.sender), "Balance is too low");
        require(!exchangeRates().rateIsInvalid(currencyKey), "Currency rate is invalid");

        uint currentCapacity = capacity();
        require(currentCapacity > 0, "Contract has no spare capacity to mint");

        uint actualAmountIn = currentCapacity < amountIn ? currentCapacity : amountIn;

        uint feeAmountTarget = calculateMintFee(actualAmountIn);
        uint mintAmount = actualAmountIn.sub(feeAmountTarget);

        // Transfer token from user.
        token.transferFrom(msg.sender, address(this), actualAmountIn);

        // Mint tokens to user
        _mint(mintAmount);

        emit Minted(msg.sender, mintAmount, feeAmountTarget, actualAmountIn);
    }

    // Burns `amountIn` synth for `amountIn - fees` amount of token.
    // `amountIn` is inclusive of fees, calculable via `calculateBurnFee`.
    function burn(uint amountIn) external notPaused {
        require(amountIn <= IERC20(address(synth())).balanceOf(msg.sender), "Balance is too low");
        require(!exchangeRates().rateIsInvalid(currencyKey), "Currency rate is invalid");
        require(totalIssuedSynths() > 0, "Contract cannot burn for token, token balance is zero");

        uint burnAmount =
            targetSynthIssued < amountIn ? targetSynthIssued.add(calculateBurnFee(targetSynthIssued)) : amountIn;
        uint amountOut = burnAmount.divideDecimal(SafeDecimalMath.unit().add(burnFeeRate()));
        uint feeAmountTarget = burnAmount.sub(amountOut);

        // Transfer token to user.
        token.transfer(msg.sender, amountOut);

        // Burn
        _burn(burnAmount);

        emit Burned(msg.sender, amountOut, feeAmountTarget, burnAmount);
    }

    // ========== RESTRICTED ==========

    /**
     * @notice Fallback function
     */
    function() external payable {
        revert("Fallback disabled, use mint()");
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _mint(uint amount) internal {
        uint excessAmount = getReserves().sub(targetSynthIssued.add(amount));
        uint excessAmountUsd = exchangeRates().effectiveValue(currencyKey, excessAmount, sUSD);

        // Mint `amount` to user.
        synth().issue(msg.sender, amount);

        // Escrow fee.
        synthsUSD().issue(address(wrapperFactory()), excessAmountUsd);

        _setTargetSynthIssued(targetSynthIssued.add(amount).add(excessAmount));
    }

    function _burn(uint amount) internal {
        // this is logically equivalent to getReserves() - (targetSynthIssued - amount), without going negative
        uint excessAmount = getReserves().add(amount).sub(targetSynthIssued);

        uint excessAmountUsd = exchangeRates().effectiveValue(currencyKey, excessAmount, sUSD);

        // Burn `amount` of currencyKey from user.
        synth().burn(msg.sender, amount);

        // We use burn/issue instead of burning the principal and transferring the fee.
        // This saves an approval and is cheaper.
        // Escrow fee.
        synthsUSD().issue(address(wrapperFactory()), excessAmountUsd);

        _setTargetSynthIssued(targetSynthIssued.add(excessAmount).sub(amount));
    }

    function _setTargetSynthIssued(uint _targetSynthIssued) internal {
        debtCache().recordExcludedDebtChange(currencyKey, int256(_targetSynthIssued) - int256(targetSynthIssued));

        targetSynthIssued = _targetSynthIssued;
    }

    /* ========== EVENTS ========== */
    event Minted(address indexed account, uint principal, uint fee, uint amountIn);
    event Burned(address indexed account, uint principal, uint fee, uint amountIn);
}
