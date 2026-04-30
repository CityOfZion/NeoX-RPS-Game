import { GameResult } from '../types';
import BlockVisualizer from './BlockVisualizer';
import ExplanationBox from './ExplanationBox';

interface ResultPanelProps {
  result: GameResult | null;
  transactions: any[];
  userMove: string | null;
  botMove: string | null;
}

export default function ResultPanel({ result, transactions, userMove, botMove }: ResultPanelProps) {
  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xl font-bold text-white mb-4">Result</h3>
      
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {result ? (
          <>
            <div className={`rounded-lg p-6 border-2 ${
              result.winner === 'user'
                ? 'bg-green-500/20 border-green-500'
                : 'bg-red-500/20 border-red-500'
            }`}>
              <div className="text-center">
                <div className="text-5xl mb-3">
                  {result.winner === 'user' ? '🎉' : '😞'}
                </div>
                <div className={`text-2xl font-bold mb-2 ${
                  result.winner === 'user' ? 'text-green-300' : 'text-red-300'
                }`}>
                  {result.winner === 'user' ? 'You Won!' : 'Bot Won!'}
                </div>
                <div className="text-white/90 text-sm">
                  {result.userMove} vs {result.botMove}
                </div>
              </div>
            </div>

            <BlockVisualizer 
              transactions={transactions}
              userMove={result.userMove}
              botMove={result.botMove}
            />

            <ExplanationBox reason={result.reason} />
          </>
        ) : (
          <div className="text-center py-8 text-white/60">
            <div className="text-4xl mb-2">🎮</div>
            <p className="text-sm">Make a move to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}
