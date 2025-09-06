import { expect } from "chai";
import { ethers } from "hardhat";
import { MintPassV2 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("MintPassV2", function () {
  let mintpass: MintPassV2;
  let admin: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;

  const NAME = "MintPassV2";
  const SYMBOL = "MINT1";
  const BASE_URI = "https://mintpass.org/mint1/";
  const SMS_TOKEN_TYPE = 0;
  const EMAIL_TOKEN_TYPE = 1;

  const AUTHOR_A = "author://local/test-A";
  const AUTHOR_B = "author://local/test-B";
  const COUNTRY_US = ethers.hexlify(ethers.toUtf8Bytes("US")); // 0x5553

  beforeEach(async function () {
    [admin, minter, user1, user2, unauthorized] = await ethers.getSigners();

    const MintPassV2Factory = await ethers.getContractFactory("MintPassV2");
    mintpass = await MintPassV2Factory.deploy(
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

    it("Should set the correct base URI (via tokenURI after mint)", async function () {
      await mintpass.connect(minter).mintWithData(user1.address, SMS_TOKEN_TYPE, AUTHOR_A, COUNTRY_US);
      const tokenURI = await mintpass.tokenURI(0);
      expect(tokenURI).to.equal(BASE_URI + "0");
    });

    it("Should grant roles to admin and minter", async function () {
      const ADMIN_ROLE = await mintpass.ADMIN_ROLE();
      const MINTER_ROLE = await mintpass.MINTER_ROLE();
      expect(await mintpass.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      expect(await mintpass.hasRole(MINTER_ROLE, minter.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("Should mint with data and record provenance", async function () {
      await expect(
        mintpass.connect(minter).mintWithData(user1.address, SMS_TOKEN_TYPE, AUTHOR_A, COUNTRY_US)
      )
        .to.emit(mintpass, "TokenMinted")
        .withArgs(user1.address, 0, SMS_TOKEN_TYPE);

      expect(await mintpass.balanceOf(user1.address)).to.equal(1);
      expect(await mintpass.ownerOf(0)).to.equal(user1.address);
      expect(await mintpass.tokenType(0)).to.equal(SMS_TOKEN_TYPE);
      expect(await mintpass.totalSupply()).to.equal(1);

      const data = await mintpass.tokenData(0);
      expect(data.authorAddress).to.equal(AUTHOR_A);
      expect(data.mintedAt).to.be.greaterThan(0);
      expect(data.country).to.equal(COUNTRY_US);
      expect(data.originalRecipient).to.equal(user1.address);
      expect(data.tokenTypeValue).to.equal(SMS_TOKEN_TYPE);
    });

    it("Should support legacy mint() without author/country", async function () {
      await mintpass.connect(minter).mint(user1.address, EMAIL_TOKEN_TYPE);
      const data = await mintpass.tokenData(0);
      expect(data.authorAddress).to.equal("");
      expect(data.country).to.equal("0x0000");
      expect(data.tokenTypeValue).to.equal(EMAIL_TOKEN_TYPE);
    });

    it("Should only allow minter to mint", async function () {
      await expect(
        mintpass.connect(unauthorized).mintWithData(user1.address, SMS_TOKEN_TYPE, AUTHOR_A, COUNTRY_US)
      ).to.be.reverted;
    });
  });

  describe("Ownership helpers", function () {
    beforeEach(async function () {
      await mintpass.connect(minter).mintWithData(user1.address, SMS_TOKEN_TYPE, AUTHOR_A, COUNTRY_US);
      await mintpass.connect(minter).mintWithData(user1.address, EMAIL_TOKEN_TYPE, AUTHOR_A, COUNTRY_US);
      await mintpass.connect(minter).mintWithData(user2.address, SMS_TOKEN_TYPE, AUTHOR_B, COUNTRY_US);
    });

    it("ownsTokenType should reflect ownership by type", async function () {
      expect(await mintpass.ownsTokenType(user1.address, SMS_TOKEN_TYPE)).to.be.true;
      expect(await mintpass.ownsTokenType(user1.address, EMAIL_TOKEN_TYPE)).to.be.true;
      expect(await mintpass.ownsTokenType(user2.address, SMS_TOKEN_TYPE)).to.be.true;
      expect(await mintpass.ownsTokenType(user2.address, EMAIL_TOKEN_TYPE)).to.be.false;
    });

    it("ownsTokenTypeForAuthor should enforce author binding", async function () {
      expect(await mintpass.ownsTokenTypeForAuthor(user1.address, SMS_TOKEN_TYPE, AUTHOR_A)).to.be.true;
      expect(await mintpass.ownsTokenTypeForAuthor(user1.address, SMS_TOKEN_TYPE, AUTHOR_B)).to.be.false;
      expect(await mintpass.ownsTokenTypeForAuthor(user2.address, SMS_TOKEN_TYPE, AUTHOR_B)).to.be.true;
      expect(await mintpass.ownsTokenTypeForAuthor(user2.address, SMS_TOKEN_TYPE, AUTHOR_A)).to.be.false;
    });

    it("tokensOfOwner should list token ids and types", async function () {
      const u1Tokens = await mintpass.tokensOfOwner(user1.address);
      expect(u1Tokens.length).to.equal(2);
      expect(u1Tokens[0].tokenId).to.equal(0);
      expect(u1Tokens[0].tokenType).to.equal(SMS_TOKEN_TYPE);
      expect(u1Tokens[1].tokenId).to.equal(1);
      expect(u1Tokens[1].tokenType).to.equal(EMAIL_TOKEN_TYPE);

      const u2Tokens = await mintpass.tokensOfOwner(user2.address);
      expect(u2Tokens.length).to.equal(1);
      expect(u2Tokens[0].tokenId).to.equal(2);
      expect(u2Tokens[0].tokenType).to.equal(SMS_TOKEN_TYPE);
    });
  });

  describe("Admin functions", function () {
    it("setBaseURI should update tokenURI for new mints", async function () {
      const newBase = "https://newmintpass.org/v2/";
      await expect(mintpass.connect(admin).setBaseURI(newBase))
        .to.emit(mintpass, "BaseURIUpdated")
        .withArgs(newBase);

      await mintpass.connect(minter).mintWithData(user1.address, SMS_TOKEN_TYPE, AUTHOR_A, COUNTRY_US);
      const tokenURI = await mintpass.tokenURI(0);
      expect(tokenURI).to.equal(newBase + "0");
    });

    it("setName and setSymbol should update metadata (admin only)", async function () {
      await expect(mintpass.connect(admin).setName("MintPassV2-Updated"))
        .to.emit(mintpass, "NameUpdated")
        .withArgs("MintPassV2-Updated");
      expect(await mintpass.name()).to.equal("MintPassV2-Updated");

      await expect(mintpass.connect(admin).setSymbol("MINT1"))
        .to.emit(mintpass, "SymbolUpdated")
        .withArgs("MINT1");
      expect(await mintpass.symbol()).to.equal("MINT1");
    });

    it("Non-admin cannot change name/symbol/baseURI", async function () {
      await expect(mintpass.connect(unauthorized).setBaseURI("https://x/"))
        .to.be.reverted;
      await expect(mintpass.connect(unauthorized).setName("x"))
        .to.be.reverted;
      await expect(mintpass.connect(unauthorized).setSymbol("x"))
        .to.be.reverted;
    });
  });

  describe("ERC721 behavior", function () {
    beforeEach(async function () {
      await mintpass.connect(minter).mintWithData(user1.address, SMS_TOKEN_TYPE, AUTHOR_A, COUNTRY_US);
    });

    it("supportsInterface for ERC721/Enumerable/AccessControl", async function () {
      const ERC721_ID = "0x80ac58cd";
      const ERC721_ENUMERABLE_ID = "0x780e9d63";
      const ACCESS_CONTROL_ID = "0x7965db0b";
      expect(await mintpass.supportsInterface(ERC721_ID)).to.be.true;
      expect(await mintpass.supportsInterface(ERC721_ENUMERABLE_ID)).to.be.true;
      expect(await mintpass.supportsInterface(ACCESS_CONTROL_ID)).to.be.true;
    });

    it("should allow token transfer", async function () {
      await mintpass.connect(user1).transferFrom(user1.address, user2.address, 0);
      expect(await mintpass.ownerOf(0)).to.equal(user2.address);
      expect(await mintpass.balanceOf(user1.address)).to.equal(0);
      expect(await mintpass.balanceOf(user2.address)).to.equal(1);
    });
  });
});


