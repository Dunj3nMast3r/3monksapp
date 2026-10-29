import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/dataService';
import { disablePush } from '../services/push';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (stored) {
            try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('user'); }
        }
        setLoading(false);
    }, []);

    const login = async (credentials) => {
        const res = await authService.login(credentials);
        const data = res.data.data;
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data));
        setUser(data);
        return data;
    };

    const logout = async () => {
        // Stop phone notifications for this device while the token is still valid; never block logout on it
        await Promise.race([disablePush(), new Promise(resolve => setTimeout(resolve, 2000))]).catch(() => {});
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    const isAdmin = () => user?.role === 'SUPER_ADMIN';
    const isManager = () => user?.role === 'SHOP_MANAGER';
    const isOperator = () => user?.role === 'SHOP_OPERATOR';
    const hasRole = (...roles) => roles.includes(user?.role);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isManager, isOperator, hasRole }}>
            {children}
        </AuthContext.Provider>
    );
};
