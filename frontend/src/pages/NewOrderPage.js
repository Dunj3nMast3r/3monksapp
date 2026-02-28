import React, { useState, useEffect, useRef } from 'react';
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
    printReceipt,
    disconnectPrinter,
} from '../services/bluetoothPrinter';

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
    const [btConnected, setBtConnected] = useState(false);
    const [btPrinting, setBtPrinting] = useState(false);
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
        // Fallback: system print dialog (if Bluetooth not connected)
        window.print();
    };

    const handleConnectPrinter = async () => {
        try {
            const result = await connectPrinter();
            setBtConnected(true);
            toast.success(result.reconnected
                ? `Reconnected to ${result.name}`
                : `Connected to ${result.name}! Tap 🖨️ to print instantly.`
            );
        } catch (e) {
            if (e.name === 'NotFoundError') return; // User cancelled picker
            toast.error(e.message || 'Failed to connect printer');
        }
    };

    const handleBluetoothPrint = async () => {
        if (!order) return;
        setBtPrinting(true);
        try {
            await printReceipt(order);
            toast.success('Receipt printed!');
        } catch (e) {
            setBtConnected(false);
            toast.error(e.message || 'Print failed');
        } finally {
            setBtPrinting(false);
        }
    };

    const buildReceiptLines = () => {
        const lines = [];
        lines.push('');
        lines.push('          3 M O N K S           ');
        lines.push('  Real Fruit | No Artificial    ');
        lines.push('');
        if (order.shopName) lines.push(`  ${order.shopName}`);
        lines.push('--------------------------------');
        lines.push(`Order  : ${order.orderNumber}`);
        const dateStr = new Date(order.orderDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        lines.push(`Date   : ${dateStr}`);
        if (order.customerName) lines.push(`Customer: ${order.customerName}`);
        lines.push('--------------------------------');
        lines.push('Item              Qty      Amt');
        lines.push('--------------------------------');
        order.items?.forEach(item => {
            const name = item.productName.length > 18
                ? item.productName.slice(0, 18)
                : item.productName.padEnd(18);
            const qty = String(item.quantity).padStart(3);
            const amt = formatCurrency(item.subtotal).padStart(10);
            lines.push(`${name}${qty}${amt}`);
        });
        lines.push('--------------------------------');
        const totalAmt = formatCurrency(order.totalAmount);
        const totalPad = 32 - 5 - totalAmt.length;
        lines.push(`TOTAL${' '.repeat(Math.max(1, totalPad))}${totalAmt}`);
        lines.push(`Paid by${' '.repeat(Math.max(1, 32 - 7 - order.paymentMode.length))}${order.paymentMode}`);
        lines.push('--------------------------------');
        lines.push(' Thank you for visiting 3Monks! ');
        lines.push('');
        return lines;
    };

    const handleShare = async () => {
        if (!order) return;

        const lines = buildReceiptLines();
        const receiptText = lines.join('\n');

        if (navigator.share) {
            try {
                // Generate a high-quality receipt image (2x scale for sharpness)
                const scale = 2;
                const fontSize = 16 * scale;
                const lineHeight = 22 * scale;
                const paddingX = 16 * scale;
                const paddingY = 20 * scale;
                const canvasWidth = 576; // 80mm at 183 DPI ≈ 576px (standard thermal width)

                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth;
                canvas.height = (lines.length * lineHeight) + (paddingY * 2);
                const ctx = canvas.getContext('2d');

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Bold black monospace text
                ctx.fillStyle = '#000000';
                ctx.font = `${fontSize}px "Courier New", "Courier", monospace`;
                ctx.textBaseline = 'top';

                lines.forEach((line, i) => {
                    ctx.fillText(line, paddingX, paddingY + (i * lineHeight));
                });

                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const file = new File([blob], `receipt-${order.orderNumber}.png`, { type: 'image/png' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `Receipt ${order.orderNumber}`,
                        files: [file],
                    });
                    toast.success('Receipt shared');
                    return;
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
            }

            // Fallback: share as text
            try {
                await navigator.share({ title: `Receipt ${order.orderNumber}`, text: receiptText });
                toast.success('Receipt shared');
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        // Final fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(receiptText);
            toast.success('Receipt copied to clipboard');
        } catch {
            toast.error('Could not share receipt');
        }
    };

    const filteredProducts = filter === 'ALL' ? products : products.filter(p => p.category === filter);

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
                                <button
                                    className="btn btn-primary"
                                    onClick={handleBluetoothPrint}
                                    disabled={btPrinting}
                                    style={{ minWidth: '120px' }}
                                >
                                    {btPrinting ? '⏳ Printing...' : '🖨️ Print'}
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={handleConnectPrinter}>
                                    🔗 Connect Printer
                                </button>
                            )
                        )}
                        <button className="btn btn-outline" onClick={handlePrint}>🖨️ System Print</button>
                        <button className="btn btn-outline" onClick={handleShare}>📤 Share</button>
                        <button className="btn btn-outline" onClick={() => { setOrder(null); setCustomerName(''); setCustomerPhone(''); }}>New Order</button>
                    </div>
                </div>
                {printerReady && printerName && (
                    <div style={{
                        background: 'rgba(76,175,80,0.1)',
                        border: '1px solid rgba(76,175,80,0.3)',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        marginBottom: '16px',
                        fontSize: '13px',
                        color: '#4caf50',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <span>✅ Connected: <strong>{printerName}</strong></span>
                        <button
                            onClick={() => { disconnectPrinter(); setBtConnected(false); }}
                            style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '12px' }}
                        >
                            Disconnect
                        </button>
                    </div>
                )}
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
