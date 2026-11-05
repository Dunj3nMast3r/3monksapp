import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { managerService, adminService } from '../services/dataService';
import Modal from '../components/Modal';
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

const monthStart = () => `${localDate().slice(0, 8)}01`;

// Report ranges people ask for most; a custom range is still possible
const RANGES = {
    today: { label: 'Today', from: () => localDate(), to: () => localDate() },
    yesterday: { label: 'Yesterday', from: () => daysAgo(1), to: () => daysAgo(1) },
    week: { label: 'Last 7 days', from: () => daysAgo(6), to: () => localDate() },
    month: { label: 'This month', from: monthStart, to: () => localDate() },
};

const ENTRY_LABELS = { CONSUMPTION: '📤 Used', PURCHASE: '📥 Received', ADJUSTMENT: '🔄 Count' };

// Daily usage first: it is what staff record every day
const MODES = {
    CONSUMPTION: {
        label: '📤 Used', help: 'How much was used. It is taken off the stock.',
        qtyHeader: 'Used', action: 'Save Usage', apply: (current, qty) => current - qty,
    },
    PURCHASE: {
        label: '📥 Received', help: 'Stock that arrived. It is added to the stock.',
        qtyHeader: 'Received', action: 'Save Received', apply: (current, qty) => current + qty,
    },
    ADJUSTMENT: {
        label: '🔄 Correct Count', help: 'What is actually there after a physical check. The stock is set to it.',
        qtyHeader: 'Actual count', action: 'Save Count', apply: (current, qty) => qty,
    },
};

