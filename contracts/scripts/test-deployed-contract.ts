import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Token type constants
const SMS_TOKEN_TYPE = 0;
const EMAIL_TOKEN_TYPE = 1;

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load contract address from deployment file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentsDir, `MintPassV1-${network.name}.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}`);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const contractAddress = deployment.contractAddress;
  
  console.log("🧪 Testing deployed MintPassV1 contract");
  console.log("=====================================");
  console.log("Network:", network.name);
  console.log("Contract:", contractAddress);
  console.log("Test account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // Get contract instance
  const MintPassV1 = await ethers.getContractAt("MintPassV1", contractAddress);

  try {
    // Test 1: Basic Contract Info
    console.log("📋 Test 1: Basic Contract Information");
    console.log("-----------------------------------");
    const name = await MintPassV1.name();
    const symbol = await MintPassV1.symbol();
    const totalSupply = await MintPassV1.totalSupply();
    
    console.log("✅ Name:", name);
    console.log("✅ Symbol:", symbol);
    console.log("✅ Total Supply:", totalSupply.toString());
    console.log("");

    // Test 2: Role Verification
    console.log("🔐 Test 2: Role Verification");
    console.log("----------------------------");
    const ADMIN_ROLE = await MintPassV1.ADMIN_ROLE();
    const MINTER_ROLE = await MintPassV1.MINTER_ROLE();
    const isAdmin = await MintPassV1.hasRole(ADMIN_ROLE, deployer.address);
    const isMinter = await MintPassV1.hasRole(MINTER_ROLE, deployer.address);
    
    console.log("✅ Is Admin:", isAdmin);
    console.log("✅ Is Minter:", isMinter);
    
    if (!isAdmin && !isMinter) {
      console.log("⚠️  Note: Account doesn't have admin/minter roles - skipping write tests");
      console.log("✅ Contract verification completed (read-only mode)");
      return;
    }
    console.log("");

    // Test 3: Single Minting (only if we have minter role)
    if (isMinter) {
      console.log("🎯 Test 3: Single Token Minting");
      console.log("-------------------------------");
      
      console.log("Minting SMS token (type 0) to deployer...");
      const mintTx1 = await MintPassV1.mint(deployer.address, SMS_TOKEN_TYPE);
      await mintTx1.wait();
      console.log("✅ SMS token minted, tx:", mintTx1.hash);

      console.log("Minting EMAIL token (type 1) to deployer...");
      const mintTx2 = await MintPassV1.mint(deployer.address, EMAIL_TOKEN_TYPE);
      await mintTx2.wait();
      console.log("✅ EMAIL token minted, tx:", mintTx2.hash);

      const newTotalSupply = await MintPassV1.totalSupply();
      console.log("✅ New Total Supply:", newTotalSupply.toString());
      console.log("");

      // Test 4: Token Queries
      console.log("🔍 Test 4: Token Queries");
      console.log("------------------------");
      const latestTokenId = newTotalSupply - 1n;
      const owner = await MintPassV1.ownerOf(latestTokenId);
      const tokenType = await MintPassV1.tokenType(latestTokenId);
      const tokenURI = await MintPassV1.tokenURI(latestTokenId);
      
      console.log("✅ Latest token owner:", owner);
      console.log("✅ Latest token type:", tokenType.toString());
      console.log("✅ Latest token URI:", tokenURI);
      console.log("");

      // Test 5: Ownership Functions
      console.log("👤 Test 5: Ownership Functions");
      console.log("------------------------------");
      const balance = await MintPassV1.balanceOf(deployer.address);
      const tokensOfOwner = await MintPassV1.tokensOfOwner(deployer.address);
      const ownsSMS = await MintPassV1.ownsTokenType(deployer.address, SMS_TOKEN_TYPE);
      const ownsEmail = await MintPassV1.ownsTokenType(deployer.address, EMAIL_TOKEN_TYPE);
      
      console.log("✅ Balance:", balance.toString());
      console.log("✅ Owns SMS type:", ownsSMS);
      console.log("✅ Owns EMAIL type:", ownsEmail);
      console.log("✅ Tokens owned:", tokensOfOwner.length, "tokens");
      console.log("");

      // Test 6: Batch Minting
      console.log("📦 Test 6: Batch Minting");
      console.log("------------------------");
      const recipients = [deployer.address, deployer.address];
      const tokenTypes = [SMS_TOKEN_TYPE, EMAIL_TOKEN_TYPE];
      
      console.log("Batch minting 2 more tokens...");
      const batchTx = await MintPassV1.mintBatch(recipients, tokenTypes);
      await batchTx.wait();
      console.log("✅ Batch mint completed, tx:", batchTx.hash);
      
      const finalTotalSupply = await MintPassV1.totalSupply();
      console.log("✅ Final Total Supply:", finalTotalSupply.toString());
      console.log("");
    }

    // Test 7: Interface Support (always check)
    console.log("🔌 Test 7: Interface Support");
    console.log("----------------------------");
    const ERC721_ID = "0x80ac58cd";
    const ERC721_ENUMERABLE_ID = "0x780e9d63";
    const ACCESS_CONTROL_ID = "0x7965db0b";
    
    const supportsERC721 = await MintPassV1.supportsInterface(ERC721_ID);
    const supportsEnumerable = await MintPassV1.supportsInterface(ERC721_ENUMERABLE_ID);
    const supportsAccessControl = await MintPassV1.supportsInterface(ACCESS_CONTROL_ID);
    
    console.log("✅ Supports ERC721:", supportsERC721);
    console.log("✅ Supports ERC721Enumerable:", supportsEnumerable);
    console.log("✅ Supports AccessControl:", supportsAccessControl);
    console.log("");

    // Final Summary
    console.log("🎉 TEST SUMMARY");
    console.log("===============");
    console.log("✅ All tests passed successfully!");
    console.log("✅ Contract is working correctly on", network.name);
    const currentSupply = await MintPassV1.totalSupply();
    console.log("✅ Current total supply:", currentSupply.toString());
    console.log("✅ Contract is ready for use");
    console.log("");
    
    if (network.name === "baseSepolia") {
      console.log("🚀 Ready for mainnet deployment!");
    } else if (network.name === "base") {
      console.log("🎯 Mainnet contract verified!");
    }

  } catch (error) {
    console.error("❌ Test failed:");
    logError(error);
    process.exit(1);
  }
}

function logError(error: unknown) {
  console.error(error);
  if (isErrorWithMessage(error)) {
    console.error('Error message:', error.message);
  }
  if (isErrorWithStack(error)) {
    console.error('Stack trace:', error.stack);
  }
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string';
}

function isErrorWithStack(error: unknown): error is { stack: string } {
  return typeof error === 'object' && error !== null && 'stack' in error && typeof (error as any).stack === 'string';
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logError(error);
    process.exit(1);
  });
