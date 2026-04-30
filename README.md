# Anti-MEV Beat the House Demo

This repo now demonstrates a simpler anti-MEV flow than the earlier commit/reveal RPS version.

The contract creates a player-specific round with a public house move:

- the player can send the winning response through the normal public mempool
- or send the exact same contract call through Neo X's protected transaction path

That gives us a clean comparison:

- `Public mode`: the bot sees `playRound(roundId, move)` in the mempool and can copy it with a higher fee
- `Protected mode`: the bot cannot decode the move from the protected transport path, so it cannot steal the prize

## Why this version is better

- no bot callback is required for the round to finish
- no reveal step is required from the player
- no stuck-game cancellation flow is needed for normal play
- public vs protected behavior differs only by transaction path, which is the actual Neo X story

## Contract flow

1. Player calls `startRound()` with a small stake.
2. Contract stores:
   - player
   - house move
   - winning move
   - deadline
   - prize amount
3. Player submits the winning move with `playRound(roundId, move)`.
4. First correct caller wins the round prize.
5. If nobody wins before the deadline, the player can call `refundExpiredRound(roundId)`.

## Bot behavior

The bot only watches pending public `playRound` transactions.

When it sees:

```solidity
playRound(roundId, move)
```

it can decode both values from calldata, confirm the move is correct, and replay the same transaction with a higher fee.

That is enough to steal the round in public mode.

By default, the bot now recycles stolen prize funds back into the contract pool immediately after a successful steal, while keeping a small configurable GAS reserve for future transactions.

## Frontend flow

The UI is built around three actions:

1. `Start Round`
2. `Play <winning move> Publicly`
3. `Play <winning move> via Protected Path`

The user sees the public house move and the correct response immediately. The demo is about whether the move can be copied before inclusion, not about solving a puzzle.

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

## Key files

- `contracts/RockPaperScissors.sol` contains the `BeatTheHouse` contract
- `bot/frontRunner.js` contains the public mempool copycat bot
- `frontend/pages/index.tsx` contains the app flow
- `frontend/lib/envelope.ts` contains the Neo X protected transaction logic
