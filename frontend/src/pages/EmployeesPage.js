import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';
import { formatCurrency, getISTMonthString, roleLabels } from '../utils/helpers';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const STATION_OPTIONS = [
    { value: '', label: 'Both stations' },
    { value: 'SHOT', label: '⚡ Shots' },
    { value: 'BLEND', label: '🥤 Blends' },
];
const STATION_LABELS = { SHOT: '⚡ Shots', BLEND: '🥤 Blends' };

const EMPTY_FORM = {
    loginMode: 'new', userId: '', fullName: '', username: '', password: '', email: '', phone: '',
    shopId: '', role: 'SHOP_OPERATOR', station: '', salary: '', incentivePercentage: '',
};

const EmployeesPage = () => {
    const [employees, setEmployees] = useState([]);
    const [users, setUsers] = useState([]);
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showSalary, setShowSalary] = useState(false);
    const [editing, setEditing] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [salaryMonth, setSalaryMonth] = useState(getISTMonthString());
    const [salarySheet, setSalarySheet] = useState(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        try {
            const [empRes, userRes, shopRes] = await Promise.all([
                adminService.getEmployees(),
                adminService.getUsers(),
                adminService.getShops()
            ]);
            setEmployees(empRes.data.data || []);
            setUsers(userRes.data.data || []);
            setShops(shopRes.data.data || []);
        } catch { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const openAdd = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setErrors({});
        setShowModal(true);
    };

    const openEdit = (e) => {
        setEditing(e);
        setForm({
            ...EMPTY_FORM, userId: e.userId, shopId: e.shopId, role: e.role, station: e.station || '',
            salary: e.salary || '', incentivePercentage: e.incentivePercentage || '',
        });
        setErrors({});
        setShowModal(true);
    };

    const validateForm = () => {
        const errs = {};
        if (!editing && form.loginMode === 'existing' && !form.userId) errs.userId = 'Please select a user';
        if (!editing && form.loginMode === 'new') {
            if (!form.fullName || form.fullName.trim().length < 2) errs.fullName = 'Full name must be at least 2 characters';
            if (!form.username || form.username.trim().length < 3) errs.username = 'Username must be at least 3 characters';
            else if (!/^[a-zA-Z0-9._-]+$/.test(form.username)) errs.username = 'Username can only contain letters, numbers, dots, hyphens, and underscores';
            if (!form.password || form.password.length < 6) errs.password = 'Password must be at least 6 characters';
            if (!form.email) errs.email = 'Email is required';
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Please enter a valid email address';
            if (form.phone && !/^[0-9]{10}$/.test(form.phone)) errs.phone = 'Phone number must be exactly 10 digits';
        }
        if (!form.shopId) errs.shopId = 'Please select a shop';
        if (!form.role) errs.role = 'Please select a role';
        if (!form.salary) errs.salary = 'Salary is required';
        else if (isNaN(form.salary) || parseFloat(form.salary) < 1) errs.salary = 'Salary must be at least ₹1';
        else if (parseFloat(form.salary) > 9999999.99) errs.salary = 'Salary cannot exceed ₹99,99,999.99';
        if (form.incentivePercentage && (isNaN(form.incentivePercentage) || parseFloat(form.incentivePercentage) < 0)) errs.incentivePercentage = 'Incentive cannot be negative';
        if (form.incentivePercentage && parseFloat(form.incentivePercentage) > 100) errs.incentivePercentage = 'Incentive cannot exceed 100%';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        if (!validateForm()) return;
        setSubmitting(true);
        try {
            const data = {
                shopId: parseInt(form.shopId),
                role: form.role,
                station: form.role === 'SHOP_OPERATOR' ? (form.station || null) : null,
                salary: parseFloat(form.salary),
                incentivePercentage: form.incentivePercentage ? parseFloat(form.incentivePercentage) : 0,
            };
            if (!editing && form.loginMode === 'new') {
                data.newUser = {
                    fullName: form.fullName, username: form.username, password: form.password,
                    email: form.email, phone: form.phone,
                };
            } else if (!editing) {
                data.userId = parseInt(form.userId);
            }
            if (editing) { await adminService.updateEmployee(editing.id, data); toast.success('Employee updated'); }
            else { await adminService.createEmployee(data); toast.success('Employee created'); }
            setShowModal(false); fetchAll();
        } catch (err) {
            const resp = err.response?.data;
            if (resp?.data && typeof resp.data === 'object' && resp.message === 'Validation failed') {
                // New-login field errors come back as newUser.<field>
                setErrors(Object.fromEntries(Object.entries(resp.data).map(([k, v]) => [k.replace(/^newUser\./, ''), v])));
                const firstError = Object.values(resp.data)[0];
                toast.error(firstError || 'Please fix the errors below');
            } else {
                toast.error(resp?.message || 'Failed to save employee');
            }
        } finally { setSubmitting(false); }
    };

    const handleToggle = async (id) => {
        try { await adminService.toggleEmployee(id); toast.success('Status toggled'); fetchAll(); }
        catch { toast.error('Failed'); }
    };

    const fetchSalarySheet = async () => {
        try {
            const res = await adminService.getSalarySheet(null, salaryMonth);
            setSalarySheet(res.data.data);
            setShowSalary(true);
        } catch (err) { toast.error('Failed to load salary sheet'); }
    };

    // Logins that can still be registered: not already employees, not admins
    const existingUserIds = employees.map(e => e.userId);
    const availableUsers = users.filter(u => u.active && u.role !== 'SUPER_ADMIN' && !existingUserIds.includes(u.id));
    const field = (key) => ({
        className: `form-control${errors[key] ? ' input-error' : ''}`,
        value: form[key],
        onChange: (e) => { setForm({ ...form, [key]: e.target.value }); setErrors(prev => ({ ...prev, [key]: '' })); },
    });
    const fieldError = (key) => errors[key] && <span className="field-error">{errors[key]}</span>;

    return (
        <div>
            <div className="page-header">
                <h1>Employees</h1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="month" className="form-control" value={salaryMonth} onChange={e => setSalaryMonth(e.target.value)} style={{ width: '160px' }} />
                    <button className="btn btn-outline" onClick={fetchSalarySheet}>Salary Sheet</button>
                    <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
                </div>
            </div>

            {loading ? <div className="loading"><div className="spinner"></div></div> : employees.length === 0 ? (
                <div className="empty-state"><div className="icon">👤</div><p>No employees added yet</p></div>
            ) : (
                <div className="card"><div className="table-wrapper">
                    <table>
                        <thead><tr><th>Name</th><th>Role</th><th>Shop</th><th>Station</th><th>Salary</th><th>Incentive %</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{employees.map(e => (
                            <tr key={e.id}>
                                <td style={{ fontWeight: 500 }}>{e.fullName}</td>
                                <td>{roleLabels[e.role] || e.role}</td>
                                <td>{e.shopName}</td>
                                <td>{e.role === 'SHOP_OPERATOR' ? (STATION_LABELS[e.station] || 'Both') : '-'}</td>
                                <td>{formatCurrency(e.salary)}</td>
                                <td>{e.incentivePercentage}%</td>
                                <td><span className={`badge ${e.active ? 'badge-success' : 'badge-danger'}`}>{e.active ? 'Active' : 'Inactive'}</span></td>
                                <td style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(e)}>Edit</button>
                                    <button className={`btn btn-sm ${e.active ? 'btn-danger' : 'btn-primary'}`} onClick={() => handleToggle(e.id)}>{e.active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div></div>
            )}

            {/* Add/Edit Modal */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Employee' : 'Add Employee'}>
                <form onSubmit={handleSubmit} noValidate>
                    {editing ? (
                        <div className="form-group">
                            <label>Employee</label>
                            <div className="form-static">{editing.fullName} ({editing.userName})</div>
                        </div>
                    ) : (
                        <>
                            <div className="form-group">
                                <label>Login</label>
                                <div className="queue-filter">
                                    {[['new', '➕ Create new login'], ['existing', '👤 Use existing login']].map(([mode, label]) => (
                                        <button type="button" key={mode}
                                            className={`btn btn-sm ${form.loginMode === mode ? 'btn-primary' : 'btn-outline'}`}
                                            onClick={() => { setForm({ ...form, loginMode: mode }); setErrors({}); }}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {form.loginMode === 'existing' ? (
                                <div className="form-group">
                                    <label>User *</label>
                                    <select {...field('userId')}>
                                        <option value="">Select user...</option>
                                        {availableUsers.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>)}
                                    </select>
                                    {fieldError('userId')}
                                    {availableUsers.length === 0 && <span className="field-hint">No logins left to register. Create a new login instead.</span>}
                                </div>
                            ) : (
                                <>
                                    <div className="form-group"><label>Full Name *</label>
                                        <input {...field('fullName')} />{fieldError('fullName')}
                                    </div>
                                    <div className="grid-2">
                                        <div className="form-group"><label>Username *</label>
                                            <input {...field('username')} autoComplete="off" />{fieldError('username')}
                                        </div>
                                        <div className="form-group"><label>Password *</label>
                                            <input {...field('password')} type="password" autoComplete="new-password" />{fieldError('password')}
                                        </div>
                                    </div>
                                    <div className="grid-2">
                                        <div className="form-group"><label>Email *</label>
                                            <input {...field('email')} type="email" />{fieldError('email')}
                                        </div>
                                        <div className="form-group"><label>Phone</label>
                                            <input {...field('phone')} placeholder="10 digits" />{fieldError('phone')}
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                    <div className="grid-2">
                        <div className="form-group">
                            <label>Shop *</label>
                            <select {...field('shopId')}>
                                <option value="">Select shop...</option>
                                {shops.filter(s => s.active || s.id === editing?.shopId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            {fieldError('shopId')}
                        </div>
                        <div className="form-group">
                            <label>Role *</label>
                            <select {...field('role')}>
                                <option value="SHOP_MANAGER">Shop Manager</option>
                                <option value="SHOP_OPERATOR">Shop Operator</option>
                            </select>
                            {fieldError('role')}
                        </div>
                    </div>
                    {form.role === 'SHOP_OPERATOR' && (
                        <div className="form-group">
                            <label>Queue Station</label>
                            <select {...field('station')}>
                                {STATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <span className="form-hint">The operator only sees, and gets alerts for, this station's queue.</span>
                        </div>
                    )}
                    <div className="grid-2">
                        <div className="form-group">
                            <label>Monthly Salary (₹) *</label>
                            <input className={`form-control${errors.salary ? ' input-error' : ''}`} type="number" step="0.01" min="1" max="9999999.99" value={form.salary} onChange={e => { setForm({ ...form, salary: e.target.value }); setErrors(prev => ({ ...prev, salary: '' })); }} placeholder="e.g. 15000" />
                            {errors.salary && <span className="field-error">{errors.salary}</span>}
                        </div>
                        <div className="form-group">
                            <label>Incentive %</label>
                            <input className={`form-control${errors.incentivePercentage ? ' input-error' : ''}`} type="number" step="0.01" min="0" max="100" value={form.incentivePercentage} onChange={e => { setForm({ ...form, incentivePercentage: e.target.value }); setErrors(prev => ({ ...prev, incentivePercentage: '' })); }} placeholder="e.g. 2" />
                            {errors.incentivePercentage && <span className="field-error">{errors.incentivePercentage}</span>}
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? <><span className="btn-spinner"></span> Saving...</> : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Salary Sheet Modal */}
            <Modal isOpen={showSalary} onClose={() => setShowSalary(false)} title={`Salary Sheet - ${salaryMonth}`}>
                {salarySheet ? (
                    <div>
                        <div className="table-wrapper">
                            <table>
                                <thead><tr><th>Name</th><th>Shop</th><th>Base Salary</th><th>Sales</th><th>Orders</th><th>Incentive</th><th>Total Pay</th></tr></thead>
                                <tbody>
                                    {salarySheet.employees?.map((s, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 500 }}>{s.fullName}</td>
                                            <td>{s.shopName}</td>
                                            <td>{formatCurrency(s.baseSalary)}</td>
                                            <td>{formatCurrency(s.totalSalesHandled)}</td>
                                            <td>{s.totalOrders}</td>
                                            <td>{formatCurrency(s.incentiveAmount)}</td>
                                            <td style={{ fontWeight: 600 }}>{formatCurrency(s.totalPay)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot><tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                    <td colSpan={2}>TOTAL</td>
                                    <td>{formatCurrency(salarySheet.totalSalaries)}</td>
                                    <td colSpan={2}></td>
                                    <td>{formatCurrency(salarySheet.totalIncentives)}</td>
                                    <td>{formatCurrency(salarySheet.grandTotal)}</td>
                                </tr></tfoot>
                            </table>
                        </div>
                    </div>
                ) : <p>No data</p>}
            </Modal>
        </div>
    );
};

export default EmployeesPage;
