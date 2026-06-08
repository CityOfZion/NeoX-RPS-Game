# Rock Paper Scissors

This repository is a Rock Paper Scissors demo built to show one core idea:

- the same game action is vulnerable when sent through the public mempool
- the same game action is protected when sent through Neo X protected transactions

## Game objective

For each round, the contract publishes the house move. The player must submit the correct counter move before the deadline:

- Rock -> play Paper
- Paper -> play Scissors
- Scissors -> play Rock

The first valid winning transaction gets the prize.

## How the game works

1. Player starts a round by calling `startRound()` with a stake.
2. Contract creates round state: player, house move, winning move, deadline, and prize.
3. Player submits `playRound(roundId, move)` using either:
   - a normal public transaction, or
   - a protected transaction path
4. If the move is correct and arrives first, the caller wins.
5. If the round expires without a winner, `refundExpiredRound(roundId)` returns funds according to contract rules.

## How this showcases anti-MEV

The contract call is identical in both modes. Only the transaction path changes.

- Public mode:
  - `playRound(roundId, move)` appears in mempool calldata.
  - A bot can read the move and copy the same call with a higher fee.
  - The bot can win by being included first.
- Protected mode:
  - The move is not exposed to public mempool observers before inclusion.
  - The copy-trading bot cannot decode and replay in time.
  - The original player keeps the advantage.

This makes the anti-MEV behavior easy to inspect because game rules stay constant while transaction visibility changes.

## Code walkthrough

- `contracts/RockPaperScissors.sol`
  - core round lifecycle: `startRound`, `playRound`, `refundExpiredRound`
  - validation and payout logic
- `bot/frontRunner.js`
  - listens to pending public transactions
  - decodes `playRound(roundId, move)` calldata
  - sends a competing replacement/copy transaction
- `frontend/pages/index.tsx`
  - UI flow to start a round and submit the winning move
  - side-by-side actions for public vs protected submission
- `frontend/lib/envelope.ts`
  - protected transaction sending path (Neo X envelope flow)

## Local development

Install dependencies:

```bash
npm install
cd frontend && npm install && cd ..
```

Run tests:

```bash
npm test
```

Run local chain:

```bash
npm run node
```

Deploy contract:

```bash
npm run deploy:local
```

Start bot:

```bash
npm run bot
```

Start frontend:

```bash
npm run frontend
```

## Environment

Set these in `.env`:

- `NEOX_RPC_URL`
- `NEOX_WSS_URL`
- `PRIVATE_KEY`
- `CONTRACT_ADDRESS`
- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `BOT_RECYCLE_WINNINGS` (optional, default `true`)
- `BOT_GAS_RESERVE_GAS` (optional, default `0.05`)
