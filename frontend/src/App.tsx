import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import OnboardingFlow from './components/OnboardingFlow';
import BorrowFlow from './components/BorrowFlow';
import RepayFlow from './components/RepayFlow';
import Dashboard from './components/Dashboard';
import {
    CONTRACTS,
    MONAD_CHAIN_ID,
    EWA_LENDING_ABI,
    ATTESTATION_REGISTRY_ABI,
    REPUTATION_TRACKER_ABI,
} from './config/contracts';

type Tab = 'onboarding' | 'dashboard' | 'borrow' | 'repay';

export interface AppState {
    provider: ethers.BrowserProvider | null;
    signer: ethers.Signer | null;
    address: string;
    connected: boolean;
    chainId: number | null;
    hasAttestation: boolean;
    reputation: number;
    activeLoans: any[];
    totalObligation: bigint;
    maxLoanAmount: bigint;
    totalLiquidity: bigint;
}

function App() {
    const [tab, setTab] = useState<Tab>('onboarding');
    const [state, setState] = useState<AppState>({
        provider: null,
        signer: null,
        address: '',
        connected: false,
        chainId: null,
        hasAttestation: false,
        reputation: 50,
        activeLoans: [],
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

    const refreshData = useCallback(async () => {
        if (!state.provider || !state.address) return;

        try {
            // Check attestation validity
            const attestReg = new ethers.Contract(
                CONTRACTS.attestationRegistry,
                ATTESTATION_REGISTRY_ABI,
                state.provider
            );
            let hasAttestation = false;
            try { hasAttestation = await attestReg.isValid(state.address); } catch { }

            // Get reputation
            const repTracker = new ethers.Contract(
                CONTRACTS.reputationTracker,
                REPUTATION_TRACKER_ABI,
                state.provider
            );
            let reputation = 50;
            try { reputation = Number(await repTracker.getReputation(state.address)); } catch { }

            // Get active loans
            const lending = new ethers.Contract(
                CONTRACTS.ewaLending,
                EWA_LENDING_ABI,
                state.provider
            );
            let activeLoans: any[] = [];
            let totalObligation = 0n;
            let maxLoanAmount = 0n;
            let totalLiquidity = 0n;

            try { activeLoans = await lending.getActiveLoans(state.address); } catch { }
            try { totalObligation = await lending.getOutstandingObligation(state.address); } catch { }
            try { maxLoanAmount = await lending.maxLoanAmount(); } catch { }
            try { totalLiquidity = await lending.totalLiquidity(); } catch { }

            setState(prev => ({
                ...prev,
                hasAttestation,
                reputation,
                activeLoans,
                totalObligation,
                maxLoanAmount,
                totalLiquidity,
            }));
        } catch (err) {
            console.error('Failed to refresh data:', err);
        }
    }, [state.provider, state.address]);

    useEffect(() => {
        if (state.connected) {
            refreshData();
        }
    }, [state.connected, refreshData]);

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

    const tabs: { id: Tab; label: string }[] = [
        { id: 'onboarding', label: '🚀 Onboard' },
        { id: 'dashboard', label: '📊 Dashboard' },
        { id: 'borrow', label: '💰 Borrow' },
        { id: 'repay', label: '🔄 Repay' },
    ];

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="app-logo">
                    <h1>EWA Protocol</h1>
                    <span className="badge">Monad × Unlink</span>
                </div>
                {state.connected ? (
                    <div className="wallet-info">
                        <span className="wallet-dot"></span>
                        <span className="wallet-address">
                            {state.address.slice(0, 6)}...{state.address.slice(-4)}
                        </span>
                        {state.chainId === MONAD_CHAIN_ID && (
                            <span className="privacy-shield">🔒 Monad</span>
                        )}
                    </div>
                ) : (
                    <button className="btn btn-primary" onClick={connectWallet} id="connect-wallet-btn">
                        Connect Wallet
                    </button>
                )}
            </header>

            {/* Navigation */}
            <nav className="nav-tabs" id="main-nav">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        id={`nav-${t.id}`}
                        className={`nav-tab ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {/* Content */}
            <main className="animate-fade-in" key={tab}>
                {tab === 'onboarding' && (
                    <OnboardingFlow
                        state={state}
                        connectWallet={connectWallet}
                        onComplete={() => { refreshData(); setTab('dashboard'); }}
                    />
                )}
                {tab === 'dashboard' && (
                    <Dashboard state={state} refreshData={refreshData} />
                )}
                {tab === 'borrow' && (
                    <BorrowFlow state={state} onBorrowed={() => { refreshData(); setTab('dashboard'); }} />
                )}
                {tab === 'repay' && (
                    <RepayFlow state={state} onRepaid={refreshData} />
                )}
            </main>
        </div>
    );
}

export default App;
