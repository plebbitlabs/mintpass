// Minimal ABIs used by the backend
export const MintPassV1Abi = [
  'function mint(address to, uint16 tokenTypeValue) external',
];

export const MintPassV2Abi = [
  'function mintWithData(address to, uint16 tokenTypeValue, string authorAddress, bytes2 country) external',
  'function tokenData(uint256 tokenId) view returns (string authorAddress, uint64 mintedAt, bytes2 country, address originalRecipient, uint16 tokenTypeValue)',
  'function ownsTokenType(address owner, uint16 tokenTypeValue) view returns (bool)',
  'function ownsTokenTypeForAuthor(address owner, uint16 tokenTypeValue, string authorAddress) view returns (bool)'
];


