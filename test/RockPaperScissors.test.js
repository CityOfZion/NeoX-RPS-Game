const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BeatTheHouse", function () {
  let game;
  let owner;
  let player;
  let bot;

  beforeEach(async function () {
    [owner, player, bot] = await ethers.getSigners();

    const BeatTheHouse = await ethers.getContractFactory("BeatTheHouse");
    game = await BeatTheHouse.deploy();
    await game.waitForDeployment();

    await owner.sendTransaction({
      to: await game.getAddress(),
      value: ethers.parseEther("10.0"),
    });
  });

  async function startRound(actor = player, bet = "0.01", mode = 0) {
    const tx = await game.connect(actor).startRound(mode, { value: ethers.parseEther(bet) });
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return game.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "RoundStarted");

    return {
      roundId: Number(event.args.roundId),
      winningMove: Number(event.args.winningMove),
      houseMove: Number(event.args.houseMove),
      mode: Number(event.args.mode),
    };
  }

  it("starts a round and stores the public challenge", async function () {
    const { roundId, winningMove, houseMove, mode } = await startRound();
    const round = await game.getRound(roundId);

    expect(round[0]).to.equal(player.address);
    expect(Number(round[2])).to.equal(houseMove);
    expect(Number(round[3])).to.equal(winningMove);
    expect(Number(round[5])).to.equal(1);
    expect(Number(round[9])).to.equal(mode);
  });

  it("awards the 10x standard prize to the first correct submitter", async function () {
    const { roundId, winningMove } = await startRound(player, "0.01", 0);
    const balanceBefore = await ethers.provider.getBalance(await game.getAddress());

    await expect(game.connect(bot).playRound(roundId, winningMove)).to.emit(game, "RoundWon");

    const round = await game.getRound(roundId);
    const balanceAfter = await ethers.provider.getBalance(await game.getAddress());
    expect(round[1]).to.equal(bot.address);
    expect(Number(round[5])).to.equal(2);
    expect(balanceBefore - balanceAfter).to.equal(ethers.parseEther("0.10"));
  });

  it("awards the 2x protected prize to the first correct submitter", async function () {
    const { roundId, winningMove } = await startRound(player, "0.01", 1);
    const balanceBefore = await ethers.provider.getBalance(await game.getAddress());

    await expect(game.connect(player).playRound(roundId, winningMove)).to.emit(game, "RoundWon");

    const round = await game.getRound(roundId);
    const balanceAfter = await ethers.provider.getBalance(await game.getAddress());
    expect(round[1]).to.equal(player.address);
    expect(Number(round[9])).to.equal(1);
    expect(balanceBefore - balanceAfter).to.equal(ethers.parseEther("0.02"));
  });

  it("rejects an incorrect move", async function () {
    const { roundId, winningMove } = await startRound();
    const wrongMove = winningMove === 1 ? 2 : 1;

    await expect(game.connect(player).playRound(roundId, wrongMove)).to.emit(game, "RoundLost");

    const round = await game.getRound(roundId);
    expect(Number(round[4])).to.equal(wrongMove);
    expect(Number(round[5])).to.equal(2);
    expect(round[1]).to.equal(ethers.ZeroAddress);
  });

  it("refunds an expired round back to the player", async function () {
    const { roundId } = await startRound();
    const balanceBefore = await ethers.provider.getBalance(await game.getAddress());

    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine");

    await expect(game.connect(player).refundExpiredRound(roundId)).to.emit(game, "RoundRefunded");

    const round = await game.getRound(roundId);
    const balanceAfter = await ethers.provider.getBalance(await game.getAddress());
    expect(Number(round[5])).to.equal(3);
    expect(balanceBefore - balanceAfter).to.equal(ethers.parseEther("0.01"));
  });

  it("allows the owner to withdraw a partial amount", async function () {
    const balanceBefore = await ethers.provider.getBalance(await game.getAddress());

    await expect(game.connect(owner).withdraw(owner.address, ethers.parseEther("1.5")))
      .to.emit(game, "Withdrawal")
      .withArgs(owner.address, ethers.parseEther("1.5"));

    const balanceAfter = await ethers.provider.getBalance(await game.getAddress());
    expect(balanceBefore - balanceAfter).to.equal(ethers.parseEther("1.5"));
  });

  it("rejects withdraw for non-owners", async function () {
    await expect(
      game.connect(player).withdraw(player.address, ethers.parseEther("1.0"))
    ).to.be.revertedWith("Only owner");
  });

  it("allows the owner to withdraw the full balance", async function () {
    await game.connect(owner).withdrawAll(owner.address);
    const balanceAfter = await ethers.provider.getBalance(await game.getAddress());
    expect(balanceAfter).to.equal(0n);
  });
});
