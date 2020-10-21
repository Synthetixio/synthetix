pragma solidity ^0.5.16;

import "./MockCrossDomainMessenger.sol";
import "../SecondaryWithdrawal.sol";


contract FakeSecondaryWithdrawal is SecondaryWithdrawal {
    ISynthetix public mintableSynthetix;
    address public crossDomainMessengerMock;
    address public xChainCompanion;

    constructor(
        address _owner,
        address _resolver,
        address _mockMintableSynthetix,
        address _companion
    ) public SecondaryWithdrawal(_owner, _resolver) {
        mintableSynthetix = ISynthetix(_mockMintableSynthetix);
        xChainCompanion = _companion;
        crossDomainMessengerMock = address(new MockCrossDomainMessenger(_companion));
    }

    function synthetix() internal view returns (ISynthetix) {
        return mintableSynthetix;
    }

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(crossDomainMessengerMock);
    }

    function companion() internal view returns (address) {
        return xChainCompanion;
    }
}
