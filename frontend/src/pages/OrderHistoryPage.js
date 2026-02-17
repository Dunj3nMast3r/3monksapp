import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/dataService';
import { formatCurrency, formatDateTime } from '../utils/helpers';
import toast from 'react-hot-toast';

const OrderHistoryPage = () => {
    const { user, isAdmin } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('today');

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

    const handleCancel = async (orderId) => {
        if (!window.confirm('Cancel this order?')) return;
        try {
            await orderService.cancelOrder(orderId);
            toast.success('Order cancelled');
            fetchOrders();
        } catch (err) {
            toast.error('Failed to cancel order');
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1>Order History</h1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={`btn btn-sm ${view === 'today' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('today')}>Today</button>
                    <button className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('all')}>All</button>
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
                                                <button className="btn btn-sm btn-danger" onClick={() => handleCancel(order.id)}>Cancel</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderHistoryPage;
