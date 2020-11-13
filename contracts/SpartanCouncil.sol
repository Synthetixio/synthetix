pragma solidity ^0.5.16;

import "openzeppelin-solidity-2.3.0/contracts/introspection/ERC165.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC721/IERC721.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC721/IERC721Receiver.sol";
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/Address.sol";


/**
 * @title ERC721 Non-Fungible Token Standard basic implementation
 * @dev see https://eips.ethereum.org/EIPS/eip-721
 */
contract SpartanCouncil is IERC721, ERC165 {
    using SafeMath for uint256;
    using Address for address;

    mapping(address => uint256) private _holderTokens;

    mapping(uint256 => address) private _tokenOwners;

    // Equals to `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`
    // which can be also obtained as `IERC721Receiver(0).onERC721Received.selector`
    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;

    // Token name
    string private _name;

    // Token symbol
    string private _symbol;

    // NFT Super Owner
    address private _superOwner;

    /**
     * @dev Initializes the contract by setting a `name` and a `symbol` to the token collection.
     */
    constructor(string memory name, string memory symbol) public {
        _name = name;
        _symbol = symbol;
        _superOwner = msg.sender;
    }

    /**
     * @dev See {IERC721-balanceOf}.
     */
    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), "ERC721: balance query for the zero address");

        return _holderTokens[owner];
    }

    /**
     * @dev See {IERC721-ownerOf}.
     */
    function ownerOf(uint256 tokenId) public view returns (address) {
        return _tokenOwners[tokenId];
    }

    /**
     * @dev See {IERC721-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public {
        safeTransferFrom(from, to, tokenId, "");
    }

    /**
     * @dev See {IERC721-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) public {
        _safeTransfer(from, to, tokenId, _data);
    }

    /**
     * @dev See {IERC721-transferFrom}.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public {
        _transfer(from, to, tokenId);
    }

    /**
     * @dev See {IERC721-approve}.
     */
    function approve(address to, uint256 tokenId) public {}

    /**
     * @dev See {IERC721-isApprovedForAll}.
     */
    function isApprovedForAll(address owner, address operator) public view returns (bool) {}

    /**
     * @dev See {IERC721-getApproved}.
     */
    function getApproved(uint256 tokenId) public view returns (address) {}

    /**
     * @dev See {IERC721-setApprovalForAll}.
     */
    function setApprovalForAll(address operator, bool approved) public {}

    function _safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) internal {
        _transfer(from, to, tokenId);
        // require(_checkOnERC721Received(from, to, tokenId, _data), "ERC721: transfer to non ERC721Receiver implementer");
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal {
        require(msg.sender == _superOwner, "Sender is not the super owner");
        require(to != address(0), "ERC721: transfer to the zero address");

        delete _holderTokens[from];
        _holderTokens[to] = tokenId;

        _tokenOwners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    /**
     * @dev Internal function to invoke {IERC721Receiver-onERC721Received} on a target address.
     * The call is not executed if the target address is not a contract.
     *
     * @param from address representing the previous owner of the given token ID
     * @param to target address that will receive the tokens
     * @param tokenId uint256 ID of the token to be transferred
     * @param _data bytes optional data to send along with the call
     * @return bool whether the call correctly returned the expected magic value
     */
    // function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory _data)
    //     private returns (bool)
    // {
    //     if (!to.isContract()) {
    //         return true;
    //     }
    //     bytes memory returndata = to.functionCall(abi.encodeWithSelector(
    //         IERC721Receiver(to).onERC721Received.selector,
    //         msg.sender,
    //         from,
    //         tokenId,
    //         _data
    //     ), "ERC721: transfer to non ERC721Receiver implementer");
    //     bytes4 retval = abi.decode(returndata, (bytes4));
    //     return (retval == _ERC721_RECEIVED);
    // }
}
