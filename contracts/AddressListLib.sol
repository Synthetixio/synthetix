pragma solidity ^0.5.16;


library AddressListLib {
    struct AddressList {
        address[] elements;
        mapping(address => uint) indices;
    }

    function contains(AddressList storage list, address candidate) internal view returns (bool) {
        if (list.elements.length == 0) {
            return false;
        }
        uint index = list.indices[candidate];
        return index != 0 || list.elements[0] == candidate;
    }

    function getPage(
        AddressList storage list,
        uint index,
        uint pageSize
    ) internal view returns (address[] memory) {
        // NOTE: This implementation should be converted to slice operators if the compiler is updated to v0.6.0+
        uint endIndex = index + pageSize; // The check below that endIndex <= index handles overflow.

        // If the page extends past the end of the list, truncate it.
        if (endIndex > list.elements.length) {
            endIndex = list.elements.length;
        }
        if (endIndex <= index) {
            return new address[](0);
        }

        uint n = endIndex - index; // We already checked for negative overflow.
        address[] memory page = new address[](n);
        for (uint i; i < n; i++) {
            page[i] = list.elements[i + index];
        }
        return page;
    }

    function push(AddressList storage list, address element) internal {
        list.indices[element] = list.elements.length;
        list.elements.push(element);
    }

    function remove(AddressList storage list, address element) internal {
        require(contains(list, element), "Element not in list.");
        // Replace the removed element with the last element of the list.
        uint index = list.indices[element];
        uint lastIndex = list.elements.length - 1; // We required that element is in the list, so it is not empty.
        if (index != lastIndex) {
            // No need to shift the last element if it is the one we want to delete.
            address shiftedElement = list.elements[lastIndex];
            list.elements[index] = shiftedElement;
            list.indices[shiftedElement] = index;
        }
        list.elements.pop();
        delete list.indices[element];
    }
}
