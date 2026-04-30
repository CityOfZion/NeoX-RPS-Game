export type PendingTx = {
  hash: string;
  sender: string;
  role: 'user' | 'bot';
  functionName: string;
  decodedInput: string;
  priorityFee: string;
  status: 'pending' | 'mined';
  timestamp: number;
};

export type GameResult = {
  userMove: string;
  botMove: string;
  winner: 'user' | 'bot';
  reason: string;
};
