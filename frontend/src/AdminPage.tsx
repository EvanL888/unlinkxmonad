import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import AdminPanel from './components/AdminPanel';
import {
    CONTRACTS,
    MONAD_CHAIN_ID,
    EWA_LENDING_ABI,
    ATTESTATION_REGISTRY_ABI,
    REPUTATION_TRACKER_ABI,
} from './config/contracts';
import { AppState } from './App';

/**
 * AdminPage — Standalone page at /admin for employer/company operations.
 * Has its own header, wallet connection, and does NOT share the borrower tab UI.
 */
export default function AdminPage() {
    const [state, setState] = useState<AppState>({
        provider: null,
        signer: null,
        address: '',
        connected: false,
        chainId: null,
        hasAttestation: false,
        reputation: 50,
        activeLoans: [],
        allLoans: [],
        totalObligation: 0n,
        maxLoanAmount: 0n,
        totalLiquidity: 0n,
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
                    <a
                        href="/"
                        style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            textDecoration: 'none',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-purple)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                    >
                        ← Back to App
                    </a>
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
                <AdminPanel state={state} />
            </main>
        </div>
    );
}
