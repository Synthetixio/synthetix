pragma solidity >=0.4.21 <0.6.0;

import "./SafeDecimalMath.sol";
import "./Synthetix.sol";
import "./FeePool.sol";
import "./RewardEscrow.sol";
import "./Depot.sol";
import "./Synth.sol";

/**
 * @title StakingPoolStorage.
 * @notice A contract inherited ny both StakingPool and StakingPoolProxy to ensure that they both have the same layout structure.
 */
contract StakingPoolStorage {

    event Deposit(address indexed sender, uint256 SNXamount, uint256 liquidityAmount);
    event Withdrawl(address indexed sender, uint256 SNXamount, uint256 liquidityAmount);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    uint256 public constant HUNDRED_PERCENT = 100000;
    bytes4 public constant sUSD = "sUSD";
    bytes4 public constant SNX = "SNX";


    mapping (address => uint256) public balances;
    mapping (address => mapping (address => uint256)) internal _allowances;
    address public manager;
    FeePool public feePool;
    Synthetix public synthetix;
    RewardEscrow public rewardEscrow;
    Depot public depot;


    //This could be optimized to occupy fewer storage slots
    uint256 public totalSupply;
    uint256 public claimedAmountsUSD;
    uint256 public managerFundsUSD;
    uint256 public fee;
    uint256 public pendingFee;
    uint256 public feeTime;
    uint256 public delayTime;
    uint256 public delay;
    uint256 public pendingDelay;
}

/**
 * @title StakingPool
 * @notice The logic implementaion of the staking pool, a contract that allows a stakers to delegate SNX strategies to a manager.
 */
