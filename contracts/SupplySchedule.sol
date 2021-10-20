pragma solidity ^0.8.8;

// Inheritance
import "./Owned.sol";
import "./interfaces/ISupplySchedule.sol";

// Libraries
import "./SafeDecimalMath.sol";
import "./Math.sol";

// Internal references
import "./Proxy.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";

// https://docs.synthetix.io/contracts/source/contracts/supplyschedule
contract SupplySchedule is Owned, ISupplySchedule {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Math for uint;

    // Time of the last inflation supply mint event
    uint public lastMintEvent;

    // Counter for number of weeks since the start of supply inflation
    uint public weekCounter;

    // The number of SNX rewarded to the caller of Synthetix.mint()
    uint public minterReward = 200 * SafeDecimalMath.unit();

    // The initial weekly inflationary supply is 75m / 52 until the start of the decay rate.
    // 75e6 * SafeDecimalMath.unit() / 52
    uint public constant INITIAL_WEEKLY_SUPPLY = 1442307692307692307692307;

    // Address of the SynthetixProxy for the onlySynthetix modifier
    address payable public synthetixProxy;

    // Max SNX rewards for minter
    uint public constant MAX_MINTER_REWARD = 200 * 1e18;

    // How long each inflation period is before mint can be called
    uint public constant MINT_PERIOD_DURATION = 1 weeks;

    uint public constant INFLATION_START_DATE = 1551830400; // 2019-03-06T00:00:00+00:00
    uint public constant MINT_BUFFER = 1 days;
    uint8 public constant SUPPLY_DECAY_START = 40; // Week 40
    uint8 public constant SUPPLY_DECAY_END = 234; //  Supply Decay ends on Week 234 (inclusive of Week 234 for a total of 195 weeks of inflation decay)

    // Weekly percentage decay of inflationary supply from the first 40 weeks of the 75% inflation rate
    uint public constant DECAY_RATE = 12500000000000000; // 1.25% weekly

    // Percentage growth of terminal supply per annum
    uint public constant TERMINAL_SUPPLY_RATE_ANNUAL = 25000000000000000; // 2.5% pa

    constructor(
        address _owner,
        uint _lastMintEvent,
        uint _currentWeek
    ) Owned(_owner) {
        lastMintEvent = _lastMintEvent;
        weekCounter = _currentWeek;
    }

    // ========== VIEWS ==========

    /**
     * @return The amount of SNX mintable for the inflationary supply
     */
    function mintableSupply() external view returns (uint) {
        uint totalAmount;

        if (!isMintable()) {
            return totalAmount;
        }

        uint remainingWeeksToMint = weeksSinceLastIssuance();

        uint currentWeek = weekCounter;

        // Calculate total mintable supply from exponential decay function
        // The decay function stops after week 234
        while (remainingWeeksToMint > 0) {
            currentWeek++;

            if (currentWeek < SUPPLY_DECAY_START) {
                // If current week is before supply decay we add initial supply to mintableSupply
                totalAmount = totalAmount.add(INITIAL_WEEKLY_SUPPLY);
                remainingWeeksToMint--;
            } else if (currentWeek <= SUPPLY_DECAY_END) {
                // if current week before supply decay ends we add the new supply for the week
                // diff between current week and (supply decay start week - 1)
                uint decayCount = currentWeek.sub(SUPPLY_DECAY_START - 1);

                totalAmount = totalAmount.add(tokenDecaySupplyForWeek(decayCount));
                remainingWeeksToMint--;
            } else {
                // Terminal supply is calculated on the total supply of Synthetix including any new supply
                // We can compound the remaining week's supply at the fixed terminal rate
                uint totalSupply = IERC20(synthetixProxy).totalSupply();
                uint currentTotalSupply = totalSupply.add(totalAmount);

                totalAmount = totalAmount.add(terminalInflationSupply(currentTotalSupply, remainingWeeksToMint));
                remainingWeeksToMint = 0;
            }
        }

        return totalAmount;
    }

    /**
     * @return A unit amount of decaying inflationary supply from the INITIAL_WEEKLY_SUPPLY
     * @dev New token supply reduces by the decay rate each week calculated as supply = INITIAL_WEEKLY_SUPPLY * ()
     */
    function tokenDecaySupplyForWeek(uint counter) public pure returns (uint) {
        // Apply exponential decay function to number of weeks since
        // start of inflation smoothing to calculate diminishing supply for the week.
        uint effectiveDecay = (SafeDecimalMath.unit().sub(DECAY_RATE)).powDecimal(counter);
        uint supplyForWeek = INITIAL_WEEKLY_SUPPLY.multiplyDecimal(effectiveDecay);

        return supplyForWeek;
    }

    /**
     * @return A unit amount of terminal inflation supply
     * @dev Weekly compound rate based on number of weeks
     */
    function terminalInflationSupply(uint totalSupply, uint numOfWeeks) public pure returns (uint) {
        // rate = (1 + weekly rate) ^ num of weeks
        uint effectiveCompoundRate = SafeDecimalMath.unit().add(TERMINAL_SUPPLY_RATE_ANNUAL.div(52)).powDecimal(numOfWeeks);

        // return Supply * (effectiveRate - 1) for extra supply to issue based on number of weeks
        return totalSupply.multiplyDecimal(effectiveCompoundRate.sub(SafeDecimalMath.unit()));
    }

    /**
     * @dev Take timeDiff in seconds (Dividend) and MINT_PERIOD_DURATION as (Divisor)
     * @return Calculate the numberOfWeeks since last mint rounded down to 1 week
     */
    function weeksSinceLastIssuance() public view returns (uint) {
        // Get weeks since lastMintEvent
        // If lastMintEvent not set or 0, then start from inflation start date.
        uint timeDiff = lastMintEvent > 0 ? block.timestamp.sub(lastMintEvent) : block.timestamp.sub(INFLATION_START_DATE);
        return timeDiff.div(MINT_PERIOD_DURATION);
    }

    /**
     * @return boolean whether the MINT_PERIOD_DURATION (7 days)
     * has passed since the lastMintEvent.
     * */
    function isMintable() public view returns (bool) {
        if (block.timestamp - lastMintEvent > MINT_PERIOD_DURATION) {
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
        lastMintEvent = INFLATION_START_DATE.add(weekCounter.mul(MINT_PERIOD_DURATION)).add(MINT_BUFFER);

        emit SupplyMinted(supplyMinted, numberOfWeeksIssued, lastMintEvent, block.timestamp);
        return true;
    }

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

    // ========== SETTERS ========== */

    /**
     * @notice Set the SynthetixProxy should it ever change.
     * SupplySchedule requires Synthetix address as it has the authority
     * to record mint event.
     * */
    function setSynthetixProxy(ISynthetix _synthetixProxy) external onlyOwner {
        require(address(_synthetixProxy) != address(0), "Address cannot be 0");
        synthetixProxy = address(uint160(address(_synthetixProxy)));
        emit SynthetixProxyUpdated(synthetixProxy);
    }

    // ========== MODIFIERS ==========

    /**
     * @notice Only the Synthetix contract is authorised to call this function
     * */
    modifier onlySynthetix() {
        require(
            msg.sender == address(Proxy(address(synthetixProxy)).target()),
            "Only the synthetix contract can perform this action"
        );
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

    /**
     * @notice Emitted when setSynthetixProxy is called changing the Synthetix Proxy address
     * */
    event SynthetixProxyUpdated(address newAddress);
}
