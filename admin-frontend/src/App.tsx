import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import AdminPanel from './components/AdminPanel';
import {
  MONAD_CHAIN_ID,
} from './config/contracts';

// We just need a minimal AppState for the AdminPanel to use
export interface AppState {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string;
  connected: boolean;
  chainId: number | null;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    provider: null,
    signer: null,
    address: '',
    connected: false,
    chainId: null,
  });

  const connectWallet = useCallback(async () => {
    if (!(window as any).ethereum) {
      alert('Please install MetaMask!');
      return;
    }
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      setState(prev => ({
        ...prev,
        provider,
        signer,
        address,
        connected: true,
        chainId: Number(network.chainId),
      }));
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = () => connectWallet();
    const handleChainChanged = () => window.location.reload();

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [connectWallet]);

  return (
    <div className="app-container">
      {/* Admin Header */}
      <header className="app-header">
        <div className="app-logo">
          <h1>EWA Protocol</h1>
          <span className="admin-badge">Admin Panel</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {state.connected ? (
            <div className="wallet-info">
              <span className="wallet-dot" />
              <span className="wallet-address">
                {state.address.slice(0, 6)}...{state.address.slice(-4)}
              </span>
              {state.chainId === MONAD_CHAIN_ID && (
                <span className="privacy-shield">🔒 Monad</span>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet} id="admin-connect-wallet-btn">
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Admin Panel Content */}
      <main className="animate-fade-in">
        {state.connected && state.chainId !== MONAD_CHAIN_ID ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <h2>⚠️ Wrong Network</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
              Please switch your MetaMask to the <strong>Monad Testnet</strong> to use the Admin Panel.
            </p>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await (window as any).ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ethers.toQuantity(MONAD_CHAIN_ID) }],
                  });
                } catch (err: any) {
                  // If the chain hasn't been added, request to add it
                  if (err.code === 4902) {
                    await (window as any).ethereum.request({
                      method: 'wallet_addEthereumChain',
                      params: [
                        {
                          chainId: ethers.toQuantity(MONAD_CHAIN_ID),
                          chainName: 'Monad Testnet',
                          rpcUrls: ['https://testnet-rpc.monad.xyz'],
                          nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
                        },
                      ],
                    });
                  }
                }
              }}
            >
              Switch to Monad Testnet
            </button>
          </div>
        ) : (
          <AdminPanel state={state as any} />
        )}
      </main>
    </div>
  );
}
