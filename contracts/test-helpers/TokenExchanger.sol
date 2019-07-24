/* TokenExchanger.sol: Used for testing contract to contract calls on chain 
 * with Synthetix for testing ERC20 compatability
 */
pragma solidity 0.4.25;

import "../Owned.sol";
import "../ISynthetix.sol";
import "../IFeePool.sol";
import "../IERC20.sol";

contract TokenExchanger is Owned {

    address public integrationProxy;

    constructor(address _owner, address _integrationProxy)
        Owned(_owner)
        public
    {
        integrationProxy = _integrationProxy;
    }

    function setSynthetixProxy(address _integrationProxy)
        external
        onlyOwner
    {
        integrationProxy = _integrationProxy;
    }

    function checkBalance(address account)
        public
        view
        synthetixIsSet
        returns (uint)
    {
        return IERC20(integrationProxy).balanceOf(account);
    }

    function amountReceivedFromExchange(uint amount)
        public
        view
        synthetixIsSet
        returns (uint)
    {
        return IFeePool(ISynthetix(integrationProxy).feePool()).amountReceivedFromExchange(amount);
    }

    function exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey)
        public
        synthetixIsSet
        returns (bool)
    {
        // Get my balance
        uint mybalance = IERC20(integrationProxy).balanceOf(msg.sender);

        // Get FeePool
        IFeePool feePool = IFeePool(ISynthetix(integrationProxy).feePool());

        // Get exchangeFeeRate
        uint exchangeFeeRate = IFeePool(feePool).exchangeFeeRate();
        uint maxRate = 5000000000000000;
        require(exchangeFeeRate < maxRate, "Not paying more than that");

        // Check my amount Received From Exchange
        require(amountReceivedFromExchange(mybalance) > 0, "No sipping");

        // Do the exchange
        return ISynthetix(integrationProxy).exchange(sourceCurrencyKey, sourceAmount, destinationCurrencyKey, msg.sender);
    }

    modifier synthetixIsSet {
        require(integrationProxy != address(0), "Synthetix Integration proxy address not set");
        _;
    }

    event LogString(string name, string value);
    event LogInt(string name, uint value);
}
