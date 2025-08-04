import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// CREATE2 Factory address (deployed on most chains)
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

/**
 * Mine a vanity address by trying different salt values
 * @param prefix The desired prefix (without 0x)
 * @param creationCodeHash The keccak256 hash of the creation code
 * @param factoryAddress The CREATE2 factory address
 * @param maxAttempts Maximum number of attempts before giving up
 * @returns The salt that produces the vanity address, or null if not found
 */
async function mineVanityAddress(
  prefix: string, 
  creationCodeHash: string, 
  factoryAddress: string, 
  maxAttempts: number = 100000
): Promise<string | null> {
  console.log(`🔍 Mining vanity address starting with 0x${prefix.toUpperCase()}...`);
  console.log(`⏱️  This may take a few moments...`);
  
  const startTime = Date.now();
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    // Generate a random salt
    const randomBytes = ethers.randomBytes(32);
    const salt = ethers.hexlify(randomBytes);
    
    // Calculate the CREATE2 address
    const address = ethers.getCreate2Address(factoryAddress, salt, creationCodeHash);
    
    // Check if it starts with our desired prefix (case insensitive)
    if (address.toLowerCase().startsWith(`0x${prefix.toLowerCase()}`)) {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`🎉 Found vanity address in ${attempts + 1} attempts!`);
      console.log(`⏱️  Time taken: ${duration.toFixed(2)} seconds`);
      console.log(`✨ Address: ${address}`);
      console.log(`🔑 Salt: ${salt}`);
      console.log("");
      
      return salt;
    }
    
    attempts++;
    
    // Progress indicator
    if (attempts % 10000 === 0) {
      console.log(`🔄 Tried ${attempts} combinations...`);
    }
  }
  
  console.log(`❌ Could not find vanity address after ${maxAttempts} attempts`);
  return null;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🏭 Deterministic MintPassV1 Deployment");
  console.log("====================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // Contract constructor arguments
  const name = "MintPassV1";
  const symbol = "MINT1";
      const baseURI = "https://mintpass.org/mint1/";
  
  // Use environment variables for production addresses, fallback to deployer for testing
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const minter = process.env.MINTER_ADDRESS || deployer.address;

  console.log("Constructor args:", { name, symbol, baseURI, admin, minter });
  console.log("");

  // Get contract factory
  const MintPassV1Factory = await ethers.getContractFactory("MintPassV1");
  
  // Encode constructor arguments
  const constructorArgs = [name, symbol, baseURI, admin, minter];
  const encodedArgs = MintPassV1Factory.interface.encodeDeploy(constructorArgs);
  
  // Get creation code with constructor arguments
  const creationCode = MintPassV1Factory.bytecode + encodedArgs.slice(2);
  const creationCodeHash = ethers.keccak256(creationCode);

  // Mine a vanity address starting with 9A55
  let salt = await mineVanityAddress("9A55", creationCodeHash, CREATE2_FACTORY);
  
  if (!salt) {
    console.log("❌ Failed to find vanity address, using fallback salt");
    salt = ethers.keccak256(ethers.toUtf8Bytes("MintPassV1-v1.0.0"));
    console.log("Fallback Salt:", salt);
  }
  
  // Calculate the deterministic address
  const deterministicAddress = ethers.getCreate2Address(
    CREATE2_FACTORY,
    salt,
    creationCodeHash
  );
  
  console.log("📍 Predicted contract address:", deterministicAddress);
  console.log("");

  // Check if contract is already deployed
  const existingCode = await ethers.provider.getCode(deterministicAddress);
  if (existingCode !== "0x") {
    console.log("✅ Contract already deployed at this address!");
    console.log("Contract address:", deterministicAddress);
    
    // Save deployment info
    await saveDeploymentInfo({
      contractAddress: deterministicAddress,
      deployer: deployer.address,
      admin,
      minter,
      constructorArgs,
      salt,
      alreadyDeployed: true
    });
    
    return;
  }

  console.log("🚀 Deploying new contract...");

  // For local networks, use a simpler deterministic approach
  let tx;
  let deployedContractAddress = deterministicAddress;
  
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("Using local deterministic deployment...");
    
    // Use deterministic deployment via Hardhat's deterministic deployer
    // Reuse the factory already created above
    const contract = await MintPassV1Factory.deploy(
      constructorArgs[0], // name
      constructorArgs[1], // symbol  
      constructorArgs[2], // baseURI
      constructorArgs[3], // admin
      constructorArgs[4], // minter
      {
        // Use a specific nonce to make it deterministic for local testing
        nonce: await ethers.provider.getTransactionCount(deployer.address)
      }
    );
    
    tx = contract.deploymentTransaction();
    if (!tx) throw new Error("Deployment transaction not found");
    
    deployedContractAddress = await contract.getAddress();
    console.log("Local deployment address:", deployedContractAddress);
    console.log("(Note: Address may vary on local networks)");
  } else {
    // Check if CREATE2 factory exists on production networks
    const factoryCode = await ethers.provider.getCode(CREATE2_FACTORY);
    if (factoryCode === "0x") {
      throw new Error(`CREATE2 factory not deployed on ${network.name} at ${CREATE2_FACTORY}`);
    }

    // Deploy using CREATE2 factory
    const factoryInterface = new ethers.Interface([
      "function deploy(uint256 amount, bytes32 salt, bytes memory bytecode) external returns (address)"
    ]);

    const deployData = factoryInterface.encodeFunctionData("deploy", [
      0, // amount (no ETH to send)
      salt,
      creationCode
    ]);

    console.log("Sending CREATE2 deployment transaction...");
    tx = await deployer.sendTransaction({
      to: CREATE2_FACTORY,
      data: deployData,
      gasLimit: 5000000 // Increased gas limit for contract deployment (~2.6M + overhead)
    });
  }

  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);

  // Verify the deployment
  const deployedCode = await ethers.provider.getCode(deployedContractAddress);
  if (deployedCode === "0x") {
    throw new Error("Contract deployment failed - no code at deployed address");
  }

  console.log("🎉 Contract deployed successfully!");
  console.log("Contract address:", deployedContractAddress);
  console.log("");

  // Wait for block confirmations before verification
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for additional confirmations...");
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
  }

  // Verify contract on explorer
  if (network.name === "base" || network.name === "baseSepolia") {
    try {
      console.log("🔍 Verifying contract on Basescan...");
      const { run } = await import("hardhat");
      await run("verify:verify", {
        address: deterministicAddress,
        constructorArguments: constructorArgs,
      });
      console.log("✅ Contract verified successfully!");
    } catch (error) {
      console.log("⚠️ Verification failed:", error);
    }
  }

  // Save deployment info
  await saveDeploymentInfo({
    contractAddress: deployedContractAddress,
    deployer: deployer.address,
    admin,
    minter,
    constructorArgs,
    salt,
    alreadyDeployed: false
  });

  console.log("📋 Deployment Summary:");
  console.log("=====================");
  console.log("Network:", network.name);
  console.log("Contract:", deployedContractAddress);
  console.log("Salt:", salt);
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin);
  console.log("Minter:", minter);
  console.log("");
  
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("🏠 Local deployment - address may vary between restarts");
  } else {
    console.log("🌟 This address will be the same on ALL chains when using the same salt!");
  }
}

async function saveDeploymentInfo(info: {
  contractAddress: string;
  deployer: string;
  admin: string;
  minter: string;
  constructorArgs: any[];
  salt: string;
  alreadyDeployed: boolean;
}) {
  const deploymentInfo = {
    network: {
      name: network.name,
      chainId: Number((await ethers.provider.getNetwork()).chainId)
    },
    contractAddress: info.contractAddress,
    deployer: info.deployer,
    admin: info.admin,
    minter: info.minter,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    constructorArgs: info.constructorArgs,
    contractName: "MintPassV1",
    deploymentMethod: "CREATE2",
    salt: info.salt,
    create2Factory: CREATE2_FACTORY,
    alreadyDeployed: info.alreadyDeployed
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save deployment info
  const deploymentFile = path.join(deploymentsDir, `MintPassV1-${network.name}-deterministic.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("💾 Deployment info saved to:", deploymentFile);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    if (error && typeof error === 'object') {
      if ('message' in error) console.error('Error message:', error.message);
      if ('stack' in error) console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }); 