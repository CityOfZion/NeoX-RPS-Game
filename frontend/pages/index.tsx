'use client';

import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { formatEther, parseEther } from 'viem';
import lottie from 'lottie-web';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contract';
import { neox } from '../config/wagmi';
import { EnvelopeStatus, sendEnvelopeContractCall } from '../lib/envelope';

const NEOX_CHAIN_ID = 47763;
const MAX_BET_GAS = 0.5;

const Move = {
  None: 0,
  Rock: 1,
  Paper: 2,
  Scissors: 3,
} as const;

const MoveNames = ['None', 'Rock', 'Paper', 'Scissors'];
const MoveOrder = [Move.Scissors, Move.Paper, Move.Rock] as const;
type MoveKey = 'rock' | 'paper' | 'scissors';
type GameMode = 'standard' | 'protected';
type HeroState = 'closed' | 'open' | 'loading' | 'arena' | 'stake' | 'move' | 'battle';
type NoticeTone = 'error' | 'info';
type LoadingPhase =
  | 'connect-wallet'
  | 'switch-network'
  | 'approve-start'
  | 'confirm-start'
  | 'approve-standard-move'
  | 'prepare-protected'
  | 'approve-protected-cache'
  | 'sign-protected-cache'
  | 'encrypt-protected'
  | 'submit-protected'
  | 'recover-protected'
  | 'confirm-move'
  | 'approve-refund'
  | 'confirm-refund';

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function getMoveKey(move: number): MoveKey | null {
  if (move === Move.Rock) return 'rock';
  if (move === Move.Paper) return 'paper';
  if (move === Move.Scissors) return 'scissors';
  return null;
}

function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Nsdhofd...dfoy';
}

function isRoundResolutionError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('round not active') ||
    normalized.includes('transaction execution reverted') ||
    normalized.includes('execution reverted')
  );
}

function formatGasValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function pickWalletConnector(connectors: ReturnType<typeof useConnect>['connectors'], id: string) {
  const lowered = id.toLowerCase();
  return connectors.find((connector) => connector.id.toLowerCase() === lowered)
    || connectors.find((connector) => connector.name.toLowerCase().includes(lowered))
    || null;
}

function BattleAnimation({ assetPath, label }: { assetPath: string | null; label: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    if (!assetPath) return;

    const animation = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      path: assetPath,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        progressiveLoad: true,
      },
    });

    return () => animation.destroy();
  }, [assetPath]);

  return <div aria-label={label} ref={containerRef} />;
}

function getLoadingDescriptor(phase: LoadingPhase | null) {
  if (!phase) return null;

  switch (phase) {
    case 'connect-wallet':
      return {
        eyebrow: 'Wallet',
        title: 'Approve wallet connection',
        detail: 'Confirm the connection request in your wallet to enter the arena.',
        stepLabel: 'Connect wallet',
        step: 1,
        total: 1,
      };
    case 'switch-network':
      return {
        eyebrow: 'Network',
        title: 'Switch to Neo X',
        detail: 'Approve the network switch in your wallet before the next action can continue.',
        stepLabel: 'Switch network',
        step: 1,
        total: 1,
      };
    case 'approve-start':
      return {
        eyebrow: 'Round',
        title: 'Approve round stake',
        detail: 'Your wallet is asking to fund the round and lock in the prize pool.',
        stepLabel: 'Approve in wallet',
        step: 1,
        total: 2,
      };
    case 'confirm-start':
      return {
        eyebrow: 'Round',
        title: 'Waiting for round confirmation',
        detail: 'The network is finalizing your round. You can choose a move as soon as it lands.',
        stepLabel: 'Confirm on-chain',
        step: 2,
        total: 2,
      };
    case 'approve-standard-move':
      return {
        eyebrow: 'Standard Mode',
        title: 'Approve public move',
        detail: 'Confirm the transaction in your wallet to send your move through the public mempool.',
        stepLabel: 'Approve in wallet',
        step: 1,
        total: 2,
      };
    case 'prepare-protected':
      return {
        eyebrow: 'Protected Mode',
        title: 'Preparing protected route',
        detail: 'Connecting to the anti-MEV path and building the encrypted transaction envelope.',
        stepLabel: 'Prepare route',
        step: 1,
        total: 5,
      };
    case 'approve-protected-cache':
      return {
        eyebrow: 'Protected Mode',
        title: 'Approve private route',
        detail: 'Your wallet needs to send the cached private transaction to the protected node.',
        stepLabel: 'Approve route',
        step: 2,
        total: 5,
      };
    case 'sign-protected-cache':
      return {
        eyebrow: 'Protected Mode',
        title: 'Sign protected proof',
        detail: 'Approve the signature request so the protected node can recover your cached transaction.',
        stepLabel: 'Sign proof',
        step: 3,
        total: 5,
      };
    case 'encrypt-protected':
      return {
        eyebrow: 'Protected Mode',
        title: 'Encrypting your move',
        detail: 'The app is sealing the transaction contents before they are submitted to Neo X.',
        stepLabel: 'Encrypt payload',
        step: 4,
        total: 5,
      };
    case 'submit-protected':
      return {
        eyebrow: 'Protected Mode',
        title: 'Submitting protected envelope',
        detail: 'The encrypted transaction is being submitted through the anti-MEV path.',
        stepLabel: 'Submit envelope',
        step: 5,
        total: 5,
      };
    case 'recover-protected':
      return {
        eyebrow: 'Protected Mode',
        title: 'Waiting for protected round',
        detail: 'Your wallet approval is done. The app is now waiting for the protected round to appear on-chain before moving you forward.',
        stepLabel: 'Wait for round',
        step: 5,
        total: 5,
      };
    case 'confirm-move':
      return {
        eyebrow: 'Battle',
        title: 'Waiting for confirmation',
        detail: 'The network is resolving the move. The result screen will open as soon as the transaction lands.',
        stepLabel: 'Confirm on-chain',
        step: 2,
        total: 2,
      };
    case 'approve-refund':
      return {
        eyebrow: 'Refund',
        title: 'Approve refund',
        detail: 'Confirm the refund transaction in your wallet to recover your expired round stake.',
        stepLabel: 'Approve in wallet',
        step: 1,
        total: 2,
      };
    case 'confirm-refund':
      return {
        eyebrow: 'Refund',
        title: 'Waiting for refund confirmation',
        detail: 'The network is returning your stake. The arena will unlock once the refund lands.',
        stepLabel: 'Confirm on-chain',
        step: 2,
        total: 2,
      };
  }
}

