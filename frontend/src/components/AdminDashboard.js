import React, { useState, useEffect, useCallback } from 'react';
import { dashboardService } from '../services/dataService';
import { formatCurrency } from '../utils/helpers';
import DailyCollectionWidget from './DailyCollectionWidget';
import { Bar, Line } from 'react-chartjs-2';
import { FiRefreshCw, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import toast from 'react-hot-toast';

const PURPLE = 'rgba(124, 58, 237, 0.75)';
const AMBER = 'rgba(245, 158, 11, 0.8)';

const num = (value) => Number(value || 0);

/** Hour of day as a label a person reads, e.g. 14 -> "2 PM". */
const hourLabel = (hour) => {
    const suffix = hour < 12 ? 'AM' : 'PM';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h} ${suffix}`;
};

/** Percentage change, or null when there is no baseline to compare against. */
const delta = (current, previous) => {
    const now = num(current);
    const before = num(previous);
    if (before === 0) return now === 0 ? 0 : null;
    return ((now - before) / before) * 100;
};

const DeltaBadge = ({ current, previous, label }) => {
    const change = delta(current, previous);
    if (change === null) {
        return <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>No {label} to compare</div>;
    }
    const flat = Math.abs(change) < 0.5;
    const up = change > 0;
    const color = flat ? 'var(--text-light)' : up ? 'var(--success)' : 'var(--danger)';
    return (
        <div style={{ color, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {!flat && (up ? <FiArrowUp size={13} /> : <FiArrowDown size={13} />)}
            {flat ? 'Level with' : `${Math.abs(change).toFixed(0)}% ${up ? 'up on' : 'down on'}`} {label}
        </div>
    );
};

const StatCard = ({ label, value, children }) => (
    <div className="stat-card">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {children}
    </div>
);

const AdminDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchOverview = useCallback(async () => {
        setLoading(true);
        try {
            const res = await dashboardService.getOverview();
            setData(res.data.data);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOverview(); }, [fetchOverview]);

    if (loading && !data) return <div className="loading"><div className="spinner"></div></div>;
    if (!data) return <div className="empty-state"><div className="icon">📊</div><p>No data available</p></div>;

    const { today, yesterday, monthToDate, previousMonthToDate, peakHours, peakHourDays,
        dailyTrend, monthlyTrend, topSellersToday, branchesToday, lowStockAlerts } = data;

    // Only the hours the counter actually trades in, so the chart is not mostly
    // empty midnights. Falls back to the full day before the first sale lands.
    // Always show at least a 9 AM - 9 PM band, widened to cover any trade outside
    // it, so a quiet day does not collapse the chart to a single bar.
    const traded = (peakHours || []).filter(h => num(h.orders) > 0);
    const tradedHours = traded.map(h => h.hour);
    const firstHour = Math.max(0, Math.min(9, ...tradedHours.map(h => h - 1)));
    const lastHour = Math.min(23, Math.max(21, ...tradedHours.map(h => h + 1)));
    const shownHours = (peakHours || []).filter(h => h.hour >= firstHour && h.hour <= lastHour);

    const peakData = {
        labels: shownHours.map(h => hourLabel(h.hour)),
        datasets: [{
            label: 'Sales',
            data: shownHours.map(h => num(h.sales)),
            backgroundColor: PURPLE,
            borderRadius: 6,
        }],
    };

    const trendData = {
        labels: (dailyTrend || []).map(d => d.date.slice(5)),
        datasets: [{
            label: 'Sales',
            data: (dailyTrend || []).map(d => num(d.sales)),
            borderColor: 'rgb(124, 58, 237)',
            backgroundColor: 'rgba(124, 58, 237, 0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
        }],
    };

    const monthlyData = {
        labels: (monthlyTrend || []).map(m => m.month),
        datasets: [{
            label: 'Sales',
            data: (monthlyTrend || []).map(m => num(m.sales)),
            backgroundColor: AMBER,
            borderRadius: 6,
        }],
    };

    const sellersData = {
        labels: (topSellersToday || []).map(p => p.productName),
        datasets: [{
            label: 'Units',
            data: (topSellersToday || []).map(p => num(p.quantity)),
            backgroundColor: PURPLE,
            borderRadius: 6,
        }],
    };

    // Without maintainAspectRatio a wide card gives a chart half the screen tall.
    const moneyAxis = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => `₹${v}` } } },
    };

    return (
        <div>
            <div className="page-header">
                <h1>Admin Dashboard</h1>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-light)', fontSize: '13px', whiteSpace: 'nowrap' }}>{data.date}</span>
                    <button className="btn btn-outline btn-sm" onClick={fetchOverview} disabled={loading}>
                        <FiRefreshCw /> Refresh
                    </button>
                </div>
            </div>

            {/* Today first - what the owner checks before anything else */}
            <div className="stats-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
            }}>
                <StatCard label="Today's Sales" value={formatCurrency(today?.sales)}>
                    <DeltaBadge current={today?.sales} previous={yesterday?.sales} label="yesterday" />
                </StatCard>
                <StatCard label="Today's Orders" value={num(today?.orders)}>
                    <DeltaBadge current={today?.orders} previous={yesterday?.orders} label="yesterday" />
                </StatCard>
                <StatCard label="Avg Order Value" value={formatCurrency(today?.averageOrderValue)}>
                    <DeltaBadge current={today?.averageOrderValue} previous={yesterday?.averageOrderValue} label="yesterday" />
                </StatCard>
                <StatCard label="Cups Sold Today" value={num(today?.units)}>
                    <div style={{ color: 'var(--text-light)', fontSize: '13px' }}>shots and blends</div>
                </StatCard>
                <StatCard label="Month to Date" value={formatCurrency(monthToDate?.sales)}>
                    <DeltaBadge current={monthToDate?.sales} previous={previousMonthToDate?.sales} label="last month" />
                </StatCard>
            </div>

            <div className="grid-2">
                <div className="card">
                    <h3 style={{ marginBottom: '4px' }}>Peak Hours</h3>
                    <p style={{ color: 'var(--text-light)', fontSize: '12px', marginBottom: '12px' }}>
                        Sales by hour over the last {peakHourDays} days — staff and prep around the rush.
                    </p>
                    {traded.length > 0
                        ? <div style={{ height: '260px' }}><Bar data={peakData} options={moneyAxis} /></div>
                        : <p style={{ color: 'var(--text-light)' }}>No sales in the last {peakHourDays} days yet</p>}
                </div>
                <div className="card">
                    <h3 style={{ marginBottom: '4px' }}>Top Sellers Today</h3>
                    <p style={{ color: 'var(--text-light)', fontSize: '12px', marginBottom: '12px' }}>
                        Units sold today, best first.
                    </p>
                    {topSellersToday?.length > 0 ? (
                        <div style={{ height: '260px' }}>
                            <Bar data={sellersData} options={{
                                indexAxis: 'y',
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
                            }} />
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-light)' }}>Nothing sold yet today</p>
                    )}
                </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '12px' }}>Last 30 Days</h3>
                <div style={{ height: '280px' }}><Line data={trendData} options={moneyAxis} /></div>
            </div>

            {/* Cash vs UPI per branch, the figures the till is reconciled against */}
            <div style={{ marginBottom: '24px' }}>
                <DailyCollectionWidget compact />
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '12px' }}>Branches Today</h3>
                {branchesToday?.length > 0 ? (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th><th>Branch</th><th>Sales</th><th>Orders</th><th>Avg Order</th>
                                </tr>
                            </thead>
                            <tbody>
                                {branchesToday.map((branch, i) => (
                                    <tr key={branch.shopId}>
                                        <td style={{ color: 'var(--text-light)' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 500 }}>{branch.shopName}</td>
                                        <td style={{ fontWeight: 700 }}>{formatCurrency(branch.sales)}</td>
                                        <td>{num(branch.orders)}</td>
                                        <td>{formatCurrency(branch.averageOrderValue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-light)' }}>No branches yet</p>
                )}
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '12px' }}>Last 12 Months</h3>
                <div style={{ height: '280px' }}><Bar data={monthlyData} options={moneyAxis} /></div>
            </div>

            {lowStockAlerts?.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--danger)' }}>⚠️ Low Stock Alerts</h3>
                    <div className="table-wrapper">
                        <table>
                            <thead><tr><th>Branch</th><th>Material</th><th>Current</th><th>Threshold</th></tr></thead>
                            <tbody>
                                {lowStockAlerts.map((alert, i) => (
                                    <tr key={i}>
                                        <td>{alert.shopName}</td>
                                        <td>{alert.rawMaterialName}</td>
                                        <td><span className="badge badge-danger">{alert.currentQuantity}</span></td>
                                        <td>{alert.threshold}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <p style={{ color: 'var(--text-light)', fontSize: '12px', marginTop: '16px' }}>
                Sales here count every order that was not cancelled, including orders still at the counter,
                so these figures match the collection widget and the till. The Reports page counts delivered
                orders only, so its revenue reads lower.
            </p>
        </div>
    );
};

export default AdminDashboard;
