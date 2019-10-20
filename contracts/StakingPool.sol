pragma solidity >=0.4.21 <0.6.0;

import "./SafeDecimalMath.sol";
import "./Synthetix.sol";
import "./FeePool.sol";
import "./RewardEscrow.sol";
import "./Depot.sol";
import "./Synth.sol";

contract StakingPool {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    event Deposit(address indexed sender, uint256 SNXamount, uint256 liquidityAmount);
    event Withdrawl(address indexed sender, uint256 SNXamount, uint256 liquidityAmount);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    uint256 public constant HUNDRED_PERCENT = 100000;
    bytes4 public constant sUSD = "sUSD";
    bytes4 public constant SNX = "SNX";


    mapping (address => uint256) public balances;
    mapping (address => mapping (address => uint256)) private _allowances;
    address public manager;
    FeePool public feePool;
    Synthetix public synthetix;
    RewardEscrow public rewardEscrow;
    Depot public depot;

    uint256 public totalSupply;
    uint256 public claimedAmountsUSD;
    uint256 public managerFundsUSD;
    uint256 public fee;
    uint256 public pendingFee;
    uint256 public feeTime;
    uint256 public delayTime;
    uint256 public delay;
    uint256 public pendingDelay;


    constructor(address _manager, address _synthetix, address _feePool, address _rEscrow, address _depot, uint256 _fee, uint256 _delay) public {
        manager = _manager;
        synthetix = Synthetix(_synthetix);
        feePool = FeePool(_feePool);
        rewardEscrow = RewardEscrow(_rEscrow);
        depot = Depot(_depot);
        fee = _fee;
        delay = _delay * 1 days;
    }

    modifier onlyManager() {
        require(msg.sender == manager, "Sender is not manager");
        _;
    }

    /**
    ----------------------------------------------------------------------------
                 INVESTORS FUNCTIONS
    ----------------------------------------------------------------------------
    **/

    function deposit(uint256 amount) external {
        uint256 liquidityAmount;
        if(totalSupply > 0) {
            liquidityAmount = amount.mul(totalSupply).div(totalSNXValue());
        } else {
            liquidityAmount = amount;
        }
        balances[msg.sender] = balances[msg.sender].add(liquidityAmount);
        totalSupply = totalSupply.add(amount);
        require(synthetix.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        emit Deposit(msg.sender, amount, liquidityAmount);
    }

    function withdrawal(uint256 amount) external {
        //This isn't strictly necessary, but it's a easier solution
        _claimFeeInternal(sUSD);

        uint256 available = synthetix.balanceOf(address(this));
        uint256 amountToWithdraw = totalSNXValue().mul(amount).div(totalSupply);
   
        if(claimedAmountsUSD > 0){
            uint256 feeWithdrawl = claimedAmountsUSD.mul(amount).div(totalSupply);
            claimedAmountsUSD = claimedAmountsUSD.sub(feeWithdrawl);
        }
        uint256 snxFee = synthetix.effectiveValue(sUSD, feeWithdrawl, SNX);
        amountToWithdraw = amountToWithdraw.sub(snxFee);

        if(available < amountToWithdraw){
            uint256 diff = amountToWithdraw.sub(available);
            uint256 synthAmount = synthetix.effectiveValue(SNX, diff, sUSD);
            synthetix.burnSynths(sUSD, synthAmount);
        }

        balances[msg.sender] = balances[msg.sender].sub(amount);
        totalSupply = totalSupply.sub(amount);

        uint256 trasnferable = synthetix.transferableSynthetix(address(this));
        uint256 _amount = amountToWithdraw > trasnferable ? trasnferable : amountToWithdraw;
        
        require(synthetix.synths(sUSD).transfer(msg.sender, feeWithdrawl), "fees transfer failed");
        require(synthetix.transfer(msg.sender, _amount), "Token transfer failed");

        emit Withdrawl(msg.sender, amountToWithdraw, amount);
    }

    function totalSNXValue() public view returns(uint){
        uint256  snxAmount = synthetix.effectiveValue(sUSD, claimedAmountsUSD, SNX);
        //We need to discount manager percent from non claimed fees
        (uint256 fees, uint256 rewards) = feePool.feesAvailable(address(this), SNX);
        uint256 managerFees = fees.mul(fee).div(HUNDRED_PERCENT);
        uint256 total = synthetix.collateral(address(this)).add(fees).add(rewards).add(snxAmount).sub(managerFees);
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
        if(sourceCurrencyKey == sUSD){
            uint256 maxAmount = (synthetix.synths(sUSD).balanceOf(address(this))).sub(claimedAmountsUSD.add(managerFundsUSD));
        }
        uint256 exAmount = maxAmount < sourceAmount ? maxAmount : sourceAmount;
        synthetix.exchange(sourceCurrencyKey,exAmount,destinationCurrencyKey,address(this));
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

    function _claimFeeInternal(bytes4 currencykey) internal {
        (uint256 fees, ) = feePool.feesAvailable(address(this), currencykey);
        if(fees > 0){
            feePool.claimFees(currencykey);
            uint256 managerFee = fees.mul(fee).div(HUNDRED_PERCENT);
            managerFundsUSD = managerFundsUSD.add(managerFee);
            claimedAmountsUSD = claimedAmountsUSD.add(fees).sub(managerFee);
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