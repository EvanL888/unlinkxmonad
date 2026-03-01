import { useState } from 'react';
import { ethers } from 'ethers';
import { AppState } from '../App';
import { useUnlink } from '@unlink-xyz/react';
import {
    CONTRACTS,
    ATTESTATION_REGISTRY_ABI,
    MONAD_CHAIN_ID,
} from '../config/contracts';
import TxToast from './TxToast';

interface Props {
    state: AppState;
    connectWallet: () => Promise<void>;
    onComplete: () => void;
}

export default function OnboardingFlow({ state, connectWallet, onComplete }: Props) {
    const { createWallet, walletExists } = useUnlink();
    const [step, setStep] = useState(state.connected ? (walletExists ? 3 : 2) : 1);
    const [loading, setLoading] = useState(false);
    const [attestationStatus, setAttestationStatus] = useState('');
    const [txHash, setTxHash] = useState<string | null>(null);

    const handleCreateUnlinkWallet = async () => {
        try {
            setLoading(true);
            await createWallet();
            setStep(3);
        } catch (err) {
            console.error('Failed to create unlink wallet', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSwitchToMonad = async () => {
        try {
            await (window as any).ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x' + MONAD_CHAIN_ID.toString(16) }],
            });
        } catch (switchError: any) {
            if (switchError.code === 4902) {
                await (window as any).ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x' + MONAD_CHAIN_ID.toString(16),
                        chainName: 'Monad Testnet',
                        nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
                        rpcUrls: ['https://testnet-rpc.monad.xyz'],
                        blockExplorerUrls: ['https://testnet.monadexplorer.com'],
                    }],
                });
            }
        }
    };

    const handleConnect = async () => {
        await connectWallet();
        setStep(walletExists ? 3 : 2);
    };

    const handleSubmitAttestation = async () => {
        if (!state.signer) return;
        setLoading(true);
        setAttestationStatus('Checking attestation status...');

        try {
            const address = await state.signer.getAddress();
            const registry = new ethers.Contract(
                CONTRACTS.attestationRegistry,
                ATTESTATION_REGISTRY_ABI,
                state.signer
            );

            // Check if attestation is already registered on-chain (e.g. via issue-attestation script)
            const alreadyValid = await registry.isValid(address);
            if (alreadyValid) {
                setAttestationStatus('✅ Attestation already registered on-chain!');
                setTimeout(() => onComplete(), 1200);
                return;
            }

            // Check if there is a pending attestation from the Admin Panel
            const stored = localStorage.getItem(`ewa_pending_attestation_${address}`);
            let signature = '0x' + '00'.repeat(65);
            let attestationHash = ethers.ZeroHash;
            let employerHash = ethers.ZeroHash;
            let expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

            if (stored) {
                const data = JSON.parse(stored);
                attestationHash = data.attestationHash;
                employerHash = data.employerHash;
                expiry = data.expiry;
                signature = data.signature;
            } else {
                // Mock fallback that usually fails unless valid data is present
                const fallbackData = {
                    employed: true,
                    salaryAboveThreshold: true,
                    paySchedule: 'biweekly',
                    verifiedAt: Math.floor(Date.now() / 1000),
                };
                attestationHash = ethers.keccak256(
                    ethers.toUtf8Bytes(JSON.stringify(fallbackData))
                );
                employerHash = ethers.keccak256(ethers.toUtf8Bytes('Acme Corp'));
            }

            setAttestationStatus('Submitting to blockchain...');

            // Submit the attestation to the registry using the employer's signature
            const tx = await registry.registerAttestation(
                attestationHash,
                employerHash,
                expiry,
                signature
            );
            await tx.wait();

            // Clear the pending attestation from local storage
            localStorage.removeItem(`ewa_pending_attestation_${address}`);

            setTxHash(tx.hash);
            setAttestationStatus('✅ Attestation registered on-chain!');
            setTimeout(() => onComplete(), 1500);
        } catch (err: any) {
            const address = await state.signer.getAddress().catch(() => '<your_wallet>');
            if (
                err.message?.includes('Invalid attestation') ||
                err.message?.includes('invalid signature') ||
                err.message?.includes('Invalid signature lengths') ||
                err.reason?.includes('Invalid attestation') ||
                err.reason?.includes('Invalid signature')
            ) {
                setAttestationStatus(
                    `⚠️ Attestation not yet issued for your wallet.\n\n` +
                    `Please ask your employer to issue one from the /admin panel.\n\n` +
                    `(If testing, use another metamask account to go to /admin and issue an attestation for this address: ${address})`
                );
            } else {
                setAttestationStatus('❌ Error: ' + (err.reason || err.message));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="animate-slide-up">
                {/* Steps indicator */}
                <div className="steps">
                    <div className={`step ${step >= 1 ? (step > 1 ? 'completed' : 'active') : ''}`}>
                        <div className="step-number">{step > 1 ? '✓' : '1'}</div>
                        <span className="step-label">Connect Wallet</span>
                    </div>
                    <div className={`step ${step >= 2 ? (step > 2 ? 'completed' : 'active') : ''}`}>
                        <div className="step-number">{step > 2 ? '✓' : '2'}</div>
                        <span className="step-label">Privacy Setup</span>
                    </div>
                    <div className={`step ${step >= 3 ? (step > 3 ? 'completed' : 'active') : ''}`}>
                        <div className="step-number">{step > 3 ? '✓' : '3'}</div>
                        <span className="step-label">Switch to Monad</span>
                    </div>
                    <div className={`step ${step >= 4 ? 'active' : ''}`}>
                        <div className="step-number">4</div>
                        <span className="step-label">Submit Attestation</span>
                    </div>
                </div>

                {/* Step 1: Connect Wallet */}
                {step === 1 && (
                    <div className="card animate-fade-in">
                        <div className="card-header">
                            <div>
                                <h2 className="card-title">Connect Your Wallet</h2>
                                <p className="card-subtitle">Link your MetaMask wallet to get started</p>
                            </div>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.9rem', lineHeight: 1.7 }}>
                            EWA Protocol lets you access earned wages before payday. Your salary data stays
                            completely private — only cryptographic proofs live on-chain.
                        </p>
                        <div className="alert alert-info" style={{ marginBottom: 24 }}>
                            🔒 Your employer name, salary amount, and financial history are <strong>never</strong> stored on the blockchain.
                        </div>
                        <button
                            id="onboard-connect-btn"
                            className="btn btn-primary btn-lg btn-full"
                            onClick={handleConnect}
                        >
                            🦊 Connect MetaMask
                        </button>
                    </div>
                )}

                {/* Step 2: Privacy Setup (Unlink) */}
                {step === 2 && (
                    <div className="card animate-fade-in">
                        <div className="card-header">
                            <div>
                                <h2 className="card-title">Enable Privacy (Unlink)</h2>
                                <p className="card-subtitle">Create a private Unlink wallet so zero-knowledge proofs can hide your loan balances.</p>
                            </div>
                        </div>

                        {walletExists ? (
                            <>
                                <div className="alert alert-success" style={{ marginBottom: 24 }}>
                                    ✅ Private wallet found and loaded!
                                </div>
                                <button
                                    className="btn btn-primary btn-lg btn-full"
                                    onClick={() => setStep(3)}
                                >
                                    Continue →
                                </button>
                            </>
                        ) : (
                            <>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.9rem', lineHeight: 1.7 }}>
                                    Click below to generate a new shielded wallet that is tied only to this device.
                                </p>
                                <button
                                    id="create-unlink-wallet-btn"
                                    className="btn btn-primary btn-lg btn-full"
                                    onClick={handleCreateUnlinkWallet}
                                    disabled={loading}
                                >
                                    {loading ? 'Securing...' : '🛡️ Create Private Wallet'}
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Step 3: Switch to Monad */}
                {step === 3 && (
                    <div className="card animate-fade-in">
                        <div className="card-header">
                            <div>
                                <h2 className="card-title">Switch to Monad Testnet</h2>
                                <p className="card-subtitle">EWA Protocol runs on Monad L1 for fast, low-cost transactions</p>
                            </div>
                        </div>
                        {state.chainId === MONAD_CHAIN_ID ? (
                            <>
                                <div className="alert alert-success">
                                    ✅ Connected to Monad Testnet (Chain {MONAD_CHAIN_ID})
                                </div>
                                <button
                                    className="btn btn-primary btn-lg btn-full"
                                    onClick={() => setStep(4)}
                                >
                                    Continue →
                                </button>
                            </>
                        ) : (
                            <>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.9rem' }}>
                                    {state.chainId ? `Currently on chain ${state.chainId}. ` : ''}
                                    Click below to add and switch to Monad Testnet.
                                </p>
                                <button
                                    id="switch-chain-btn"
                                    className="btn btn-primary btn-lg btn-full"
                                    onClick={async () => { await handleSwitchToMonad(); setStep(4); }}
                                >
                                    Switch to Monad Testnet
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Step 4: Submit Attestation */}
                {step === 4 && (
                    <div className="card animate-fade-in">
                        <div className="card-header">
                            <div>
                                <h2 className="card-title">Verify Employment</h2>
                                <p className="card-subtitle">Submit your payroll attestation to prove eligibility</p>
                            </div>
                            <span className="privacy-shield">🔒 Privacy-Preserving</span>
                        </div>

                        <div className="preview-box">
                            <div className="preview-row">
                                <span className="label">What's verified</span>
                                <span className="value">Employment + Salary Threshold</span>
                            </div>
                            <div className="preview-row">
                                <span className="label">What's on-chain</span>
                                <span className="value highlight">Only an attestation hash</span>
                            </div>
                            <div className="preview-row">
                                <span className="label">Employer name</span>
                                <span className="value" style={{ color: 'var(--accent-green)' }}>🔒 Hidden</span>
                            </div>
                            <div className="preview-row">
                                <span className="label">Exact salary</span>
                                <span className="value" style={{ color: 'var(--accent-green)' }}>🔒 Hidden</span>
                            </div>
                        </div>

                        <div className="alert alert-info">
                            ℹ️ In production, this connects to <strong>Plaid / Argyle</strong> to verify your payroll.
                            For the hackathon, please use the <strong>/admin</strong> panel to map your employer's signature to this wallet.
                        </div>

                        {attestationStatus && (
                            <div className={`alert ${attestationStatus.includes('✅') ? 'alert-success' : attestationStatus.includes('❌') || attestationStatus.includes('⚠️') ? 'alert-warning' : 'alert-info'}`}>
                                {attestationStatus.split('\n\n').map((block, i) =>
                                    block.startsWith('BORROWER_ADDRESS') || block.startsWith('npx') ? (
                                        <pre key={i} style={{ marginTop: 8, fontSize: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                            {block}
                                        </pre>
                                    ) : (
                                        <span key={i} style={{ display: 'block', marginBottom: 4 }}>{block}</span>
                                    )
                                )}
                            </div>
                        )}

                        <button
                            id="submit-attestation-btn"
                            className="btn btn-primary btn-lg btn-full"
                            onClick={handleSubmitAttestation}
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : '🔐 Submit Attestation Proof'}
                        </button>

                        <button
                            className="btn btn-secondary btn-full"
                            style={{ marginTop: 12 }}
                            onClick={onComplete}
                        >
                            Skip (Demo Mode) →
                        </button>
                    </div>
                )}
            </div>

            <TxToast txHash={txHash} onDismiss={() => setTxHash(null)} />
        </>
    );
}
