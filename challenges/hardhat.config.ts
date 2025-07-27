import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// Extend the base hardhat config from contracts
import baseConfig from "../contracts/hardhat.config";

const config: HardhatUserConfig = {
  ...baseConfig,
  // Override the default test directory to include both contracts and challenges tests
  paths: {
    sources: "../contracts/contracts",
    tests: "./test",
    cache: "../contracts/cache",
    artifacts: "../contracts/artifacts",
  },
  typechain: {
    outDir: "../contracts/typechain-types",
    target: "ethers-v6",
  },
  networks: {
    ...baseConfig.networks,
    hardhat: {
      ...baseConfig.networks?.hardhat,
      chainId: 1337,
      mining: {
        auto: true,
        interval: 0
      }
    }
  }
};

export default config; 