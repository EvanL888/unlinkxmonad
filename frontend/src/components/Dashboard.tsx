import { ethers } from 'ethers';
import { AppState } from '../App';
import { useUnlinkBalances } from '@unlink-xyz/react';
import { MON_TOKEN } from '../config/contracts';

interface Props {
    state: AppState;
    refreshData: () => void;
}

const SCHEME_NAMES = ['Single Paycheck', 'Installments', 'Deposit-Backed', 'Dynamic Interest'];
const STATUS_NAMES = ['Active', 'Repaid', 'Defaulted'];
const STATUS_CLASSES = ['status-active', 'status-repaid', 'status-defaulted'];

export default function Dashboard({ state, refreshData }: Props) {
    const { balances, ready: unlinkReady } = useUnlinkBalances();
    if (!state.connected) {
        return (
            <div className="card animate-slide-up">
                <div className="empty-state">
                    <div className="emoji">📊</div>
                    <p>Connect your wallet to see your dashboard</p>
                </div>
            </div>
        );
    }

    const circumference = 2 * Math.PI * 58;
    const repOffset = circumference - (state.reputation / 100) * circumference;

    const getRepLevel = (rep: number) => {
        if (rep >= 80) return { label: 'Excellent', color: 'var(--accent-green)' };
        if (rep >= 60) return { label: 'Good', color: 'var(--accent-blue)' };
        if (rep >= 40) return { label: 'Fair', color: 'var(--accent-amber)' };
        return { label: 'Poor', color: 'var(--accent-red)' };
    };

    const repLevel = getRepLevel(state.reputation);

    return (
        <div className="animate-slide-up" style={{ display: 'grid', gap: 24 }}>
            {/* Stats row */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Reputation Score</div>
                    <div className="stat-value gradient">{state.reputation}/100</div>
                    <div style={{ fontSize: '0.75rem', color: repLevel.color, marginTop: 4, fontWeight: 600 }}>
                        {repLevel.label}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Active Loans</div>
                    <div className="stat-value">{state.activeLoans.filter((l: any) => Number(l.status) === 0).length}</div>
                </div>

                {/* Outstanding Obligation logic wrapper */}
                {(() => {
                    const totalPrincipal = state.activeLoans.reduce((sum: bigint, l: any) => sum + BigInt(l.principal), 0n);
                    const totalInterest = state.activeLoans.reduce((sum: bigint, l: any) => sum + BigInt(l.interest), 0n);
                    const totalRepaid = state.activeLoans.reduce((sum: bigint, l: any) => sum + BigInt(l.totalRepaid), 0n);
                    const remainingOwed = (totalPrincipal + totalInterest) - totalRepaid;

                    // Rough estimation of how much principal vs interest is remaining, ignoring repayment ordering for UI simplicity
                    const remainingPrincipal = remainingOwed > totalInterest ? remainingOwed - totalInterest : 0n;
                    const remainingInterest = remainingOwed > totalInterest ? totalInterest : remainingOwed;

                    const maxLimit = Number(ethers.formatEther(state.maxLoanAmount));
                    const totalObligationNum = Number(ethers.formatEther(state.totalObligation));
                    const poolLiquidityLimit = Number(ethers.formatEther(state.totalLiquidity)) * 0.25;
                    const limitLeft = Math.min(Math.max(0, maxLimit - totalObligationNum), poolLiquidityLimit);

                    return (
                        <>
                            <div className="stat-card">
                                <div className="stat-label">Available Credit</div>
                                <div className="stat-value gradient">
                                    {limitLeft.toFixed(2)} MON
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                                    Total Limit: {maxLimit.toFixed(2)} MON
                                </div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-label">Outstanding Obligation</div>
                                <div className="stat-value gradient">
                                    {remainingOwed > 0n ? ethers.formatEther(remainingOwed) : '0'} MON
                                </div>
                                {remainingOwed > 0n && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                                        <div>Principal: {Number(ethers.formatEther(remainingPrincipal)).toFixed(4)} MON</div>
                                        <div>Interest: {Number(ethers.formatEther(remainingInterest)).toFixed(4)} MON</div>
                                    </div>
                                )}
                            </div>
                        </>
                    );
                })()}

                <div className="stat-card">
                    <div className="stat-label">Pool Liquidity</div>
                    <div className="stat-value">
                        {state.totalLiquidity > 0n
                            ? Number(ethers.formatEther(state.totalLiquidity)).toFixed(2)
                            : '0'} MON
                    </div>
                </div>

                <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))' }}>
                    <div className="stat-label">🔒 Shielded Balance</div>
                    <div className="stat-value gradient">
                        {unlinkReady && balances?.[MON_TOKEN]
                            ? Number(ethers.formatEther(BigInt(balances[MON_TOKEN]))).toFixed(4)
                            : '0'} MON
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Private via Unlink Pool
                    </div>
                </div>
            </div>

            {/* Reputation Meter + Privacy Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: 32 }}>
                    <h3 className="card-title" style={{ marginBottom: 16 }}>🕒 Pending Payroll Settlements</h3>

                    {state.activeLoans.filter((l: any) => Number(l.status) === 0).length > 0 ? (
                        <div style={{ width: '100%', overflowX: 'auto', marginTop: 16 }}>
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Loan ID</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Auto-Deduction Amount</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Settlement Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {state.activeLoans
                                        .filter((l: any) => Number(l.status) === 0)
                                        .map((loan: any, idx: number) => {
                                            const amountDue = Number(ethers.formatEther(BigInt(loan.totalOwed) - BigInt(loan.totalRepaid))).toFixed(4);
                                            // For the demo purposes (hackathon), the exact payday is strictly simulated as "Today"
                                            const dueDate = new Date().toLocaleString('en-US', {
                                                month: 'short', day: 'numeric', year: 'numeric'
                                            }) + ' (Next Payday)';

                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>#{Number(loan.id)}</td>
                                                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>
                                                        {amountDue} MON
                                                    </td>
                                                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                                                        {dueDate}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: '24px 0', width: '100%', minHeight: '120px' }}>
                            <div className="emoji">✨</div>
                            <p style={{ margin: 0 }}>No upcoming settlements.<br />You are all caught up!</p>
                        </div>
                    )}
                </div>

                <div style={{ display: 'grid', gap: 24 }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 20 }}>💰 Privacy Wallet Balance</h3>
                        {unlinkReady ? (
                            <div style={{ padding: '16px', background: 'var(--bg-card-hover)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Shielded MON</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-green)' }}>
                                    {balances && balances[ethers.ZeroAddress] ? Number(ethers.formatEther(balances[ethers.ZeroAddress])).toFixed(4) : '0.0000'}
                                </div>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 16 }}>
                                <div className="emoji">🔒</div>
                                <p>Unlink SDK loading...</p>
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 20 }}>🔒 Privacy Status</h3>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <div className="privacy-shield" style={{ justifyContent: 'flex-start' }}>
                                ✅ Salary data — Not on-chain
                            </div>
                            <div className="privacy-shield" style={{ justifyContent: 'flex-start' }}>
                                ✅ Employer identity — Hashed only
                            </div>
                            <div className="privacy-shield" style={{ justifyContent: 'flex-start' }}>
                                ✅ Financial history — Private via Unlink
                            </div>
                            <div className="privacy-shield" style={{ justifyContent: 'flex-start' }}>
                                ✅ Payroll amounts — Hidden in router
                            </div>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.6 }}>
                            Your attestation proves you're eligible without revealing
                            how much you earn, who you work for, or your borrowing history.
                        </p>
                    </div>
                </div>
            </div>

            {/* Loans Table */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Loan History</h3>
                    <button className="btn btn-secondary" onClick={refreshData} style={{ padding: '8px 16px', fontSize: '0.8rem' }}>
                        🔄 Refresh
                    </button>
                </div>

                {state.activeLoans.length === 0 ? (
                    <div className="empty-state">
                        <div className="emoji">📝</div>
                        <p>No loans yet. Get started by borrowing against your payroll!</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" id="loans-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Date Issued</th>
                                    <th>Principal</th>
                                    <th>Interest</th>
                                    <th>Total Owed</th>
                                    <th>Repaid</th>
                                    <th>Scheme</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {state.activeLoans.map((loan: any, idx: number) => (
                                    <tr key={idx}>
                                        <td>#{Number(loan.id)}</td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {new Date(Number(loan.createdAt) * 1000).toLocaleString('en-US', {
                                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                            })}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                                            {Number(ethers.formatEther(loan.principal)).toFixed(4)}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                            {Number(ethers.formatEther(loan.interest)).toFixed(4)}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                            {Number(ethers.formatEther(loan.totalOwed)).toFixed(4)}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>
                                            {Number(ethers.formatEther(loan.totalRepaid)).toFixed(4)}
                                        </td>
                                        <td>{SCHEME_NAMES[Number(loan.scheme)]}</td>
                                        <td>
                                            <span className={`status-badge ${STATUS_CLASSES[Number(loan.status)]}`}>
                                                {STATUS_NAMES[Number(loan.status)]}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* How it works */}
            <div className="card" style={{ opacity: 0.8 }}>
                <h3 className="card-title" style={{ marginBottom: 16 }}>How Auto-Deduction Works</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                    {[
                        { step: '1', title: 'Payday', desc: 'Employer sends wages to PayrollRouter' },
                        { step: '2', title: 'Auto-Deduct', desc: 'Loan obligation deducted automatically' },
                        { step: '3', title: 'Forward', desc: 'Remaining wages sent privately to you' },
                        { step: '4', title: 'Reputation', desc: 'On-time = reputation boost' },
                    ].map(item => (
                        <div key={item.step} style={{ textAlign: 'center' }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'var(--gradient-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 8px', fontWeight: 700, fontSize: '0.9rem',
                            }}>
                                {item.step}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{item.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
