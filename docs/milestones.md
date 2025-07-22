  # MintPass milstones (telegram messages from Esteban Abaroa)

  scenario 1:
    1. user requests challenge
    2. challenge script checks that he has the NFT, if yes, he passes.
    
  scenario 2:
    1. user requests challenge
    2. challenge script sees missing NFT, he's prompted to either visit `plebbitlabs.com/mintpass/request/<his-eth-address>` or to do another challenge in the challenge list.

---

  ## Milestone 1
    
  milestone 1 should probably be to write the NFT contract, to deploy the NFT contract on base (or maybe arbitrum, not sure which one would be best). The contract features:
    - be called "MintPassV1" (contract name), with symbol "MINT1", as we dont want a proxy contract, it's OK to have more than 1 version.
    - each NFT should have a unique ID to prevent transfer spamming, it can just be totalSupply + 1
    - each NFT should have a tokenType, which could be uint16 (65536 possible types). the first type (0) could be sms. it could be kept track internally as mapping(uint256 => uint16) private _tokenTypes; // tokenId to tokenType
    - the baseURI should be `plebbitlabs.com/mintpass/mint1`, which is purely cosmetic, to display role strings as "traits" on etherscan, opensea, etc
    - the contract should use AccessControl (or modern equivalent), have an admin and minter role
    - the mint function should only be callable by the minter, it should have argument mint(to: address, type: uint16)
    - there should be a mintBatch(to: address[], type: uint16[]) to save on gas when minting multiple
    - the following fields should be mutable by the contract admin, as they are only cosmetic, they don't give the contract admin ability to revoke NFTs or rug the token or anything like that: baseURI, name, symbol.
    - the contract should use ERC721Enumerable (or modern equivalent), to be able to query all the NFT token ids owned by an address.
    - the contract should have a function tokenType(tokenId: number) to be able to know the type of an FNT. similar to tokenURI(tokenId: number)
    - the contract should have a utility function tokensOfOwner(owner: address): struct[] and tokensOfOwners(owners: address[]) struct[][] that uses the ERC721Enumerable tokenOfOwnerByIndex(owner: address) and tokenType(tokenId: number) to return an array of all the NFTs owned by an address, and their type, like [{tokenId: number, tokenType: number}]
    - the contract should have a utility function ownsTokenType(owner: address, tokenType: uint16): boolean, ownsTokenTypes(owner: address, tokenTypes: uint16[]): boolean, ownsOneOfTokenTypes(owner: address, tokenTypes: uint16[]): boolean, ownTokenType(owners: address[], tokenType: uint16[]): boolean[], ownTokenTypes(owner: address[], tokenTypes: uint16[][]): boolean, ownOneOfTokenTypes(owner: address[], tokenTypes: uint16[][]): boolean which would use less resources than calling tokensOfOwner(owner: address)

  I'm not sure how much the budget should be for this, let's see how long it takes you and how many changes we need to make to it. it's possible that AI can generate this and have it working perfectly as it's not a lot of code. You should have the AI generate some automated tests for it as well to make sure it works.

  Notes:
    - the challenge script need to keep track of which NFT id is associated with which plebbit account, and not allow quick transfers. for example if a plebbit account used NFT id at x date, another plebbit account can only use it 1 week later. this could also be done at the NFT smart contract level with a setting like transferCooldownSeconds but it seems better to do it in the plebbit challenge code.
    - the admin role can be kept in a hardware wallet, the minter role can be done on some server. if the minter role ever gets hacked, whatever token id range the hacker mints can be ignored by the challenge code, and the hacked minter address can be revoked by the admin role.

---

  ## Milestone 2

  milestone 2 should be to write the challenge code, which will be similar to evm challenge, but should be custom, and be called "mintpass". has to be custom to handle things like transfer cooldowns.

  Im actually not sure how to get started doing this, I guess you would use the same mintpass smart contract repo, but create a new folder, like plebbit-js-challenge or something, then you would use the same testing library to launch a local blockchain on localhost (hardhat does this / can do this I think), deploy your mintpass contract, send some NFTs, then you would setup the plebbit-js and subplebbit with the challenge, import plebbit-js, create a subplebbit, set subplebbit.settings.challenges = [{path: 'path to your challenge'}], then you would publish a post to that subplebbit, receive the challenge, etc.

  basically you would write a test that recreates everything the user would be doing and everything would be running locally. you might only need to 2-3 tests, or maybe even just 1, but the setup for that test would be very tedious and long. and the plebbit-js challenge would use localhost eth rpc provided by hardhard instead of using the mainnet rpc. so the plebbit-js challenge would get tested against a real eth rpc, but local

  this is pretty complicated and tedious, but it seems better to have automated tests that work locally than to deploy on some testest and develop against the testnet, it will probably save you time long term to set it up this way

  im also not sure how long this would take so I cant set a price, let's see how long it takes you

  oh another thing we need is we need to code / script to be able to generate the contract address deterministically, so that it always has the same address, and so that it can be published on other chains with the same address. I dont know how to do that, but AI should know

---

  ## Milestone 3

  milestone 3 should be to make the website and the `plebbitlabs.com/mintpass/request/<his-eth-address>` page, and link it to some sms verification service, and once verified, make the website mint the NFT

---

  ## Milestone 4
  milestone 4 should be to make the UX smooth on seedit, make the link clickable, test it, also we need to think how to display 2 optional challenges, like for example maybe the user can choose between 2 authentication methods, like ours and gitcoin passport, or 1 mintpass and an invite code, etc.