export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';

export const CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'enum BeatTheHouse.RoundMode', name: 'mode', type: 'uint8' }],
    name: 'startRound',
    outputs: [{ internalType: 'uint256', name: 'roundId', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'roundId', type: 'uint256' },
      { internalType: 'enum BeatTheHouse.Move', name: 'move', type: 'uint8' },
    ],
    name: 'playRound',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'roundId', type: 'uint256' }],
    name: 'refundExpiredRound',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'roundId', type: 'uint256' }],
    name: 'getRound',
    outputs: [
      { internalType: 'address', name: 'player', type: 'address' },
      { internalType: 'address', name: 'winner', type: 'address' },
      { internalType: 'enum BeatTheHouse.Move', name: 'houseMove', type: 'uint8' },
      { internalType: 'enum BeatTheHouse.Move', name: 'winningMove', type: 'uint8' },
      { internalType: 'enum BeatTheHouse.Move', name: 'submittedMove', type: 'uint8' },
      { internalType: 'enum BeatTheHouse.RoundState', name: 'state', type: 'uint8' },
      { internalType: 'uint64', name: 'deadline', type: 'uint64' },
      { internalType: 'uint256', name: 'betAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'prizeAmount', type: 'uint256' },
      { internalType: 'enum BeatTheHouse.RoundMode', name: 'mode', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'activeRoundOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'roundId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'enum BeatTheHouse.Move', name: 'houseMove', type: 'uint8' },
      { indexed: false, internalType: 'enum BeatTheHouse.Move', name: 'winningMove', type: 'uint8' },
      { indexed: false, internalType: 'uint256', name: 'betAmount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'prizeAmount', type: 'uint256' },
      { indexed: false, internalType: 'uint64', name: 'deadline', type: 'uint64' },
      { indexed: false, internalType: 'enum BeatTheHouse.RoundMode', name: 'mode', type: 'uint8' },
    ],
    name: 'RoundStarted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'roundId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'winner', type: 'address' },
      { indexed: false, internalType: 'enum BeatTheHouse.Move', name: 'submittedMove', type: 'uint8' },
    ],
    name: 'RoundWon',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'roundId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'enum BeatTheHouse.Move', name: 'submittedMove', type: 'uint8' },
      { indexed: false, internalType: 'enum BeatTheHouse.Move', name: 'houseMove', type: 'uint8' },
    ],
    name: 'RoundLost',
    type: 'event',
  },
] as const;
