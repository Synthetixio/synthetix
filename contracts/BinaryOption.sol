pragma solidity ^0.5.16;

import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";

// TODO: Compare with existing token contract.
// TODO: Consider whether prices should be stored as high precision.
// TODO: Name and symbol should be reconsidered. Does the underlying asset need to be incorporated?
// TODO: Switch to error codes from full descriptions.

// TODO: Require claiming options in order to transfer or exercise them.

// TODO: ERC20 test values
// TODO: Self-destructible

contract BinaryOption {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    string constant public name = "SNX Binary Option";
    string constant public symbol = "sOPT";
    uint8 constant public decimals = 18;

    BinaryOptionMarket public market;

    uint256 public endOfBidding;

    // Current price: 18 decimal fixed point number of sUSD per option.
    // Should always be between 0 and UNIT.
    uint256 public price;

    // Bid balances
    mapping(address => uint256) public bidOf;
    uint256 public totalBids;

    // Option balances
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    mapping(address => mapping(address => uint256)) public allowance; // The argument order is allowance[owner][spender]

    constructor(uint256 _endOfBidding, address initialBidder, uint256 initialBid, uint256 initialPrice) public {
        require(now <= _endOfBidding, "Bidding period must end in the future.");
        market = BinaryOptionMarket(msg.sender);
        endOfBidding = _endOfBidding;
        bidUpdatePrice(initialBidder, initialBid, initialPrice);
    }

    // The option price and supply is now fixed.
    function biddingEnded() public view returns (bool) {
        return endOfBidding <= now;
    }

    function updatePrice(uint256 _price) public {
        require(msg.sender == address(market), "Only the market can update prices.");
        require(!biddingEnded(), "Can't update the price after the end of bidding.");
        require(0 < _price && _price < SafeDecimalMath.unit(), "Price out of range.");
        price = _price;
    }

    function bidUpdatePrice(address bidder, uint256 bid, uint256 _price) public {
        updatePrice(_price);

        // Register the bid.
        require(bid != 0, "Bids must be positive.");
        bidOf[bidder] = bidOf[bidder].add(bid);
        totalBids = totalBids.add(bid);
    }

    function refundUpdatePrice(address bidder, uint256 refund, uint256 _price) public {
        updatePrice(_price);
        require(refund != 0, "Refunds must be positive.");
        // The safe subtraction will catch refunds that are too large.
        bidOf[bidder] = bidOf[bidder].sub(refund);
        totalBids = totalBids.sub(refund);
    }

    function optionsOwedTo(address _owner) public view returns (uint256) {
        // Note the price can never be zero since it is only updated in bidUpdatePrice, where this is checked.
        return bidOf[_owner].divideDecimal(price);
    }

    function totalOptionsOwed() public view returns (uint256) {
        // Note the price can never be zero since it is only updated in bidUpdatePrice, where this is checked.
        return totalBids.divideDecimal(price);
    }

    function claimOptions() public returns (uint256 optionsClaimed) {
        require(biddingEnded(), "Can only claim options after the end of bidding.");
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

        return claimable;
    }

    // TODO: Determine whether to even leave the bidding period check in.
    //       If options can't be claimed until after bidding then all option balances are zero anyway.
    function internalTransfer(address _from, address _to, uint256 _value) internal returns (bool success) {
        require(_to != address(0) && _to != address(this), "Cannot transfer to this address.");
        require(biddingEnded(), "Can only transfer after the end of bidding.");

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

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
