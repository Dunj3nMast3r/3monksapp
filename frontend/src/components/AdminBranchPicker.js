import React, { useState, useEffect } from 'react';
import { adminService } from '../services/dataService';

// Same saved choice as the Order Queue's branch picker
const KEY = 'orderQueueShop';
const load = () => { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } };

/**
 * An admin belongs to no branch, so order screens ask which branch to work for.
 * Returns [shopId, picker]: shopId is '' until a branch is chosen; picker is the
 * dropdown to show (null for everyone else, who always work for their own branch).
 */
export const useAdminBranch = (isAdmin) => {
    const [shops, setShops] = useState([]);
    const [shopId, setShopId] = useState(load);

    useEffect(() => {
        if (!isAdmin) return;
        adminService.getShops()
            .then(res => {
                const active = (res.data.data || []).filter(s => s.active)
                    .sort((a, b) => a.name.localeCompare(b.name));
                setShops(active);
                // Keep the saved branch if it is still open, else the only one when there is just one
                setShopId(prev => active.some(s => String(s.id) === String(prev)) ? String(prev)
                    : active.length === 1 ? String(active[0].id) : '');
            })
            .catch(() => {});
    }, [isAdmin]);

    const choose = (id) => {
        setShopId(id);
        try { localStorage.setItem(KEY, id); } catch (_) { /* not saved */ }
    };

    const picker = isAdmin ? (
        <div className="form-group admin-branch-picker">
            <label>Branch</label>
            <select className={`form-control${shopId ? '' : ' input-error'}`} value={shopId} onChange={e => choose(e.target.value)}>
                <option value="">Select branch…</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
        </div>
    ) : null;

    return [shopId, picker];
};
