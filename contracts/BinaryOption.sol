pragma solidity ^0.5.16;

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./BinaryOptionMarket.sol";

contract BinaryOption {
    /* ========== LIBRARIES ========== */
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== STATE VARIABLES ========== */

    string constant public name = "SNX Binary Option";
    string constant public symbol = "sOPT";
    uint8 constant public decimals = 18;

    BinaryOptionMarket public market;

    mapping(address => uint) public bidOf;
    uint public totalBids;

    mapping(address => uint) public balanceOf;
    uint public totalSupply;

    // The argument order is allowance[owner][spender]
    mapping(address => mapping(address => uint)) public allowance;

    /* ========== CONSTRUCTOR ========== */

    constructor(address initialBidder, uint initialBid) public {
        market = BinaryOptionMarket(msg.sender);
        bidOf[initialBidder] = initialBid;
        totalBids = initialBid;
    }

    /* ========== VIEWS ========== */

    function price() public view returns (uint) {
        return market.senderPrice();
    }

    function claimableBy(address account) public view returns (uint) {
        return bidOf[account].divideDecimal(price());
    }

    function totalClaimable() public view returns (uint) {
        return totalBids.divideDecimal(price());
    }

    function totalExercisable() external view returns (uint) {
        return totalSupply + totalClaimable();
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // This must only be invoked during bidding.
    function bid(address bidder, uint newBid) external onlyMarket {
        bidOf[bidder] = bidOf[bidder].add(newBid);
        totalBids = totalBids.add(newBid);
    }

    // This must only be invoked during bidding.
    function refund(address bidder, uint newRefund) external onlyMarket {
        // The safe subtraction will catch refunds that are too large.
        bidOf[bidder] = bidOf[bidder].sub(newRefund);
        totalBids = totalBids.sub(newRefund);
    }

    // This must only be invoked after bidding.
    function claim(address claimant) external onlyMarket returns (uint optionsClaimed) {
        uint claimable = claimableBy(claimant);
        // No options to claim? Nothing happens.
        if (claimable == 0) {
            return 0;
        }

        totalBids = totalBids.sub(bidOf[claimant]);
        bidOf[claimant] = 0;

        totalSupply = totalSupply.add(claimable);
        balanceOf[claimant] = balanceOf[claimant].add(claimable); // Increment rather than assigning since a transfer may have occurred.

        emit Transfer(address(0), claimant, claimable);
        emit Issued(claimant, claimable);

        return claimable;
    }

    // This must only be invoked after maturity.
    function exercise(address claimant) external onlyMarket {
        uint balance = balanceOf[claimant];

        if (balance == 0) {
            return;
        }

        balanceOf[claimant] = 0;
        totalSupply = totalSupply.sub(balance);

        emit Transfer(claimant, address(0), balance);
        emit Burned(claimant, balance);
    }

    // This must only be invoked after the exercise window is complete.
    // Note that any options which have not been exercised will linger.
    function selfDestruct(address payable beneficiary) external onlyMarket {
        selfdestruct(beneficiary);
    }

    /* ---------- ERC20 Functions ---------- */

    // This should only operate after bidding;
    // Since options can't be claimed until after bidding, all balances are zero until that time.
    // So we don't need to explicitly check the timestamp to prevent transfers.
    function internalTransfer(address _from, address _to, uint _value) internal returns (bool success) {
        require(_to != address(0) && _to != address(this), "Cannot transfer to this address.");

        uint fromBalance = balanceOf[_from];
        require(_value <= fromBalance, "Insufficient balance.");

        balanceOf[_from] = fromBalance.sub(_value);
        balanceOf[_to] = balanceOf[_to].add(_value);

        emit Transfer(_from, _to, _value);
        return true;
    }

    function transfer(address _to, uint _value) public returns (bool success) {
        return internalTransfer(msg.sender, _to, _value);
    }

    function transferFrom(address _from, address _to, uint _value) public returns (bool success) {
        uint fromAllowance = allowance[_from][msg.sender];
        require(_value <= fromAllowance, "Insufficient allowance.");

        allowance[_from][msg.sender] = fromAllowance.sub(_value);
        return internalTransfer(_from, _to, _value);
    }

    function approve(address _spender, uint _value) public returns (bool success) {
        require(_spender != address(0));
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    /* ========== MODIFIERS ========== */

    modifier onlyMarket() {
        require(msg.sender == address(market), "Permitted only for the market.");
        _;
    }

    /* ========== EVENTS ========== */

    event Issued(address indexed account, uint value);
    event Burned(address indexed account, uint value);
    event Transfer(address indexed from, address indexed to, uint value);
    event Approval(address indexed owner, address indexed spender, uint value);
}
