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
import "./interfaces/IFeePool.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

// https://docs.synthetix.io/contracts/source/contracts/wrapper
contract Wrapper is Owned, Pausable, MixinResolver, MixinSystemSettings, IWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ============== */

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant ETH = "ETH";
    bytes32 internal constant SNX = "SNX";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    string private constant CONTRACT_PREFIX_SYNTH = "Synth";

    bytes32 private constant CONTRACT_SYNTH_SUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    // ========== STATE VARIABLES ==========

    // NOTE: these values should ideally be `immutable` instead of public
    IERC20 public token;
    bytes32 public currencyKey;
    bytes32 public synthContractName;

    uint public tokenIssued = 0;
    uint public sUSDIssued = 0;
    uint public feesEscrowed = 0;

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
    }

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_SYNTH_SUSD;
        newAddresses[1] = synthContractName;
        newAddresses[2] = CONTRACT_EXRATES;
        newAddresses[3] = CONTRACT_ISSUER;
        newAddresses[4] = CONTRACT_FEEPOOL;
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

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    // ========== VIEWS ==========

    function capacity() public view returns (uint _capacity) {
        // capacity = max(maxETH - balance, 0)
        uint balance = getReserves();
        if (balance >= maxTokenAmount()) {
            return 0;
        }
        return maxTokenAmount().sub(balance);
    }

    function getReserves() public view returns (uint) {
        return token.balanceOf(address(this));
    }

    function totalIssuedSynths() public view returns (uint) {
        // This contract issues two different synths:
        // 1. currencyKey
        // 2. sUSD
        //
        // The currencyKey is always backed 1:1 with token.
        // The sUSD fees are backed by token amount that is withheld during minting and burning.
        return exchangeRates().effectiveValue(currencyKey, tokenIssued, sUSD).add(sUSDIssued);
    }

    function calculateMintFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(mintFeeRate());
    }

    function calculateBurnFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(burnFeeRate());
    }

    function maxTokenAmount() public view returns (uint256) {
        return getWrapperMaxTokenAmount(currencyKey);
    }

    function mintFeeRate() public view returns (uint256) {
        return getWrapperMintFeeRate(currencyKey);
    }

    function burnFeeRate() public view returns (uint256) {
        return getWrapperBurnFeeRate(currencyKey);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // Transfers `amountIn` token to mint `amountIn - fees` of currencyKey.
    // `amountIn` is inclusive of fees, calculable via `calculateMintFee`.
    function mint(uint amountIn) external notPaused {
        require(amountIn <= token.allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amountIn <= token.balanceOf(msg.sender), "Balance is too low");

        uint currentCapacity = capacity();
        require(currentCapacity > 0, "Contract has no spare capacity to mint");

        if (amountIn < currentCapacity) {
            _mint(amountIn);
        } else {
            _mint(currentCapacity);
        }
    }

    // Burns `amountIn` synth for `amountIn - fees` amount of token.
    // `amountIn` is inclusive of fees, calculable via `calculateBurnFee`.
    function burn(uint amountIn) external notPaused {
        uint reserves = getReserves();
        require(reserves > 0, "Contract cannot burn for token, token balance is zero");

        // principal = [amountIn / (1 + burnFeeRate)]
        uint principal = amountIn.divideDecimalRound(SafeDecimalMath.unit().add(burnFeeRate()));

        if (principal < reserves) {
            _burn(principal, amountIn);
        } else {
            _burn(reserves, reserves.add(calculateBurnFee(reserves)));
        }
    }

    function distributeFees() external {
        // Normalize fee to sUSD
        require(!exchangeRates().rateIsInvalid(currencyKey), "Currency rate is invalid");
        uint amountSUSD = exchangeRates().effectiveValue(currencyKey, feesEscrowed, sUSD);

        // Burn currencyKey.
        synth().burn(address(this), feesEscrowed);
        // Pay down as much currencyKey debt as we burn. Any other debt is taken on by the stakers.
        tokenIssued = tokenIssued < feesEscrowed ? 0 : tokenIssued.sub(feesEscrowed);

        // Issue sUSD to the fee pool
        issuer().synths(sUSD).issue(feePool().FEE_ADDRESS(), amountSUSD);
        sUSDIssued = sUSDIssued.add(amountSUSD);

        // Tell the fee pool about this
        feePool().recordFeePaid(amountSUSD);

        feesEscrowed = 0;
    }

    // ========== RESTRICTED ==========

    /**
     * @notice Fallback function
     */
    function() external payable {
        revert("Fallback disabled, use mint()");
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _mint(uint amountIn) internal {
        // Calculate minting fee.
        uint feeAmountEth = calculateMintFee(amountIn);
        uint principal = amountIn.sub(feeAmountEth);

        // Transfer token from user.
        token.transferFrom(msg.sender, address(this), amountIn);

        // Mint `amountIn - fees` to user.
        synth().issue(msg.sender, principal);

        // Escrow fee.
        synth().issue(address(this), feeAmountEth);
        feesEscrowed = feesEscrowed.add(feeAmountEth);

        // Add debt for currencyKey.
        tokenIssued = tokenIssued.add(amountIn);

        emit Minted(msg.sender, principal, feeAmountEth, amountIn);
    }

    function _burn(uint principal, uint amountIn) internal {
        // for burn, amount is inclusive of the fee.
        uint feeAmountEth = amountIn.sub(principal);

        require(amountIn <= IERC20(address(synth())).allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amountIn <= IERC20(address(synth())).balanceOf(msg.sender), "Balance is too low");

        // Burn `amountIn` of currencyKey from user.
        synth().burn(msg.sender, amountIn);
        // debt is repaid by burning.
        tokenIssued = tokenIssued < principal ? 0 : tokenIssued.sub(principal);

        // We use burn/issue instead of burning the principal and transferring the fee.
        // This saves an approval and is cheaper.
        // Escrow fee.
        synth().issue(address(this), feeAmountEth);
        // We don't update tokenIssued, as only the principal was subtracted earlier.
        feesEscrowed = feesEscrowed.add(feeAmountEth);

        // Transfer `amount - fees` token to user.
        token.transfer(msg.sender, principal);

        emit Burned(msg.sender, principal, feeAmountEth, amountIn);
    }

    /* ========== EVENTS ========== */
    event Minted(address indexed account, uint principal, uint fee, uint amountIn);
    event Burned(address indexed account, uint principal, uint fee, uint amountIn);
}
