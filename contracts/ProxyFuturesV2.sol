pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";

// Internal references
import "./Proxyable.sol";

// https://docs.synthetix.io/contracts/source/contracts/proxyfuturesv2
contract ProxyFuturesV2 is Owned {
    address public target;

    /* ----- Dynamic router storage ----- */
    struct Route {
        bytes4 selector;
        address implementation;
        bool isView;
    }

    mapping(bytes4 => uint) internal _routeIndexes;
    Route[] internal _routes;

    constructor(address _owner) public Owned(_owner) {}

    /* ----- Dynamic router administration ----- */
    function _contains(bytes4 selector) internal view returns (bool) {
        if (_routes.length == 0) {
            return false;
        }
        uint index = _routeIndexes[selector];
        return index != 0 || _routes[0].selector == selector;
    }

    function _removeRoute(bytes4 selector) internal {
        require(_contains(selector), "Selector not in set.");
        // Replace the removed selector with the last selector of the list.
        uint index = _routeIndexes[selector];
        uint lastIndex = _routes.length - 1; // We required that selector is in the list, so it is not empty.
        if (index != lastIndex) {
            // No need to shift the last selector if it is the one we want to delete.
            Route storage shiftedElement = _routes[lastIndex];
            _routes[index] = shiftedElement;
            _routeIndexes[shiftedElement.selector] = index;
        }
        _routes.pop();
        delete _routeIndexes[selector];
    }

    function addRoute(
        bytes4 selector,
        address implementation,
        bool isView
    ) external {
        require(selector != bytes4(0), "invalid nil selector");

        if (_contains(selector)) {
            // Update data
            Route storage route = _routes[_routeIndexes[selector]];
            route.selector = selector;
            route.implementation = implementation;
            route.isView = isView;
        } else {
            // Add data
            _routeIndexes[selector] = _routes.length;
            Route memory newRoute;
            newRoute.selector = selector;
            newRoute.implementation = implementation;
            newRoute.isView = isView;

            _routes.push(newRoute);
        }

        emit RouteUpdated(selector, implementation, isView);
    }

    function removeRoute(bytes4 selector) external {
        _removeRoute(selector);
        emit RouteRemoved(selector);
    }

    function getRoutesLength() external view returns (uint) {
        return _routes.length;
    }

    function getRoutesPage(uint index, uint pageSize) external view returns (Route[] memory) {
        // NOTE: This implementation should be converted to slice operators if the compiler is updated to v0.6.0+
        uint endIndex = index + pageSize; // The check below that endIndex <= index handles overflow.

        // If the page extends past the end of the list, truncate it.
        if (endIndex > _routes.length) {
            endIndex = _routes.length;
        }
        if (endIndex <= index) {
            return new Route[](0);
        }

        uint n = endIndex - index; // We already checked for negative overflow.
        Route[] memory page = new Route[](n);
        for (uint i; i < n; i++) {
            page[i] = _routes[i + index];
        }
        return page;
    }

    ///// BASED ON PROXY.SOL /////
    /* ----- Proxy based on Proxy.sol ----- */

    function setTarget(Proxyable _target) external onlyOwner {
        target = address(_target);
        emit TargetUpdated(_target);
    }

    function _emit(
        bytes calldata callData,
        uint numTopics,
        bytes32 topic1,
        bytes32 topic2,
        bytes32 topic3,
        bytes32 topic4
    ) external onlyTarget {
        uint size = callData.length;
        bytes memory _callData = callData;

        assembly {
            /* The first 32 bytes of callData contain its length (as specified by the abi).
             * Length is assumed to be a uint256 and therefore maximum of 32 bytes
             * in length. It is also leftpadded to be a multiple of 32 bytes.
             * This means moving call_data across 32 bytes guarantees we correctly access
             * the data itself. */
            switch numTopics
                case 0 {
                    log0(add(_callData, 32), size)
                }
                case 1 {
                    log1(add(_callData, 32), size, topic1)
                }
                case 2 {
                    log2(add(_callData, 32), size, topic1, topic2)
                }
                case 3 {
                    log3(add(_callData, 32), size, topic1, topic2, topic3)
                }
                case 4 {
                    log4(add(_callData, 32), size, topic1, topic2, topic3, topic4)
                }
        }
    }

    // solhint-disable no-complex-fallback
    function() external payable {
        bytes4 sig4 = msg.sig;
        bool isView;
        address implementation = target;

        // Identify target
        if (_contains(sig4)) {
            // sig4 found, update impl and isView flag
            implementation = _routes[_routeIndexes[sig4]].implementation;
            isView = _routes[_routeIndexes[sig4]].isView;
        }

        if (!isView) {
            // Mutable call setting Proxyable.messageSender as this is using call not delegatecall
            Proxyable(implementation).setMessageSender(msg.sender);
        }

        assembly {
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            /* We must explicitly forward ether to the underlying contract as well. */
            let result := call(gas, implementation, callvalue, free_ptr, calldatasize, 0, 0)
            returndatacopy(free_ptr, 0, returndatasize)

            if iszero(result) {
                revert(free_ptr, returndatasize)
            }
            return(free_ptr, returndatasize)
        }
    }

    modifier onlyTarget {
        require(msg.sender == target, "Must be proxy target");
        _;
    }

    event TargetUpdated(Proxyable newTarget);

    event RouteUpdated(bytes4 route, address implementation, bool isView);

    event RouteRemoved(bytes4 route);
}
