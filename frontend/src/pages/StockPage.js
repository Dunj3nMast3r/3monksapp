import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { managerService, adminService } from '../services/dataService';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

// Local calendar date, not UTC — toISOString() would roll back a day for IST
// in the early hours and file the entry against yesterday.
const todayLocal = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const ENTRY_TYPES = {
    PURCHASE: { title: 'Add Purchased Stock', action: 'Add Stock', qtyLabel: 'Quantity Purchased' },
    CONSUMPTION: { title: 'Deduct Consumed Stock', action: 'Deduct', qtyLabel: 'Quantity Consumed' },
    ADJUSTMENT: { title: 'Adjust Stock', action: 'Adjust', qtyLabel: 'Actual Count (physical stock)' },
};

const emptyForm = { rawMaterialId: '', quantity: '', txnDate: todayLocal(), minimumThreshold: '', notes: '' };

const StockPage = () => {
    const { user } = useAuth();
    const isAdmin = user.role === 'SUPER_ADMIN';

    const [shops, setShops] = useState([]);
    const [shopId, setShopId] = useState(user.shopId || '');
    const [stock, setStock] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('current');
    const [entryType, setEntryType] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [from, setFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    });
    const [to, setTo] = useState(todayLocal());

    // Admins pick a shop; everyone else is pinned to their own.
    useEffect(() => {
        adminService.getRawMaterials()
            .then(res => setMaterials(res.data.data || []))
            .catch(() => { });

        if (isAdmin) {
            adminService.getShops()
                .then(res => {
                    const list = res.data.data || [];
                    setShops(list);
                    setShopId(prev => prev || (list[0] && list[0].id) || '');
                })
                .catch(() => toast.error('Failed to load shops'));
        }
    }, [isAdmin]);

    const fetchStock = useCallback(async () => {
        if (!shopId) return;
        setLoading(true);
        try {
            const res = await managerService.getShopStock(shopId);
            setStock(res.data.data || []);
        } catch {
            toast.error('Failed to load stock');
        } finally {
            setLoading(false);
        }
    }, [shopId]);

    const fetchSummary = useCallback(async () => {
        if (!shopId) return;
        try {
            const res = await managerService.getStockSummary(shopId, from, to);
            setSummary(res.data.data || []);
        } catch {
            toast.error('Failed to load daily summary');
        }
    }, [shopId, from, to]);

    useEffect(() => { fetchStock(); }, [fetchStock]);
    useEffect(() => { if (tab === 'summary') fetchSummary(); }, [tab, fetchSummary]);

    const openEntry = (type) => {
        setForm(emptyForm);
        setEntryType(type);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const base = {
            shopId: parseInt(shopId, 10),
            rawMaterialId: parseInt(form.rawMaterialId, 10),
            txnDate: form.txnDate,
            notes: form.notes,
        };

        try {
            if (entryType === 'ADJUSTMENT') {
                await managerService.adjustStock({ ...base, actualCount: parseFloat(form.quantity) });
            } else {
                const payload = {
                    ...base,
                    quantity: parseFloat(form.quantity),
                    minimumThreshold: form.minimumThreshold ? parseFloat(form.minimumThreshold) : null,
                };
                if (entryType === 'PURCHASE') await managerService.recordPurchase(payload);
                else await managerService.recordConsumption(payload);
            }
            toast.success(`${ENTRY_TYPES[entryType].action} recorded`);
            setEntryType(null);
            setForm(emptyForm);
            fetchStock();
            if (tab === 'summary') fetchSummary();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save stock entry');
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1>Stock Management</h1>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => openEntry('PURCHASE')}>+ Add Stock</button>
                    <button className="btn btn-outline" onClick={() => openEntry('CONSUMPTION')}>- Deduct Consumption</button>
                    <button className="btn btn-outline" onClick={() => openEntry('ADJUSTMENT')}>Adjust</button>
                </div>
            </div>

            {isAdmin && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <div className="form-group" style={{ margin: 0, maxWidth: '320px' }}>
                        <label>Shop</label>
                        <select className="form-control" value={shopId} onChange={e => setShopId(e.target.value)}>
                            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className={`btn ${tab === 'current' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setTab('current')}>Current Stock</button>
                <button className={`btn ${tab === 'summary' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setTab('summary')}>Daily Summary</button>
            </div>

            {tab === 'current' && (
                loading ? (
                    <div className="loading"><div className="spinner"></div></div>
                ) : stock.length === 0 ? (
                    <div className="empty-state"><div className="icon">📦</div><p>No stock entries yet</p></div>
                ) : (
                    <div className="card">
                        <div className="table-wrapper">
                            <table>
                                <thead><tr><th>Material</th><th>Current Qty</th><th>Unit</th><th>Min Threshold</th><th>Status</th></tr></thead>
                                <tbody>
                                    {stock.map(s => (
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 500 }}>{s.rawMaterialName}</td>
                                            <td>{s.quantity}</td>
                                            <td>{s.unitType}</td>
                                            <td>{s.minimumThreshold || '-'}</td>
                                            <td>
                                                <span className={`badge ${s.lowStock ? 'badge-danger' : 'badge-success'}`}>
                                                    {s.lowStock ? 'LOW' : 'OK'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {tab === 'summary' && (
                <>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label>From</label>
                                <input type="date" className="form-control" value={from}
                                    onChange={e => setFrom(e.target.value)} style={{ width: '150px' }} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label>To</label>
                                <input type="date" className="form-control" value={to}
                                    onChange={e => setTo(e.target.value)} style={{ width: '150px' }} />
                            </div>
                        </div>
                    </div>

                    {summary.length === 0 ? (
                        <div className="empty-state"><div className="icon">📅</div><p>No stock movements in this period</p></div>
                    ) : (
                        <div className="card">
                            <div className="table-wrapper">
                                <table>
                                    <thead><tr><th>Date</th><th>Material</th><th>Purchased</th><th>Consumed</th><th>Adjusted</th><th>Unit</th></tr></thead>
                                    <tbody>
                                        {summary.map((r, i) => (
                                            <tr key={`${r.txnDate}-${r.rawMaterialId}-${i}`}>
                                                <td>{r.txnDate}</td>
                                                <td style={{ fontWeight: 500 }}>{r.rawMaterialName}</td>
                                                <td>{Number(r.purchased) ? r.purchased : '-'}</td>
                                                <td>{Number(r.consumed) ? r.consumed : '-'}</td>
                                                <td>{Number(r.adjusted) ? r.adjusted : '-'}</td>
                                                <td>{r.unitType}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            <Modal isOpen={!!entryType} onClose={() => setEntryType(null)}
                title={entryType ? ENTRY_TYPES[entryType].title : ''}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Raw Material *</label>
                        <select className="form-control" value={form.rawMaterialId}
                            onChange={e => setForm({ ...form, rawMaterialId: e.target.value })} required>
                            <option value="">Select material...</option>
                            {materials.filter(m => m.active).map(m => (
                                <option key={m.id} value={m.id}>{m.name} ({m.unitType})</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid-2">
                        <div className="form-group">
                            <label>{entryType ? ENTRY_TYPES[entryType].qtyLabel : ''} *</label>
                            <input className="form-control" type="number" step="0.01"
                                min={entryType === 'ADJUSTMENT' ? '0' : '0.01'}
                                value={form.quantity}
                                onChange={e => setForm({ ...form, quantity: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Date *</label>
                            <input className="form-control" type="date" value={form.txnDate}
                                max={todayLocal()}
                                onChange={e => setForm({ ...form, txnDate: e.target.value })} required />
                        </div>
                    </div>
                    {entryType !== 'ADJUSTMENT' && (
                        <div className="form-group">
                            <label>Min Threshold</label>
                            <input className="form-control" type="number" step="0.01" value={form.minimumThreshold}
                                onChange={e => setForm({ ...form, minimumThreshold: e.target.value })} />
                        </div>
                    )}
                    <div className="form-group">
                        <label>Notes</label>
                        <input className="form-control" value={form.notes}
                            onChange={e => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-outline" onClick={() => setEntryType(null)}>Cancel</button>
                        <button type="submit" className="btn btn-primary">
                            {entryType ? ENTRY_TYPES[entryType].action : ''}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default StockPage;
