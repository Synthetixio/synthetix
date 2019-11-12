/* By using Uniswap sETH exchange as a bridge, this contract enable direct and atomic exchange between ETH and Synths assets issued in Synthetix system 
*/

pragma solidity ^0.4.25;

import "./Owned.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IERC20.sol";

interface UniswapExchangeInterface {
    function getEthToTokenInputPrice(uint) external view returns (uint);
    function getEthToTokenOutputPrice(uint) external view returns (uint);
    function getTokenToEthInputPrice(uint) external view returns (uint);
    function getTokenToEthOutputPrice(uint) external view returns (uint);
    function ethToTokenTransferInput(uint, uint, address) external payable returns (uint);
    function ethToTokenSwapInput(uint, uint) external payable returns (uint);
    function ethToTokenTransferOutput(uint, uint, address) external payable returns (uint);
    function ethToTokenSwapOutput(uint, uint) external payable returns (uint);
    function tokenToEthTransferInput(uint, uint, uint, address) external returns (uint);
    function tokenToEthTransferOutput(uint, uint, uint, address) external returns (uint);
    function addLiquidity(uint, uint,uint) external payable returns(uint);
}

contract AtomicSynthetixUniswapConverter is Owned {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    //following are Rinkeby addresses
    address public uniswapSethExchange = 0x431295890a123c1542bc85F796fE3bAF80dc0E25; // Uniswap sEth Exchange
    address public synRates = 0x30A46E656CdcA6B401Ff043e1aBb151490a07ab0; //Synthetix Rates
    address public synthetix = 0xcBBb17D9767bD57FBF4Bbf8842E916bCb3826ec1; //ProxyERC20 Synthetix
    address public synFeePool = 0x09797E9E75999b9Cf2619E3397795800ce5E3E25;   //Proxy Synthetix FeePool
    bytes32 sEthCurrencyKey = "sETH";
    bytes32 ethCurrencyKey = "ETH";
    
    constructor (
        address _owner
    )
        Owned(_owner)
        public
    {}
    //to recieve refund from uniswap
    function() external payable { 
        require(msg.sender == uniswapSethExchange, "Only get refund from uniswap sEth exchange");
    }

    function setSynthetix(address _synthetix) external 
        onlyOwner
    {
        synthetix = _synthetix;
    }

    function setSynthsFeePool (address _synFeePool) external
        onlyOwner
    {
        synFeePool = _synFeePool;
    }

    function setSynthsExchangeRates(address _synRates) external
        onlyOwner
    {
        synRates = _synRates;
    }

    function setUniswapSethExchange(address _uniswapSethExchange) external
        onlyOwner
    {
        uniswapSethExchange = _uniswapSethExchange;
    }
    
    /**
     * @notice Get input price
     * @dev User specifies exact iuput amount and query output amount.
     * @param src Currency key of token to sell. key of ETH is "ETH"
     * @param srcAmt  Amount of token to sell.
     * @param dst Currency key of token to buy.
     * @return Amount of token bought.
     */
    function inputPrice(bytes32 src, uint srcAmt, bytes32 dst) external view returns (uint) {
        UniswapExchangeInterface uniswapExchange = UniswapExchangeInterface(uniswapSethExchange);
        uint sEthAmt;
        if (src == ethCurrencyKey) {
            sEthAmt = uniswapExchange.getEthToTokenInputPrice(srcAmt);
            if (dst == sEthCurrencyKey) {
                return sEthAmt;
            }else {
                return _sTokenAmtRecvFromExchangeByToken(sEthAmt, sEthCurrencyKey, dst);
            }
        }else if (src == sEthCurrencyKey){
            if  (dst == ethCurrencyKey) {
                return uniswapExchange.getTokenToEthInputPrice(srcAmt);
            } else {
                return _sTokenAmtRecvFromExchangeByToken(srcAmt, sEthCurrencyKey, dst);
            }
        }else {
            if (dst == ethCurrencyKey){
                sEthAmt = _sTokenAmtRecvFromExchangeByToken(srcAmt, src, sEthCurrencyKey);
                return uniswapExchange.getTokenToEthInputPrice(sEthAmt);
            }else{
                return _sTokenAmtRecvFromExchangeByToken(srcAmt, src, dst);
            }
        }
    }

    /**
     * @notice Get ouput price
     * @dev User specifies exact output amount and query input amount.
     * @param src Currency key of token to sell. key of ETH is "ETH"
     * @param dst Currency key of token to buy.
     * @param dstAmt Amount of token to buy.
     * @return  Amount of token to sell.
     */
    function outputPrice(bytes32 src, bytes32 dst, uint dstAmt) external view returns (uint) {
        UniswapExchangeInterface uniswapExchange = UniswapExchangeInterface(uniswapSethExchange);
        uint sEthAmt;
        if (src == ethCurrencyKey) {
            if (dst == sEthCurrencyKey) {
                return uniswapExchange.getEthToTokenOutputPrice(dstAmt);
            }else {
                sEthAmt = _sTokenEchangedAmtToRecvByToken(dstAmt, dst, sEthCurrencyKey);
                return uniswapExchange.getEthToTokenOutputPrice(sEthAmt);
            }
        }else if (src == sEthCurrencyKey){
            if  (dst == ethCurrencyKey) {
                return uniswapExchange.getTokenToEthOutputPrice(dstAmt);
            } else {
                return _sTokenEchangedAmtToRecvByToken(dstAmt, dst, sEthCurrencyKey);
            }
        }else {
            if (dst == ethCurrencyKey){
                sEthAmt = uniswapExchange.getTokenToEthOutputPrice(dstAmt);
                return _sTokenEchangedAmtToRecvByToken(sEthAmt, sEthCurrencyKey, src);
            }else{
                return _sTokenEchangedAmtToRecvByToken(dstAmt, dst, src);
            }
        }
    }

    /**
     * @notice Convert sEth to ETH.
     * @dev User specifies exact sEth input and minimum ETH output.
     * @param sEthSold Amount of sEth sold.
     * @param minEth Minimum ETH purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased ETH, if ZERO, to msg.sender
     * @return ethAmt Amount of ETH bought.
     */
    function sEthToEthInput (uint sEthSold, uint minEth, uint deadline, address recipient) external returns (uint ethAmt) {
        require (deadline >= block.timestamp, "exceed deadline");
        require(IERC20(_synthsAddress(sEthCurrencyKey)).transferFrom (msg.sender, address(this), sEthSold), "token transfer failure");
        IERC20(_synthsAddress(sEthCurrencyKey)).approve(uniswapSethExchange, sEthSold);
        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
        ethAmt = useContract.tokenToEthTransferInput(sEthSold, minEth, deadline, _targetAddress(recipient));

        _checkBalance1(sEthCurrencyKey);
    }

    /**
     * @notice Convert sEth to ETH.
     * @dev User specifies maximum sEth input and exact ETH output.
     * @param ethBought Amount of ETH purchased.
     * @param maxSethSold Maximum sEth sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased ETH, if ZERO, to msg.sender
     * @return sEthAmt Amount of sEth sold.
     */
    function sEthToEthOutput (uint ethBought, uint maxSethSold, uint deadline, address recipient) external returns (uint sEthAmt) {
        require (deadline >= block.timestamp, "exceed deadline");
        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
        uint needSeth = useContract.getTokenToEthOutputPrice(ethBought);
        require (maxSethSold >= needSeth, "need more sEth");
        require(IERC20(_synthsAddress(sEthCurrencyKey)).transferFrom (msg.sender, address(this), needSeth), "token transfer failure");
        IERC20(_synthsAddress(sEthCurrencyKey)).approve(uniswapSethExchange, needSeth);
        sEthAmt = useContract.tokenToEthTransferOutput(ethBought, needSeth, deadline, _targetAddress(recipient));

        _checkBalance1(sEthCurrencyKey);
    }

    /**
     * @notice Convert ETH to other Synths token (not include sEth).
     * @dev User specifies exact ETH input (msg.value) and minimum Synths token output.
     * @param minToken Minimum Synths token purchased.
     * @param boughtCurrencyKey  currency key of Synths token to purchase
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased Synths token, if ZERO, to msg.sender
     * @return receivedAmt Amount of Synths token bought.
     */
    function ethToOtherTokenInput (
        uint minToken, 
        bytes32 boughtCurrencyKey, 
        uint deadline, 
        address recipient
    ) external payable returns (uint receivedAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
        ISynthetix synContract = ISynthetix(synthetix);

        require (boughtCurrencyKey != sEthCurrencyKey, "should use ethToSethInnput");

        // check provided eth is enough to buy minimum token and buy sEth from uniswap sEth exchange
        uint minsEth = _sTokenEchangedAmtToRecvByToken(minToken, boughtCurrencyKey, sEthCurrencyKey);
        uint sEthAmt = useContract.ethToTokenSwapInput.value(msg.value)(minsEth, deadline);
        receivedAmt = _sTokenAmtRecvFromExchangeByToken(sEthAmt, sEthCurrencyKey, boughtCurrencyKey);
        require (receivedAmt >= minToken, "need more ETH");

        // buy token from Synthetix exchange and make transfer
        require (synContract.exchange (sEthCurrencyKey, sEthAmt, boughtCurrencyKey, address(this)), "Synths token exchange failure");
        require (IERC20(_synthsAddress(boughtCurrencyKey)).transfer(_targetAddress(recipient), receivedAmt), "token tansfer failure");

        _checkBalance2(sEthCurrencyKey, boughtCurrencyKey);
    }

    /**
     * @notice Convert ETH to other Synths token (not include sEth).
     * @dev User specifies exact Synths token output and maximum ETH input (msg.value).
     * @param tokenBought Amount of Synths token purchased.
     * @param boughtCurrencyKey  currency key of Synths token to purchase
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased Synths token, if ZERO, to msg.sender
     * @return ethAmt Amount of ETH sold.
     */
    function ethToOtherTokenOutput (
        uint tokenBought, 
        bytes32 boughtCurrencyKey, 
        uint deadline, 
        address recipient
    ) external payable returns (uint ethAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
        ISynthetix synContract = ISynthetix(synthetix);
        
        require (boughtCurrencyKey != sEthCurrencyKey, "should use ethToSethOutput");

        //buy needed sEth from uniswap sEth exchange and refund extra ETH
        uint sEthAmt = _sTokenEchangedAmtToRecvByToken(tokenBought, boughtCurrencyKey, sEthCurrencyKey);
        ethAmt = useContract.ethToTokenSwapOutput.value(msg.value)(sEthAmt, deadline);
        if (msg.value > ethAmt){
            msg.sender.transfer(msg.value - ethAmt);
        }
        
        //buy token from Synthetix exchange and make tranfer
        require (synContract.exchange(sEthCurrencyKey, sEthAmt, boughtCurrencyKey, address(this)), "Synths token exchange failure");
        uint finallyGot = _sTokenAmtRecvFromExchangeByToken(sEthAmt, sEthCurrencyKey, boughtCurrencyKey);
        require (IERC20(_synthsAddress(boughtCurrencyKey)).transfer(_targetAddress(recipient), finallyGot), "token transer failure");

        _checkBalance2(sEthCurrencyKey, boughtCurrencyKey);
    }

    /**
     * @notice Convert other Synths token (not include sEth) to ETH.
     * @dev User specifies exact Synths token input and minimum ETH output.
     * @param srcKey currency key of Synths token sold
     * @param srcAmt Amount of Synths token sold.
     * @param minEth Minimum ETH purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased ETH, if ZERO, to msg.sender
     * @return ethAmt Amount of ETH bought.
     */
    function otherTokenToEthInput (
        bytes32 srcKey, 
        uint srcAmt, 
        uint minEth, 
        uint deadline, 
        address recipient
    ) external returns (uint ethAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
        ISynthetix synContract = ISynthetix(synthetix);

        require (srcKey != sEthCurrencyKey, "should use sEthToEthInput");
        
        //check provided token can buy minimum ETH and buy sEth from Synthetix exchange
        uint sEthAmtReceived = _sTokenAmtRecvFromExchangeByToken(srcAmt, srcKey, sEthCurrencyKey);
        require(IERC20(_synthsAddress(srcKey)).transferFrom (msg.sender, address(this), srcAmt), "token transer failure");
        require (synContract.exchange (srcKey, srcAmt, sEthCurrencyKey, address(this)), "Synths token exchange failure");
        
        //buy ETH from uniswap sETH exchange and make tranfer
        IERC20(_synthsAddress(sEthCurrencyKey)).approve(uniswapSethExchange, sEthAmtReceived);
        ethAmt = useContract.tokenToEthTransferInput(sEthAmtReceived, minEth, deadline, _targetAddress(recipient));

        _checkBalance2(sEthCurrencyKey, srcKey);
    }
        
    /**
     * @notice Convert other Synths token (not include sEth) to ETH.
     * @dev User specifies maximum Synths token input and exact ETH output.
     * @param ethBought Amount of ETH purchased.
     * @param srcKey currency key of Synths token sold
     * @param maxSrcAmt Maximum Synths token sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased ETH, if ZERO, to msg.sender
     * @return srcAmt Amount of Synths token sold.
     */
    function otherTokenToEthOutput (
        uint ethBought, 
        bytes32 srcKey, 
        uint maxSrcAmt, 
        uint deadline, 
        address recipient
    ) external returns (uint srcAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
        ISynthetix synContract = ISynthetix(synthetix);

        require (srcKey != sEthCurrencyKey, "should use sEthToEthOutput");

        // check provided token is enough to buy exact ETH and buy sEth from Uniswap sEth exchange
        uint sEthAmt = useContract.getTokenToEthOutputPrice(ethBought);
        srcAmt = _sTokenEchangedAmtToRecvByToken(sEthAmt, sEthCurrencyKey, srcKey);
        require (srcAmt <= maxSrcAmt, "needed more token");
        require(IERC20(_synthsAddress(srcKey)).transferFrom(msg.sender, address(this), srcAmt), "token tranfer failure");
        require (synContract.exchange(srcKey, srcAmt, sEthCurrencyKey, address(this)), "Synths token exchange failure");
        uint finallyGot = IERC20(_synthsAddress("sETH")).balanceOf(address(this));
        require (finallyGot >= sEthAmt, "Bought sETH less than needed sETH");

        // buy ETH from Uniswap sEth exchange
        IERC20(_synthsAddress("sETH")).approve(uniswapSethExchange, finallyGot);
        uint tokenSold = useContract.tokenToEthTransferOutput(ethBought, finallyGot, deadline, _targetAddress(recipient));
        if (finallyGot > tokenSold){
            IERC20(_synthsAddress("sETH")).transfer(msg.sender, finallyGot - tokenSold);
        }
        _checkBalance2(sEthCurrencyKey, srcKey);
    }

    /**
     * @notice Convert ETH to sEth.
     * @dev User specifies exact ETH input (msg.value) and minimum sEth output.
     * @param minSeth Minimum sEth purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased sEth, if ZERO, to msg.sender
     * @return sEthAmt Amount of sEth bought.
     */
    function ethToSethInput (uint minSeth, uint deadline, address recipient) external payable returns (uint sEthAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);

        sEthAmt = useContract.ethToTokenTransferInput.value(msg.value)(minSeth, deadline, _targetAddress(recipient));
        _checkBalance1(sEthCurrencyKey);
    }
   
    /**
     * @notice Convert ETH to sEth.
     * @dev User specifies exact sEth output and maximum ETH input (msg.value).
     * @param sethBought Amount of sEth purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased sEth, if ZERO, to msg.sender
     * @return ethAmt Amount of ETH sold.
     */
    function ethToSethOutput (uint sethBought, uint deadline, address recipient) external payable returns (uint ethAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);

        ethAmt = useContract.ethToTokenTransferOutput.value(msg.value)(sethBought, deadline, _targetAddress(recipient));
        if (msg.value > ethAmt){
            msg.sender.transfer(msg.value - ethAmt);
        }

        _checkBalance1(sEthCurrencyKey);
    }

    /**
     * @notice Convert Synths token to Synths token.
     * @dev User specifies exact input and minimum output.
     * @param srcKey currency key of Synths token sold
     * @param srcAmt Amount of Synths token sold.
     * @param dstKey currency key of Synths token purchased
     * @param minDstAmt Minumum Synths token purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased Synths token, if ZERO, to msg.sender
     * @return dstAmt Amount of Synths token purchased.
     */
    function sTokenToStokenInput (
        bytes32 srcKey, 
        uint srcAmt, 
        bytes32 dstKey, 
        uint minDstAmt, 
        uint deadline, 
        address recipient
    ) external returns (uint dstAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        ISynthetix synContract = ISynthetix(synthetix);
        require (srcKey != dstKey, "cannot exchange between same tokens");

        dstAmt = _sTokenAmtRecvFromExchangeByToken(srcAmt, srcKey, dstKey);
        require (dstAmt >= minDstAmt, "bought token less than minimum token");
        require(IERC20(_synthsAddress(srcKey)).transferFrom (msg.sender, address(this), srcAmt), "token transfer failure");
        require (synContract.exchange(srcKey, srcAmt, dstKey, address(this)), "Synths token exchange failure");
        require (IERC20(_synthsAddress(dstKey)).transfer(_targetAddress(recipient), dstAmt), "token transfer failure");
        _checkBalance2(srcKey, dstKey);
    }

    /**
     * @notice Convert Synths token to Synths token.
     * @dev User specifies maximum input and exact output.
     * @param srcKey currency key of Synths token sold
     * @param maxSrcAmt Maximum Synths token sold.
     * @param dstKey currency key of Synths token purchased
     * @param boughtDstAmt Amount of Synths token purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient Address to get purchased Synths token, if ZERO, to msg.sender
     * @return srcAmt Amount of Synths token sold.
     */
    function sTokenToStokenOutput (
        bytes32 srcKey, 
        uint maxSrcAmt, 
        bytes32 dstKey, 
        uint boughtDstAmt, 
        uint deadline, 
        address recipient
    ) external returns (uint srcAmt) {
        require (deadline >= block.timestamp, "exceed deadline");

        ISynthetix synContract = ISynthetix(synthetix);
        require (srcKey != dstKey, "cannot exchange between same tokens");

        srcAmt = _sTokenEchangedAmtToRecvByToken(boughtDstAmt, dstKey, srcKey);
        require (srcAmt <= maxSrcAmt, "needed more token");
        require(IERC20(_synthsAddress(srcKey)).transferFrom (msg.sender, address(this), srcAmt), "token transfer failure");
        require (synContract.exchange(srcKey, srcAmt, dstKey, address(this)), "Synths token exchange failure");
        uint finallyGot = _sTokenAmtRecvFromExchangeByToken(srcAmt, srcKey, dstKey);
        require (IERC20(_synthsAddress(dstKey)).transfer(_targetAddress(recipient), finallyGot), "token tranfer failure");
        _checkBalance2(srcKey, dstKey);
    }

    function _targetAddress(address recipient) internal view returns(address) {
        if (recipient == address(0)){
            return msg.sender;
        }else{
            return recipient;
        }
    }
    
    function _synthsAddress(bytes32 key) internal view returns (address) {
        ISynthetix synContract = ISynthetix(synthetix);
        return synContract.synths(key);
    }

    function _checkBalance1(bytes32 synToken) internal view {
        require(address(this).balance == 0, "ETH balance should be 0");
        require (IERC20(_synthsAddress(synToken)).balanceOf(address(this)) == 0, "Synths token balance should be 0");
    }
    
    function _checkBalance2(bytes32 synToken1, bytes32 synToken2) internal view {
        require(address(this).balance == 0, "ETH balance should be 0");
        require (IERC20(_synthsAddress(synToken1)).balanceOf(address(this)) == 0, "Synths token balance should be 0");
        require (IERC20(_synthsAddress(synToken2)).balanceOf(address(this)) == 0, "Synths token balance should be 0");
    }

    function _sTokenAmtRecvFromExchangeByToken (uint srcAmt, bytes32 srcKey, bytes32 dstKey) internal view returns (uint){
        IFeePool feePool = IFeePool(synFeePool);
        IExchangeRates synRatesContract = IExchangeRates(synRates);
        uint dstAmt = synRatesContract.effectiveValue(srcKey, srcAmt, dstKey);
        uint feeRate = feePool.exchangeFeeRate();
        return  dstAmt.multiplyDecimal(SafeDecimalMath.unit().sub(feeRate));
    }
    
    
    function _sTokenEchangedAmtToRecvByToken (uint receivedAmt, bytes32 receivedKey, bytes32 srcKey) internal view returns (uint) {
        IFeePool feePool = IFeePool(synFeePool);
        IExchangeRates synRatesContract = IExchangeRates(synRates);
        uint srcRate = synRatesContract.rateForCurrency(srcKey); 
        uint dstRate = synRatesContract.rateForCurrency(receivedKey);
        uint feeRate = feePool.exchangeFeeRate();
        
        uint step = SafeMath.mul(receivedAmt, dstRate);
        step = SafeMath.mul(step, SafeDecimalMath.unit());
        uint step2 = SafeMath.mul(SafeDecimalMath.unit().sub(feeRate), srcRate);
        uint result = SafeMath.div(step, step2);
        
        // two times of round of Synthetix contract exchange function need this compensation
        if (dstRate > srcRate){
            uint roundCompensationForOneDst = SafeMath.div(dstRate, srcRate) + 1;
            return roundCompensationForOneDst.divideDecimal(SafeDecimalMath.unit().sub(feeRate)) + result;
        }
        return result + 1 ;

    }
} 
