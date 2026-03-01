import { useEffect, useState } from 'react';

interface Props {
    txHash: string | null;
    onDismiss: () => void;
}

const EXPLORER = 'https://testnet.monadexplorer.com/tx';

export default function TxToast({ txHash, onDismiss }: Props) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!txHash) { setVisible(false); return; }
        setVisible(true);
        const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 8000);
        return () => clearTimeout(t);
    }, [txHash]);

    if (!txHash) return null;

    const short = `${txHash.slice(0, 10)}…${txHash.slice(-8)}`;

    return (
        <div style={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            zIndex: 9999,
            minWidth: 320,
            maxWidth: 420,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '1px solid rgba(139,92,246,0.4)',
            borderRadius: 16,
            padding: '16px 20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}>
            {/* Icon */}
            <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1rem',
            }}>
                ✅
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0', marginBottom: 4 }}>
                    Transaction confirmed
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: 10 }}>
                    {short}
                </div>
                <a
                    href={`${EXPLORER}/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#8b5cf6',
                        background: 'rgba(139,92,246,0.12)',
                        border: '1px solid rgba(139,92,246,0.3)',
                        borderRadius: 8,
                        padding: '5px 12px',
                        textDecoration: 'none',
                        transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.12)')}
                >
                    View on Monad Explorer ↗
                </a>
            </div>

            {/* Dismiss */}
            <button
                onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: 0,
                    lineHeight: 1,
                    flexShrink: 0,
                }}
            >
                ✕
            </button>
        </div>
    );
}
