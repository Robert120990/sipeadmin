import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import socket from '../services/socket';
import { playNotificationSound } from '../utils/notificationSound';

const NotificationContext = createContext(null);

const readStoredUser = () => {
    try {
        return JSON.parse(localStorage.getItem('user')) || {};
    } catch {
        return {};
    }
};

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeToast, setActiveToast] = useState(null);
    const [bellRinging, setBellRinging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState(readStoredUser);

    useEffect(() => {
        const syncUser = () => {
            const next = readStoredUser();
            setCurrentUser(next);
            if (!next?.id) {
                setNotifications([]);
                setUnreadCount(0);
                setActiveToast(null);
            }
        };
        window.addEventListener('sipe:auth-changed', syncUser);
        window.addEventListener('storage', syncUser);
        return () => {
            window.removeEventListener('sipe:auth-changed', syncUser);
            window.removeEventListener('storage', syncUser);
        };
    }, []);

    // Fetch notifications from server
    const fetchNotifications = useCallback(async () => {
        if (!currentUser.id) return;
        try {
            setLoading(true);
            const res = await api.get('/notifications');
            const list = res.data.notifications || [];
            setNotifications(list);
            setUnreadCount(res.data.unreadCount || 0);

            // Mostrar Tarjeta Informativa en sistema si existe una tarea/actividad asignada no leída
            const unreadTaskNotif = list.find(n => !n.is_read && n.type === 'task_assigned');
            if (unreadTaskNotif) {
                const dismissKey = `sipe_dismissed_task_card_${unreadTaskNotif.id}`;
                if (!sessionStorage.getItem(dismissKey)) {
                    setActiveToast(prev => prev || unreadTaskNotif);
                }
            }
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
            setNotifications(prev => [notification, ...prev.filter(x => x.id !== notification.id)]);
            setUnreadCount(prev => prev + 1);

            // 4. Show real-time floating visual toast / informative card
            setActiveToast(notification);
        };

        const handleTaskAssignedCard = (payload) => {
            const nd = payload?.notificationData;
            if (!nd) return;
            const isAssignedToMe = Number(nd.assigned_to) === Number(currentUser.id);
            const isCreatedByMe = Number(nd.created_by) === Number(currentUser.id);
            if (!isAssignedToMe && !isCreatedByMe) return;

            // Si ya llegó por notification:new al destinatario, evitar duplicar pero asegurar tarjeta visible
            setActiveToast(prev => {
                if (prev && prev.data?.taskId && Number(prev.data.taskId) === Number(nd.taskId)) {
                    return prev;
                }
                return {
                    id: `task_card_${nd.taskId || Date.now()}`,
                    user_id: currentUser.id,
                    type: 'task_assigned',
                    title: isAssignedToMe ? 'Nueva Tarea / Actividad Asignada' : 'Tarea / Actividad Asignada en Sistema',
                    message: `${nd.created_user_name || 'Sistema'} asignó a ${nd.assigned_user_name || 'Colaborador'}: "${nd.titulo}"`,
                    data: nd,
                    is_read: false,
                    is_transient: !isAssignedToMe,
                    created_at: new Date().toISOString()
                };
            });
        };

        socket.on('notification:new', handleNewNotification);
        socket.on('tasks:assigned_card', handleTaskAssignedCard);

        return () => {
            socket.off('notification:new', handleNewNotification);
            socket.off('tasks:assigned_card', handleTaskAssignedCard);
        };
    }, [currentUser.id]);

    // Auto-dismiss active toast (15s for task assignment cards, 6s for standard notifications)
    useEffect(() => {
        if (!activeToast) return undefined;
        const duration = activeToast.type === 'task_assigned' ? 15000 : 6000;
        const timer = setTimeout(() => {
            setActiveToast(null);
        }, duration);
        return () => clearTimeout(timer);
    }, [activeToast]);

    // Mark single notification as read
    const markAsRead = async (id) => {
        if (!id || String(id).startsWith('task_card_')) return;
        try {
            sessionStorage.setItem(`sipe_dismissed_task_card_${id}`, '1');
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

    const dismissToast = () => {
        if (activeToast?.id) {
            sessionStorage.setItem(`sipe_dismissed_task_card_${activeToast.id}`, '1');
        }
        setActiveToast(null);
    };

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
