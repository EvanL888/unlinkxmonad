import { ethers } from 'ethers';
import { AppState } from '../App';
import { useUnlinkBalances } from '@unlink-xyz/react';

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
                <div className="stat-card">
                    <div className="stat-label">Outstanding Obligation</div>
                    <div className="stat-value gradient">
                        {state.totalObligation > 0n
                            ? ethers.formatEther(state.totalObligation)
                            : '0'} MON
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Pool Liquidity</div>
                    <div className="stat-value">
                        {state.totalLiquidity > 0n
                            ? Number(ethers.formatEther(state.totalLiquidity)).toFixed(2)
                            : '0'} MON
                    </div>
                </div>
            </div>

            {/* Reputation Meter + Privacy Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                    <div className="rep-meter">
                        <svg width="140" height="140" viewBox="0 0 140 140">
                            <defs>
                                <linearGradient id="repGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#8b5cf6" />
                                    <stop offset="50%" stopColor="#3b82f6" />
                                    <stop offset="100%" stopColor="#06b6d4" />
                                </linearGradient>
                            </defs>
                            <circle cx="70" cy="70" r="58" className="rep-meter-bg" />
                            <circle
                                cx="70" cy="70" r="58"
                                className="rep-meter-fill"
                                strokeDasharray={circumference}
                                strokeDashoffset={repOffset}
                            />
                        </svg>
                        <div className="rep-value">
                            <div className="score">{state.reputation}</div>
                            <div className="label">Reputation</div>
                        </div>
                    </div>
                    <div style={{ marginTop: 20, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: repLevel.color, fontWeight: 600 }}>{repLevel.label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Higher reputation → lower borrowing rates
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gap: 24 }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 20 }}>💰 Privacy Wallet Balance</h3>
                        {unlinkReady ? (
                            <div style={{ padding: '16px', background: 'var(--bg-card-hover)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Shielded MON</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-green)' }}>
                                    {balances && balances['0x0'] ? Number(ethers.formatEther(balances['0x0'])).toFixed(4) : '0.0000'}
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
