pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ISupplySchedule.sol";

// Libraries
import "./SafeDecimalMath.sol";
import "./Math.sol";

// Internal references
import "./Proxy.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";


contract FixedSupplySchedule is Owned, MixinResolver, ISupplySchedule {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Math for uint;

    /* ========== CONSTANTS ========== */

    // Max SNX rewards for minter
    uint public constant MAX_MINTER_REWARD = 200 ether; //1 ether == 1e18

    // How long each inflation period is before mint can be called
    uint public constant DEFAULT_MINT_PERIOD_DURATION = 1 weeks;

    uint public constant DEFAULT_MINT_BUFFER = 1 days;

    /* ========== STORAGE VARIABLES ========== */

    // Point in time that the inflation starts from 
    uint public inflationStartDate;
    // Time of the last inflation supply mint event
    uint public lastMintEvent;
    // Counter for number of weeks since the start of supply inflation
    uint public weekCounter;
    // The number of SNX rewarded to the caller of Synthetix.mint()
    uint public minterReward;
    // The weekly inflationary supply. Set in the constructor and fixed throughout the duration
    uint public fixedWeeklySupply;
    // The week that the suply schedule ends
    uint public supplyEnd;

    uint public mintBuffer = DEFAULT_MINT_BUFFER;

    uint public mintPeriodDuration = DEFAULT_MINT_PERIOD_DURATION;

     /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    bytes32[24] private addressesToCache = [CONTRACT_SYNTHETIX];


    constructor(
        address _owner,
        address _resolver,
        uint _inflationStartDate,
        uint _lastMintEvent,
        uint _weekCounter,
        uint _mintPeriodDuration,
        uint _mintBuffer,
        uint _fixedWeeklySupply,
        uint _supplyEnd,
        uint _minterReward
    ) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {
        if (_inflationStartDate != 0){
            inflationStartDate =_inflationStartDate;
        } else {
            inflationStartDate = now;
        }
        if (_lastMintEvent != 0){
            require(_lastMintEvent > inflationStartDate, "Mint even can't happen before inflation starts");
            require(_weekCounter > 0, "Mint event has already taken place");
        }
        require(_minterReward <= MAX_MINTER_REWARD, "Reward cannot exceed max minter reward");
        lastMintEvent = _lastMintEvent;
        weekCounter = _weekCounter;
        fixedWeeklySupply = _fixedWeeklySupply;
        if (_mintBuffer != 0){
            mintBuffer =_mintBuffer;
        }
        if (_mintPeriodDuration != 0){
            mintPeriodDuration =_mintPeriodDuration;
        } 
        supplyEnd = _supplyEnd;
        minterReward = _minterReward;
    }

    // ========== VIEWS ==========

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    /**
     * @return The amount of SNX mintable for the inflationary supply
     */
    function mintableSupply() external view returns (uint) {
        uint totalAmount;

        if (!isMintable() || fixedWeeklySupply == 0) {
            return 0;
        }

        uint remainingWeeksToMint = weeksSinceLastIssuance();

        uint currentWeek = weekCounter;

        // Calculate total mintable supply
        // The function stops after supplyEnd
        while (remainingWeeksToMint > 0) {

            currentWeek = currentWeek.add(1);
            
            if (currentWeek < supplyEnd) {
                // If current week is before supply end we add the fixed supply to mintableSupply
                totalAmount = totalAmount.add(fixedWeeklySupply);
            } else {
                break;
            }
            
            remainingWeeksToMint--;
            
        }

        return totalAmount;
    }

    /**
     * @dev Take timeDiff in seconds (Dividend) and mintPeriodDuration as (Divisor)
     * @return Calculate the numberOfWeeks since last mint rounded down to 1 week
     */
    function weeksSinceLastIssuance() public view returns (uint) {
        // Get weeks since lastMintEvent
        // If lastMintEvent not set or 0, then start from inflation start date.
        uint timeDiff = lastMintEvent > 0 ? now.sub(lastMintEvent) : now.sub(inflationStartDate);
        return timeDiff.div(mintPeriodDuration);
    }

    /**
     * @return boolean whether the mintPeriodDuration (default is 7 days)
     * has passed since the lastMintEvent.
     * */
    function isMintable() public view returns (bool) {
        if (now - lastMintEvent > mintPeriodDuration) {
            return true;
        }
        return false;
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /**
     * @notice Record the mint event from Synthetix by incrementing the inflation
     * week counter for the number of weeks minted (probabaly always 1)
     * and store the time of the event.
     * @param supplyMinted the amount of SNX the total supply was inflated by.
     * */
    function recordMintEvent(uint supplyMinted) external onlySynthetix returns (bool) {
        uint numberOfWeeksIssued = weeksSinceLastIssuance();

        // add number of weeks minted to weekCounter
        weekCounter = weekCounter.add(numberOfWeeksIssued);

        // Update mint event to latest week issued (start date + number of weeks issued * seconds in week)
        // 1 day time buffer is added so inflation is minted after feePeriod closes
        lastMintEvent = inflationStartDate.add(weekCounter.mul(mintPeriodDuration)).add(mintBuffer);

        emit SupplyMinted(supplyMinted, numberOfWeeksIssued, lastMintEvent, now);
        return true;
    }

    // ========== SETTERS ========== */

     /**
     * @notice Sets the reward amount of SNX for the caller of the public
     * function Synthetix.mint().
     * This incentivises anyone to mint the inflationary supply and the mintr
     * Reward will be deducted from the inflationary supply and sent to the caller.
     * @param amount the amount of SNX to reward the minter.
     * */
    function setMinterReward(uint amount) external onlyOwner {
        require(amount <= MAX_MINTER_REWARD, "Reward cannot exceed max minter reward");
        minterReward = amount;
        emit MinterRewardUpdated(minterReward);
    }

    // ========== MODIFIERS ==========

    /**
     * @notice Only the Synthetix contract is authorised to call this function
     * */
    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "SupplySchedule: Only the synthetix contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */
    /**
     * @notice Emitted when the inflationary supply is minted
     * */
    event SupplyMinted(uint supplyMinted, uint numberOfWeeksIssued, uint lastMintEvent, uint timestamp);

    /**
     * @notice Emitted when the SNX minter reward amount is updated
     * */
    event MinterRewardUpdated(uint newRewardAmount);

}
