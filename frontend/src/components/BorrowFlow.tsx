import { useState } from 'react';
import { ethers } from 'ethers';
import { AppState } from '../App';
import {
    CONTRACTS,
    EWA_LENDING_ABI,
    REPAYMENT_SCHEMES,
} from '../config/contracts';
import TxToast from './TxToast';

interface Props {
    state: AppState;
    onBorrowed: () => void;
}

export default function BorrowFlow({ state, onBorrowed }: Props) {
    const [amount, setAmount] = useState(0.5);
    const [schemeId, setSchemeId] = useState(0);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState<string | null>(null);

    const maxLoan = state.maxLoanAmount > 0n
        ? Number(ethers.formatEther(state.maxLoanAmount))
        : 5;

    const liquidity = state.totalLiquidity > 0n
        ? Number(ethers.formatEther(state.totalLiquidity))
        : 0;

    const actualMax = Math.min(maxLoan, liquidity);

    // Interest previews
    const getInterestPreview = (principal: number, scheme: number): number => {
        if (scheme === 0) return principal * 0.02;            // 2% flat
        if (scheme === 1) return principal * 0.05 * (60 / 365); // 5% APR 60 days
        if (scheme === 2) return principal * 0.01;            // 1% flat
        if (scheme === 3) {                                   // Dynamic
            const repDiscount = state.reputation * 0.0005;
            const effectiveRate = Math.max(0.005, 0.08 - repDiscount);
            return principal * effectiveRate * (30 / 365);
        }
        return 0;
    };

    const interest = getInterestPreview(amount, schemeId);
    const totalOwed = amount + interest;
    const deductionPerPayday = schemeId === 1 ? totalOwed / 2 : totalOwed;

    const handleBorrow = async () => {
        if (!state.signer) return;
        setLoading(true);
        setStatus('Submitting private borrow request via Unlink...');

        try {
            const amountWei = ethers.parseEther(amount.toString());

            const lending = new ethers.Contract(
                CONTRACTS.ewaLending,
                EWA_LENDING_ABI,
                state.signer
            );

            // 1. Generate ZK properties (Commitment and Nullifier)
            const commitmentHash = ethers.id(`loan_salt_${Date.now()}_${state.address}`);
            const nullifierHash = ethers.id(`nullifier_salt_${Date.now()}_${state.address}`);

            // 2. Encrypt loan metadata for Auditor (using mock key for demo)
            const payload = JSON.stringify({
                borrower: state.address,
                principal: amountWei.toString(),
                term: 30
            });
            const encryptedData = ethers.hexlify(ethers.toUtf8Bytes(payload));

            // 3. Call the smart contract borrow function (Private Pool Deposit Mock)
            const tx = await lending.borrowConfidential(
                amountWei,
                ethers.parseEther(totalOwed.toFixed(18)),
                commitmentHash,
                encryptedData
            );

            // Wait for receipt, or just let network process it if RPC rate limits us
            try {
                await tx.wait(1);
            } catch (waitErr: any) {
                if (waitErr?.message?.includes('rate limit') || waitErr?.message?.includes('429')) {
                    console.warn("RPC rate limited on wait(), but tx is likely pending.");
                    await new Promise(resolve => setTimeout(resolve, 4000));
                } else {
                    throw waitErr;
                }
            }

            // 4. Save the actual loan data in local storage (Simulating the Unlink browser database)
            const newLoan = {
                id: Date.now(),
                borrower: state.address,
                principal: amountWei.toString(),
                interest: ethers.parseEther(interest.toFixed(18)).toString(),
                totalOwed: ethers.parseEther(totalOwed.toFixed(18)).toString(),
                totalRepaid: '0',
                scheme: schemeId,
                numInstallments: schemeId === 1 ? 2 : 1,
                installmentsPaid: 0,
                createdAt: Math.floor(Date.now() / 1000),
                dueDate: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
                status: 0,
                collateral: '0',
                commitmentHash,
                nullifierHash
            };

            const stored = localStorage.getItem(`ewa_confidential_loans_${state.address}`);
            const loans = stored ? JSON.parse(stored) : [];
            loans.push(newLoan);
            localStorage.setItem(`ewa_confidential_loans_${state.address}`, JSON.stringify(loans));

            setTxHash(tx.hash);
            setStatus('✅ Loan approved and sent to your wallet!');
            setTimeout(() => onBorrowed(), 3000);
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
                    <p>Connect your wallet first to borrow</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="animate-slide-up" style={{ display: 'grid', gap: 24 }}>
                {/* Amount selection */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Borrow Against Payroll</h2>
                            <p className="card-subtitle">Access your earned wages before payday</p>
                        </div>
                        <span className="privacy-shield">🔒 Private</span>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                            <label className="form-label" style={{ margin: 0 }}>Loan Amount (MON)</label>
                            <input
                                type="number"
                                min={0.01}
                                max={actualMax}
                                step={0.01}
                                value={amount}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 800,
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    textAlign: 'right',
                                    width: '120px',
                                    padding: 0,
                                    ...(amount > actualMax ? { color: 'var(--accent-red)' } : {
                                        color: 'var(--accent-blue)',
                                    })
                                }}
                            />
                        </div>
                        <input
                            type="range"
                            id="loan-amount-slider"
                            min={0.01}
                            max={actualMax > 0 ? actualMax : 0.01}
                            step={0.01}
                            value={amount}
                            onChange={e => setAmount(Number(e.target.value))}
                            style={{ width: '100%', marginBottom: 8 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span>0.01 MON</span>
                            <span>Max: {actualMax.toFixed(2)} MON</span>
                        </div>
                        {amount > actualMax && (
                            <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem', marginTop: 4 }}>
                                Exceeds your allowed limit of {actualMax.toFixed(2)} MON.
                            </div>
                        )}
                    </div>

                    {/* Scheme selection */}
                    <div className="form-group">
                        <label className="form-label">Repayment Scheme</label>
                        <div className="scheme-grid">
                            {REPAYMENT_SCHEMES.map(scheme => (
                                <div
                                    key={scheme.id}
                                    id={`scheme-${scheme.id}`}
                                    className={`scheme-option ${schemeId === scheme.id ? 'selected' : ''}`}
                                    onClick={() => setSchemeId(scheme.id)}
                                >
                                    <div className="scheme-name">{scheme.name}</div>
                                    <div className="scheme-desc">{scheme.description}</div>
                                    <div className="scheme-rate">{scheme.rate}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preview */}
                <div className="card card-gradient">
                    <h3 className="card-title" style={{ marginBottom: 16 }}>📋 Paycheck Deduction Preview</h3>
                    <div className="preview-box">
                        <div className="preview-row">
                            <span className="label">Principal</span>
                            <span className="value">{amount.toFixed(4)} MON</span>
                        </div>
                        <div className="preview-row">
                            <span className="label">Interest/Fee</span>
                            <span className="value">{interest.toFixed(4)} MON</span>
                        </div>
                        <div className="preview-row">
                            <span className="label" style={{ fontWeight: 600 }}>Total Owed</span>
                            <span className="value highlight">{totalOwed.toFixed(4)} MON</span>
                        </div>
                        <div className="preview-row">
                            <span className="label">Next paycheck deduction</span>
                            <span className="value highlight">{deductionPerPayday.toFixed(4)} MON</span>
                        </div>
                        {schemeId === 1 && (
                            <div className="preview-row">
                                <span className="label">Installments</span>
                                <span className="value">2 paydays</span>
                            </div>
                        )}
                        <div className="preview-row">
                            <span className="label">Your reputation</span>
                            <span className="value">{state.reputation}/100</span>
                        </div>
                    </div>

                    <div className="alert alert-info" style={{ marginBottom: 16 }}>
                        💡 Your next paycheck auto-deducts <strong>{deductionPerPayday.toFixed(4)} MON</strong> — no manual repayment needed.
                    </div>

                    {status && (
                        <div className={`alert ${status.includes('✅') ? 'alert-success' : status.includes('❌') ? 'alert-warning' : 'alert-info'}`}>
                            {status}
                        </div>
                    )}

                    <button
                        id="borrow-confirm-btn"
                        className="btn btn-primary btn-lg btn-full"
                        onClick={handleBorrow}
                        disabled={loading || amount <= 0 || amount > actualMax}
                    >
                        {loading ? 'Processing...' : `Borrow ${amount.toFixed(2)} MON`}
                    </button>
                </div>
            </div>

            <TxToast txHash={txHash} onDismiss={() => setTxHash(null)} />
        </>
    );
}
