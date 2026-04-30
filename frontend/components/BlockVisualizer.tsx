import { PendingTx } from '../types';

interface BlockVisualizerProps {
  transactions: PendingTx[];
  userMove: string | null;
  botMove: string | null;
}

export default function BlockVisualizer({ transactions, userMove, botMove }: BlockVisualizerProps) {
  const minedTxs = transactions.filter(tx => tx.status === 'mined');
  const hasResults = userMove && botMove;

  if (minedTxs.length === 0 && !hasResults) {
    return (
      <div className="text-center py-8 text-white/60">
        <div className="text-4xl mb-2">⏳</div>
        <p className="text-sm">Waiting for block confirmation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white mb-4">Block Order</h3>
      
      <div className="space-y-3">
        {minedTxs.map((tx, index) => (
          <div
            key={tx.hash}
            className={`border-2 rounded-lg p-4 ${
              tx.role === 'user'
                ? 'bg-blue-500/20 border-blue-500'
                : 'bg-red-500/20 border-red-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                  #{index + 1}
                </div>
                <div>
                  <div className="font-bold text-white">
                    {tx.role === 'user' ? '👤 Your Transaction' : '🤖 Bot Transaction'}
                  </div>
                  <div className="text-xs text-white/60 font-mono">
                    {tx.hash.slice(0, 12)}...{tx.hash.slice(-8)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/60">Priority Fee</div>
                <div className="font-bold text-yellow-300">{tx.priorityFee} gwei</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasResults && (
        <div className="mt-6 pt-6 border-t border-white/20">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">👤</div>
              <div className="text-white font-bold">You</div>
              <div className="text-blue-200 text-sm">{userMove}</div>
            </div>
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">🤖</div>
              <div className="text-white font-bold">Bot</div>
              <div className="text-red-200 text-sm">{botMove}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
