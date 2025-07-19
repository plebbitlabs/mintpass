import { expect } from "chai";
import { ethers } from "hardhat";
import { MintPassV1 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("MintPassV1", function () {
  let mintpass: MintPassV1;
  let admin: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;

  const NAME = "MintPassV1";
  const SYMBOL = "MINT1";
  const BASE_URI = "https://plebbitlabs.com/mintpass/mint1/";
  const SMS_TOKEN_TYPE = 0;
  const EMAIL_TOKEN_TYPE = 1;

  beforeEach(async function () {
    [admin, minter, user1, user2, unauthorized] = await ethers.getSigners();

    const MintPassV1Factory = await ethers.getContractFactory("MintPassV1");
    mintpass = await MintPassV1Factory.deploy(
      NAME,
      SYMBOL,
      BASE_URI,
      admin.address,
      minter.address
    );
    await mintpass.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await mintpass.name()).to.equal(NAME);
      expect(await mintpass.symbol()).to.equal(SYMBOL);
    });

    it("Should set the correct base URI", async function () {
      // Since _baseURI is internal, we test it indirectly via tokenURI after minting
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
      const tokenURI = await mintpass.tokenURI(0);
      expect(tokenURI).to.equal(BASE_URI + "0");
    });

    it("Should grant admin role to admin address", async function () {
      const ADMIN_ROLE = await mintpass.ADMIN_ROLE();
      expect(await mintpass.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant minter role to minter address", async function () {
      const MINTER_ROLE = await mintpass.MINTER_ROLE();
      expect(await mintpass.hasRole(MINTER_ROLE, minter.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("Should mint a single NFT with correct token type", async function () {
      await expect(mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE))
        .to.emit(mintpass, "TokenMinted")
        .withArgs(user1.address, 0, SMS_TOKEN_TYPE);

      expect(await mintpass.balanceOf(user1.address)).to.equal(1);
      expect(await mintpass.ownerOf(0)).to.equal(user1.address);
      expect(await mintpass.tokenType(0)).to.equal(SMS_TOKEN_TYPE);
      expect(await mintpass.totalSupply()).to.equal(1);
    });

    it("Should increment token IDs correctly", async function () {
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user2.address, EMAIL_TOKEN_TYPE);

      expect(await mintpass.tokenType(0)).to.equal(SMS_TOKEN_TYPE);
      expect(await mintpass.tokenType(1)).to.equal(EMAIL_TOKEN_TYPE);
      expect(await mintpass.totalSupply()).to.equal(2);
    });

    it("Should only allow minter to mint", async function () {
      await expect(
        mintpass.connect(unauthorized).mint(user1.address, SMS_TOKEN_TYPE)
      ).to.be.reverted;
    });

    it("Should batch mint correctly", async function () {
      const recipients = [user1.address, user2.address];
      const tokenTypes = [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE];

      await expect(
        mintpass.connect(minter).mintBatch(recipients, tokenTypes)
      ).to.emit(mintpass, "BatchMinted");

      expect(await mintpass.balanceOf(user1.address)).to.equal(1);
      expect(await mintpass.balanceOf(user2.address)).to.equal(1);
      expect(await mintpass.tokenType(0)).to.equal(SMS_TOKEN_TYPE);
      expect(await mintpass.tokenType(1)).to.equal(EMAIL_TOKEN_TYPE);
      expect(await mintpass.totalSupply()).to.equal(2);
    });

    it("Should revert batch mint with mismatched arrays", async function () {
      const recipients = [user1.address, user2.address];
      const tokenTypes = [SMS_TOKEN_TYPE]; // Shorter array

      await expect(
        mintpass.connect(minter).mintBatch(recipients, tokenTypes)
      ).to.be.revertedWith("Arrays length mismatch");
    });

    it("Should revert batch mint with empty arrays", async function () {
      await expect(
        mintpass.connect(minter).mintBatch([], [])
      ).to.be.revertedWith("Empty arrays");
    });
  });

  describe("Token Type Queries", function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user1.address, EMAIL_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user2.address, SMS_TOKEN_TYPE);
    });

    it("Should return correct token type for valid token ID", async function () {
      expect(await mintpass.tokenType(0)).to.equal(SMS_TOKEN_TYPE);
      expect(await mintpass.tokenType(1)).to.equal(EMAIL_TOKEN_TYPE);
      expect(await mintpass.tokenType(2)).to.equal(SMS_TOKEN_TYPE);
    });

    it("Should revert for invalid token ID", async function () {
      await expect(mintpass.tokenType(999)).to.be.reverted;
    });
  });

  describe("tokensOfOwner", function () {
    beforeEach(async function () {
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user1.address, EMAIL_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user2.address, SMS_TOKEN_TYPE);
    });

    it("Should return all tokens owned by an address", async function () {
      const user1Tokens = await mintpass.tokensOfOwner(user1.address);
      expect(user1Tokens.length).to.equal(2);
      expect(user1Tokens[0].tokenId).to.equal(0);
      expect(user1Tokens[0].tokenType).to.equal(SMS_TOKEN_TYPE);
      expect(user1Tokens[1].tokenId).to.equal(1);
      expect(user1Tokens[1].tokenType).to.equal(EMAIL_TOKEN_TYPE);

      const user2Tokens = await mintpass.tokensOfOwner(user2.address);
      expect(user2Tokens.length).to.equal(1);
      expect(user2Tokens[0].tokenId).to.equal(2);
      expect(user2Tokens[0].tokenType).to.equal(SMS_TOKEN_TYPE);
    });
  });

  describe("tokensOfOwners", function () {
    beforeEach(async function () {
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user2.address, EMAIL_TOKEN_TYPE);
    });

    it("Should return tokens for multiple owners", async function () {
      const owners = [user1.address, user2.address];
      const allTokens = await mintpass.tokensOfOwners(owners);

      expect(allTokens.length).to.equal(2);
      expect(allTokens[0].length).to.equal(1); // user1 has 1 token
      expect(allTokens[1].length).to.equal(1); // user2 has 1 token
      expect(allTokens[0][0].tokenType).to.equal(SMS_TOKEN_TYPE);
      expect(allTokens[1][0].tokenType).to.equal(EMAIL_TOKEN_TYPE);
    });
  });

  describe("Token Type Ownership Checks", function () {
    beforeEach(async function () {
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user1.address, EMAIL_TOKEN_TYPE);
      await mintpass.connect(minter).mint(user2.address, SMS_TOKEN_TYPE);
    });

    it("Should correctly check ownsTokenType", async function () {
      expect(await mintpass.ownsTokenType(user1.address, SMS_TOKEN_TYPE)).to.be.true;
      expect(await mintpass.ownsTokenType(user1.address, EMAIL_TOKEN_TYPE)).to.be.true;
      expect(await mintpass.ownsTokenType(user2.address, SMS_TOKEN_TYPE)).to.be.true;
      expect(await mintpass.ownsTokenType(user2.address, EMAIL_TOKEN_TYPE)).to.be.false;
    });

    it("Should correctly check ownsTokenTypes", async function () {
      expect(await mintpass.ownsTokenTypes(user1.address, [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE])).to.be.true;
      expect(await mintpass.ownsTokenTypes(user2.address, [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE])).to.be.false;
    });

    it("Should correctly check ownsOneOfTokenTypes", async function () {
      expect(await mintpass.ownsOneOfTokenTypes(user1.address, [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE])).to.be.true;
      expect(await mintpass.ownsOneOfTokenTypes(user2.address, [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE])).to.be.true;
      expect(await mintpass.ownsOneOfTokenTypes(unauthorized.address, [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE])).to.be.false;
    });

    it("Should correctly check ownTokenType for multiple owners", async function () {
      const owners = [user1.address, user2.address, unauthorized.address];
      const results = await mintpass.ownTokenType(owners, SMS_TOKEN_TYPE);
      
      expect(results[0]).to.be.true;  // user1 owns SMS token
      expect(results[1]).to.be.true;  // user2 owns SMS token
      expect(results[2]).to.be.false; // unauthorized doesn't own SMS token
    });

    it("Should correctly check ownTokenTypes for multiple owners", async function () {
      const owners = [user1.address, user2.address];
      const tokenTypes = [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE];
      
      expect(await mintpass.ownTokenTypes(owners, tokenTypes)).to.be.false; // user2 doesn't have EMAIL_TOKEN_TYPE
    });

    it("Should correctly check ownOneOfTokenTypes for multiple owners", async function () {
      const owners = [user1.address, user2.address];
      const tokenTypes = [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE];
      
      expect(await mintpass.ownOneOfTokenTypes(owners, tokenTypes)).to.be.true; // Both have at least one
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to update base URI", async function () {
      const newBaseURI = "https://newplebbitlabs.com/mintpass/v1/";
      
      await expect(mintpass.connect(admin).setBaseURI(newBaseURI))
        .to.emit(mintpass, "BaseURIUpdated")
        .withArgs(newBaseURI);

      // Test the change by minting and checking tokenURI
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
      const tokenURI = await mintpass.tokenURI(0);
      expect(tokenURI).to.equal(newBaseURI + "0");
    });

    it("Should not allow non-admin to update base URI", async function () {
      await expect(
        mintpass.connect(unauthorized).setBaseURI("https://hack.com/")
      ).to.be.reverted;
    });

    it("Should allow admin to update contract name", async function () {
      const newName = "MintPassV2";
      
      await expect(mintpass.connect(admin).setName(newName))
        .to.emit(mintpass, "NameUpdated")
        .withArgs(newName);

      expect(await mintpass.name()).to.equal(newName);
    });

    it("Should not allow non-admin to update contract name", async function () {
      await expect(
        mintpass.connect(unauthorized).setName("HackedName")
      ).to.be.reverted;
    });

    it("Should allow admin to update contract symbol", async function () {
      const newSymbol = "MP2";
      
      await expect(mintpass.connect(admin).setSymbol(newSymbol))
        .to.emit(mintpass, "SymbolUpdated")
        .withArgs(newSymbol);

      expect(await mintpass.symbol()).to.equal(newSymbol);
    });

    it("Should not allow non-admin to update contract symbol", async function () {
      await expect(
        mintpass.connect(unauthorized).setSymbol("HACK")
      ).to.be.reverted;
    });

    it("Should allow admin to grant and revoke roles", async function () {
      const MINTER_ROLE = await mintpass.MINTER_ROLE();
      
      // Grant minter role to user1
      await mintpass.connect(admin).grantRole(MINTER_ROLE, user1.address);
      expect(await mintpass.hasRole(MINTER_ROLE, user1.address)).to.be.true;
      
      // user1 should now be able to mint
      await mintpass.connect(user1).mint(user2.address, SMS_TOKEN_TYPE);
      expect(await mintpass.balanceOf(user2.address)).to.equal(1);
      
      // Revoke minter role from user1
      await mintpass.connect(admin).revokeRole(MINTER_ROLE, user1.address);
      expect(await mintpass.hasRole(MINTER_ROLE, user1.address)).to.be.false;
      
      // user1 should no longer be able to mint
      await expect(
        mintpass.connect(user1).mint(user2.address, EMAIL_TOKEN_TYPE)
      ).to.be.reverted;
    });
  });

  describe("ERC721 Compatibility", function () {
    beforeEach(async function () {
      await mintpass.connect(minter).mint(user1.address, SMS_TOKEN_TYPE);
    });

    it("Should support ERC721 interface", async function () {
      const ERC721_INTERFACE_ID = "0x80ac58cd";
      expect(await mintpass.supportsInterface(ERC721_INTERFACE_ID)).to.be.true;
    });

    it("Should support ERC721Enumerable interface", async function () {
      const ERC721_ENUMERABLE_INTERFACE_ID = "0x780e9d63";
      expect(await mintpass.supportsInterface(ERC721_ENUMERABLE_INTERFACE_ID)).to.be.true;
    });

    it("Should support AccessControl interface", async function () {
      const ACCESS_CONTROL_INTERFACE_ID = "0x7965db0b";
      expect(await mintpass.supportsInterface(ACCESS_CONTROL_INTERFACE_ID)).to.be.true;
    });

    it("Should allow token transfers", async function () {
      await mintpass.connect(user1).transferFrom(user1.address, user2.address, 0);
      expect(await mintpass.ownerOf(0)).to.equal(user2.address);
      expect(await mintpass.balanceOf(user1.address)).to.equal(0);
      expect(await mintpass.balanceOf(user2.address)).to.equal(1);
    });
  });
}); 