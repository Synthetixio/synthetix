pragma solidity >=0.4.21 <0.6.0;

import "./SafeDecimalMath.sol";
import "./Synthetix.sol";
import "./FeePool.sol";

contract StakingPool {
    using SafeMath for uint;
    using SafeDecimalMath for uint;


    event Deposit(address indexed sender, uint256 SNXamount, uint256 liquidityAmount);
    event Withdrawl(address indexed sender, uint256 SNXamount, uint256 liquidityAmount);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);


    address public manager;
    FeePool public feePool;
    Synthetix public snx;

    mapping (address => uint256) public balances;
    mapping (address => mapping (address => uint256)) private _allowances;
    uint256 public totalSupply;

    //This can be optimzed to occupy fewer storage slots
    uint256 fee;
    uint256 pendingFee;
    uint256 feeTime;
    uint256 delayTime;
    uint8 delay;
    uint8 pendingDelay;


    constructor(address _manager, address _synthetix, address _feePool) public {
        manager = _manager;
        snx = Synthetix(_synthetix);
        feePool = FeePool(_feePool);
    }

    modifier onlyManager() {
        require(msg.sender == manager);
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
            liquidityAmount = amount * totalSupply / totalSNXValue();
        } else {
            liquidityAmount = amount;
        }
        balances[msg.sender] = balances[msg.sender] + liquidityAmount;
        totalSupply = totalSupply + amount;
        require(snx.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        emit Deposit(msg.sender, amount, liquidityAmount);
    }

    //  TODO let manager set a order of preference of synths to burn
    function withdraw(uint256 amount) external {
        //check if there's liquid SNX available
        uint256 available = snx.balanceOf(address(this));
        uint256 amountToWithdraw = totalSNXValue() * amount / totalSupply;
        //In the case that's theres no liquid SNX
        if(available < amountToWithdraw){
            uint256 diff = amountToWithdraw - available;
            uint256 synthAmount = snx.effectiveValue("SNX", diff, "sUSD");
            snx.burnSynths("sUSD", synthAmount);
        }

        balances[msg.sender] = balances[msg.sender] - amount;
        totalSupply -= amount;
        require(snx.transfer(msg.sender, amountToWithdraw * fee / 100), "Token transfer failed");
        require(snx.transfer(manager, 100 * fee / amountToWithdraw), "Token transfer failed");
        //NOTE event not accounting for fee
        emit Withdrawl(msg.sender, amountToWithdraw, amount);
    }

    /**
    TODO: research the best approach.
    Should withdraws be made only on liquidty SNX?
    Should withdrwas automatically trigger burning of synths?
    Should withdrwas cut the whole asset pool(the investor recieves snx + synths + debt(?)) by the % of amount?
    Should there be a difference between an amicable withdraw vs a rage exit? If so, how the fee should be calculated?
    **/
    function exit() external {}

    function totalSNXValue() public view returns(uint){
        //There're a lot of factors we need to onsider:
        // Does this count already vested amounts?
        (uint256 fees, uint256 rewards) = feePool.feesAvailable(address(this), "SNX");
        uint256 total = snx.collateral(address(this)) + fees + rewards;        
        return total;
        //return snx.balanceOf(this);
    }
    /**
    ----------------------------------------------------------------------------
                 MANAGER FUNCTIONS
    ----------------------------------------------------------------------------
    **/
    function issueSynths(bytes4 currencyKey, uint amount) external onlyManager{
        snx.issueSynths(currencyKey, amount);
    }
    function burnSynths(bytes4 currencyKey, uint amount) external onlyManager{
        snx.burnSynths(currencyKey, amount);
    }
    function issueMaxSynths(bytes4 currencyKey) external onlyManager{
        snx.issueMaxSynths(currencyKey);
    }
    function exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey, address destinationAddress) external onlyManager {
        snx.exchange(sourceCurrencyKey,sourceAmount,destinationCurrencyKey,destinationAddress);
    }
    function claimFees(bytes4 currencyKey) external onlyManager{
        feePool.claimFees(currencyKey);
    }


    function setFee(uint256 _newFee) external onlyManager{
        //This resets if there's a current pending fee
        pendingFee = _newFee;
        feeTime = now + delay;
    }
    //Can be called by anyone
    function finalizeFee() external {
        require(now >= feeTime && feeTime != 0);
        fee = pendingFee;
        pendingFee = 0;
        feeTime = 0;
    }
    function setDelay(uint8 _newDelay) external onlyManager{
        //This resets if there's a current pending fee
        pendingDelay = _newDelay;
        delayTime = now + delay;
    }

    //Can be called by anyone
    function finalizeDelay() external {
        require(now >= delayTime && delayTime != 0);
        delay = pendingDelay;
        pendingDelay = 0;
        delayTime = 0;
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

/**
    ----------------------------------------------------------------------------
                 INTERFACES
    ----------------------------------------------------------------------------
**/

// contract Synthetix {
//     function transfer(address _to, uint256 _value) public returns (bool success);
//     function transferFrom(address _from, address _to, uint256 _value) public returns (bool success);
//     function exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey, address destinationAddress) external;
//     function issueSynths(bytes4 currencyKey, uint amount) external;
//     function issueMaxSynths(bytes4 currencyKey) external;
//     function burnSynths(bytes4 currencyKey, uint amount) external;
//     function collateralisationRatio(address issuer) public view returns (uint);
//     function effectiveValue(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey) public view returns (uint);
//     function balanceOf(address account) public view returns (uint);
// }

// contract FeePool {
//     function claimFees(bytes4 currencyKey) external;
//      function feesAvailable(address account, bytes4 currencyKey) public view returns (uint, uint);
    
// }