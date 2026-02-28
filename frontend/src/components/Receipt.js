import React from 'react';
import { formatCurrency, formatDateTime } from '../utils/helpers';

const Receipt = React.forwardRef(({ order, shop }, ref) => {
    if (!order) return null;

    return (
        <div ref={ref} className="receipt">
            {/* Header */}
            <div className="receipt-header">
                <h3>3Monks</h3>
                <p className="receipt-tagline">100% Real Fruit. No Artificial Flavor.</p>
                <div className="receipt-shop-info">
                    <p>{shop?.name || order.shopName}</p>
                    {shop?.address && <p>{shop.address}</p>}
                    {shop?.gstNumber && <p>GST: {shop.gstNumber}</p>}
                </div>
            </div>

            {/* Order Details */}
            <div className="receipt-section">
                <table className="receipt-info-table">
                    <tbody>
                        <tr><td>Order</td><td>{order.orderNumber}</td></tr>
                        <tr><td>Date</td><td>{formatDateTime(order.orderDate)}</td></tr>
                        {order.customerName && <tr><td>Customer</td><td>{order.customerName}</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Items */}
            <div className="receipt-section">
                <table className="receipt-items-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.items?.map((item, i) => (
                            <tr key={i}>
                                <td>{item.productName}</td>
                                <td className="text-center">{item.quantity}</td>
                                <td className="text-right">{formatCurrency(item.subtotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Total */}
            <div className="receipt-total">
                <table>
                    <tbody>
                        <tr className="receipt-total-row">
                            <td>Total</td>
                            <td className="text-right">{formatCurrency(order.totalAmount)}</td>
                        </tr>
                        <tr className="receipt-payment-row">
                            <td>Payment</td>
                            <td className="text-right">{order.paymentMode}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="receipt-footer">
                <p>Thank you for visiting 3Monks!</p>
            </div>
        </div>
    );
});

Receipt.displayName = 'Receipt';
export default Receipt;
