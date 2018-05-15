/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       EmitterAssembly.sol
version:    1.1
author:     Martin Zdarsky-Jones

date:       2018-05-15

checked:
approved:

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

An Emitter contract, to be inherited by other contracts.
The events are separated from the actual contract so that they
could be emitted from the proxy in later implementations.

-----------------------------------------------------------------
*/

pragma solidity 0.4.23;

import "./Proxyable.sol";

/**
 * @title A contract holding convenience methods for emitting events.
 */
contract Emitter is Proxyable {

    /*** CONSTRUCTOR ***/
    constructor(address _proxy, address _owner)
        Proxyable(_proxy, _owner)
        public
    {

    }

    function emitProxyChanged(address proxyAddress)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store proxyAddress into output payload
            mstore(add(_ptr, 0x20), proxyAddress)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("ProxyChanged(address)");
        emitOnProxy(_output, methodsignature);
    }

    function emitAccountFrozen(address target, address targetIndex, uint256 _balance)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x40)
        // store target into output payload
            mstore(add(_ptr, 0x20), target)
        // store balance into output payload
            mstore(add(_ptr, 0x40), _balance)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("AccountFrozen(address,address,uint256)");
        bytes32 topic2 = bytes32(targetIndex);
        emitOnProxy(_output, methodsignature, topic2);
    }

    function emitAccountUnfrozen(address target, address targetIndex)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store target into output payload
            mstore(add(_ptr, 0x20), target)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("AccountUnfrozen(address,address)");
        bytes32 topic2 = bytes32(targetIndex);
        emitOnProxy(_output, methodsignature, topic2);
    }

    function emitApproval(address owner, address spender, uint256 value)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store value into output payload
            mstore(add(_ptr, 0x20), value)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("Approval(address,address,uint256)");
        bytes32 topic2 = bytes32(owner);
        bytes32 topic3 = bytes32(spender);
        emitOnProxy(_output, methodsignature, topic2, topic3);
    }

    function emitAssociatedContractUpdated(address _associatedContract)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store _associatedContract into output payload
            mstore(add(_ptr, 0x20), _associatedContract)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("AssociatedContractUpdated(address)");
        emitOnProxy(_output, methodsignature);
    }

    function emitBurned(address target, uint256 amount)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x40)
        // store target into output payload
            mstore(add(_ptr, 0x20), target)
        // store amount into output payload
            mstore(add(_ptr, 0x40), amount)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("Burned(address,uint256)");
        emitOnProxy(_output, methodsignature);
    }

    function emitCourtUpdated(address newCourt)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store newCourt into output payload
            mstore(add(_ptr, 0x20), newCourt)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("CourtUpdated(address)");
        emitOnProxy(_output, methodsignature);
    }

    function emitFeeAuthorityUpdated(address feeAuthority)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store feeAuthority into output payload
            mstore(add(_ptr, 0x20), feeAuthority)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("CourtUpdated(address)");
        emitOnProxy(_output, methodsignature);
    }

    function emitFeePeriodDurationUpdated(uint256 duration)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store duration into output payload
            mstore(add(_ptr, 0x20), duration)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("FeePeriodDurationUpdated(uint256)");
        emitOnProxy(_output, methodsignature);
    }

    function emitFeePeriodRollover(uint256 _timestamp)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store timestamp into output payload
            mstore(add(_ptr, 0x20), _timestamp)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("FeePeriodRollover(uint256)");
        emitOnProxy(_output, methodsignature);
    }

    function emitFeesDonated(address donor, address donorIndex, uint256 value)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x40)
        // store donor into output payload
            mstore(add(_ptr, 0x20), donor)
        // store value into output payload
            mstore(add(_ptr, 0x40), value)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("FeesDonated(address,address,uint256)");
        bytes32 topic2 = bytes32(donorIndex);
        emitOnProxy(_output, methodsignature, topic2);
    }

    function emitFeesWithdrawn(address account, address accountIndex, uint256 value)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x40)
        // store account into output payload
            mstore(add(_ptr, 0x20), account)
        // store value into output payload
            mstore(add(_ptr, 0x40), value)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("FeesWithdrawn(address,address,uint256)");
        bytes32 topic2 = bytes32(accountIndex);
        emitOnProxy(_output, methodsignature, topic2);
    }

    function emitHavvenUpdated(address newHavven)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store account into output payload
            mstore(add(_ptr, 0x20), newHavven)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("HavvenUpdated(address)");
        emitOnProxy(_output, methodsignature);
    }

    function emitIssued(address target, uint256 amount)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x40)
        // store target into output payload
            mstore(add(_ptr, 0x20), target)
        // store amount into output payload
            mstore(add(_ptr, 0x40), amount)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("Issued(address,uint256)");
        emitOnProxy(_output, methodsignature);
    }

    function emitOracleUpdated(address new_oracle)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store new_oracle into output payload
            mstore(add(_ptr, 0x20), new_oracle)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("OracleUpdated(address)");
        emitOnProxy(_output, methodsignature);
    }

    function emitPriceUpdated(uint256 price)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store price into output payload
            mstore(add(_ptr, 0x20), price)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("PriceUpdated(uint256)");
        emitOnProxy(_output, methodsignature);
    }

    function emitStateUpdated(address newState)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store newState into output payload
            mstore(add(_ptr, 0x20), newState)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("StateUpdated(address)");
        emitOnProxy(_output, methodsignature);
    }

    function emitTransfer(address from, address to, uint256 value)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store value into output payload
            mstore(add(_ptr, 0x20), value)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("StateUpdated(address)");
        bytes32 topic2 = bytes32(from);
        bytes32 topic3 = bytes32(to);
        emitOnProxy(_output, methodsignature, topic2, topic3);
    }

    function emitTransferFeePaid(address account, uint256 value)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store value into output payload
            mstore(add(_ptr, 0x20), value)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("StateUpdated(address)");
        bytes32 topic2 = bytes32(account);
        emitOnProxy(_output, methodsignature, topic2);
    }

    function emitTransferFeeRateUpdated(uint256 newFeeRate)
        internal
    {
        bytes memory _output;
        assembly {
        // get pointer for free memory to store data to
            let _ptr := add(mload(0x40), 0x20)
        // Load the length of output bytes to the head of the new bytes array
            mstore(_ptr, 0x20)
        // store newFeeRate into output payload
            mstore(add(_ptr, 0x20), newFeeRate)
        // assign _output the the newly created bytes
            _output := _ptr
        }

        // the main topic is always event signature hashed into keccak256
        bytes32 methodsignature = keccak256("TransferFeeRateUpdated(uint256)");
        emitOnProxy(_output, methodsignature);
    }

    /* ========== PRIVATE FUNCTIONS ========== */
    function emitOnProxy(bytes stream)
        private
    {
        proxy.emitOnProxy(stream);
    }

    function emitOnProxy(bytes stream, bytes32 topic1)
        private
    {
        proxy.emitOnProxy(stream, topic1);
    }

    function emitOnProxy(bytes stream, bytes32 topic1, bytes32 topic2)
        private
    {
        proxy.emitOnProxy(stream, topic1, topic2);
    }

    function emitOnProxy(bytes stream, bytes32 topic1, bytes32 topic2, bytes32 topic3)
        private
    {
        proxy.emitOnProxy(stream, topic1, topic2, topic3);
    }

    function emitOnProxy(bytes stream, bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes32 topic4)
        private
    {
        proxy.emitOnProxy(stream, topic1, topic2, topic3, topic4);
    }


    /* ========== EVENTS ========== */

    event AccountFrozen(address target, address indexed targetIndex, uint balance);
    event AccountUnfrozen(address target, address indexed targetIndex);
    event Approval(address indexed owner, address indexed spender, uint value);
    event AssociatedContractUpdated(address _associatedContract);
    event Burned(address target, uint amount);
    event CourtUpdated(address newCourt);
    event FeeAuthorityUpdated(address feeAuthority);
    event FeePeriodDurationUpdated(uint duration);
    event FeePeriodRollover(uint timestamp);
    event FeesDonated(address donor, address indexed donorIndex, uint value);
    event FeesWithdrawn(address account, address indexed accountIndex, uint value);
    event HavvenUpdated(address newHavven);
    event Issued(address target, uint amount);
    event OracleUpdated(address new_oracle);
    event PriceUpdated(uint price);
    event ProxyChanged(address proxyAddress);
    event StateUpdated(address newState);
    event Transfer(address indexed from, address indexed to, uint value);
    event TransferFeePaid(address indexed account, uint value);
    event TransferFeeRateUpdated(uint newFeeRate);

}
