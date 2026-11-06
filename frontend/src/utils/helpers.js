export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount || 0);
};

export const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    });
};

export const formatDateTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
    });
};

// The business day starts at this hour (India time), not at midnight: late-night
// orders count towards the evening before. Loaded from the server at start-up
// (setBusinessDayStartHour); 3 matches the server default until then.
let businessDayStartHour = 3;

export const setBusinessDayStartHour = (hour) => {
    if (Number.isInteger(hour) && hour >= 0 && hour <= 12) businessDayStartHour = hour;
};

// Today's business date (YYYY-MM-DD), or the one `daysAgo` business days back.
// Before the start hour it is still the previous date, exactly as on the server.
export const getISTDateString = (daysAgo = 0) => {
    const at = Date.now() - businessDayStartHour * 3600000 - daysAgo * 86400000;
    return new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

// Current business month (YYYY-MM)
export const getISTMonthString = () => {
    return getISTDateString().slice(0, 7);
};

export const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

export const roleLabels = {
    SUPER_ADMIN: 'Super Admin',
    SHOP_MANAGER: 'Shop Manager',
    SHOP_OPERATOR: 'Shop Operator',
};

// Parcel (takeaway) packing charge per unit; keep in sync with OrderService
export const PARCEL_CHARGES = { SHOT: 10, BLEND: 5 };

export const getParcelCharge = (items) =>
    (items || []).reduce((sum, item) =>
        sum + (item.category === 'SHOT' ? PARCEL_CHARGES.SHOT : PARCEL_CHARGES.BLEND) * item.quantity, 0);
