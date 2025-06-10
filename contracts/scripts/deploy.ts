import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Network:", network.name);

  const MintPassV1 = await ethers.getContractFactory("MintPassV1");
  
  // Contract constructor arguments
  const name = "MintPassV1";
  const symbol = "MP1";
  const baseURI = "plebbitlabs.com/mintpass/mintpassV1"; // As specified in milestones
  
  // Use environment variables for production addresses, fallback to deployer for testing
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const minter = process.env.MINTER_ADDRESS || deployer.address;

  console.log("Deploying MintPassV1...");
  console.log("Constructor args:", { name, symbol, baseURI, admin, minter });
  
  const mintpass = await MintPassV1.deploy(name, symbol, baseURI, admin, minter);
  await mintpass.waitForDeployment();
  
  const contractAddress = await mintpass.getAddress();
  console.log("MintPassV1 deployed to:", contractAddress);
  
  // Wait for a few block confirmations before verification
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations...");
    await mintpass.deploymentTransaction()?.wait(5);
  }
  
  // Log deployment details for verification
  console.log("\nDeployment Summary:");
  console.log("==================");
  console.log("Network:", network.name);
  console.log("Contract Name:", name);
  console.log("Contract Symbol:", symbol);
  console.log("Base URI:", baseURI);
  console.log("Admin Role:", admin);
  console.log("Minter Role:", minter);
  console.log("Contract Address:", contractAddress);
  console.log("Deployer:", deployer.address);
  
  // Verify contract on Basescan if not local network
  if (network.name === "base" || network.name === "baseSepolia") {
    try {
      console.log("\nVerifying contract on Basescan...");
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [name, symbol, baseURI, admin, minter],
      });
      console.log("Contract verified successfully!");
    } catch (error) {
      console.log("Verification failed:", error);
    }
  }
  
  // Save deployment info to deployments directory
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save deployment info
  const deploymentInfo = {
    network: {
      name: network.name,
      chainId: (await ethers.provider.getNetwork()).chainId.toString()
    },
    contractAddress: contractAddress,
    deployer: deployer.address,
    admin: admin,
    minter: minter,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    constructorArgs: [name, symbol, baseURI, admin, minter],
    contractName: "MintPassV1"
  };
  
  // Save deployment info
  const deploymentFile = path.join(deploymentsDir, `MintPassV1-${network.name}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\nDeployment Info saved to:", deploymentFile);
  console.log("\nFor manual verification, use these constructor arguments:");
  console.log(JSON.stringify([name, symbol, baseURI, admin, minter]));
  
  if (admin === deployer.address || minter === deployer.address) {
    console.log("\n⚠️  WARNING: Using deployer address for admin/minter roles.");
    console.log("For production, set ADMIN_ADDRESS and MINTER_ADDRESS environment variables.");
    console.log("Admin should be a hardware wallet, minter should be your server address.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 