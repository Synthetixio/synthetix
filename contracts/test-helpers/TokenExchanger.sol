/* TokenExchanger.sol: Used for testing contract to contract calls on chain 
 * with Synthetix for testing ERC20 compatability
 */
pragma solidity 0.4.25;

import "../Owned.sol";
import "../ISynthetix.sol";
import "../IFeePool.sol";
import "../IERC20.sol";

contract TokenExchanger is Owned {

    ISynthetix public synthetix;

    constructor(address _owner, ISynthetix _synthetix)
        Owned(_owner)
        public
    {
        synthetix = _synthetix;
    }

    function setSynthetix(ISynthetix _synthetix)
        external
        onlyOwner
    {
        synthetix = _synthetix;
    }

    function checkBalance(address account)
        public
        view
        synthetixIsSet
        returns (uint)
    {
        return IERC20(synthetix).balanceOf(account);
    }

    function amountReceivedFromExchange(uint amount)
        public
        view
        synthetixIsSet
        returns (uint)
    {
        return IFeePool(synthetix.feePool()).amountReceivedFromExchange(amount);
    }

    function exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey)
        public
        synthetixIsSet
        returns (bool)
    {
        // Get my balance
        uint mybalance = IERC20(synthetix).balanceOf(msg.sender);

        // Get FeePool
        IFeePool feePool = IFeePool(synthetix.feePool());

        // Get exchangeFeeRate
        uint exchangeFeeRate = IFeePool(feePool).exchangeFeeRate();
        uint maxRate = 5000000000000000;
        require(exchangeFeeRate < maxRate, "Not paying more than that");

        // Check my amount Received From Exchange
        require(amountReceivedFromExchange(mybalance) > 0, "No sipping");

        // Do the exchange
        return synthetix.exchange(sourceCurrencyKey, sourceAmount, destinationCurrencyKey, msg.sender);
    }

    modifier synthetixIsSet {
        require(synthetix != address(0), "synthetix contract address not set");
        _;
    }
}
