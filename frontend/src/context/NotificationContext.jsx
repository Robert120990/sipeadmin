import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import socket from '../services/socket';
import { playNotificationSound } from '../utils/notificationSound';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeToast, setActiveToast] = useState(null);
    const [bellRinging, setBellRinging] = useState(false);
    const [loading, setLoading] = useState(false);

    // Get current logged-in user
    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch {
            return {};
        }
    }, []);

    // Fetch notifications from server
    const fetchNotifications = useCallback(async () => {
        if (!currentUser.id) return;
        try {
            setLoading(true);
            const res = await api.get('/notifications');
            setNotifications(res.data.notifications || []);
            setUnreadCount(res.data.unreadCount || 0);
        } catch (err) {
            console.warn('[NotificationContext] Error fetching notifications:', err.message);
        } finally {
            setLoading(false);
        }
    }, [currentUser.id]);

    // Initial fetch
    useEffect(() => {
        if (currentUser.id) {
            fetchNotifications();
        }
    }, [currentUser.id, fetchNotifications]);

    // Handle real-time socket events
    useEffect(() => {
        if (!currentUser.id) return;

        // Join personal user room on socket connection
        socket.emit('join', currentUser.id);

        const handleNewNotification = (notification) => {
            // Verify notification belongs to this user
            if (Number(notification.user_id) !== Number(currentUser.id)) return;

            // 1. Play audio chime
            playNotificationSound();

            // 2. Animate bell icon
            setBellRinging(true);
            setTimeout(() => setBellRinging(false), 3000);

            // 3. Update state
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);

            // 4. Show real-time floating visual toast
            setActiveToast(notification);
        };

        socket.on('notification:new', handleNewNotification);

        return () => {
            socket.off('notification:new', handleNewNotification);
        };
    }, [currentUser.id]);

    // Auto-dismiss active toast after 6 seconds
    useEffect(() => {
        if (!activeToast) return undefined;
        const timer = setTimeout(() => {
            setActiveToast(null);
        }, 6000);
        return () => clearTimeout(timer);
    }, [activeToast]);

    // Mark single notification as read
    const markAsRead = async (id) => {
        try {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
            await api.patch(`/notifications/${id}/read`);
        } catch (err) {
            console.error('[NotificationContext] Error marking notification as read:', err);
            fetchNotifications();
        }
    };

    // Mark all as read
    const markAllAsRead = async () => {
        try {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
            await api.patch('/notifications/read-all');
        } catch (err) {
            console.error('[NotificationContext] Error marking all as read:', err);
            fetchNotifications();
        }
    };

    // Delete single notification
    const deleteNotification = async (id) => {
        try {
            const item = notifications.find(n => n.id === id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            if (item && !item.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
            await api.delete(`/notifications/${id}`);
        } catch (err) {
            console.error('[NotificationContext] Error deleting notification:', err);
            fetchNotifications();
        }
    };

    // Clear all notifications
    const clearAll = async () => {
        try {
            setNotifications([]);
            setUnreadCount(0);
            await api.delete('/notifications/clear-all');
        } catch (err) {
            console.error('[NotificationContext] Error clearing notifications:', err);
            fetchNotifications();
        }
    };

    const dismissToast = () => setActiveToast(null);

    const value = {
        notifications,
        unreadCount,
        activeToast,
        bellRinging,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        dismissToast
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
