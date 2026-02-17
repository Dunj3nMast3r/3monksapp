import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getInitials, roleLabels } from '../utils/helpers';
import { FiHome, FiShoppingCart, FiPackage, FiUsers, FiBarChart2, FiLogOut, FiBox, FiLayers, FiMapPin, FiUserCheck, FiList, FiTrendingUp } from 'react-icons/fi';

const Sidebar = () => {
    const { user, logout, isAdmin, isManager, hasRole } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <img src="/logo.svg" alt="3Monks" className="sidebar-logo" />
                <div className="sidebar-brand">
                    <div className="sidebar-brand-name">3<span>Monks</span></div>
                    <div className="sidebar-brand-tagline">Fresh Fruit Bar</div>
                </div>
            </div>

            <nav className="sidebar-nav">
                <NavLink to="/dashboard" end className={({ isActive }) => isActive ? 'active' : ''}>
                    <FiHome /> Dashboard
                </NavLink>

                <div className="sidebar-section">Orders</div>
                <NavLink to="/dashboard/orders/new" className={({ isActive }) => isActive ? 'active' : ''}><FiShoppingCart /> New Order</NavLink>
                <NavLink to="/dashboard/orders" className={({ isActive }) => isActive ? 'active' : ''}><FiLayers /> Order History</NavLink>

                {hasRole('SUPER_ADMIN', 'SHOP_MANAGER') && (
                    <>
                        <div className="sidebar-section">Inventory</div>
                        <NavLink to="/dashboard/stock" className={({ isActive }) => isActive ? 'active' : ''}><FiPackage /> Stock</NavLink>
                        <NavLink to="/dashboard/purchases" className={({ isActive }) => isActive ? 'active' : ''}><FiBox /> Purchases</NavLink>
                    </>
                )}

                {hasRole('SUPER_ADMIN', 'SHOP_MANAGER') && (
                    <>
                        <div className="sidebar-section">Reports</div>
                        <NavLink to="/dashboard/reports" className={({ isActive }) => isActive ? 'active' : ''}><FiBarChart2 /> Reports</NavLink>
                        {isAdmin() && (
                            <NavLink to="/dashboard/analytics" className={({ isActive }) => isActive ? 'active' : ''}><FiTrendingUp /> Analytics</NavLink>
                        )}
                    </>
                )}

                {isAdmin() && (
                    <>
                        <div className="sidebar-section">Admin</div>
                        <NavLink to="/dashboard/shops" className={({ isActive }) => isActive ? 'active' : ''}><FiMapPin /> Shops</NavLink>
                        <NavLink to="/dashboard/products" className={({ isActive }) => isActive ? 'active' : ''}><FiBox /> Products</NavLink>
                        <NavLink to="/dashboard/recipes" className={({ isActive }) => isActive ? 'active' : ''}><FiList /> Recipes</NavLink>
                        <NavLink to="/dashboard/raw-materials" className={({ isActive }) => isActive ? 'active' : ''}><FiPackage /> Raw Materials</NavLink>
                        <NavLink to="/dashboard/employees" className={({ isActive }) => isActive ? 'active' : ''}><FiUserCheck /> Employees</NavLink>
                        <NavLink to="/dashboard/users" className={({ isActive }) => isActive ? 'active' : ''}><FiUsers /> Users</NavLink>
                    </>
                )}
            </nav>

            <div className="sidebar-user">
                <div className="sidebar-user-info">
                    <div className="sidebar-user-avatar">{getInitials(user?.fullName)}</div>
                    <div className="sidebar-user-details">
                        <div className="sidebar-user-name">{user?.fullName}</div>
                        <div className="sidebar-user-role">{roleLabels[user?.role]}</div>
                    </div>
                </div>
                <button onClick={handleLogout} className="sidebar-logout-btn">
                    <FiLogOut /> Logout
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
