import React from 'react';

const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, details, confirmText = 'Confirm', confirmStyle = 'btn-danger', loading = false }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                <div className="modal-header">
                    <h3>{title || 'Confirm Action'}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div style={{ padding: '20px' }}>
                    <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: details?.length ? '16px' : '8px' }}>{message}</p>
                    {details && details.length > 0 && (
                        <div style={{
                            background: 'var(--bg-secondary, #f8f9fa)',
                            borderRadius: '8px',
                            padding: '14px 16px',
                            marginBottom: '16px',
                            border: '1px solid var(--border, #e5e7eb)'
                        }}>
                            <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--danger, #dc3545)' }}>
                                ⚠️ Impact of this action:
                            </p>
                            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.9', color: 'var(--text-secondary, #6b7280)' }}>
                                {details.map((d, i) => <li key={i}>{d}</li>)}
                            </ul>
                        </div>
                    )}
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary, #6b7280)', fontStyle: 'italic' }}>
                        This action cannot be undone.
                    </p>
                </div>
                <div style={{ padding: '0 20px 20px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className={`btn ${confirmStyle}`} onClick={onConfirm} disabled={loading}>
                        {loading ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