export default function Home() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { data: balanceData, refetch: refetchBalance } = useBalance({ address });
  const { data: contractBalanceData, refetch: refetchContractBalance } = useBalance({
    address: CONTRACT_ADDRESS ? (CONTRACT_ADDRESS as `0x${string}`) : undefined,
    query: {
      enabled: Boolean(CONTRACT_ADDRESS),
      refetchInterval: 3000,
    },
  });
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  const [mounted, setMounted] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mode, setMode] = useState<GameMode>('standard');
  const [setupStep, setSetupStep] = useState<'mode' | 'stake'>('mode');
  const [selectedMove, setSelectedMove] = useState<number>(Move.Paper);
  const [envelopeTxHash, setEnvelopeTxHash] = useState<`0x${string}` | null>(null);
  const [regularTxHash, setRegularTxHash] = useState<`0x${string}` | null>(null);
  const [betAmount, setBetAmount] = useState('0.10');
  const [lastRoundId, setLastRoundId] = useState<number | null>(null);
  const [activeAction, setActiveAction] = useState<'start' | 'submit' | 'refund' | null>(null);
  const [movePreviewOpen, setMovePreviewOpen] = useState(false);
  const [mobileStatsOpen, setMobileStatsOpen] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const actionLockRef = useRef<'start' | 'submit' | 'refund' | null>(null);
  const moveChoicesRef = useRef<HTMLDivElement | null>(null);
  const moveAutoScrollRef = useRef(false);
  const moveAutoScrollTimerRef = useRef<number | null>(null);
  const [playerStats, setPlayerStats] = useState({
    wins: 0,
    losses: 0,
    draws: 0,
    recordedRoundKeys: [] as string[],
  });

  const {
    isLoading: isConfirmingEnvelope,
    isSuccess: isConfirmedEnvelope,
    isError: isEnvelopeFailed,
    error: envelopeReceiptError,
  } = useWaitForTransactionReceipt({
    hash: envelopeTxHash || undefined,
  });
  const {
    isLoading: isConfirmingRegular,
    isSuccess: isConfirmedRegular,
    isError: isRegularFailed,
    error: regularReceiptError,
  } = useWaitForTransactionReceipt({
    hash: regularTxHash || undefined,
  });

  const isConfirming = isConfirmingEnvelope || isConfirmingRegular;
  const isConfirmed = isConfirmedEnvelope || isConfirmedRegular;
  const isLoading = Boolean(loadingPhase) || isWritePending || isConfirming;
  const isCorrectNetwork = chainId === NEOX_CHAIN_ID;
  const loadingDescriptor = getLoadingDescriptor(loadingPhase);

  useEffect(() => {
    setMounted(true);
    try {
      const storedMode = window.localStorage.getItem('beat-the-house-mode');
      if (storedMode === 'standard' || storedMode === 'protected') setMode(storedMode);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem('beat-the-house-mode', mode);
    } catch {
      // ignore
    }
  }, [mode, mounted]);

  useEffect(() => {
    if (!mounted) return;

    if (!address) {
      setPlayerStats({
        wins: 0,
        losses: 0,
        draws: 0,
        recordedRoundKeys: [],
      });
      return;
    }

    try {
      const stored = window.localStorage.getItem(`beat-the-house-stats:${address.toLowerCase()}`);
      if (!stored) {
        setPlayerStats({
          wins: 0,
          losses: 0,
          draws: 0,
          recordedRoundKeys: [],
        });
        return;
      }

      const parsed = JSON.parse(stored) as Partial<{
        wins: number;
        losses: number;
        draws: number;
        recordedRoundKeys: string[];
      }>;

      setPlayerStats({
        wins: typeof parsed.wins === 'number' ? parsed.wins : 0,
        losses: typeof parsed.losses === 'number' ? parsed.losses : 0,
        draws: typeof parsed.draws === 'number' ? parsed.draws : 0,
        recordedRoundKeys: Array.isArray(parsed.recordedRoundKeys) ? parsed.recordedRoundKeys : [],
      });
    } catch {
      setPlayerStats({
        wins: 0,
        losses: 0,
        draws: 0,
        recordedRoundKeys: [],
      });
    }
  }, [address, mounted]);

  useEffect(() => {
    if (!mounted || !address) return;

    try {
      window.localStorage.setItem(
        `beat-the-house-stats:${address.toLowerCase()}`,
        JSON.stringify(playerStats)
      );
    } catch {
      // ignore
    }
  }, [address, mounted, playerStats]);

  useEffect(() => {
    if (!mobileStatsOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileStatsOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileStatsOpen]);

  const { data: activeRoundEncoded, refetch: refetchActiveRound } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'activeRoundOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!CONTRACT_ADDRESS,
      refetchInterval: 3000,
    },
  });

  const activeRoundId = activeRoundEncoded && Number(activeRoundEncoded) > 0 ? Number(activeRoundEncoded) - 1 : null;

  useEffect(() => {
    if (activeRoundId !== null) setLastRoundId(activeRoundId);
  }, [activeRoundId]);

  const viewedRoundId = activeRoundId ?? lastRoundId;

  const { data: roundData, refetch: refetchRound } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getRound',
    args: viewedRoundId !== null ? [BigInt(viewedRoundId)] : undefined,
    query: {
      enabled: viewedRoundId !== null && !!CONTRACT_ADDRESS,
      refetchInterval: viewedRoundId !== null ? 3000 : false,
    },
  });

  useEffect(() => {
    if (!isConfirmed) return;
    setActiveAction(null);
    setLoadingPhase(null);
    refetchBalance();
    refetchContractBalance();
    refetchActiveRound();
    refetchRound();
  }, [isConfirmed, refetchActiveRound, refetchBalance, refetchContractBalance, refetchRound]);

  useEffect(() => {
    if (!isEnvelopeFailed && !isRegularFailed) return;

    setActiveAction(null);
    setLoadingPhase(null);
    refetchBalance();
    refetchContractBalance();
    refetchActiveRound();
    refetchRound();

    const failure = regularReceiptError || envelopeReceiptError;
    const message = String(failure?.message || '');
    const expectedRaceFailure = isRoundResolutionError(message);

    if (expectedRaceFailure) {
      setNotice(null);
    } else if (message) {
      showNotice(message);
    }
  }, [
    activeAction,
    envelopeReceiptError,
    isEnvelopeFailed,
    isRegularFailed,
    refetchActiveRound,
    refetchBalance,
    refetchContractBalance,
    refetchRound,
    regularReceiptError,
  ]);

  const round = useMemo(() => {
    if (!roundData) return null;
    return {
      player: roundData[0] as `0x${string}`,
      winner: roundData[1] as `0x${string}`,
      houseMove: Number(roundData[2]),
      winningMove: Number(roundData[3]),
      submittedMove: Number(roundData[4]),
      state: Number(roundData[5]),
      deadline: Number(roundData[6]),
      betAmount: roundData[7] as bigint,
      prizeAmount: roundData[8] as bigint,
      mode: Number(roundData[9]) as 0 | 1,
    };
  }, [roundData]);

  useEffect(() => {
    if (!round) return;
    setMode(round.mode === 1 ? 'protected' : 'standard');
  }, [round]);

  useEffect(() => {
    if (!round) return;
    if (round.state !== 1) {
      setNotice((current) => {
        if (!current) return current;
        return isRoundResolutionError(current.message) ? null : current;
      });
    }
  }, [round]);

  useEffect(() => {
    if (!round || round.state !== 1) return;
    const intervalId = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(intervalId);
  }, [round]);


  useEffect(() => {
    if (activeAction === 'start' && mode === 'protected' && activeRoundId !== null) {
      setLoadingPhase(null);
      setActiveAction(null);
      setNotice(null);
    }
  }, [activeAction, activeRoundId, mode]);

  useEffect(() => {
    if (activeAction === 'submit' && mode === 'protected' && round && round.state !== 1) {
      setLoadingPhase(null);
      setActiveAction(null);
      setNotice(null);
      refetchBalance();
    }
  }, [activeAction, mode, refetchBalance, round]);

  const numericBalance = parseFloat(balanceData ? formatEther(balanceData.value) : '0');
  const numericContractPool = parseFloat(contractBalanceData ? formatEther(contractBalanceData.value) : '0');
  const currentStake = Number.parseFloat(betAmount || '0.1');
  const multiplier = mode === 'standard' ? 10 : 2;
  const currentStakeWei = parseEther(currentStake.toFixed(2));
  const requiredPoolWei = currentStakeWei * BigInt(multiplier);
  const contractPoolWei = contractBalanceData?.value ?? BigInt(0);
  const hasEnoughPoolForStake = contractPoolWei >= requiredPoolWei;
  const poolShortfallWei = hasEnoughPoolForStake ? BigInt(0) : requiredPoolWei - contractPoolWei;
  const maxStakeByPool = parseFloat(formatEther(contractPoolWei / BigInt(multiplier)));
  const sliderMax = Math.max(
    0.1,
    Math.min(
      MAX_BET_GAS,
      Number.isFinite(numericBalance) ? numericBalance : 0.1,
      Number.isFinite(maxStakeByPool) ? maxStakeByPool : 0.1
    )
  );
  const hasAnyPoolLiquidity = contractPoolWei > BigInt(0);
  const isPoolAboveMinStake = maxStakeByPool >= 0.1;
  const isStartDisabled = isLoading || !hasAnyPoolLiquidity || !isPoolAboveMinStake || !hasEnoughPoolForStake;
  const displayedPrizePool = (currentStake * multiplier).toFixed(2);
  const displayedStake = `${currentStake.toFixed(2)} GAS`;
  const displayedContractPool = formatGasValue(Number.isFinite(numericContractPool) ? numericContractPool : 0);
  const displayedRequiredPool = formatGasValue(Number.parseFloat(formatEther(requiredPoolWei)));
  const displayedPoolShortfall = formatGasValue(Number.parseFloat(formatEther(poolShortfallWei)));
  const liquidityStatusText = hasEnoughPoolForStake ? 'Pool OK' : `Short ${displayedPoolShortfall} GAS`;
  const walletText = shortAddress(address);
  const isRoundActive = !!round && round.state === 1;
  const isRoundExpired = !!round && round.state === 1 && round.deadline < now;
  const hasResolvedRound = !!round && round.state !== 1;
  const winnerIsPlayer = !!round && !!address && round.winner.toLowerCase() === address.toLowerCase();
  const winnerKnown = !!round && round.winner !== '0x0000000000000000000000000000000000000000';
  const isFrontRunLoss = mode === 'standard' && winnerKnown && !winnerIsPlayer;
  const useDialogResult = isFrontRunLoss || mode === 'protected';
  const botWinnerExplorerUrl = winnerKnown && !winnerIsPlayer && round
    ? `${neox.blockExplorers.default.url}/address/${round.winner}`
    : null;
  const houseMoveKey = getMoveKey(round?.houseMove ?? Move.None);
  const houseMoveName = MoveNames[round?.houseMove ?? Move.None];
  const submittedMove = round?.submittedMove && round.submittedMove !== Move.None ? round.submittedMove : selectedMove;
  const submittedMoveName = MoveNames[submittedMove];
  const selectedMoveName = MoveNames[selectedMove];
  const submittedMoveKey = getMoveKey(submittedMove);
  const dialogThirdLabel = isFrontRunLoss ? 'MEV Bot Submitted' : 'Round result';
  const dialogThirdValue = isFrontRunLoss
    ? submittedMoveName
    : round?.state === 3
      ? 'Draw'
      : winnerIsPlayer
        ? 'You Win'
        : 'House Wins';
  const currentIndex = Math.max(0, MoveOrder.indexOf(selectedMove as (typeof MoveOrder)[number]));

  const heroState: HeroState = !isConnected
    ? isConnectPending || loadingPhase === 'connect-wallet'
      ? 'loading'
      : walletMenuOpen
        ? 'open'
        : 'closed'
    : isRoundActive
      ? 'move'
      : hasResolvedRound
        ? 'battle'
        : setupStep === 'stake'
          ? 'stake'
          : 'arena';

  const battleOutcome = !round
    ? 'lose'
    : round.state === 3
      ? 'draw'
      : winnerIsPlayer
        ? 'win'
        : 'lose';

  const battleResultTitle = !round
    ? 'You Lose'
    : round.state === 3
      ? 'Draw'
      : winnerIsPlayer
        ? 'You Win'
        : isFrontRunLoss
          ? 'Front-run by MEV Bot'
          : winnerKnown
            ? 'You Lose'
          : 'You Lose';

  const battleResultIcon = round?.state === 3 ? '/img/draw.svg' : winnerIsPlayer ? '/img/win.svg' : '/img/lose.svg';
  const resolvedRoundKey = round && viewedRoundId !== null && round.state !== 1
    ? `${viewedRoundId}:${round.state}:${round.winner.toLowerCase()}:${round.submittedMove}:${round.houseMove}`
    : null;

  useEffect(() => {
    if (!resolvedRoundKey || !round) return;
    if (playerStats.recordedRoundKeys.includes(resolvedRoundKey)) return;

    setPlayerStats((current) => {
      if (current.recordedRoundKeys.includes(resolvedRoundKey)) return current;

      if (round.state === 3) {
        return {
          ...current,
          draws: current.draws + 1,
          recordedRoundKeys: [...current.recordedRoundKeys, resolvedRoundKey],
        };
      }

      if (winnerIsPlayer) {
        return {
          ...current,
          wins: current.wins + 1,
          recordedRoundKeys: [...current.recordedRoundKeys, resolvedRoundKey],
        };
      }

      return {
        ...current,
        losses: current.losses + 1,
        recordedRoundKeys: [...current.recordedRoundKeys, resolvedRoundKey],
      };
    });
  }, [playerStats.recordedRoundKeys, resolvedRoundKey, round, winnerIsPlayer]);

  const summary = useMemo(() => {
    if (!round) {
      return {
        resultCopy: 'No bot. No front-run. A genuine win.',
        leftTitle: 'This is encrypted transaction ordering.',
        leftCopy:
          'Your move was sealed before it was submitted. The house move was sealed too. Both were revealed only after confirmation, so no validator or bot could peek or reorder.',
        rightTitle: 'In the real world:',
        rightCopy:
          'NeoX uses encrypted ordering so transaction contents stay hidden during ordering. By the time anyone can inspect them, it is already final.',
      };
    }

    if (round.state === 3) {
      return {
        resultCopy: 'The round expired and your stake was returned.',
        leftTitle: 'No execution happened.',
        leftCopy: 'The timer ran out before a move was settled, so the round was voided and your stake went back to your wallet.',
        rightTitle: 'In the real world:',
        rightCopy: 'Expired orders and unfilled intents should unwind cleanly instead of trapping funds or leaving users in limbo.',
      };
    }

    if (mode === 'protected') {
      if (winnerIsPlayer) {
        return {
          resultCopy: 'No bot. No front-run. A genuine win.',
          leftTitle: 'This is encrypted transaction ordering.',
          leftCopy:
            'Your move was sealed before it was submitted. The house move was sealed too. Both were revealed only after confirmation, so no validator or bot could peek or reorder.',
          rightTitle: 'In the real world:',
          rightCopy:
            'NeoX uses encrypted ordering so transaction contents stay hidden during ordering. By the time anyone can inspect them, it is already final.',
        };
      }

      return {
        resultCopy: 'You lost fairly. No one stole the round.',
        leftTitle: 'Losing fairly is the whole point.',
        leftCopy:
          'This might sound counterintuitive, but the ability to lose fairly is what makes a system trustworthy. If outcomes can’t be manipulated, the market is finally serving its users.',
        rightTitle: 'In the real world:',
        rightCopy:
          'When you trade on a protected chain, slippage comes from genuine supply and demand, not from a bot weaponizing your own transaction against you.',
      };
    }

    if (winnerKnown && !winnerIsPlayer) {
      return {
        resultCopy: 'You were right... just not first.',
        leftTitle: 'It’s not about speed. It’s about visibility.',
        leftCopy:
          'You might think you can just submit faster next time, but speed is not the problem. As long as your transaction is publicly visible before it is confirmed, bots can see it and beat you with automation.',
        rightTitle: 'In the real world:',
        rightCopy:
          'Anti-MEV protection does not try to make you faster. It makes your transaction invisible until it is already final.',
      };
    }

    if (winnerIsPlayer) {
      return {
        resultCopy: 'You got through before the bot.',
        leftTitle: 'The public mempool stayed open.',
        leftCopy:
          'Your move still went through the public path. The bot just failed to outrun you this time.',
        rightTitle: 'In the real world:',
        rightCopy:
          'Public ordering leaves every transaction exposed, even when an attacker misses a specific race.',
      };
    }

    return {
      resultCopy: 'That was not the winning move.',
      leftTitle: 'The house beat your move.',
      leftCopy: 'This round resolved on game outcome, not on a front-run. Your selected move did not beat the house.',
      rightTitle: 'In the real world:',
      rightCopy: 'Protected execution removes extraction risk, not market risk. You can still be wrong and lose honestly.',
    };
  }, [mode, round, winnerIsPlayer, winnerKnown]);

  const movePreviewTitle = mode === 'standard' ? 'House move' : 'House move encrypted';
  const movePreviewPill = mode === 'standard' && houseMoveKey ? MoveNames[round?.houseMove ?? Move.None] : 'Hidden';
  const movePreviewAsset = mode === 'standard' && houseMoveKey ? `/img/Hands/Blue/${houseMoveKey}.png` : '/img/Lock.png';
  const movePreviewAssetClass = mode === 'standard' && houseMoveKey ? `move-preview__asset move-preview__asset--spotted-${houseMoveKey}` : 'move-preview__asset';
  const hasWindow = typeof window !== 'undefined';
  const displayedStatsBalance = isConnected
    ? formatGasValue(Number.isFinite(numericBalance) ? numericBalance : 0)
    : '240';
  const injectedProvider = hasWindow ? (window as typeof window & { ethereum?: any }).ethereum : undefined;
  const hasAnyInjected = Boolean(injectedProvider);
  const hasMetaMaskProvider = Boolean(
    injectedProvider?.isMetaMask || injectedProvider?.providers?.some((provider: any) => provider?.isMetaMask)
  );
  const metaMaskConnector = pickWalletConnector(connectors, 'metamask');
  const walletConnectConnector = pickWalletConnector(connectors, 'walletconnect');
  const injectedConnector = pickWalletConnector(connectors, 'injected');
  const walletButtons = [
    {
      key: 'metamask',
      label: metaMaskConnector?.name?.trim() || 'MetaMask',
      connector: metaMaskConnector,
      available: Boolean(metaMaskConnector),
      unavailableMessage: hasMetaMaskProvider
        ? 'MetaMask connector is not available right now.'
        : 'MetaMask is not installed in this browser.',
    },
    {
      key: 'neon-wallet',
      label: 'Neon Wallet',
      connector: walletConnectConnector,
      available: Boolean(walletConnectConnector),
      unavailableMessage: 'WalletConnect is not configured for this app.',
    },
    {
      key: 'walletconnect',
      label: 'WalletConnect',
      connector: walletConnectConnector,
      available: Boolean(walletConnectConnector),
      unavailableMessage: 'WalletConnect is not configured for this app.',
    },
    {
      key: 'injected',
      label: injectedConnector?.name?.trim() || 'Injected',
      connector: injectedConnector,
      available: Boolean(injectedConnector) && hasAnyInjected,
      unavailableMessage: 'No injected wallet was found in this browser.',
    },
  ] as const;

  const setProtectedLoadingPhase = (status: EnvelopeStatus) => {
    switch (status) {
      case 'prepare':
        setLoadingPhase('prepare-protected');
        break;
      case 'wallet-send':
        setLoadingPhase('approve-protected-cache');
        break;
      case 'wallet-sign':
        setLoadingPhase('sign-protected-cache');
        break;
      case 'encrypt':
        setLoadingPhase('encrypt-protected');
        break;
      case 'submit':
        setLoadingPhase('submit-protected');
        break;
    }
  };

  const showNotice = (message: string, tone: NoticeTone = 'error') => {
    setNotice({ message, tone });
  };

  useEffect(() => {
    if (!Number.isFinite(currentStake) || currentStake <= sliderMax) return;
    setBetAmount(sliderMax.toFixed(2));
  }, [currentStake, sliderMax]);

  const resetBrokenWalletSession = () => {
    try {
      window.localStorage.removeItem('wagmi.store');
    } catch {}
    disconnect();
    showNotice('Your wallet session expired. Reconnect the wallet and try again.', 'info');
  };

  const isProtectedHandshakeFailure = (message: string) =>
    message.includes('protected node did not return a cached transaction') ||
    message.includes('empty cached transaction') ||
    message.includes('empty aes message') ||
    message.includes('failed to get cached transaction');

  const recoverProtectedStart = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const activeResult = await refetchActiveRound();
      const encoded = activeResult.data && Number(activeResult.data) > 0 ? Number(activeResult.data) - 1 : null;
      if (encoded !== null) {
        setLastRoundId(encoded);
        await delay(400);
        await refetchRound();
        await refetchBalance();
        return { recovered: true, pending: false };
      }
      await delay(1500);
    }
    return { recovered: false, pending: true };
  };

  const recoverProtectedSubmit = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const activeResult = await refetchActiveRound();
      const encoded = activeResult.data && Number(activeResult.data) > 0 ? Number(activeResult.data) - 1 : null;
      await refetchRound();
      if (encoded === null) {
        await refetchBalance();
        return { recovered: true, pending: false };
      }
      await delay(1500);
    }
    return { recovered: false, pending: true };
  };

  const reportActionError = (fallback: string, error: unknown) => {
    const message = String((error as { message?: string } | undefined)?.message || fallback);
    const normalized = message.toLowerCase();
    if (normalized.includes('user rejected') || normalized.includes('denied') || normalized.includes('rejected the request')) {
      return;
    }
    if (normalized.includes('getchainid is not a function')) {
      resetBrokenWalletSession();
      return;
    }
    showNotice(message);
  };

  const ensureNetwork = async () => {
    if (isCorrectNetwork) return true;
    try {
      setLoadingPhase('switch-network');
      await switchChainAsync({ chainId: NEOX_CHAIN_ID });
      setLoadingPhase(null);
      return true;
    } catch {
      setLoadingPhase(null);
      return false;
    }
  };

  const startRound = async () => {
    if (actionLockRef.current) return;
    if (!CONTRACT_ADDRESS || !isConnected) return;
    if (!(await ensureNetwork())) return;
    if (!hasEnoughPoolForStake) {
      showNotice(
        `Pool liquidity is too low for this stake. Contract pool: ${displayedContractPool} GAS, required: ${displayedRequiredPool} GAS (short by ${displayedPoolShortfall} GAS).`,
        'info'
      );
      return;
    }
    actionLockRef.current = 'start';

    try {
      setActiveAction('start');
      setNotice(null);
      setEnvelopeTxHash(null);
      setRegularTxHash(null);
      setMovePreviewOpen(false);

      if (mode === 'protected') {
        const txHash = await sendEnvelopeContractCall(
          address as `0x${string}`,
          CONTRACT_ADDRESS as `0x${string}`,
          CONTRACT_ABI as unknown as any[],
          'startRound',
          [1],
          parseEther(currentStake.toFixed(2)),
          setProtectedLoadingPhase
        );
        setEnvelopeTxHash(txHash as `0x${string}`);
        setLoadingPhase('confirm-start');
      } else {
        setLoadingPhase('approve-start');
        const txHash = await writeContractAsync({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'startRound',
          args: [0],
          value: parseEther(currentStake.toFixed(2)),
        });
        setRegularTxHash(txHash as `0x${string}`);
        setLoadingPhase('confirm-start');
      }
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message || '').toLowerCase();
      if (mode === 'protected') {
        setLoadingPhase('recover-protected');
        const recovery = await recoverProtectedStart();
        if (recovery.recovered) {
          setLoadingPhase(null);
          setActiveAction(null);
          return;
        }
        if (recovery.pending || isProtectedHandshakeFailure(message)) {
          return;
        }
      }

      setLoadingPhase(null);
      setActiveAction(null);
      if (message.includes('insufficient prize liquidity')) {
        showNotice(
          `Insufficient prize liquidity. Contract pool: ${displayedContractPool} GAS, required: ${displayedRequiredPool} GAS (short by ${displayedPoolShortfall} GAS).`,
          'info'
        );
        return;
      }
      if (mode === 'standard' && (message.includes('transaction cached') || message.includes('cached'))) {
        showNotice('Your wallet is using the Neo X protected RPC. Standard mode needs a regular Neo X mainnet RPC such as https://mainnet-1.rpc.banelabs.org.', 'info');
        return;
      }
      reportActionError('Failed to start round.', error);
    } finally {
      if (actionLockRef.current === 'start') {
        actionLockRef.current = null;
      }
    }
  };

  const submitMove = async () => {
    if (actionLockRef.current) return;
    if (!round || viewedRoundId === null || !CONTRACT_ADDRESS || !isConnected) return;
    if (!(await ensureNetwork())) return;
    actionLockRef.current = 'submit';

    try {
      setActiveAction('submit');
      setNotice(null);
      setMovePreviewOpen(false);
      const moveToSubmit = selectedMove;
      if (mode === 'protected') {
        setRegularTxHash(null);
        const txHash = await sendEnvelopeContractCall(
          address as `0x${string}`,
          CONTRACT_ADDRESS as `0x${string}`,
          CONTRACT_ABI as unknown as any[],
          'playRound',
          [BigInt(viewedRoundId), moveToSubmit]
          ,BigInt(0),
          setProtectedLoadingPhase
        );
        setEnvelopeTxHash(txHash as `0x${string}`);
        setLoadingPhase('confirm-move');
      } else {
        setEnvelopeTxHash(null);
        setRegularTxHash(null);
        setLoadingPhase('approve-standard-move');
        const txHash = await writeContractAsync({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'playRound',
          args: [BigInt(viewedRoundId), moveToSubmit],
        });
        setRegularTxHash(txHash as `0x${string}`);
        setLoadingPhase('confirm-move');
      }
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message || '').toLowerCase();
      const expectedRaceFailure = isRoundResolutionError(message);

      if (mode === 'protected') {
        setLoadingPhase('recover-protected');
        const recovery = await recoverProtectedSubmit();
        if (recovery.recovered) {
          setLoadingPhase(null);
          setActiveAction(null);
          return;
        }
        if (recovery.pending || isProtectedHandshakeFailure(message)) {
          return;
        }
      }

      setLoadingPhase(null);
      setActiveAction(null);

      if (expectedRaceFailure) {
        setNotice(null);
        refetchBalance();
        refetchActiveRound();
        refetchRound();
        return;
      }

      reportActionError('Failed to submit move.', error);
    } finally {
      if (actionLockRef.current === 'submit') {
        actionLockRef.current = null;
      }
    }
  };

  const refundRound = async () => {
    if (actionLockRef.current) return;
    if (viewedRoundId === null || !CONTRACT_ADDRESS || !isConnected) return;
    if (!(await ensureNetwork())) return;
    actionLockRef.current = 'refund';

    try {
      setActiveAction('refund');
      setNotice(null);
      setEnvelopeTxHash(null);
      setRegularTxHash(null);
      setLoadingPhase('approve-refund');
      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'refundExpiredRound',
        args: [BigInt(viewedRoundId)],
      });
      setRegularTxHash(txHash as `0x${string}`);
      setLoadingPhase('confirm-refund');
    } catch (error) {
      setLoadingPhase(null);
      setActiveAction(null);
      const message = String((error as { message?: string } | undefined)?.message || '');
      const normalized = message.toLowerCase();

      if (normalized.includes('nonce provided for the transaction is lower than the current nonce of the account') ||
          normalized.includes('nonce too low')) {
        showNotice('Refund failed because your wallet nonce is out of sync after the protected tx attempt. Switch your wallet node back to the regular Neo X mainnet RPC (https://mainnet-1.rpc.banelabs.org), refresh the app, reconnect, and try Refund again.', 'info');
        return;
      }

      reportActionError('Failed to refund expired round.', error);
    } finally {
      if (actionLockRef.current === 'refund') {
        actionLockRef.current = null;
      }
    }
  };

  const resetFlow = () => {
    setLastRoundId(null);
    setActiveAction(null);
    setEnvelopeTxHash(null);
    setRegularTxHash(null);
    setLoadingPhase(null);
    setMovePreviewOpen(false);
    setNotice(null);
    setSetupStep('mode');
    refetchActiveRound();
  };

  const selectMode = (nextMode: GameMode) => {
    setMode(nextMode);
  };

  const cycleMove = (direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + MoveOrder.length) % MoveOrder.length;
    setSelectedMove(MoveOrder[nextIndex]);
  };

  const getMoveFromVisibleCard = () => {
    const choices = moveChoicesRef.current;
    if (!choices) return null;
    if (choices.scrollWidth <= choices.clientWidth + 1) return null;

    const cards = Array.from(choices.querySelectorAll<HTMLButtonElement>('.move-card'));
    if (!cards.length) return null;

    const viewportCenter = choices.scrollLeft + choices.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return MoveOrder[nearestIndex] ?? null;
  };

  const syncSelectedMoveFromScroll = () => {
    if (moveAutoScrollRef.current) return;
    const moveFromView = getMoveFromVisibleCard();
    if (moveFromView !== null && moveFromView !== selectedMove) {
      setSelectedMove(moveFromView);
    }
  };

  useEffect(() => () => {
    if (moveAutoScrollTimerRef.current !== null) {
      window.clearTimeout(moveAutoScrollTimerRef.current);
      moveAutoScrollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const choices = moveChoicesRef.current;
    if (!choices) return;
    if (choices.scrollWidth <= choices.clientWidth + 1) return;

    const nextIndex = MoveOrder.indexOf(selectedMove as (typeof MoveOrder)[number]);
    if (nextIndex < 0) return;

    const cards = Array.from(choices.querySelectorAll<HTMLButtonElement>('.move-card'));
    const targetCard = cards[nextIndex];
    if (!targetCard) return;

    const targetLeft = targetCard.offsetLeft;
    if (Math.abs(choices.scrollLeft - targetLeft) <= 2) return;

    moveAutoScrollRef.current = true;
    if (moveAutoScrollTimerRef.current !== null) {
      window.clearTimeout(moveAutoScrollTimerRef.current);
      moveAutoScrollTimerRef.current = null;
    }
    choices.scrollTo({ left: targetLeft, behavior: 'smooth' });
    moveAutoScrollTimerRef.current = window.setTimeout(() => {
      moveAutoScrollRef.current = false;
      moveAutoScrollTimerRef.current = null;
    }, 260);
  }, [selectedMove]);

  const handleWalletConnect = async (label: string, connector: (typeof walletButtons)[number]['connector'], available: boolean, unavailableMessage: string) => {
    if (!available || !connector) {
      showNotice(unavailableMessage, 'info');
      return;
    }

    try {
      setLoadingPhase('connect-wallet');
      setNotice(null);
      await connectAsync({ connector });
      setWalletMenuOpen(false);
      setLoadingPhase(null);
    } catch (error: any) {
      setLoadingPhase(null);
      const message = String(error?.message || 'Failed to connect wallet.');
      const normalized = message.toLowerCase();
      if (normalized.includes('user rejected') || normalized.includes('denied')) {
        return;
      }
      showNotice(`${label}: ${message}`);
    }
  };

  if (!mounted) return null;

  return (
    <>
      <Head>
        <title>Rock, Paper, Scissors</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Asap:wght@700&display=swap" rel="stylesheet" />
      </Head>

      <main className="frame">
        <section className="hero" data-wallet-state={heroState}>
          <div className="app-stats" aria-label="Player stats">
            <span className="app-stats__item"><span id="stats-wins">{playerStats.wins}</span> Wins</span>
            <span className="app-stats__divider" aria-hidden="true">|</span>
            <span className="app-stats__item"><span id="stats-losses">{playerStats.losses}</span> Losses</span>
            <span className="app-stats__divider" aria-hidden="true">|</span>
            <span className="app-stats__item"><span id="stats-draws">{playerStats.draws}</span> Draws</span>
            <span className="app-stats__divider" aria-hidden="true">|</span>
            <span className="app-stats__item">Balance: <span id="stats-balance">{displayedStatsBalance}</span> GAS</span>
            <span className="app-stats__divider" aria-hidden="true">|</span>
            <span className="app-stats__item">Pool: <span id="stats-pool">{displayedContractPool}</span> GAS</span>
            <span className="app-stats__divider" aria-hidden="true">|</span>
            <span
              className={cx('app-stats__item', !hasEnoughPoolForStake && 'app-stats__item--warning')}
              title={`Required for current stake: ${displayedRequiredPool} GAS`}
            >
              Status: {liquidityStatusText}
            </span>
          </div>

          <button
            className="app-stats-toggle"
            type="button"
            aria-label="Open player stats"
            aria-haspopup="dialog"
            aria-expanded={mobileStatsOpen}
            aria-controls="mobile-stats-dialog"
            onClick={() => setMobileStatsOpen(true)}
          >
            <span className="app-stats-toggle__icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>

          <div
            className={cx('mobile-stats-dialog', mobileStatsOpen && 'mobile-stats-dialog--open')}
            id="mobile-stats-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Player stats"
            aria-hidden={!mobileStatsOpen}
            onClick={(event) => {
              if (event.target === event.currentTarget) setMobileStatsOpen(false);
            }}
          >
            <div className="mobile-stats-dialog__panel">
              <button className="mobile-stats-dialog__close" type="button" aria-label="Close player stats" onClick={() => setMobileStatsOpen(false)}>
                <img src="/img/X.svg" alt="" />
              </button>
              <p className="mobile-stats-dialog__title">Player Stats</p>
              <p className="mobile-stats-dialog__row"><span>Wins</span><strong>{playerStats.wins}</strong></p>
              <p className="mobile-stats-dialog__row"><span>Losses</span><strong>{playerStats.losses}</strong></p>
              <p className="mobile-stats-dialog__row"><span>Draws</span><strong>{playerStats.draws}</strong></p>
              <p className="mobile-stats-dialog__row"><span>Balance</span><strong>{displayedStatsBalance} GAS</strong></p>
              <p className="mobile-stats-dialog__row"><span>Pool</span><strong>{displayedContractPool} GAS</strong></p>
              <p className={cx('mobile-stats-dialog__row', !hasEnoughPoolForStake && 'mobile-stats-dialog__row--warning')}>
                <span>Status</span>
                <strong>{liquidityStatusText}</strong>
              </p>
              <p className="mobile-stats-dialog__row">
                <span>Wallet</span>
                <strong>{walletText}</strong>
              </p>
              <button
                className="mobile-stats-dialog__logout"
                type="button"
                onClick={() => {
                  setMobileStatsOpen(false);
                  disconnect();
                }}
              >
                Log out
              </button>
            </div>
          </div>

          <div className="app-bar" aria-label="Application name">
            <div className="app-bar__brand app-bar__logo" aria-label="Rock, Paper, Scissors">
              <img className="app-bar__logo-image" src="/img/rps-logo-navbar.svg" alt="" />
            </div>
          </div>

          <img className="hero__eyebrow" src="/img/NEO X ANTI-MEV DEMO.svg" alt="NEO X Anti-MEV Demo" />

          <div className={cx('app-notice', notice && 'app-notice--visible', notice?.tone === 'info' && 'app-notice--info')} role="status" aria-live="polite" aria-hidden={!notice}>
            <p className="app-notice__message">{notice?.message}</p>
            <button className="app-notice__close" type="button" aria-label="Dismiss notice" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>

          <div className="hero__content">
            <div className="hero__title" aria-label="Rock, Paper, Scissors">
              <img className="hero__letters" src="/img/letters.svg" alt="" />
              <div className="hero__hand-shell hero__hand-shell--rock">
                <img className="hero__hand hero__hand--rock" src="/img/rock.png" alt="" />
              </div>
              <div className="hero__hand-shell hero__hand-shell--paper">
                <img className="hero__hand hero__hand--paper" src="/img/paper.png" alt="" />
              </div>
              <div className="hero__hand-shell hero__hand-shell--scissors">
                <img className="hero__hand hero__hand--scissors" src="/img/scissors.png" alt="" />
              </div>
            </div>

            <p className="hero__body">
              The goal of this game is to beat the bot. This is a<br />
              game built to explore and better understand MEV.
            </p>
          </div>

          <div className="hero__actions">
            <button
              className="hero__button"
              type="button"
              aria-controls="wallet-options"
              aria-expanded={walletMenuOpen}
              onClick={() => setWalletMenuOpen((open) => !open)}
            >
              Connect Wallet
            </button>

            <div className={cx('wallet-options', walletMenuOpen && 'wallet-options--open')} id="wallet-options" aria-hidden={!walletMenuOpen}>
              <button className="wallet-options__close" type="button" aria-label="Close wallet options" onClick={() => setWalletMenuOpen(false)}>
                <img className="wallet-options__close-icon" src="/img/X.svg" alt="" />
                <span className="wallet-options__close-label">Close</span>
              </button>
              {walletButtons.map(({ key, label, connector, available, unavailableMessage }) => (
                <button
                  key={key}
                  className="wallet-options__button"
                  type="button"
                  disabled={isConnectPending}
                  onClick={() => handleWalletConnect(
                    label,
                    connector,
                    available,
                    unavailableMessage
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={cx('wallet-loading-screen', loadingDescriptor && 'wallet-loading-screen--active')}
            id="wallet-loading-screen"
            aria-hidden={!loadingDescriptor}
          >
            <div className="wallet-loading-screen__inner">
              <div className="wallet-loading-screen__hands" aria-hidden="true">
                <img className="wallet-loading-screen__hand wallet-loading-screen__hand--rock" src="/img/rock.png" alt="" />
                <img className="wallet-loading-screen__hand wallet-loading-screen__hand--paper" src="/img/paper.png" alt="" />
                <img className="wallet-loading-screen__hand wallet-loading-screen__hand--scissors" src="/img/scissors.png" alt="" />
              </div>
              <div className="wallet-loading-screen__copy">
                <p className="wallet-loading-screen__eyebrow">{loadingDescriptor?.eyebrow || 'Loading'}</p>
                <p className="wallet-loading-screen__text">
                  <span id="wallet-loading-label">{loadingDescriptor?.title || 'Loading'}</span>
                  <span className="wallet-loading-screen__dots" aria-hidden="true" />
                </p>
                <p className="wallet-loading-screen__detail">{loadingDescriptor?.detail || 'Please wait.'}</p>
                <div className="wallet-loading-screen__meter" aria-hidden="true">
                  <span className="wallet-loading-screen__meter-label">
                    {loadingDescriptor ? `${loadingDescriptor.stepLabel} · ${loadingDescriptor.step}/${loadingDescriptor.total}` : ''}
                  </span>
                  <span className="wallet-loading-screen__meter-track">
                    <span
                      className="wallet-loading-screen__meter-fill"
                      style={{ width: loadingDescriptor ? `${(loadingDescriptor.step / loadingDescriptor.total) * 100}%` : '0%' }}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="arena-screen" id="arena-screen" aria-hidden={heroState !== 'arena'}>
            <div className="arena-screen__inner">
              <p className="arena-screen__intro">
                Choose your mode. One has better payouts.<br />
                The other has protection. Which will you trust?
              </p>

              <div className="arena-screen__grid">
                <article className="arena-card arena-card--standard">
                  <div className="arena-card__pill">Standard</div>
                  <h2 className="arena-card__title">10x Payout</h2>
                  <p className="arena-card__subtitle">Public transactions • See opponent’s move first</p>
                  <p className="arena-card__meta">Higher Yields <span>|</span> Public Mempool</p>
                  <button className="arena-card__button" type="button" data-mode="standard" onClick={() => { selectMode('standard'); setSetupStep('stake'); }}>
                    Select
                  </button>
                </article>

                <article className="arena-card arena-card--protected">
                  <div className="arena-card__pill">Protected</div>
                  <h2 className="arena-card__title">2x Payout</h2>
                  <p className="arena-card__subtitle">Anti-MEV protection • Blind pick</p>
                  <p className="arena-card__meta">Lower Yields <span>|</span> Encrypted Transactions</p>
                  <button className="arena-card__button" type="button" data-mode="protected" onClick={() => { selectMode('protected'); setSetupStep('stake'); }}>
                    Select
                  </button>
                </article>
              </div>

              <div className="arena-screen__dots" aria-hidden="true">
                <span className={cx('arena-screen__dot', mode === 'standard' && 'arena-screen__dot--active')} data-dot-mode="standard" />
                <span className={cx('arena-screen__dot', mode === 'protected' && 'arena-screen__dot--active')} data-dot-mode="protected" />
              </div>

              <button className="arena-screen__mobile-select" id="arena-mobile-select" type="button" onClick={() => setSetupStep('stake')}>
                Select
              </button>
            </div>

            <button className="arena-screen__wallet" type="button" onClick={() => disconnect()}>
              <span className="arena-screen__wallet-dot" aria-hidden="true" />
              <span className="arena-screen__wallet-text">{walletText}</span>
              <img className="arena-screen__wallet-icon" src="/img/wallet.svg" alt="" />
            </button>
          </div>

          <div className="stake-screen" id="stake-screen" aria-hidden={heroState !== 'stake'}>
            <div className="stake-screen__inner">
              <p className="stake-screen__intro">
                Pick your stake. The more you put in, the<br />
                bigger the potential payout.
              </p>

              <div className="stake-screen__panel">
                <div className="stake-screen__slider-head">
                  <span className="stake-screen__amount" id="stake-amount-label">{displayedStake}</span>
                  <span className="stake-screen__range" id="stake-range-label">Min: 0.10 - Max: {sliderMax.toFixed(2)}</span>
                </div>

                <div className="stake-screen__slider-wrap">
                  <input
                    className="stake-screen__slider"
                    id="stake-slider"
                    type="range"
                    min="0.1"
                    max={sliderMax.toFixed(2)}
                    value={currentStake.toFixed(2)}
                    step="0.1"
                    onChange={(event) => setBetAmount(Number(event.target.value).toFixed(2))}
                    disabled={isLoading}
                  />
                </div>

                <div className="stake-screen__pool">
                  <span className="stake-screen__pool-label">Prize Pool</span>
                  <span className="stake-screen__pool-value" id="prize-pool-value">{displayedPrizePool} GAS</span>
                </div>
              </div>

              <div className="stake-screen__actions">
                <button className="stake-screen__back" id="stake-back" type="button" aria-label="Go back" onClick={() => setSetupStep('mode')}>
                  <img className="stake-screen__back-arrow" src="/img/arrow.svg" alt="" />
                </button>
                <button className="stake-screen__next" id="stake-next" type="button" onClick={startRound} disabled={isStartDisabled}>
                  Next
                </button>
              </div>
            </div>

            <button className="arena-screen__wallet" type="button" onClick={() => disconnect()}>
              <span className="arena-screen__wallet-dot" aria-hidden="true" />
              <span className="arena-screen__wallet-text">{walletText}</span>
              <img className="arena-screen__wallet-icon" src="/img/wallet.svg" alt="" />
            </button>
          </div>

          <div className="move-screen" id="move-screen" aria-hidden={heroState !== 'move'}>
            <div className="move-screen__inner">
              <p className="move-screen__intro">
                {mode === 'protected'
                  ? 'Choose your move. The house move is encrypted until settlement.'
                  : 'Choose your move. The house move is visible before you submit, and your move is visible too before confirmation.'}
              </p>

              <div className="move-screen__board">
                <section className="move-screen__player" aria-label="Select your move">
                  <h2 className="move-screen__heading">Select your move</h2>

                  <div className="move-screen__picker">
                    <button className="move-screen__picker-arrow move-screen__picker-arrow--prev" id="move-picker-prev" type="button" aria-label="Previous move" onClick={() => cycleMove(-1)}>
                      <img className="move-screen__picker-arrow-icon" src="/img/move-picker.svg" alt="" />
                    </button>

                    <div className="move-screen__picker-window">
                      <div className="move-screen__choices" ref={moveChoicesRef} onScroll={syncSelectedMoveFromScroll}>
                        {MoveOrder.map((moveValue) => {
                          const moveKey = getMoveKey(moveValue)!;
                          return (
                            <button key={moveKey} className={cx('move-card', selectedMove === moveValue && 'move-card--selected')} type="button" data-move={moveKey} onClick={() => setSelectedMove(moveValue)}>
                              <img className={`move-card__hand move-card__hand--${moveKey}`} src={`/img/Hands/Green/${moveKey}.png`} alt="" />
                              <span className="move-card__label">{MoveNames[moveValue]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button className="move-screen__picker-arrow move-screen__picker-arrow--next" id="move-picker-next" type="button" aria-label="Next move" onClick={() => cycleMove(1)}>
                      <img className="move-screen__picker-arrow-icon" src="/img/move-picker.svg" alt="" />
                    </button>
                  </div>

                  <div className="move-screen__dots" aria-hidden="true">
                    <span className={cx('move-screen__dot', selectedMove === Move.Scissors && 'move-screen__dot--active')} data-dot-move="scissors" />
                    <span className={cx('move-screen__dot', selectedMove === Move.Paper && 'move-screen__dot--active')} data-dot-move="paper" />
                    <span className={cx('move-screen__dot', selectedMove === Move.Rock && 'move-screen__dot--active')} data-dot-move="rock" />
                  </div>
                </section>

                <div className="move-screen__versus" aria-hidden="true">
                  <img className="move-screen__versus-mark" src="/img/VS.svg" alt="" />
                </div>

                <section className={cx('move-screen__opponent', mode === 'standard' ? 'move-screen__opponent--spotted' : 'move-screen__opponent--encrypted')} aria-label="House move" title="House move status">
                  <h2 className="move-screen__heading" id="move-opponent-heading">
                    {mode === 'standard' ? 'House move revealed' : 'House move encrypted'}
                  </h2>
                  <div className="move-screen__opponent-box">
                    <div className="move-screen__lock-wrap">
                      {mode === 'standard' && houseMoveKey ? (
                        <img className={cx('move-screen__lock', `move-screen__lock--spotted-${houseMoveKey}`)} id="move-opponent-asset" src={`/img/Hands/Blue/${houseMoveKey}.png`} alt={MoveNames[round?.houseMove ?? Move.None]} />
                      ) : (
                        <img className="move-screen__lock" id="move-opponent-asset" src="/img/Lock.png" alt="" />
                      )}
                    </div>
                    <span className="move-screen__hidden-pill" id="move-opponent-pill">{mode === 'standard' && houseMoveKey ? MoveNames[round?.houseMove ?? Move.None] : 'Hidden'}</span>
                  </div>
                  <button className="move-screen__view-opponent" id="move-view-opponent" type="button" onClick={() => setMovePreviewOpen(true)}>
                    View house move
                  </button>
                </section>
              </div>

              <div className="move-screen__actions">
                <button className="move-screen__back" id="move-back" type="button" aria-label="Go back" onClick={resetFlow}>
                  <img className="move-screen__back-arrow" src="/img/arrow.svg" alt="" />
                </button>
                {isRoundExpired ? (
                  <>
                    <button className="move-screen__battle" id="move-battle" type="button" onClick={refundRound} disabled={isLoading}>
                      Refund
                    </button>
                    {mode === 'protected' ? (
                      <p className="move-screen__refund-help">
                        If refund fails after a protected attempt, switch your wallet node back to regular Neo X mainnet RPC before retrying.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <button className="move-screen__battle" id="move-battle" type="button" onClick={submitMove} disabled={isLoading}>
                    Battle
                  </button>
                )}
              </div>
            </div>

            <button className="arena-screen__wallet" type="button" onClick={() => disconnect()}>
              <span className="arena-screen__wallet-dot" aria-hidden="true" />
              <span className="arena-screen__wallet-text">{walletText}</span>
              <img className="arena-screen__wallet-icon" src="/img/wallet.svg" alt="" />
            </button>
          </div>

          <div
            className={cx(
              'battle-screen',
              hasResolvedRound && 'battle-screen--resolved',
              hasResolvedRound && 'battle-screen--summary-visible',
              useDialogResult && 'battle-screen--front-run'
            )}
            id="battle-screen"
            aria-hidden={heroState !== 'battle'}
          >
            <div className="battle-screen__inner">
              <p className="battle-screen__intro" aria-hidden="true" />

              <div className="battle-screen__arena">
                <section
                  className={cx('battle-screen__fighter battle-screen__fighter--player', isFrontRunLoss && 'battle-screen__fighter--intercepted')}
                  aria-label={isFrontRunLoss ? 'MEV bot move' : 'Your move'}
                >
                  <div className="battle-screen__animation" id="battle-player-animation">
                    <BattleAnimation assetPath={submittedMoveKey ? `/img/left-${submittedMoveKey}.json` : null} label={MoveNames[submittedMove]} />
                  </div>
                  <p className="battle-screen__label" id="battle-player-label">{MoveNames[submittedMove]}</p>
                </section>

                <div className="battle-screen__versus" aria-hidden="true">
                  <img className="battle-screen__versus-mark" src="/img/VS.svg" alt="" />
                </div>

                <section className="battle-screen__fighter battle-screen__fighter--opponent" aria-label="House move">
                  <div className="battle-screen__animation" id="battle-opponent-animation">
                    <BattleAnimation assetPath={houseMoveKey ? `/img/right-${houseMoveKey}-opponent.json` : null} label={MoveNames[round?.houseMove ?? Move.None]} />
                  </div>
                  <p className="battle-screen__label" id="battle-opponent-label">{MoveNames[round?.houseMove ?? Move.None]}</p>
                </section>
              </div>

              <div className="battle-screen__result battle-screen__result--visible" id="battle-result" data-outcome={battleOutcome} aria-live="polite">
                {useDialogResult ? (
                  <>
                    <div className="battle-screen__front-run-banner" id="battle-result-title">
                      <img className="battle-screen__front-run-icon" src={battleResultIcon} alt="" />
                      <p className="battle-screen__front-run-copy" id="battle-result-copy">
                        <span className={isFrontRunLoss ? 'battle-screen__front-run-title' : ''}>{battleResultTitle}.</span>{' '}
                        <span>{summary.resultCopy}</span>
                      </p>
                    </div>
                    <div className="battle-screen__actors" aria-label="Round sequence">
                      <p className="battle-screen__actor-row">
                        <span className="battle-screen__actor-label">House played</span>
                        <span className="battle-screen__actor-value">{houseMoveName}</span>
                      </p>
                      <p className="battle-screen__actor-row">
                        <span className="battle-screen__actor-label">You submitted</span>
                        <span className="battle-screen__actor-value">{selectedMoveName}</span>
                      </p>
                      <p className={cx('battle-screen__actor-row', isFrontRunLoss && 'battle-screen__actor-row--bot')}>
                        <span className="battle-screen__actor-label">{dialogThirdLabel}</span>
                        <span className="battle-screen__actor-value">
                          {dialogThirdValue}
                          {isFrontRunLoss ? <span className="battle-screen__bot-pill">Landed First</span> : null}
                        </span>
                      </p>
                      {isFrontRunLoss || botWinnerExplorerUrl ? (
                        <div className="battle-screen__actors-footer">
                          <p className="battle-screen__actors-note">
                            {isFrontRunLoss ? 'Same move you picked. Higher GAS. Beat you to the block.' : summary.resultCopy}
                          </p>
                          {botWinnerExplorerUrl ? (
                            <a
                              className="battle-screen__result-link"
                              href={botWinnerExplorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View winner wallet on Explorer
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <img className="battle-screen__result-icon" id="battle-result-icon" src={battleResultIcon} alt="" />
                    <p className="battle-screen__result-title" id="battle-result-title">{battleResultTitle}</p>
                    <p className="battle-screen__result-copy" id="battle-result-copy">{summary.resultCopy}</p>
                  </>
                )}
                {!useDialogResult && botWinnerExplorerUrl ? (
                  <a
                    className="battle-screen__result-link"
                    href={botWinnerExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View winner wallet on Explorer
                  </a>
                ) : null}
              </div>

              <div className="battle-summary" id="battle-summary" aria-hidden={heroState !== 'battle'} data-outcome={battleOutcome}>
                <section className="battle-summary__card" aria-labelledby="battle-summary-heading">
                  <div className="battle-summary__header">
                    <p className="battle-summary__heading" id="battle-summary-heading">What happened in DeFi terms:</p>
                  </div>

                  <div className="battle-summary__columns">
                    <div className="battle-summary__column">
                      <p className="battle-summary__column-title" id="battle-summary-left-title">{summary.leftTitle}</p>
                      <p className="battle-summary__column-copy" id="battle-summary-left-copy">{summary.leftCopy}</p>
                    </div>

                    <div className="battle-summary__column">
                      <p className="battle-summary__column-title battle-summary__column-title--right">{summary.rightTitle}</p>
                      <p className="battle-summary__column-copy" id="battle-summary-right-copy">{summary.rightCopy}</p>
                    </div>
                  </div>
                </section>

                <div className="battle-summary__actions">
                  <button className="battle-summary__button battle-summary__button--secondary" id="battle-summary-mode" type="button" onClick={() => { setSetupStep('mode'); resetFlow(); }}>
                    Different Mode
                  </button>
                  <button className="battle-summary__button battle-summary__button--primary" id="battle-summary-again" type="button" onClick={resetFlow}>
                    Battle Again
                  </button>
                </div>
              </div>

              <aside className="battle-controls" id="battle-controls" aria-label="Battle controls">
                <h3 className="battle-controls__title">Battle Controls</h3>
              </aside>
            </div>

            <button className="arena-screen__wallet" type="button" onClick={() => disconnect()}>
              <span className="arena-screen__wallet-dot" aria-hidden="true" />
              <span className="arena-screen__wallet-text">{walletText}</span>
              <img className="arena-screen__wallet-icon" src="/img/wallet.svg" alt="" />
            </button>
          </div>

          <div className={cx('move-preview', movePreviewOpen && 'move-preview--open')} id="move-preview" aria-hidden={!movePreviewOpen}>
            <div className="move-preview__card">
              <p className="move-preview__title" id="move-preview-title">{movePreviewTitle}</p>
              <img className={movePreviewAssetClass} id="move-preview-asset" src={movePreviewAsset} alt="" />
              <span className="move-preview__pill" id="move-preview-pill">{movePreviewPill}</span>
              <button className="move-preview__close" id="move-preview-close" type="button" onClick={() => setMovePreviewOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
