// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title MintPassV2
 * @dev NFT contract for MintPass authentication with author-bound metadata
 * - Transferable tokens
 * - Each token binds immutably to a Plebbit author address string
 * - Records provenance: authorAddress, mintedAt, country (bytes2), originalRecipient
 * - Backwards-compatible ownership helpers from V1
 */
contract MintPassV2 is ERC721, ERC721Enumerable, AccessControl {
    using Strings for uint256;

    // Role definitions
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Contract state
    uint256 private _tokenIdCounter;
    string private _baseTokenURI;
    string private _contractName;
    string private _contractSymbol;

    // Token type tracking: tokenId => tokenType
    mapping(uint256 => uint16) private _tokenTypes;

    // Token provenance data (packed where possible)
    struct TokenMeta {
        uint64 mintedAt;            // block.timestamp at mint
        bytes2 country;             // ISO-3166-1 alpha-2 uppercase
        address originalRecipient;  // first recipient
    }

    mapping(uint256 => TokenMeta) private _tokenMeta;
    mapping(uint256 => string) private _authorAddress; // arbitrary string identifier

    // Events
    event TokenMinted(address indexed to, uint256 indexed tokenId, uint16 indexed tokenType);
    event BatchMinted(address[] indexed recipients, uint16[] tokenTypes, uint256[] tokenIds);
    event BaseURIUpdated(string newBaseURI);
    event NameUpdated(string newName);
    event SymbolUpdated(string newSymbol);

    // Exposed view struct
    struct TokenInfo {
        uint256 tokenId;
        uint16 tokenType;
    }

    constructor(
        string memory contractName,
        string memory contractSymbol,
        string memory baseURI,
        address admin,
        address minter
    ) ERC721(contractName, contractSymbol) {
        _baseTokenURI = baseURI;
        _contractName = contractName;
        _contractSymbol = contractSymbol;
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
    }

    /**
     * @dev Mints a single NFT with immutable author-bound metadata
     * @param to Recipient address
     * @param tokenTypeValue Token type (e.g., 0 for SMS verification)
     * @param authorAddress Author identifier string (arbitrary, e.g., IPNS key or ENS)
     * @param country Two-letter ISO-3166-1 alpha-2 uppercase code
     */
    function mintWithData(
        address to,
        uint16 tokenTypeValue,
        string calldata authorAddress,
        bytes2 country
    ) external onlyRole(MINTER_ROLE) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _tokenTypes[tokenId] = tokenTypeValue;
        _authorAddress[tokenId] = authorAddress;
        _tokenMeta[tokenId] = TokenMeta({
            mintedAt: uint64(block.timestamp),
            country: country,
            originalRecipient: to
        });

        _safeMint(to, tokenId);
        emit TokenMinted(to, tokenId, tokenTypeValue);
    }

    /**
     * @dev Backwards-compatible mint without author data (for legacy callers/tests)
     */
    function mint(address to, uint16 tokenTypeValue) external onlyRole(MINTER_ROLE) {
        mintWithData(to, tokenTypeValue, "", bytes2(0));
    }

    /**
     * @dev Returns token type for given tokenId
     */
    function tokenType(uint256 tokenId) public view returns (uint16) {
        _requireOwned(tokenId);
        return _tokenTypes[tokenId];
    }

    /**
     * @dev Returns author-bound provenance and token type for tokenId
     */
    function tokenData(uint256 tokenId)
        external
        view
        returns (
            string memory authorAddress,
            uint64 mintedAt,
            bytes2 country,
            address originalRecipient,
            uint16 tokenTypeValue
        )
    {
        _requireOwned(tokenId);
        TokenMeta memory m = _tokenMeta[tokenId];
        return (_authorAddress[tokenId], m.mintedAt, m.country, m.originalRecipient, _tokenTypes[tokenId]);
    }

    /**
     * @dev Returns all tokens owned by an address with their types
     */
    function tokensOfOwner(address owner) external view returns (TokenInfo[] memory) {
        uint256 tokenCount = balanceOf(owner);
        TokenInfo[] memory tokens = new TokenInfo[](tokenCount);
        for (uint256 i = 0; i < tokenCount; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            tokens[i] = TokenInfo({ tokenId: tokenId, tokenType: _tokenTypes[tokenId] });
        }
        return tokens;
    }

    /**
     * @dev Returns true if owner has at least one token of tokenTypeValue
     */
    function ownsTokenType(address owner, uint16 tokenTypeValue) external view returns (bool) {
        uint256 tokenCount = balanceOf(owner);
        for (uint256 i = 0; i < tokenCount; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            if (_tokenTypes[tokenId] == tokenTypeValue) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Returns true if owner has at least one token of tokenTypeValue bound to authorAddress
     */
    function ownsTokenTypeForAuthor(
        address owner,
        uint16 tokenTypeValue,
        string calldata authorAddress
    ) external view returns (bool) {
        bytes32 authorHash = keccak256(bytes(authorAddress));
        uint256 tokenCount = balanceOf(owner);
        for (uint256 i = 0; i < tokenCount; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            if (_tokenTypes[tokenId] == tokenTypeValue) {
                if (keccak256(bytes(_authorAddress[tokenId])) == authorHash) {
                    return true;
                }
            }
        }
        return false;
    }

    // Admin functions for updating cosmetic properties
    function setBaseURI(string calldata newBaseURI) external onlyRole(ADMIN_ROLE) {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function setName(string calldata newName) external onlyRole(ADMIN_ROLE) {
        _contractName = newName;
        emit NameUpdated(newName);
    }

    function setSymbol(string calldata newSymbol) external onlyRole(ADMIN_ROLE) {
        _contractSymbol = newSymbol;
        emit SymbolUpdated(newSymbol);
    }

    // View helpers
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function totalSupply() public view override returns (uint256) {
        return _tokenIdCounter;
    }

    function name() public view override returns (string memory) {
        return _contractName;
    }

    function symbol() public view override returns (string memory) {
        return _contractSymbol;
    }

    // Required overrides
    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}


