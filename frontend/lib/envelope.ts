import { Address, encodeFunctionData, createPublicClient, http, parseTransaction, keccak256, concat, pad, toBytes, toHex, Hex, toFunctionSelector } from 'viem';
import { getTransactionCount, estimateGas, readContract, sendTransaction, signMessage } from '@wagmi/core';
import { getConsensusThreshold, getScaler, PublicKey } from 'neox-tpke';
import { neox, config } from '../config/wagmi';

/**
 * NeoX Envelope Transaction Utility
 * Uses TPKE (Threshold Public Key Encryption) to send private transactions
 * Reference: https://github.com/bane-labs/neox-tpke-examples
 * System contract addresses: https://github.com/bane-labs/neox-tpke-examples/blob/main/src/configs/chains.ts
 */

const SEED5_RPC_URL = 'https://mainnet-5.rpc.banelabs.org';

// NeoX system contract addresses for Testnet T4 (from neox-tpke-examples chains.ts)
const GOVERNANCE_CONTRACT = '0x1212000000000000000000000000000000000001' as Address;
const KEY_MANAGEMENT_CONTRACT = '0x1212000000000000000000000000000000000008' as Address;
const GOVERNANCE_REWARD_CONTRACT = '0x1212000000000000000000000000000000000003' as Address;

