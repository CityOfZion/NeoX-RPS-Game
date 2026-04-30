'use client';

import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected, metaMask, walletConnect, coinbaseWallet } from 'wagmi/connectors';

const NEOX_CHAIN_ID = 47763; // Neo X Mainnet Chain ID
const NEOX_NAME = 'Neo X';

export default function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const isCorrectNetwork = chainId === NEOX_CHAIN_ID;

  const handleConnect = (connector: any) => {
    connect({ connector });
  };

  const handleSwitchChain = () => {
    switchChain({ chainId: NEOX_CHAIN_ID });
  };

  if (!isConnected) {
    return (
      <div className="space-y-4">
        {/* Main Connect Button - Always visible */}
        <button
          onClick={() => {
            // Try MetaMask first, then others
            const metaMaskConnector = connectors.find(c => c.id === 'metaMask');
            const injectedConnector = connectors.find(c => c.id === 'injected');
            const connector = metaMaskConnector || injectedConnector || connectors[0];
            if (connector) {
              handleConnect(connector);
            } else {
              alert('No wallet connectors available. Please install MetaMask or another Web3 wallet.');
            }
          }}
          disabled={isPending || connectors.length === 0}
          className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold text-lg rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Connecting...' : '🔗 Connect Wallet'}
        </button>
        
        {/* Show all available connectors */}
        {connectors.length > 0 && (
          <div>
            <p className="text-white/60 text-xs mb-2 text-center">Or choose a specific wallet:</p>
            <div className="grid grid-cols-2 gap-2">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  onClick={() => handleConnect(connector)}
                  disabled={isPending}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-all disabled:opacity-50"
                >
                  {connector.name}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {connectors.length === 0 && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3">
            <p className="text-yellow-200 text-sm text-center">
              ⚠️ No wallets detected. Please install MetaMask or another Web3 wallet.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/80 text-sm">Address:</span>
          <span className="text-white font-mono text-xs">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/80 text-sm">Network:</span>
          {isCorrectNetwork ? (
            <span className="text-green-400 text-xs font-semibold flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              {NEOX_NAME}
            </span>
          ) : (
            <button
              onClick={handleSwitchChain}
              className="text-yellow-400 text-xs font-semibold hover:text-yellow-300 underline"
            >
              Switch to {NEOX_NAME}
            </button>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          className="w-full mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs rounded transition-all"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
