import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Load the custom CREATE2 factory address from deployment file
 * @returns The factory address and deployment info
 */
function loadFactoryAddress(): { address: string; info: any } {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const factoryFile = path.join(deploymentsDir, `Create2Factory-${network.name}.json`);
  
  if (!fs.existsSync(factoryFile)) {
    throw new Error(`Custom CREATE2 factory not deployed on ${network.name}. Run 'yarn deploy:factory' first.`);
  }
  
  const factoryInfo = JSON.parse(fs.readFileSync(factoryFile, 'utf8'));
  console.log("📂 Loaded custom factory:", factoryInfo.factoryAddress);
  return { address: factoryInfo.factoryAddress, info: factoryInfo };
}

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
    
    // Calculate the CREATE2 address using our custom factory
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
  
  console.log("🏭 Deterministic MintPassV1 Deployment (Custom Factory)");
  console.log("======================================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // Load our custom factory
  const factory = loadFactoryAddress();
  const CUSTOM_FACTORY = factory.address;

  // Contract constructor arguments  
  const name = "MintPassV1";
  const symbol = "MINT1"; // Using MINT1 as specified in memories
  const baseURI = "https://plebbitlabs.com/mintpass/mint1/";
  
  // Use deployer address for testing (avoid env var issues)
  const admin = deployer.address;
  const minter = deployer.address;

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
  let salt = await mineVanityAddress("9A55", creationCodeHash, CUSTOM_FACTORY);
  
  if (!salt) {
    console.log("❌ Failed to find vanity address, using fallback salt");
    salt = ethers.keccak256(ethers.toUtf8Bytes("MintPassV1-v1.0.0"));
    console.log("Fallback Salt:", salt);
  }
  
  // Calculate the deterministic address
  const deterministicAddress = ethers.getCreate2Address(
    CUSTOM_FACTORY,
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
      factoryAddress: CUSTOM_FACTORY,
      alreadyDeployed: true
    });
    
    return;
  }

  console.log("🚀 Deploying new contract through custom factory...");

  // Get factory contract instance
  const factoryContract = await ethers.getContractAt("Create2Factory", CUSTOM_FACTORY);

  // Deploy using our custom CREATE2 factory
  console.log("Sending CREATE2 deployment transaction...");
  const tx = await factoryContract.deploy(salt, creationCode, {
    gasLimit: 15000000 // Much higher gas limit for large contract deployment
  });

  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);
  console.log("Gas used:", receipt?.gasUsed?.toString());

  // Check for deployment events
  let deployedAddress = deterministicAddress;
  if (receipt?.logs) {
    for (const log of receipt.logs) {
      try {
        const parsed = factoryContract.interface.parseLog(log);
        if (parsed?.name === "ContractDeployed") {
          deployedAddress = parsed.args[0];
          console.log("📍 Contract deployed at:", deployedAddress);
          break;
        }
      } catch (e) {
        // Ignore unparseable logs
      }
    }
  }

  // Add a small delay to ensure the code is available
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Verify the deployment
  const deployedCode = await ethers.provider.getCode(deployedAddress);
  console.log("Code length at deployed address:", deployedCode.length);
  if (deployedCode === "0x") {
    throw new Error("Contract deployment failed - no code at deployed address");
  }

  console.log("🎉 Contract deployed successfully!");
  console.log("Contract address:", deterministicAddress);
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
    contractAddress: deterministicAddress,
    deployer: deployer.address,
    admin,
    minter,
    constructorArgs,
    salt,
    factoryAddress: CUSTOM_FACTORY,
    alreadyDeployed: false
  });

  console.log("📋 Deployment Summary:");
  console.log("=====================");
  console.log("Network:", network.name);
  console.log("Contract:", deterministicAddress);
  console.log("Salt:", salt);
  console.log("Factory:", CUSTOM_FACTORY);
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin);
  console.log("Minter:", minter);
  console.log("");
  
  console.log("🌟 This address will be the same on ALL chains when using the same salt and factory!");
}

async function saveDeploymentInfo(info: {
  contractAddress: string;
  deployer: string;
  admin: string;
  minter: string;
  constructorArgs: any[];
  salt: string;
  factoryAddress: string;
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
    deploymentMethod: "Custom CREATE2 Factory",
    salt: info.salt,
    factoryAddress: info.factoryAddress,
    alreadyDeployed: info.alreadyDeployed
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save deployment info
  const deploymentFile = path.join(deploymentsDir, `MintPassV1-${network.name}-custom-factory.json`);
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