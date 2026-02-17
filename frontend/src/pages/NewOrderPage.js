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
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 20px; }
        table { width: 100%; } td { padding: 2px 0; } .center { text-align: center; }
        .right { text-align: right; } .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 8px 0; }
      </style></head><body>
      ${receiptRef.current?.innerHTML || ''}
      <script>window.print(); window.close();</script>
      </body></html>
    `);
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
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {['ALL', 'CREAMY_BLEND', 'CURATED_BLEND', 'SHOT'].map(f => (
                            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(f)}>
                                {f === 'ALL' ? 'All' : f === 'CREAMY_BLEND' ? '🍹 Creamy' : f === 'CURATED_BLEND' ? '🍸 Curated' : '🍊 Shots'}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        {filteredProducts.map(product => (
                            <div key={product.id} className="card" style={{ cursor: 'pointer', padding: '16px' }} onClick={() => addToCart(product)}>
                                <span className="badge badge-info" style={{ marginBottom: '8px' }}>{product.category.replace(/_/g, ' ')}</span>
                                <h4>{product.name}</h4>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>{formatCurrency(product.price)}</div>
                                {product.fruits?.length > 0 && (
                                    <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-light)' }}>
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
                            <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '20px' }}>Tap products to add to cart</p>
                        ) : (
                            <>
                                {cart.map(item => (
                                    <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{item.productName}</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-light)' }}>{formatCurrency(item.unitPrice)} each</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.productId, item.quantity - 1)}>-</button>
                                            <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                                            <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.productId, item.quantity + 1)}>+</button>
                                            <span style={{ fontWeight: 600, minWidth: '70px', textAlign: 'right' }}>{formatCurrency(item.unitPrice * item.quantity)}</span>
                                        </div>
                                    </div>
                                ))}

                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontWeight: 700, fontSize: '20px' }}>
                                    <span>Total</span>
                                    <span style={{ color: 'var(--primary)' }}>{formatCurrency(getTotal())}</span>
                                </div>
                            </>
                        )}

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
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
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['CASH', 'UPI'].map(mode => (
                                        <button key={mode} className={`btn ${paymentMode === mode ? 'btn-primary' : 'btn-outline'}`}
                                            onClick={() => setPaymentMode(mode)} style={{ flex: 1, justifyContent: 'center' }}>
                                            {mode === 'CASH' ? '💵' : '📱'} {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
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
