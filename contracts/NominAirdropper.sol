/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       NominAirdropper.sol
version:    1.0
author:     Kevin Brown

date:       2018-07-09

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract was adapted for use by the Havven project from the
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

pragma solidity 0.4.24;

import "contracts/Owned.sol";
import "contracts/Nomin.sol";

contract NominAirdropper is Owned {
    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor
     * @param _owner The owner of this contract.
     */
    constructor (address _owner) 
        Owned(_owner)
    {}

    /**
     * @notice Multisend airdrops tokens to an array of destinations.
     * @dev The fee rate is in decimal format, with UNIT being the value of 100%.
     */
    function multisend(address tokenAddress, address[] destinations, uint256[] values)
        external
        onlyOwner
    {
        // Protect against obviously incorrect calls.
        require(destinations.length == values.length, "Destinations and values must have the same length");

        // Loop through each destination and perform the transfer.
        uint256 i = 0;
        
        while (i < destinations.length) {
            Nomin(tokenAddress).transferSenderPaysFee(destinations[i], values[i]);
            i += 1;
        }
    }
}