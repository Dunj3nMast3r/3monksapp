import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';
import { formatDate } from '../utils/helpers';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const RawMaterialsPage = () => {
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', unitType: 'KG', costPerUnit: '', vendorName: '', vendorContact: '', reorderLevel: '' });

    useEffect(() => { fetchMaterials(); }, []);

    const fetchMaterials = async () => {
        try { const res = await adminService.getRawMaterials(); setMaterials(res.data.data || []); }
        catch { toast.error('Failed to load materials'); }
        finally { setLoading(false); }
    };

    const openAdd = () => { setEditing(null); setForm({ name: '', unitType: 'KG', costPerUnit: '', vendorName: '', vendorContact: '', reorderLevel: '' }); setShowModal(true); };
    const openEdit = (m) => { setEditing(m); setForm({ name: m.name, unitType: m.unitType, costPerUnit: m.costPerUnit || '', vendorName: m.vendorName || '', vendorContact: m.vendorContact || '', reorderLevel: m.reorderLevel || '' }); setShowModal(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = { ...form, costPerUnit: parseFloat(form.costPerUnit), reorderLevel: form.reorderLevel ? parseFloat(form.reorderLevel) : null };
            if (editing) { await adminService.updateRawMaterial(editing.id, data); toast.success('Updated'); }
            else { await adminService.createRawMaterial(data); toast.success('Created'); }
            setShowModal(false); fetchMaterials();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleToggle = async (id) => {
        try { await adminService.toggleRawMaterial(id); toast.success('Toggled'); fetchMaterials(); }
        catch { toast.error('Failed'); }
    };

    return (
        <div>
            <div className="page-header"><h1>Raw Materials</h1><button className="btn btn-primary" onClick={openAdd}>+ Add Material</button></div>
            {loading ? <div className="loading"><div className="spinner"></div></div> : (
                <div className="card"><div className="table-wrapper">
                    <table>
                        <thead><tr><th>Name</th><th>Unit</th><th>Cost/Unit</th><th>Vendor</th><th>Reorder Level</th><th>Last Purchase</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{materials.map(m => (
                            <tr key={m.id}>
                                <td style={{ fontWeight: 500 }}>{m.name}</td>
                                <td>{m.unitType}</td>
                                <td>₹{m.costPerUnit}</td>
                                <td>{m.vendorName || '-'}</td>
                                <td>{m.reorderLevel || '-'}</td>
                                <td>{m.lastPurchaseDate ? formatDate(m.lastPurchaseDate) : '-'}</td>
                                <td><span className={`badge ${m.active ? 'badge-success' : 'badge-danger'}`}>{m.active ? 'Active' : 'Inactive'}</span></td>
                                <td style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(m)}>Edit</button>
                                    <button className={`btn btn-sm ${m.active ? 'btn-danger' : 'btn-primary'}`} onClick={() => handleToggle(m.id)}>{m.active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div></div>
            )}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Material' : 'Add Material'}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                    <div className="grid-2">
                        <div className="form-group"><label>Unit Type *</label>
                            <select className="form-control" value={form.unitType} onChange={e => setForm({ ...form, unitType: e.target.value })}>
                                <option value="KG">KG</option><option value="GRAM">GRAM</option><option value="LITRE">LITRE</option>
                                <option value="ML">ML</option><option value="PIECE">PIECE</option><option value="DOZEN">DOZEN</option>
                            </select>
                        </div>
                        <div className="form-group"><label>Cost per Unit (₹) *</label>
                            <input className="form-control" type="number" step="0.01" value={form.costPerUnit} onChange={e => setForm({ ...form, costPerUnit: e.target.value })} required />
                        </div>
                    </div>
                    <div className="grid-2">
                        <div className="form-group"><label>Vendor Name</label><input className="form-control" value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} /></div>
                        <div className="form-group"><label>Vendor Contact</label><input className="form-control" value={form.vendorContact} onChange={e => setForm({ ...form, vendorContact: e.target.value })} /></div>
                    </div>
                    <div className="form-group"><label>Reorder Level</label><input className="form-control" type="number" step="0.01" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} placeholder="Alert when stock drops below this" /></div>
                    <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
                </form>
            </Modal>
        </div>
    );
};

export default RawMaterialsPage;
