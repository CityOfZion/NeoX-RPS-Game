import { PendingTx } from '../types';
import TransactionCard from './TransactionCard';

interface MempoolFeedProps {
  transactions: PendingTx[];
  isAntiMEVMode: boolean;
}

export default function MempoolFeed({ transactions, isAntiMEVMode }: MempoolFeedProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-white mb-2">🔍 Mempool Monitor</h3>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full ${isAntiMEVMode ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`}></div>
          <span className="text-white/80 text-sm">
            {isAntiMEVMode 
              ? 'Protected Mode: Transactions should be hidden (envelope transactions)' 
              : 'Public Mempool: All transactions visible'}
          </span>
        </div>
        {isAntiMEVMode && transactions.length > 0 && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 rounded p-2 mb-2">
            <p className="text-yellow-200 text-xs">
              ⚠️ Note: These transactions are visible because we're using regular transactions, not envelope transactions.
              True anti-MEV would hide these completely.
            </p>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-white/60">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-sm">
              {isAntiMEVMode 
                ? 'Transactions are protected and not visible in mempool'
                : 'Waiting for transactions...'}
            </p>
          </div>
        ) : (
          transactions.map((tx, index) => (
            <TransactionCard 
              key={tx.hash} 
              tx={tx} 
              isAnimating={tx.status === 'pending'}
            />
          ))
        )}
      </div>
    </div>
  );
}
