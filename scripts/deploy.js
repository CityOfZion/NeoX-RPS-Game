const hre = require("hardhat");

async function main() {
  console.log("Deploying BeatTheHouse contract...");

  const BeatTheHouse = await hre.ethers.getContractFactory("BeatTheHouse");
  const game = await BeatTheHouse.deploy();

  await game.waitForDeployment();
  const address = await game.getAddress();

  console.log("BeatTheHouse deployed to:", address);

  const [deployer] = await hre.ethers.getSigners();
  const fundAmountGas = process.env.FUND_AMOUNT_GAS?.trim();

  if (fundAmountGas) {
    const fundAmount = hre.ethers.parseEther(fundAmountGas);
    const tx = await deployer.sendTransaction({
      to: address,
      value: fundAmount,
    });
    await tx.wait();
    console.log(`Funded contract with ${hre.ethers.formatEther(fundAmount)} GAS`);
  } else {
    console.log("Skipping post-deploy funding. Set FUND_AMOUNT_GAS to fund the contract automatically.");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", address);
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("Auto Funding:", fundAmountGas ? `${fundAmountGas} GAS` : "disabled");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
