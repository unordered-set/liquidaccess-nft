require('dotenv').config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-ethernal";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    localhost: {
      url: '127.0.0.1:8545',
    },
    mumbai: {
      url: process.env.POLYGON_TESTNET_URL,
      accounts: [process.env.PRIVATE_KEY ?? ''],
    },
    polygon: {
      url: process.env.POLYGON_MAINNET_URL,
      accounts: [process.env.PRIVATE_KEY ?? ''],
    },
  },

  etherscan: {
    apiKey: process.env.POLYGON_API_KEY
  },

  // copy-paste from documentation
  ethernal: {
    disableSync: false, // If set to true, plugin will not sync blocks & txs
    disableTrace: false, // If set to true, plugin won't trace transaction
    workspace: undefined, // Set the workspace to use, will default to the default workspace (latest one used in the dashboard). It is also possible to set it through the ETHERNAL_WORKSPACE env variable
    uploadAst: false, // If set to true, plugin will upload AST, and you'll be able to use the storage feature (longer sync time though)
    disabled: false, // If set to true, the plugin will be disabled, nohting will be synced, ethernal.push won't do anything either
    resetOnStart: undefined // Pass a workspace name to reset it automatically when restarting the node, note that if the workspace doesn't exist it won't error
  },
};

export default config;
