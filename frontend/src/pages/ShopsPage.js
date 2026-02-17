import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const ShopsPage = () => {
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', address: '', phone: '', gstNumber: '' });

    useEffect(() => { fetchShops(); }, []);

    const fetchShops = async () => {
        try {
            const res = await adminService.getShops();
            setShops(res.data.data || []);
        } catch { toast.error('Failed to load shops'); }
        finally { setLoading(false); }
    };

    const openAdd = () => { setEditing(null); setForm({ name: '', address: '', phone: '', gstNumber: '' }); setShowModal(true); };
    const openEdit = (shop) => { setEditing(shop); setForm({ name: shop.name, address: shop.address || '', phone: shop.phone || '', gstNumber: shop.gstNumber || '' }); setShowModal(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editing) { await adminService.updateShop(editing.id, form); toast.success('Shop updated'); }
            else { await adminService.createShop(form); toast.success('Shop created'); }
            setShowModal(false); fetchShops();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleToggle = async (id) => {
        try { await adminService.toggleShop(id); toast.success('Shop toggled'); fetchShops(); }
        catch { toast.error('Failed'); }
    };

    return (
        <div>
            <div className="page-header"><h1>Shops</h1><button className="btn btn-primary" onClick={openAdd}>+ Add Shop</button></div>
            {loading ? <div className="loading"><div className="spinner"></div></div> : (
                <div className="card"><div className="table-wrapper">
                    <table>
                        <thead><tr><th>Name</th><th>Address</th><th>Phone</th><th>GST</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{shops.map(s => (
                            <tr key={s.id}>
                                <td style={{ fontWeight: 500 }}>{s.name}</td>
                                <td>{s.address || '-'}</td>
                                <td>{s.phone || '-'}</td>
                                <td>{s.gstNumber || '-'}</td>
                                <td><span className={`badge ${s.active ? 'badge-success' : 'badge-danger'}`}>{s.active ? 'Active' : 'Inactive'}</span></td>
                                <td style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(s)}>Edit</button>
                                    <button className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-primary'}`} onClick={() => handleToggle(s.id)}>{s.active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div></div>
            )}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Shop' : 'Add Shop'}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                    <div className="form-group"><label>Address</label><input className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                    <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                    <div className="form-group"><label>GST Number</label><input className="form-control" value={form.gstNumber} onChange={e => setForm({ ...form, gstNumber: e.target.value })} /></div>
                    <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
                </form>
            </Modal>
        </div>
    );
};

export default ShopsPage;
