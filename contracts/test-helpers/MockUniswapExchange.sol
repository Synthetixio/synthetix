/* MockUniswapExchange.sol for AtmoicSynthetixUniswapConverter testing purposes.
 */
pragma solidity 0.4.25;
import "../interfaces/IERC20.sol";

contract MockUniswapExchange {

    address sEthAddress;

    // receive test ether
    function() external payable { 
    }
    
    function setSethAddress(address _sEthAddress) external {
        sEthAddress = _sEthAddress;
    }

    function ethToTokenTransferInput(uint minSeth, uint deadline, address target) external payable returns (uint){
        require(minSeth <= msg.value);
        IERC20(sEthAddress).transfer(target, msg.value);
        return (msg.value);
    }

    function tokenToEthTransferInput(uint sEthAmt, uint minEth, uint deadline, address target) external returns (uint) {
       require (minEth <= sEthAmt);
       IERC20(sEthAddress).transferFrom(msg.sender, address(this), sEthAmt);
       target.transfer(sEthAmt);
       return sEthAmt;
    }
    
    
    /*function getEthToTokenInputPrice(uint) external view returns (uint);
    function getEthToTokenOutputPrice(uint) external view returns (uint);
    function getTokenToEthInputPrice(uint) external view returns (uint);
    function getTokenToEthOutputPrice(uint) external view returns (uint);
    function ethToTokenSwapInput(uint, uint) external payable returns (uint);
    function ethToTokenTransferOutput(uint, uint, address) external payable returns (uint);
    function ethToTokenSwapOutput(uint, uint) external payable returns (uint);
    function tokenToEthTransferInput(uint, uint, uint, address) external returns (uint);
    function tokenToEthTransferOutput(uint, uint, uint, address) external returns (uint);
    function addLiquidity(uint, uint,uint) external payable returns(uint);*/
}
