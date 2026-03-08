import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { publicService, orderService } from '../services/dataService';
import { formatCurrency } from '../utils/helpers';
import Receipt from '../components/Receipt';
import toast from 'react-hot-toast';
import {
    isBluetoothAvailable,
    isPrinterConnected,
    getPrinterName,
    connectPrinter,
    printReceipt as btPrintReceipt,
    disconnectPrinter,
} from '../services/bluetoothPrinter';

const QuickOrderPage = () => {
    const { user } = useAuth();
    const [products, setProducts] = useState([]);
    const [fruits, setFruits] = useState([]);
    const [code, setCode] = useState('');
    const [preview, setPreview] = useState(null);
    const [cart, setCart] = useState([]);
    const [paymentMode, setPaymentMode] = useState('CASH');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [order, setOrder] = useState(null);
    const [btConnected, setBtConnected] = useState(false);
    const [btPrinting, setBtPrinting] = useState(false);
    const [pendingOrders, setPendingOrders] = useState([]);
    const [completing, setCompleting] = useState(null);
    const inputRef = useRef();
    const receiptRef = useRef();

    const fetchPendingOrders = useCallback(async () => {
        try {
            const res = await orderService.getPendingOrders(user?.shopId);
            setPendingOrders(res.data.data || []);
        } catch (_) { /* silent */ }
    }, [user?.shopId]);

    useEffect(() => {
        Promise.all([
            publicService.getMenu(),
            publicService.getFruits(),
        ]).then(([menuRes, fruitRes]) => {
            setProducts(menuRes.data.data || []);
            setFruits(fruitRes.data.data || []);
        }).catch(() => toast.error('Failed to load menu'));
        fetchPendingOrders();
        const interval = setInterval(fetchPendingOrders, 10000);
        return () => clearInterval(interval);
    }, [fetchPendingOrders]);

    const handleComplete = async (orderId) => {
        setCompleting(orderId);
        try {
            await orderService.completeOrder(orderId);
            toast.success('Order delivered!');
            fetchPendingOrders();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to mark as delivered');
        } finally {
            setCompleting(null);
        }
    };

    // Build lookup maps
    const fruitByCode = {};
    fruits.forEach(f => { if (f.shortCode) fruitByCode[f.shortCode] = f; });

    const resolveCode = useCallback((input) => {
        const trimmed = input.trim();
        if (!trimmed || !/^\d+$/.test(trimmed)) return null;

        const digits = trimmed.split('').map(Number);

        // --- SHOT: 3 same digits (e.g. 222) ---
        if (digits.length === 3 && digits[0] === digits[1] && digits[1] === digits[2]) {
            const fruitCode = digits[0];
            const fruit = fruitByCode[fruitCode];
            if (!fruit) return { error: `No fruit with code ${fruitCode}` };
            // Find a SHOT product that contains this fruit
            const shotProduct = products.find(p =>
                p.category === 'SHOT' && p.fruits?.some(f => f.id === fruit.id)
            );
            if (!shotProduct) return { error: `No shot available for ${fruit.name}` };
            return {
                product: shotProduct,
                label: `🍊 ${shotProduct.name}`,
                type: 'SHOT',
            };
        }

        // --- CURATED BLEND: 2 different digits (e.g. 25) ---
        if (digits.length === 2 && digits[0] !== digits[1]) {
            const fruit1 = fruitByCode[digits[0]];
            const fruit2 = fruitByCode[digits[1]];
            if (!fruit1) return { error: `No fruit with code ${digits[0]}` };
            if (!fruit2) return { error: `No fruit with code ${digits[1]}` };

            // Find a CURATED_BLEND product with both fruits
            const curatedProduct = products.find(p =>
                p.category === 'CURATED_BLEND' &&
                p.fruits?.some(f => f.id === fruit1.id) &&
                p.fruits?.some(f => f.id === fruit2.id)
            );

            if (curatedProduct) {
                return {
                    product: curatedProduct,
                    label: `🍸 ${curatedProduct.name}`,
                    type: 'CURATED_BLEND',
                };
            }

            // No pre-made product — use the first available curated product with customization
            const anyCurated = products.find(p => p.category === 'CURATED_BLEND');
            if (!anyCurated) return { error: 'No curated blend available' };
            return {
                product: anyCurated,
                label: `🍸 ${fruit1.name} + ${fruit2.name} (Curated)`,
                type: 'CURATED_BLEND',
                customization: `${fruit1.name} + ${fruit2.name}`,
                customName: `${fruit1.name} + ${fruit2.name}`,
            };
        }

        // --- CREAMY BLEND: single digit (e.g. 2) ---
        if (digits.length === 1) {
            const fruitCode = digits[0];
            const fruit = fruitByCode[fruitCode];
            if (!fruit) return { error: `No fruit with code ${fruitCode}` };
            // Find a CREAMY_BLEND product that contains this fruit
            const creamyProduct = products.find(p =>
                p.category === 'CREAMY_BLEND' && p.fruits?.some(f => f.id === fruit.id)
            );
            if (!creamyProduct) return { error: `No creamy blend for ${fruit.name}` };
            return {
                product: creamyProduct,
                label: `🍹 ${creamyProduct.name}`,
                type: 'CREAMY_BLEND',
            };
        }

        // --- SAME DIGIT x2 (e.g. 22) — invalid combo ---
        if (digits.length === 2 && digits[0] === digits[1]) {
            return { error: `Can't combo ${fruitByCode[digits[0]]?.name || 'fruit'} with itself. Use ${digits[0]} for creamy or ${digits.join('')}${digits[0]} for shot.` };
        }

        return { error: 'Invalid code. Use 1 digit (creamy), 2 digits (curated), or 3 same digits (shot)' };
    }, [products, fruits, fruitByCode]); // eslint-disable-line

    const handleCodeChange = (e) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 3);
        setCode(val);
        if (val.length > 0) {
            setPreview(resolveCode(val));
        } else {
            setPreview(null);
        }
    };

    const addFromCode = () => {
        if (!preview || preview.error) return;
        const { product, customization, customName } = preview;

        const cartKey = customization ? `${product.id}-${customization}` : `${product.id}`;
        const existing = cart.find(item => item.cartKey === cartKey);

        if (existing) {
            setCart(cart.map(item =>
                item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item
            ));
        } else {
            setCart([...cart, {
                cartKey,
                productId: product.id,
                productName: customName || product.name,
                category: product.category,
                unitPrice: product.price,
                quantity: 1,
                customization: customization || undefined,
            }]);
        }
        setCode('');
        setPreview(null);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addFromCode();
        }
    };

    const updateQuantity = (cartKey, qty) => {
        if (qty <= 0) {
            setCart(cart.filter(item => item.cartKey !== cartKey));
        } else {
            setCart(cart.map(item =>
                item.cartKey === cartKey ? { ...item, quantity: qty } : item
            ));
        }
    };

    const getTotal = () => cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    const handleSubmit = async () => {
        if (cart.length === 0) { toast.error('Add items first'); return; }
        setLoading(true);
        try {
            const res = await orderService.createOrder({
                shopId: user.shopId,
                items: cart.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    customization: item.customization,
                })),
                paymentMode,
                customerName: customerName || undefined,
                customerPhone: customerPhone || undefined,
            });
            setOrder(res.data.data);
            toast.success('Order created!');
            setCart([]);
            fetchPendingOrders();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create order');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => { window.print(); };

    const handleConnectPrinter = async () => {
        try {
            const result = await connectPrinter();
            setBtConnected(true);
            toast.success(result.reconnected
                ? `Reconnected to ${result.name}`
                : `Connected to ${result.name}!`
            );
        } catch (e) {
            if (e.name === 'NotFoundError') return;
            toast.error(e.message || 'Failed to connect printer');
        }
    };

    const handleBluetoothPrint = async () => {
        if (!order) return;
        setBtPrinting(true);
        try {
            await btPrintReceipt(order);
            toast.success('Receipt printed!');
        } catch (e) {
            setBtConnected(false);
            toast.error(e.message || 'Print failed');
        } finally {
            setBtPrinting(false);
        }
    };

    const handleShare = async () => {
        if (!order) return;
        const text = `3Monks Receipt\nOrder: ${order.orderNumber}\nToken: #${order.tokenNumber}\nTotal: ${formatCurrency(order.totalAmount)}\nPayment: ${order.paymentMode}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: `Receipt ${order.orderNumber}`, text });
                toast.success('Shared');
            } else {
                await navigator.clipboard.writeText(text);
                toast.success('Copied to clipboard');
            }
        } catch (e) {
            if (e.name !== 'AbortError') toast.error('Share failed');
        }
    };

    // === ORDER CONFIRMED VIEW ===
    if (order) {
        const btAvailable = isBluetoothAvailable();
        const printerReady = btConnected && isPrinterConnected();
        const printerName = getPrinterName();

        return (
            <div>
                <div className="page-header">
                    <h1>Order Confirmed! ✅</h1>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {btAvailable && (
                            printerReady ? (
                                <button className="btn btn-primary" onClick={handleBluetoothPrint} disabled={btPrinting}
                                    style={{ minWidth: '120px' }}>
                                    {btPrinting ? '⏳ Printing...' : '🖨️ Print'}
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={handleConnectPrinter}>🔗 Connect Printer</button>
                            )
                        )}
                        <button className="btn btn-outline" onClick={handlePrint}>🖨️ System Print</button>
                        <button className="btn btn-outline" onClick={handleShare}>📤 Share</button>
                        <button className="btn btn-outline" onClick={() => { setOrder(null); setCustomerName(''); setCustomerPhone(''); }}>New Order</button>
                    </div>
                </div>
                {printerReady && printerName && (
                    <div style={{
                        background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.3)',
                        borderRadius: '8px', padding: '8px 16px', marginBottom: '16px', fontSize: '13px',
                        color: '#4caf50', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span>✅ Connected: <strong>{printerName}</strong></span>
                        <button onClick={() => { disconnectPrinter(); setBtConnected(false); }}
                            style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '12px' }}>
                            Disconnect
                        </button>
                    </div>
                )}
                <div className="card"><Receipt ref={receiptRef} order={order} /></div>
            </div>
        );
    }

    // === QUICK ORDER VIEW ===
    return (
        <div className="quick-order-page">
            {/* Compact Fruit Codes Strip */}
            <div className="quick-codes-strip">
                <div className="quick-codes-pills">
                    {fruits.filter(f => f.shortCode && f.active !== false).sort((a, b) => a.shortCode - b.shortCode).map(f => (
                        <div key={f.id} className="quick-cheat-pill" onClick={() => { setCode(String(f.shortCode)); setPreview(resolveCode(String(f.shortCode))); }}>
                            <span className="quick-cheat-code">{f.shortCode}</span>
                            <span className="quick-cheat-fruit">{f.name}</span>
                        </div>
                    ))}
                </div>
                <div className="quick-codes-legend">
                    <span>🍹1=Creamy</span>
                    <span>🍸2=Combo</span>
                    <span>🍊3=Shot</span>
                </div>
            </div>

            <div className="quick-order-grid">
                {/* Left: Numpad + Preview */}
                <div>
                    {/* Code Display + Preview */}
                    <div className="card quick-input-card">
                        <div className="quick-code-display">
                            <span className="quick-code-digits">{code || '—'}</span>
                        </div>

                        {/* Preview — fixed height so numpad doesn't shift */}
                        <div className="quick-preview-container">
                            {preview && (
                                <div className={`quick-preview ${preview.error ? 'quick-preview-error' : 'quick-preview-ok'}`}>
                                    {preview.error ? (
                                        <span>❌ {preview.error}</span>
                                    ) : (
                                        <span>
                                            {preview.label}
                                            <span className="quick-preview-price">{formatCurrency(preview.product.price)}</span>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Numpad */}
                        <div className="quick-numpad">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                <button key={n} className="quick-numpad-btn quick-numpad-digit" onClick={() => {
                                    const val = (code + String(n)).slice(0, 3);
                                    setCode(val);
                                    setPreview(resolveCode(val));
                                }}>
                                    {n}
                                </button>
                            ))}
                            <button className="quick-numpad-btn quick-numpad-clear" onClick={() => { setCode(''); setPreview(null); }}>
                                C
                            </button>
                            <button className="quick-numpad-btn quick-numpad-digit" onClick={() => {
                                const val = (code + '0').slice(0, 3);
                                setCode(val);
                                setPreview(resolveCode(val));
                            }}>
                                0
                            </button>
                            <button
                                className="quick-numpad-btn quick-numpad-enter"
                                onClick={addFromCode}
                                disabled={!preview || !!preview.error}
                            >
                                Add ↵
                            </button>
                        </div>
                    </div>

                    {/* Hidden input for keyboard support */}
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="none"
                        className="quick-hidden-input"
                        value={code}
                        onChange={handleCodeChange}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                {/* Center: Cart + Place Order */}
                <div>
                    <div className="card">
                        <h3 style={{ marginBottom: '12px' }}>🛒 Cart ({cart.length})</h3>

                        {cart.length === 0 ? (
                            <p className="order-cart-empty">Enter codes to add items</p>
                        ) : (
                            <>
                                {cart.map(item => (
                                    <div key={item.cartKey} className="order-cart-item">
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{item.productName}</div>
                                            <div className="order-cart-item-price">{formatCurrency(item.unitPrice)} each</div>
                                        </div>
                                        <div className="order-cart-item-controls">
                                            <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}>-</button>
                                            <span className="order-cart-item-qty">{item.quantity}</span>
                                            <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}>+</button>
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
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div className="form-group" style={{ flex: 1, marginBottom: '8px' }}>
                                    <input className="form-control" placeholder="Name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                                </div>
                                <div className="form-group" style={{ flex: 1, marginBottom: '8px' }}>
                                    <input className="form-control" placeholder="Phone (optional)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '8px' }}>
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

                {/* Right: Order Queue */}
                <div>
                    <div className="card quick-queue-panel">
                        <h3 style={{ marginBottom: '8px' }}>📋 Queue ({pendingOrders.length})</h3>
                        {pendingOrders.length === 0 ? (
                            <p style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>✅ All delivered!</p>
                        ) : (
                            <div className="quick-queue-list">
                                {pendingOrders.map((o, idx) => (
                                    <div key={o.id} className={`quick-queue-item ${idx === 0 ? 'quick-queue-item-active' : ''}`}>
                                        <div className="quick-queue-item-header">
                                            <span className="quick-queue-item-token">#{o.tokenNumber}</span>
                                            <span className="quick-queue-item-time">
                                                {new Date(o.orderDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="quick-queue-item-detail">
                                            {o.items?.map(i => `${i.quantity}× ${i.productName}`).join(', ')}
                                        </div>
                                        <button
                                            className="btn btn-sm btn-primary quick-queue-done-btn"
                                            onClick={() => handleComplete(o.id)}
                                            disabled={completing === o.id}
                                        >
                                            {completing === o.id ? '⏳' : '✅ Done'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuickOrderPage;
