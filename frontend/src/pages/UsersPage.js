import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';
import { roleLabels } from '../utils/helpers';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const UsersPage = () => {
    const [users, setUsers] = useState([]);
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ fullName: '', username: '', password: '', role: 'SHOP_OPERATOR', shopId: '' });

    useEffect(() => {
        Promise.all([adminService.getUsers(), adminService.getShops()])
            .then(([uRes, sRes]) => { setUsers(uRes.data.data || []); setShops(sRes.data.data || []); })
            .catch(() => toast.error('Failed'))
            .finally(() => setLoading(false));
    }, []);

    const fetchUsers = async () => { const res = await adminService.getUsers(); setUsers(res.data.data || []); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await adminService.createUser({ ...form, shopId: form.shopId ? parseInt(form.shopId) : null });
            toast.success('User created');
            setShowModal(false);
            setForm({ fullName: '', username: '', password: '', role: 'SHOP_OPERATOR', shopId: '' });
            fetchUsers();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleToggle = async (id) => {
        try { await adminService.toggleUser(id); toast.success('Toggled'); fetchUsers(); }
        catch { toast.error('Failed'); }
    };

    return (
        <div>
            <div className="page-header"><h1>Users</h1><button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add User</button></div>
            {loading ? <div className="loading"><div className="spinner"></div></div> : (
                <div className="card"><div className="table-wrapper">
                    <table>
                        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Shop</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{users.map(u => (
                            <tr key={u.id}>
                                <td style={{ fontWeight: 500 }}>{u.fullName}</td>
                                <td>{u.username}</td>
                                <td><span className="badge badge-info">{roleLabels[u.role] || u.role}</span></td>
                                <td>{u.shopName || '-'}</td>
                                <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                                <td>
                                    <button className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-primary'}`} onClick={() => handleToggle(u.id)}>{u.active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div></div>
            )}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add User">
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Full Name *</label><input className="form-control" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></div>
                    <div className="grid-2">
                        <div className="form-group"><label>Username *</label><input className="form-control" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required /></div>
                        <div className="form-group"><label>Password *</label><input className="form-control" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></div>
                    </div>
                    <div className="grid-2">
                        <div className="form-group"><label>Role *</label>
                            <select className="form-control" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                <option value="SUPER_ADMIN">Super Admin</option><option value="SHOP_MANAGER">Shop Manager</option><option value="SHOP_OPERATOR">Shop Operator</option>
                            </select>
                        </div>
                        <div className="form-group"><label>Shop</label>
                            <select className="form-control" value={form.shopId} onChange={e => setForm({ ...form, shopId: e.target.value })}>
                                <option value="">-- Select --</option>
                                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Create User</button></div>
                </form>
            </Modal>
        </div>
    );
};

export default UsersPage;
