pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IEtherWrapper.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";

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

// https://docs.synthetix.io/contracts/source/contracts/etherwrapper
contract EtherWrapper is Owned, Pausable, MixinResolver, MixinSystemSettings, IEtherWrapper {
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

    constructor(
        address _owner,
        address _resolver,
        address payable _WETH
    ) public Owned(_owner) Pausable() MixinSystemSettings(_resolver) {
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

    // Returns the total issued sETH by this contract.
    function totalIssuedSynths() public view returns (uint) {
        // We use the reserve balance as a simple proxy for the total supply of
        // synths which is backed by WETH.
        // Note: The sETH which is converted into sUSD fees is still backed by
        // the WETH in the contract's reserves.
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
    function mint(uint amount) external notPaused {
        require(amount <= _weth.allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amount <= _weth.balanceOf(msg.sender), "Balance is too low");

        uint currentCapacity = capacity();
        require(currentCapacity > 0, "Contract has no spare capacity to mint");

        if (amount < currentCapacity) {
            _mint(amount);
        } else {
            _mint(currentCapacity);
        }
    }

    // Burns `amount` WETH for `amount - fees` sETH.
    // `amount` is inclusive of fees, calculable via `calculateBurnFee`.
    function burn(uint amount) external notPaused {
        uint reserves = getReserves();
        require(reserves > 0, "Contract cannot burn sETH for WETH, WETH balance is zero");

        // maxBurn = reserves(1 + burnFeeRate)
        uint maxBurnAmount = reserves.multiplyDecimalRound(SafeDecimalMath.unit().add(burnFeeRate()));

        if (amount < maxBurnAmount) {
            _burn(amount);
        } else {
            _burn(maxBurnAmount);
        }
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
        // Calculate minting fee.
        uint feeAmountEth = calculateMintFee(amount);

        // Transfer WETH from user.
        _weth.transferFrom(msg.sender, address(this), amount);

        // Mint `amount - fees` sETH to user.
        synthsETH().issue(msg.sender, amount.sub(feeAmountEth));

        // Remit fee.
        // Less sETH is issued in the previous step to save gas.
        remitFee(feeAmountEth);

        emit Minted(msg.sender, amount.sub(feeAmountEth), feeAmountEth);
    }

    function _burn(uint amount) internal {
        require(amount <= IERC20(address(synthsETH())).allowance(msg.sender, address(this)), "Allowance not high enough");
        require(amount <= IERC20(address(synthsETH())).balanceOf(msg.sender), "Balance is too low");

        // for burn, amount is inclusive of the fee.
        // principal = [amount / (1 + burnFeeRate)]
        uint principal = amount.divideDecimalRound(SafeDecimalMath.unit().add(burnFeeRate()));
        // fee = principal * burnFeeRate
        uint feeAmountEth = calculateBurnFee(principal);

        // Burn `amount` sETH from user.
        synthsETH().burn(msg.sender, amount);

        // Remit fee.
        // sETH fee is burned in previous step to save gas.
        remitFee(feeAmountEth);

        // Transfer `amount - fees` WETH to user.
        _weth.transfer(msg.sender, principal);

        emit Burned(msg.sender, principal, feeAmountEth);
    }

    function remitFee(uint feeAmountEth) internal {
        // Normalize fee to sUSD
        uint feeSusd = exchangeRates().effectiveValue(ETH, feeAmountEth, sUSD);

        // Issue sUSD to the fee pool
        issuer().synths(sUSD).issue(feePool().FEE_ADDRESS(), feeSusd);

        // Tell the fee pool about this
        feePool().recordFeePaid(feeSusd);
    }

    /* ========== EVENTS ========== */
    event Minted(address indexed account, uint amount, uint fee);
    event Burned(address indexed account, uint amount, uint fee);
}
