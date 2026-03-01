import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { AppState } from '../App';
import {
    CONTRACTS,
    PAYROLL_ROUTER_ABI,
    EWA_LENDING_ABI,
    ATTESTATION_REGISTRY_ABI,
} from '../config/contracts';
import TxToast from './TxToast';

interface Props {
    state: AppState;
}

export default function AdminPanel({ state }: Props) {
    // ─── Company Setup ───────────────────────────────────────────────
    const [employeeAddr, setEmployeeAddr] = useState('');
    const [companyName, setCompanyName] = useState('Acme Corp');

    // ─── Attestation ─────────────────────────────────────────────────
    const [attestBorrower, setAttestBorrower] = useState('');

    // ─── Payroll ─────────────────────────────────────────────────────
    const [payrollEmployee, setPayrollEmployee] = useState('');
    const [payrollAmount, setPayrollAmount] = useState('1.0');
    const [outstandingObligation, setOutstandingObligation] = useState(0n);

    // ─── Status ──────────────────────────────────────────────────────
    const [loading, setLoading] = useState('');
    const [status, setStatus] = useState('');
    const [txHash, setTxHash] = useState<string | null>(null);

    // ─── Live query state ────────────────────────────────────────────
    const [isEmployeeRegistered, setIsEmployeeRegistered] = useState<boolean | null>(null);
    const [lastPayroll, setLastPayroll] = useState<string>('');
    const [poolLiquidity, setPoolLiquidity] = useState<string>('');

    // Query employee status and outstanding obligation whenever payrollEmployee changes
    const queryEmployeeStatus = useCallback(async () => {
        if (!state.provider || !payrollEmployee || !ethers.isAddress(payrollEmployee)) {
            setIsEmployeeRegistered(null);
            setLastPayroll('');
            setOutstandingObligation(0n);
            return;
        }
        try {
            const router = new ethers.Contract(CONTRACTS.payrollRouter, PAYROLL_ROUTER_ABI, state.provider);
            const registered = await router.isRegistered(payrollEmployee);
            setIsEmployeeRegistered(registered);
            if (registered) {
                const lastTs = await router.getLastPayrollReceived(payrollEmployee);
                setLastPayroll(Number(lastTs) > 0
                    ? new Date(Number(lastTs) * 1000).toLocaleString()
                    : 'Never');
            }
        } catch (e) {
            console.error('Query employee failed:', e);
        }

        // Calculate outstanding obligation from local loan data
        try {
            const storedLoans = localStorage.getItem(`ewa_confidential_loans_${payrollEmployee}`);
            if (storedLoans) {
                const loans = JSON.parse(storedLoans);
                let total = 0n;
                for (const l of loans) {
                    if (l.status === 0) {
                        total += BigInt(l.totalOwed || '0') - BigInt(l.totalRepaid || '0');
                    }
                }
                setOutstandingObligation(total);
            } else {
                setOutstandingObligation(0n);
            }
        } catch {
            setOutstandingObligation(0n);
        }
    }, [state.provider, payrollEmployee]);

    useEffect(() => { queryEmployeeStatus(); }, [queryEmployeeStatus]);

    // Query pool liquidity
    useEffect(() => {
        if (!state.provider) return;
        (async () => {
            try {
                const lending = new ethers.Contract(CONTRACTS.ewaLending, EWA_LENDING_ABI, state.provider);
                const liq = await lending.totalLiquidity();
                setPoolLiquidity(ethers.formatEther(liq));
            } catch { }
        })();
    }, [state.provider, status]); // re-query after each action

    // ─── Actions ─────────────────────────────────────────────────────

    const registerEmployee = async () => {
        if (!state.signer || !employeeAddr) return;
        setLoading('register');
        setStatus('');
        try {
            const router = new ethers.Contract(CONTRACTS.payrollRouter, PAYROLL_ROUTER_ABI, state.signer);
            const tx = await router.registerEmployee(employeeAddr, CONTRACTS.ewaLending);
            setStatus('⏳ Registering employee...');
            await tx.wait();
            setTxHash(tx.hash);
            setStatus(`✅ Employee ${employeeAddr.slice(0, 6)}...${employeeAddr.slice(-4)} registered!`);
        } catch (err: any) {
            console.error(err);
            setStatus('❌ ' + (err.reason || err.message || String(err)));
        } finally {
            setLoading('');
        }
    };

    const issueAttestation = async () => {
        if (!state.signer || !attestBorrower) return;
        setLoading('attest');
        setStatus('');
        try {
            const employerHash = ethers.keccak256(ethers.toUtf8Bytes(companyName));

            const attestationData = {
                employed: true,
                salaryAboveThreshold: true,
                paySchedule: 'biweekly',
                verifiedAt: Math.floor(Date.now() / 1000),
            };
            const attestationHash = ethers.keccak256(
                ethers.toUtf8Bytes(JSON.stringify(attestationData))
            );

            // 30 days from now
            const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

            // Sign attestation (connected wallet acts as trusted provider)
            const messageHash = ethers.keccak256(
                ethers.solidityPacked(
                    ['address', 'bytes32', 'bytes32', 'uint256'],
                    [attestBorrower, attestationHash, employerHash, expiry]
                )
            );
            const signature = await state.signer.signMessage(ethers.getBytes(messageHash));

            setStatus('⏳ Registering attestation on-chain...');

            // First ensure employer is registered
            const attestReg = new ethers.Contract(
                CONTRACTS.attestationRegistry,
                ATTESTATION_REGISTRY_ABI,
                state.signer
            );

            // Try registering employer hash (may already be registered)
            try {
                const regTx = await attestReg.registerEmployer(employerHash);
                await regTx.wait();
            } catch (e: any) {
                // Ignore if already registered or not owner
                console.log('Employer register skipped:', e.reason || e.message);
            }

            // Now the borrower needs to register the attestation themselves.
            // Since the admin IS the signer/provider, we call from admin's address.
            // In reality the borrower would call this. For the admin mock, 
            // we provide the signed attestation data for manual use.
            // However, if the admin IS also the borrower (self-attesting for demo):
            if (attestBorrower.toLowerCase() === state.address.toLowerCase()) {
                const tx = await attestReg.registerAttestation(
                    attestationHash,
                    employerHash,
                    expiry,
                    signature
                );
                await tx.wait();
                setTxHash(tx.hash);
                setStatus('✅ Attestation registered on-chain! Borrower is now eligible to borrow.');
            } else {
                // Store attestation data so borrower can use it
                const attestData = {
                    attestationHash,
                    employerHash,
                    expiry,
                    signature,
                    provider: state.address,
                    borrower: attestBorrower,
                };
                localStorage.setItem(
                    `ewa_pending_attestation_${attestBorrower}`,
                    JSON.stringify(attestData)
                );
                setStatus(
                    `✅ Attestation signed! Data saved for borrower ${attestBorrower.slice(0, 6)}...${attestBorrower.slice(-4)} to claim on-chain.`
                );
            }
        } catch (err: any) {
            console.error(err);
            setStatus('❌ ' + (err.reason || err.message || String(err)));
        } finally {
            setLoading('');
        }
    };

    const processPayroll = async () => {
        if (!state.signer || !payrollEmployee || !payrollAmount) return;
        setLoading('payroll');
        setStatus('');
        try {
            const router = new ethers.Contract(CONTRACTS.payrollRouter, PAYROLL_ROUTER_ABI, state.signer);
            const amountWei = ethers.parseEther(payrollAmount);

            // Auto-compute deduction: min(outstanding obligation, payroll amount)
            const deductWei = outstandingObligation > 0n
                ? (outstandingObligation > amountWei ? amountWei : outstandingObligation)
                : 0n;

            let nullifier = ethers.ZeroHash;
            let proof = '0x';

            if (deductWei > 0n) {
                // Each repayment needs a unique nullifier — the contract rejects reused ones.
                // Generate a fresh nullifier for every payroll deduction.
                nullifier = ethers.id(`payroll_nullifier_${Date.now()}_${Math.random()}_${payrollEmployee}`);
                proof = ethers.hexlify(ethers.randomBytes(64)); // Mock ZK proof
            }

            setStatus('⏳ Processing payroll deposit...');
            const tx = await router.depositPayroll(
                payrollEmployee,
                deductWei,
                nullifier,
                proof,
                { value: amountWei }
            );
            const receipt = await tx.wait();

            // Parse PayrollProcessed event
            let eventInfo = '';
            if (receipt) {
                for (const log of receipt.logs) {
                    try {
                        const parsed = router.interface.parseLog({
                            topics: log.topics as string[],
                            data: log.data,
                        });
                        if (parsed?.name === 'PayrollProcessed') {
                            eventInfo = ` | Deducted: ${ethers.formatEther(parsed.args.deducted)} MON → Lending Pool | Forwarded: ${ethers.formatEther(parsed.args.forwarded)} MON → Employee`;
                        }
                    } catch { }
                }
            }

            // Update local loan state if deduction was made
            if (deductWei > 0n) {
                const storedLoans = localStorage.getItem(`ewa_confidential_loans_${payrollEmployee}`);
                if (storedLoans) {
                    const loans = JSON.parse(storedLoans);
                    const activeLoan = loans.find((l: any) => l.status === 0);
                    if (activeLoan) {
                        const newRepaid = BigInt(activeLoan.totalRepaid || '0') + deductWei;
                        activeLoan.totalRepaid = newRepaid.toString();
                        if (newRepaid >= BigInt(activeLoan.totalOwed)) {
                            activeLoan.status = 1; // Fully repaid
                        }
                        localStorage.setItem(
                            `ewa_confidential_loans_${payrollEmployee}`,
                            JSON.stringify(loans)
                        );
                    }
                }
            }

            setTxHash(tx.hash);
            setStatus(`✅ Payroll processed! ${payrollAmount} MON deposited${eventInfo}`);
            await queryEmployeeStatus();
        } catch (err: any) {
            console.error(err);
            setStatus('❌ ' + (err.reason || err.message || String(err)));
        } finally {
            setLoading('');
        }
    };

    // ─── Render ──────────────────────────────────────────────────────

    if (!state.connected) {
        return (
            <div className="card animate-slide-up">
                <div className="empty-state">
                    <div className="emoji">🏢</div>
                    <p>Connect your wallet to access the Admin Panel</p>
                </div>
            </div>
        );
    }

    const payrollNum = Number(payrollAmount) || 0;
    const payrollWei = payrollNum > 0 ? ethers.parseEther(payrollNum.toString()) : 0n;
    const autoDeductWei = outstandingObligation > 0n
        ? (outstandingObligation > payrollWei ? payrollWei : outstandingObligation)
        : 0n;
    const autoDeductNum = Number(ethers.formatEther(autoDeductWei));
    const forwardedPreview = Math.max(0, payrollNum - autoDeductNum);

    return (
        <>
            <div className="animate-slide-up" style={{ display: 'grid', gap: 24 }}>
                {/* Admin Header */}
                <div className="card card-gradient">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">🏢 Admin Panel — Company Mock</h2>
                            <p className="card-subtitle">
                                Simulate employer actions: register employees, issue attestations, and process payroll
                            </p>
                        </div>
                        <span className="admin-badge">Admin Mode</span>
                    </div>

                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-label">Connected As</div>
                            <div className="stat-value" style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
                                {state.address.slice(0, 8)}...{state.address.slice(-6)}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Lending Pool</div>
                            <div className="stat-value gradient">
                                {poolLiquidity ? `${poolLiquidity} MON` : '...'}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Company</div>
                            <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                                {companyName}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 1: Company Setup */}
                <div className="card admin-section">
                    <div className="admin-section-header">
                        <span className="admin-section-icon">📋</span>
                        <div>
                            <h3 className="card-title">1. Company Setup</h3>
                            <p className="card-subtitle">Register your company name and add employees</p>
                        </div>
                    </div>

                    <div className="admin-divider" />

                    <div className="form-group">
                        <label className="form-label">Company Name</label>
                        <input
                            id="admin-company-name"
                            className="form-input"
                            type="text"
                            placeholder="e.g. Acme Corp"
                            value={companyName}
                            onChange={e => setCompanyName(e.target.value)}
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Employer hash: <code style={{ color: 'var(--accent-purple-light)' }}>
                                {companyName ? ethers.keccak256(ethers.toUtf8Bytes(companyName)).slice(0, 18) + '...' : '—'}
                            </code>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Employee Wallet Address</label>
                        <div className="admin-action-row">
                            <input
                                id="admin-employee-address"
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={employeeAddr}
                                onChange={e => setEmployeeAddr(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button
                                id="admin-register-employee-btn"
                                className="btn btn-primary"
                                onClick={registerEmployee}
                                disabled={loading === 'register' || !employeeAddr || !ethers.isAddress(employeeAddr)}
                            >
                                {loading === 'register' ? 'Registering...' : 'Register Employee'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Section 2: Issue Attestation */}
                <div className="card admin-section">
                    <div className="admin-section-header">
                        <span className="admin-section-icon">🔐</span>
                        <div>
                            <h3 className="card-title">2. Issue Attestation</h3>
                            <p className="card-subtitle">Sign an employment attestation so the borrower can access EWA loans</p>
                        </div>
                    </div>

                    <div className="admin-divider" />

                    <div className="form-group">
                        <label className="form-label">Borrower Address</label>
                        <div className="admin-action-row">
                            <input
                                id="admin-attest-borrower"
                                className="form-input"
                                type="text"
                                placeholder="0x..."
                                value={attestBorrower}
                                onChange={e => setAttestBorrower(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button
                                id="admin-issue-attestation-btn"
                                className="btn btn-primary"
                                onClick={issueAttestation}
                                disabled={loading === 'attest' || !attestBorrower || !ethers.isAddress(attestBorrower)}
                            >
                                {loading === 'attest' ? 'Signing...' : 'Issue Attestation'}
                            </button>
                        </div>
                    </div>

                    <div className="preview-box">
                        <div className="preview-row">
                            <span className="label">Employer</span>
                            <span className="value">{companyName}</span>
                        </div>
                        <div className="preview-row">
                            <span className="label">Claims</span>
                            <span className="value" style={{ fontSize: '0.8rem' }}>employed=true, salary≥threshold</span>
                        </div>
                        <div className="preview-row">
                            <span className="label">Validity</span>
                            <span className="value highlight">30 days</span>
                        </div>
                        <div className="preview-row">
                            <span className="label">Provider (signer)</span>
                            <span className="value" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                                {state.address.slice(0, 10)}...{state.address.slice(-6)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Section 3: Process Payroll */}
                <div className="card admin-section">
                    <div className="admin-section-header">
                        <span className="admin-section-icon">💰</span>
                        <div>
                            <h3 className="card-title">3. Process Payroll</h3>
                            <p className="card-subtitle">Deposit payroll for an employee with automatic loan deduction</p>
                        </div>
                    </div>

                    <div className="admin-divider" />

                    <div className="form-group">
                        <label className="form-label">Employee Address</label>
                        <input
                            id="admin-payroll-employee"
                            className="form-input"
                            type="text"
                            placeholder="0x..."
                            value={payrollEmployee}
                            onChange={e => setPayrollEmployee(e.target.value)}
                        />
                        {isEmployeeRegistered !== null && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                                <span className={`status-badge ${isEmployeeRegistered ? 'status-active' : 'status-defaulted'}`}>
                                    {isEmployeeRegistered ? '✓ Registered' : '✗ Not Registered'}
                                </span>
                                {lastPayroll && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Last payroll: {lastPayroll}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label">Payroll Amount (MON)</label>
                        <input
                            id="admin-payroll-amount"
                            className="form-input"
                            type="number"
                            min="0.001"
                            step="0.01"
                            placeholder="1.0"
                            value={payrollAmount}
                            onChange={e => setPayrollAmount(e.target.value)}
                        />
                    </div>

                    {/* Outstanding obligation info */}
                    {outstandingObligation > 0n && (
                        <div className="alert alert-info" style={{ marginBottom: 16 }}>
                            ⚡ This employee has an outstanding loan of <strong>{ethers.formatEther(outstandingObligation)} MON</strong>.
                            The contract will automatically deduct the owed amount from this payroll before forwarding the rest.
                        </div>
                    )}

                    {/* Payroll Split Preview — auto-computed, read-only */}
                    <div className="preview-box">
                        <div className="preview-row">
                            <span className="label">Total Payroll</span>
                            <span className="value">{payrollNum.toFixed(4)} MON</span>
                        </div>
                        {autoDeductWei > 0n && (
                            <div className="preview-row">
                                <span className="label">↳ Auto-deducted → Lending Pool</span>
                                <span className="value" style={{ color: 'var(--accent-amber)' }}>
                                    −{autoDeductNum.toFixed(4)} MON
                                </span>
                            </div>
                        )}
                        <div className="preview-row">
                            <span className="label" style={{ fontWeight: 600 }}>↳ Forwarded → Employee</span>
                            <span className="value highlight">{forwardedPreview.toFixed(4)} MON</span>
                        </div>
                    </div>

                    <button
                        id="admin-process-payroll-btn"
                        className="btn btn-success btn-lg btn-full"
                        onClick={processPayroll}
                        disabled={
                            loading === 'payroll' ||
                            !payrollEmployee ||
                            !ethers.isAddress(payrollEmployee) ||
                            payrollNum <= 0
                        }
                    >
                        {loading === 'payroll' ? 'Processing...' : `💰 Deposit ${payrollNum.toFixed(2)} MON Payroll`}
                    </button>
                </div>

                {/* Status */}
                {status && (
                    <div className={`alert ${status.includes('✅') ? 'alert-success' : status.includes('❌') ? 'alert-warning' : 'alert-info'}`}>
                        {status}
                    </div>
                )}

                {/* Info card */}
                <div className="card" style={{ padding: 20 }}>
                    <div className="privacy-shield" style={{ display: 'flex', width: 'fit-content', marginBottom: 8 }}>
                        🏭 How PayrollRouter works
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.7 }}>
                        When you deposit payroll, the <code>PayrollRouter</code> contract automatically deducts the
                        employee's outstanding loan obligation and sends it to <code>EWALending.repayConfidential()</code>.
                        The remainder is forwarded directly to the employee's wallet. The company has no control over
                        the deduction — the contract enforces it. This is the "Klarna for wages" mechanic.
                    </p>
                </div>
            </div>

            <TxToast txHash={txHash} onDismiss={() => setTxHash(null)} />
        </>
    );
}
