import { createConfig, http } from 'wagmi';
import { metaMask, walletConnect, injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

// Neo X network configuration (Mainnet)
export const neox = defineChain({
  id: 47763, // Neo X Mainnet Chain ID
  name: 'Neo X Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'GAS',
    symbol: 'GAS',
  },
  rpcUrls: {
    default: {
      // Use a regular mainnet RPC for wallet/network setup and public transactions
      http: [process.env.NEXT_PUBLIC_NEOX_RPC_URL || 'https://mainnet-1.rpc.banelabs.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Neo X Explorer',
      url: 'https://neoxscan.ngd.network',
    },
  },
});

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const config = createConfig({
  chains: [neox],
  connectors: [
    metaMask(),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: 'Anti-MEV Demo',
              description: 'Neo X anti-MEV rock paper scissors demo',
              url: appUrl,
              icons: [],
            },
          }),
        ]
      : []),
    injected({ unstable_shimAsyncInject: true }),
  ],
  transports: {
    [neox.id]: http(process.env.NEXT_PUBLIC_NEOX_RPC_URL || 'https://mainnet-1.rpc.banelabs.org'),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
