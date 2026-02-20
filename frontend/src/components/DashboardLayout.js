import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { FiMenu } from 'react-icons/fi';

const DashboardLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

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
                </div>
                <div className="main-content">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default DashboardLayout;
