interface ExplanationBoxProps {
  reason: string;
}

export default function ExplanationBox({ reason }: ExplanationBoxProps) {
  return (
    <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">💡</div>
        <div className="flex-1">
          <h4 className="text-purple-200 font-bold mb-2">Why This Happened</h4>
          <p className="text-purple-100 text-sm leading-relaxed">{reason}</p>
        </div>
      </div>
    </div>
  );
}
