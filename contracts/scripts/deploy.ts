import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const MintPassV1 = await ethers.getContractFactory("MintPassV1");
  
  // Contract constructor arguments
  const name = "MintPassV1";
  const symbol = "MPSS";
  const baseURI = "https://plebbitlabs.com/mintpass/mintpassV1/";
  const admin = deployer.address; // Can be changed to a hardware wallet later
  const minter = deployer.address; // Can be changed to a server address later

  console.log("Deploying MintPassV1...");
  const mintpass = await MintPassV1.deploy(name, symbol, baseURI, admin, minter);

  await mintpass.waitForDeployment();
  
  const contractAddress = await mintpass.getAddress();
  console.log("MintPassV1 deployed to:", contractAddress);
  
  // Log deployment details for verification
  console.log("\nDeployment Summary:");
  console.log("==================");
  console.log("Contract Name:", name);
  console.log("Contract Symbol:", symbol);
  console.log("Base URI:", baseURI);
  console.log("Admin Role:", admin);
  console.log("Minter Role:", minter);
  console.log("Contract Address:", contractAddress);
  
  // Save deployment info
  const deploymentInfo = {
    network: await ethers.provider.getNetwork(),
    contractAddress: contractAddress,
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    constructorArgs: [name, symbol, baseURI, admin, minter]
  };
  
  console.log("\nDeployment Info for verification:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 