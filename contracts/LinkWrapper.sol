pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/ILinkWrapper.sol";
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

// https://docs.synthetix.io/contracts/source/contracts/linkWrapper
contract LinkWrapper is Owned, Pausable, MixinResolver, MixinSystemSettings, ILinkWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ============== */

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant sLINK = "sLINK";
    bytes32 internal constant SNX = "SNX";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTHSLINK = "SynthsLINK";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    // ========== STATE VARIABLES ==========
    IERC20 internal _link;

    uint public sLINKIssued = 0;
    uint public sUSDIssued = 0;
    uint public feesEscrowed = 0;

    constructor(
        address _owner,
        address _resolver,
        address payable _LINK
    ) public Owned(_owner) Pausable() MixinSystemSettings(_resolver) {
        _link = IERC20(_LINK);
    }

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_SYNTHSLINK;
        newAddresses[1] = CONTRACT_SYNTHSUSD;
        newAddresses[2] = CONTRACT_EXRATES;
        newAddresses[3] = CONTRACT_ISSUER;
        newAddresses[4] = CONTRACT_FEEPOOL;
        addresses = combineArrays(existingAddresses, newAddresses);
        return addresses;
    }

    /* ========== INTERNAL VIEWS ========== */
    function synthsUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function synthsLINK() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSLINK));
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
        // capacity = max(maxLink - balance, 0)
        uint balance = getReserves();
        if (balance >= maxLink()) {
            return 0;
        }
        return maxLink().sub(balance);
    }

    function getReserves() public view returns (uint) {
        return _link.balanceOf(address(this));
    }

    function totalIssuedSynths() public view returns (uint) {
        // This contract issues two different synths:
        // 1. sLINK
        // 2. sUSD
        //
        // The sLINK is always backed 1:1 with LINK.
        // The sUSD fees are backed by sLINK that is withheld during minting and burning.
        return exchangeRates().effectiveValue(sLINK, sLINKIssued, sUSD).add(sUSDIssued);
    }

    function calculateMintFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(mintFeeRate());
    }

    function calculateBurnFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(burnFeeRate());
    }

    function maxLink() public view returns (uint256) {
        return getLinkWrapperMaxLink();
    }

    function mintFeeRate() public view returns (uint256) {
        return getLinkWrapperMintFeeRate();
    }

    function burnFeeRate() public view returns (uint256) {
        return getLinkWrapperBurnFeeRate();
    }

    function link() public view returns (IERC20) {
        return _link;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // Transfers `amountIn` WETH to mint `amountIn - fees` sLINK.
    // `amountIn` is inclusive of fees, calculable via `calculateMintFee`.
    function mint(uint amountIn) external notPaused {
        require(amountIn <= _link.allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amountIn <= _link.balanceOf(msg.sender), "Balance is too low");

        uint currentCapacity = capacity();
        require(currentCapacity > 0, "Contract has no spare capacity to mint");

        if (amountIn < currentCapacity) {
            _mint(amountIn);
        } else {
            _mint(currentCapacity);
        }
    }

    // Burns `amountIn` sLINK for `amountIn - fees` WETH.
    // `amountIn` is inclusive of fees, calculable via `calculateBurnFee`.
    function burn(uint amountIn) external notPaused {
        uint reserves = getReserves();
        require(reserves > 0, "Contract cannot burn sLINK for WETH, WETH balance is zero");

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
        require(!exchangeRates().rateIsInvalid(sLINK), "Currency rate is invalid");
        uint amountSUSD = exchangeRates().effectiveValue(sLINK, feesEscrowed, sUSD);

        // Burn sLINK.
        synthsLINK().burn(address(this), feesEscrowed);
        // Pay down as much sLINK debt as we burn. Any other debt is taken on by the stakers.
        sLINKIssued = sLINKIssued < feesEscrowed ? 0 : sLINKIssued.sub(feesEscrowed);

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
        uint feeAmountLink = calculateMintFee(amountIn);
        uint principal = amountIn.sub(feeAmountLink);

        // Transfer WETH from user.
        _link.transferFrom(msg.sender, address(this), amountIn);

        // Mint `amountIn - fees` sLINK to user.
        synthsLINK().issue(msg.sender, principal);

        // Escrow fee.
        synthsLINK().issue(address(this), feeAmountLink);
        feesEscrowed = feesEscrowed.add(feeAmountLink);

        // Add sLINK debt.
        sLINKIssued = sLINKIssued.add(amountIn);

        emit Minted(msg.sender, principal, feeAmountLink, amountIn);
    }

    function _burn(uint principal, uint amountIn) internal {
        // for burn, amount is inclusive of the fee.
        uint feeAmountLink = amountIn.sub(principal);

        require(amountIn <= IERC20(address(synthsLINK())).allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amountIn <= IERC20(address(synthsLINK())).balanceOf(msg.sender), "Balance is too low");

        // Burn `amountIn` sLINK from user.
        synthsLINK().burn(msg.sender, amountIn);
        // sLINK debt is repaid by burning.
        sLINKIssued = sLINKIssued < principal ? 0 : sLINKIssued.sub(principal);

        // We use burn/issue instead of burning the principal and transferring the fee.
        // This saves an approval and is cheaper.
        // Escrow fee.
        synthsLINK().issue(address(this), feeAmountLink);
        // We don't update sLINKIssued, as only the principal was subtracted earlier.
        feesEscrowed = feesEscrowed.add(feeAmountLink);

        // Transfer `amount - fees` WETH to user.
        _link.transfer(msg.sender, principal);

        emit Burned(msg.sender, principal, feeAmountLink, amountIn);
    }

    /* ========== EVENTS ========== */
    event Minted(address indexed account, uint principal, uint fee, uint amountIn);
    event Burned(address indexed account, uint principal, uint fee, uint amountIn);
}
