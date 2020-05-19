pragma solidity ^0.5.16;

import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";

// TODO: Name and symbol should be reconsidered. Does the underlying asset need to be incorporated?
// TODO: Switch to error codes from full descriptions?
// TODO: Self-destructible

contract BinaryOption {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    string constant public name = "SNX Binary Option";
    string constant public symbol = "sOPT";
    uint8 constant public decimals = 18;

    BinaryOptionMarket public market;

    mapping(address => uint256) public bidOf;
    uint256 public totalBids;

    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    // The argument order is allowance[owner][spender]
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(address initialBidder, uint256 initialBid) public {
        market = BinaryOptionMarket(msg.sender);
        bidOf[initialBidder] = initialBid;
        totalBids = initialBid;
    }

    modifier onlyMarket() {
        require(msg.sender == address(market), "Permitted only for the market.");
        _;
    }

    // This must only be invoked during bidding.
    function bid(address bidder, uint256 newBid) external onlyMarket {
        require(newBid != 0, "Bids must be nonzero.");
        bidOf[bidder] = bidOf[bidder].add(newBid);
        totalBids = totalBids.add(newBid);
    }

    // This must only be invoked during bidding.
    function refund(address bidder, uint256 newRefund) external onlyMarket {
        require(newRefund != 0, "Refunds must be nonzero.");
        // The safe subtraction will catch refunds that are too large.
        bidOf[bidder] = bidOf[bidder].sub(newRefund);
        totalBids = totalBids.sub(newRefund);
    }

    function price() public view returns (uint256) {
        return market.senderPrice();
    }

    function optionsOwedTo(address _owner) public view returns (uint256) {
        return bidOf[_owner].divideDecimal(price());
    }

    function totalOptionsOwed() external view returns (uint256) {
        return totalBids.divideDecimal(price());
    }

    // This must only be invoked after bidding.
    function claim(address claimant) external onlyMarket returns (uint256 optionsClaimed) {
        uint256 claimable = optionsOwedTo(claimant);
        // No options to claim? Nothing happens.
        if (claimable == 0) {
            return 0;
        }

        totalBids = totalBids.sub(bidOf[claimant]);
        bidOf[claimant] = 0;

        totalSupply = totalSupply.add(claimable);
        balanceOf[claimant] = claimable; // There's no way to claim an allocation more than once, so just assign directly rather than incrementing.

        emit Transfer(address(0), claimant, claimable);
        emit Issued(claimant, claimable);

        return claimable;
    }

    // This must only be invoked after maturity.
    function exercise(address claimant) external onlyMarket returns (uint256) {
        uint256 balance = balanceOf[claimant];

        if (balance == 0) {
            return 0;
        }

        balanceOf[claimant] = 0;
        totalSupply = totalSupply.sub(balance);

        emit Transfer(claimant, address(0), balance);
        emit Burned(claimant, balance);

        return balance;
    }

    // This should only operate after bidding;
    // Since options can't be claimed until after bidding, all balances are zero until that time.
    // So we don't need to explicitly check the timestamp to prevent transfers.
    function internalTransfer(address _from, address _to, uint256 _value) internal returns (bool success) {
        require(_to != address(0) && _to != address(this), "Cannot transfer to this address.");

        uint256 fromBalance = balanceOf[_from];
        require(_value <= fromBalance, "Insufficient balance.");

        balanceOf[_from] = fromBalance.sub(_value);
        balanceOf[_to] = balanceOf[_to].add(_value);

        emit Transfer(_from, _to, _value);
        return true;
    }

    function transfer(address _to, uint256 _value) public returns (bool success) {
        return internalTransfer(msg.sender, _to, _value);
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
        uint256 fromAllowance = allowance[_from][msg.sender];
        require(_value <= fromAllowance, "Insufficient allowance.");

        allowance[_from][msg.sender] = fromAllowance.sub(_value);
        return internalTransfer(_from, _to, _value);
    }

    function approve(address _spender, uint256 _value) public returns (bool success) {
        require(_spender != address(0));
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    event Issued(address indexed account, uint value);
    event Burned(address indexed account, uint value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