contract StakingPool is StakingPoolStorage{
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    modifier onlyManager() {
        require(msg.sender == manager, "Sender is not manager");
        _;
    }

    /**
    ----------------------------------------------------------------------------
                 INVESTORS FUNCTIONS
    ----------------------------------------------------------------------------
    **/

    function deposit(uint256 snxAmount) external {
        uint256 liquidityAmount = calculateLiquidityTokens(snxAmount);
        balances[msg.sender] = balances[msg.sender].add(liquidityAmount);
        totalSupply = totalSupply.add(snxAmount);
        require(synthetix.transferFrom(msg.sender, address(this), snxAmount), "Token transfer failed");
        emit Deposit(msg.sender, snxAmount, liquidityAmount);
    }

    function withdrawal(uint256 amount) external {
        uint256 liquidityAmount = amount;
        uint256 amountToWithdraw = totalSNXValue().mul(liquidityAmount).div(totalSupply);
        bool enoughSNX = liquidateSNX(amountToWithdraw);
        // Will only withdraw some amount of liquidity tokens and leave the rest in their balance
        if(!enoughSNX) {
            uint256 available = synthetix.transferableSynthetix(address(this));
            uint256 newAmount = totalSNXValue().div(available).div(totalSupply);
            liquidityAmount = newAmount;
            amountToWithdraw = available;
        }
        balances[msg.sender] = balances[msg.sender].sub(liquidityAmount);
        totalSupply = totalSupply.sub(liquidityAmount);

        // uint256 trasnferable = synthetix.transferableSynthetix(address(this));
        // uint256 _amount = amountToWithdraw > trasnferable ? trasnferable : amountToWithdraw;

        require(synthetix.transfer(msg.sender, amountToWithdraw), "Token transfer failed");

        emit Withdrawl(msg.sender, amountToWithdraw, liquidityAmount);
        //require(!enoughSNX, "thaha");
    }

    function liquidateSNX(uint256 _snxTarget) internal returns(bool){
        //TODO: optimize this function
        uint256 available = synthetix.transferableSynthetix(address(this));
        if(available >= _snxTarget) return true;
        //If that wasn't enough, vest rewards
        rewardEscrow.vest();
        if(available >= _snxTarget) return true;

         //If that wasn't enough, claim fees 
        _claimFeeInternal(sUSD);
        available = synthetix.transferableSynthetix(address(this));
        if(available >= _snxTarget) return true;
        //Burning synths is lthe last option because it's the most expensive gas-wise
        uint256 diff = _snxTarget.sub(available);
        burnAvailableSynths(diff);
        available = synthetix.transferableSynthetix(address(this));
        if(available >= _snxTarget) return true;
        return false; // There isn't enough SNX to withdraw, maybe because it's escrowed. 
    }

    function burnAvailableSynths(uint256 _targetSNXAmount) internal {
        bytes4[] memory _synths = synthetix.availableCurrencyKeys();
        uint256 retrievedSNX = 0;
        for(uint i = 0; i < _synths.length; i++){
            //check our balance in this synth
            uint256 balance = synthetix.synths(_synths[i]).balanceOf(address(this));
            //get the effective SNX value
            if(balance > 0){
                uint256 needed = _targetSNXAmount - retrievedSNX;
                uint256 _snxValue = synthetix.effectiveValue(_synths[i], balance, SNX);
                if(needed < _snxValue){
                    uint256 atw = _snxValue - needed;
                    balance = synthetix.effectiveValue(SNX, atw, _synths[i]);
                }
                //burn that amount
                synthetix.burnSynths(_synths[i], balance);
                if (retrievedSNX + _snxValue >= _targetSNXAmount) break;
                retrievedSNX += _snxValue;
            }
        }
    }

    function totalSNXValue() public view returns(uint){
        (uint256 fees, uint256 rewards) = feePool.feesAvailable(address(this), sUSD);
        uint256 effectiveFee = depot.synthetixReceivedForSynths(fees);
        uint256 total = synthetix.collateral(address(this)).add(effectiveFee).add(rewards);
        return total;
    }

    /**
    ----------------------------------------------------------------------------
                 MANAGER FUNCTIONS
    ----------------------------------------------------------------------------
    **/
    function issueSynths(bytes4 currencyKey, uint amount) external onlyManager{
        synthetix.issueSynths(currencyKey, amount);
    }
    function burnSynths(bytes4 currencyKey, uint amount) external onlyManager{
        synthetix.burnSynths(currencyKey, amount);
    }
    function issueMaxSynths(bytes4 currencyKey) external onlyManager{
        synthetix.issueMaxSynths(currencyKey);
    }

    function exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey) external onlyManager {
        synthetix.exchange(sourceCurrencyKey,sourceAmount,destinationCurrencyKey,address(this));
    }

    function vest() external onlyManager {
        rewardEscrow.vest();
    }

    function claimFees() external onlyManager{
        _claimFeeInternal(sUSD);
    }



    function setFee(uint256 _newFee) external onlyManager{
        //This resets if there's a current pending fee
        require(_newFee < HUNDRED_PERCENT, "Fee is too large");
        pendingFee = _newFee;
        feeTime = now.add(delay);
    }
    //Can be called by anyone
    function finalizeFee() external {
        require(now >= feeTime && feeTime != 0, "Wrong time for finalizing fee");
        require(pendingFee != 0, "Pending fee can't be 0");
        fee = pendingFee;
        pendingFee = 0;
        feeTime = 0;
    }
    function setDelay(uint8 _newDelay) external onlyManager{
        //This resets if there's a current pending fee
        pendingDelay = _newDelay * 1 days;
        delayTime = now.add(delay);
    }

    //Can be called by anyone
    function finalizeDelay() external {
        require(now >= delayTime && delayTime != 0, "Wrong time for finalizing fee");
        require(pendingDelay != 0, "Pending delay can't be 0");
        delay = pendingDelay;
        pendingDelay = 0;
        delayTime = 0;
    }
    
    /**
    ----------------------------------------------------------------------------
                 INTERNAL FUNCTIONS
    ----------------------------------------------------------------------------
    **/

    function _claimFeeInternal(bytes4 currencykey) internal {
        (uint256 fees, ) = feePool.feesAvailable(address(this), currencykey);
        if(fees > 0){
            uint256 snxRecieved = depot.synthetixReceivedForSynths(fees);
            uint256 managerFee = snxRecieved.mul(fee).div(HUNDRED_PERCENT);
            //mint fees for manager
            totalSupply = totalSupply.add(managerFee);
            balances[manager] = balances[manager].add(calculateLiquidityTokens(managerFee));
        
            //Trade Synths for SNX
            feePool.claimFees(currencykey);
            synthetix.synths(currencykey).approve(address(depot), fees);
            depot.exchangeSynthsForSynthetix(fees);
        }
    }

    function calculateLiquidityTokens(uint256 _snxAmount) internal returns(uint256 liquidityAmount){
        if(totalSupply > 0) {
            liquidityAmount = _snxAmount.mul(totalSupply).div(totalSNXValue());
        } else {
            liquidityAmount = _snxAmount;
        }
    }


    /**
    ----------------------------------------------------------------------------
                 ERC20 FUNCTIONS
    ----------------------------------------------------------------------------
    **/

    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }

    
    function transfer(address recipient, uint256 amount) public returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, _allowances[sender][msg.sender].sub(amount));
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].add(addedValue));
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].sub(subtractedValue));
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        balances[sender] = balances[sender].sub(amount);
        balances[recipient] = balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}