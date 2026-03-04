import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { FiMenu, FiZap } from 'react-icons/fi';

const DashboardLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    const isQuickOrderPage = location.pathname.includes('/orders/quick');

    return (
        <div className="app-layout">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="main-wrapper">
                {/* Mobile topbar */}
                <div className="topbar">
                    <button className="topbar-menu-btn" onClick={() => setSidebarOpen(true)}>
                        <FiMenu />
                    </button>
                    <div className="topbar-brand">
                        <img src="/logo.svg" alt="3Monks" className="topbar-logo" />
                        <span>3<span className="topbar-brand-highlight">Monks</span></span>
                    </div>
                    {!isQuickOrderPage && (
                        <button className="topbar-quick-order-btn" onClick={() => navigate('/dashboard/orders/quick')}>
                            <FiZap /> Quick Order
                        </button>
                    )}
                </div>
                <div className="main-content">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default DashboardLayout;
