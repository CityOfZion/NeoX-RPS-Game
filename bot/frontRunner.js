const { ethers } = require("ethers");
require("dotenv").config();

const CONTRACT_ABI = [
  "function playRound(uint256 roundId, uint8 move) external",
  "function getRound(uint256 roundId) external view returns (address,address,uint8,uint8,uint8,uint8,uint64,uint256,uint256,uint8)",
];

const MoveNames = ["None", "Rock", "Paper", "Scissors"];
const RoundStateNames = ["None", "Active", "Won", "Refunded"];

function formatRoundSnapshot(round) {
  return {
    player: round[0],
    winner: round[1],
    houseMove: MoveNames[Number(round[2])],
    winningMove: MoveNames[Number(round[3])],
    submittedMove: MoveNames[Number(round[4])],
    state: RoundStateNames[Number(round[5])] || `Unknown(${Number(round[5])})`,
    deadline: Number(round[6]),
  };
}

class FrontRunnerBot {
  constructor(contractAddress, rpcUrl, wsUrl, privateKey) {
    this.contractAddress = contractAddress;
    this.readProvider = new ethers.JsonRpcProvider(rpcUrl);
    this.provider = wsUrl ? new ethers.WebSocketProvider(wsUrl) : this.readProvider;
    this.wallet = new ethers.Wallet(privateKey, this.readProvider);
    this.contract = new ethers.Contract(contractAddress, CONTRACT_ABI, this.wallet);
    this.seenTransactions = new Set();
    this.feeMultiplier = 10n;
    this.recycleWinnings = process.env.BOT_RECYCLE_WINNINGS !== "false";
    this.gasReserve = ethers.parseEther(process.env.BOT_GAS_RESERVE_GAS || "0.05");

    console.log("Front-running bot ready");
    console.log("Bot address:", this.wallet.address);
    console.log("Contract address:", contractAddress);
    console.log("Pending feed:", wsUrl || rpcUrl);
    console.log("Recycle winnings:", this.recycleWinnings ? "enabled" : "disabled");
    console.log("Gas reserve:", ethers.formatEther(this.gasReserve), "GAS");
  }

  async startMonitoring() {
    console.log("Monitoring pending public play transactions...");

    this.provider.on("pending", async (txHash) => {
      if (this.seenTransactions.has(txHash)) return;
      this.seenTransactions.add(txHash);

      try {
        const tx = await this.readProvider.getTransaction(txHash);
        if (!tx || !tx.to) return;
        if (tx.to.toLowerCase() !== this.contractAddress.toLowerCase()) return;
        if (tx.from.toLowerCase() === this.wallet.address.toLowerCase()) return;

        let decoded;
        try {
          decoded = this.contract.interface.parseTransaction({
            data: tx.data,
            value: tx.value,
          });
        } catch {
          return;
        }

        if (!decoded || decoded.name !== "playRound") return;

        const roundId = Number(decoded.args[0]);
        const move = Number(decoded.args[1]);

        console.log(
          `Public tx detected: round ${roundId}, move ${MoveNames[move]}, tx ${tx.hash}, from ${tx.from}`
        );

        const round = await this.contract.getRound(roundId);
        const player = round[0];
        const winner = round[1];
        const winningMove = Number(round[3]);
        const state = Number(round[5]);

        if (!player || player === ethers.ZeroAddress) {
          console.log(`Skipping round ${roundId}: round not found on-chain yet.`);
          return;
        }
        if (state !== 1) {
          console.log(`Skipping round ${roundId}: round state is ${RoundStateNames[state] || state}.`, formatRoundSnapshot(round));
          return;
        }
        if (winner !== ethers.ZeroAddress) {
          console.log(`Skipping round ${roundId}: winner already set to ${winner}.`, formatRoundSnapshot(round));
          return;
        }
        if (move !== winningMove) {
          console.log(
            `Skipping round ${roundId}: observed move ${MoveNames[move]} is not the winning move ${MoveNames[winningMove]}.`,
            formatRoundSnapshot(round)
          );
          return;
        }

        const alreadyMined = await this.readProvider.getTransactionReceipt(txHash);
        if (alreadyMined) {
          console.log(
            `Skipping round ${roundId}: observed tx ${txHash} was already mined before bot could race it.`,
            {
              status: alreadyMined.status,
              blockNumber: alreadyMined.blockNumber,
            }
          );
          return;
        }

        await this.frontRun(roundId, move, tx);
      } catch (error) {
        console.error("Pending tx handling failed:", error.message);
      }
    });
  }

