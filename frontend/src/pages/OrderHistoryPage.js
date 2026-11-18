import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { orderService, exportService, adminService } from '../services/dataService';
import { formatCurrency, formatDateTime, getISTDateString, getISTMonthString } from '../utils/helpers';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const PAGE_SIZE = 25;

// Periods by business day (the day runs to 3 AM, as everywhere else in the app)
const PERIODS = [
    { key: 'today', label: 'Today', range: () => [getISTDateString(), getISTDateString()] },
    { key: 'yesterday', label: 'Yesterday', range: () => [getISTDateString(1), getISTDateString(1)] },
    { key: 'week', label: 'Last 7 days', range: () => [getISTDateString(6), getISTDateString()] },
    { key: 'month', label: 'This month', range: () => [`${getISTMonthString()}-01`, getISTDateString()] },
    { key: 'all', label: 'All', range: () => [null, null] },
];
const showDate = (d) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const OrderHistoryPage = () => {
    const { isAdmin } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('today');
    const [page, setPage] = useState(0);
    const [paging, setPaging] = useState({ totalElements: 0, totalPages: 0 });
    // Admins pick a branch ('' = all branches); everyone else always sees their own branch
    const [shops, setShops] = useState([]);
    const [shopFilter, setShopFilter] = useState('');

    useEffect(() => {
        if (!isAdmin()) return;
        adminService.getShops()
            .then(res => setShops((res.data.data || []).slice().sort((a, b) => a.name.localeCompare(b.name))))
            .catch(() => {});
    }, []); // eslint-disable-line
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

    useEffect(() => { fetchOrders(); }, [view, page, shopFilter]); // eslint-disable-line

    const period = PERIODS.find(p => p.key === view);
    const [from, to] = period.range();
    const pickView = (key) => { setView(key); setPage(0); };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await orderService.getOrderHistory({
                // The server works out a manager's or staff member's branch itself
                shopId: isAdmin() && shopFilter ? shopFilter : undefined,
                from: from || undefined, to: to || undefined,
                page, size: PAGE_SIZE,
            });
            const data = res.data.data || {};
            setOrders(data.orders || []);
            setPaging({ totalElements: data.totalElements || 0, totalPages: data.totalPages || 0 });
        } catch (err) {
            toast.error('Failed to load orders');
        } finally {
            setLoading(false);
        }
    };

    const handleCancelClick = (order) => {
        setConfirmCancel(order);
    };

    const handleCancelConfirm = async () => {
        if (!confirmCancel) return;
        setCancelling(true);
        try {
            await orderService.cancelOrder(confirmCancel.id);
            toast.success('Order cancelled — stock restored');
            setConfirmCancel(null);
            fetchOrders();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel order');
        } finally {
            setCancelling(false);
        }
    };

    const handleDownload = async () => {
        setDownloading(true);
        try {
            // The chosen period; "All" downloads this month, as before
            const today = getISTDateString();
            const fromDate = from || `${getISTMonthString()}-01`;
            const toDate = to || today;
            const res = await exportService.downloadOrders(fromDate, toDate);
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `orders_${fromDate}_to_${toDate}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast.success('Excel downloaded');
        } catch {
            toast.error('Failed to download');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1>Order History</h1>
                <div className="history-periods">
                    {PERIODS.map(p => (
                        <button key={p.key} className={`btn btn-sm ${view === p.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => pickView(p.key)}>{p.label}</button>
                    ))}
                    {isAdmin() && (
                        <button className="btn btn-sm btn-outline" onClick={handleDownload} disabled={downloading}>
                            {downloading ? '⏳' : '📥'} Excel
                        </button>
                    )}
                </div>
            </div>

            {isAdmin() && shops.length > 1 && (
                <div className="form-group history-branch">
                    <select className="form-control" value={shopFilter} onChange={e => { setShopFilter(e.target.value); setPage(0); }}>
                        <option value="">All branches</option>
                        {shops.map(s => <option key={s.id} value={s.id}>{s.name}{s.active === false ? ' (inactive)' : ''}</option>)}
                    </select>
                </div>
            )}
            <p className="form-hint history-summary">
                {from ? (from === to ? showDate(from) : `${showDate(from)} – ${showDate(to)}`) : 'All orders'}
                {!loading && ` · ${paging.totalElements} order${paging.totalElements === 1 ? '' : 's'}`}
            </p>

            {loading ? (
                <div className="loading"><div className="spinner"></div></div>
            ) : orders.length === 0 ? (
                <div className="empty-state"><div className="icon">📋</div><p>No orders found</p></div>
            ) : (
                <div className="card">
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Token</th>
                                    <th>Order #</th>
                                    {isAdmin() && <th>Shop</th>}
                                    <th>Items</th>
                                    <th>Total</th>
                                    <th>Payment</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(order => (
                                    <tr key={order.id}>
                                        <td><span className="badge badge-token">{order.tokenNumber ? `#${order.tokenNumber}` : '-'}</span></td>
                                        <td style={{ fontWeight: 600 }}>{order.orderNumber}</td>
                                        {isAdmin() && <td>{order.shopName}</td>}
                                        <td>
                                            <span className="items-link" onClick={() => setSelectedOrder(order)} style={{ cursor: 'pointer', color: 'var(--primary)', textDecoration: 'underline', fontWeight: 500 }}>
                                                {order.items?.length} items
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{formatCurrency(order.totalAmount)}</td>
                                        <td><span className="badge badge-info">{order.paymentMode}</span></td>
                                        <td>
                                            <span className={`badge ${order.status === 'COMPLETED' ? 'badge-success' : order.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td>{formatDateTime(order.orderDate)}</td>
                                        <td>
                                            {order.status === 'COMPLETED' && (
                                                <button className="btn btn-sm btn-danger" onClick={() => handleCancelClick(order)}>Cancel</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {paging.totalPages > 1 && (
                        <div className="history-pager">
                            <button className="btn btn-sm btn-outline" disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
                            <span>Page {page + 1} of {paging.totalPages}</span>
                            <button className="btn btn-sm btn-outline" disabled={page + 1 >= paging.totalPages} onClick={() => setPage(page + 1)}>Older →</button>
                        </div>
                    )}
                </div>
            )}

            <ConfirmDialog
                isOpen={!!confirmCancel}
                onClose={() => setConfirmCancel(null)}
                onConfirm={handleCancelConfirm}
                loading={cancelling}
                title="Cancel Order"
                message={`Cancel order ${confirmCancel?.orderNumber}?`}
                details={[
                    `Order total: ${formatCurrency(confirmCancel?.totalAmount)}`,
                    `${confirmCancel?.items?.length || 0} product(s) — raw material stock will be restored`,
                    `Payment mode: ${confirmCancel?.paymentMode}`,
                    `Status will change from COMPLETED → CANCELLED`,
                    `Items: ${confirmCancel?.items?.map(i => (i.customization || i.productName) + ' x' + i.quantity).join(', ') || ''}`
                ]}
                confirmText="Cancel Order"
            />

            <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Order Items${selectedOrder?.tokenNumber ? ` — Token #${selectedOrder.tokenNumber}` : ''}`}>
                {selectedOrder && (
                    <div>
                        <div style={{ marginBottom: '12px', fontSize: '13px', color: '#666' }}>
                            {selectedOrder.orderNumber} · {formatDateTime(selectedOrder.orderDate)}
                            {selectedOrder.customerName && ` · ${selectedOrder.customerName}`}
                        </div>
                        <table style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Product</th>
                                    <th style={{ textAlign: 'center' }}>Qty</th>
                                    <th style={{ textAlign: 'right' }}>Price</th>
                                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedOrder.items?.map((item, i) => (
                                    <tr key={i}>
                                        <td>{item.productName}{item.customization ? ` (${item.customization})` : ''}</td>
                                        <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.subtotal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {selectedOrder.parcel && (
                                    <tr>
                                        <td colSpan="3" style={{ textAlign: 'right', paddingTop: '12px' }}>🛍️ Parcel Charge</td>
                                        <td style={{ textAlign: 'right', paddingTop: '12px' }}>{formatCurrency(selectedOrder.parcelCharge)}</td>
                                    </tr>
                                )}
                                <tr>
                                    <td colSpan="3" style={{ textAlign: 'right', fontWeight: 700, paddingTop: '12px', borderTop: '2px solid #e0e0e0' }}>Total</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: '12px', borderTop: '2px solid #e0e0e0', color: 'var(--primary)' }}>{formatCurrency(selectedOrder.totalAmount)}</td>
                                </tr>
                            </tfoot>
                        </table>
                        <div style={{ marginTop: '20px', textAlign: 'center' }}>
                            <button className="btn btn-outline" onClick={() => setSelectedOrder(null)}>← Back to Orders</button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default OrderHistoryPage;
