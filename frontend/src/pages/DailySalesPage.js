import React, { useState, useEffect, useCallback } from 'react';
import { managerService } from '../services/dataService';
import { formatCurrency, getISTDateString } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const num = (v) => Number(v || 0);

// Actual − expected: red when short, green when over, a tick when it matches
const Diff = ({ value }) => {
    if (value === null || value === undefined) return <span style={{ color: 'var(--text-light)' }}>-</span>;
    const n = num(value);
    if (n === 0) return <span style={{ color: 'var(--success, #065f46)', fontWeight: 600 }}>✓</span>;
    return (
        <span style={{ color: n < 0 ? 'var(--danger, #991b1b)' : 'var(--success, #065f46)', fontWeight: 700 }}>
            {n < 0 ? '−' : '+'}{formatCurrency(Math.abs(n))}
        </span>
    );
};

const monthStart = (date) => `${date.slice(0, 8)}01`;
const prevMonth = (date) => {
    const d = new Date(`${date.slice(0, 8)}01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const start = d.toISOString().slice(0, 10);
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return [start, end];
};

/**
 * Daily Sales: for branches that take orders by hand (e.g. Hinjewadi). Each day's
 * shots, blends and the cash / UPI actually received; the sales amount is worked
 * out from the branch's prices. These days feed every sales report.
 */
const DailySalesPage = () => {
    const { user } = useAuth();
    const today = getISTDateString();
    const [shops, setShops] = useState(null);
    const [shopId, setShopId] = useState('');
    const [from, setFrom] = useState(monthStart(today));
    const [to, setTo] = useState(today);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [entry, setEntry] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        managerService.getManualSalesShops()
            .then(res => {
                const list = res.data.data || [];
                setShops(list);
                if (list.length > 0) setShopId(String(list[0].id));
            })
            .catch(() => setShops([]));
    }, []);

    const shop = (shops || []).find(s => String(s.id) === String(shopId));

    const load = useCallback(async (f = from, t = to) => {
        if (!shopId) return;
        setLoading(true);
        try {
            const res = await managerService.getManualSales(shopId, f, t);
            setData(res.data.data);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load daily sales');
        } finally {
            setLoading(false);
        }
    }, [shopId, from, to]);

    useEffect(() => { load(); }, [shopId]); // eslint-disable-line

    const pickRange = (f, t) => { setFrom(f); setTo(t); load(f, t); };

    // Opens the form for a date: an existing day is edited, a new one starts empty
    const openEntry = (date = today) => {
        const day = (data?.days || []).find(d => d.date === date);
        setEntry(day ? {
            date, existing: true,
            shots: String(day.shots), blends: String(day.blends),
            shotPrice: num(day.shotPrice), blendPrice: num(day.blendPrice),
            receivedCash: day.receivedCash != null ? String(num(day.receivedCash)) : '',
            receivedUpi: day.receivedUpi != null ? String(num(day.receivedUpi)) : '',
            note: day.note || '',
        } : {
            date, existing: false, shots: '', blends: '',
            shotPrice: num(shop?.shotPrice), blendPrice: num(shop?.blendPrice),
            receivedCash: '', receivedUpi: '', note: '',
        });
    };

    const changeDate = (date) => {
        const day = (data?.days || []).find(d => d.date === date);
        if (day) openEntry(date);
        else setEntry(e => ({ ...e, date, existing: false, shotPrice: num(shop?.shotPrice), blendPrice: num(shop?.blendPrice) }));
    };

    const saveEntry = async () => {
        if (entry.shots === '' || entry.blends === '') {
            toast.error('Enter shots and blends sold (0 if none)');
            return;
        }
        // Received is optional: both empty = not known yet; one empty = ₹0
        const noReceived = entry.receivedCash === '' && entry.receivedUpi === '';
        const amountOrNull = (v) => (noReceived ? null : v === '' ? 0 : Number(v));
        setSaving(true);
        try {
            await managerService.saveManualSales({
                shopId: Number(shopId), date: entry.date,
                shots: Number(entry.shots), blends: Number(entry.blends),
                receivedCash: amountOrNull(entry.receivedCash), receivedUpi: amountOrNull(entry.receivedUpi),
                note: entry.note,
            });
            toast.success(`${entry.date} saved`);
            setEntry(null);
            // Make sure the saved day is in view
            if (entry.date < from) pickRange(entry.date, to); else load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const removeEntry = async () => {
        if (!window.confirm(`Remove the sales and amount received for ${entry.date}?`)) return;
        setSaving(true);
        try {
            await managerService.deleteManualSales(shopId, entry.date);
            toast.success('Day removed');
            setEntry(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to remove');
        } finally {
            setSaving(false);
        }
    };

    if (shops === null) return <div className="loading"><div className="spinner"></div></div>;

    if (shops.length === 0) {
        return (
            <div>
                <div className="page-header"><h1>Daily Sales</h1></div>
                <div className="card empty-state">
                    <div className="icon">✍️</div>
                    <p>{user?.role === 'SUPER_ADMIN'
                        ? 'No branch takes orders by hand yet. In Shops → Edit, tick "Sales entered manually" and set the shot and blend prices.'
                        : 'Your branch takes orders in the app, so there is nothing to enter here.'}</p>
                </div>
            </div>
        );
    }

    const totals = data?.totals;
    const days = data?.days || [];
    const amount = entry ? num(entry.shots) * entry.shotPrice + num(entry.blends) * entry.blendPrice : 0;
    const received = entry ? num(entry.receivedCash) + num(entry.receivedUpi) : 0;
    const receivedEntered = entry && (entry.receivedCash !== '' || entry.receivedUpi !== '');

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <h1>Daily Sales</h1>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => openEntry(today)}>+ Enter a day</button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    {shops.length > 1 && (
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Branch</label>
                            <select className="form-control" value={shopId} onChange={e => setShopId(e.target.value)}>
                                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="form-group" style={{ margin: 0 }}>
                        <label>From</label>
                        <input type="date" className="form-control" value={from} max={to} onChange={e => setFrom(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label>To</label>
                        <input type="date" className="form-control" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" disabled={loading} onClick={() => load()}>{loading ? 'Loading...' : 'Apply'}</button>
                    <button className="btn btn-outline btn-sm" onClick={() => pickRange(monthStart(today), today)}>This month</button>
                    <button className="btn btn-outline btn-sm" onClick={() => pickRange(...prevMonth(today))}>Last month</button>
                </div>
                {shop && (
                    <p className="form-hint" style={{ marginBottom: 0 }}>
                        {shops.length === 1 && <strong>{shop.name} · </strong>}
                        Shot {formatCurrency(shop.shotPrice)} · Blend {formatCurrency(shop.blendPrice)}. Sales = shots × shot price + blends × blend price.
                    </p>
                )}
            </div>

            {totals && (
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                    <div className="stat-card"><div className="stat-label">Sales</div><div className="stat-value">{formatCurrency(totals.amount)}</div>
                        <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>{days.length} {days.length === 1 ? 'day' : 'days'} entered</div></div>
                    <div className="stat-card"><div className="stat-label">Received</div><div className="stat-value">{totals.receivedTotal != null ? formatCurrency(totals.receivedTotal) : '-'}</div>
                        {totals.receivedTotal != null && <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>💵 {formatCurrency(totals.receivedCash)} · 📱 {formatCurrency(totals.receivedUpi)}</div>}</div>
                    <div className="stat-card"><div className="stat-label">Difference</div><div className="stat-value"><Diff value={totals.difference} /></div></div>
                    <div className="stat-card"><div className="stat-label">Shots</div><div className="stat-value">{num(totals.shots)}</div></div>
                    <div className="stat-card"><div className="stat-label">Blends</div><div className="stat-value">{num(totals.blends)}</div></div>
                </div>
            )}

            <div className="card">
                {days.length === 0 ? (
                    <div className="empty-state"><div className="icon">📅</div><p>No days entered in this period.</p></div>
                ) : (
                    <div className="table-wrapper">
                        <p className="form-hint" style={{ marginTop: 0 }}>Tap a day to edit or remove it.</p>
                        <table className="daily-sales-table">
                            <thead><tr><th>Date</th><th>Shots</th><th>Blends</th><th>Sales</th><th>Received</th><th>Diff.</th></tr></thead>
                            <tbody>
                                {days.map(d => (
                                    <tr key={d.date} onClick={() => openEntry(d.date)} style={{ cursor: 'pointer' }} title="Tap to edit">
                                        <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                                            {d.date.slice(8)}/{d.date.slice(5, 7)}/{d.date.slice(2, 4)}
                                            {d.note && <div style={{ color: 'var(--text-light)', fontSize: '12px', fontWeight: 400, maxWidth: '180px', whiteSpace: 'normal' }}>📝 {d.note}</div>}
                                        </td>
                                        <td>{d.shots}</td>
                                        <td>{d.blends}</td>
                                        <td style={{ fontWeight: 600 }}>{formatCurrency(d.amount)}</td>
                                        <td>
                                            {d.receivedTotal != null ? (
                                                <span style={{ fontWeight: 600 }} title={`Cash ${formatCurrency(d.receivedCash)} · UPI ${formatCurrency(d.receivedUpi)}`}>
                                                    {formatCurrency(d.receivedTotal)}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}><Diff value={d.difference} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal isOpen={!!entry} onClose={() => !saving && setEntry(null)} title={entry?.existing ? `Edit ${entry.date}` : 'Enter a day'}>
                {entry && (
                    <>
                        <div className="form-group">
                            <label>Date</label>
                            <input type="date" className="form-control" value={entry.date} max={today}
                                onChange={e => changeDate(e.target.value)} />
                            {entry.existing && <small className="form-hint">This day is already entered; saving updates it.</small>}
                        </div>
                        <div className="grid-2">
                            <div className="form-group">
                                <label>Shots sold</label>
                                <input type="number" min="0" step="1" inputMode="numeric" className="form-control" autoFocus
                                    value={entry.shots} onChange={e => setEntry({ ...entry, shots: e.target.value })} />
                                <small className="form-hint">× {formatCurrency(entry.shotPrice)}</small>
                            </div>
                            <div className="form-group">
                                <label>Blends sold</label>
                                <input type="number" min="0" step="1" inputMode="numeric" className="form-control"
                                    value={entry.blends} onChange={e => setEntry({ ...entry, blends: e.target.value })} />
                                <small className="form-hint">× {formatCurrency(entry.blendPrice)}</small>
                            </div>
                        </div>
                        <div className="form-group" style={{ background: 'var(--bg-light, #f5f3ff)', padding: '10px 12px', borderRadius: '8px' }}>
                            Sales: <strong>{formatCurrency(amount)}</strong>
                        </div>
                        <div className="grid-2">
                            <div className="form-group">
                                <label>💵 Cash received <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" className="form-control"
                                    value={entry.receivedCash} onChange={e => setEntry({ ...entry, receivedCash: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>📱 UPI received <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" className="form-control"
                                    value={entry.receivedUpi} onChange={e => setEntry({ ...entry, receivedUpi: e.target.value })} />
                            </div>
                        </div>
                        {receivedEntered ? (
                            <div className="form-group">
                                Received {formatCurrency(received)} · Difference <Diff value={received - amount} />
                            </div>
                        ) : (
                            <p className="form-hint" style={{ marginTop: '-8px' }}>Leave both empty if the amount received isn't known yet; you can add it later.</p>
                        )}
                        <div className="form-group">
                            <label>Note (optional)</label>
                            <textarea className="form-control" rows="2" maxLength={500} value={entry.note}
                                placeholder="e.g. ₹50 short in change" onChange={e => setEntry({ ...entry, note: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {entry.existing && <button className="btn btn-danger" disabled={saving} onClick={removeEntry}>Remove</button>}
                            <button className="btn btn-outline" disabled={saving} onClick={() => setEntry(null)}>Cancel</button>
                            <button className="btn btn-primary" disabled={saving} onClick={saveEntry}>{saving ? 'Saving…' : 'Save'}</button>
                        </div>
                    </>
                )}
            </Modal>

        </div>
    );
};

export default DailySalesPage;
