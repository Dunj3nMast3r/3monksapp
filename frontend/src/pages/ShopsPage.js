import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../services/dataService';
import { roleLabels } from '../utils/helpers';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const STATION_LABELS = { SHOT: '⚡ Shots', BLEND: '🥤 Blends' };

const ShopsPage = () => {
    const [shops, setShops] = useState([]);
    const [users, setUsers] = useState([]);
    const [staffShop, setStaffShop] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const emptyForm = { name: '', address: '', phone: '', email: '', gstNumber: '', manualSales: false, shotPrice: '', blendPrice: '', monthlyLeaves: '', leaveStartMonth: '', incentiveEnabled: false, incentiveFreeUnits: '', incentivePerUnit: '', incentiveStartDate: '' };
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState({});

    useEffect(() => { fetchShops(); }, []);

    const fetchShops = async () => {
        try {
            const [res, userRes] = await Promise.all([adminService.getShops(), adminService.getUsers()]);
            setShops(res.data.data || []);
            setUsers(userRes.data.data || []);
        } catch { toast.error('Failed to load shops'); }
        finally { setLoading(false); }
    };

    // Managers first, then operators, by name
    const staffOf = (shopId) => users
        .filter(u => u.shopId === shopId && u.role !== 'SUPER_ADMIN')
        .sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName));

    const openAdd = () => { setEditing(null); setForm(emptyForm); setErrors({}); setShowModal(true); };
    const openEdit = (shop) => {
        setEditing(shop);
        setForm({
            name: shop.name, address: shop.address || '', phone: shop.phone || '', email: shop.email || '', gstNumber: shop.gstNumber || '',
            manualSales: !!shop.manualSales, shotPrice: shop.shotPrice ?? '', blendPrice: shop.blendPrice ?? '',
            monthlyLeaves: shop.monthlyLeaves ?? '',
            leaveStartMonth: shop.leaveStartMonth ? shop.leaveStartMonth.slice(0, 7) : '',
            incentiveEnabled: !!shop.incentiveEnabled, incentiveFreeUnits: shop.incentiveFreeUnits ?? '',
            incentivePerUnit: shop.incentivePerUnit ?? '', incentiveStartDate: shop.incentiveStartDate || '',
        });
        setErrors({}); setShowModal(true);
    };

    const validateForm = () => {
        const errs = {};
        if (!form.name || form.name.trim().length < 2) errs.name = 'Shop name must be at least 2 characters';
        if (form.name && form.name.length > 100) errs.name = 'Shop name cannot exceed 100 characters';
        if (!form.address || form.address.trim().length < 5) errs.address = 'Address must be at least 5 characters';
        if (form.address && form.address.length > 500) errs.address = 'Address cannot exceed 500 characters';
        if (form.phone && !/^[0-9]{10}$/.test(form.phone)) errs.phone = 'Phone number must be exactly 10 digits';
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Please enter a valid email address';
        if (form.gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstNumber)) errs.gstNumber = 'Please enter a valid 15-character GST number';
        if (form.manualSales) {
            if (!(Number(form.shotPrice) > 0)) errs.shotPrice = 'Enter the shot price';
            if (!(Number(form.blendPrice) > 0)) errs.blendPrice = 'Enter the blend price';
        }
        if (form.incentiveEnabled) {
            if (form.incentiveFreeUnits === '' || Number(form.incentiveFreeUnits) < 0) errs.incentiveFreeUnits = 'Enter the free units per day';
            if (form.incentivePerUnit === '' || Number(form.incentivePerUnit) < 0) errs.incentivePerUnit = 'Enter ₹ per unit';
            if (!form.incentiveStartDate) errs.incentiveStartDate = 'Enter the start date';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;
        setSubmitting(true);
        try {
            const payload = {
                ...form,
                shotPrice: form.shotPrice === '' ? null : Number(form.shotPrice),
                blendPrice: form.blendPrice === '' ? null : Number(form.blendPrice),
                monthlyLeaves: form.monthlyLeaves === '' ? null : Number(form.monthlyLeaves),
                leaveStartMonth: form.leaveStartMonth ? `${form.leaveStartMonth}-01` : null,
                incentiveFreeUnits: form.incentiveFreeUnits === '' ? null : Number(form.incentiveFreeUnits),
                incentivePerUnit: form.incentivePerUnit === '' ? null : Number(form.incentivePerUnit),
                incentiveStartDate: form.incentiveStartDate || null,
            };
            if (editing) { await adminService.updateShop(editing.id, payload); toast.success('Shop updated'); }
            else { await adminService.createShop(payload); toast.success('Shop created'); }
            setShowModal(false); fetchShops();
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
        try { await adminService.toggleShop(id); toast.success('Shop toggled'); fetchShops(); }
        catch { toast.error('Failed'); }
    };

    return (
        <div>
            <div className="page-header"><h1>Shops</h1><button className="btn btn-primary" onClick={openAdd}>+ Add Shop</button></div>
            {loading ? <div className="loading"><div className="spinner"></div></div> : (
                <div className="card"><div className="table-wrapper">
                    <table>
                        <thead><tr><th>Name</th><th>Address</th><th>Phone</th><th>GST</th><th>Staff</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{shops.map(s => (
                            <tr key={s.id}>
                                <td style={{ fontWeight: 500 }}>
                                    {s.name}
                                    {s.manualSales && <span className="badge badge-warning" style={{ marginLeft: '6px' }}>✍️ Manual sales</span>}
                                </td>
                                <td>{s.address || '-'}</td>
                                <td>{s.phone || '-'}</td>
                                <td>{s.gstNumber || '-'}</td>
                                <td>
                                    <button className="btn btn-sm btn-outline" onClick={() => setStaffShop(s)}>
                                        👥 {staffOf(s.id).length}
                                    </button>
                                </td>
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
                <form onSubmit={handleSubmit} noValidate>
                    <div className="form-group"><label>Name *</label>
                        <input className={`form-control${errors.name ? ' input-error' : ''}`} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setErrors(prev => ({ ...prev, name: '' })); }} />
                        {errors.name && <span className="field-error">{errors.name}</span>}
                    </div>
                    <div className="form-group"><label>Address *</label>
                        <input className={`form-control${errors.address ? ' input-error' : ''}`} value={form.address} onChange={e => { setForm({ ...form, address: e.target.value }); setErrors(prev => ({ ...prev, address: '' })); }} />
                        {errors.address && <span className="field-error">{errors.address}</span>}
                    </div>
                    <div className="grid-2">
                        <div className="form-group"><label>Phone</label>
                            <input className={`form-control${errors.phone ? ' input-error' : ''}`} value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setErrors(prev => ({ ...prev, phone: '' })); }} placeholder="10 digits" />
                            {errors.phone && <span className="field-error">{errors.phone}</span>}
                        </div>
                        <div className="form-group"><label>Email</label>
                            <input className={`form-control${errors.email ? ' input-error' : ''}`} type="email" value={form.email} onChange={e => { setForm({ ...form, email: e.target.value }); setErrors(prev => ({ ...prev, email: '' })); }} />
                            {errors.email && <span className="field-error">{errors.email}</span>}
                        </div>
                    </div>
                    <div className="form-group"><label>GST Number</label>
                        <input className={`form-control${errors.gstNumber ? ' input-error' : ''}`} value={form.gstNumber} onChange={e => { setForm({ ...form, gstNumber: e.target.value.toUpperCase() }); setErrors(prev => ({ ...prev, gstNumber: '' })); }} placeholder="e.g. 22AAAAA0000A1Z5" />
                        {errors.gstNumber && <span className="field-error">{errors.gstNumber}</span>}
                    </div>
                    <div className="form-group">
                        <label>Paid leaves per month (per employee)</label>
                        <input type="number" min="0" max="31" step="0.5" inputMode="decimal" className={`form-control${errors.monthlyLeaves ? ' input-error' : ''}`}
                            value={form.monthlyLeaves} placeholder="e.g. 2 (empty = leave balance not tracked)"
                            onChange={e => { setForm({ ...form, monthlyLeaves: e.target.value }); setErrors(prev => ({ ...prev, monthlyLeaves: '' })); }} />
                        {errors.monthlyLeaves && <span className="field-error">{errors.monthlyLeaves}</span>}
                        <small className="form-hint">Added every month from each employee's joining date; unused leave carries over (at most 6).</small>
                    </div>
                    {form.monthlyLeaves !== '' && Number(form.monthlyLeaves) > 0 && (
                        <div className="form-group">
                            <label>Leave starts from (month)</label>
                            <input type="month" className="form-control" value={form.leaveStartMonth}
                                onChange={e => setForm({ ...form, leaveStartMonth: e.target.value })} />
                            <small className="form-hint">No leave is given or counted before this month. Empty = from each employee's joining month.</small>
                        </div>
                    )}
                    <div className="form-group">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', textTransform: 'none', cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.manualSales}
                                onChange={e => setForm({ ...form, manualSales: e.target.checked })} />
                            Sales entered manually (orders not taken in the app)
                        </label>
                        <small className="form-hint">Each day's shots, blends and amount received are entered on the Manual Sales Entry page. The sales amount is worked out from these prices.</small>
                    </div>
                    {form.manualSales && (
                        <div className="grid-2">
                            <div className="form-group"><label>Shot price (₹) *</label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" className={`form-control${errors.shotPrice ? ' input-error' : ''}`}
                                    value={form.shotPrice} onChange={e => { setForm({ ...form, shotPrice: e.target.value }); setErrors(prev => ({ ...prev, shotPrice: '' })); }} />
                                {errors.shotPrice && <span className="field-error">{errors.shotPrice}</span>}
                            </div>
                            <div className="form-group"><label>Blend price (₹) *</label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" className={`form-control${errors.blendPrice ? ' input-error' : ''}`}
                                    value={form.blendPrice} onChange={e => { setForm({ ...form, blendPrice: e.target.value }); setErrors(prev => ({ ...prev, blendPrice: '' })); }} />
                                {errors.blendPrice && <span className="field-error">{errors.blendPrice}</span>}
                            </div>
                        </div>
                    )}
                    {editing && editing.manualSales && form.manualSales && (Number(form.shotPrice) !== Number(editing.shotPrice) || Number(form.blendPrice) !== Number(editing.blendPrice)) && (
                        <p className="form-hint">New prices apply to days entered from now on; days already entered keep their prices.</p>
                    )}
                    <div className="form-group">
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', textTransform: 'none', cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.incentiveEnabled}
                                onChange={e => setForm({ ...form, incentiveEnabled: e.target.checked })} />
                            Staff sales incentive
                        </label>
                        <small className="form-hint">Each staff member Present that day gets (shots + blends sold − free units) × ₹ per unit; half day gets half. Managers are not included.</small>
                    </div>
                    {form.incentiveEnabled && (
                        <div className="grid-2">
                            <div className="form-group"><label>Free units per day *</label>
                                <input type="number" min="0" step="1" inputMode="numeric" className={`form-control${errors.incentiveFreeUnits ? ' input-error' : ''}`}
                                    value={form.incentiveFreeUnits} placeholder="e.g. 50"
                                    onChange={e => { setForm({ ...form, incentiveFreeUnits: e.target.value }); setErrors(prev => ({ ...prev, incentiveFreeUnits: '' })); }} />
                                {errors.incentiveFreeUnits && <span className="field-error">{errors.incentiveFreeUnits}</span>}
                            </div>
                            <div className="form-group"><label>₹ per unit above *</label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" className={`form-control${errors.incentivePerUnit ? ' input-error' : ''}`}
                                    value={form.incentivePerUnit} placeholder="e.g. 1"
                                    onChange={e => { setForm({ ...form, incentivePerUnit: e.target.value }); setErrors(prev => ({ ...prev, incentivePerUnit: '' })); }} />
                                {errors.incentivePerUnit && <span className="field-error">{errors.incentivePerUnit}</span>}
                            </div>
                            <div className="form-group"><label>Starts from *</label>
                                <input type="date" className={`form-control${errors.incentiveStartDate ? ' input-error' : ''}`}
                                    value={form.incentiveStartDate}
                                    onChange={e => { setForm({ ...form, incentiveStartDate: e.target.value }); setErrors(prev => ({ ...prev, incentiveStartDate: '' })); }} />
                                {errors.incentiveStartDate && <span className="field-error">{errors.incentiveStartDate}</span>}
                            </div>
                        </div>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? <><span className="btn-spinner"></span> Saving...</> : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>
            <Modal isOpen={!!staffShop} onClose={() => setStaffShop(null)} title={`Staff - ${staffShop?.name || ''}`}>
                {staffShop && (staffOf(staffShop.id).length === 0 ? (
                    <p>No staff assigned yet. Register them under <Link to="/dashboard/employees">Employees</Link>.</p>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Station</th><th>Status</th></tr></thead>
                            <tbody>{staffOf(staffShop.id).map(u => (
                                <tr key={u.id}>
                                    <td style={{ fontWeight: 500 }}>{u.fullName}</td>
                                    <td>{u.username}</td>
                                    <td><span className="badge badge-info">{roleLabels[u.role] || u.role}</span></td>
                                    <td>{u.role === 'SHOP_OPERATOR' ? (STATION_LABELS[u.station] || 'Both') : '-'}</td>
                                    <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                                </tr>
                            ))}</tbody>
                        </table>
                        <p className="form-hint">To move someone or change their role or station, edit them under <Link to="/dashboard/employees">Employees</Link>.</p>
                    </div>
                ))}
            </Modal>
        </div>
    );
};

export default ShopsPage;
