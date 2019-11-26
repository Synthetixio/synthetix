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

    // counter for number of weeks since
    uint public decayCounter;

    uint public minterReward = 50 * SafeDecimalMath.unit();

    // Percentage growth of terminal supply per annum
    uint public terminalSupplyRate = 2.5 * SafeDecimalMath.unit().div(100);

    // Address of the SynthetixProxy
    address public synthetixProxy;
    
    uint public constant SUPPLY_DECAY_START = 1576022400; // 2018-12-11T00:00:00+00:00
    uint public constant INITIAL_WEEKLY_SUPPLY = 75e6 * SafeDecimalMath.unit().divideDecimal(52);
    uint public constant DECAY_RATE = 1.25 * SafeDecimalMath.unit().div(100);

    uint8 public constant WEEKS_OF_DECAY = 195; // Terminal supply starts after 195 weeks of inflation decay
    
    constructor(address _owner, uint40 _lastMintEvent)
        Owned(_owner)
        public
    {
        lastMintEvent = _lastMintEvent;
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


    // ========== VIEWS ==========
    function mintableSupply()
        public
        view
        returns (uint)
    {
        if (!isMintable()) {
            return 0;
        }
        
        uint totalAmount;

        // Check has supply decay started
        
          
        // Calculate number of weeks since last mint
        uint remainingWeeksToMint = _numWeeksRoundedDown(now.sub(lastMintEvent));

        // Calculate total mintable supply from exponential decay function
        // Decay function stops after 195 weeks
        while (remainingWeeksToMint > 0) {
            if (decayCounter < WEEKS_OF_DECAY) {
                decayCounter = decayCounter + 1;

                totalAmount = totalAmount.add(tokenSupplyForWeekNumber(decayCounter));

                remainingWeeksToMint--;
            } else {
                // calculate terminal inflation portion of supply
                // apply compounding to remaining weeks to mint
                uint currentTotalSupply = synthetix.totalSupply().add(totalAmount);

                totalAmount = totalAmount.add(terminalInflationSupply(currentTotalSupply, remainingWeeksToMint));
                
                // set remainingWeeksToMint to 0
                remainingWeeksToMint = 0;
            }
        }
        
        return totalAmount;
    }

    /**
    * @return A unit amount of 
    * @dev
    */
    function tokenSupplyForWeekNumber(uint counter)
        public 
        view
        returns (uint)
    {   
        // Apply exponential decay function to number of weeks since
        // start of inflation smoothing to calculate diminishing supply 
        // for the week
        uint decay_factor = (SafeDecimalMath.unit().sub(DECAY_RATE)) ** counter;
        return INITIAL_WEEKLY_SUPPLY.multiplyDecimal(decay_factor);
    }    
    
    /**
    * @return A unit amount of 
    * @dev
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
    function _numWeeksRoundedDown(uint _timeDiff)
        internal
        view
        returns (uint)
    {
        return _timeDiff.div(mintPeriodDuration);
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
        // Update mint event to now
        lastMintEvent = now;

        emit SupplyMinted(supplyMinted, now);
        return true;
    }

    function setMinterReward(uint _amount)
        external
        onlyOwner
    {
        minterReward = _amount;
        emit MinterRewardUpdated(_amount);
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetix() {
        require(msg.sender == address(Proxy(synthetixProxy).target()), "Only the synthetix contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event SupplyMinted(uint supplyMinted, uint timestamp);
    event MinterRewardUpdated(uint newRewardAmount);
}
