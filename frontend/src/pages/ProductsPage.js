import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';
import { formatCurrency } from '../utils/helpers';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const ProductsPage = () => {
    const [products, setProducts] = useState([]);
    const [fruits, setFruits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', category: 'SHOT', price: '', description: '', fruitIds: [] });

    useEffect(() => {
        Promise.all([adminService.getProducts(), adminService.getFruits()])
            .then(([pRes, fRes]) => { setProducts(pRes.data.data || []); setFruits(fRes.data.data || []); })
            .catch(() => toast.error('Failed to load data'))
            .finally(() => setLoading(false));
    }, []);

    const fetchProducts = async () => {
        const res = await adminService.getProducts();
        setProducts(res.data.data || []);
    };

    const openAdd = () => { setEditing(null); setForm({ name: '', category: 'SHOT', price: '', description: '', fruitIds: [] }); setShowModal(true); };
    const openEdit = (p) => { setEditing(p); setForm({ name: p.name, category: p.category, price: p.price, description: p.description || '', fruitIds: p.fruits?.map(f => f.id) || [] }); setShowModal(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = { ...form, price: parseFloat(form.price) };
            if (editing) { await adminService.updateProduct(editing.id, data); toast.success('Updated'); }
            else { await adminService.createProduct(data); toast.success('Created'); }
            setShowModal(false); fetchProducts();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleToggle = async (id) => {
        try { await adminService.toggleProduct(id); toast.success('Toggled'); fetchProducts(); }
        catch { toast.error('Failed'); }
    };

    const toggleFruit = (fruitId) => {
        if (form.fruitIds.includes(fruitId)) {
            setForm({ ...form, fruitIds: form.fruitIds.filter(id => id !== fruitId) });
        } else {
            if (form.category === 'CREAMY_BLEND' && form.fruitIds.length >= 1) { toast.error('Max 1 fruit for creamy blends'); return; }
            if (form.category === 'CURATED_BLEND' && form.fruitIds.length >= 2) { toast.error('Max 2 fruits for curated blends'); return; }
            setForm({ ...form, fruitIds: [...form.fruitIds, fruitId] });
        }
    };

    return (
        <div>
            <div className="page-header"><h1>Products (Menu)</h1><button className="btn btn-primary" onClick={openAdd}>+ Add Product</button></div>
            {loading ? <div className="loading"><div className="spinner"></div></div> : (
                <div className="card"><div className="table-wrapper">
                    <table>
                        <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Fruits</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{products.map(p => (
                            <tr key={p.id}>
                                <td style={{ fontWeight: 500 }}>{p.name}</td>
                                <td><span className={`badge ${p.category === 'SHOT' ? 'badge-info' : p.category === 'CREAMY_BLEND' ? 'badge-warning' : 'badge-success'}`}>{p.category.replace('_', ' ')}</span></td>
                                <td>{formatCurrency(p.price)}</td>
                                <td>{p.fruits?.map(f => f.name).join(', ') || '-'}</td>
                                <td><span className={`badge ${p.active ? 'badge-success' : 'badge-danger'}`}>{p.active ? 'Active' : 'Inactive'}</span></td>
                                <td style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(p)}>Edit</button>
                                    <button className={`btn btn-sm ${p.active ? 'btn-danger' : 'btn-primary'}`} onClick={() => handleToggle(p.id)}>{p.active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div></div>
            )}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Product' : 'Add Product'}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                    <div className="grid-2">
                        <div className="form-group"><label>Category *</label>
                            <select className="form-control" value={form.category} onChange={e => setForm({ ...form, category: e.target.value, fruitIds: [] })}>
                                <option value="SHOT">Shot</option><option value="CREAMY_BLEND">Creamy Blend</option><option value="CURATED_BLEND">Curated Blend</option>
                            </select>
                        </div>
                        <div className="form-group"><label>Price (₹) *</label><input className="form-control" type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required /></div>
                    </div>
                    <div className="form-group"><label>Description</label><input className="form-control" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                    <div className="form-group">
                        <label>Fruits {form.category === 'CURATED_BLEND' ? '(max 2)' : form.category === 'CREAMY_BLEND' ? '(max 1)' : '(1 for shots)'}</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                            {fruits.map(f => (
                                <button key={f.id} type="button" onClick={() => toggleFruit(f.id)}
                                    className={`btn btn-sm ${form.fruitIds.includes(f.id) ? 'btn-primary' : 'btn-outline'}`}>
                                    {f.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
                </form>
            </Modal>
        </div>
    );
};

export default ProductsPage;
