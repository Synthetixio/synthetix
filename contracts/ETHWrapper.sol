pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IDepot.sol";
import "./interfaces/IETHWrapper.sol";
import "./interfaces/ISynth.sol";
import "./interfaces/IERC20.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

// MixinSystemSettings
contract ETHWrapper is Owned, MixinResolver, IETHWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ============== */

    // Where fees are pooled in sUSD.
    address internal constant FEE_ADDRESS = 0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF;
    
    /* ========== ENCODED NAMES ========== */

    bytes32 internal constant sUSD = "sUSD";
    bytes32 internal constant sETH = "sETH";
    bytes32 internal constant SNX = "SNX";

    // Flexible storage names
    bytes32 public constant CONTRACT_NAME = "ETHWrapper";
    bytes32 internal constant MAX_ETH = "maxETH";
    bytes32 internal constant MINT_FEE_RATE = "mintFeeRate";
    bytes32 internal constant BURN_FEE_RATE = "burnFeeRate";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_SYNTHSETH = "SynthsETH";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 private constant CONTRACT_DEPOT = "Depot";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";

    // ========== STATE VARIABLES ==========
    
    // The maximum amount of ETH held by contract.
    uint public maxETH = 5000 ether;

    // The "controlled" ETH balance of the contract.
    // Note: we keep track of this in contract state, rather than using address(this).balance,
    // as there are ways to move Ether without creating a message call, which would allow
    // someone to DoS the contract. 
    uint public _balance = 0 ether;

    // The fee for depositing ETH into the contract. Default 50 bps.
    uint public mintFeeRate = (5 * SafeDecimalMath.unit()) / 1000;

    // The fee for burning sETH and releasing ETH from the contract. Default 50 bps.
    uint public burnFeeRate = (5 * SafeDecimalMath.unit()) / 1000;

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory addresses = new bytes32[](5);
        addresses[0] = CONTRACT_SYSTEMSTATUS;
        addresses[1] = CONTRACT_SYNTHSETH;
        addresses[2] = CONTRACT_SYNTHSUSD;
        addresses[3] = CONTRACT_DEPOT;
        addresses[4] = CONTRACT_EXRATES;
        return addresses;
    }

    /* ========== INTERNAL VIEWS ========== */

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function depot() internal view returns (IDepot) {
        return IDepot(requireAndGetAddress(CONTRACT_DEPOT));
    }

    function synthsUSD() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    function synthsETH() internal view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSETH));
    }

    /* ========== PUBLIC FUNCTIONS ========== */


    // ========== VIEWS ==========

    function capacity() public view returns (uint) {
        return _balance >= maxETH ? 0 : maxETH.sub(_balance);
    }

    function getBalance() public view returns (uint) {
        return _balance;
    }

    function calculateMintFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(mintFeeRate);
    }

    function calculateBurnFee(uint amount) public view returns (uint) {
        return amount.multiplyDecimalRound(burnFeeRate);
    }

    // function maxETH() public view returns (uint256) {
    //     // return flexibleStorage().getUIntValue(CONTRACT_NAME, MAX_ETH);
    // }

    // function mintFeeRate() public view returns (uint256) {
    //     // return flexibleStorage().getUIntValue(CONTRACT_NAME, MINT_FEE_RATE);
    // }

    // function burnFeeRate() public view returns (uint256) {
    //     // return flexibleStorage().getUIntValue(CONTRACT_NAME, BURN_FEE_RATE);
    // }
    
    /* ========== MUTATIVE FUNCTIONS ========== */

    function mint() external payable {
        require(capacity() > 0, "Contract has no spare capacity to mint");

        // Accept deposit of min(capacity, msg.value).
        uint depositAmountEth = msg.value >= capacity() ? capacity() : msg.value;
        
        // Calculate minting fee.
        uint feeAmountEth = calculateMintFee(depositAmountEth);

        // Fee Distribution. Purchase sUSD with ETH from Depot
        // 1) Mint sUSD internally.
        require(
            IERC20(address(synthsUSD())).balanceOf(address(depot())) >= depot().synthsReceivedForEther(feeAmountEth),
            "The sUSD Depot does not have enough 0-sUSD to buy for fees"
        );
        depot().exchangeEtherForSynths.value(feeAmountEth)();

        // Transfer the sUSD to distribute to SNX holders.
        IERC20(address(synthsUSD())).transfer(FEE_ADDRESS, IERC20(address(synthsUSD())).balanceOf(address(this)));

        // Finally, issue sETH.
        synthsETH().issue(msg.sender, depositAmountEth.sub(feeAmountEth));

        // Update contract balance, and hence capacity.
        _balance = _balance.add(depositAmountEth.sub(feeAmountEth));
        
        // Refund remainder.
        // If the deposit was less than the sum, there is some to refund.
        if(depositAmountEth < msg.value) {
            msg.sender.transfer(msg.value.sub(depositAmountEth));
        }
    }

    function burn(uint amount) external {}

    // ========== RESTRICTED ==========

    function setMaxETH(uint _maxETH) external onlyOwner {
        // flexibleStorage().setUIntValue(CONTRACT_NAME, MAX_ETH, _maxETH);

        // If we set the _newMaxETH to be lower than the current maxETH,
        // then the perms are (mint=0, burn=1).
        // Else if it is higher,
        // then the perms are (mint=1, burn=1)
        maxETH = _maxETH;
        emit MaxETHUpdated(_maxETH);
    }

    function setMintFeeRate(uint _rate) external onlyOwner {
        // flexibleStorage().setUIntValue(CONTRACT_NAME, MINT_FEE_RATE, _rate);
        mintFeeRate = _rate;
        emit MintFeeRateUpdated(_rate);
    }

    function setBurnFeeRate(uint _rate) external onlyOwner {
        // flexibleStorage().setUIntValue(CONTRACT_NAME, BURN_FEE_RATE, _rate);
        burnFeeRate = _rate;
        emit BurnFeeRateUpdated(_rate);
    }

    /**
     * @notice Fallback function
     */
    function() external payable {
        // mint(msg.value);
        revert("Fallback disabled, use mint()");
    }

    /* ========== EVENTS ========== */
    event MaxETHUpdated(uint rate);
    event MintFeeRateUpdated(uint rate);
    event BurnFeeRateUpdated(uint rate);
}
