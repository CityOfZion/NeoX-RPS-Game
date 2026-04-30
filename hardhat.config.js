require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    neox: {
      // Neo X mainnet deployment should use a regular RPC, not the anti-MEV route.
      url: process.env.NEOX_RPC_URL || "https://mainnet-1.rpc.banelabs.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 47763, // Neo X mainnet chain ID
      gasPrice: 40000000000, // 40 gwei
      timeout: 300000, // 5 minutes
      httpHeaders: {},
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
