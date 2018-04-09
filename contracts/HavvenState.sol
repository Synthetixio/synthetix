pragma solidity ^0.4.21;


import "contracts/State.sol";
import "contracts/Nomin.sol";
import "contracts/HavvenEscrow.sol";


contract HavvenState is State {
    // Other ERC20 fields
    string public name;

    string public symbol;

    uint public totalSupply;

    // Sums of balances*duration in the current fee period.
    // range: decimals; units: havven-seconds
    mapping(address => uint) public currentBalanceSum;

    // Average account balances in the last completed fee period. This is proportional
    // to that account's last period fee entitlement.
    // (i.e. currentBalanceSum for the previous period divided through by duration)
    // WARNING: This may not have been updated for the latest fee period at the
    //          time it is queried.
    // range: decimals; units: havvens
    mapping(address => uint) public lastAverageBalance;

    // The average account balances in the period before the last completed fee period.
    // This is used as a person's weight in a confiscation vote, so it implies that
    // the vote duration must be no longer than the fee period in order to guarantee that
    // no portion of a fee period used for determining vote weights falls within the
    // duration of a vote it contributes to.
    // WARNING: This may not have been updated for the latest fee period at the
    //          time it is queried.
    mapping(address => uint) public penultimateAverageBalance;

    // The time an account last made a transfer.
    // range: naturals
    mapping(address => uint) public lastTransferTimestamp;

    // The time the current fee period began.
    uint public feePeriodStartTime = 3;
    // The actual start of the last fee period (seconds).
    // This, and the penultimate fee period can be initially set to any value
    //   0 < val < now, as everyone's individual lastTransferTime will be 0
    //   and as such, their lastAvgBal/penultimateAvgBal will be set to that value
    //   apart from the contract, which will have totalSupply
    uint public lastFeePeriodStartTime = 2;

    // The actual start of the penultimate fee period (seconds).
    uint public penultimateFeePeriodStartTime = 1;

    // And may not be set to be shorter than a day.
    uint constant MIN_FEE_PERIOD_DURATION_SECONDS = 1 days;
    // And may not be set to be longer than six months.
    uint constant MAX_FEE_PERIOD_DURATION_SECONDS = 26 weeks;

    // Fee periods will roll over in no shorter a time than this.
    uint public targetFeePeriodDurationSeconds = 4 weeks;
    // The quantity of nomins that were in the fee pot at the time
    // of the last fee rollover (feePeriodStartTime).
    uint public lastFeesCollected;

    mapping(address => bool) public hasWithdrawnLastPeriodFees;
    Nomin public nomin;
    HavvenEscrow public escrow;

    function setName(string _name) public onlyAssociatedContract {
        name = _name;
    }

    function setSymbol(string _symbol) public onlyAssociatedContract {
        symbol = _symbol;
    }

    function setTotalSupply(uint _totalSupply) public onlyAssociatedContract {
        totalSupply = _totalSupply;
    }

    function setCurrentBalanceSum(address account, uint balanceSum) public onlyAssociatedContract {
        currentBalanceSum[account] = balanceSum;
    }


    function setLastAverageBalance(address account, uint lastBal) public onlyAssociatedContract {
        lastAverageBalance[account] = lastBal;
    }

    function setPenultimateAverageBalance(address account, uint penultimateBal) public onlyAssociatedContract {
        penultimateAverageBalance[account] = penultimateBal;
    }

    function setLastTransferTimestamp(address account, uint lastTimestamp) public onlyAssociatedContract {
        lastTransferTimestamp[account] = lastTimestamp;
    }

    function setFeePeriodStartTime(uint time) public onlyAssociatedContract {
        feePeriodStartTime = time;
    }


    function setLastFeePeriodStartTime(uint time) public onlyAssociatedContract {
        lastFeePeriodStartTime = time;
    }

    function setPenultimateFeePeriodStartTime(uint time) public onlyAssociatedContract {
        penultimateFeePeriodStartTime = time;
    }


    function setTargetFeePeriodDurationSeconds(uint duration) public onlyAssociatedContract {
        require(duration >= MIN_FEE_PERIOD_DURATION_SECONDS);
        require(duration <= MAX_FEE_PERIOD_DURATION_SECONDS);
        targetFeePeriodDurationSeconds = duration;
    }


    function setLastFeesCollected(uint fees) public onlyAssociatedContract {
        lastFeesCollected = fees;
    }


    function setHasWithdrawnLastPeriodFees(address account, bool val) public onlyAssociatedContract {
        hasWithdrawnLastPeriodFees[account] = val;
    }


    function setNomin(address _nomin) public onlyAssociatedContract {
        nomin = Nomin(_nomin);
    }


    function setEscrow(address _escrow) public onlyAssociatedContract {
        escrow = HavvenEscrow(_escrow);
    }

    function HavvenState(address _owner, address _associatedContract) State(_owner, _associatedContract) public {}
}
