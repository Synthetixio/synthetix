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


// https://docs.synthetix.io/contracts/source/contracts/fixedsupplyschedule
contract FixedSupplySchedule is Owned, MixinResolver, ISupplySchedule {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Math for uint;

    /* ========== CONSTANTS ========== */

    // Max SNX rewards for minter
    uint public constant MAX_MINTER_REWARD = 200 ether; //1 ether == 1e18

    // Default mintPeriodDuration
    uint public constant DEFAULT_MINT_PERIOD_DURATION = 1 weeks;
    // Default mintBuffer
    uint public constant DEFAULT_MINT_BUFFER = 1 days;

    /* ========== STORAGE VARIABLES ========== */

    // Point in time that the inflation starts from
    uint public inflationStartDate;
    // Time of the last inflation supply mint event
    uint public lastMintEvent;
    // Counter for number of minting periods since the start of supply inflation
    uint public mintPeriodCounter;
    // The duration of the period till the next minting occurs aka inflation/minting event frequency
    uint public mintPeriodDuration = DEFAULT_MINT_PERIOD_DURATION;
    // The buffer needs to be added so inflation is minted after feePeriod closes
    uint public mintBuffer = DEFAULT_MINT_BUFFER;
    // The periodic inflationary supply. Set in the constructor and fixed throughout the duration
    uint public fixedPeriodicSupply;
    // The period that the suply schedule ends
    uint public supplyEnd;
    // The number of SNX rewarded to the caller of Synthetix.mint()
    uint public minterReward;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";

    constructor(
        address _owner,
        address _resolver,
        uint _inflationStartDate,
        uint _lastMintEvent,
        uint _mintPeriodCounter,
        uint _mintPeriodDuration,
        uint _mintBuffer,
        uint _fixedPeriodicSupply,
        uint _supplyEnd,
        uint _minterReward
    ) public Owned(_owner) MixinResolver(_resolver) {
        // inflationStartDate: 0 defaults to current timestamp
        if (_inflationStartDate != 0) {
            inflationStartDate = _inflationStartDate;
        } else {
            inflationStartDate = block.timestamp;
        }
        // lastMintEvent: should be strictly greater than the infaltion start time (if not zero)
        // mintPeriodCounter: should not be zero iff lastMintEvent is not zero
        if (_lastMintEvent != 0) {
            require(_lastMintEvent > inflationStartDate, "Mint event can't happen before inflation starts");
            require(_mintPeriodCounter > 0, "At least a mint event has already occurred");
        }
        require(_mintBuffer <= _mintPeriodDuration, "Buffer can't be greater than period");
        require(_minterReward <= MAX_MINTER_REWARD, "Reward can't exceed max minter reward");

        lastMintEvent = _lastMintEvent;
        mintPeriodCounter = _mintPeriodCounter;
        fixedPeriodicSupply = _fixedPeriodicSupply;
        // mintBuffer: defaults to DEFAULT_MINT_BUFFER if zero
        if (_mintBuffer != 0) {
            mintBuffer = _mintBuffer;
        }
        // mintPeriodDuration: defaults to DEFAULT_MINT_PERIOD_DURATION if zero
        if (_mintPeriodDuration != 0) {
            mintPeriodDuration = _mintPeriodDuration;
        }
        supplyEnd = _supplyEnd;
        minterReward = _minterReward;
    }

    // ========== VIEWS ==========

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_SYNTHETIX;
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    /**
     * @return The amount of SNX mintable for the inflationary supply
     */
    function mintableSupply() external view returns (uint) {
        uint totalAmount;

        if (!isMintable() || fixedPeriodicSupply == 0) {
            return 0;
        }

        uint remainingPeriodsToMint = periodsSinceLastIssuance();

        uint currentPeriod = mintPeriodCounter;

        // Calculate total mintable supply
        // The function stops after supplyEnd
        while (remainingPeriodsToMint > 0) {
            currentPeriod = currentPeriod.add(1);

            if (currentPeriod < supplyEnd) {
                // If current period is before supply end we add the fixed supply to mintableSupply
                totalAmount = totalAmount.add(fixedPeriodicSupply);
            } else {
                // break the loop if the infation has reached its end
                break;
            }

            remainingPeriodsToMint--;
        }

        return totalAmount;
    }

    /**
     * @dev Take timeDiff in seconds (Dividend) and mintPeriodDuration as (Divisor)
     * @return Calculate the number of minting periods since last mint rounded down
     */
    function periodsSinceLastIssuance() public view returns (uint) {
        // Get minting periods since lastMintEvent
        // If lastMintEvent not set or 0, then start from inflation start date.
        uint timeDiff = lastMintEvent > 0 ? block.timestamp.sub(lastMintEvent) : block.timestamp.sub(inflationStartDate);
        return timeDiff.div(mintPeriodDuration);
    }

    /**
     * @return boolean whether the mintPeriodDuration (default is 7 days)
     * has passed since the lastMintEvent.
     * */
    function isMintable() public view returns (bool) {
        if (block.timestamp - lastMintEvent > mintPeriodDuration) {
            return true;
        }
        return false;
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /**
     * @notice Record the mint event from Synthetix by incrementing the inflation
     * period counter for the number of periods minted (probabaly always 1)
     * and store the time of the event.
     * @param supplyMinted the amount of SNX the total supply was inflated by.
     * */
    function recordMintEvent(uint supplyMinted) external onlySynthetix returns (bool) {
        uint numberOfPeriodsIssued = periodsSinceLastIssuance();

        // add number of periods minted to mintPeriodCounter
        mintPeriodCounter = mintPeriodCounter.add(numberOfPeriodsIssued);

        // Update mint event to latest period issued (start date + number of periods issued * seconds in a period)
        // A time buffer is added so inflation is minted after feePeriod closes
        lastMintEvent = inflationStartDate.add(mintPeriodCounter.mul(mintPeriodDuration)).add(mintBuffer);

        emit SupplyMinted(supplyMinted, numberOfPeriodsIssued, lastMintEvent, block.timestamp);
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
        require(amount <= MAX_MINTER_REWARD, "Reward can't exceed max minter reward");
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
    event SupplyMinted(uint supplyMinted, uint numberOfPeriodsIssued, uint lastMintEvent, uint timestamp);

    /**
     * @notice Emitted when the SNX minter reward amount is updated
     * */
    event MinterRewardUpdated(uint newRewardAmount);
}
