interface MoveButtonsProps {
  selectedMove: number;
  onMoveSelect: (move: number) => void;
  disabled?: boolean;
}

const Move = {
  None: 0,
  Rock: 1,
  Paper: 2,
  Scissors: 3,
};

const MoveNames = ['None', 'Rock', 'Paper', 'Scissors'];
const MoveEmojis = ['', '🪨', '📄', '✂️'];

export default function MoveButtons({ selectedMove, onMoveSelect, disabled }: MoveButtonsProps) {
  const moves = [Move.Rock, Move.Paper, Move.Scissors];

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white mb-4">Choose Your Move</h3>
      <div className="grid grid-cols-3 gap-3">
        {moves.map((move) => (
          <button
            key={move}
            onClick={() => !disabled && onMoveSelect(move)}
            disabled={disabled}
            className={`p-6 rounded-xl text-2xl font-bold transition-all transform hover:scale-105 ${
              selectedMove === move
                ? 'bg-blue-500 text-white scale-110 shadow-lg ring-2 ring-blue-300'
                : 'bg-white/20 text-white hover:bg-white/30'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="text-4xl mb-2">{MoveEmojis[move]}</div>
            <div className="text-sm">{MoveNames[move]}</div>
          </button>
        ))}
      </div>
      {selectedMove !== Move.None && (
        <div className="mt-4 bg-blue-500/20 border border-blue-500/50 rounded-lg p-3">
          <p className="text-blue-200 text-sm text-center">
            Selected: <span className="font-bold">{MoveEmojis[selectedMove]} {MoveNames[selectedMove]}</span>
          </p>
        </div>
      )}
    </div>
  );
}
