import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { publicService } from '../services/dataService';
import { formatCurrency } from '../utils/helpers';

/* ───── Intersection Observer hook for scroll-reveal ───── */
const useReveal = (threshold = 0.15) => {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } }, { threshold });
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);
    return [ref, visible];
};

/* ───── Animated counter ───── */
const Counter = ({ end, suffix = '', duration = 2000 }) => {
    const [count, setCount] = useState(0);
    const [ref, visible] = useReveal(0.3);
    useEffect(() => {
        if (!visible) return;
        let start = 0;
        const step = end / (duration / 16);
        const timer = setInterval(() => { start += step; if (start >= end) { setCount(end); clearInterval(timer); } else setCount(Math.floor(start)); }, 16);
        return () => clearInterval(timer);
    }, [visible, end, duration]);
    return <span ref={ref}>{count}{suffix}</span>;
};

const LandingPage = () => {
    const [products, setProducts] = useState([]);
    const [scrolled, setScrolled] = useState(false);
    const [activeCategory, setActiveCategory] = useState('ALL');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        publicService.getMenu().then(res => setProducts(res.data.data || [])).catch(() => { });
    }, []);

    const handleScroll = useCallback(() => setScrolled(window.scrollY > 60), []);
    useEffect(() => { window.addEventListener('scroll', handleScroll, { passive: true }); return () => window.removeEventListener('scroll', handleScroll); }, [handleScroll]);

    const categories = ['ALL', 'CREAMY_BLEND', 'CURATED_BLEND', 'SHOT'];
    const catLabels = { ALL: 'All', CREAMY_BLEND: 'Creamy Blends', CURATED_BLEND: 'Curated Blends', SHOT: 'Shots' };
    const filtered = activeCategory === 'ALL' ? products : products.filter(p => p.category === activeCategory);

    const fruitImages = ['🍊', '🍋', '🍎', '🍇', '🍓', '🥭', '🍍', '🍉', '🥝', '🍌', '🫐', '🍑', '🍒', '🥥', '🍈', '🍐', '🥑'];

    /* reveal refs */
    const [featRef, featVis] = useReveal();
    const [statsRef, statsVis] = useReveal();
    const [menuRef, menuVis] = useReveal();
    const [aboutRef, aboutVis] = useReveal();
    const [ctaRef, ctaVis] = useReveal();

    return (
        <div className="lp">
            {/* ═══ NAVBAR ═══ */}
            <nav className={`lp-nav${scrolled ? ' lp-nav--scrolled' : ''}`}>
                <div className="lp-container">
                    <div className="lp-nav__brand">
                        <img src="/logo.svg" alt="3Monks" className="lp-nav__logo" />
                        <span className="lp-nav__name">3<em>Monks</em></span>
                    </div>
                    <div className={`lp-nav__links${mobileMenuOpen ? ' lp-nav__links--open' : ''}`}>
                        <a href="#features" onClick={() => setMobileMenuOpen(false)}>Why Us</a>
                        <a href="#menu" onClick={() => setMobileMenuOpen(false)}>Menu</a>
                        <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
                        <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact</a>
                        <Link to="/login" className="lp-btn lp-btn--primary lp-btn--sm" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                    </div>
                    <button className="lp-nav__burger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
                        <span /><span /><span />
                    </button>
                </div>
            </nav>

            {/* ═══ HERO ═══ */}
            <section className="lp-hero">
                {/* Floating fruit elements */}
                <div className="lp-hero__floats">
                    <span className="lp-float lp-float--1">🍊</span>
                    <span className="lp-float lp-float--2">🍓</span>
                    <span className="lp-float lp-float--3">🥭</span>
                    <span className="lp-float lp-float--4">🍇</span>
                    <span className="lp-float lp-float--5">🍋</span>
                    <span className="lp-float lp-float--6">🥝</span>
                    <span className="lp-float lp-float--7">🫐</span>
                    <span className="lp-float lp-float--8">🍍</span>
                </div>

                <div className="lp-container lp-hero__inner">
                    <div className="lp-hero__badge lp-fade-in">
                        <span className="lp-pulse" />
                        100% Real Fruit — Zero Artificial Flavors
                    </div>
                    <h1 className="lp-hero__title lp-fade-in lp-fade-in--d1">
                        Fresh Fruit<br />
                        <span className="lp-gradient-text">Shots & Blends</span>
                    </h1>
                    <p className="lp-hero__sub lp-fade-in lp-fade-in--d2">
                        Pure, healthy, and handcrafted with love. Experience nature's finest in every sip.
                    </p>
                    <div className="lp-hero__actions lp-fade-in lp-fade-in--d3">
                        <a href="#menu" className="lp-btn lp-btn--light lp-btn--lg">
                            <span>Explore Menu</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </a>
                        <a href="#about" className="lp-btn lp-btn--ghost lp-btn--lg">Our Story</a>
                    </div>
                </div>

                <div className="lp-hero__wave">
                    <svg viewBox="0 0 1440 120" preserveAspectRatio="none">
                        <path d="M0,64L48,58.7C96,53,192,43,288,48C384,53,480,75,576,80C672,85,768,75,864,64C960,53,1056,43,1152,48C1248,53,1344,75,1392,85.3L1440,96L1440,120L0,120Z" fill="currentColor" />
                    </svg>
                </div>
            </section>

            {/* ═══ STATS RIBBON ═══ */}
            <section className="lp-stats" ref={statsRef}>
                <div className="lp-container">
                    <div className={`lp-stats__grid${statsVis ? ' lp-reveal' : ''}`}>
                        <div className="lp-stats__item">
                            <div className="lp-stats__num"><Counter end={17} suffix="+" /></div>
                            <div className="lp-stats__label">Fresh Products</div>
                        </div>
                        <div className="lp-stats__item">
                            <div className="lp-stats__num"><Counter end={100} suffix="%" /></div>
                            <div className="lp-stats__label">Real Fruit</div>
                        </div>
                        <div className="lp-stats__item">
                            <div className="lp-stats__num"><Counter end={9} suffix="" /></div>
                            <div className="lp-stats__label">Exotic Fruits</div>
                        </div>
                        <div className="lp-stats__item">
                            <div className="lp-stats__num"><Counter end={0} suffix="" />%</div>
                            <div className="lp-stats__label">Preservatives</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ FEATURES ═══ */}
            <section id="features" className="lp-section" ref={featRef}>
                <div className="lp-container">
                    <div className={`lp-section__head${featVis ? ' lp-reveal' : ''}`}>
                        <span className="lp-section__tag">Why Choose Us</span>
                        <h2>Crafted for Your <span className="lp-gradient-text">Well-Being</span></h2>
                        <p>Every sip is a step towards a healthier you</p>
                    </div>
                    <div className={`lp-features${featVis ? ' lp-reveal' : ''}`}>
                        {[
                            { icon: '🍊', title: '100% Real Fruit', desc: 'No artificial flavors, colors, or preservatives. Pure fruit from farm to glass.', color: '#ff922b' },
                            { icon: '⚡', title: 'Power Shots', desc: 'Single-fruit energy shots packed with vitamins for an instant natural boost.', color: '#7c3aed' },
                            { icon: '🥤', title: 'Creamy Blends', desc: 'Rich, thick smoothies blended with milk for a satisfying creamy experience.', color: '#f59e0b' },
                            { icon: '🧪', title: 'Curated Combos', desc: 'Expert-crafted 2-fruit combos designed for the perfect flavor balance.', color: '#10b981' },
                            { icon: '🌿', title: 'Farm Fresh', desc: 'Sourced daily from trusted farmers. Maximum freshness in every serving.', color: '#06b6d4' },
                            { icon: '💜', title: 'Made with Love', desc: 'Every blend is prepared fresh to order with care and passion.', color: '#ec4899' },
                        ].map((f, i) => (
                            <div key={i} className="lp-feature" style={{ '--accent': f.color, '--delay': `${i * 0.08}s` }}>
                                <div className="lp-feature__icon">{f.icon}</div>
                                <h3>{f.title}</h3>
                                <p>{f.desc}</p>
                                <div className="lp-feature__glow" />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ MENU ═══ */}
            <section id="menu" className="lp-section lp-section--alt" ref={menuRef}>
                <div className="lp-container">
                    <div className={`lp-section__head${menuVis ? ' lp-reveal' : ''}`}>
                        <span className="lp-section__tag">Our Menu</span>
                        <h2>Freshly Made <span className="lp-gradient-text">To Order</span></h2>
                        <p>Choose from our handcrafted shots and blends</p>
                    </div>

                    {/* Category Tabs */}
                    <div className={`lp-tabs${menuVis ? ' lp-reveal' : ''}`}>
                        {categories.map(cat => (
                            <button key={cat} className={`lp-tab${activeCategory === cat ? ' lp-tab--active' : ''}`} onClick={() => setActiveCategory(cat)}>
                                {catLabels[cat]}
                            </button>
                        ))}
                    </div>

                    <div className={`lp-menu-grid${menuVis ? ' lp-reveal' : ''}`}>
                        {(filtered.length > 0 ? filtered : [
                            { id: 1, name: 'Coconut Charm', category: 'CREAMY_BLEND', price: 90 },
                            { id: 2, name: 'Mango Melt', category: 'CREAMY_BLEND', price: 90 },
                            { id: 3, name: 'Blueberry Bliss', category: 'CREAMY_BLEND', price: 90 },
                            { id: 4, name: 'Mango + Strawberry', category: 'CURATED_BLEND', price: 90 },
                            { id: 5, name: 'Blueberry + Jamun', category: 'CURATED_BLEND', price: 90 },
                            { id: 6, name: 'Jamun Detoxer', category: 'SHOT', price: 40 },
                            { id: 7, name: 'Kiwi Green Gut', category: 'SHOT', price: 40 },
                            { id: 8, name: 'Mango Delight', category: 'SHOT', price: 40 },
                        ].filter(p => activeCategory === 'ALL' || p.category === activeCategory)).map((product, i) => (
                            <div key={product.id} className="lp-product" style={{ '--delay': `${i * 0.06}s` }}>
                                <div className="lp-product__img">
                                    <span>{fruitImages[i % fruitImages.length]}</span>
                                    <div className="lp-product__badge">{catLabels[product.category] || product.category?.replace('_', ' ')}</div>
                                </div>
                                <div className="lp-product__body">
                                    <h3>{product.name}</h3>
                                    {product.description && <p className="lp-product__desc">{product.description}</p>}
                                    <div className="lp-product__footer">
                                        <span className="lp-product__price">{formatCurrency(product.price)}</span>
                                        {product.fruits?.length > 0 && (
                                            <div className="lp-product__fruits">
                                                {product.fruits.map(f => <span key={f.id} className="lp-chip">{f.name}</span>)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ ABOUT ═══ */}
            <section id="about" className="lp-section" ref={aboutRef}>
                <div className="lp-container">
                    <div className={`lp-about${aboutVis ? ' lp-reveal' : ''}`}>
                        <div className="lp-about__visual">
                            <div className="lp-about__circle">
                                <span className="lp-about__emoji">🍊</span>
                            </div>
                            <div className="lp-about__orbit">
                                <span style={{ '--i': 0 }}>🍓</span>
                                <span style={{ '--i': 1 }}>🥭</span>
                                <span style={{ '--i': 2 }}>🍇</span>
                                <span style={{ '--i': 3 }}>🥝</span>
                                <span style={{ '--i': 4 }}>🫐</span>
                                <span style={{ '--i': 5 }}>🍋</span>
                            </div>
                        </div>
                        <div className="lp-about__text">
                            <span className="lp-section__tag">Our Story</span>
                            <h2>The <span className="lp-gradient-text">3Monks</span> Philosophy</h2>
                            <p>
                                At 3Monks, we believe in the power of nature's finest fruits. Every shot and blend
                                is crafted with <strong>100% real fruit</strong> — no artificial flavors, no preservatives,
                                just pure goodness.
                            </p>
                            <p>
                                Our mission is to make healthy living delicious and accessible to everyone.
                                From farm-fresh sourcing to handcrafted preparation, every step is designed
                                to bring you the best nature has to offer.
                            </p>
                            <div className="lp-about__highlights">
                                <div className="lp-highlight">
                                    <div className="lp-highlight__icon">✓</div>
                                    <span>No Artificial Flavors</span>
                                </div>
                                <div className="lp-highlight">
                                    <div className="lp-highlight__icon">✓</div>
                                    <span>Zero Preservatives</span>
                                </div>
                                <div className="lp-highlight">
                                    <div className="lp-highlight__icon">✓</div>
                                    <span>Farm Fresh Daily</span>
                                </div>
                                <div className="lp-highlight">
                                    <div className="lp-highlight__icon">✓</div>
                                    <span>Made to Order</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ CTA BANNER ═══ */}
            <section className="lp-cta" ref={ctaRef}>
                <div className="lp-container">
                    <div className={`lp-cta__inner${ctaVis ? ' lp-reveal' : ''}`}>
                        <h2>Ready to taste the <span className="lp-gradient-text">difference</span>?</h2>
                        <p>Visit our store for the freshest fruit shots and blends in town</p>
                        <a href="#contact" className="lp-btn lp-btn--light lp-btn--lg">Find Us Nearby</a>
                    </div>
                </div>
            </section>

            {/* ═══ CONTACT ═══ */}
            <section id="contact" className="lp-section lp-section--alt">
                <div className="lp-container">
                    <div className="lp-section__head lp-reveal">
                        <span className="lp-section__tag">Get in Touch</span>
                        <h2>Visit <span className="lp-gradient-text">3Monks</span></h2>
                        <p>We'd love to serve you fresh</p>
                    </div>
                    <div className="lp-contact-grid lp-reveal">
                        <div className="lp-contact-card">
                            <div className="lp-contact-card__icon">📍</div>
                            <h3>Our Location</h3>
                            <p>3Monks - Main Branch</p>
                            <p>Main Street, City Center</p>
                        </div>
                        <div className="lp-contact-card">
                            <div className="lp-contact-card__icon">🕐</div>
                            <h3>Working Hours</h3>
                            <p>Mon - Sat: 8AM - 9PM</p>
                            <p>Sunday: 9AM - 8PM</p>
                        </div>
                        <div className="lp-contact-card">
                            <div className="lp-contact-card__icon">📞</div>
                            <h3>Contact Us</h3>
                            <p>+91 99999 99999</p>
                            <p>hello@3monks.com</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ FOOTER ═══ */}
            <footer className="lp-footer">
                <div className="lp-container">
                    <div className="lp-footer__grid">
                        <div className="lp-footer__brand">
                            <div className="lp-footer__logo">
                                <img src="/logo.svg" alt="3Monks" />
                                <span>3<em>Monks</em></span>
                            </div>
                            <p>100% Real Fruit Shots & Creamy Blends.<br />Stay Fresh, Stay Healthy.</p>
                        </div>
                        <div className="lp-footer__col">
                            <h4>Quick Links</h4>
                            <a href="#menu">Menu</a>
                            <a href="#about">About</a>
                            <a href="#contact">Contact</a>
                            <Link to="/login">Dashboard</Link>
                        </div>
                        <div className="lp-footer__col">
                            <h4>Categories</h4>
                            <a href="#menu" onClick={() => setActiveCategory('SHOT')}>Shots</a>
                            <a href="#menu" onClick={() => setActiveCategory('CREAMY_BLEND')}>Creamy Blends</a>
                            <a href="#menu" onClick={() => setActiveCategory('CURATED_BLEND')}>Curated Blends</a>
                        </div>
                        <div className="lp-footer__col">
                            <h4>Hours</h4>
                            <p>Mon - Sat: 8AM - 9PM</p>
                            <p>Sunday: 9AM - 8PM</p>
                        </div>
                    </div>
                    <div className="lp-footer__bottom">
                        <p>&copy; 2026 3Monks. All rights reserved. Crafted with 💜</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
