import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { managerService, adminService } from '../services/dataService';
import toast from 'react-hot-toast';

// Local calendar date, not UTC — toISOString() would roll back a day for IST
// in the early hours and file the entry against yesterday.
const localDate = (d = new Date()) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localDate(d);
};

const MODES = {
    PURCHASE: { label: 'Add Stock', qtyHeader: 'Qty Purchased', action: 'Save Purchases' },
    CONSUMPTION: { label: 'Deduct Consumption', qtyHeader: 'Qty Consumed', action: 'Save Consumption' },
    ADJUSTMENT: { label: 'Adjust', qtyHeader: 'Actual Count', action: 'Save Adjustments' },
};

const StockPage = () => {
    const { user } = useAuth();
    const isAdmin = user.role === 'SUPER_ADMIN';

    const [shops, setShops] = useState([]);
    const [shopId, setShopId] = useState(user.shopId || '');
    const [materials, setMaterials] = useState([]);
    const [stock, setStock] = useState([]);
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState('entry');
    const [mode, setMode] = useState('PURCHASE');

    // Keyed by raw material id: { qty, date }
    const [entries, setEntries] = useState({});

    const [from, setFrom] = useState(() => daysAgo(7));
    const [to, setTo] = useState(() => localDate());

    useEffect(() => {
        adminService.getRawMaterials()
            .then(res => setMaterials((res.data.data || []).filter(m => m.active)))
            .catch(() => toast.error('Failed to load raw materials'));

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

    // Current balance per material, so each row can show it next to the input.
    const currentByMaterial = useMemo(() => {
        const map = {};
        stock.forEach(s => { map[s.rawMaterialId] = s; });
        return map;
    }, [stock]);

    const setEntry = (materialId, patch) => {
        setEntries(prev => ({
            ...prev,
            [materialId]: { qty: '', date: localDate(), ...prev[materialId], ...patch },
        }));
    };

    const applyDateToAll = (date) => {
        setEntries(prev => {
            const next = { ...prev };
            materials.forEach(m => {
                next[m.id] = { qty: '', ...next[m.id], date };
            });
            return next;
        });
    };

    const switchMode = (next) => {
        setMode(next);
        setEntries({});   // a quantity means something different in each mode
    };

    const filledLines = useMemo(() => (
        materials
            .map(m => ({ material: m, entry: entries[m.id] }))
            .filter(({ entry }) => entry && entry.qty !== '' && entry.qty !== null)
            .map(({ material, entry }) => ({
                rawMaterialId: material.id,
                quantity: parseFloat(entry.qty),
                txnDate: entry.date || localDate(),
            }))
    ), [materials, entries]);

    const handleSaveAll = async () => {
        if (filledLines.length === 0) {
            toast.error('Enter a quantity for at least one material');
            return;
        }
        setSaving(true);
        try {
            await managerService.recordBulkStock({
                shopId: parseInt(shopId, 10),
                type: mode,
                lines: filledLines,
            });
            toast.success(`Saved ${filledLines.length} ${filledLines.length === 1 ? 'entry' : 'entries'}`);
            setEntries({});
            fetchStock();
            if (tab === 'summary') fetchSummary();
        } catch (err) {
            // The batch is atomic, so nothing was saved — the message names the
            // material that failed (usually insufficient stock).
            toast.error(err.response?.data?.message || 'Failed to save stock entries');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1>Stock Management</h1>
            </div>

            <div className="card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {isAdmin && (
                        <div className="form-group" style={{ margin: 0, minWidth: '200px' }}>
                            <label>Shop</label>
                            <select className="form-control" value={shopId} onChange={e => setShopId(e.target.value)}>
                                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="form-group" style={{ margin: 0 }}>
                        <label>Set date for all rows</label>
                        <input type="date" className="form-control" max={localDate()}
                            defaultValue={localDate()}
                            onChange={e => applyDateToAll(e.target.value)}
                            style={{ width: '170px' }} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button className={`btn ${tab === 'entry' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setTab('entry')}>Stock Entry</button>
                <button className={`btn ${tab === 'summary' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setTab('summary')}>Daily Summary</button>
            </div>

            {tab === 'entry' && (
                <>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {Object.keys(MODES).map(key => (
                            <button key={key}
                                className={`btn ${mode === key ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => switchMode(key)}>
                                {MODES[key].label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="loading"><div className="spinner"></div></div>
                    ) : materials.length === 0 ? (
                        <div className="empty-state"><div className="icon">📦</div><p>No raw materials set up yet</p></div>
                    ) : (
                        <div className="card">
                            <div className="table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Material</th>
                                            <th>Current</th>
                                            <th>{MODES[mode].qtyHeader}</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {materials.map(m => {
                                            const row = entries[m.id] || {};
                                            const current = currentByMaterial[m.id];
                                            return (
                                                <tr key={m.id}>
                                                    <td style={{ fontWeight: 500 }}>
                                                        {m.name}
                                                        <span style={{ color: '#888', fontWeight: 400 }}> ({m.unitType})</span>
                                                    </td>
                                                    <td>
                                                        {current ? current.quantity : 0}
                                                        {current && current.lowStock && (
                                                            <span className="badge badge-danger" style={{ marginLeft: '6px' }}>LOW</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <input className="form-control" type="number" step="0.01" min="0"
                                                            placeholder="-" style={{ width: '110px' }}
                                                            value={row.qty ?? ''}
                                                            onChange={e => setEntry(m.id, { qty: e.target.value })} />
                                                    </td>
                                                    <td>
                                                        <input className="form-control" type="date" max={localDate()}
                                                            style={{ width: '160px' }}
                                                            value={row.date || localDate()}
                                                            onChange={e => setEntry(m.id, { date: e.target.value })} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#666' }}>
                                    {filledLines.length === 0
                                        ? 'Leave a row blank to skip it'
                                        : `${filledLines.length} row${filledLines.length === 1 ? '' : 's'} ready to save`}
                                </span>
                                <button className="btn btn-primary" onClick={handleSaveAll}
                                    disabled={saving || filledLines.length === 0}>
                                    {saving ? 'Saving...' : MODES[mode].action}
                                </button>
                            </div>
                        </div>
                    )}
                </>
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
        </div>
    );
};

export default StockPage;
