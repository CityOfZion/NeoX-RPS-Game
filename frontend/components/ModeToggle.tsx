interface ModeToggleProps {
  isAntiMEVMode: boolean;
  onToggle: (isAntiMEV: boolean) => void;
  disabled?: boolean;
}

export default function ModeToggle({ isAntiMEVMode, onToggle, disabled }: ModeToggleProps) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
      <h3 className="text-lg font-bold text-white mb-3">Transaction Mode</h3>
      <div className="flex gap-2">
        <button
          onClick={() => !disabled && onToggle(false)}
          disabled={disabled}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
            !isAntiMEVMode
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-white/10 text-white/60 hover:bg-white/20'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="text-sm">Public Mempool</div>
          <div className="text-xs mt-1 opacity-80">Front-running enabled</div>
        </button>
        <button
          onClick={() => !disabled && onToggle(true)}
          disabled={disabled}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
            isAntiMEVMode
              ? 'bg-green-600 text-white shadow-lg'
              : 'bg-white/10 text-white/60 hover:bg-white/20'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="text-sm">Anti-MEV Mode</div>
          <div className="text-xs mt-1 opacity-80">Protected</div>
        </button>
      </div>
      <div className="mt-3 text-xs text-white/60">
        {isAntiMEVMode ? (
          <p>🔒 Transactions are protected and not visible in the public mempool</p>
        ) : (
          <p>⚠️ Your transactions are visible in the mempool and can be front-run</p>
        )}
      </div>
    </div>
  );
}
