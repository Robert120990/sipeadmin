import React, { useState, useEffect, useMemo } from 'react';
import { 
    Download, Printer, Search, Calendar, Clock, MapPin, 
    Upload, X, CheckCircle, FileSpreadsheet, RefreshCw, 
    TrendingUp, TrendingDown, Minus, BarChart3, Activity, 
    Sparkles, Fuel, Layers, AlertCircle, ArrowUpRight, ArrowDownRight,
    AlertTriangle, ShieldCheck, Building2, Plus, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import dgehmEstacionesList from '../data/dgehm_estaciones.json';

const ConsultasPreciosCompetencia = () => {
    const [activeTab, setActiveTab] = useState('actuales'); // 'actuales' | 'historial' | 'bi'
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('ALL');
    const [serviceFilter, setServiceFilter] = useState('ALL'); // 'ALL' | 'AS' | 'SC'
    const [onlyCheaper, setOnlyCheaper] = useState(false);
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    // Sync State
    const [syncing, setSyncing] = useState(false);
    const [lastSyncInfo, setLastSyncInfo] = useState(null);

    // Historial State
    const [historialData, setHistorialData] = useState([]);
    const [historialLoading, setHistorialLoading] = useState(false);
    const [historialSearch, setHistorialSearch] = useState('');
    const [historialDesde, setHistorialDesde] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [historialHasta, setHistorialHasta] = useState(() => new Date().toISOString().split('T')[0]);

    // BI Analytics State
    const [biData, setBiData] = useState(null);
    const [biLoading, setBiLoading] = useState(false);
    const [biFuelType, setBiFuelType] = useState('super_a'); // 'super_a' | 'regular_a' | 'diesel_a'

    // Upload Modal State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [csvFile, setCsvFile] = useState(null);
    const [csvFileName, setCsvFileName] = useState('');
    const [parsedUploadRows, setParsedUploadRows] = useState([]);
    const [uploading, setUploading] = useState(false);

    // Manage monitored stations modal state
    const [showManageModal, setShowManageModal] = useState(false);
    const [loadingCatalogo, setLoadingCatalogo] = useState(false);
    const [estacionesSistema, setEstacionesSistema] = useState([]);
    const [estacionesMonitoreadas, setEstacionesMonitoreadas] = useState([]);
    const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL');
    const [searchMonitored, setSearchMonitored] = useState('');
    const [newStationForm, setNewStationForm] = useState({
        id_estacion: '',
        competencia: '',
        es_propia: false
    });
    const [savingStation, setSavingStation] = useState(false);

    useEffect(() => {
        fetchCurrentData();
    }, []);

    useEffect(() => {
        if (activeTab === 'historial') {
            fetchHistorial();
        } else if (activeTab === 'bi') {
            fetchBiAnalytics();
        }
    }, [activeTab]);

    const fetchCurrentData = async () => {
        try {
            setLoading(true);
            const res = await api.get('/consultas/estaciones/precios-competencia');
            const rows = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            setData(rows);
            if (res.data && res.data.ultimaValidacion) {
                const dateObj = new Date(res.data.ultimaValidacion);
                setLastSyncInfo({
                    date: dateObj.toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }),
                    count: rows.length
                });
            } else if (rows.length > 0 && rows[0].modificacion) {
                setLastSyncInfo({
                    date: rows[0].modificacion,
                    count: rows.length
                });
            }
        } catch (error) {
            console.error('Error fetching prices:', error);
            addToast('Error al cargar precios de competencia', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchHistorial = async () => {
        try {
            setHistorialLoading(true);
            const params = {};
            if (historialDesde) params.desde = historialDesde;
            if (historialHasta) params.hasta = historialHasta;
            const res = await api.get('/consultas/estaciones/precios-competencia/historial', { params });
            setHistorialData(res.data || []);
        } catch (error) {
            console.error('Error fetching history:', error);
            addToast('Error al cargar historial de precios', 'error');
        } finally {
            setHistorialLoading(false);
        }
    };

    const fetchBiAnalytics = async () => {
        try {
            setBiLoading(true);
            const res = await api.get('/consultas/estaciones/precios-competencia/bi-analytics');
            setBiData(res.data || null);
        } catch (error) {
            console.error('Error fetching BI analytics:', error);
            addToast('Error al cargar análisis de BI', 'error');
        } finally {
            setBiLoading(false);
        }
    };

    // --- Automatic DGEHM Sync ---
    const handleSyncDgehm = async () => {
        try {
            setSyncing(true);
            const res = await api.post('/consultas/estaciones/precios-competencia/sync-dgehm');
            const { message, count, totalConfigured, totalDgehm } = res.data;
            addToast(message || `Sincronización exitosa: ${count} de ${totalConfigured} estaciones actualizadas.`, 'success');
            setLastSyncInfo({
                date: new Date().toLocaleString(),
                count,
                totalConfigured,
                totalDgehm
            });
            await fetchCurrentData();
            if (activeTab === 'historial') fetchHistorial();
            if (activeTab === 'bi') fetchBiAnalytics();
        } catch (error) {
            console.error('Error syncing with DGEHM:', error);
            const errMsg = error.response?.data?.message || error.message || 'Error al sincronizar con DGEHM';
            // Si está bloqueado por firewall en la nube, abrir automáticamente el asistente guiado
            if (error.response?.data?.isCloudBlocked || error.response?.status === 504) {
                addToast('Portal DGEHM protegido por cortafuegos gubernamental. Abriendo Asistente de Carga Rápida...', 'warning');
                setCsvFile(null);
                setCsvFileName('');
                setParsedUploadRows([]);
                setShowUploadModal(true);
            } else {
                addToast(errMsg, 'error');
            }
        } finally {
            setSyncing(false);
        }
    };

    // --- Manage Monitored Stations ---
    const fetchCatalogo = async () => {
        try {
            setLoadingCatalogo(true);
            const res = await api.get('/consultas/estaciones/precios-competencia/catalogo');
            setEstacionesSistema(res.data?.estaciones_sistema || []);
            setEstacionesMonitoreadas(res.data?.estaciones_monitoreadas || []);
            if (!newStationForm.id_estacion && (res.data?.estaciones_sistema || []).length > 0) {
                setNewStationForm(prev => ({ ...prev, id_estacion: res.data.estaciones_sistema[0].id_empresa }));
            }
        } catch (e) {
            console.error(e);
            addToast('Error al cargar catálogo de estaciones', 'error');
        } finally {
            setLoadingCatalogo(false);
        }
    };

    const handleOpenManageModal = () => {
        setShowManageModal(true);
        fetchCatalogo();
    };

    const handleAddStation = async (e) => {
        e.preventDefault();
        if (!newStationForm.id_estacion || !newStationForm.competencia.trim()) {
            return addToast('Seleccione una sucursal y escriba el nombre de la estación', 'warning');
        }

        setSavingStation(true);
        try {
            await api.post('/consultas/estaciones/precios-competencia/estaciones', newStationForm);
            addToast('Estación vinculada correctamente', 'success');
            setNewStationForm(prev => ({ ...prev, competencia: '', es_propia: false }));
            await fetchCatalogo();
            await fetchCurrentData();
        } catch (err) {
            console.error(err);
            addToast(err.response?.data?.message || 'Error al vincular estación', 'error');
        } finally {
            setSavingStation(false);
        }
    };

    const handleTogglePropia = async (station) => {
        try {
            const nextVal = station.es_propia ? 0 : 1;
            await api.put(`/consultas/estaciones/precios-competencia/estaciones/${station.id}`, {
                es_propia: nextVal,
                competencia: station.competencia,
                id_estacion: station.id_estacion
            });
            addToast(nextVal ? 'Marcada como estación propia' : 'Marcada como competencia', 'success');
            await fetchCatalogo();
            await fetchCurrentData();
        } catch (err) {
            console.error(err);
            addToast('Error al actualizar tipo de estación', 'error');
        }
    };

    const handleDeleteStation = async (station) => {
        if (!await confirm(`¿Estás seguro de quitar "${station.competencia}" del monitoreo de ${station.estacion_sistema}?`, { variant: 'danger' })) {
            return;
        }

        try {
            await api.delete(`/consultas/estaciones/precios-competencia/estaciones/${station.id}`);
            addToast('Estación eliminada del monitoreo', 'success');
            await fetchCatalogo();
            await fetchCurrentData();
        } catch (err) {
            console.error(err);
            addToast('Error al eliminar estación', 'error');
        }
    };

    // --- Manual CSV Upload & Drag and Drop ---
    const processCsvFile = (file) => {
        if (!file) return;
        setCsvFile(file);
        setCsvFileName(file.name);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length <= 1) {
                return addToast('El archivo CSV está vacío', 'error');
            }

            try {
                const resEst = await api.get('/consultas/estaciones/precios-competencia/estaciones');
                const catalog = resEst.data || [];
                const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
                
                const catalogMap = new Map();
                for (const item of catalog) {
                    catalogMap.set(normalize(item.competencia), item.competencia);
                }

                const parsed = [];
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                    if (row.length >= 10) {
                        let stationRaw = row[2] || row[0];
                        let modif = row[3] || row[1];
                        let scSuper = row[4] || row[2];
                        let scReg = row[5] || row[3];
                        let scIon = row[7] || row[4];
                        let scDies = row[8] || row[5];
                        let asSuper = row[9] || row[6];
                        let asReg = row[10] || row[7];
                        let asIon = row[12] || row[8];
                        let asDies = row[13] || row[9];

                        const norm = normalize(stationRaw);
                        if (catalogMap.has(norm)) {
                            parsed.push({
                                estacion: catalogMap.get(norm),
                                modificacion: modif || '',
                                super_c: scSuper || '0',
                                regular_c: scReg || '0',
                                ion_c: scIon || '0',
                                diesel_c: scDies || '0',
                                super_a: asSuper || '0',
                                regular_a: asReg || '0',
                                ion_a: asIon || '0',
                                diesel_a: asDies || '0'
                            });
                        }
                    }
                }

                setParsedUploadRows(parsed);
                if (parsed.length > 0) {
                    addToast(`Se reconocieron ${parsed.length} estaciones de competencia en el archivo`, 'success');
                } else {
                    addToast('No se encontraron coincidencias con el catálogo de estaciones.', 'warning');
                }
            } catch (err) {
                console.error(err);
                addToast('Error al procesar el archivo CSV', 'error');
            }
        };
        reader.readAsText(file);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        processCsvFile(file);
    };

    const handleActualizarBD = async () => {
        if (parsedUploadRows.length === 0) return addToast('No hay datos para actualizar', 'error');
        setUploading(true);
        try {
            await api.post('/consultas/estaciones/precios-competencia/upload', { data: parsedUploadRows });
            addToast(`Precios actualizados: ${parsedUploadRows.length} estaciones guardadas exitosamente`, 'success');
            setShowUploadModal(false);
            setCsvFile(null);
            setCsvFileName('');
            setParsedUploadRows([]);
            fetchCurrentData();
            if (activeTab === 'historial') fetchHistorial();
            if (activeTab === 'bi') fetchBiAnalytics();
        } catch (e) {
            addToast('Error al actualizar precios en base de datos', 'error');
        } finally {
            setUploading(false);
        }
    };

    const mc = (val) => {
        const num = Number(val || 0);
        if (num <= 0) return '-';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    };

    const extractBrand = (name) => {
        const upper = (name || '').toUpperCase();
        if (upper.includes('TEXACO')) return 'Texaco';
        if (upper.includes('PUMA')) return 'Puma';
        if (upper.includes('UNO')) return 'Uno';
        if (upper.includes('SHELL')) return 'Shell';
        if (upper.includes('DLC')) return 'DLC';
        return 'Otros';
    };

    // Pre-calculate own stations map for price comparisons
    const ownStationsMap = useMemo(() => {
        const map = new Map();
        data.forEach(item => {
            if (item.es_propia === 1 || item.es_propia === true || item.es_propia === '1') {
                map.set(item.titulo, item);
            }
        });
        return map;
    }, [data]);

    // Filter current data
    const filteredCurrentData = useMemo(() => {
        return data.filter(item => {
            const matchesSearch = 
                item.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.estacion?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesBrand = selectedBrand === 'ALL' || extractBrand(item.estacion) === selectedBrand;
            
            if (!matchesSearch || !matchesBrand) return false;

            if (onlyCheaper) {
                const isPropia = item.es_propia === 1 || item.es_propia === true || item.es_propia === '1';
                if (isPropia) return true;
                const own = ownStationsMap.get(item.titulo);
                if (!own) return true;
                const pSC = (val) => Number(val || 0);
                const isCheaper = (pSC(item.super_c) > 0 && pSC(item.super_c) < pSC(own.super_c)) ||
                                  (pSC(item.regular_c) > 0 && pSC(item.regular_c) < pSC(own.regular_c)) ||
                                  (pSC(item.diesel_c) > 0 && pSC(item.diesel_c) < pSC(own.diesel_c)) ||
                                  (pSC(item.super_a) > 0 && pSC(item.super_a) < pSC(own.super_a)) ||
                                  (pSC(item.regular_a) > 0 && pSC(item.regular_a) < pSC(own.regular_a)) ||
                                  (pSC(item.diesel_a) > 0 && pSC(item.diesel_a) < pSC(own.diesel_a));
                return isCheaper;
            }

            return true;
        });
    }, [data, searchTerm, selectedBrand, onlyCheaper, ownStationsMap]);

    // Filter history data
    const filteredHistorialData = useMemo(() => {
        return historialData.filter(item => {
            return (
                item.estacion?.toLowerCase().includes(historialSearch.toLowerCase()) ||
                item.estacion_propia?.toLowerCase().includes(historialSearch.toLowerCase())
            );
        });
    }, [historialData, historialSearch]);

    // Filter monitored stations in manage modal
    const filteredMonitoredList = useMemo(() => {
        return estacionesMonitoreadas.filter(item => {
            const matchBranch = selectedBranchFilter === 'ALL' || String(item.id_estacion) === String(selectedBranchFilter);
            const matchSearch = !searchMonitored || 
                item.competencia.toLowerCase().includes(searchMonitored.toLowerCase()) ||
                (item.estacion_sistema || '').toLowerCase().includes(searchMonitored.toLowerCase());
            return matchBranch && matchSearch;
        });
    }, [estacionesMonitoreadas, selectedBranchFilter, searchMonitored]);

    const setQuickRange = (days) => {
        const today = new Date();
        const past = new Date();
        past.setDate(today.getDate() - days);
        setHistorialDesde(past.toISOString().split('T')[0]);
        setHistorialHasta(today.toISOString().split('T')[0]);
    };

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();
        if (activeTab === 'actuales') {
            const exportData = filteredCurrentData.map(item => ({
                'Estación Propia': item.titulo,
                'Competencia': item.estacion,
                'Tipo': item.es_propia ? 'Estación Propia' : 'Competidor',
                'Última Modificación': item.modificacion,
                'Super (SC)': item.super_c,
                'Regular (SC)': item.regular_c,
                'Ion Dies (SC)': item.ion_c,
                'Diesel (SC)': item.diesel_c,
                'Super (AS)': item.super_a,
                'Regular (AS)': item.regular_a,
                'Ion Dies (AS)': item.ion_a,
                'Diesel (AS)': item.diesel_a
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, 'Precios Actuales');
            XLSX.writeFile(wb, `precios_competencia_${new Date().toISOString().split('T')[0]}.xlsx`);
        } else if (activeTab === 'historial') {
            const exportData = filteredHistorialData.map(item => ({
                'Fecha Registro': item.fecha_registro,
                'Estación Propia': item.estacion_propia,
                'Competencia': item.estacion,
                'Última Modificación': item.modificacion,
                'Super (SC)': item.super_c,
                'Regular (SC)': item.regular_c,
                'Diesel (SC)': item.diesel_c,
                'Super (AS)': item.super_a,
                'Regular (AS)': item.regular_a,
                'Diesel (AS)': item.diesel_a
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, 'Historial');
            XLSX.writeFile(wb, `historial_competencia_${historialDesde}_al_${historialHasta}.xlsx`);
        }
    };

    const exportToPDF = () => {
        const doc = jsPDF({ orientation: 'landscape' });
        if (activeTab === 'actuales') {
            doc.text('Consulta de Precios de Competencia - Snapshot Actual', 14, 15);
            const tableBody = filteredCurrentData.map(item => [
                item.titulo, item.estacion, item.modificacion,
                mc(item.super_c), mc(item.regular_c), mc(item.diesel_c),
                mc(item.super_a), mc(item.regular_a), mc(item.diesel_a)
            ]);
            doc.autoTable({
                startY: 20,
                head: [['Estación', 'Competencia', 'Modificación', 'Super (SC)', 'Reg (SC)', 'Dies (SC)', 'Super (AS)', 'Reg (AS)', 'Dies (AS)']],
                body: tableBody,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [79, 70, 229] }
            });
            doc.save(`precios_competencia_${new Date().toISOString().split('T')[0]}.pdf`);
        } else if (activeTab === 'historial') {
            doc.text(`Historial de Precios de Competencia (${historialDesde} al ${historialHasta})`, 14, 15);
            const tableBody = filteredHistorialData.map(item => [
                item.fecha_registro, item.estacion_propia || '-', item.estacion,
                mc(item.super_c), mc(item.regular_c), mc(item.diesel_c),
                mc(item.super_a), mc(item.regular_a), mc(item.diesel_a)
            ]);
            doc.autoTable({
                startY: 20,
                head: [['Fecha', 'Estación', 'Competencia', 'Super (SC)', 'Reg (SC)', 'Dies (SC)', 'Super (AS)', 'Reg (AS)', 'Dies (AS)']],
                body: tableBody,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [79, 70, 229] }
            });
            doc.save(`historial_competencia_${historialDesde}_al_${historialHasta}.pdf`);
        }
    };

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <h1 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.75rem' }}>Precios de Competencia</h1>
                        {lastSyncInfo ? (
                            <span style={{ 
                                fontSize: '0.8rem', 
                                padding: '0.25rem 0.75rem', 
                                borderRadius: '16px', 
                                backgroundColor: 'rgba(34, 197, 94, 0.15)', 
                                color: '#22c55e', 
                                border: '1px solid rgba(34, 197, 94, 0.35)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontWeight: '600'
                            }}>
                                <CheckCircle size={14} /> Última validación DGEHM: {lastSyncInfo.date} ({lastSyncInfo.count} estaciones)
                            </span>
                        ) : (
                            <span style={{ 
                                fontSize: '0.8rem', 
                                padding: '0.25rem 0.75rem', 
                                borderRadius: '16px', 
                                backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                                color: 'var(--text-muted)', 
                                border: '1px solid var(--border)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}>
                                <Clock size={14} /> Consultando última validación...
                            </span>
                        )}
                    </div>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: 0 }}>
                        Monitoreo de precios oficiales DGEHM, gestión de estaciones vinculadas, historial y análisis de mercado.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button 
                        onClick={handleSyncDgehm} 
                        disabled={syncing}
                        className="btn-primary" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#10b981', borderColor: '#10b981' }}
                    >
                        <RefreshCw size={17} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Consultando DGEHM...' : 'Sincronizar DGEHM'}
                    </button>

                    <button 
                        onClick={handleOpenManageModal} 
                        className="btn-secondary" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Building2 size={17} color="var(--primary)" /> Gestionar Estaciones
                    </button>

                    <button 
                        onClick={() => { setCsvFile(null); setCsvFileName(''); setParsedUploadRows([]); setShowUploadModal(true); }} 
                        className="btn-secondary" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Upload size={17} /> Cargar CSV
                    </button>

                    {activeTab !== 'bi' && (
                        <>
                            <button onClick={exportToExcel} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Download size={17} /> Excel
                            </button>
                            <button onClick={exportToPDF} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Printer size={17} /> PDF
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
                <button
                    onClick={() => setActiveTab('actuales')}
                    style={{
                        padding: '0.75rem 1.25rem',
                        border: 'none',
                        background: 'transparent',
                        color: activeTab === 'actuales' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'actuales' ? 'bold' : 'normal',
                        borderBottom: activeTab === 'actuales' ? '3px solid var(--primary)' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Layers size={18} /> Precios Actuales ({data.length})
                </button>

                <button
                    onClick={() => setActiveTab('historial')}
                    style={{
                        padding: '0.75rem 1.25rem',
                        border: 'none',
                        background: 'transparent',
                        color: activeTab === 'historial' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'historial' ? 'bold' : 'normal',
                        borderBottom: activeTab === 'historial' ? '3px solid var(--primary)' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Clock size={18} /> Historial de Variaciones
                </button>

                <button
                    onClick={() => setActiveTab('bi')}
                    style={{
                        padding: '0.75rem 1.25rem',
                        border: 'none',
                        background: 'transparent',
                        color: activeTab === 'bi' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'bi' ? 'bold' : 'normal',
                        borderBottom: activeTab === 'bi' ? '3px solid var(--primary)' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <Sparkles size={18} /> Inteligencia & BI
                </button>
            </div>

            {/* TAB 1: PRECIOS ACTUALES */}
            {activeTab === 'actuales' && (
                <>
                    {/* Filters bar */}
                    <div className="card glass" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 240px' }}>
                            <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                            <input 
                                type="text" 
                                placeholder="Buscar por estación o competencia..." 
                                className="input-search"
                                style={{ paddingLeft: '2.8rem', width: '100%' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Brand pills */}
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {['ALL', 'Texaco', 'Puma', 'Uno', 'Shell', 'DLC', 'Otros'].map(brand => (
                                <button
                                    key={brand}
                                    onClick={() => setSelectedBrand(brand)}
                                    style={{
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.8rem',
                                        borderRadius: '20px',
                                        border: '1px solid ' + (selectedBrand === brand ? 'var(--primary)' : 'var(--border)'),
                                        backgroundColor: selectedBrand === brand ? 'var(--primary)' : 'transparent',
                                        color: selectedBrand === brand ? '#fff' : 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {brand === 'ALL' ? 'Todas' : brand}
                                </button>
                            ))}
                        </div>

                        {/* Only cheaper toggle */}
                        <button
                            onClick={() => setOnlyCheaper(!onlyCheaper)}
                            style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.82rem',
                                borderRadius: '20px',
                                border: onlyCheaper ? '1px solid #ef4444' : '1px solid var(--border)',
                                backgroundColor: onlyCheaper ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                color: onlyCheaper ? '#ef4444' : 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                cursor: 'pointer',
                                fontWeight: onlyCheaper ? 'bold' : 'normal'
                            }}
                        >
                            <AlertTriangle size={15} /> Solo Más Baratas
                        </button>

                        {/* Service filter */}
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setServiceFilter('ALL')}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    fontSize: '0.8rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: serviceFilter === 'ALL' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    color: serviceFilter === 'ALL' ? 'var(--text-main)' : 'var(--text-muted)',
                                    cursor: 'pointer'
                                }}
                            >
                                Ambos Servicios
                            </button>
                            <button
                                onClick={() => setServiceFilter('AS')}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    fontSize: '0.8rem',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    backgroundColor: serviceFilter === 'AS' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                    color: '#3b82f6',
                                    cursor: 'pointer',
                                    fontWeight: serviceFilter === 'AS' ? 'bold' : 'normal'
                                }}
                            >
                                Auto Servicio
                            </button>
                            <button
                                onClick={() => setServiceFilter('SC')}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    fontSize: '0.8rem',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                    backgroundColor: serviceFilter === 'SC' ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                                    color: '#22c55e',
                                    cursor: 'pointer',
                                    fontWeight: serviceFilter === 'SC' ? 'bold' : 'normal'
                                }}
                            >
                                Servicio Completo
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', minWidth: '950px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th colSpan={3} style={{ padding: '0.85rem 1rem', textAlign: 'left', color: 'var(--primary)', fontWeight: 'bold' }}>DETALLE GENERAL</th>
                                    {(serviceFilter === 'ALL' || serviceFilter === 'SC') && (
                                        <th colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', backgroundColor: 'rgba(34, 197, 94, 0.08)', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#22c55e', fontWeight: 'bold' }}>SERVICIO COMPLETO</th>
                                    )}
                                    {(serviceFilter === 'ALL' || serviceFilter === 'AS') && (
                                        <th colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', backgroundColor: 'rgba(59, 130, 246, 0.08)', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#3b82f6', fontWeight: 'bold' }}>AUTO SERVICIO</th>
                                    )}
                                </tr>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Estación Propia</th>
                                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Competencia / Registro</th>
                                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', width: '170px' }}>Modificación</th>
                                    
                                    {(serviceFilter === 'ALL' || serviceFilter === 'SC') && (
                                        <>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>Super</th>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right' }}>Regular</th>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right' }}>Ion Dies</th>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right' }}>Diesel</th>
                                        </>
                                    )}

                                    {(serviceFilter === 'ALL' || serviceFilter === 'AS') && (
                                        <>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>Super</th>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right' }}>Regular</th>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right' }}>Ion Dies</th>
                                            <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right' }}>Diesel</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={11} style={{ padding: '4rem', textAlign: 'center' }}>
                                            <div className="spinner" style={{ margin: '0 auto' }}></div>
                                            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Cargando inteligencia de precios...</p>
                                        </td>
                                    </tr>
                                ) : filteredCurrentData.length > 0 ? (
                                    filteredCurrentData.map((item, idx) => {
                                        const isPropia = item.es_propia === 1 || item.es_propia === true || item.es_propia === '1';
                                        const own = ownStationsMap.get(item.titulo);

                                        const renderCell = (compVal, ownVal, isAS = false) => {
                                            const c = Number(compVal || 0);
                                            const o = Number(ownVal || 0);
                                            if (c <= 0) return <span style={{ color: 'var(--text-muted)' }}>-</span>;

                                            let isCheaper = !isPropia && o > 0 && c < o;
                                            let isMoreExp = !isPropia && o > 0 && c > o;

                                            return (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                                    <span style={{ 
                                                        fontWeight: 'bold', 
                                                        color: isPropia ? 'var(--primary)' : isCheaper ? '#ef4444' : isMoreExp ? '#22c55e' : 'inherit'
                                                    }}>
                                                        {mc(compVal)}
                                                    </span>
                                                    {isCheaper && (
                                                        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 'bold' }} title={`Competencia $${(o - c).toFixed(2)} más barata que nuestra estación`}>
                                                            -${(o - c).toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        };

                                        return (
                                            <tr 
                                                key={idx} 
                                                className="table-row-hover" 
                                                style={{ 
                                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                    backgroundColor: isPropia ? 'rgba(99, 102, 241, 0.05)' : 'transparent'
                                                }}
                                            >
                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.titulo}</div>
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <MapPin size={14} color="var(--text-muted)" />
                                                        <span style={{ fontWeight: isPropia ? 'bold' : 'normal' }}>{item.estacion}</span>
                                                        {isPropia ? (
                                                            <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', fontWeight: 'bold', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <ShieldCheck size={11} /> PROPIA
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '10px', backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                                                {extractBrand(item.estacion)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <Calendar size={13} /> {item.modificacion || '-'}
                                                    </div>
                                                </td>

                                                {/* SC Values */}
                                                {(serviceFilter === 'ALL' || serviceFilter === 'SC') && (
                                                    <>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                                                            {renderCell(item.super_c, own?.super_c)}
                                                        </td>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                                            {renderCell(item.regular_c, own?.regular_c)}
                                                        </td>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                                            {renderCell(item.ion_c, own?.ion_c)}
                                                        </td>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                                            {renderCell(item.diesel_c, own?.diesel_c)}
                                                        </td>
                                                    </>
                                                )}

                                                {/* AS Values */}
                                                {(serviceFilter === 'ALL' || serviceFilter === 'AS') && (
                                                    <>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                                            {renderCell(item.super_a, own?.super_a, true)}
                                                        </td>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                                            {renderCell(item.regular_a, own?.regular_a, true)}
                                                        </td>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                                            {renderCell(item.ion_a, own?.ion_a, true)}
                                                        </td>
                                                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                                            {renderCell(item.diesel_a, own?.diesel_a, true)}
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={11} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            <Search size={44} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                            <p>No se encontraron registros de competencia.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* TAB 2: HISTORIAL DE VARIACIONES */}
            {activeTab === 'historial' && (
                <>
                    {/* Historial Filters */}
                    <div className="card glass" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 240px' }}>
                            <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                            <input 
                                type="text" 
                                placeholder="Filtrar historial por estación..." 
                                className="input-search"
                                style={{ paddingLeft: '2.8rem', width: '100%' }}
                                value={historialSearch}
                                onChange={(e) => setHistorialSearch(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desde:</span>
                            <input 
                                type="date" 
                                className="input-search" 
                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }} 
                                value={historialDesde} 
                                onChange={(e) => setHistorialDesde(e.target.value)} 
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hasta:</span>
                            <input 
                                type="date" 
                                className="input-search" 
                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }} 
                                value={historialHasta} 
                                onChange={(e) => setHistorialHasta(e.target.value)} 
                            />
                            <button onClick={fetchHistorial} className="btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}>
                                Filtrar
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button onClick={() => setQuickRange(7)} className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}>7 Días</button>
                            <button onClick={() => setQuickRange(15)} className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}>15 Días</button>
                            <button onClick={() => setQuickRange(30)} className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}>30 Días</button>
                        </div>
                    </div>

                    {/* Historial Table */}
                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', minWidth: '900px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Fecha Registro</th>
                                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Estación Propia</th>
                                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Competencia</th>
                                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', width: '160px' }}>Modificación</th>
                                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: '#3b82f6', fontSize: '0.75rem', textTransform: 'uppercase' }}>Super (AS)</th>
                                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: '#3b82f6', fontSize: '0.75rem', textTransform: 'uppercase' }}>Regular (AS)</th>
                                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: '#3b82f6', fontSize: '0.75rem', textTransform: 'uppercase' }}>Diesel (AS)</th>
                                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: '#22c55e', fontSize: '0.75rem', textTransform: 'uppercase' }}>Super (SC)</th>
                                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: '#22c55e', fontSize: '0.75rem', textTransform: 'uppercase' }}>Regular (SC)</th>
                                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: '#22c55e', fontSize: '0.75rem', textTransform: 'uppercase' }}>Diesel (SC)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historialLoading ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '4rem', textAlign: 'center' }}>
                                            <div className="spinner" style={{ margin: '0 auto' }}></div>
                                            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Cargando registros históricos...</p>
                                        </td>
                                    </tr>
                                ) : filteredHistorialData.length > 0 ? (
                                    filteredHistorialData.map((item, idx) => (
                                        <tr key={idx} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.8rem 1rem', fontWeight: 'bold' }}>
                                                {item.fecha_registro}
                                            </td>
                                            <td style={{ padding: '0.8rem 1rem', color: 'var(--primary)' }}>
                                                {item.estacion_propia || '-'}
                                            </td>
                                            <td style={{ padding: '0.8rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <MapPin size={13} color="var(--text-muted)" />
                                                    {item.estacion}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                {item.modificacion || '-'}
                                            </td>
                                            <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#3b82f6' }}>
                                                {mc(item.super_a)}
                                            </td>
                                            <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#3b82f6' }}>
                                                {mc(item.regular_a)}
                                            </td>
                                            <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#3b82f6' }}>
                                                {mc(item.diesel_a)}
                                            </td>
                                            <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#22c55e' }}>
                                                {mc(item.super_c)}
                                            </td>
                                            <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#22c55e' }}>
                                                {mc(item.regular_c)}
                                            </td>
                                            <td style={{ padding: '0.8rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#22c55e' }}>
                                                {mc(item.diesel_c)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            <Clock size={44} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                            <p>No se encontraron registros en el rango de fechas seleccionado.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* TAB 3: INTELIGENCIA & BI */}
            {activeTab === 'bi' && (
                <>
                    {biLoading ? (
                        <div style={{ padding: '5rem', textAlign: 'center' }}>
                            <div className="spinner" style={{ margin: '0 auto' }}></div>
                            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Calculando inteligencia de precios y análisis de patrones...</p>
                        </div>
                    ) : biData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            
                            {/* KPI Metrics */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, fontWeight: 'bold' }}>SUPERIOR (AS)</p>
                                            <h2 style={{ fontSize: '1.8rem', margin: '0.4rem 0 0 0', color: '#ef4444' }}>{mc(biData.promediosMercado.super_a)}</h2>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Promedio Mercado</span>
                                        </div>
                                        <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                                            <Fuel size={20} color="#ef4444" />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Mín: <strong>{mc(biData.rankingExtremos.super_a.min.val)}</strong> | Máx: <strong>{mc(biData.rankingExtremos.super_a.max.val)}</strong>
                                    </div>
                                </div>

                                <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, fontWeight: 'bold' }}>REGULAR (AS)</p>
                                            <h2 style={{ fontSize: '1.8rem', margin: '0.4rem 0 0 0', color: '#f59e0b' }}>{mc(biData.promediosMercado.regular_a)}</h2>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Promedio Mercado</span>
                                        </div>
                                        <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                                            <Fuel size={20} color="#f59e0b" />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Mín: <strong>{mc(biData.rankingExtremos.regular_a.min.val)}</strong> | Máx: <strong>{mc(biData.rankingExtremos.regular_a.max.val)}</strong>
                                    </div>
                                </div>

                                <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, fontWeight: 'bold' }}>DIÉSEL (AS)</p>
                                            <h2 style={{ fontSize: '1.8rem', margin: '0.4rem 0 0 0', color: '#3b82f6' }}>{mc(biData.promediosMercado.diesel_a)}</h2>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Promedio Mercado</span>
                                        </div>
                                        <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                                            <Fuel size={20} color="#3b82f6" />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Mín: <strong>{mc(biData.rankingExtremos.diesel_a.min.val)}</strong> | Máx: <strong>{mc(biData.rankingExtremos.diesel_a.max.val)}</strong>
                                    </div>
                                </div>

                                <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, fontWeight: 'bold' }}>ESTACIONES</p>
                                            <h2 style={{ fontSize: '1.8rem', margin: '0.4rem 0 0 0', color: '#10b981' }}>{biData.totalEstaciones}</h2>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monitoreadas en Vivo</span>
                                        </div>
                                        <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                                            <Activity size={20} color="#10b981" />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Registros en Historial: <strong>{biData.totalHistorialRegistros}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Pattern Insights */}
                            {biData.insights && biData.insights.length > 0 && (
                                <div className="card glass" style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <Sparkles size={18} color="var(--primary)" />
                                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary)' }}>Patrones de Mercado & Insights Detectados</h3>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                        {biData.insights.map((ins, idx) => (
                                            <div key={idx} style={{ padding: '0.85rem 1rem', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--primary)' }}>
                                                    {ins.title}
                                                </div>
                                                <p style={{ fontSize: '0.82rem', margin: 0, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                                    {ins.description.replace(/\*\*(.*?)\*\*/g, '$1')}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Brand Comparison Charts & Breakdown */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
                                {/* Brand Comparison Bar Chart */}
                                <div className="card glass" style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <BarChart3 size={18} color="var(--primary)" />
                                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Comparativa por Bandera / Marca</h3>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            <button 
                                                onClick={() => setBiFuelType('super_a')}
                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: biFuelType === 'super_a' ? '#ef4444' : 'transparent', color: biFuelType === 'super_a' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
                                            >
                                                Super
                                            </button>
                                            <button 
                                                onClick={() => setBiFuelType('regular_a')}
                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: biFuelType === 'regular_a' ? '#f59e0b' : 'transparent', color: biFuelType === 'regular_a' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
                                            >
                                                Regular
                                            </button>
                                            <button 
                                                onClick={() => setBiFuelType('diesel_a')}
                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: biFuelType === 'diesel_a' ? '#3b82f6' : 'transparent', color: biFuelType === 'diesel_a' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
                                            >
                                                Diésel
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                        {biData.marcas.map((m, idx) => {
                                            const val = m[biFuelType] || 0;
                                            const maxVal = Math.max(...biData.marcas.map(x => x[biFuelType] || 0), 5.5);
                                            const widthPct = val > 0 ? Math.min(100, Math.max(15, (val / maxVal) * 100)) : 0;
                                            const brandColor = m.brand === 'Texaco' ? '#ef4444' : m.brand === 'Puma' ? '#10b981' : m.brand === 'Uno' ? '#f59e0b' : m.brand === 'Shell' ? '#eab308' : '#6366f1';

                                            return (
                                                <div key={idx}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                                                        <span style={{ fontWeight: 'bold' }}>{m.brand} ({m.count} est.)</span>
                                                        <span style={{ fontWeight: 'bold', color: brandColor }}>{mc(val)}</span>
                                                    </div>
                                                    <div style={{ height: '8px', width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${widthPct}%`, backgroundColor: brandColor, borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Extreme Prices Ranking */}
                                <div className="card glass" style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <TrendingDown size={18} color="#22c55e" />
                                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Estaciones Más Económicas vs Más Altas</h3>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {/* Super */}
                                        <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ef4444', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Gasolina Superior (AS)</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                                <div>
                                                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>↓ Más barata: </span>
                                                    <span>{biData.rankingExtremos.super_a.min.station || '-'}</span>
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: '#22c55e' }}>{mc(biData.rankingExtremos.super_a.min.val)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                                <div>
                                                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>↑ Más alta: </span>
                                                    <span>{biData.rankingExtremos.super_a.max.station || '-'}</span>
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{mc(biData.rankingExtremos.super_a.max.val)}</span>
                                            </div>
                                        </div>

                                        {/* Regular */}
                                        <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Gasolina Regular (AS)</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                                <div>
                                                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>↓ Más barata: </span>
                                                    <span>{biData.rankingExtremos.regular_a.min.station || '-'}</span>
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: '#22c55e' }}>{mc(biData.rankingExtremos.regular_a.min.val)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                                <div>
                                                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>↑ Más alta: </span>
                                                    <span>{biData.rankingExtremos.regular_a.max.station || '-'}</span>
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{mc(biData.rankingExtremos.regular_a.max.val)}</span>
                                            </div>
                                        </div>

                                        {/* Diesel */}
                                        <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Diésel (AS)</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                                <div>
                                                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>↓ Más barato: </span>
                                                    <span>{biData.rankingExtremos.diesel_a.min.station || '-'}</span>
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: '#22c55e' }}>{mc(biData.rankingExtremos.diesel_a.min.val)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                                <div>
                                                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>↑ Más alto: </span>
                                                    <span>{biData.rankingExtremos.diesel_a.max.station || '-'}</span>
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{mc(biData.rankingExtremos.diesel_a.max.val)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    ) : (
                        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <AlertCircle size={44} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <p>No se pudo generar el análisis de BI. Intenta sincronizar precios primero.</p>
                        </div>
                    )}
                </>
            )}

            {/* MODAL: GESTIONAR ESTACIONES MONITOREADAS */}
            <Modal 
                open={showManageModal} 
                onClose={() => setShowManageModal(false)} 
                title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Building2 size={20} color="var(--primary)" />Gestionar Estaciones Propias y de Competencia</span>} 
                size="xl"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Add Station Form */}
                    <form onSubmit={handleAddStation} className="card glass" style={{ padding: '1.25rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={16} /> Vincular Nueva Estación a una Sucursal
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                                    Sucursal / Estación Propia:
                                </label>
                                <select 
                                    className="input-search" 
                                    style={{ width: '100%', padding: '0.5rem' }}
                                    value={newStationForm.id_estacion}
                                    onChange={e => setNewStationForm(prev => ({ ...prev, id_estacion: e.target.value }))}
                                    required
                                >
                                    <option value="">-- Seleccionar Sucursal --</option>
                                    {estacionesSistema.map(e => (
                                        <option key={e.id_empresa} value={e.id_empresa}>{e.titulo}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                                    Nombre Oficial en DGEHM:
                                </label>
                                <input 
                                    type="text"
                                    list="dgehmList"
                                    placeholder="Ej. PUMA AEROPUERTO..."
                                    className="input-search"
                                    style={{ width: '100%', padding: '0.5rem' }}
                                    value={newStationForm.competencia}
                                    onChange={e => setNewStationForm(prev => ({ ...prev, competencia: e.target.value }))}
                                    required
                                />
                                <datalist id="dgehmList">
                                    {dgehmEstacionesList.map((st, idx) => (
                                        <option key={idx} value={st} />
                                    ))}
                                </datalist>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.4rem' }}>
                                <input 
                                    type="checkbox" 
                                    id="chkPropia" 
                                    checked={newStationForm.es_propia} 
                                    onChange={e => setNewStationForm(prev => ({ ...prev, es_propia: e.target.checked }))} 
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <label htmlFor="chkPropia" style={{ fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
                                    Es la estación propia de la sucursal
                                </label>
                            </div>

                            <div>
                                <button 
                                    type="submit" 
                                    disabled={savingStation} 
                                    className="btn-primary" 
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.55rem' }}
                                >
                                    <Plus size={16} /> {savingStation ? 'Guardando...' : 'Vincular Estación'}
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Filter Monitored List */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 200px' }}>
                            <Search style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
                            <input 
                                type="text"
                                placeholder="Buscar en estaciones vinculadas..."
                                className="input-search"
                                style={{ paddingLeft: '2.5rem', width: '100%', fontSize: '0.85rem' }}
                                value={searchMonitored}
                                onChange={e => setSearchMonitored(e.target.value)}
                            />
                        </div>

                        <select 
                            className="input-search" 
                            style={{ padding: '0.45rem', fontSize: '0.85rem', flex: '1 1 180px' }}
                            value={selectedBranchFilter}
                            onChange={e => setSelectedBranchFilter(e.target.value)}
                        >
                            <option value="ALL">Todas las Sucursales ({estacionesMonitoreadas.length})</option>
                            {estacionesSistema.map(s => (
                                <option key={s.id_empresa} value={s.id_empresa}>{s.titulo}</option>
                            ))}
                        </select>
                    </div>

                    {/* Monitored Stations List Table */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'auto', maxHeight: '45vh' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left' }}>Sucursal del Sistema</th>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'left' }}>Estación Vinculada (DGEHM)</th>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'center', width: '150px' }}>Tipo</th>
                                    <th style={{ padding: '0.6rem 0.85rem', textAlign: 'center', width: '90px' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingCatalogo ? (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '2rem', textAlign: 'center' }}>
                                            <div className="spinner" style={{ margin: '0 auto' }}></div>
                                        </td>
                                    </tr>
                                ) : filteredMonitoredList.length > 0 ? (
                                    filteredMonitoredList.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.55rem 0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                {item.estacion_sistema}
                                            </td>
                                            <td style={{ padding: '0.55rem 0.85rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <MapPin size={13} color="var(--text-muted)" />
                                                    <span>{item.competencia}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleTogglePropia(item)}
                                                    style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        cursor: 'pointer',
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: '12px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        backgroundColor: item.es_propia ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                                        color: item.es_propia ? '#818cf8' : 'var(--text-muted)'
                                                    }}
                                                    title="Clic para cambiar entre Propia y Competencia"
                                                >
                                                    {item.es_propia ? <ToggleRight size={16} color="#818cf8" /> : <ToggleLeft size={16} color="var(--text-muted)" />}
                                                    {item.es_propia ? 'Estación Propia' : 'Competencia'}
                                                </button>
                                            </td>
                                            <td style={{ padding: '0.55rem 0.85rem', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleDeleteStation(item)}
                                                    style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '0.2rem 0.4rem', borderRadius: '4px' }}
                                                    title="Quitar estación"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No se encontraron estaciones vinculadas con los filtros seleccionados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* MODAL: ASISTENTE DE CARGA DGEHM (CSV) */}
            <Modal 
                open={showUploadModal} 
                onClose={() => setShowUploadModal(false)} 
                title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><FileSpreadsheet size={20} color="var(--primary)" />Asistente de Sincronización Precios DGEHM</span>} 
                size="xl"
            >
                {parsedUploadRows.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Paso 1: Abrir Portal */}
                        <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <h4 style={{ margin: 0, color: '#3b82f6', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ backgroundColor: '#3b82f6', color: '#fff', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>1</span>
                                    Abrir el Portal Oficial de DGEHM
                                </h4>
                                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Abre la página oficial de estadísticas de precios y descarga el archivo <strong>CSV</strong> (icono de exportar en la esquina superior del reporte).
                                </p>
                            </div>
                            <a 
                                href="http://sinapp.dgehm.gob.sv/drhm/estadisticas.aspx?uid=2" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="btn-primary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', backgroundColor: '#3b82f6', borderColor: '#3b82f6', whiteSpace: 'nowrap' }}
                            >
                                <ArrowUpRight size={17} /> Abrir Portal DGEHM
                            </a>
                        </div>

                        {/* Paso 2: Subir archivo */}
                        <div 
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                    processCsvFile(e.dataTransfer.files[0]);
                                }
                            }}
                            style={{ 
                                border: '2px dashed var(--primary)', 
                                borderRadius: '8px', 
                                padding: '2.5rem 1.5rem', 
                                textAlign: 'center', 
                                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <Upload size={44} style={{ color: 'var(--primary)', opacity: 0.8, marginBottom: '0.75rem' }} />
                            <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem' }}>
                                Paso 2: Arrastra o selecciona el archivo CSV descargado
                            </h4>
                            <p style={{ margin: '0.4rem 0 1.25rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                El sistema cruzará automáticamente las estaciones configuradas con sus precios de Súper, Regular y Diésel.
                            </p>
                            <label className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.6rem 2rem' }}>
                                <FileSpreadsheet size={18} /> Seleccionar Archivo CSV
                                <input type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                            </label>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                <FileSpreadsheet size={14} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                <strong>{csvFileName}</strong> ({parsedUploadRows.length} estaciones listas para actualizar)
                            </span>
                            <div style={{ flex: 1 }} />
                            <button 
                                onClick={handleActualizarBD} 
                                className="btn-primary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#10b981', borderColor: '#10b981' }} 
                                disabled={uploading}
                            >
                                <CheckCircle size={16} /> {uploading ? 'Actualizando BD...' : 'Guardar Precios en BD'}
                            </button>
                            <button 
                                onClick={() => { setCsvFile(null); setCsvFileName(''); setParsedUploadRows([]); }} 
                                className="btn-secondary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <X size={16} /> Cancelar
                            </button>
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'auto', maxHeight: '55vh' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.78rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Estación</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Modificación</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Super (AS)</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Regular (AS)</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Diesel (AS)</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Super (SC)</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Regular (SC)</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Diesel (SC)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedUploadRows.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.45rem 0.75rem', fontWeight: 'bold' }}>{row.estacion}</td>
                                            <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-muted)' }}>{row.modificacion}</td>
                                            <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: '#3b82f6', fontWeight: 'bold' }}>{mc(row.super_a)}</td>
                                            <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: '#3b82f6', fontWeight: 'bold' }}>{mc(row.regular_a)}</td>
                                            <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: '#3b82f6', fontWeight: 'bold' }}>{mc(row.diesel_a)}</td>
                                            <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: '#22c55e', fontWeight: 'bold' }}>{mc(row.super_c)}</td>
                                            <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: '#22c55e', fontWeight: 'bold' }}>{mc(row.regular_c)}</td>
                                            <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: '#22c55e', fontWeight: 'bold' }}>{mc(row.diesel_c)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default ConsultasPreciosCompetencia;
