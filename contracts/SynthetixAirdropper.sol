/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       SynthetixAirdropper.sol
version:    1.0
author:     Jackson Chan
            Clinton Ennis
date:       2019-08-02

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract was adapted for use by the Synthetix project from the
airdropper contract that OmiseGO created here:
https://github.com/omisego/airdrop/blob/master/contracts/Airdropper.sol

It exists to save gas costs per transaction that'd otherwise be
incurred running airdrops individually.

Original license below.

-----------------------------------------------------------------

Copyright 2017 OmiseGO Pte Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
pragma solidity 0.4.25;

import "./Owned.sol";
import "./interfaces/ISynthetix.sol";


contract SynthetixAirdropper is Owned {
    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor
     * @param _owner The owner of this contract.
     */
    constructor(address _owner) public Owned(_owner) {}

    /**
     * @notice Multisend airdrops tokens to an array of destinations.
     */
    function multisend(address _tokenAddress, address[] _destinations, uint256[] _values) external onlyOwner {
        // Protect against obviously incorrect calls.
        require(_destinations.length == _values.length, "Dests and values mismatch");

        // Loop through each destination and perform the transfer.
        uint256 i = 0;
        while (i < _destinations.length) {
            ISynthetix(_tokenAddress).transfer(_destinations[i], _values[i]);
            i += 1;
        }
    }

    // fallback function for ether sent accidentally to contract
    function() external payable {
        owner.transfer(msg.value);
    }
}
