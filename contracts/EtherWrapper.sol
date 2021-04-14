pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IEtherWrapper.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IFeePool.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

// https://docs.synthetix.io/contracts/source/contracts/etherwrapper
contract EtherWrapper is Owned, MixinResolver, MixinSystemSettings, IEtherWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ============== */

    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant sETH = "sETH";
    bytes32 internal constant ETH = "ETH";
    bytes32 internal constant SNX = "SNX";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_SYNTHSETH = "SynthsETH";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    // ========== STATE VARIABLES ==========
    IWETH internal _weth;
    uint public feeBasketBalance;

    constructor(
        address _owner,
        address _resolver,
        address payable _WETH
    ) public Owned(_owner) MixinSystemSettings(_resolver) {
        _weth = IWETH(_WETH);
    }

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_SYNTHSETH;
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

    function synthsETH() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSETH));
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
        if (balance >= maxETH()) {
            return 0;
        }
        return maxETH().sub(balance);
    }

    function getReserves() public view returns (uint) {
        return _weth.balanceOf(address(this));
    }

    function totalIssuedSynths() public view returns (uint) {
        // As the contract's issued sETH is always backed 1:1 with ETH,
        // we can just return the WETH balance.
        return getReserves();
    }

    function calculateMintFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(mintFeeRate());
    }

    function calculateBurnFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(burnFeeRate());
    }

    function maxETH() public view returns (uint256) {
        return getEtherWrapperMaxETH();
    }

    function mintFeeRate() public view returns (uint256) {
        return getEtherWrapperMintFeeRate();
    }

    function burnFeeRate() public view returns (uint256) {
        return getEtherWrapperBurnFeeRate();
    }

    function weth() public view returns (IWETH) {
        return _weth;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // Transfers `amount` WETH to mint `amount - fees` sETH.
    // `amount` is inclusive of fees, calculable via `calculateMintFee`.
    function mint(uint amount) external {
        require(amount <= _weth.allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amount <= _weth.balanceOf(msg.sender), "Balance is too low");

        uint currentCapacity = capacity();
        require(currentCapacity > 0, "Contract has no spare capacity to mint");

        if (amount >= currentCapacity) {
            _mint(currentCapacity);
            // Refund is not needed, as we transfer the exact amount of WETH.
        } else {
            _mint(amount);
        }
    }

    // Burn `amount` sETH for `amount - fees` WETH.
    // `amount` is inclusive of fees, calculable via `calculateBurnFee`.
    function burn(uint amount) external {
        uint reserves = getReserves();
        require(reserves > 0, "Contract cannot burn sETH for WETH, WETH balance is zero");

        if (amount >= reserves) {
            _burn(reserves);
            // Refund is not needed, as we transfer the exact amount of reserves.
        } else {
            _burn(amount);
        }
    }

    // Withdraws WETH from the fee basket, after burning
    // the equivalent sETH from the user's balance.
    function withdrawFromFeeBasket(uint wethAmount) external {
        require(feeBasketBalance >= 0, "no fees to burn");

        synthsETH().burn(msg.sender, wethAmount);

        feeBasketBalance = feeBasketBalance.sub(wethAmount);

        _weth.transfer(msg.sender, wethAmount);
    }

    // ========== RESTRICTED ==========

    /**
     * @notice Fallback function
     */
    function() external payable {
        revert("Fallback disabled, use mint()");
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _mint(uint depositAmountEth) internal {
        _weth.transferFrom(msg.sender, address(this), depositAmountEth);

        // Calculate minting fee.
        uint feeAmountEth = calculateMintFee(depositAmountEth);

        // Finally, issue sETH.
        synthsETH().issue(address(this), depositAmountEth);

        // Send amount - fees to user.
        IERC20(address(synthsETH())).transfer(msg.sender, depositAmountEth.sub(feeAmountEth));
        // Send fee to debt pool.
        // This is automatically converted into sUSD.
        IERC20(address(synthsETH())).transfer(address(feePool()), feeAmountEth);

        emit Minted(msg.sender, depositAmountEth.sub(feeAmountEth), feeAmountEth);
    }

    function _burn(uint amount) internal {
        require(amount <= IERC20(address(synthsETH())).allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amount <= IERC20(address(synthsETH())).balanceOf(msg.sender), "Balance is too low");

        uint feeAmountEth = calculateBurnFee(amount);

        // Burn the amount - fees.
        synthsETH().burn(msg.sender, amount);
        // Send the rest to the fee pool.
        // This is automatically converted into sUSD.
        IERC20(address(synthsETH())).transferFrom(msg.sender, address(feePool()), feeAmountEth);

        // Finally, transfer ETH to the user.
        _weth.transfer(msg.sender, amount);

        emit Burned(msg.sender, amount.sub(feeAmountEth), feeAmountEth);
    }

    /* ========== EVENTS ========== */
    event Minted(address indexed account, uint amount, uint fee);
    event Burned(address indexed account, uint amount, uint fee);
}
