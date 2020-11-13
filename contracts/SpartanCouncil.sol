pragma solidity ^0.5.16;

import "openzeppelin-solidity-2.3.0/contracts/introspection/ERC165.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC721/IERC721.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/Address.sol";


/**
 * @title ERC721 Non-Fungible Token Standard basic implementation
 * @dev see https://eips.ethereum.org/EIPS/eip-721
 */
contract SpartanCouncil is IERC721, ERC165 {
    using Address for address;

    event Mint(uint256 tokenId, address to);
    event Burn(uint256 tokenId);

    mapping(address => uint256) private _holderTokens;

    mapping(uint256 => address) private _tokenOwners;

    uint256 public tokenCount;

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

    modifier isSuperOwner() {
        require(msg.sender == _superOwner, "Sender is not the super owner");
        _;
    }

    modifier isValidAddress(address to) {
        require(to != address(0), "ERC721: transfer to the zero address");
        _;
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
    ) public {}

    /**
     * @dev See {IERC721-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) public {}

    /**
     * @dev See {IERC721-transferFrom}.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public {}

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

    function transfer(
        address from,
        address to,
        uint256 tokenId
    ) public isSuperOwner() isValidAddress(to) {
        delete _holderTokens[from];
        _holderTokens[to] = tokenId;

        _tokenOwners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function mint(address to, uint256 tokenId) public isSuperOwner() isValidAddress(to) {
        require(tokenId != tokenCount, "ERC721: token already minted");

        _holderTokens[to] = tokenId;

        tokenCount += 1;

        _tokenOwners[tokenId] = to;

        emit Mint(tokenId, to);
    }

    function burn(uint256 tokenId) public isSuperOwner() {
        require(tokenId == tokenCount, "ERC721: token does not exist");

        address previousOwner = _tokenOwners[tokenId];

        delete _holderTokens[previousOwner];

        delete _tokenOwners[tokenId];

        tokenCount -= 1;

        emit Burn(tokenId);
    }

    function totalSupply() public view returns (uint256) {
        return tokenCount;
    }
}
