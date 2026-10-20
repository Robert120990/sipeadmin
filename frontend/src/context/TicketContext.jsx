import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { socket } from '../services/socket';
import { getStoredUser } from '../utils/auth';
import { useToast } from '../components/Toast';
import { initTicketDiagnosticsCollector } from '../utils/ticketDiagnostics';
import { compressTicketImage } from '../utils/ticketImageCompressor';
import { QuickTicketModal, TicketResolvedModal, TicketDetailModal } from '../components/tickets';

const TicketContext = createContext(null);

export const useTickets = () => {
    const ctx = useContext(TicketContext);
    if (!ctx) {
        return {
            openQuickTicket: () => {},
            openTicketDetail: () => {},
            captureScreenAsWebp: async () => null,
            canManageTickets: false,
            ticketRefreshVersion: 0,
            triggerTicketRefresh: () => {}
        };
    }
    return ctx;
};

export const TicketProvider = ({ children }) => {
    const { addToast } = useToast();
    const [quickModalOpen, setQuickModalOpen] = useState(false);
    const [quickModalInit, setQuickModalInit] = useState({});
    const [resolvedQueue, setResolvedQueue] = useState([]);
    const [detailTicketId, setDetailTicketId] = useState(null);
    const [ticketRefreshVersion, setTicketRefreshVersion] = useState(0);

    const user = getStoredUser();
    const canManageTickets = Boolean(
        user &&
        (Number(user.role_id) === 1 ||
            ['admin', 'administrator', 'administrador', 'super admin', 'superadmin'].includes(
                String(user.role || user.role_name || '').toLowerCase()
            ) ||
            (Array.isArray(user.permissions) && user.permissions.includes('manage_support_tickets')))
    );

    const triggerTicketRefresh = useCallback(() => {
        setTicketRefreshVersion((v) => v + 1);
    }, []);

    useEffect(() => {
        initTicketDiagnosticsCollector();
    }, []);

    const captureScreenAsWebp = useCallback(async () => {
        try {
            const html2canvasModule = await import('html2canvas');
            const html2canvas = html2canvasModule.default || html2canvasModule;
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                allowTaint: true,
                logging: false,
                scale: Math.min(window.devicePixelRatio || 1, 1.5),
                windowWidth: document.documentElement.clientWidth,
                windowHeight: document.documentElement.clientHeight,
                x: window.scrollX,
                y: window.scrollY,
                width: window.innerWidth,
                height: window.innerHeight
            });
            const rawWebp = canvas.toDataURL('image/webp', 0.8);
            return await compressTicketImage(rawWebp, { maxWidth: 1440, quality: 0.78 });
        } catch (err) {
            console.warn('[TicketCapture] Fallback sin captura automática:', err?.message);
            return null;
        }
    }, []);

    const openQuickTicket = useCallback(async (options = {}) => {
        let screenshot = options.screenshot || null;
        if (options.autoCapture && !screenshot) {
            addToast('Capturando pantalla en formato WebP...', 'info', 1800);
            screenshot = await captureScreenAsWebp();
        }
        setQuickModalInit({
            type: options.type || 'problema',
            priority: options.priority || 'media',
            subject: options.subject || '',
            description: options.description || '',
            moduleName: options.moduleName || document.title || 'SIPE Admin',
            screenshot
        });
        setQuickModalOpen(true);
    }, [captureScreenAsWebp, addToast]);

    const openTicketDetail = useCallback((ticketId) => {
        if (!ticketId) return;
        setDetailTicketId(Number(ticketId));
    }, []);

    // Atajo global directo: Ctrl + Shift + K -> Nuevo Ticket con captura automática
    useEffect(() => {
        const handleGlobalShortcut = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
                const token = localStorage.getItem('token');
                if (!token) return;
                e.preventDefault();
                openQuickTicket({ autoCapture: true });
            }
        };
        window.addEventListener('keydown', handleGlobalShortcut);
        return () => window.removeEventListener('keydown', handleGlobalShortcut);
    }, [openQuickTicket]);

    // Consultar tickets resueltos pendientes de enterado para el usuario actual
    const fetchPendingResolved = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await api.get('/tickets/pending-resolved');
            const list = Array.isArray(res.data?.data) ? res.data.data : [];
            if (list.length > 0) {
                setResolvedQueue((prev) => {
                    const existingIds = new Set(prev.map((t) => Number(t.id)));
                    const fresh = list.filter((t) => !existingIds.has(Number(t.id)));
                    return fresh.length > 0 ? [...prev, ...fresh] : prev;
                });
            }
        } catch (_) {
            // Silencioso en polling
        }
    }, []);

    useEffect(() => {
        fetchPendingResolved();
        const interval = setInterval(fetchPendingResolved, 25000);
        return () => clearInterval(interval);
    }, [fetchPendingResolved]);

    // Escuchar eventos en tiempo real por Socket.io
    useEffect(() => {
        const currentUser = getStoredUser();
        const myId = Number(currentUser?.id || 0);
        const myName = String(currentUser?.nombre || currentUser?.name || '').toLowerCase();
        const myUsername = String(currentUser?.username || '').toLowerCase();

        const isMyTicket = (t) => {
            if (!t || !myId) return false;
            if (Number(t.admin_user_id) === myId) return true;
            if (t.source_system === 'admin.sipesv.com' && Number(t.user_id) === myId) return true;
            const tUser = String(t.user_name || '').toLowerCase();
            return (myName && tUser === myName) || (myUsername && tUser === myUsername);
        };

        const onTicketResolved = (ticket) => {
            triggerTicketRefresh();
            if (isMyTicket(ticket)) {
                setResolvedQueue((prev) => {
                    if (prev.some((item) => Number(item.id) === Number(ticket.id))) return prev;
                    return [...prev, ticket];
                });
                addToast(`✅ ¡Tu ticket #${ticket.code || ticket.ticket_code} ha sido resuelto!`, 'success', 6000);
            }
        };

        const onTicketUpdated = (ticket) => {
            triggerTicketRefresh();
            if (isMyTicket(ticket) && ticket.status !== 'resuelto') {
                const statusLabel =
                    ticket.status === 'en_proceso'
                        ? 'En Proceso (Pendiente de Solución)'
                        : ticket.status === 'abierto'
                            ? 'Pendiente (Abierto)'
                            : ticket.status;
                addToast(`⏳ Ticket #${ticket.code || ticket.ticket_code}: ${statusLabel}`, 'info', 4500);
            }
        };

        const onTicketCreated = () => {
            triggerTicketRefresh();
        };

        const onTicketMessage = () => {
            triggerTicketRefresh();
        };

        // Escuchar también eventos disparados al hacer clic en una notificación de campana
        const onOpenTicketFromNotification = (ev) => {
            const ticketId = ev?.detail?.ticketId;
            if (ticketId) {
                setDetailTicketId(Number(ticketId));
            }
        };

        socket.on('ticket:resolved', onTicketResolved);
        socket.on('ticket:updated', onTicketUpdated);
        socket.on('ticket:created', onTicketCreated);
        socket.on('ticket:message', onTicketMessage);
        window.addEventListener('sipe:open-ticket-detail', onOpenTicketFromNotification);

        return () => {
            socket.off('ticket:resolved', onTicketResolved);
            socket.off('ticket:updated', onTicketUpdated);
            socket.off('ticket:created', onTicketCreated);
            socket.off('ticket:message', onTicketMessage);
            window.removeEventListener('sipe:open-ticket-detail', onOpenTicketFromNotification);
        };
    }, [addToast, triggerTicketRefresh]);

    const handleAcknowledgeResolved = async (ticketId) => {
        try {
            await api.put(`/tickets/${ticketId}/acknowledge`);
        } catch (_) {
            // Remover de la cola local igualmente
        }
        setResolvedQueue((prev) => prev.filter((t) => Number(t.id) !== Number(ticketId)));
        triggerTicketRefresh();
    };

    const currentResolvedTicket = resolvedQueue[0] || null;

    return (
        <TicketContext.Provider
            value={{
                openQuickTicket,
                openTicketDetail,
                captureScreenAsWebp,
                canManageTickets,
                ticketRefreshVersion,
                triggerTicketRefresh
            }}
        >
            {children}

            <QuickTicketModal
                open={quickModalOpen}
                onClose={() => setQuickModalOpen(false)}
                initialData={quickModalInit}
                onCaptureRequest={async () => {
                    setQuickModalOpen(false);
                    await new Promise((r) => setTimeout(r, 180));
                    const img = await captureScreenAsWebp();
                    setQuickModalOpen(true);
                    return img;
                }}
                onSuccess={() => {
                    triggerTicketRefresh();
                }}
            />

            <TicketResolvedModal
                ticket={currentResolvedTicket}
                onAcknowledge={handleAcknowledgeResolved}
                onViewDetail={(id) => {
                    handleAcknowledgeResolved(id);
                    setDetailTicketId(id);
                }}
            />

            <TicketDetailModal
                open={Boolean(detailTicketId)}
                ticketId={detailTicketId}
                canManage={canManageTickets}
                onClose={() => setDetailTicketId(null)}
                onUpdated={() => {
                    triggerTicketRefresh();
                }}
            />
        </TicketContext.Provider>
    );
};
