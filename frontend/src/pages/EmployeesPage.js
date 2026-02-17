import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';
import { formatCurrency } from '../utils/helpers';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const EmployeesPage = () => {
    const [employees, setEmployees] = useState([]);
    const [users, setUsers] = useState([]);
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showSalary, setShowSalary] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ userId: '', shopId: '', salary: '', incentivePercentage: '' });
    const [salaryMonth, setSalaryMonth] = useState(new Date().toISOString().slice(0, 7));
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
        setForm({ userId: '', shopId: '', salary: '', incentivePercentage: '' });
        setShowModal(true);
    };

    const openEdit = (e) => {
        setEditing(e);
        setForm({ userId: e.userId, shopId: e.shopId, salary: e.salary || '', incentivePercentage: e.incentivePercentage || '' });
        setShowModal(true);
    };

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        try {
            const data = {
                userId: parseInt(form.userId),
                shopId: parseInt(form.shopId),
                salary: parseFloat(form.salary),
                incentivePercentage: form.incentivePercentage ? parseFloat(form.incentivePercentage) : 0,
            };
            if (editing) { await adminService.updateEmployee(editing.id, data); toast.success('Employee updated'); }
            else { await adminService.createEmployee(data); toast.success('Employee created'); }
            setShowModal(false); fetchAll();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
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

    // Get users not already employees
    const existingUserIds = employees.map(e => e.userId);
    const availableUsers = users.filter(u => !existingUserIds.includes(u.id));

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
                        <thead><tr><th>Name</th><th>Role</th><th>Shop</th><th>Salary</th><th>Incentive %</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{employees.map(e => (
                            <tr key={e.id}>
                                <td style={{ fontWeight: 500 }}>{e.fullName}</td>
                                <td>{e.role}</td>
                                <td>{e.shopName}</td>
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
                <form onSubmit={handleSubmit}>
                    {!editing && (
                        <div className="form-group"><label>User *</label>
                            <select className="form-control" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} required>
                                <option value="">Select user...</option>
                                {availableUsers.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
                            </select>
                        </div>
                    )}
                    {!editing && (
                        <div className="form-group"><label>Shop *</label>
                            <select className="form-control" value={form.shopId} onChange={e => setForm({ ...form, shopId: e.target.value })} required>
                                <option value="">Select shop...</option>
                                {shops.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="grid-2">
                        <div className="form-group"><label>Monthly Salary (₹) *</label>
                            <input className="form-control" type="number" step="0.01" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} required />
                        </div>
                        <div className="form-group"><label>Incentive %</label>
                            <input className="form-control" type="number" step="0.01" value={form.incentivePercentage} onChange={e => setForm({ ...form, incentivePercentage: e.target.value })} placeholder="e.g. 2" />
                        </div>
                    </div>
                    <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
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
