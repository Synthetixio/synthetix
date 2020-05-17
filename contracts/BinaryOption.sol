pragma solidity ^0.5.16;

import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";

// TODO: Consider whether prices should be stored as high precision.
// TODO: Name and symbol should be reconsidered. Does the underlying asset need to be incorporated?
// TODO: Switch to error codes from full descriptions?
// TODO: Update the ERC20 values
// TODO: Self-destructible

contract BinaryOption {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    string constant public name = "SNX Binary Option";
    string constant public symbol = "sOPT";
    uint8 constant public decimals = 18;

    BinaryOptionMarket public market;

    uint256 public endOfBidding;

    // Bid balances
    mapping(address => uint256) public bidOf;
    uint256 public totalBids;

    // Option balances
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    mapping(address => mapping(address => uint256)) public allowance; // The argument order is allowance[owner][spender]

    constructor(uint256 _endOfBidding, address initialBidder, uint256 initialBid) public {
        require(now <= _endOfBidding, "Bidding period must end in the future.");
        market = BinaryOptionMarket(msg.sender);
        endOfBidding = _endOfBidding;
        bidOf[initialBidder] = initialBid;
        totalBids = initialBid;
    }

    // The option price and supply is now fixed.
    function biddingEnded() public view returns (bool) {
        return endOfBidding <= now;
    }

    modifier onlyDuringBiddingByMarket() {
        require(!biddingEnded(), "Bidding must be active.");
        require(msg.sender == address(market), "Permitted only for the market.");
        _;
    }

    modifier onlyAfterBidding() {
        require(biddingEnded(), "Bidding must be complete.");
        _;
    }

    function bid(address bidder, uint256 newBid) external onlyDuringBiddingByMarket {
        require(newBid != 0, "Bids must be nonzero.");
        bidOf[bidder] = bidOf[bidder].add(newBid);
        totalBids = totalBids.add(newBid);
    }

    function refund(address bidder, uint256 newRefund) external onlyDuringBiddingByMarket {
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

    function claimOptions() external onlyAfterBidding returns (uint256 optionsClaimed) {
        uint256 claimable = optionsOwedTo(msg.sender);
        // No options to claim? Nothing happens.
        if (claimable == 0) {
            return 0;
        }

        totalBids = totalBids.sub(bidOf[msg.sender]);
        bidOf[msg.sender] = 0;

        totalSupply = totalSupply.add(claimable);
        balanceOf[msg.sender] = claimable; // There's no way to claim an allocation more than once, so just assign directly rather than incrementing.

        emit Transfer(address(0), msg.sender, claimable);
        emit Issued(msg.sender, claimable);

        return claimable;
    }

    // TODO: Determine whether to even leave the bidding period check in.
    //       If options can't be claimed until after bidding then all option balances are zero anyway.
    function internalTransfer(address _from, address _to, uint256 _value) internal onlyAfterBidding returns (bool success) {
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
