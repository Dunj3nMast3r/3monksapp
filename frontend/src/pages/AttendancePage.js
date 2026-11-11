import React, { useState, useEffect, useCallback } from 'react';
import { managerService } from '../services/dataService';
import { getISTDateString } from '../utils/helpers';
import toast from 'react-hot-toast';

const STATUSES = [
    { key: 'PRESENT', label: 'Present', short: 'P', icon: '✅' },
    { key: 'HALF_DAY', label: 'Half day', short: '½', icon: '🌗' },
    { key: 'LEAVE', label: 'Leave', short: 'L', icon: '🏖️' },
    { key: 'ABSENT', label: 'Absent', short: 'A', icon: '❌' },
    { key: 'WEEK_OFF', label: 'Week off', short: 'W', icon: '💤' },
];
const BY_KEY = Object.fromEntries(STATUSES.map(s => [s.key, s]));
// Leave and week off can be planned ahead; the rest only for today or earlier
const PLANNABLE = ['LEAVE', 'WEEK_OFF'];
// Paid leave used by each status (week off uses none)
const LEAVE_USE = { LEAVE: 1, HALF_DAY: 0.5 };
const fmt = (n) => Number(n).toString();

const shiftDay = (date, n) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const prettyDay = (date) => new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Staff attendance: a daily register (Present / Half day / Leave / Absent / Week off,
 * per employee) and a monthly summary. Managers see their own branch, admins any branch.
 */