  async frontRun(roundId, move, observedTx) {
    try {
      const feeOverrides = {};

      if (observedTx.maxFeePerGas && observedTx.maxPriorityFeePerGas) {
        feeOverrides.maxFeePerGas = observedTx.maxFeePerGas * this.feeMultiplier;
        feeOverrides.maxPriorityFeePerGas = observedTx.maxPriorityFeePerGas * this.feeMultiplier;
      } else if (observedTx.gasPrice) {
        feeOverrides.gasPrice = observedTx.gasPrice * this.feeMultiplier;
      }

      feeOverrides.gasLimit = 150000n;

      console.log(`Attempting to steal round ${roundId} with move ${MoveNames[move]}...`, {
        observedTx: observedTx.hash,
        feeOverrides: {
          maxFeePerGas: feeOverrides.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: feeOverrides.maxPriorityFeePerGas?.toString(),
          gasPrice: feeOverrides.gasPrice?.toString(),
          gasLimit: feeOverrides.gasLimit.toString(),
        },
      });

      await this.contract.playRound.staticCall(roundId, move);

      const populated = await this.contract.playRound.populateTransaction(roundId, move);
      const tx = await this.wallet.sendTransaction({
        ...populated,
        ...feeOverrides,
      });
      console.log(`Front-run tx sent: ${tx.hash}`);
      await tx.wait();
      console.log(`Round ${roundId} stolen successfully.`);

      if (this.recycleWinnings) {
        await this.recyclePrizeToPool(roundId);
      }
    } catch (error) {
      try {
        const round = await this.contract.getRound(roundId);
        console.error(
          `Front-run failed for round ${roundId}:`,
          error.message,
          "\nRound snapshot:",
          formatRoundSnapshot(round)
        );
      } catch (snapshotError) {
        console.error(`Front-run failed for round ${roundId}:`, error.message);
        console.error("Could not fetch round snapshot:", snapshotError.message);
      }
    }
  }

  async recyclePrizeToPool(roundId) {
    try {
      const round = await this.contract.getRound(roundId);
      const winner = round[1];
      const prizeAmount = BigInt(round[8]);

      if (winner.toLowerCase() !== this.wallet.address.toLowerCase()) {
        console.log(`Skipping recycle for round ${roundId}: bot is not the winner.`);
        return;
      }
      if (prizeAmount === 0n) {
        console.log(`Skipping recycle for round ${roundId}: prize amount is zero.`);
        return;
      }

      const balance = await this.readProvider.getBalance(this.wallet.address);
      const recyclable = balance > this.gasReserve ? balance - this.gasReserve : 0n;
      const amountToSend = recyclable < prizeAmount ? recyclable : prizeAmount;

      if (amountToSend === 0n) {
        console.log(
          `Skipping recycle for round ${roundId}: wallet balance ${ethers.formatEther(balance)} GAS is at or below reserve ${ethers.formatEther(this.gasReserve)} GAS.`
        );
        return;
      }

      const recycleTx = await this.wallet.sendTransaction({
        to: this.contractAddress,
        value: amountToSend,
      });
      console.log(
        `Recycling ${ethers.formatEther(amountToSend)} GAS back to pool for round ${roundId}: ${recycleTx.hash}`
      );
      await recycleTx.wait();
      console.log(`Recycle confirmed for round ${roundId}.`);
    } catch (error) {
      console.error(`Recycle failed for round ${roundId}:`, error.message);
    }
  }
}

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const rpcUrl = process.env.NEOX_RPC_URL || "http://127.0.0.1:8545";
  const wsUrl = process.env.NEOX_WSS_URL || "";
  const privateKey = process.env.PRIVATE_KEY;

  if (!contractAddress || !privateKey) {
    console.error("Set CONTRACT_ADDRESS and PRIVATE_KEY in .env");
    process.exit(1);
  }

  const bot = new FrontRunnerBot(contractAddress, rpcUrl, wsUrl, privateKey);
  await bot.startMonitoring();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
