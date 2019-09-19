pragma solidity ^0.5.7;

import "./Owned.sol";
import "./SafeDecimalMath.sol";

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

interface SynthetixInterface {
	function exchange(bytes32 srcKey, uint srcAmt, bytes32 dstKey, address dstAddr) external returns (bool);
	function synths(bytes32) external view returns (address);
}

interface SynthetixRatesInterface{
	function effectiveValue(bytes32 srcKey, uint srcAmt, bytes32 dstKey) external view returns (uint);
	function rateForCurrency(bytes32) external view returns (uint);
}

interface TokenInterface {
	function transfer(address, uint) external returns (bool);
	function approve(address, uint) external;
	function transferFrom(address, address, uint) external returns (bool);
	function balanceOf(address) external view returns (uint);
}

interface SynthetixFeePool{
	function amountReceivedFromTransfer(uint) external view returns (uint);
	function transferredAmountToReceive(uint) external view returns (uint);
	function amountReceivedFromExchange(uint) external view returns (uint);
	function exchangedAmountToReceive(uint) external view returns (uint);
	function exchangeFeeRate() external view returns (uint);
}

contract AtomicSynthetixUniswapConverter is Owned {
	using SafeMath for uint;
	using SafeDecimalMath for uint;

	//following are Rinkeby addresses
	address public uniswapSethExchange = 0x01e165a24B6C7DC2183d42891e529cc298D704Af; // Uniswap sEth Exchange
	address public synRates = 0x30A46E656CdcA6B401Ff043e1aBb151490a07ab0; //Synthetix Rates
	address public synthetix = 0xf258F97481fC1023feDFD098d3dF457987925435; //Synthetix
	address public synFeePool = 0x424C0AeFc4212379836f5aecab2A6962a28725DD;   //Synthetix FeePool
	bytes32 sEthCurrencyKey = 'sETH';
	
	constructor(address _owner)
		Owned(_owner)
		public
	{

	}
	//to recieve refund from uniswap
	function() external payable { 
		require(msg.sender == uniswapSethExchange);
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
	
	function inputPrice(bytes32 src, uint srcAmt, bytes32 dst) external view returns (uint) {
		UniswapExchangeInterface uniswapExchange = UniswapExchangeInterface(uniswapSethExchange);
		if (src == 'ETH') {
			uint sEthAmt = uniswapExchange.getEthToTokenInputPrice(srcAmt);
			if (dst == 'sETH') {
				return sEthAmt;
			}else {
				return _sTokenAmtRecvFromExchangeByToken(sEthAmt, sEthCurrencyKey, dst);
			}
		}else if (src == 'sETH'){
			if  (dst == 'ETH') {
				return uniswapExchange.getTokenToEthInputPrice(srcAmt);
			} else {
				return _sTokenAmtRecvFromExchangeByToken(srcAmt, sEthCurrencyKey, dst);
			}
		}else {
			if (dst == 'ETH'){
				uint sEthAmt = _sTokenAmtRecvFromExchangeByToken(srcAmt, src, sEthCurrencyKey);
				return uniswapExchange.getTokenToEthInputPrice(sEthAmt);
			}else{
				return _sTokenAmtRecvFromExchangeByToken(srcAmt, src, dst);
			}
		}
	}

	function outputPrice(bytes32 src, bytes32 dst, uint dstAmt) external view returns (uint) {
		UniswapExchangeInterface uniswapExchange = UniswapExchangeInterface(uniswapSethExchange);
		if (src == 'ETH') {
			if (dst == 'sETH') {
				return uniswapExchange.getEthToTokenOutputPrice(dstAmt);
			}else {
				uint sEthAmt = _sTokenEchangedAmtToRecvByToken(dstAmt, dst, sEthCurrencyKey);
				return uniswapExchange.getEthToTokenOutputPrice(sEthAmt);
			}
		}else if (src == 'sETH'){
			if  (dst == 'ETH') {
				return uniswapExchange.getTokenToEthOutputPrice(dstAmt);
			} else {
				return _sTokenEchangedAmtToRecvByToken(dstAmt, dst, sEthCurrencyKey);
			}
		}else {
			if (dst == 'ETH'){
				uint sEthAmt = uniswapExchange.getTokenToEthOutputPrice(dstAmt);
				return _sTokenEchangedAmtToRecvByToken(sEthAmt, sEthCurrencyKey, src);
			}else{
				return _sTokenEchangedAmtToRecvByToken(dstAmt, dst, src);
			}
		}
	}

	function sEthToEthInput (uint sEthSold, uint minEth, uint deadline, address recipient) external returns (uint ethAmt) {
		require (deadline >= block.timestamp);
		require(TokenInterface(_synthsAddress(sEthCurrencyKey)).transferFrom (msg.sender, address(this), sEthSold));
		TokenInterface(_synthsAddress(sEthCurrencyKey)).approve(uniswapSethExchange, sEthSold);
		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
		ethAmt = useContract.tokenToEthTransferInput(sEthSold, minEth, deadline, _targetAddress(recipient));

		_checkBalance1(sEthCurrencyKey);
	}

	function sEthToEthOutput (uint ethBought, uint maxSethSold, uint deadline, address recipient) external returns (uint sEthAmt) {
		require (deadline >= block.timestamp);
		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
		uint needSeth = useContract.getTokenToEthOutputPrice(ethBought);
		require (maxSethSold >= needSeth);
		require(TokenInterface(_synthsAddress(sEthCurrencyKey)).transferFrom (msg.sender, address(this), needSeth));
		TokenInterface(_synthsAddress(sEthCurrencyKey)).approve(uniswapSethExchange, needSeth);
		sEthAmt = useContract.tokenToEthTransferOutput(ethBought, needSeth, deadline, _targetAddress(recipient));

		_checkBalance1(sEthCurrencyKey);
	}

	function ethToOtherTokenInput (uint minToken, bytes32 boughtCurrencyKey, uint deadline, address recipient) external payable returns (uint) {
		require (deadline >= block.timestamp);

		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
		SynthetixInterface synContract = SynthetixInterface(synthetix);

		uint minsEth = _sTokenEchangedAmtToRecvByToken(minToken, boughtCurrencyKey, sEthCurrencyKey);
		uint sEthAmt = useContract.ethToTokenSwapInput.value(msg.value)(minsEth, deadline);
		uint receivedAmt = _sTokenAmtRecvFromExchangeByToken(sEthAmt, sEthCurrencyKey, boughtCurrencyKey);
		require (receivedAmt >= minToken);
		require (synContract.exchange (sEthCurrencyKey, sEthAmt, boughtCurrencyKey, address(this)));
		require (TokenInterface(_synthsAddress(boughtCurrencyKey)).transfer(_targetAddress(recipient), receivedAmt));

		_checkBalance2(sEthCurrencyKey, boughtCurrencyKey);
		return receivedAmt;
	}

	function ethToOtherTokenOutput (uint tokenBought, bytes32 boughtCurrencyKey, uint deadline, address recipient) external payable returns (uint) {
		require (deadline >= block.timestamp);

		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
		SynthetixInterface synContract = SynthetixInterface(synthetix);

		uint sEthAmt = _sTokenEchangedAmtToRecvByToken(tokenBought, boughtCurrencyKey, sEthCurrencyKey);
		uint ethAmt = useContract.ethToTokenSwapOutput.value(msg.value)(sEthAmt, deadline);
		if (msg.value > ethAmt){
			msg.sender.transfer(msg.value - ethAmt);
		} 
		TokenInterface(_synthsAddress('sETH')).approve(synthetix, sEthAmt);
		require (synContract.exchange(sEthCurrencyKey, sEthAmt, boughtCurrencyKey, address(this)));
		uint finallyGot = _sTokenAmtRecvFromExchangeByToken(sEthAmt, sEthCurrencyKey, boughtCurrencyKey);
		require (TokenInterface(_synthsAddress(boughtCurrencyKey)).transfer(_targetAddress(recipient), finallyGot));

		_checkBalance2(sEthCurrencyKey, boughtCurrencyKey);
		return ethAmt;
	}

	function otherTokenToEthInput (bytes32 srcKey, uint srcAmt, uint minEth, uint deadline, address recipient) external returns (uint) {
		require (deadline >= block.timestamp);

		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
		SynthetixInterface synContract = SynthetixInterface(synthetix);
		uint sEthAmtReceived = _sTokenAmtRecvFromExchangeByToken(srcAmt, srcKey,sEthCurrencyKey);
		require(TokenInterface(_synthsAddress(srcKey)).transferFrom (msg.sender, address(this), srcAmt));
		TokenInterface(_synthsAddress(srcKey)).approve(synthetix, srcAmt);
		require (synContract.exchange (srcKey, srcAmt, sEthCurrencyKey, address(this)));
		
		TokenInterface(_synthsAddress(sEthCurrencyKey)).approve(uniswapSethExchange, sEthAmtReceived);
		uint ethAmt = useContract.tokenToEthTransferInput(sEthAmtReceived, minEth, deadline, _targetAddress(recipient));

		_checkBalance2(sEthCurrencyKey, srcKey);
		return ethAmt;
	}
		
	function otherTokenToEthOutput (uint ethBought, bytes32 srcKey, uint maxSrcAmt, uint deadline, address recipient) external returns (uint) {
		require (deadline >= block.timestamp);

		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);
		SynthetixInterface synContract = SynthetixInterface(synthetix);

		uint sEthAmt = useContract.getTokenToEthOutputPrice(ethBought);
		uint srcAmt = _sTokenEchangedAmtToRecvByToken(sEthAmt, sEthCurrencyKey, srcKey);
		srcAmt = srcAmt;
		require (srcAmt <= maxSrcAmt);

		require(TokenInterface(_synthsAddress(srcKey)).transferFrom(msg.sender, address(this), srcAmt));
		TokenInterface(_synthsAddress(srcKey)).approve(synthetix, srcAmt);
		require (synContract.exchange(srcKey, srcAmt, sEthCurrencyKey, address(this)));
		uint finallyGot = TokenInterface(_synthsAddress('sETH')).balanceOf(address(this));
		TokenInterface(_synthsAddress('sETH')).approve(uniswapSethExchange, finallyGot);
		require (finallyGot >= sEthAmt, 'Bought sETH less than needed sETH');
		uint tokenSold = useContract.tokenToEthTransferOutput(ethBought, finallyGot, deadline, _targetAddress(recipient));
		if (finallyGot > tokenSold){
			TokenInterface(_synthsAddress('sETH')).transfer(msg.sender, finallyGot - tokenSold);
		}
		_checkBalance2(sEthCurrencyKey, srcKey);

		return srcAmt;
	}

	function ethToSethInput (uint minSeth, uint deadline, address recipient) external payable returns (uint) {
		require (deadline >= block.timestamp);

		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);

		uint sEthAmt = useContract.ethToTokenTransferInput.value(msg.value)(minSeth, deadline, _targetAddress(recipient));
		_checkBalance1(sEthCurrencyKey);

		return sEthAmt;
	}
   
   	function ethToSethOutput (uint sethBought, uint deadline, address recipient) external payable returns (uint ethAmt) {
		require (deadline >= block.timestamp);

		UniswapExchangeInterface useContract = UniswapExchangeInterface(uniswapSethExchange);

		ethAmt = useContract.ethToTokenTransferOutput.value(msg.value)(sethBought, deadline, _targetAddress(recipient));
		msg.sender.transfer(msg.value - ethAmt);

		_checkBalance1(sEthCurrencyKey);
	}

	function sTokenToStokenInput (bytes32 srcKey, uint srcAmt, bytes32 dstKey, uint minDstAmt, uint deadline, address recipient) external returns (uint) {
		require (deadline >= block.timestamp);

		SynthetixInterface synContract = SynthetixInterface(synthetix);
		uint dstAmt = _sTokenAmtRecvFromExchangeByToken(srcAmt, srcKey, dstKey);
		require (dstAmt >= minDstAmt);
		require(TokenInterface(_synthsAddress(srcKey)).transferFrom (msg.sender, address(this), srcAmt));
		TokenInterface(_synthsAddress(srcKey)).approve(synthetix, srcAmt);
		require (synContract.exchange(srcKey, srcAmt, dstKey, address(this)));
		require (TokenInterface(_synthsAddress(dstKey)).transfer(_targetAddress(recipient), dstAmt));
		_checkBalance2(srcKey, dstKey);
		return dstAmt;
	}

	function sTokenToStokenOutput (bytes32 srcKey, uint maxSrcAmt, bytes32 dstKey, uint boughtDstAmt, uint deadline, address recipient) external returns (uint) {
		require (deadline >= block.timestamp);

		SynthetixInterface synContract = SynthetixInterface(synthetix);
		uint srcAmt = _sTokenEchangedAmtToRecvByToken(boughtDstAmt, dstKey, srcKey);
		require (srcAmt <= maxSrcAmt);

		require(TokenInterface(_synthsAddress(srcKey)).transferFrom (msg.sender, address(this), srcAmt));
		TokenInterface(_synthsAddress(srcKey)).approve(synthetix, srcAmt);
		require (synContract.exchange(srcKey, srcAmt, dstKey, address(this)));
		uint finallyGot = _sTokenAmtRecvFromExchangeByToken(srcAmt, srcKey, dstKey);

		require (TokenInterface(_synthsAddress(dstKey)).transfer(_targetAddress(recipient), finallyGot));
		_checkBalance2(srcKey, dstKey);
		return srcAmt;
	}

	function _targetAddress(address recipient) internal view returns(address) {
		if (recipient == address(0)){
			return msg.sender;
		}else{
			return recipient;
		}
	}
	
	function _synthsAddress(bytes32 key) internal view returns (address) {
		SynthetixInterface synContract = SynthetixInterface(synthetix);
		return synContract.synths(key);
	}

	function _checkBalance1(bytes32 synToken) internal view {
		require(address(this).balance == 0);
		require (TokenInterface(_synthsAddress(synToken)).balanceOf(address(this)) == 0);
	}
	
	function _checkBalance2(bytes32 synToken1, bytes32 synToken2) internal view {
		require(address(this).balance == 0);
		require (TokenInterface(_synthsAddress(synToken1)).balanceOf(address(this)) == 0);
		require (TokenInterface(_synthsAddress(synToken2)).balanceOf(address(this)) == 0);
	}

	function _sTokenAmtRecvFromExchangeByToken (uint srcAmt, bytes32 srcKey, bytes32 dstKey) internal view returns (uint){
		SynthetixFeePool feePool = SynthetixFeePool(synFeePool);
		SynthetixRatesInterface synRatesContract = SynthetixRatesInterface(synRates);
		uint dstAmt = synRatesContract.effectiveValue(srcKey, srcAmt, dstKey);
		uint feeRate = feePool.exchangeFeeRate();
		return  dstAmt.multiplyDecimal(SafeDecimalMath.unit().sub(feeRate));
	}
	
	
	function _sTokenEchangedAmtToRecvByToken (uint receivedAmt, bytes32 receivedKey, bytes32 srcKey) internal view returns (uint) {
		SynthetixFeePool feePool = SynthetixFeePool(synFeePool);
		SynthetixRatesInterface synRatesContract = SynthetixRatesInterface(synRates);
		uint srcRate = synRatesContract.rateForCurrency(srcKey); 
		uint dstRate = synRatesContract.rateForCurrency(receivedKey);
		uint feeRate = feePool.exchangeFeeRate();
		
		uint step = SafeMath.mul(receivedAmt, dstRate);
		step = SafeMath.mul(step, SafeDecimalMath.unit());
		uint step2 = SafeMath.mul(SafeDecimalMath.unit().sub(feeRate), srcRate);
		uint result = SafeMath.div(step, step2);

		if (dstRate > srcRate){
			uint roundCompensation = SafeMath.div(dstRate, srcRate) + 1;
			return roundCompensation.divideDecimal(SafeDecimalMath.unit().sub(feeRate)) + result;
		}
		return result + 1 ;

	}
} 