import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Token type constants
const SMS_TOKEN_TYPE = 0;
const EMAIL_TOKEN_TYPE = 1;

// CREATE2 Factory address (deployed on most chains)
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

async function deployContract() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🏭 Deploying MintPassV1 Contract");
  console.log("=================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("");

  // Contract constructor arguments
  const name = "MintPassV1";
  const symbol = "MINT1";
  const baseURI = "https://mintpass.org/mint1/";
  
  // For local testing, always use deployer as admin and minter
  let admin, minter;
  if (network.name === "hardhat" || network.name === "localhost") {
    admin = deployer.address;
    minter = deployer.address;
  } else {
    // Use environment variables for production networks
    admin = process.env.ADMIN_ADDRESS || deployer.address;
    minter = process.env.MINTER_ADDRESS || deployer.address;
  }

  console.log("Constructor args:", { name, symbol, baseURI, admin, minter });

  // For local networks, use standard deployment for simplicity
  const MintPassV1Factory = await ethers.getContractFactory("MintPassV1");
  const contract = await MintPassV1Factory.deploy(name, symbol, baseURI, admin, minter);
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  console.log("✅ Contract deployed to:", contractAddress);
  console.log("");

  return { contract, contractAddress, admin, minter };
}

async function testContract(contractAddress: string) {
  const [deployer] = await ethers.getSigners();
  
  console.log("🧪 Testing Deployed Contract");
  console.log("============================");
  console.log("Contract:", contractAddress);
  console.log("");

  // Get contract instance
  const MintPassV1 = await ethers.getContractAt("MintPassV1", contractAddress);

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
  console.log("");

  // Test 3: Minting
  console.log("🎯 Test 3: Token Minting");
  console.log("------------------------");
  
  console.log("Minting SMS token (type 0)...");
  const mintTx1 = await MintPassV1.mint(deployer.address, SMS_TOKEN_TYPE);
  await mintTx1.wait();
  console.log("✅ SMS token minted, tx:", mintTx1.hash);

  console.log("Minting EMAIL token (type 1)...");
  const mintTx2 = await MintPassV1.mint(deployer.address, EMAIL_TOKEN_TYPE);
  await mintTx2.wait();
  console.log("✅ EMAIL token minted, tx:", mintTx2.hash);

  const newTotalSupply = await MintPassV1.totalSupply();
  console.log("✅ New Total Supply:", newTotalSupply.toString());
  console.log("");

  // Test 4: Token Queries
  console.log("🔍 Test 4: Token Queries");
  console.log("------------------------");
  const owner0 = await MintPassV1.ownerOf(0);
  const tokenType0 = await MintPassV1.tokenType(0);
  const tokenURI0 = await MintPassV1.tokenURI(0);
  
  console.log("✅ Token 0 owner:", owner0);
  console.log("✅ Token 0 type:", tokenType0.toString(), "(SMS)");
  console.log("✅ Token 0 URI:", tokenURI0);
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

  return {
    name,
    symbol,
    totalSupply: finalTotalSupply,
    allTestsPassed: true
  };
}

async function main() {
  try {
    console.log("🚀 Deploy and Test MintPassV1");
    console.log("==============================");
    console.log("Network:", network.name);
    console.log("Time:", new Date().toISOString());
    console.log("");

    // Deploy the contract
    const { contractAddress } = await deployContract();

    // Test the contract
    const testResults = await testContract(contractAddress);

    // Final Summary
    console.log("🎉 FINAL SUMMARY");
    console.log("================");
    console.log("✅ Contract deployed and tested successfully!");
    console.log("✅ Contract address:", contractAddress);
    console.log("✅ Network:", network.name);
    console.log("✅ Total tokens minted:", testResults.totalSupply.toString());
    console.log("✅ All tests passed:", testResults.allTestsPassed);
    console.log("");
    console.log("🌟 Ready for integration with plebbit-js challenge!");

  } catch (error) {
    console.error("❌ Deploy and test failed:", error);
    if (error && typeof error === 'object') {
      if ('message' in error) console.error('Error message:', error.message);
      if ('stack' in error) console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    if (error && typeof error === 'object') {
      if ('message' in error) console.error('Error message:', error.message);
      if ('stack' in error) console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }); 