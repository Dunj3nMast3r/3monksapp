import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminService, dashboardService } from '../services/dataService';
import { formatCurrency, getISTDateString } from '../utils/helpers';
import { FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Modal from './Modal';

const num = (value) => Number(value || 0);
const orderCount = (value) => `${num(value)} ${num(value) === 1 ? 'order' : 'orders'}`;

// Actual − expected: red when short, green when over, a tick when it matches
const Difference = ({ value }) => {
    const n = num(value);
    if (n === 0) return <span style={{ color: 'var(--success, #065f46)', fontWeight: 600 }}>✓ Matches</span>;
    return (
        <span style={{ color: n < 0 ? 'var(--danger, #991b1b)' : 'var(--success, #065f46)', fontWeight: 700 }}>
            {n < 0 ? '−' : '+'}{formatCurrency(Math.abs(n))}
        </span>
    );
};

/**
 * Day-end reconciliation: shots and blends sold against the cash and UPI
 * collected, branch by branch. Admin only — the API refuses anyone else.
 *
 * `compact` renders the dashboard widget: today only, no controls. Without it
 * the full page view is rendered, with a date range and a branch filter.
 */
const DailyCollectionWidget = ({ compact = false }) => {
    const today = getISTDateString();
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [shopId, setShopId] = useState('');
    const [shops, setShops] = useState([]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    // The branch-day whose amount received is being entered
    const [entry, setEntry] = useState(null);
    const [saving, setSaving] = useState(false);
    // The period and branch the data on screen was loaded for (the inputs may have changed since)
    const [query, setQuery] = useState({ fromDate: today, toDate: today, branch: '' });

    const fetchCollection = useCallback(async (fromDate, toDate, branch) => {
        setLoading(true);
        try {
            const res = await dashboardService.getDailyCollection(fromDate, toDate, branch);
            setData(res.data.data);
            setQuery({ fromDate, toDate, branch });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load collection');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (compact) {
            fetchCollection(today, today, '');
            return;
        }
        adminService.getShops()
            .then(res => setShops(res.data.data || []))
            .catch(() => setShops([]));
        fetchCollection(today, today, '');
    }, [compact, today, fetchCollection]);

    const setPreset = (preset) => {
        const day = getISTDateString(preset === 'yesterday' ? 1 : 0);
        const nextFrom = preset === 'month' ? today.slice(0, 7) + '-01' : day;
        const nextTo = preset === 'month' ? today : day;
        setFrom(nextFrom);
        setTo(nextTo);
        fetchCollection(nextFrom, nextTo, shopId);
    };

    const reload = () => fetchCollection(query.fromDate, query.toDate, query.branch);

    // A row is one branch on one day: a branch row when the period is a single day,
    // or a day row when a single branch is selected
    const openEntry = (row) => {
        const rowShopId = row.shopId ?? Number(query.branch);
        setEntry({
            shopId: rowShopId,
            shopName: row.shopName || shops.find(s => s.id === rowShopId)?.name || '',
            date: row.date || data.fromDate,
            expectedCash: num(row.cashAmount),
            expectedUpi: num(row.upiAmount),
            actualCash: num(row.actualEntries) > 0 ? String(num(row.actualCash)) : '',
            actualUpi: num(row.actualEntries) > 0 ? String(num(row.actualUpi)) : '',
            note: row.actualNote || '',
            existing: num(row.actualEntries) > 0,
        });
    };

    const saveEntry = async () => {
        if (entry.actualCash === '' || entry.actualUpi === '') {
            toast.error('Enter both cash and UPI received (0 if none)');
            return;
        }
        setSaving(true);
        try {
            await adminService.saveCollectionActual({
                shopId: entry.shopId,
                date: entry.date,
                actualCash: Number(entry.actualCash),
                actualUpi: Number(entry.actualUpi),
                note: entry.note,
            });
            toast.success('Amount received saved');
            setEntry(null);
            reload();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const removeEntry = async () => {
        if (!window.confirm('Remove the amount received for this day?')) return;
        setSaving(true);
        try {
            await adminService.deleteCollectionActual(entry.shopId, entry.date);
            toast.success('Removed');
            setEntry(null);
            reload();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to remove');
        } finally {
            setSaving(false);
        }
    };

    const totals = data?.totals;
    const branches = data?.branches || [];
    const days = data?.days || [];
    const showCancelled = num(totals?.cancelledOrders) > 0;
    const hasBranchData = branches.some(b => num(b.totalOrders) > 0 || num(b.cancelledOrders) > 0 || num(b.manualAmount) > 0);

    const metricCells = (row) => (
        <>
            <td style={{ fontWeight: 700 }}>
                {formatCurrency(row.totalAmount)}
                {row.manual && (
                    <div style={{ color: 'var(--text-light)', fontSize: '12px', fontWeight: 400 }}>
                        {num(row.totalOrders) > 0 ? `incl. ✍️ ${formatCurrency(row.manualAmount)} entered` : '✍️ entered by hand'}
                    </div>
                )}
            </td>
            <td>
                {num(row.actualEntries) > 0 ? (
                    <>
                        <div style={{ fontWeight: 600 }}>{formatCurrency(row.actualTotal)}</div>
                        <div style={{ color: 'var(--text-light)', fontSize: '12px' }}>
                            💵 {formatCurrency(row.actualCash)} · 📱 {formatCurrency(row.actualUpi)}
                        </div>
                        {num(row.actualEntries) < num(row.actualSlots) && (
                            <div style={{ color: 'var(--text-light)', fontSize: '12px' }}>
                                {num(row.actualEntries)} of {num(row.actualSlots)} entered
                            </div>
                        )}
                        {row.actualNote && (
                            <div style={{ color: 'var(--text-light)', fontSize: '12px', maxWidth: '180px' }}>📝 {row.actualNote}</div>
                        )}
                    </>
                ) : num(row.actualSlots) > 0 ? (
                    <span style={{ color: 'var(--text-light)' }}>Not entered</span>
                ) : '-'}
                {/* Hand-entered branches: sales and received are entered together on Manual Sales Entry */}
                {!compact && row.editable && row.manual && (
                    <div>
                        <Link className="btn btn-outline btn-sm" style={{ marginTop: '4px' }} to="/dashboard/daily-sales">Manual Sales Entry</Link>
                    </div>
                )}
                {!compact && row.editable && !row.manual && (num(row.totalOrders) > 0 || num(row.actualEntries) > 0) && (
                    <div>
                        <button className="btn btn-outline btn-sm" style={{ marginTop: '4px' }} onClick={() => openEntry(row)}>
                            {num(row.actualEntries) > 0 ? 'Edit' : 'Enter'}
                        </button>
                    </div>
                )}
            </td>
            <td>
                {num(row.actualEntries) > 0 ? (
                    <>
                        <Difference value={row.difference} />
                        {num(row.difference) !== 0 && !row.manual && (
                            <div style={{ color: 'var(--text-light)', fontSize: '12px' }}>
                                💵 {num(row.cashDifference) < 0 ? '−' : '+'}{formatCurrency(Math.abs(num(row.cashDifference)))}
                                {' · '}📱 {num(row.upiDifference) < 0 ? '−' : '+'}{formatCurrency(Math.abs(num(row.upiDifference)))}
                            </div>
                        )}
                    </>
                ) : '-'}
            </td>
            <td>{num(row.shots)}</td>
            <td>{num(row.blends)}</td>
            <td>{num(row.totalOrders)}</td>
            <td>💵 {formatCurrency(row.cashAmount)}</td>
            <td>📱 {formatCurrency(row.upiAmount)}</td>
            {showCancelled && (
                <td>
                    {num(row.cancelledOrders) > 0
                        ? <span className="badge badge-danger">{num(row.cancelledOrders)} · {formatCurrency(row.cancelledAmount)}</span>
                        : '-'}
                </td>
            )}
        </>
    );

    const tableHead = (firstColumn) => (
        <thead>
            <tr>
                <th>{firstColumn}</th>
                <th>Total</th>
                <th>Received</th>
                <th>Difference</th>
                <th>Shots</th>
                <th>Blends</th>
                <th>Orders</th>
                <th>Cash</th>
                <th>UPI</th>
                {showCancelled && <th>Cancelled</th>}
            </tr>
        </thead>
    );

    if (loading && !data) return <div className="loading"><div className="spinner"></div></div>;

    return (
        <div>
            {!compact && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '16px' }}>Period</h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>From</label>
                            <input type="date" className="form-control" value={from} max={to}
                                onChange={e => setFrom(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>To</label>
                            <input type="date" className="form-control" value={to} min={from}
                                onChange={e => setTo(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Branch</label>
                            <select className="form-control" value={shopId} onChange={e => setShopId(e.target.value)}>
                                <option value="">All branches</option>
                                {shops.map(shop => (
                                    <option key={shop.id} value={shop.id}>{shop.name}</option>
                                ))}
                            </select>
                        </div>
                        <button className="btn btn-primary" disabled={loading}
                            onClick={() => fetchCollection(from, to, shopId)}>
                            {loading ? 'Loading...' : 'Apply'}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => setPreset('today')}>Today</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setPreset('yesterday')}>Yesterday</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setPreset('month')}>This month</button>
                    </div>
                </div>
            )}

            {totals && (
                <div className="stats-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '16px',
                    marginBottom: compact ? '16px' : '24px',
                }}>
                    <div className="stat-card">
                        <div className="stat-label">Cash Collected</div>
                        <div className="stat-value">{formatCurrency(totals.cashAmount)}</div>
                        <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>{orderCount(totals.cashOrders)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">UPI Collected</div>
                        <div className="stat-value">{formatCurrency(totals.upiAmount)}</div>
                        <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>{orderCount(totals.upiOrders)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Total Collected</div>
                        <div className="stat-value">{formatCurrency(totals.totalAmount)}</div>
                        <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>{orderCount(totals.totalOrders)}</div>
                    </div>
                    {num(totals.actualSlots) > 0 && (
                        <div className="stat-card">
                            <div className="stat-label">Received vs Expected</div>
                            <div className="stat-value">
                                {num(totals.actualEntries) > 0 ? <Difference value={totals.difference} /> : '-'}
                            </div>
                            <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>
                                {num(totals.actualEntries)} of {num(totals.actualSlots)} {num(totals.actualSlots) === 1 ? 'day' : 'branch-days'} entered
                            </div>
                        </div>
                    )}
                    <div className="stat-card">
                        <div className="stat-label">Shots</div>
                        <div className="stat-value">{num(totals.shots)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Blends</div>
                        <div className="stat-value">{num(totals.blends)}</div>
                    </div>
                </div>
            )}

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>
                        {compact ? "Today's Collection by Branch" : 'Collection by Branch'}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {!compact && data && (
                            <span style={{ color: 'var(--text-light)', fontSize: '13px' }}>
                                {data.fromDate === data.toDate ? data.fromDate : `${data.fromDate} to ${data.toDate}`}
                            </span>
                        )}
                        <button className="btn btn-outline btn-sm" disabled={loading}
                            onClick={() => fetchCollection(compact ? today : from, compact ? today : to, compact ? '' : shopId)}>
                            <FiRefreshCw /> Refresh
                        </button>
                        {compact && (
                            <Link className="btn btn-outline btn-sm" to="/dashboard/collections">Reconcile</Link>
                        )}
                    </div>
                </div>

                {hasBranchData ? (
                    <div className="table-wrapper" style={{ marginTop: '12px' }}>
                        <table>
                            {tableHead('Branch')}
                            <tbody>
                                {branches.map(branch => (
                                    <tr key={branch.shopId}>
                                        <td style={{ fontWeight: 500 }}>{branch.shopName}</td>
                                        {metricCells(branch)}
                                    </tr>
                                ))}
                                {branches.length > 1 && totals && (
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                        <td>All branches</td>
                                        {metricCells(totals)}
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-light)', marginTop: '12px' }}>
                        No orders in this period yet.
                    </p>
                )}

                <p style={{ color: 'var(--text-light)', fontSize: '12px', marginTop: '12px' }}>
                    Cash and UPI are counted on every order that was not cancelled, including orders still
                    at the counter, because payment is taken when the order is placed. Amounts include the
                    parcel charge. Shots and blends are units sold, not orders.
                    {!compact && ' Received is what was actually collected, entered per branch per day: pick a single day, or a single branch, to enter it. Difference = received − expected.'}
                </p>
            </div>

            {!compact && days.length > 1 && (
                <div className="card" style={{ marginTop: '24px' }}>
                    <h3 style={{ marginBottom: '12px' }}>Day by Day</h3>
                    <div className="table-wrapper">
                        <table>
                            {tableHead('Date')}
                            <tbody>
                                {days.map(day => (
                                    <tr key={day.date}>
                                        <td style={{ fontWeight: 500 }}>{day.date}</td>
                                        {metricCells(day)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Modal isOpen={!!entry} onClose={() => !saving && setEntry(null)}
                title={entry ? `Amount received · ${entry.shopName} · ${entry.date}` : ''}>
                {entry && (() => {
                    const diffCash = entry.actualCash === '' ? null : Number(entry.actualCash) - entry.expectedCash;
                    const diffUpi = entry.actualUpi === '' ? null : Number(entry.actualUpi) - entry.expectedUpi;
                    return (
                        <>
                            <div className="form-group">
                                <label>💵 Cash received (expected {formatCurrency(entry.expectedCash)})</label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" className="form-control"
                                    value={entry.actualCash} autoFocus
                                    onChange={e => setEntry({ ...entry, actualCash: e.target.value })} />
                                {diffCash !== null && <small><Difference value={diffCash} /></small>}
                            </div>
                            <div className="form-group">
                                <label>📱 UPI received (expected {formatCurrency(entry.expectedUpi)})</label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" className="form-control"
                                    value={entry.actualUpi}
                                    onChange={e => setEntry({ ...entry, actualUpi: e.target.value })} />
                                {diffUpi !== null && <small><Difference value={diffUpi} /></small>}
                            </div>
                            <div className="form-group">
                                <label>Note (optional)</label>
                                <textarea className="form-control" rows="2" maxLength={500} value={entry.note}
                                    placeholder="e.g. ₹50 short in change, UPI paid twice"
                                    onChange={e => setEntry({ ...entry, note: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                {entry.existing && (
                                    <button className="btn btn-danger" disabled={saving} onClick={removeEntry}>Remove</button>
                                )}
                                <button className="btn btn-outline" disabled={saving} onClick={() => setEntry(null)}>Cancel</button>
                                <button className="btn btn-primary" disabled={saving} onClick={saveEntry}>
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </>
                    );
                })()}
            </Modal>
        </div>
    );
};

export default DailyCollectionWidget;
