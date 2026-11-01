import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/dataService';
import { roleLabels } from '../utils/helpers';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const EMPTY_FORM = { fullName: '', username: '', password: '', email: '', phone: '', role: 'SHOP_OPERATOR', shopId: '', station: '' };
const STATION_LABELS = { SHOT: '⚡ Shots', BLEND: '🥤 Blends' };

const UsersPage = () => {
    const { user: me } = useAuth();
    const [users, setUsers] = useState([]);
    const [shops, setShops] = useState([]);
    const [editing, setEditing] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        Promise.all([adminService.getUsers(), adminService.getShops()])
            .then(([uRes, sRes]) => { setUsers(uRes.data.data || []); setShops(sRes.data.data || []); })
            .catch(() => toast.error('Failed'))
            .finally(() => setLoading(false));
    }, []);

    const fetchUsers = async () => { const res = await adminService.getUsers(); setUsers(res.data.data || []); };

    const openAdd = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setErrors({});
        setShowModal(true);
    };

    const openEdit = (u) => {
        setEditing(u);
        setForm({
            fullName: u.fullName, username: u.username, password: '', email: u.email, phone: u.phone || '',
            role: u.role, shopId: u.shopId || '', station: u.station || '',
        });
        setErrors({});
        setShowModal(true);
    };

    const isSelf = editing && editing.username === me?.username;

    const validateForm = () => {
        const errs = {};
        if (!form.fullName || form.fullName.trim().length < 2) errs.fullName = 'Full name must be at least 2 characters';
        if (form.fullName && form.fullName.length > 100) errs.fullName = 'Full name cannot exceed 100 characters';
        if (!form.username || form.username.trim().length < 3) errs.username = 'Username must be at least 3 characters';
        if (form.username && form.username.length > 50) errs.username = 'Username cannot exceed 50 characters';
        if (form.username && !/^[a-zA-Z0-9._-]+$/.test(form.username)) errs.username = 'Username can only contain letters, numbers, dots, hyphens, and underscores';
        // On edit the password is optional: blank keeps the current one
        if ((!editing || form.password) && (!form.password || form.password.length < 6)) errs.password = 'Password must be at least 6 characters';
        if (!form.email) errs.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Please enter a valid email address';
        if (form.phone && !/^[0-9]{10}$/.test(form.phone)) errs.phone = 'Phone number must be exactly 10 digits';
        if (!form.role) errs.role = 'Role is required';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;
        setSubmitting(true);
        try {
            if (editing) {
                const branchRole = form.role !== 'SUPER_ADMIN';
                await adminService.updateUser(editing.id, {
                    fullName: form.fullName, username: form.username, email: form.email, phone: form.phone,
                    password: form.password || null,
                    role: form.role,
                    shopId: branchRole && form.shopId ? parseInt(form.shopId, 10) : null,
                    station: form.role === 'SHOP_OPERATOR' ? (form.station || null) : null,
                });
                toast.success('User updated');
            } else {
                const { shopId, station, ...newUser } = form;
                await adminService.createUser(newUser);
                toast.success('User created');
            }
            setShowModal(false);
            fetchUsers();
        } catch (err) {
            const resp = err.response?.data;
            if (resp?.data && typeof resp.data === 'object' && resp.message === 'Validation failed') {
                setErrors(resp.data);
                toast.error(Object.values(resp.data)[0] || 'Please fix the errors below');
            } else {
                toast.error(resp?.message || 'Failed');
            }
        } finally { setSubmitting(false); }
    };

    const handleToggle = async (id) => {
        try { await adminService.toggleUser(id); toast.success('Toggled'); fetchUsers(); }
        catch { toast.error('Failed'); }
    };

    return (
        <div>
            <div className="page-header"><h1>Users</h1><button className="btn btn-primary" onClick={openAdd}>+ Add User</button></div>
            {loading ? <div className="loading"><div className="spinner"></div></div> : (
                <div className="card"><div className="table-wrapper">
                    <table>
                        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Shop</th><th>Station</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{users.map(u => (
                            <tr key={u.id}>
                                <td style={{ fontWeight: 500 }}>{u.fullName}</td>
                                <td>{u.username}</td>
                                <td><span className="badge badge-info">{roleLabels[u.role] || u.role}</span></td>
                                <td>{u.shopName || (u.role === 'SUPER_ADMIN' ? '-' : <span className="badge badge-warning">Not assigned</span>)}</td>
                                <td>{u.role === 'SHOP_OPERATOR' ? (STATION_LABELS[u.station] || 'Both') : '-'}</td>
                                <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                                <td style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(u)}>✏️ Edit</button>
                                    <button className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-primary'}`} onClick={() => handleToggle(u.id)}>{u.active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div></div>
            )}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? `Edit User - ${editing.fullName}` : 'Add User'}>
                <form onSubmit={handleSubmit} noValidate>
                    <div className="form-group"><label>Full Name *</label>
                        <input className={`form-control${errors.fullName ? ' input-error' : ''}`} value={form.fullName} onChange={e => { setForm({ ...form, fullName: e.target.value }); setErrors(prev => ({ ...prev, fullName: '' })); }} />
                        {errors.fullName && <span className="field-error">{errors.fullName}</span>}
                    </div>
                    <div className="grid-2">
                        <div className="form-group"><label>Username *</label>
                            <input className={`form-control${errors.username ? ' input-error' : ''}`} value={form.username} onChange={e => { setForm({ ...form, username: e.target.value }); setErrors(prev => ({ ...prev, username: '' })); }} />
                            {errors.username && <span className="field-error">{errors.username}</span>}
                            {editing && form.username !== editing.username && (
                                <span className="form-hint">After a username change they log in again with the new one.</span>
                            )}
                        </div>
                        <div className="form-group"><label>{editing ? 'New Password' : 'Password *'}</label>
                            <input className={`form-control${errors.password ? ' input-error' : ''}`} type="password" autoComplete="new-password"
                                placeholder={editing ? 'Leave blank to keep' : ''}
                                value={form.password} onChange={e => { setForm({ ...form, password: e.target.value }); setErrors(prev => ({ ...prev, password: '' })); }} />
                            {errors.password && <span className="field-error">{errors.password}</span>}
                        </div>
                    </div>
                    <div className="grid-2">
                        <div className="form-group"><label>Email *</label>
                            <input className={`form-control${errors.email ? ' input-error' : ''}`} type="email" value={form.email} onChange={e => { setForm({ ...form, email: e.target.value }); setErrors(prev => ({ ...prev, email: '' })); }} />
                            {errors.email && <span className="field-error">{errors.email}</span>}
                        </div>
                        <div className="form-group"><label>Phone</label>
                            <input className={`form-control${errors.phone ? ' input-error' : ''}`} value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setErrors(prev => ({ ...prev, phone: '' })); }} placeholder="10 digits" />
                            {errors.phone && <span className="field-error">{errors.phone}</span>}
                        </div>
                    </div>
                    <div className="form-group"><label>Role *</label>
                        <select className={`form-control${errors.role ? ' input-error' : ''}`} value={form.role} disabled={isSelf}
                            onChange={e => { setForm({ ...form, role: e.target.value }); setErrors(prev => ({ ...prev, role: '' })); }}>
                            <option value="SUPER_ADMIN">Super Admin</option><option value="SHOP_MANAGER">Shop Manager</option><option value="SHOP_OPERATOR">Shop Operator</option>
                        </select>
                        {errors.role && <span className="field-error">{errors.role}</span>}
                        {isSelf && <span className="form-hint">You cannot change your own role.</span>}
                        {!editing && form.role !== 'SUPER_ADMIN' && (
                            <span className="form-hint">Assign the shop, role and station under Employees. They can log in once registered there.</span>
                        )}
                        {editing && form.role === 'SUPER_ADMIN' && (
                            <span className="form-hint">Super admins are not tied to a branch; they see every branch.</span>
                        )}
                    </div>
                    {editing && form.role !== 'SUPER_ADMIN' && (
                        <div className="grid-2">
                            <div className="form-group"><label>Branch</label>
                                <select className="form-control" value={form.shopId} onChange={e => setForm({ ...form, shopId: e.target.value })}>
                                    <option value="">Not assigned</option>
                                    {shops.filter(s => s.active || s.id === editing.shopId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <span className="form-hint">For an employee, their employee record moves too.</span>
                            </div>
                            {form.role === 'SHOP_OPERATOR' && (
                                <div className="form-group"><label>Queue Station</label>
                                    <select className="form-control" value={form.station} onChange={e => setForm({ ...form, station: e.target.value })}>
                                        <option value="">Both stations</option>
                                        <option value="SHOT">⚡ Shots</option>
                                        <option value="BLEND">🥤 Blends</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? <><span className="btn-spinner"></span> Saving...</> : editing ? 'Save Changes' : 'Create User'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default UsersPage;
