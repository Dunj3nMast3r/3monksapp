import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminService, dashboardService } from '../services/dataService';
import { formatCurrency, getISTDateString } from '../utils/helpers';
import { FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';

const num = (value) => Number(value || 0);
const orderCount = (value) => `${num(value)} ${num(value) === 1 ? 'order' : 'orders'}`;

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

    const fetchCollection = useCallback(async (fromDate, toDate, branch) => {
        setLoading(true);
        try {
            const res = await dashboardService.getDailyCollection(fromDate, toDate, branch);
            setData(res.data.data);
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
        const d = new Date();
        if (preset === 'yesterday') d.setDate(d.getDate() - 1);
        const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const nextFrom = preset === 'month' ? today.slice(0, 7) + '-01' : day;
        const nextTo = preset === 'month' ? today : day;
        setFrom(nextFrom);
        setTo(nextTo);
        fetchCollection(nextFrom, nextTo, shopId);
    };

    const totals = data?.totals;
    const branches = data?.branches || [];
    const days = data?.days || [];
    const showCancelled = num(totals?.cancelledOrders) > 0;
    const hasBranchData = branches.some(b => num(b.totalOrders) > 0 || num(b.cancelledOrders) > 0);

    const metricCells = (row) => (
        <>
            <td>{num(row.shots)}</td>
            <td>{num(row.blends)}</td>
            <td>{num(row.totalOrders)}</td>
            <td>💵 {formatCurrency(row.cashAmount)}</td>
            <td>📱 {formatCurrency(row.upiAmount)}</td>
            <td style={{ fontWeight: 700 }}>{formatCurrency(row.totalAmount)}</td>
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
                <th>Shots</th>
                <th>Blends</th>
                <th>Orders</th>
                <th>Cash</th>
                <th>UPI</th>
                <th>Total</th>
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
        </div>
    );
};

export default DailyCollectionWidget;
