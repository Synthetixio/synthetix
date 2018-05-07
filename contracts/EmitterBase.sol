/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       EmitterBase.sol
version:    1.0
author:     Martin Zdarsky-Jones

date:       2018-5-4

checked:
approved:

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract deals with the problem of emiting events behing a proxy contract.
If a proxy invokes a call on contract which emits an event.
That event should originate from proxy and not the actual underlying contract.
This contract provides convenience methods for the contract to emit event back on the proxy.
Example usage, for example we have this definition

event MyEvent(string _string, uint256 _nr);

The usage of this contract is to create a convenience method like this:

function emitMyEvent(string memory _string, uint256 _nr)
    internal
  {
    EventData memory data = createEventData("MyEvent(string,uint256)", 40);
    addString(data, _string, false);
    addUint256(data, _nr, false);
    emitOnProxy(data);
  }

 A developer then can write
 emitMyEvent("I am a long long test string", 42);
 instead of

 emit MyEvent("I am a long long test string", 42);

-----------------------------------------------------------------
*/

pragma solidity ^0.4.23;


import "contracts/Proxyable.sol";

contract EmitterBase is Proxyable {

    /*** CONSTRUCTOR ***/
    constructor(address _owner)
        Proxyable(_owner)
        public
    {

    }

    /*
     * This structure hold data for all parameters and topic of an event.
     * It also holds information of how much data is stored there.
     */
    struct EventData {
        uint topicsIndex;
        uint dataIndex;
        uint payloadSize;
        bytes32[] topics;
        EventDataItem[] items;
    }

    /*
     * This struct represents one event parameter of any kind (uint, string, address, ...)
     */
    struct EventDataItem {
        uint size;
        bool isSplitPayload;
        bytes32[] payload;
    }

    /*
     * Once the data structure is filled with parameters,
     * this method will construct the event data payload and will pass it
     * on proxy along with event topics.
     */
    function emitOnProxy(EventData memory data)
        internal
    {
        bytes memory stream = buildData(data);
        if (data.topicsIndex == 0) {
            proxy.emitOnProxy(stream);
            return;
        }
        bytes32 topic1 = data.topics[0];
        if (data.topicsIndex == 1) {
            proxy.emitOnProxy(stream, topic1);
            return;
        }
        bytes32 topic2 = data.topics[1];
        if (data.topicsIndex == 2) {
            proxy.emitOnProxy(stream, topic1, topic2);
            return;
        }
        bytes32 topic3 = data.topics[2];
        if (data.topicsIndex == 3) {
            proxy.emitOnProxy(stream, topic1, topic2, topic3);
            return;
        }
        bytes32 topic4 = data.topics[3];
        if (data.topicsIndex == 4) {
            proxy.emitOnProxy(stream, topic1, topic2, topic3, topic4);
            return;
        }
    }

    /*
     * This method creates data structure for building up data payload for an event.
     * methodsignature determines event type, i.e. "MyEvent(string,uint256)"
     * maxBuffer value must be big enough to store all parameters.
     */
    function createEventData(string memory methodSignature, uint256 maxBuffer)
        internal
        pure
        returns(EventData)
    {
        EventData memory data = EventData(0, 0, 0, new bytes32[](4), new EventDataItem[](maxBuffer));
        addString(data, methodSignature, true);
        return data;
    }

    /*
     * This method adds uint as an event parameter
     */
    function addUint256(EventData memory data, uint256 value, bool isIndexed)
        internal
        pure
    {
        if (isIndexed) {
            addTopic(data, bytes32(value));
            return;
        }
        bytes32[] memory _output = new bytes32[](1);
        _output[0]=bytes32(value);
        EventDataItem memory item = EventDataItem(1, false, _output);
        addDataItem(data, item);
    }

    /*
     * This method adds address as an event parameter
     */
    function addAddress(EventData memory data, address value, bool isIndexed)
        internal
        pure
    {
        bytes32[] memory _output = new bytes32[](1);
        assembly {
            mstore(add(_output, 32), value)
        }
        if (isIndexed) {
            addTopic(data, _output[0]);
            return;
        }
        EventDataItem memory item = EventDataItem(1, false, _output);
        addDataItem(data, item);
    }

    /*
     * Adding string is fairly similar to adding bytes, therefore we reuse addBytes method.
     */
    function addString(EventData memory data, string memory value, bool isIndexed)
        internal
        pure
    {
        if (isIndexed) {
            addTopic(data, keccak256(value));
            return;
        }
        bytes memory _input = bytes(value);
        addBytes(data, _input, false);
    }

    function addBytes(EventData memory data, bytes memory value, bool isIndexed)
        internal
        pure
    {
        if (isIndexed) {
            addTopic(data, keccak256(value));
            return;
        }
        uint256 stack_size = value.length / 32;
        if(value.length % 32 > 0) stack_size++;
        stack_size++;//adding because of 32 first bytes memory as the length
        bytes32[] memory _output = new bytes32[](stack_size);
        assembly {
            let _offst := 32
            for
            { let index := 0 }
            lt(index,stack_size)
            { index := add(index ,1) }
            {
                mstore(add(_output, _offst), mload(add(value,mul(index,32))))
                _offst := add(_offst , 32)
            }
        }

        EventDataItem memory item = EventDataItem(stack_size, true, _output);
        addDataItem(data, item);
    }


    /*** PRIVATE PART ***/

    function addDataItem(EventData memory data, EventDataItem memory item)
        private
        pure
    {
        data.items[data.dataIndex] = item;
        data.dataIndex++;
        data.payloadSize+=item.size;
        if (item.isSplitPayload) {
            data.payloadSize++;
        }
    }

    /*
     * Convert data structure into bytes
     */
    function buildData(EventData memory data)
        private
        pure
        returns (bytes)
    {
        if (data.dataIndex == 0) {
            return new bytes(0);
        }
        uint offset = 32;
        // nextFreeSlot is the pointer to where you can store additional values
        // of a type. For example string type is stored in several bytes32 slots.
        // The first 32 bytes just point to where the actual strung will be located.
        uint nextFreeSlot = data.dataIndex * 32;
        uint size = data.payloadSize * 32;
        bytes memory output = new bytes(size);
        for (uint index=0; index<data.dataIndex; index++) {
            EventDataItem memory item = data.items[index];
            if (item.isSplitPayload) {
                //This type is split into two sections. we need to store to current
                //slot a value of a poiter to where the second section will be stored.
                uint currentSlot = index * 32 + offset;
                assembly {
                    mstore(add(output, currentSlot), nextFreeSlot)
                }
                nextFreeSlot = nextFreeSlot + (item.size * 32);
            } else {
                //This is a simple type which uses 32 bytes only. Simply store it
                // into the stream to a current position.
                bytes32 firstPayloadSlot = item.payload[0];
                currentSlot = index * 32 + offset;
                assembly {
                    mstore(add(output, currentSlot), add(firstPayloadSlot, 0))
                }
            }
        }

        currentSlot = (data.dataIndex-1) * 32 + offset;
        for (index=0; index<data.dataIndex; index++) {
            item = data.items[index];
            if (item.isSplitPayload) {
                for (uint nr=0; nr<item.size; nr++) {
                    bytes32 payloadSlot = item.payload[nr];
                    currentSlot += 32;
                    assembly {
                        mstore(add(output, currentSlot), add(payloadSlot,0))
                    }
                }
            }
        }
        return output;
    }

    function addTopic(EventData memory data, bytes32 _topic)
    private
    pure
    {
        data.topics[data.topicsIndex] = _topic;
        data.topicsIndex++;
    }
}
