pragma solidity ^0.5.16;

import "./SafeDecimalMath.sol";
import "./BinaryOptionMarket.sol";

// TODO: Compare with existing token contract.
// TODO: Consider whether prices should be stored as high precision.
// TODO: Name and symbol should be reconsidered. Does the underlying asset need to be incorporated?

// TODO: Require claiming options in order to transfer or exercise them.

// TODO: ERC20 test values
// TODO: Self-destructible

contract BinaryOption {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    BinaryOptionMarket public market;

    uint256 public endOfBidding;

    // Current price: 18 decimal fixed point number of sUSD per option.
    // Should always be between 0 and UNIT.
    // TODO: Should these be high precision?
    uint256 public price;

    // Bid balances
    mapping(address => uint256) public bidOf;

    // Option balances
    //mapping(address => uint256) public balanceOf;

    uint256 public totalBids;

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

    // ERC20 functionality

    string constant public name = "SNX Binary Option";
    string constant public symbol = "sOPT";
    uint8 constant public decimals = 18;

    function totalSupply() public view returns (uint256) {
        // Note the price can never be zero since it is only updated in bidUpdatePrice, where this is checked.
        return totalBids.divideDecimal(price);
    }

    function balanceOf(address _owner) public view returns (uint256 balance) {
        // Note the price can never be zero since it is only updated in bidUpdatePrice, where this is checked.
        return bidOf[_owner].divideDecimal(price);
    }

    function internalTransfer(address _from, address _to, uint256 _value) internal returns (bool success) {
        require(_to != address(0) && _to != address(this), "Cannot transfer to this address.");
        require(biddingEnded(), "Can only transfer after the end of bidding.");
        uint256 fromBalance = balanceOf(_from);

        // TODO: Check whether there are cases where this can mess up due to rounding.
        // Deal with rounding.
        if (_value == fromBalance) {
            bidOf[_to] = bidOf[_to].add(bidOf[_from]);
            bidOf[_from] = 0;
        } else {
            // Insufficient balance is handled by the safe subtraction.
            uint256 bidValue = _value.multiplyDecimal(price);
            bidOf[_from] = bidOf[_from].sub(bidValue);
            bidOf[_to] = bidOf[_to].add(bidValue);
        }

        emit Transfer(_from, _to, _value);

        return true;
    }

    function transfer(address _to, uint256 _value) public returns (bool success) {
        return internalTransfer(msg.sender, _to, _value);
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
        require(_value <= allowance[_from][msg.sender], "Insufficient allowance.");
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