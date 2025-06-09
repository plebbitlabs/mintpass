// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title MintPassV1
 * @dev NFT contract for MintPass authentication system
 * Each NFT represents a verified credential (e.g., SMS verification)
 * Supports different token types and batch operations for gas efficiency
 */
contract MintPassV1 is ERC721, ERC721Enumerable, AccessControl {
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

    // Events
    event TokenMinted(address indexed to, uint256 indexed tokenId, uint16 indexed tokenType);
    event BatchMinted(address[] indexed recipients, uint16[] tokenTypes, uint256[] tokenIds);
    event BaseURIUpdated(string newBaseURI);
    event NameUpdated(string newName);
    event SymbolUpdated(string newSymbol);

    // Custom structs for utility functions
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
        
        // Grant roles
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
    }

    /**
     * @dev Mints a single NFT to the specified address
     * @param to Recipient address
     * @param tokenTypeValue Type of the token (e.g., 0 for SMS verification)
     */
    function mint(address to, uint16 tokenTypeValue) public onlyRole(MINTER_ROLE) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _tokenTypes[tokenId] = tokenTypeValue;
        _safeMint(to, tokenId);
        
        emit TokenMinted(to, tokenId, tokenTypeValue);
    }

    /**
     * @dev Mints multiple NFTs in a batch to save gas
     * @param recipients Array of recipient addresses
     * @param tokenTypes Array of token types (must match recipients length)
     */
    function mintBatch(
        address[] calldata recipients,
        uint16[] calldata tokenTypes
    ) external onlyRole(MINTER_ROLE) {
        require(recipients.length == tokenTypes.length, "Arrays length mismatch");
        require(recipients.length > 0, "Empty arrays");

        uint256[] memory tokenIds = new uint256[](recipients.length);
        
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = _tokenIdCounter;
            _tokenIdCounter++;
            
            _tokenTypes[tokenId] = tokenTypes[i];
            _safeMint(recipients[i], tokenId);
            tokenIds[i] = tokenId;
        }
        
        emit BatchMinted(recipients, tokenTypes, tokenIds);
    }

    /**
     * @dev Returns the token type for a given token ID
     * @param tokenId The token ID to query
     * @return The token type
     */
    function tokenType(uint256 tokenId) public view returns (uint16) {
        _requireOwned(tokenId);
        return _tokenTypes[tokenId];
    }

    /**
     * @dev Returns all tokens owned by an address with their types
     * @param owner The address to query
     * @return Array of TokenInfo structs
     */
    function tokensOfOwner(address owner) external view returns (TokenInfo[] memory) {
        uint256 tokenCount = balanceOf(owner);
        TokenInfo[] memory tokens = new TokenInfo[](tokenCount);
        
        for (uint256 i = 0; i < tokenCount; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            tokens[i] = TokenInfo({
                tokenId: tokenId,
                tokenType: _tokenTypes[tokenId]
            });
        }
        
        return tokens;
    }

    /**
     * @dev Returns all tokens for multiple owners
     * @param owners Array of addresses to query
     * @return Array of arrays of TokenInfo structs
     */
    function tokensOfOwners(address[] calldata owners) external view returns (TokenInfo[][] memory) {
        TokenInfo[][] memory allTokens = new TokenInfo[][](owners.length);
        
        for (uint256 i = 0; i < owners.length; i++) {
            uint256 tokenCount = balanceOf(owners[i]);
            TokenInfo[] memory ownerTokens = new TokenInfo[](tokenCount);
            
            for (uint256 j = 0; j < tokenCount; j++) {
                uint256 tokenId = tokenOfOwnerByIndex(owners[i], j);
                ownerTokens[j] = TokenInfo({
                    tokenId: tokenId,
                    tokenType: _tokenTypes[tokenId]
                });
            }
            
            allTokens[i] = ownerTokens;
        }
        
        return allTokens;
    }

    /**
     * @dev Checks if an owner has a specific token type
     * @param owner The address to check
     * @param tokenTypeValue The token type to check for
     * @return True if the owner has the token type
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
     * @dev Checks if an owner has all specified token types
     * @param owner The address to check
     * @param tokenTypes Array of token types to check for
     * @return True if the owner has all token types
     */
    function ownsTokenTypes(address owner, uint16[] calldata tokenTypes) external view returns (bool) {
        for (uint256 i = 0; i < tokenTypes.length; i++) {
            if (!this.ownsTokenType(owner, tokenTypes[i])) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Checks if an owner has at least one of the specified token types
     * @param owner The address to check
     * @param tokenTypes Array of token types to check for
     * @return True if the owner has at least one of the token types
     */
    function ownsOneOfTokenTypes(address owner, uint16[] calldata tokenTypes) external view returns (bool) {
        for (uint256 i = 0; i < tokenTypes.length; i++) {
            if (this.ownsTokenType(owner, tokenTypes[i])) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Batch check if multiple owners have a specific token type
     * @param owners Array of addresses to check
     * @param tokenTypeValue The token type to check for
     * @return Array of booleans indicating ownership
     */
    function ownTokenType(address[] calldata owners, uint16 tokenTypeValue) external view returns (bool[] memory) {
        bool[] memory results = new bool[](owners.length);
        
        for (uint256 i = 0; i < owners.length; i++) {
            results[i] = this.ownsTokenType(owners[i], tokenTypeValue);
        }
        
        return results;
    }

    /**
     * @dev Batch check if multiple owners have all specified token types
     * @param owners Array of addresses to check
     * @param tokenTypes Array of token types to check for
     * @return True if all owners have all token types
     */
    function ownTokenTypes(address[] calldata owners, uint16[] calldata tokenTypes) external view returns (bool) {
        for (uint256 i = 0; i < owners.length; i++) {
            if (!this.ownsTokenTypes(owners[i], tokenTypes)) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Batch check if multiple owners have at least one of the specified token types
     * @param owners Array of addresses to check
     * @param tokenTypes Array of token types to check for
     * @return True if all owners have at least one of the token types
     */
    function ownOneOfTokenTypes(address[] calldata owners, uint16[] calldata tokenTypes) external view returns (bool) {
        for (uint256 i = 0; i < owners.length; i++) {
            if (!this.ownsOneOfTokenTypes(owners[i], tokenTypes)) {
                return false;
            }
        }
        return true;
    }

    // Admin functions for updating cosmetic properties

    /**
     * @dev Updates the base URI (admin only)
     * @param newBaseURI The new base URI
     */
    function setBaseURI(string calldata newBaseURI) external onlyRole(ADMIN_ROLE) {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /**
     * @dev Updates the contract name (admin only)
     * @param newName The new contract name
     */
    function setName(string calldata newName) external onlyRole(ADMIN_ROLE) {
        // Note: This requires custom implementation as ERC721 name is immutable by default
        // We'll store it in a private variable and override the name() function
        _contractName = newName;
        emit NameUpdated(newName);
    }

    /**
     * @dev Updates the contract symbol (admin only)
     * @param newSymbol The new contract symbol
     */
    function setSymbol(string calldata newSymbol) external onlyRole(ADMIN_ROLE) {
        // Note: This requires custom implementation as ERC721 symbol is immutable by default
        // We'll store it in a private variable and override the symbol() function
        _contractSymbol = newSymbol;
        emit SymbolUpdated(newSymbol);
    }

    // View functions

    /**
     * @dev Returns the base URI for token metadata
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Returns the current token ID counter (total supply)
     */
    function totalSupply() public view override returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev Returns the contract name (overrides ERC721 to allow admin updates)
     */
    function name() public view override returns (string memory) {
        return _contractName;
    }

    /**
     * @dev Returns the contract symbol (overrides ERC721 to allow admin updates)
     */
    function symbol() public view override returns (string memory) {
        return _contractSymbol;
    }

    // Required overrides

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
} 