import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🏭 Custom CREATE2 Factory Deployment");
  console.log("===================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // Get contract factory
  const Create2FactoryContract = await ethers.getContractFactory("Create2Factory");
  
  console.log("🚀 Deploying CREATE2 Factory...");
  
  // Deploy the factory
  const factory = await Create2FactoryContract.deploy();
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log("✅ CREATE2 Factory deployed successfully!");
  console.log("Factory address:", factoryAddress);
  console.log("");

  // Wait for block confirmations before verification
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for additional confirmations...");
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
  }

  // Verify contract on explorer
  if (network.name === "base" || network.name === "baseSepolia") {
    try {
      console.log("🔍 Verifying factory contract on Basescan...");
      const { run } = await import("hardhat");
      await run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [],
      });
      console.log("✅ Factory contract verified successfully!");
    } catch (error) {
      console.log("⚠️ Verification failed:", error);
    }
  }

  // Save factory deployment info
  const factoryInfo = {
    network: {
      name: network.name,
      chainId: Number((await ethers.provider.getNetwork()).chainId)
    },
    factoryAddress,
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    contractName: "Create2Factory"
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save factory deployment info
  const factoryFile = path.join(deploymentsDir, `Create2Factory-${network.name}.json`);
  fs.writeFileSync(factoryFile, JSON.stringify(factoryInfo, null, 2));
  
  console.log("💾 Factory deployment info saved to:", factoryFile);

  console.log("");
  console.log("📋 Deployment Summary:");
  console.log("=====================");
  console.log("Network:", network.name);
  console.log("Factory Address:", factoryAddress);
  console.log("Deployer:", deployer.address);
  console.log("");
  console.log("🎉 Factory is ready for deterministic deployments!");
  console.log("💡 Use this factory address in your deployment scripts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Factory deployment failed:", error);
    if (error && typeof error === 'object') {
      if ('message' in error) console.error('Error message:', error.message);
      if ('stack' in error) console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }); 