import { useState } from 'react';
import { ethers } from 'ethers';
import { AppState } from '../App';
import { CONTRACTS, EWA_LENDING_ABI } from '../config/contracts';
import { useInteract, toCall, formatAmount } from '@unlink-xyz/react';

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

    // Unlink hook for atomic shielded -> public -> shielded calls
    const { interact, isPending } = useInteract();

    const handleRepay = async (loanId: number) => {
        if (!state.signer || !repayAmount) return;
        setLoading(true);
        setStatus('Initiating early repayment privately via Unlink...');

        try {
            const amountWei = ethers.parseEther(repayAmount);

            // Build the exact calldata for the contract's repay(uint256)
            const lendingInterface = new ethers.Interface(EWA_LENDING_ABI);
            const calldata = lendingInterface.encodeFunctionData('repay', [loanId]);

            // Execute the Unlink interaction:
            // 1. Spend `amountWei` of MON (token 0x0) from private balance
            // 2. Call the lending contract with the public repay payload and the unshielded value
            // 3. Receive any unused unshielded value back into the private balance
            const result = await interact({
                spend: [{ token: '0x0', amount: amountWei }],
                calls: [
                    toCall({
                        to: CONTRACTS.ewaLending,
                        value: amountWei,
                        data: calldata
                    })
                ],
                receive: [{ token: '0x0', minAmount: 0n }]
            });

            setStatus(`✅ Repayment successful! Relay ID: ${result.relayId}`);
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
                                            />
                                            <button
                                                className="btn btn-success"
                                                onClick={() => handleRepay(loanId)}
                                                disabled={loading || !repayAmount}
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
    );
}
