/*
-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

The SNX supply schedule contract determines the amount of SNX tokens
mintable over the course of 195 weeks.

Exponential Decay Inflation Schedule

Synthetix.mint() function is used to mint the inflationary supply.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./SafeDecimalMath.sol";
import "./Owned.sol";
import "./interfaces/ISynthetix.sol";

/**
 * @title SupplySchedule contract
 */
contract SupplySchedule is Owned {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // How long each mint period is
    uint public mintPeriodDuration = 1 weeks;

    // time supply last minted
    uint public lastMintEvent;

    // counter for number of weeks since inflation supply
    uint public weekCounter;

    uint public minterReward = 50 * SafeDecimalMath.unit();

    uint public initialWeeklySupply;

    // Percentage growth of terminal supply per annum
    uint public terminalSupplyRate = 25000000000000000; // 2.5% pa

    // Address of the SynthetixProxy
    address public synthetixProxy;

    uint public constant INFLATION_START_DATE = 1551830400; // 2019-03-06T00:00:00+00:00
    uint8 public constant SUPPLY_DECAY_START = 40; // Week 40 (Wednesday, 11 December 2019 00:00:00)
    uint8 public constant SUPPLY_DECAY_END = 234; //  Supply Decay stops after Week 234 (195 weeks of inflation decay)
    
    uint public constant DECAY_RATE = 12500000000000000; // 1.25% weekly
    
    constructor(
        address _owner,
        uint _lastMintEvent,
        uint _currentWeek)
        Owned(_owner)
        public
    {
        initialWeeklySupply = 75e6 * SafeDecimalMath.unit().divideDecimal(52); // initial weekly supply is 75m / 52  in Year 1

        lastMintEvent = _lastMintEvent;
        weekCounter = _currentWeek;
    }

    // ========== VIEWS ==========
    function mintableSupply()
        public
        view
        returns (uint)
    {
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
            
            // If current week is before supply decay we add initial supply to mintableSupply
            if (currentWeek < SUPPLY_DECAY_START) {
                totalAmount = totalAmount.add(initialWeeklySupply);
                remainingWeeksToMint--;
            }
            // if current week before supply decay ends we add the new supply for the week 
            else if (currentWeek < SUPPLY_DECAY_END) {
                
                // number of decays is diff between current week and (Supply decay start week - 1)  
                uint decayCount = currentWeek.sub(SUPPLY_DECAY_START -1);
                
                totalAmount = totalAmount.add(tokenDecaySupplyForWeek(decayCount));
                remainingWeeksToMint--;
            } 
            // Terminal supply is calculated on the total supply of Synthetix including any new supply
            // We can compound the remaining week's supply at the fixed terminal rate  
            else {
                uint totalSupply = ISynthetix(synthetixProxy).totalSupply();
                uint currentTotalSupply = totalSupply.add(totalAmount);

                totalAmount = totalAmount.add(terminalInflationSupply(currentTotalSupply, remainingWeeksToMint));
                remainingWeeksToMint = 0;
            }
        }
        
        return totalAmount;
    }

    /**
    * @return A unit amount of 
    * @param counter Decay counter value to calculate the applicable exponential decay supply of the week
    * @dev New token supply reduces by the decay rate each week calculated as supply = initialWeeklySupply * () 
    */
    function tokenDecaySupplyForWeek(uint counter)
        public 
        view
        returns (uint)
    {   
        // Apply exponential decay function to number of weeks since
        // start of inflation smoothing to calculate diminishing supply for the week.
        uint decay_factor = (SafeDecimalMath.unit().sub(DECAY_RATE)) ** counter;
        
        return initialWeeklySupply.multiplyDecimal(decay_factor);
    }    
    
    /**
    * @return A unit amount of terminal inflation supply
    * @dev Weekly compound rate based on number of weeks     
    */
    function terminalInflationSupply(uint totalSupply, uint numOfweeks)
        public 
        view
        returns (uint)
    {   
        // Inflationary supply is compounded weekly from initial SNX total supply
        // return the extra supply minus original 
        uint effectiveRate = (SafeDecimalMath.unit().add(terminalSupplyRate / 52)) ** numOfweeks;
        
        return totalSupply.multiplyDecimal(SafeDecimalMath.unit().add(effectiveRate))
            .sub(totalSupply);
    }

    // Take timeDiff in seconds (Dividend) and mintPeriodDuration as (Divisor)
    // Calculate the numberOfWeeks since last mint rounded down to 1 week
    function weeksSinceLastIssuance()
        public
        view
        returns (uint)
    {
        // get time since lastMintEvent, if lastMintEvent not set or 0, then start from inflation start date.
        uint timeDiff = lastMintEvent > 0 ? now.sub(lastMintEvent) : now.sub(INFLATION_START_DATE);
        return timeDiff.div(mintPeriodDuration);
    }

    function isMintable()
        public
        view
        returns (bool)
    {
        if (now - lastMintEvent > mintPeriodDuration)
        {
            return true;
        }
        return false;
    }

    // ========== MUTATIVE FUNCTIONS ==========
    function recordMintEvent(uint supplyMinted)
        external
        onlySynthetix
        returns (bool)
    {
        uint numberOfWeeksIssued = weeksSinceLastIssuance();

        // add number of weeks minted to weekCounter
        weekCounter.add(numberOfWeeksIssued);

        // Update mint event to now
        lastMintEvent = now;

        emit SupplyMinted(supplyMinted, numberOfWeeksIssued, now);
        return true;
    }

    function setMinterReward(uint _amount)
        external
        onlyOwner
    {
        minterReward = _amount;
        emit MinterRewardUpdated(_amount);
    }


    // ========== SETTERS ========== */
    /**
     * @notice Set the SynthetixProxy should it ever change.
     * SupplySchedule requires Synthetix address as it has the authority
     * to record mint event 
     * */
    function setSynthetixProxy(ISynthetix _synthetixProxy)
        external
        onlyOwner
    {
        synthetixProxy = _synthetixProxy;
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetix() {
        require(msg.sender == address(Proxy(synthetixProxy).target()), "Only the synthetix contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event SupplyMinted(uint supplyMinted, uint numberOfWeeksIssued, uint timestamp);
    event MinterRewardUpdated(uint newRewardAmount);
}
