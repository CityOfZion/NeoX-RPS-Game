const { ethers } = require("ethers");

/**
 * Generate a new wallet for testnet deployment
 * This creates a random wallet with a new private key
 */
async function main() {
  // Generate a new random wallet
  const wallet = ethers.Wallet.createRandom();
  
  console.log("\n=== New Wallet Generated ===\n");
  console.log("Address:", wallet.address);
  console.log("Private Key:", wallet.privateKey);
  console.log("\n⚠️  IMPORTANT SECURITY NOTES:");
  console.log("1. Save this private key securely - you won't be able to recover it!");
  console.log("2. This is a NEW wallet - it has NO funds yet");
  console.log("3. You'll need to fund it with NeoX testnet GAS tokens");
  console.log("4. Add the private key to your .env file:");
  console.log(`   PRIVATE_KEY=${wallet.privateKey.replace('0x', '')}`);
  console.log("\n📝 Next Steps:");
  console.log("1. Copy the private key above (without 0x prefix)");
  console.log("2. Add it to your .env file: PRIVATE_KEY=...");
  console.log("3. Get testnet GAS tokens from NeoX faucet");
  console.log("4. Deploy your contract!");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
