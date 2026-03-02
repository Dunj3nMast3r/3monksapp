import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { orderService, exportService } from '../services/dataService';
import { formatCurrency, formatDateTime, getISTDateString, getISTMonthString } from '../utils/helpers';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';

const OrderHistoryPage = () => {
    const { user, isAdmin } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('today');
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => { fetchOrders(); }, [view]); // eslint-disable-line

    const fetchOrders = async () => {
        setLoading(true);
        try {
            let res;
            if (view === 'today') {
                res = await orderService.getTodayOrders(user.shopId);
            } else {
                res = await orderService.getShopOrders(user.shopId);
            }
            setOrders(res.data.data || []);
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
            const today = getISTDateString();
            const from = view === 'today' ? today : getISTMonthString() + '-01';
            const res = await exportService.downloadOrders(from, today);
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `orders_${from}_to_${today}.xlsx`;
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
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={`btn btn-sm ${view === 'today' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('today')}>Today</button>
                    <button className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('all')}>All</button>
                    {isAdmin() && (
                        <button className="btn btn-sm btn-outline" onClick={handleDownload} disabled={downloading}>
                            {downloading ? '⏳' : '📥'} Excel
                        </button>
                    )}
                </div>
            </div>

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
                                        <td>{order.items?.length} items</td>
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
                    `Items: ${confirmCancel?.items?.map(i => i.productName + ' x' + i.quantity).join(', ') || ''}`
                ]}
                confirmText="Cancel Order"
            />
        </div>
    );
};

export default OrderHistoryPage;
