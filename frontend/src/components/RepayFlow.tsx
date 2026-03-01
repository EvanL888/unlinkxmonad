import { useState } from 'react';
import { ethers } from 'ethers';
import { AppState } from '../App';
import { CONTRACTS, EWA_LENDING_ABI, MON_TOKEN } from '../config/contracts';
import { useUnlink } from '@unlink-xyz/react';
import TxToast from './TxToast';

interface Props {
    state: AppState;
    onRepaid: () => void;
}

const SCHEME_NAMES = ['Single Paycheck', 'Installments', 'Deposit-Backed', 'Dynamic Interest'];
const STATUS_NAMES = ['Active', 'Repaid', 'Defaulted'];
const STATUS_CLASSES = ['status-active', 'status-repaid', 'status-defaulted'];

export default function RepayFlow({ state, onRepaid }: Props) {
    const [selectedLoan, setSelectedLoan] = useState<number | null>(null);
    const [repayAmount, setRepayAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState<string | null>(null);

    // Unlink SDK — burner accounts for private DeFi with native MON
    const { unlink } = useUnlink();

    const handleRepay = async (loanId: number) => {
        if (!state.signer || !repayAmount || !unlink) return;
        setLoading(true);
        setStatus('🔒 Initiating private repayment via Unlink...');

        try {
            const amountWei = ethers.parseEther(repayAmount);
            const burnerIndex = Date.now(); // Unique burner for each repay

            // 1. Retrieve the local loan record to get its Nullifier Hash
            const loan = state.activeLoans.find((l: any) => l.id === loanId);
            if (!loan || !loan.nullifierHash) throw new Error("Loan commitment not found locally!");

            // 2. Fund a fresh burner with repayment amount + gas from shielded pool
            setStatus('🔒 Creating anonymous burner wallet...');
            const totalFund = amountWei + ethers.parseEther('0.01'); // repay + gas
            await unlink.burner.fund(burnerIndex, {
                token: MON_TOKEN,
                amount: totalFund,
            });

            // 3. Burner calls repayConfidential — only the burner address appears on-chain
            setStatus('🔒 Burner calling repayConfidential (your address hidden)...');
            const mockZkProof = ethers.hexlify(ethers.randomBytes(64));
            const iface = new ethers.Interface(EWA_LENDING_ABI);
            const calldata = iface.encodeFunctionData('repayConfidential', [
                loan.nullifierHash, mockZkProof
            ]);

            const { txHash: repayTxHash } = await unlink.burner.send(burnerIndex, {
                to: CONTRACTS.ewaLending,
                data: calldata,
                value: amountWei, // Send MON with the repay call
            });

            setTxHash(repayTxHash);

            // 4. Sweep any remaining MON (leftover gas) back to the privacy pool
            try {
                await unlink.burner.sweepToPool(burnerIndex, { token: MON_TOKEN });
            } catch (sweepErr) {
                console.warn('Sweep leftover failed (may be empty):', sweepErr);
            }

            // 5. Update the local unencrypted state
            const stored = localStorage.getItem(`ewa_confidential_loans_${state.address}`);
            if (stored) {
                const loans = JSON.parse(stored);
                const loanIndex = loans.findIndex((l: any) => l.id === loanId);
                if (loanIndex !== -1) {
                    const l = loans[loanIndex];
                    const newRepaid = BigInt(l.totalRepaid || '0') + amountWei;
                    l.totalRepaid = newRepaid.toString();
                    if (newRepaid >= BigInt(l.totalOwed)) {
                        l.status = 1; // Repaid
                    }
                    localStorage.setItem(`ewa_confidential_loans_${state.address}`, JSON.stringify(loans));
                }
            }

            setStatus('✅ Repayment successful! Your real address is hidden on-chain.');
            setSelectedLoan(null);
            setRepayAmount('');
            setTimeout(() => { onRepaid(); setStatus(''); }, 3000);
        } catch (err: any) {
            console.error(err);
            setStatus('❌ ' + (err.reason || err.message || err.toString()));
        } finally {
            setLoading(false);
        }
    };

    if (!state.connected) {
        return (
            <div className="card animate-slide-up">
                <div className="empty-state">
                    <div className="emoji">🔗</div>
                    <p>Connect your wallet to view repayment options</p>
                </div>
            </div>
        );
    }

    const activeLoans = state.activeLoans.filter((l: any) => Number(l.status) === 0);

    return (
        <>
            <div className="animate-slide-up" style={{ display: 'grid', gap: 24 }}>
                {/* Auto-deduction info */}
                <div className="card card-gradient">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Repayment</h2>
                            <p className="card-subtitle">Auto-deduction from payroll — no action needed</p>
                        </div>
                    </div>

                    <div className="alert alert-success">
                        ✅ <strong>Auto-deduction active.</strong> Your next payroll deposit through
                        PayrollRouter will automatically repay your outstanding loans. No manual action required.
                    </div>

                    {state.totalObligation > 0n && (
                        <div className="preview-box">
                            <div className="preview-row">
                                <span className="label">Total outstanding obligation</span>
                                <span className="value highlight">
                                    {ethers.formatEther(state.totalObligation)} MON
                                </span>
                            </div>
                            <div className="preview-row">
                                <span className="label">Deducted from next payroll</span>
                                <span className="value">
                                    {ethers.formatEther(state.totalObligation)} MON
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Active loans list */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Active Loans</h3>
                        <span className="status-badge status-active">
                            {activeLoans.length} active
                        </span>
                    </div>

                    {activeLoans.length === 0 ? (
                        <div className="empty-state">
                            <div className="emoji">🎉</div>
                            <p>No active loans! You're all clear.</p>
                        </div>
                    ) : (
                        activeLoans.map((loan: any, idx: number) => {
                            const loanId = Number(loan.id);
                            const remaining = BigInt(loan.totalOwed) - BigInt(loan.totalRepaid);
                            const progress = Number(BigInt(loan.totalRepaid) * 100n / BigInt(loan.totalOwed));

                            return (
                                <div key={idx} className="loan-card">
                                    <div className="loan-info">
                                        <div className="loan-amount">
                                            {ethers.formatEther(loan.principal)} MON
                                        </div>
                                        <div className="loan-details">
                                            {SCHEME_NAMES[Number(loan.scheme)]} · Remaining: {ethers.formatEther(remaining)} MON · {progress}% repaid
                                        </div>
                                        {/* Progress bar */}
                                        <div style={{
                                            width: '200px',
                                            height: 4,
                                            background: 'var(--bg-input)',
                                            borderRadius: 2,
                                            marginTop: 8,
                                        }}>
                                            <div style={{
                                                width: `${progress}%`,
                                                height: '100%',
                                                background: 'var(--gradient-primary)',
                                                borderRadius: 2,
                                                transition: 'width 0.5s ease',
                                            }} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span className={`status-badge ${STATUS_CLASSES[Number(loan.status)]}`}>
                                            {STATUS_NAMES[Number(loan.status)]}
                                        </span>

                                        {selectedLoan === loanId ? (
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    style={{ width: 120, padding: '8px 12px' }}
                                                    placeholder="Amount"
                                                    value={repayAmount}
                                                    onChange={e => setRepayAmount(e.target.value)}
                                                    step="0.01"
                                                    min="0.01"
                                                    max={ethers.formatEther(remaining)}
                                                />
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '8px', fontSize: '0.85rem' }}
                                                    onClick={() => setRepayAmount(ethers.formatEther(remaining))}
                                                    title="Pay Remaining Balance"
                                                >
                                                    Max
                                                </button>
                                                <button
                                                    className="btn btn-success"
                                                    onClick={() => handleRepay(loanId)}
                                                    disabled={
                                                        loading ||
                                                        !repayAmount ||
                                                        Number(repayAmount) < 0.01 ||
                                                        Number(repayAmount) > Number(ethers.formatEther(remaining))
                                                    }
                                                >
                                                    {loading ? '...' : 'Pay'}
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={() => { setSelectedLoan(null); setRepayAmount(''); }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                id={`early-repay-btn-${loanId}`}
                                                className="btn btn-secondary"
                                                onClick={() => setSelectedLoan(loanId)}
                                            >
                                                Repay Early (+rep)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {status && (
                    <div className={`alert ${status.includes('✅') ? 'alert-success' : 'alert-warning'}`}>
                        {status}
                    </div>
                )}

                {/* Privacy note */}
                <div className="card" style={{ padding: 20 }}>
                    <div className="privacy-shield" style={{ display: 'flex', width: 'fit-content' }}>
                        🔒 Early repayment via Unlink makes the repayment amount invisible on-chain
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
                        In production, the "Repay Early" button uses Unlink's <code>interact()</code> to privately
                        unshield MON → call repay() → reshield change, all in one atomic transaction.
                    </p>
                </div>
            </div>

            <TxToast txHash={txHash} onDismiss={() => setTxHash(null)} />
        </>
    );
}