const AttendancePage = () => {
    const today = getISTDateString();
    const [shops, setShops] = useState(null);
    const [shopId, setShopId] = useState('');
    const [tab, setTab] = useState('day');

    // Daily register
    const [date, setDate] = useState(today);
    const [rows, setRows] = useState([]);
    const [edits, setEdits] = useState({});      // employeeId -> { status, note }
    const [loadingDay, setLoadingDay] = useState(false);
    const [saving, setSaving] = useState(false);

    // Monthly summary
    const [month, setMonth] = useState(today.slice(0, 7));
    const [monthData, setMonthData] = useState(null);
    const [loadingMonth, setLoadingMonth] = useState(false);

    useEffect(() => {
        managerService.getAttendanceShops()
            .then(res => {
                const list = res.data.data || [];
                setShops(list);
                if (list.length > 0) setShopId(String(list[0].id));
            })
            .catch(() => setShops([]));
    }, []);

    const loadDay = useCallback(async () => {
        if (!shopId) return;
        setLoadingDay(true);
        try {
            const res = await managerService.getAttendance(shopId, date);
            setRows(res.data.data.employees || []);
            setEdits({});
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load attendance');
        } finally {
            setLoadingDay(false);
        }
    }, [shopId, date]);

    const loadMonth = useCallback(async () => {
        if (!shopId) return;
        setLoadingMonth(true);
        try {
            const res = await managerService.getAttendanceMonth(shopId, month);
            setMonthData(res.data.data);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load the month');
        } finally {
            setLoadingMonth(false);
        }
    }, [shopId, month]);

    useEffect(() => { if (tab === 'day') loadDay(); }, [tab, loadDay]);
    useEffect(() => { if (tab === 'month') loadMonth(); }, [tab, loadMonth]);

    const isFuture = date > today;
    const current = (r) => (r.employeeId in edits ? edits[r.employeeId] : { status: r.status, note: r.note || '' });
    const changedIds = Object.keys(edits).filter(id => {
        const r = rows.find(x => String(x.employeeId) === id);
        const e = edits[id];
        return r && (e.status !== r.status || (e.note || '') !== (r.note || ''));
    });

    // Leave left for the month of this day, counting the unsaved change (negative = extra leave)
    const leaveLeft = (r, status) => {
        const lb = r.leaveBalance;
        if (!lb) return null;
        const saved = Number(lb.balance) - Number(lb.extra);
        return saved - ((LEAVE_USE[status] || 0) - (LEAVE_USE[r.status] || 0));
    };

    const setStatus = (r, status) => {
        if (isFuture && status && !PLANNABLE.includes(status)) {
            toast.error('For a future date only Leave or Week off can be marked');
            return;
        }
        const c = current(r);
        // Tapping the selected status again clears it (back to "not marked")
        const next = c.status === status ? null : status;
        const left = leaveLeft(r, next);
        if (left !== null && left < 0 && (LEAVE_USE[next] || 0) > (LEAVE_USE[c.status] || 0)) {
            toast(`${r.name} has no paid leave left this month; this will count as extra leave`, { icon: '⚠️', duration: 5000 });
        }
        setEdits({ ...edits, [r.employeeId]: { ...c, status: next } });
    };
    const setNote = (r, note) => setEdits({ ...edits, [r.employeeId]: { ...current(r), note } });

    const markAllPresent = () => {
        const next = { ...edits };
        rows.filter(r => r.active && !current(r).status).forEach(r => { next[r.employeeId] = { ...current(r), status: 'PRESENT' }; });
        setEdits(next);
    };

    const save = async () => {
        if (changedIds.length === 0) return;
        setSaving(true);
        try {
            await managerService.saveAttendance({
                shopId: Number(shopId), date,
                entries: changedIds.map(id => ({ employeeId: Number(id), status: edits[id].status, note: edits[id].note })),
            });
            toast.success(`Saved ${changedIds.length} ${changedIds.length === 1 ? 'change' : 'changes'}`);
            loadDay();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const goToDay = (d) => {
        if (changedIds.length > 0 && !window.confirm('You have unsaved changes. Leave this day without saving?')) return;
        setDate(d);
    };

    if (shops === null) return <div className="loading"><div className="spinner"></div></div>;
    if (shops.length === 0) {
        return (
            <div>
                <div className="page-header"><h1>Attendance</h1></div>
                <div className="card empty-state"><div className="icon">🗓️</div><p>You are not assigned to a branch.</p></div>
            </div>
        );
    }

    const counts = STATUSES.map(s => ({ ...s, n: rows.filter(r => current(r).status === s.key).length }));
    const notMarked = rows.filter(r => r.active && !current(r).status).length;
    const monthDays = monthData ? Array.from({ length: Number(monthData.to.slice(8)) }, (_, i) => `${monthData.month}-${String(i + 1).padStart(2, '0')}`) : [];

    return (
        <div>
            <div className="page-header"><h1>Attendance</h1></div>

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
                    <div className="stock-modes" style={{ margin: 0 }}>
                        <button className={`btn btn-sm ${tab === 'day' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('day')}>Daily register</button>
                        <button className={`btn btn-sm ${tab === 'month' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('month')}>Monthly summary</button>
                    </div>
                </div>
                {shops.length === 1 && <p className="form-hint" style={{ marginBottom: 0 }}><strong>{shops[0].name}</strong></p>}
            </div>

            {tab === 'day' && (
                <>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => goToDay(shiftDay(date, -1))} aria-label="Previous day">◀</button>
                            <input type="date" className="form-control" style={{ width: 'auto' }} value={date} onChange={e => e.target.value && goToDay(e.target.value)} />
                            <button className="btn btn-outline btn-sm" onClick={() => goToDay(shiftDay(date, 1))} aria-label="Next day">▶</button>
                            {date !== today && <button className="btn btn-outline btn-sm" onClick={() => goToDay(today)}>Today</button>}
                        </div>
                        <p className="form-hint" style={{ marginBottom: 0 }}>
                            {prettyDay(date)}{isFuture && ' · future date: only Leave or Week off can be marked'}
                        </p>
                        <div className="attendance-counts">
                            {counts.map(c => <span key={c.key}>{c.icon} {c.label} <strong>{c.n}</strong></span>)}
                            <span>⬜ Not marked <strong>{notMarked}</strong></span>
                        </div>
                    </div>

                    <div className="card">
                        {loadingDay ? <div className="loading"><div className="spinner"></div></div> : rows.length === 0 ? (
                            <div className="empty-state"><div className="icon">👥</div><p>No employees in this branch yet. Register them under Employees.</p></div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <span className="form-hint" style={{ margin: 0 }}>Tap a status to mark it; tap it again to clear.</span>
                                    {!isFuture && notMarked > 0 && (
                                        <button className="btn btn-outline btn-sm" onClick={markAllPresent}>✅ Mark all unmarked present</button>
                                    )}
                                </div>
                                <div className="attendance-list">
                                    {rows.map(r => {
                                        const c = current(r);
                                        const changed = changedIds.includes(String(r.employeeId));
                                        return (
                                            <div key={r.employeeId} className={`attendance-row${changed ? ' attendance-row-changed' : ''}`}>
                                                <div className="attendance-person">
                                                    <strong>{r.name}</strong>
                                                    <span className="attendance-role">{r.role}{!r.active && ' · no longer here'}</span>
                                                    {!c.status && <span className="badge" style={{ marginLeft: '6px' }}>Not marked</span>}
                                                    {(() => {
                                                        const left = leaveLeft(r, c.status);
                                                        if (left === null) return null;
                                                        return left < 0
                                                            ? <span className="attendance-leave-left attendance-leave-over">⚠️ {fmt(-left)} extra leave</span>
                                                            : <span className="attendance-leave-left">🏖️ {fmt(left)} paid leave left</span>;
                                                    })()}
                                                </div>
                                                <div className="attendance-statuses">
                                                    {STATUSES.map(s => (
                                                        <button key={s.key} type="button"
                                                            className={`attendance-chip attendance-${s.key.toLowerCase()}${c.status === s.key ? ' selected' : ''}`}
                                                            disabled={isFuture && !PLANNABLE.includes(s.key)}
                                                            onClick={() => setStatus(r, s.key)}>
                                                            {s.icon} {s.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input className="form-control attendance-note" maxLength={300} placeholder="Note (optional)"
                                                    value={c.note || ''} onChange={e => setNote(r, e.target.value)} />
                                                {r.markedBy && !changed && (
                                                    <span className="attendance-role">Marked by {r.markedBy}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {changedIds.length > 0 && (
                        <div className="stock-save-bar">
                            <span>{changedIds.length} unsaved {changedIds.length === 1 ? 'change' : 'changes'}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-outline btn-sm" disabled={saving} onClick={() => setEdits({})}>Undo</button>
                                <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {tab === 'month' && (
                <>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label>Month</label>
                                <input type="month" className="form-control" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} />
                            </div>
                        </div>
                        <p className="form-hint" style={{ marginBottom: 0 }}>
                            "Not marked" counts days up to today with no entry.
                            {monthData?.monthlyLeaves
                                ? ` Paid leave: ${fmt(monthData.monthlyLeaves)} a month from the joining date; unused leave carries over (at most 6); a half day uses 0.5.`
                                : ' Paid leave balance is off for this branch (set "Paid leaves per month" in Shops → Edit).'}
                        </p>
                    </div>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        {loadingMonth || !monthData ? <div className="loading"><div className="spinner"></div></div> : monthData.employees.length === 0 ? (
                            <div className="empty-state"><div className="icon">👥</div><p>No employees in this branch.</p></div>
                        ) : (
                            <div className="table-wrapper">
                                <table>
                                    <thead><tr><th>Employee</th><th title="Present">✅</th><th title="Half day">🌗</th><th title="Leave">🏖️</th><th title="Absent">❌</th><th title="Week off">💤</th><th title="Not marked">⬜</th>
                                    </tr></thead>
                                    <tbody>
                                        {monthData.employees.map(r => (
                                            <tr key={r.employeeId}>
                                                <td style={{ fontWeight: 500 }}>{r.name}<div className="attendance-role">{r.role}</div></td>
                                                <td>{r.present}</td><td>{r.halfDay}</td><td>{r.leave}</td><td>{r.absent}</td><td>{r.weekOff}</td>
                                                <td style={{ color: r.notMarked ? 'var(--danger, #991b1b)' : undefined, fontWeight: r.notMarked ? 600 : undefined }}>{r.notMarked}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {monthData && monthData.monthlyLeaves && monthData.employees.length > 0 && (
                        <div className="card" style={{ marginBottom: '16px' }}>
                            <h3 style={{ marginTop: 0 }}>Paid leave</h3>
                            <div className="table-wrapper">
                                <table>
                                    <thead><tr><th>Employee</th><th title="Carried from last month (at most 6)">Carried</th><th title="Added this month">+Month</th><th title="Leave used (half day = 0.5)">Used</th><th title="Paid leave left">Left</th><th title="Leave taken beyond the balance">Extra</th></tr></thead>
                                    <tbody>
                                        {monthData.employees.map(r => (
                                            <tr key={r.employeeId}>
                                                <td style={{ fontWeight: 500 }}>{r.name}</td>
                                                {r.leaveBalance ? (
                                                    <>
                                                        <td>{fmt(r.leaveBalance.opening)}</td>
                                                        <td>{fmt(r.leaveBalance.allocated)}</td>
                                                        <td>{fmt(r.leaveBalance.used)}</td>
                                                        <td style={{ fontWeight: 700 }}>{fmt(r.leaveBalance.balance)}</td>
                                                        <td style={{ color: Number(r.leaveBalance.extra) ? 'var(--danger, #991b1b)' : undefined, fontWeight: Number(r.leaveBalance.extra) ? 700 : undefined }}>{fmt(r.leaveBalance.extra)}</td>
                                                    </>
                                                ) : <td colSpan={5} style={{ color: 'var(--text-light)' }}>joined later</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {monthData && monthData.employees.length > 0 && (
                        <div className="card">
                            <h3 style={{ marginTop: 0 }}>Day by day</h3>
                            <div className="attendance-legend">
                                {STATUSES.map(s => <span key={s.key} className={`attendance-cell attendance-${s.key.toLowerCase()}`}>{s.short}</span>)}
                                <span className="form-hint" style={{ margin: 0 }}>P present · ½ half day · L leave · A absent · W week off · tap a day to open it</span>
                            </div>
                            <div className="table-wrapper">
                                <table className="attendance-grid">
                                    <thead><tr><th>Employee</th>{monthDays.map(d => <th key={d}>{Number(d.slice(8))}</th>)}</tr></thead>
                                    <tbody>
                                        {monthData.employees.map(r => (
                                            <tr key={r.employeeId}>
                                                <td className="attendance-grid-name">{r.name}</td>
                                                {monthDays.map(d => {
                                                    const st = r.days[d];
                                                    return (
                                                        <td key={d}>
                                                            <button type="button" className={`attendance-cell ${st ? `attendance-${st.toLowerCase()}` : r.markFrom && d >= r.markFrom && d <= today ? 'attendance-missing' : ''}`}
                                                                title={`${d}: ${st ? BY_KEY[st].label : 'not marked'}`}
                                                                onClick={() => { setDate(d); setTab('day'); }}>
                                                                {st ? BY_KEY[st].short : ''}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
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

export default AttendancePage;
