import React from 'react';
import { formatCurrency, formatDateTime } from '../utils/helpers';

const Receipt = React.forwardRef(({ order, shop }, ref) => {
    if (!order) return null;

    return (
        <div ref={ref} className="receipt">
            <div className="receipt-header">
                <img src="/logo.svg" alt="3Monks" style={{ width: '40px', height: '40px', margin: '0 auto 6px' }} />
                <h3>3Monks</h3>
                <p>100% Real Fruit. No Artificial Flavor.</p>
                <p>{shop?.name || order.shopName}</p>
                <p>{shop?.address}</p>
                {shop?.gstNumber && <p>GST: {shop.gstNumber}</p>}
            </div>

            <table>
                <tbody>
                    <tr><td>Order #:</td><td style={{ textAlign: 'right' }}>{order.orderNumber}</td></tr>
                    <tr><td>Date:</td><td style={{ textAlign: 'right' }}>{formatDateTime(order.orderDate)}</td></tr>
                    {order.customerName && <tr><td>Customer:</td><td style={{ textAlign: 'right' }}>{order.customerName}</td></tr>}
                </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

            <table>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', padding: '4px 0', fontSize: '11px' }}>Item</th>
                        <th style={{ textAlign: 'center', padding: '4px 0', fontSize: '11px' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '4px 0', fontSize: '11px' }}>Amt</th>
                    </tr>
                </thead>
                <tbody>
                    {order.items?.map((item, i) => (
                        <tr key={i}>
                            <td style={{ padding: '2px 0', fontSize: '11px' }}>{item.productName}</td>
                            <td style={{ textAlign: 'center', padding: '2px 0', fontSize: '11px' }}>{item.quantity}</td>
                            <td style={{ textAlign: 'right', padding: '2px 0', fontSize: '11px' }}>{formatCurrency(item.subtotal)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="receipt-total">
                <table>
                    <tbody>
                        <tr>
                            <td style={{ fontWeight: 'bold' }}>TOTAL</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(order.totalAmount)}</td>
                        </tr>
                        <tr>
                            <td>Payment:</td>
                            <td style={{ textAlign: 'right' }}>{order.paymentMode}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="receipt-footer">
                <p>Thank you for choosing 3Monks!</p>
                <p>Stay Fresh, Stay Healthy 🍊</p>
            </div>
        </div>
    );
});

Receipt.displayName = 'Receipt';
export default Receipt;
