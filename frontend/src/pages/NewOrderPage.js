import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { publicService, orderService } from '../services/dataService';
import { formatCurrency } from '../utils/helpers';
import Receipt from '../components/Receipt';
import toast from 'react-hot-toast';

const NewOrderPage = () => {
    const { user } = useAuth();
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [paymentMode, setPaymentMode] = useState('CASH');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [order, setOrder] = useState(null);
    const [filter, setFilter] = useState('ALL');
    const receiptRef = useRef();

    useEffect(() => {
        publicService.getMenu()
            .then(res => setProducts(res.data.data || []))
            .catch(() => toast.error('Failed to load menu'));
    }, []);

    const addToCart = (product) => {
        const existing = cart.find(item => item.productId === product.id);
        if (existing) {
            setCart(cart.map(item =>
                item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
            ));
        } else {
            setCart([...cart, {
                productId: product.id,
                productName: product.name,
                category: product.category,
                unitPrice: product.price,
                quantity: 1,
            }]);
        }
    };

    const updateQuantity = (productId, qty) => {
        if (qty <= 0) {
            setCart(cart.filter(item => item.productId !== productId));
        } else {
            setCart(cart.map(item =>
                item.productId === productId ? { ...item, quantity: qty } : item
            ));
        }
    };

    const getTotal = () => cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    const handleSubmit = async () => {
        if (cart.length === 0) { toast.error('Add items to cart'); return; }
        setLoading(true);
        try {
            const res = await orderService.createOrder({
                shopId: user.shopId,
                items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })),
                paymentMode,
                customerName: customerName || undefined,
                customerPhone: customerPhone || undefined,
            });
            setOrder(res.data.data);
            toast.success('Order created successfully!');
            setCart([]);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create order');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        const receiptHTML = receiptRef.current?.innerHTML || '';
        if (!receiptHTML) { toast.error('No receipt to print'); return; }

        // Remove any previous print iframe
        const oldFrame = document.getElementById('receipt-print-frame');
        if (oldFrame) oldFrame.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'receipt-print-frame';
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 12px;
    line-height: 1.4;
    color: #000;
    background: #fff;
    width: 80mm;
    padding: 4mm 3mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt { width: 100%; background: #fff; padding: 0; border: none; box-shadow: none; max-width: none; margin: 0; font-family: inherit; font-size: inherit; border-radius: 0; }
  .receipt-header { text-align: center; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px dashed #000 !important; }
  .receipt-header img { display: none; }
  .receipt-header h3 { font-size: 16px; font-weight: bold; font-family: 'Courier New', monospace; margin-bottom: 2px; color: #000 !important; -webkit-text-fill-color: #000 !important; background: none !important; }
  .receipt-header p { font-size: 11px; margin: 1px 0; color: #000; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 2px 0; font-size: 11px; color: #000; border: none !important; background: none !important; vertical-align: top; }
  th { font-weight: bold; border-bottom: 1px dashed #000 !important; padding-bottom: 4px; }
  .receipt-total { border-top: 1px dashed #000 !important; padding-top: 6px; margin-top: 6px; font-weight: bold; }
  .receipt-total td { font-size: 13px; padding: 2px 0; }
  .receipt-footer { text-align: center; border-top: 1px dashed #000 !important; padding-top: 8px; margin-top: 8px; font-size: 11px; color: #000; }
  .receipt-footer p { margin: 2px 0; }
  div[style*="border-top"] { border-top: 1px dashed #000 !important; }
  @media print {
    html, body { width: 80mm; margin: 0; padding: 4mm 3mm; }
    .receipt { page-break-inside: avoid; }
  }
</style>
</head><body>
${receiptHTML}
</body></html>`);
        doc.close();

        // Wait for content to render then print
        iframe.onload = () => {
            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) {
                    // Fallback: open in new window
                    const w = window.open('', '_blank');
                    w.document.write(doc.documentElement.outerHTML);
                    w.document.close();
                    w.focus();
                    w.print();
                }
                // Cleanup after print dialog closes
                setTimeout(() => { iframe.remove(); }, 3000);
            }, 300);
        };
    };

    const filteredProducts = filter === 'ALL' ? products : products.filter(p => p.category === filter);

    if (order) {
        return (
            <div>
                <div className="page-header">
                    <h1>Order Confirmed! ✅</h1>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary" onClick={handlePrint}>🖨️ Print Receipt</button>
                        <button className="btn btn-outline" onClick={() => { setOrder(null); setCustomerName(''); setCustomerPhone(''); }}>New Order</button>
                    </div>
                </div>
                <div className="card">
                    <Receipt ref={receiptRef} order={order} />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header"><h1>New Order</h1></div>

            <div className="grid-2">
                {/* Menu Section */}
                <div>
                    <div className="order-filter-bar">
                        {['ALL', 'CREAMY_BLEND', 'CURATED_BLEND', 'SHOT'].map(f => (
                            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(f)}>
                                {f === 'ALL' ? 'All' : f === 'CREAMY_BLEND' ? '🍹 Creamy' : f === 'CURATED_BLEND' ? '🍸 Curated' : '🍊 Shots'}
                            </button>
                        ))}
                    </div>
                    <div className="order-product-grid">
                        {filteredProducts.map(product => (
                            <div key={product.id} className="card order-product-card" onClick={() => addToCart(product)}>
                                <span className="badge badge-info" style={{ marginBottom: '8px' }}>{product.category.replace(/_/g, ' ')}</span>
                                <h4>{product.name}</h4>
                                <div className="order-product-price">{formatCurrency(product.price)}</div>
                                {product.fruits?.length > 0 && (
                                    <div className="order-product-fruits">
                                        {product.fruits.map(f => f.name).join(', ')}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Cart Section */}
                <div>
                    <div className="card">
                        <h3 style={{ marginBottom: '16px' }}>🛒 Cart ({cart.length} items)</h3>

                        {cart.length === 0 ? (
                            <p className="order-cart-empty">Tap products to add to cart</p>
                        ) : (
                            <>
                                {cart.map(item => (
                                    <div key={item.productId} className="order-cart-item">
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{item.productName}</div>
                                            <div className="order-cart-item-price">{formatCurrency(item.unitPrice)} each</div>
                                        </div>
                                        <div className="order-cart-item-controls">
                                            <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.productId, item.quantity - 1)}>-</button>
                                            <span className="order-cart-item-qty">{item.quantity}</span>
                                            <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.productId, item.quantity + 1)}>+</button>
                                            <span className="order-cart-item-total">{formatCurrency(item.unitPrice * item.quantity)}</span>
                                        </div>
                                    </div>
                                ))}

                                <div className="order-cart-total">
                                    <span>Total</span>
                                    <span style={{ color: 'var(--primary)' }}>{formatCurrency(getTotal())}</span>
                                </div>
                            </>
                        )}

                        <div className="order-cart-form">
                            <div className="form-group">
                                <label>Customer Name (optional)</label>
                                <input className="form-control" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Customer Phone (optional)</label>
                                <input className="form-control" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Payment Mode</label>
                                <div className="order-payment-modes">
                                    {['CASH', 'UPI'].map(mode => (
                                        <button key={mode} className={`btn ${paymentMode === mode ? 'btn-primary' : 'btn-outline'} order-payment-btn`}
                                            onClick={() => setPaymentMode(mode)}>
                                            {mode === 'CASH' ? '💵' : '📱'} {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button className="btn btn-primary btn-lg order-submit-btn"
                                onClick={handleSubmit} disabled={cart.length === 0 || loading}>
                                {loading ? 'Processing...' : `Place Order • ${formatCurrency(getTotal())}`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewOrderPage;
