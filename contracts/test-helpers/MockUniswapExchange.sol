/* MockUniswapExchange.sol for AtmoicSynthetixUniswapConverter testing purposes.
 */
pragma solidity 0.4.25;
import "../interfaces/IERC20.sol";


contract MockUniswapExchange {

    address sEthAddress;

    // receive test ether
    function() external payable { 
    }

    // just return value same with input 

    function setSethAddress(address _sEthAddress) external {
        sEthAddress = _sEthAddress;
    }

    function ethToTokenTransferInput(uint minSeth, uint deadline, address target) external payable returns (uint) {
        require(minSeth <= msg.value);
        IERC20(sEthAddress).transfer(target, msg.value);
        return (msg.value);
    }

    function ethToTokenTransferOutput(uint toBought, uint deadline, address target) external payable returns (uint)   {
        require (toBought <= msg.value);
        IERC20(sEthAddress).transfer(target, toBought);
        return (toBought);
    }

    function ethToTokenSwapOutput(uint toBought, uint deadline) external payable returns (uint){
        require (toBought <= msg.value);
        IERC20(sEthAddress).transfer(msg.sender, toBought);
        return (toBought);
    }
    
    function getEthToTokenInputPrice(uint input) external view returns (uint){
        return input;
    }

    function getEthToTokenOutputPrice(uint output) external view returns (uint){
        return output; 
    }

    function getTokenToEthInputPrice(uint input) external view returns (uint){
        return input;
    }

    function getTokenToEthOutputPrice(uint output) external view returns (uint){
        return output;
    }

    function ethToTokenSwapInput(uint minSeth, uint deadline) external payable returns (uint){
        require(minSeth <= msg.value);
        IERC20(sEthAddress).transfer(msg.sender, msg.value);
        return (msg.value);
    }

    function tokenToEthTransferInput(uint sEthAmt, uint minEth, uint deadline, address target) external returns (uint) {
        require (minEth <= sEthAmt);
        IERC20(sEthAddress).transferFrom(msg.sender, address(this), sEthAmt);
        target.transfer(sEthAmt);
        return sEthAmt;
    }
    
    function tokenToEthTransferOutput(uint maxSethAmt, uint ethAmt, uint deadline, address target) external returns (uint){
        require (maxSethAmt <= ethAmt);
        IERC20(sEthAddress).transferFrom(msg.sender, address(this), ethAmt);
        target.transfer(ethAmt);
        return ethAmt;
    }
}
