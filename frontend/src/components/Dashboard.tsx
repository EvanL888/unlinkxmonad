import { useState, useEffect } from 'react';
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
                    <p>Connect your wallet to see your dashboard</p>
                </div>
            </div>
        );
    }

    // Fetch native MON balance
    const [monBalance, setMonBalance] = useState<string>('...');
    useEffect(() => {
        if (!state.provider || !state.address) return;
        (async () => {
            try {
                const bal = await state.provider!.getBalance(state.address);
                setMonBalance(Number(ethers.formatEther(bal)).toFixed(4));
            } catch { setMonBalance('—'); }
        })();
    }, [state.provider, state.address, state.activeLoans, state.allLoans]);

    return (
        <div className="animate-slide-up" style={{ display: 'grid', gap: 24 }}>
            {/* Stats row */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">MON Balance</div>
                    <div className="stat-value gradient">{monBalance}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Monad Testnet
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
            </div>

            {/* Reputation Meter + Privacy Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: 32 }}>
                    <h3 className="card-title" style={{ marginBottom: 16 }}>Pending Payroll Settlements</h3>

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
                            <p style={{ margin: 0 }}>No upcoming settlements.<br />You are all caught up!</p>
                        </div>
                    )}
                </div>

                {/* Outstanding Loans — right column */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', padding: 32 }}>
                    <h3 className="card-title" style={{ marginBottom: 16 }}>Outstanding Loans</h3>

                    {state.activeLoans.filter((l: any) => Number(l.status) === 0).length > 0 ? (
                        <div style={{ width: '100%', overflowX: 'auto', marginTop: 16 }}>
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>ID</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Principal</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Remaining</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Scheme</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {state.activeLoans
                                        .filter((l: any) => Number(l.status) === 0)
                                        .map((loan: any, idx: number) => {
                                            const remaining = Number(ethers.formatEther(BigInt(loan.totalOwed) - BigInt(loan.totalRepaid))).toFixed(4);
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>#{Number(loan.id)}</td>
                                                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)' }}>
                                                        {Number(ethers.formatEther(loan.principal)).toFixed(4)} MON
                                                    </td>
                                                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)' }}>
                                                        {remaining} MON
                                                    </td>
                                                    <td style={{ padding: '12px 16px', fontSize: '0.8rem' }}>
                                                        {SCHEME_NAMES[Number(loan.scheme)]}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: '24px 0', width: '100%', minHeight: '120px' }}>
                            <p style={{ margin: 0 }}>No outstanding loans.<br />You're debt-free!</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Transaction History — full width */}
            <div className="card">
                <h3 className="card-title" style={{ marginBottom: 16 }}>Transaction History</h3>

                {(() => {
                    // Build a unified timeline from all loans
                    const allLoans = state.allLoans || [];
                    const events: { date: number; type: string; amount: string; rawAmount: number; detail: string; status: string; statusClass: string; hash?: string; balanceAfter?: string }[] = [];

                    for (const loan of allLoans) {
                        // Borrow event
                        const principalNum = Number(ethers.formatEther(loan.principal));
                        events.push({
                            date: Number(loan.createdAt) * 1000,
                            type: 'Loan Issued',
                            amount: `+${principalNum.toFixed(4)} MON`,
                            rawAmount: principalNum,
                            detail: `${SCHEME_NAMES[Number(loan.scheme)]} · Total owed: ${Number(ethers.formatEther(loan.totalOwed)).toFixed(4)} MON`,
                            status: STATUS_NAMES[Number(loan.status)],
                            statusClass: STATUS_CLASSES[Number(loan.status)],
                            hash: loan.txHash
                        });

                        // Add repayment events from the loan object
                        if (loan.repayments) {
                            for (const rep of loan.repayments) {
                                events.push({
                                    date: rep.date * 1000,
                                    type: 'Manual Repayment',
                                    amount: `-${Number(rep.amount).toFixed(4)} MON`,
                                    rawAmount: -Number(rep.amount),
                                    detail: `Early repayment for Loan #${Number(loan.id)}`,
                                    status: 'Completed',
                                    statusClass: 'status-repaid',
                                    hash: rep.txHash
                                });
                            }
                        }
                    }

                    // Add Payroll Events from the blockchain
                    for (const pe of state.payrollEvents || []) {
                        const forwarded = Number(ethers.formatEther(pe.forwarded));
                        const deducted = Number(ethers.formatEther(pe.deducted));
                        const total = Number(ethers.formatEther(pe.totalDeposit));

                        events.push({
                            date: pe.date,
                            type: deducted > 0 ? 'Payroll Auto-Deduction' : 'Payroll Deposit',
                            amount: `+${forwarded.toFixed(4)} MON`,
                            rawAmount: forwarded,
                            detail: deducted > 0
                                ? `Employer deposited ${total.toFixed(4)} MON · ${deducted.toFixed(4)} MON auto-deducted for loans`
                                : `Employer deposited ${total.toFixed(4)} MON`,
                            status: 'Completed',
                            statusClass: 'status-repaid',
                            hash: pe.hash
                        });
                    }

                    // Sort newest first
                    events.sort((a, b) => b.date - a.date);

                    // Calculate backward running balance
                    let runningBalance = parseFloat(monBalance);
                    for (const evt of events) {
                        if (isNaN(runningBalance)) {
                            evt.balanceAfter = '—';
                        } else {
                            evt.balanceAfter = `${runningBalance.toFixed(4)} MON`;
                            runningBalance -= evt.rawAmount; // subtract backwards
                        }
                    }

                    if (events.length === 0) {
                        return (
                            <div className="empty-state" style={{ padding: '32px 0' }}>
                                <p>No transactions yet. Borrow against your payroll to get started!</p>
                            </div>
                        );
                    }

                    return (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" id="tx-history-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Amount</th>
                                        <th>Balance After</th>
                                        <th>Details</th>
                                        <th>Explorer</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((evt, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                {new Date(evt.date).toLocaleString('en-US', {
                                                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                                })}
                                            </td>
                                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{evt.type}</td>
                                            <td style={{
                                                fontFamily: 'var(--font-mono)',
                                                fontWeight: 600,
                                                color: evt.amount.startsWith('+') ? 'var(--accent-green)' : 'var(--accent-amber)',
                                            }}>
                                                {evt.amount}
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                                {evt.balanceAfter}
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{evt.detail}</td>
                                            <td>
                                                {evt.hash ? (
                                                    <a
                                                        href={`https://testnet.monadexplorer.com/tx/${evt.hash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="explorer-link"
                                                    >
                                                        View ↗
                                                    </a>
                                                ) : '—'}
                                            </td>
                                            <td>
                                                <span className={`status-badge ${evt.statusClass}`}>{evt.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })()}
            </div>

            {/* Loan History — all loans (active + repaid) */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Loan History</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                if (window.confirm("This will clear your local mock loan history (useful if the smart contract was redeployed). Continue?")) {
                                    localStorage.removeItem(`ewa_confidential_loans_${state.address}`);
                                    localStorage.removeItem(`ewa_payroll_events_${state.address}`);
                                    localStorage.removeItem(`ewa_payroll_deductions_${state.address}`);
                                    localStorage.removeItem(`ewa_payroll_sync_${state.address}`);
                                    localStorage.removeItem(`ewa_payroll_last_block_${state.address}`);
                                    window.location.reload();
                                }
                            }}
                            style={{ padding: '8px 16px', fontSize: '0.8rem', color: 'var(--accent-red)' }}
                            title="Clear mock data if smart contract was reset"
                        >
                            Reset Sync
                        </button>
                        <button className="btn btn-secondary" onClick={refreshData} style={{ padding: '8px 16px', fontSize: '0.8rem' }}>
                            Refresh
                        </button>
                    </div>
                </div>

                {(state.allLoans || []).length === 0 ? (
                    <div className="empty-state">
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
                                    <th>Explorer</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(state.allLoans || [])
                                    .slice()
                                    .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))
                                    .map((loan: any, idx: number) => (
                                        <tr key={idx} style={Number(loan.status) === 1 ? { opacity: 0.65 } : {}}>
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
                                                {loan.txHash ? (
                                                    <a
                                                        href={`https://testnet.monadexplorer.com/tx/${loan.txHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="explorer-link"
                                                    >
                                                        View ↗
                                                    </a>
                                                ) : '—'}
                                            </td>
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