const UNIT_LABELS = { KG: 'kg', GRAM: 'g', LITRE: 'L', ML: 'ml', PIECE: 'pcs', DOZEN: 'dozen' };
const unitLabel = (unitType) => UNIT_LABELS[unitType] || (unitType || '').toLowerCase();
// Up to 3 decimals (kg to the gram), no trailing zeros
const formatQty = (q) => Number(q || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const withUnit = (q, unitType) => `${formatQty(q)} ${unitLabel(unitType)}`;

const StockPage = () => {
    const { user } = useAuth();
    const isAdmin = user.role === 'SUPER_ADMIN';

    const [shops, setShops] = useState([]);
    const [shopId, setShopId] = useState(user.shopId || '');
    const [materials, setMaterials] = useState([]);
    const [stock, setStock] = useState([]);
    const [report, setReport] = useState([]);
    const [reportAll, setReportAll] = useState(false);
    const [range, setRange] = useState('today');
    const [dayEntries, setDayEntries] = useState([]);
    const [removing, setRemoving] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // Current stock is what people look for first; entering stock is one tab over
    const [tab, setTab] = useState('current');
    const [mode, setMode] = useState('CONSUMPTION');
    const [search, setSearch] = useState('');
    const [confirming, setConfirming] = useState(false);

    // Quantities typed per mode and raw material id, so switching mode loses nothing.
    // One date applies to the whole table.
    const [entries, setEntries] = useState({ CONSUMPTION: {}, PURCHASE: {}, ADJUSTMENT: {} });
    const [entryDate, setEntryDate] = useState(() => localDate());

    const [from, setFrom] = useState(() => localDate());
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

    const fetchReport = useCallback(async () => {
        if (!shopId) return;
        try {
            const res = await managerService.getStockReport(shopId, from, to);
            setReport(res.data.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load stock report');
        }
    }, [shopId, from, to]);

    // What has been recorded on the entry date, so a mistake can be seen and removed
    const fetchEntries = useCallback(async () => {
        if (!shopId) return;
        try {
            const res = await managerService.getStockEntries(shopId, entryDate);
            setDayEntries(res.data.data || []);
        } catch {
            toast.error('Failed to load entries');
        }
    }, [shopId, entryDate]);

    useEffect(() => { fetchStock(); }, [fetchStock]);
    useEffect(() => { if (tab === 'report') fetchReport(); }, [tab, fetchReport]);
    useEffect(() => { if (tab === 'entry') fetchEntries(); }, [tab, fetchEntries]);

    const pickRange = (key) => {
        setRange(key);
        setFrom(RANGES[key].from());
        setTo(RANGES[key].to());
    };

    const handleRemove = async () => {
        if (!removing) return;
        try {
            await managerService.removeStockEntry(removing.id);
            toast.success(`Removed ${removing.rawMaterialName} entry`);
            setRemoving(null);
            fetchEntries();
            fetchStock();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to remove entry');
        }
    };

    // Current balance per material, so each row can show it next to the input.
    const currentByMaterial = useMemo(() => {
        const map = {};
        stock.forEach(s => { map[s.rawMaterialId] = s; });
        return map;
    }, [stock]);

    const matchesSearch = useCallback(
        (name) => !search.trim() || name.toLowerCase().includes(search.trim().toLowerCase()), [search]);

    // Every active material with its balance, out-of-stock and low first
    const overview = useMemo(() => {
        const rank = (row) => (row.quantity <= 0 ? 0 : row.lowStock ? 1 : 2);
        return materials
            .map(m => {
                const current = currentByMaterial[m.id];
                return {
                    id: m.id,
                    name: m.name,
                    unitType: m.unitType,
                    quantity: current ? Number(current.quantity) : 0,
                    // The shop's minimum if set, else the material's reorder level
                    minimum: current ? current.minimumThreshold : m.reorderLevel,
                    lowStock: !!current?.lowStock,
                };
            })
            .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    }, [materials, currentByMaterial]);
    const outCount = overview.filter(r => r.quantity <= 0).length;
    const lowCount = overview.filter(r => r.quantity > 0 && r.lowStock).length;

    const modeEntries = entries[mode];
    const setQty = (materialId, qty) => {
        setEntries(prev => ({ ...prev, [mode]: { ...prev[mode], [materialId]: qty } }));
    };

    // Every filled row of the current mode with its before/after, for the preview and the save
    const changes = useMemo(() => (
        materials
            .filter(m => modeEntries[m.id] !== undefined && modeEntries[m.id] !== '')
            .map(m => {
                const qty = parseFloat(modeEntries[m.id]);
                const before = currentByMaterial[m.id] ? Number(currentByMaterial[m.id].quantity) : 0;
                const after = Number.isFinite(qty) ? MODES[mode].apply(before, qty) : NaN;
                return { material: m, qty, before, after, invalid: !Number.isFinite(qty) || qty < 0 || after < 0 };
            })
    ), [materials, modeEntries, currentByMaterial, mode]);
    const hasInvalid = changes.some(c => c.invalid);

    const handleSaveAll = async () => {
        setSaving(true);
        try {
            await managerService.recordBulkStock({
                shopId: parseInt(shopId, 10),
                type: mode,
                lines: changes.map(c => ({ rawMaterialId: c.material.id, quantity: c.qty, txnDate: entryDate })),
            });
            toast.success(
                `Saved ${changes.length} ${changes.length === 1 ? 'entry' : 'entries'} for ${entryDate}`);
            setEntries(prev => ({ ...prev, [mode]: {} }));
            setConfirming(false);
            fetchStock();
            fetchEntries();
        } catch (err) {
            // The batch is atomic, so nothing was saved — the message names the
            // material that failed (usually insufficient stock).
            toast.error(err.response?.data?.message || 'Failed to save stock entries');
        } finally {
            setSaving(false);
        }
    };

    const searchBox = (
        <input className="form-control stock-search" type="search" placeholder="🔍 Search material"
            value={search} onChange={e => setSearch(e.target.value)} />
    );

    return (
        <div>
            <div className="page-header">
                <h1>Stock Management</h1>
            </div>

            {isAdmin && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <div className="form-group" style={{ margin: 0, minWidth: '200px' }}>
                        <label>Shop</label>
                        <select className="form-control" value={shopId} onChange={e => setShopId(e.target.value)}>
                            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button className={`btn ${tab === 'current' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setTab('current')}>Current Stock</button>
                <button className={`btn ${tab === 'entry' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setTab('entry')}>Update Stock</button>
                <button className={`btn ${tab === 'report' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setTab('report')}>Report</button>
            </div>

            {tab === 'current' && (
                loading ? (
                    <div className="loading"><div className="spinner"></div></div>
                ) : overview.length === 0 ? (
                    <div className="empty-state"><div className="icon">📦</div><p>No raw materials set up yet</p></div>
                ) : (
                    <div className="card">
                        <div className="stock-overview-head">
                            <span>
                                {overview.length} materials
                                {outCount > 0 && <span className="badge badge-danger stock-count-badge">{outCount} out of stock</span>}
                                {lowCount > 0 && <span className="badge badge-warning stock-count-badge">{lowCount} low</span>}
                            </span>
                            <button className="btn btn-sm btn-primary" onClick={() => setTab('entry')}>+ Update Stock</button>
                        </div>
                        {searchBox}
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Material</th>
                                        <th>Current</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overview.filter(r => matchesSearch(r.name)).map(r => (
                                        <tr key={r.id}>
                                            <td style={{ fontWeight: 500 }}>{r.name}</td>
                                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{withUnit(r.quantity, r.unitType)}</td>
                                            <td>
                                                {r.quantity <= 0 ? (
                                                    <span className="badge badge-danger">Out of stock</span>
                                                ) : r.lowStock ? (
                                                    <span className="badge badge-warning">
                                                        Low{r.minimum ? ` (reorder at ${withUnit(r.minimum, r.unitType)})` : ''}
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-success">OK</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {tab === 'entry' && (
                <>
                    <div className="stock-modes">
                        {Object.keys(MODES).map(key => {
                            const filled = Object.values(entries[key]).filter(v => v !== '').length;
                            return (
                                <button key={key}
                                    className={`btn ${mode === key ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setMode(key)}>
                                    {MODES[key].label}
                                    {filled > 0 && <span className="stock-mode-count">{filled}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <p className="form-hint stock-mode-help">{MODES[mode].help}</p>

                    <div className="card stock-entry-controls">
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Date</label>
                            <input type="date" className="form-control" max={localDate()}
                                value={entryDate}
                                onChange={e => setEntryDate(e.target.value)}
                                style={{ width: '170px' }} />
                        </div>
                        {searchBox}
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
                                            <th>Now</th>
                                            <th>{MODES[mode].qtyHeader}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {materials.filter(m => matchesSearch(m.name)).map(m => {
                                            const current = currentByMaterial[m.id];
                                            const change = changes.find(c => c.material.id === m.id);
                                            return (
                                                <tr key={m.id}>
                                                    <td style={{ fontWeight: 500 }}>{m.name}</td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>
                                                        {withUnit(current ? current.quantity : 0, m.unitType)}
                                                    </td>
                                                    <td>
                                                        <div className="stock-qty-input">
                                                            <input className={`form-control${change?.invalid ? ' input-error' : ''}`}
                                                                type="number" inputMode="decimal" min="0"
                                                                step={m.unitType === 'KG' || m.unitType === 'LITRE' ? '0.001' : '1'}
                                                                placeholder="-"
                                                                aria-label={`${MODES[mode].qtyHeader} ${m.name}`}
                                                                value={modeEntries[m.id] ?? ''}
                                                                onChange={e => setQty(m.id, e.target.value)} />
                                                            <span className="stock-qty-unit">{unitLabel(m.unitType)}</span>
                                                        </div>
                                                        {change && (
                                                            change.invalid ? (
                                                                <span className="field-error">
                                                                    {change.after < 0
                                                                        ? `Only ${withUnit(change.before, m.unitType)} available`
                                                                        : 'Enter a valid quantity'}
                                                                </span>
                                                            ) : (
                                                                <span className="stock-after">→ {withUnit(change.after, m.unitType)}</span>
                                                            )
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="stock-save-bar">
                                <span>
                                    {changes.length === 0
                                        ? 'Fill only the rows that changed'
                                        : `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} for ${entryDate}`}
                                </span>
                                <button className="btn btn-primary" onClick={() => setConfirming(true)}
                                    disabled={saving || changes.length === 0 || hasInvalid}>
                                    Review & {MODES[mode].action}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="card stock-entries">
                        <h3>Entries on {entryDate}</h3>
                        {dayEntries.length === 0 ? (
                            <p className="form-hint">Nothing recorded on this date yet.</p>
                        ) : (
                            <div className="table-wrapper">
                                <table>
                                    <thead><tr><th>Material</th><th>Entry</th><th>By</th><th></th></tr></thead>
                                    <tbody>
                                        {dayEntries.map(e => (
                                            <tr key={e.id}>
                                                <td style={{ fontWeight: 500 }}>{e.rawMaterialName}</td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    {ENTRY_LABELS[e.type]} {withUnit(e.quantity, e.unitType)}
                                                </td>
                                                <td>{e.enteredBy || '-'}</td>
                                                <td>
                                                    {e.removable && (
                                                        <button className="btn btn-sm btn-outline" onClick={() => setRemoving(e)}>✕ Remove</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="form-hint">Entered something wrong? Remove it and enter it again. Entries older than 7 days are fixed with Correct Count.</p>
                    </div>
                </>
            )}

            <Modal isOpen={!!removing} onClose={() => setRemoving(null)} title="Remove this entry?">
                {removing && (
                    <>
                        <p>
                            <strong>{removing.rawMaterialName}</strong>: {ENTRY_LABELS[removing.type]} {withUnit(removing.quantity, removing.unitType)} on {removing.txnDate}.
                        </p>
                        <p className="form-hint">
                            The stock goes back by {withUnit(Math.abs(removing.balanceChange), removing.unitType)}
                            {Number(removing.balanceChange) >= 0 ? ' (taken off)' : ' (added back)'}.
                        </p>
                    </>
                )}
                <div className="modal-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setRemoving(null)}>Keep</button>
                    <button type="button" className="btn btn-danger" onClick={handleRemove}>Remove</button>
                </div>
            </Modal>

            <Modal isOpen={confirming} onClose={() => setConfirming(false)}
                title={`${MODES[mode].label} · ${entryDate}`}>
                <div className="table-wrapper">
                    <table>
                        <thead><tr><th>Material</th><th>{MODES[mode].qtyHeader}</th><th>Stock</th></tr></thead>
                        <tbody>
                            {changes.map(c => (
                                <tr key={c.material.id}>
                                    <td style={{ fontWeight: 500 }}>{c.material.name}</td>
                                    <td>{withUnit(c.qty, c.material.unitType)}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        {formatQty(c.before)} → <strong>{withUnit(c.after, c.material.unitType)}</strong>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="modal-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)}>Back</button>
                    <button type="button" className="btn btn-primary" onClick={handleSaveAll} disabled={saving}>
                        {saving ? 'Saving...' : MODES[mode].action}
                    </button>
                </div>
            </Modal>

            {tab === 'report' && (() => {
                const moved = (r) => [r.opening, r.received, r.used, r.corrected, r.closing].some(v => Number(v) !== 0);
                const rows = report.filter(r => (reportAll || moved(r)) && matchesSearch(r.rawMaterialName));
                return (
                    <>
                        <div className="card" style={{ marginBottom: '16px' }}>
                            <div className="stock-modes" style={{ marginBottom: '12px' }}>
                                {Object.entries(RANGES).map(([key, r]) => (
                                    <button key={key} className={`btn btn-sm ${range === key ? 'btn-primary' : 'btn-outline'}`}
                                        onClick={() => pickRange(key)}>{r.label}</button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>From</label>
                                    <input type="date" className="form-control" value={from} max={to}
                                        onChange={e => { setRange('custom'); setFrom(e.target.value); }} style={{ width: '150px' }} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>To</label>
                                    <input type="date" className="form-control" value={to} min={from} max={localDate()}
                                        onChange={e => { setRange('custom'); setTo(e.target.value); }} style={{ width: '150px' }} />
                                </div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="stock-overview-head">
                                <span>{from === to ? from : `${from} → ${to}`}</span>
                                <label className="stock-report-all">
                                    <input type="checkbox" checked={reportAll} onChange={e => setReportAll(e.target.checked)} /> Show all materials
                                </label>
                            </div>
                            {searchBox}
                            {rows.length === 0 ? (
                                <div className="empty-state"><div className="icon">📅</div><p>No stock or movements in this period</p></div>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="stock-report">
                                        <thead><tr><th>Material</th><th>Opening</th><th>Received</th><th>Used</th><th>Closing</th></tr></thead>
                                        <tbody>
                                            {rows.map(r => (
                                                <tr key={r.rawMaterialId}>
                                                    <td style={{ fontWeight: 500 }}>
                                                        {r.rawMaterialName}
                                                        <span className="stock-report-unit"> {unitLabel(r.unitType)}</span>
                                                    </td>
                                                    <td>{formatQty(r.opening)}</td>
                                                    <td className="stock-in">{Number(r.received) ? `+${formatQty(r.received)}` : '-'}</td>
                                                    <td className="stock-out">{Number(r.used) ? `−${formatQty(r.used)}` : '-'}</td>
                                                    <td style={{ fontWeight: 600 }}>
                                                        {formatQty(r.closing)}
                                                        {Number(r.corrected) !== 0 && (
                                                            <span className="stock-corrected">
                                                                count {Number(r.corrected) > 0 ? '+' : '−'}{formatQty(Math.abs(r.corrected))}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="form-hint">Opening + Received − Used ± count corrections = Closing.</p>
                        </div>
                    </>
                );
            })()}
        </div>
    );
};

export default StockPage;