// ABIs for system contracts
const governanceAbi = [
  {
    inputs: [],
    name: 'consensusSize',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const keyManagementAbi = [
  {
    inputs: [],
    name: 'roundNumber',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'aggregatedCommitments',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type EnvelopeStatus =
  | 'prepare'
  | 'wallet-send'
  | 'wallet-sign'
  | 'encrypt'
  | 'submit';

/**
 * Get envelope fee from seed5 node
 */
export async function getEnvelopeFee(): Promise<bigint> {
  const response = await fetch(SEED5_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_envelopeFee',
      params: [],
      id: 1,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Failed to get envelope fee: ${data.error.message}`);
  }

  return BigInt(data.result);
}

/**
 * Estimate gas for a transaction
 */
async function estimateGasForTx(
  to: Address,
  data: `0x${string}`,
  value: bigint,
  from: Address
): Promise<bigint> {
  const response = await fetch(SEED5_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_estimateGas',
      params: [
        {
          to,
          data,
          value: value === BigInt(0) ? '0x0' : `0x${value.toString(16)}`,
          from,
        },
      ],
      id: 1,
    }),
  });

  const result = await response.json();
  if (result.error) {
    throw new Error(`Failed to estimate gas: ${result.error.message}`);
  }

  return BigInt(result.result);
}

/**
 * Get max envelope gas limit from seed5 node
 * Falls back to estimating gas or using a default if the method isn't available
 */
export async function getMaxEnvelopeGasLimit(
  fallbackFrom?: Address,
  fallbackTo?: Address,
  fallbackData?: `0x${string}`,
  fallbackValue?: bigint
): Promise<bigint> {
  const response = await fetch(SEED5_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_maxEnvelopeGasLimit',
      params: [],
      id: 1,
    }),
  });

  const data = await response.json();
  if (data.error) {
    // Method not available - try fallback
    if (fallbackFrom && fallbackTo && fallbackData !== undefined) {
      console.warn(
        'eth_maxEnvelopeGasLimit not available, using gas estimation as fallback'
      );
      try {
        const estimatedGas = await estimateGasForTx(
          fallbackTo,
          fallbackData,
          fallbackValue || BigInt(0),
          fallbackFrom
        );
        // Add 20% buffer for safety
        return (estimatedGas * BigInt(120)) / BigInt(100);
      } catch (estimateError) {
        console.warn('Gas estimation failed, using default gas limit');
        // Default to 500k gas as a safe fallback
        return BigInt(500000);
      }
    } else {
      // No fallback available, use default
      console.warn(
        'eth_maxEnvelopeGasLimit not available and no fallback provided, using default gas limit'
      );
      return BigInt(500000); // Default 500k gas
    }
  }

  return BigInt(data.result);
}

/**
 * Send true envelope transaction using TPKE encryption
 * This implements the full NeoX envelope transaction flow
 * @param account - Account address
 * @param to - Contract address
 * @param data - Encoded function data
 * @param value - Value to send (in wei)
 */
export async function sendEnvelopeTransaction(
  account: Address,
  to: Address,
  data: `0x${string}`,
  value: bigint = BigInt(0),
  onStatus?: (status: EnvelopeStatus) => void
): Promise<string> {
  if (!window.ethereum) {
    throw new Error('No wallet found. Please connect your wallet.');
  }

  onStatus?.('prepare');

  const publicClient = createPublicClient({
    chain: neox,
    transport: http(SEED5_RPC_URL),
  });

  // Step 1: Get pending nonce so sequential protected actions do not reuse a stale nonce
  const nonce = await getTransactionCount(config, {
    chainId: neox.id,
    address: account,
    blockTag: 'pending',
  });
  
  // Verify we can connect to seed5 node
  try {
    await publicClient.getBlockNumber();
  } catch (error) {
    throw new Error('Cannot connect to seed5 anti-MEV node. Please check your network connection.');
  }

  // Step 2: Send tx to seed5 via wallet (eth_sendTransaction – MetaMask supports this). Seed5 caches it and returns an error; we then retrieve it with signMessage + getCachedTransaction.
  const gas = await estimateGas(config, {
    chainId: neox.id,
    account,
    to,
    data,
    value,
  });

  try {
    onStatus?.('wallet-send');
    await sendTransaction(config, {
      chainId: neox.id,
      account,
      to,
      data,
      value,
      gas,
      nonce,
    });
    throw new Error('Tx was broadcast. Use mainnet-5 RPC in MetaMask so the tx is cached: https://mainnet-5.rpc.banelabs.org');
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
    if (msg.includes('user rejected') || msg.includes('denied') || msg.includes('rejected the request')) {
      throw new Error('User rejected the request.');
    }
    if (!msg.includes('cached') && !msg.includes('transaction cached')) {
      throw new Error('The Anti-MEV RPC must cache the tx. Set MetaMask RPC to https://mainnet-5.rpc.banelabs.org and try again.');
    }
  }

  let signature: `0x${string}`;
  try {
    onStatus?.('wallet-sign');
    signature = await signMessage(config, { message: nonce.toString() });
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
    if (msg.includes('user rejected') || msg.includes('denied') || msg.includes('rejected the request')) {
      throw new Error('User rejected the request.');
    }
    throw err;
  }
  const cachedRes = await fetch(SEED5_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getCachedTransaction',
      params: [toHex(nonce), signature],
      id: 1,
    }),
  });
  const cachedJson = await cachedRes.json();
  if (cachedJson.error) throw new Error(cachedJson.error.message || 'Failed to get cached transaction');
  const transaction = cachedJson.result as Hex;
  if (!transaction || transaction === '0x') {
    throw new Error(
      'The protected node did not return a cached transaction. The wallet/provider likely did not preserve the Neo X cached-tx response. Try MetaMask injected on Neo X mainnet-5, then retry.'
    );
  }

  // Step 5: Read consensus size from seed5 node
  // First verify we can connect to seed5
  try {
    const blockNumber = await publicClient.getBlockNumber();
    console.log('✅ Connected to seed5 node, current block:', blockNumber);
  } catch (error) {
    throw new Error(`Cannot connect to seed5 node at ${SEED5_RPC_URL}. Please check your network connection.`);
  }

  let consensusSize: bigint;
  try {
    console.log('📞 Reading consensusSize from:', GOVERNANCE_CONTRACT);
    const govCode = await publicClient.getBytecode({ address: GOVERNANCE_CONTRACT });
    if (!govCode || govCode === '0x') {
      throw new Error(`Governance contract does not exist at ${GOVERNANCE_CONTRACT}`);
    }
    console.log('✅ Governance contract exists');
    
    consensusSize = await publicClient.readContract({
      address: GOVERNANCE_CONTRACT,
      abi: governanceAbi,
      functionName: 'consensusSize',
    });
    console.log('✅ consensusSize:', consensusSize.toString());
  } catch (error: any) {
    console.error('❌ Failed to read consensusSize:', error);
    // Try RPC call as fallback
    try {
      console.log('📞 Trying RPC eth_call for consensusSize()...');
      const functionSelector = toFunctionSelector('consensusSize()');
      const rpcResponse = await fetch(SEED5_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            {
              to: GOVERNANCE_CONTRACT,
              data: functionSelector,
            },
            'latest',
          ],
          id: 1,
        }),
      });
      
      const rpcData = await rpcResponse.json();
      if (!rpcData.error && rpcData.result && rpcData.result !== '0x') {
        consensusSize = BigInt(rpcData.result);
        console.log('✅ consensusSize via RPC:', consensusSize.toString());
      } else {
        throw new Error(`RPC call failed: ${rpcData.error?.message || 'Empty result'}`);
      }
    } catch (rpcError: any) {
      console.error('❌ RPC fallback also failed:', rpcError);
      throw new Error(
        `Cannot get consensusSize from Governance contract.\n\n` +
        `Contract: ${GOVERNANCE_CONTRACT}\n` +
        `Direct call error: ${error?.message || 'Failed'}\n` +
        `RPC call error: ${rpcError?.message || 'Failed'}\n\n` +
        `This suggests the Governance contract exists but consensusSize() is not initialized or accessible.`
      );
    }
  }

  // Step 6: Read round number from seed5 node
  // Try multiple approaches to get roundNumber
  let roundNumber: bigint;
  
  // First, verify contract exists and get its bytecode for diagnostics
  console.log('🔍 Checking KeyManagement contract at:', KEY_MANAGEMENT_CONTRACT);
  const code = await publicClient.getBytecode({ address: KEY_MANAGEMENT_CONTRACT });
  if (!code || code === '0x') {
    throw new Error(
      `KeyManagement contract does not exist at ${KEY_MANAGEMENT_CONTRACT}.\n\n` +
      `This suggests the system contract addresses may be incorrect for NeoX Testnet T4.\n` +
      `Please verify the correct system contract addresses in NeoX documentation.`
    );
  }
  console.log('✅ Contract exists, bytecode length:', code.length);
  
  // Try direct contract call first
  let directCallError: any = null;
  try {
    console.log('📞 Attempting direct contract call for roundNumber()...');
    roundNumber = await publicClient.readContract({
      address: KEY_MANAGEMENT_CONTRACT,
      abi: keyManagementAbi,
      functionName: 'roundNumber',
    });
    console.log('✅ roundNumber via direct call:', roundNumber.toString());
  } catch (error: any) {
    directCallError = error;
    console.warn('❌ Direct contract call failed:', error?.message || error);
    
    // Try using RPC call as fallback
    try {
      console.log('📞 Attempting RPC eth_call for roundNumber()...');
      const functionSelector = toFunctionSelector('roundNumber()');
      console.log('Function selector:', functionSelector);
      
      const rpcResponse = await fetch(SEED5_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            {
              to: KEY_MANAGEMENT_CONTRACT,
              data: functionSelector,
            },
            'latest',
          ],
          id: 1,
        }),
      });
      
      const rpcData = await rpcResponse.json();
      console.log('RPC response:', JSON.stringify(rpcData, null, 2));
      
      if (!rpcData.error && rpcData.result && rpcData.result !== '0x') {
        roundNumber = BigInt(rpcData.result);
        console.log('✅ roundNumber via RPC:', roundNumber.toString());
      } else {
        throw new Error(`RPC call failed: ${rpcData.error?.message || 'Empty result'}`);
      }
    } catch (rpcError: any) {
      console.error('❌ RPC fallback also failed:', rpcError);
      
      // Last resort: try roundNumber = 0 (might work if system is not initialized)
      console.warn('⚠️ Attempting to use roundNumber = 0 as fallback...');
      roundNumber = BigInt(0);
      
      // Verify if roundNumber 0 works by trying to read aggregatedCommitment
      try {
        console.log('🔍 Verifying roundNumber=0 by checking aggregatedCommitments...');
        const testCommitment = await publicClient.readContract({
          address: KEY_MANAGEMENT_CONTRACT,
          abi: keyManagementAbi,
          functionName: 'aggregatedCommitments',
          args: [roundNumber],
        });
        console.log('✅ roundNumber = 0 appears to work, commitment length:', (testCommitment as Hex).length);
      } catch (verifyError: any) {
        // If roundNumber 0 doesn't work, we can't proceed
        const errorDetails = {
          directCall: directCallError?.message || 'Failed',
          rpcCall: rpcError?.message || 'Failed',
          verifyRound0: verifyError?.message || 'Failed',
        };
        
        throw new Error(
          `Cannot get roundNumber from KeyManagement contract.\n\n` +
          `Contract Address: ${KEY_MANAGEMENT_CONTRACT}\n` +
          `Contract Exists: ✅ Yes (bytecode found)\n\n` +
          `Attempted Methods:\n` +
          `1. Direct contract call: ${errorDetails.directCall}\n` +
          `2. RPC eth_call: ${errorDetails.rpcCall}\n` +
          `3. Fallback roundNumber=0: ${errorDetails.verifyRound0}\n\n` +
          `This suggests the KeyManagement contract exists but:\n` +
          `- The roundNumber() function may not be initialized\n` +
          `- The function signature may be incorrect\n` +
          `- Envelope transactions may not be fully supported on NeoX Testnet T4\n\n` +
          `Please ensure:\n` +
          `- MetaMask is configured to use mainnet-5 RPC: https://mainnet-5.rpc.banelabs.org\n` +
          `- Check NeoX documentation for envelope transaction support on testnet\n` +
          `- Verify system contract addresses are correct for Testnet T4`
        );
      }
    }
  }

  // Step 7: Read aggregated commitment from seed5 node
  let aggregatedCommitment: Hex;
  try {
    aggregatedCommitment = await publicClient.readContract({
      address: KEY_MANAGEMENT_CONTRACT,
      abi: keyManagementAbi,
      functionName: 'aggregatedCommitments',
      args: [roundNumber],
    }) as Hex;
  } catch (error: any) {
    console.error('Failed to read aggregatedCommitment:', error);
    throw new Error(
      `Failed to read aggregatedCommitment from keyManagement contract.\n` +
      `Round number: ${roundNumber}\n` +
      `Error: ${error?.message || 'Unknown error'}`
    );
  }

  // Step 8: Create TPKE public key
  const publicKey = PublicKey.fromAggregatedCommitment(
    toBytes(aggregatedCommitment),
    getScaler(consensusSize, getConsensusThreshold(consensusSize))
  );

  const transactionBytes = toBytes(transaction);
  if (transactionBytes.length === 0) {
    throw new Error(
      'The protected node returned an empty cached transaction. The wallet/provider did not preserve the Neo X cached-tx handshake. Try again with a provider path that supports mainnet-5 cached transactions.'
    );
  }

  // Step 9: Encrypt transaction
  onStatus?.('encrypt');
  let encryptedKey: Uint8Array;
  let encryptedMsg: Uint8Array;
  try {
    ({ encryptedKey, encryptedMsg } = publicKey.encrypt(transactionBytes));
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (msg.toLowerCase().includes('empty aes message')) {
      throw new Error(
        'The protected node returned an empty cached transaction. The wallet/provider did not preserve the Neo X cached-tx handshake. Try again with a provider path that supports mainnet-5 cached transactions.'
      );
    }
    throw error;
  }

  // Step 10: Parse transaction to get gas limit
  const transactionObject = parseTransaction(transaction);
  const gasLimit = transactionObject.gas || BigInt(21000);

  // Step 11: Create envelope data
  // Format: prefix (0xffffffff) + roundNumber (4 bytes) + gasLimit (4 bytes) + hash (32 bytes) + encryptedKey + encryptedMsg
  const envelopeData = concat([
    new Uint8Array([0xff, 0xff, 0xff, 0xff]), // Prefix
    pad(toBytes(roundNumber), { size: 4 }), // Round number (4 bytes)
    pad(toBytes(gasLimit), { size: 4 }), // Gas limit (4 bytes)
    toBytes(keccak256(transaction)), // Transaction hash (32 bytes)
    encryptedKey, // Encrypted key
    encryptedMsg, // Encrypted message
  ]);

  // Step 12: Submit envelope to governance reward contract (same as bane-labs/neox-tpke-examples: sendTransaction with envelope as data)
  const envelopeHex = toHex(envelopeData) as `0x${string}`;
  try {
    onStatus?.('submit');
    const hash = await sendTransaction(config, {
      chainId: neox.id,
      account,
      to: GOVERNANCE_REWARD_CONTRACT,
      data: envelopeHex,
      nonce,
    });
    return hash;
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
    if (msg.includes('user rejected') || msg.includes('denied') || msg.includes('rejected the request')) {
      throw new Error('User rejected the request.');
    }
    throw err;
  }
}

/**
 * Helper to create envelope transaction for contract call
 */
export async function sendEnvelopeContractCall(
  account: Address,
  contractAddress: Address,
  abi: any[],
  functionName: string,
  args: any[],
  value: bigint = BigInt(0),
  onStatus?: (status: EnvelopeStatus) => void
): Promise<string> {
  // Encode function data
  const data = encodeFunctionData({
    abi,
    functionName,
    args,
  });

  return sendEnvelopeTransaction(account, contractAddress, data, value, onStatus);
}
