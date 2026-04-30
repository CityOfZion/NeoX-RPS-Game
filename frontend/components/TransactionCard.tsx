import { PendingTx } from '../types';

interface TransactionCardProps {
  tx: PendingTx;
  isAnimating?: boolean;
}

export default function TransactionCard({ tx, isAnimating }: TransactionCardProps) {
  const roleColors = {
    user: 'bg-blue-500/20 border-blue-500/50 text-blue-200',
    bot: 'bg-red-500/20 border-red-500/50 text-red-200',
  };

  const roleLabels = {
    user: 'USER TX',
    bot: 'BOT TX',
  };

  const statusColors = {
    pending: 'bg-yellow-500/20 text-yellow-200',
    mined: 'bg-green-500/20 text-green-200',
  };

  return (
    <div
      className={`border rounded-lg p-4 mb-3 transition-all animate-slide-in ${
        roleColors[tx.role]
      } ${isAnimating ? 'animate-pulse-slow scale-105' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded text-xs font-bold bg-white/20">
            {roleLabels[tx.role]}
          </span>
          <span className={`px-2 py-1 rounded text-xs font-semibold ${statusColors[tx.status]}`}>
            {tx.status.toUpperCase()}
          </span>
        </div>
        {tx.status === 'mined' && (
          <span className="text-xs">✓ Confirmed</span>
        )}
      </div>
      
      <div className="space-y-1 text-sm">
        <div>
          <span className="text-white/60">From:</span>{' '}
          <span className="font-mono text-xs">{tx.sender.slice(0, 8)}...{tx.sender.slice(-6)}</span>
        </div>
        <div>
          <span className="text-white/60">Function:</span>{' '}
          <span className="font-semibold">{tx.functionName}</span>
        </div>
        <div>
          <span className="text-white/60">Input:</span>{' '}
          <span className="font-mono text-xs break-all">{tx.decodedInput}</span>
        </div>
        <div>
          <span className="text-white/60">Priority Fee:</span>{' '}
          <span className="font-bold text-yellow-300">{tx.priorityFee} gwei</span>
        </div>
        <div className="pt-1">
          <span className="text-white/60">Hash:</span>{' '}
          <span className="font-mono text-xs break-all">{tx.hash.slice(0, 16)}...</span>
        </div>
      </div>
    </div>
  );
}
