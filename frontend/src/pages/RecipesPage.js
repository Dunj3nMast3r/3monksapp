import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const RecipesPage = () => {
    const [recipes, setRecipes] = useState([]);
    const [products, setProducts] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ productId: '', rawMaterialId: '', quantityRequired: '' });

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        try {
            const [recipeRes, prodRes, matRes] = await Promise.all([
                adminService.getRecipes(),
                adminService.getProducts(),
                adminService.getRawMaterials()
            ]);
            setRecipes(recipeRes.data.data || []);
            setProducts(prodRes.data.data || []);
            setMaterials(matRes.data.data || []);
        } catch { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await adminService.createRecipe({
                productId: parseInt(form.productId),
                rawMaterialId: parseInt(form.rawMaterialId),
                quantityRequired: parseFloat(form.quantityRequired),
            });
            toast.success('Recipe added');
            setShowModal(false);
            setForm({ productId: '', rawMaterialId: '', quantityRequired: '' });
            fetchAll();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this recipe entry?')) return;
        try { await adminService.deleteRecipe(id); toast.success('Deleted'); fetchAll(); }
        catch { toast.error('Failed'); }
    };

    // Group recipes by product
    const grouped = {};
    recipes.forEach(r => {
        if (!grouped[r.productName]) grouped[r.productName] = [];
        grouped[r.productName].push(r);
    });

    return (
        <div>
            <div className="page-header"><h1>Recipes</h1><button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Recipe</button></div>

            {loading ? <div className="loading"><div className="spinner"></div></div> : recipes.length === 0 ? (
                <div className="empty-state"><div className="icon">📋</div><p>No recipes defined</p></div>
            ) : (
                Object.entries(grouped).map(([productName, items]) => (
                    <div className="card" key={productName} style={{ marginBottom: '16px' }}>
                        <h3 style={{ margin: '0 0 12px 0', color: 'var(--primary)' }}>{productName}</h3>
                        <div className="table-wrapper">
                            <table>
                                <thead><tr><th>Raw Material</th><th>Unit</th><th>Qty Required</th><th>Actions</th></tr></thead>
                                <tbody>{items.map(r => (
                                    <tr key={r.id}>
                                        <td style={{ fontWeight: 500 }}>{r.rawMaterialName}</td>
                                        <td>{r.unitType}</td>
                                        <td>{r.quantityRequired}</td>
                                        <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>Delete</button></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}

            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Recipe Entry">
                <form onSubmit={handleCreate}>
                    <div className="form-group"><label>Product *</label>
                        <select className="form-control" value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })} required>
                            <option value="">Select product...</option>
                            {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Raw Material *</label>
                        <select className="form-control" value={form.rawMaterialId} onChange={e => setForm({ ...form, rawMaterialId: e.target.value })} required>
                            <option value="">Select material...</option>
                            {materials.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name} ({m.unitType})</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Quantity Required *</label>
                        <input className="form-control" type="number" step="0.01" value={form.quantityRequired} onChange={e => setForm({ ...form, quantityRequired: e.target.value })} required placeholder="e.g. 150 (in material's unit)" />
                    </div>
                    <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
                </form>
            </Modal>
        </div>
    );
};

export default RecipesPage;
