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
    PAYROLL_ROUTER_ABI
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
    allLoans: any[];
    payrollEvents: any[];
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
        allLoans: [],
        payrollEvents: [],
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
            let allLoans: any[] = [];
            let payrollEvents: any[] = [];
            let totalObligation = 0n;
            let maxLoanAmount = 0n;
            let totalLiquidity = 0n;

            // -- START PAYROLL SYNC BLOCK --
            // Fetch total historical payroll deductions from chain
            // Due to Monad TestnetRPC limits, we must cache events locally and only fetch chunks of 100 blocks.
            const storedEventsStr = localStorage.getItem(`ewa_payroll_events_${state.address}`);
            payrollEvents = storedEventsStr ? JSON.parse(storedEventsStr) : [];
            const storedDeductionsStr = localStorage.getItem(`ewa_payroll_deductions_${state.address}`);
            let totalDeductionsOnChain = storedDeductionsStr ? BigInt(storedDeductionsStr) : 0n;

            try {
                const router = new ethers.Contract(CONTRACTS.payrollRouter, PAYROLL_ROUTER_ABI, state.provider);
                const filter = router.filters.PayrollProcessed(state.address);
                const blockNum = await state.provider.getBlockNumber();

                const lastQueriedStr = localStorage.getItem(`ewa_payroll_last_block_${state.address}`);
                // If not synced, look back 500 blocks for hackathon demo
                let fromBlock = lastQueriedStr ? parseInt(lastQueriedStr) + 1 : Math.max(0, blockNum - 500);
                if (blockNum - fromBlock > 2000) {
                    fromBlock = Math.max(0, blockNum - 2000); // hard cap just in case to prevent infinite spinning
                }

                if (fromBlock <= blockNum) {
                    for (let start = fromBlock; start <= blockNum; start += 99) {
                        const end = Math.min(start + 98, blockNum);
                        try {
                            const logs = await router.queryFilter(filter, start, end);
                            for (const log of logs as any[]) {
                                if (log.args && log.args.deducted !== undefined) {
                                    totalDeductionsOnChain += BigInt(log.args.deducted);

                                    let blockTime = Date.now();
                                    try {
                                        const block = await state.provider.getBlock(log.blockHash);
                                        if (block) blockTime = block.timestamp * 1000;
                                    } catch (e) {
                                        console.warn('Rate limit hit fetching block timestamp. Falling back to current time.');
                                    }

                                    // Prevent duplicate logs if the block ranges overlap between syncs
                                    if (!payrollEvents.find((e: any) => e.hash === log.transactionHash)) {
                                        payrollEvents.push({
                                            date: blockTime,
                                            totalDeposit: log.args.totalDeposit.toString(),
                                            deducted: log.args.deducted.toString(),
                                            forwarded: log.args.forwarded.toString(),
                                            hash: log.transactionHash
                                        });
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn(`queryFilter failed for block range ${start}-${end}`, e);
                            break;
                        }
                        await new Promise(r => setTimeout(r, 200));
                    }
                    localStorage.setItem(`ewa_payroll_last_block_${state.address}`, blockNum.toString());
                    localStorage.setItem(`ewa_payroll_events_${state.address}`, JSON.stringify(payrollEvents));
                    localStorage.setItem(`ewa_payroll_deductions_${state.address}`, totalDeductionsOnChain.toString());
                }
            } catch (e) { console.error('Failed to sync payroll events:', e); }
            // -- END PAYROLL SYNC BLOCK --

            // Read confidential loans from local ZK state (simulated via localStorage)
            try {
                const storedLoans = localStorage.getItem(`ewa_confidential_loans_${state.address}`);
                if (storedLoans) {
                    const parsed = JSON.parse(storedLoans);
                    const mapLoan = (l: any) => ({
                        ...l,
                        principal: BigInt(l.principal || '0'),
                        interest: BigInt(l.interest || '0'),
                        totalOwed: BigInt(l.totalOwed || '0'),
                        totalRepaid: BigInt(l.totalRepaid || '0'),
                        collateral: BigInt(l.collateral || '0')
                    });

                    // Apply any new deductions purely to local loan state
                    const storedSync = localStorage.getItem(`ewa_payroll_sync_${state.address}`);
                    const previouslySynced = storedSync ? BigInt(storedSync) : 0n;

                    let newDeductions = previouslySynced < totalDeductionsOnChain
                        ? (totalDeductionsOnChain - previouslySynced)
                        : 0n;

                    if (newDeductions > 0n) {
                        for (const l of parsed) {
                            if (l.status === 0 && newDeductions > 0n) {
                                const remainingOwed = BigInt(l.totalOwed || '0') - BigInt(l.totalRepaid || '0');
                                if (remainingOwed > 0n) {
                                    const applied = newDeductions > remainingOwed ? remainingOwed : newDeductions;
                                    l.totalRepaid = (BigInt(l.totalRepaid || '0') + applied).toString();
                                    newDeductions -= applied;

                                    if (BigInt(l.totalRepaid) >= BigInt(l.totalOwed)) {
                                        l.status = 1; // Repaid
                                    }
                                }
                            }
                        }
                        // Save updated loans back to local storage
                        localStorage.setItem(`ewa_confidential_loans_${state.address}`, JSON.stringify(parsed));
                        localStorage.setItem(`ewa_payroll_sync_${state.address}`, totalDeductionsOnChain.toString());
                    }

                    activeLoans = parsed.filter((l: any) => l.status === 0).map(mapLoan);
                    allLoans = parsed.map(mapLoan);

                    for (const l of activeLoans) {
                        totalObligation += (BigInt(l.totalOwed) - BigInt(l.totalRepaid));
                    }
                }
            } catch (e) {
                console.error('Failed to load local confidential loans:', e);
            }
            try { maxLoanAmount = await lending.maxLoanAmount(); } catch (e) { console.error('maxLoanAmount failed:', e); }
            try { totalLiquidity = await lending.totalLiquidity(); } catch (e) { console.error('totalLiquidity failed:', e); }

            setState(prev => ({
                ...prev,
                hasAttestation,
                reputation,
                activeLoans,
                allLoans,
                payrollEvents,
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

    // Re-fetch chain data whenever the user navigates to a data-dependent tab
    useEffect(() => {
        if (state.connected && (tab === 'borrow' || tab === 'repay' || tab === 'dashboard')) {
            refreshData();
        }
    }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

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
