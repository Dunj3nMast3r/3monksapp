import { pushService } from './dataService';

// iPadOS Safari reports itself as a Mac; touch support tells them apart
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export const isPushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64) => {
    const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

const registration = () => navigator.serviceWorker.ready;

export const getPushSubscription = async () => {
    if (!isPushSupported()) return null;
    return (await registration()).pushManager.getSubscription();
};

const register = (subscription, station, shopId) => {
    const json = subscription.toJSON();
    return pushService.subscribe({
        endpoint: json.endpoint,
        keys: json.keys,
        station: station === 'ALL' ? null : station,
        shopId: shopId || null,
    });
};

// Must be called from a tap: browsers only show the permission prompt for a user action
export const enablePush = async (station, shopId) => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications were not allowed');
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
        const { data } = await pushService.getPublicKey();
        subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(data.data.publicKey),
        });
    }
    await register(subscription, station, shopId);
};

// Keeps the server's record of this device in step with the station view it shows.
// A subscription only exists while notifications are allowed (browsers drop it when revoked).
export const syncPush = async (station, shopId) => {
    const subscription = await getPushSubscription();
    if (subscription) await register(subscription, station, shopId);
    return !!subscription;
};

export const disablePush = async () => {
    const subscription = await getPushSubscription();
    if (!subscription) return;
    try { await pushService.unsubscribe(subscription.endpoint); } catch (_) { /* server drops it once the push service reports it gone */ }
    await subscription.unsubscribe();
};
