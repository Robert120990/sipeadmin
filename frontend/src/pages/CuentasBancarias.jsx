import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import {
    Landmark, User, Hash, Edit2, Save, Plus, FileText, Search,
    ChevronLeft, ChevronRight, AlertTriangle, Trash2, BookOpen,
    Scale, ArrowRightLeft, FileSpreadsheet, Layers, X
} from 'lucide-react';
import { moneyFmt } from '../utils/format';
import { formatDateDMY } from '../utils/date';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { getStoredUser } from '../utils/auth';
import { hasRoutePermission } from '../config/routeRegistry';
import { navigateToBancosTarget } from '../utils/bancosNavStorage';

const ADMIN_ROLE_NAMES = new Set([
    'administrator',
    'administrador',
    'admin',
    'super admin',
    'super administrador',
    'superadmin'
]);

export default function CuentasBancarias() {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const currentUser = getStoredUser();
    const roleLabel = String(currentUser?.role || currentUser?.role_name || '').trim().toLowerCase();
    const isAdmin = Number(currentUser?.role_id) === 1 || ADMIN_ROLE_NAMES.has(roleLabel);
    const perms = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];

    const canManageCuentas = isAdmin || perms.includes('manage_cuentas') || perms.includes('/dashboard/bancos/cuentas');
    const canManageChequeras = canManageCuentas || perms.includes('manage_chequeras') || perms.includes('manage_cheques') || perms.includes('/dashboard/bancos/cheques');
    const canGoConciliar = hasRoutePermission(currentUser, '/dashboard/bancos/conciliacion');
    const canGoMovimientos = hasRoutePermission(currentUser, '/dashboard/bancos/movimientos');
    const canGoKardex = hasRoutePermission(currentUser, '/dashboard/bancos/reportes/movimientos-fecha');

    const [accounts, setAccounts] = useState([]);
    const [bancos, setBancos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Estados para Catálogos Bancarios (Bancos, Tipos de Cuenta, Tipos de Remesas)
    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [activeCatalogTab, setActiveCatalogTab] = useState('BANCOS'); // 'BANCOS' | 'TIPOS_CUENTA' | 'TIPOS_REMESAS'

    // Bancos
    const [savingBanco, setSavingBanco] = useState(false);
    const [listaBancos, setListaBancos] = useState([]);
    const [nextCodigoBanco, setNextCodigoBanco] = useState('');
    const [searchBancoTerm, setSearchBancoTerm] = useState('');
    const [editingBancoCodigo, setEditingBancoCodigo] = useState(null);
    const [bancoFormData, setBancoFormData] = useState({
        descripcion: '',
        codigo: '',
        todas_empresas: true,
        id_empresa: ''
    });

    // Tipos de Cuenta Bancaria
    const [savingTipoCuenta, setSavingTipoCuenta] = useState(false);
    const [listaTiposCuenta, setListaTiposCuenta] = useState([]);
    const [nextCodigoTipoCuenta, setNextCodigoTipoCuenta] = useState('');
    const [searchTipoCuentaTerm, setSearchTipoCuentaTerm] = useState('');
    const [editingTipoCuentaCodigo, setEditingTipoCuentaCodigo] = useState(null);
    const [tipoCuentaFormData, setTipoCuentaFormData] = useState({
        descripcion: '',
        codigo: '',
        todas_empresas: true,
        id_empresa: ''
    });

    // Tipos de Remesas
    const [savingTipoRemesa, setSavingTipoRemesa] = useState(false);
    const [listaTiposRemesas, setListaTiposRemesas] = useState([]);
    const [nextCodigoTipoRemesa, setNextCodigoTipoRemesa] = useState('');
    const [searchTipoRemesaTerm, setSearchTipoRemesaTerm] = useState('');
    const [editingTipoRemesaCodigo, setEditingTipoRemesaCodigo] = useState(null);
    const [tipoRemesaFormData, setTipoRemesaFormData] = useState({
        descripcion: '',
        codigo: '',
        todas_empresas: true,
        id_empresa: ''
    });

    // Chequeras / Talonarios (R4.1)
    const [showChequerasModal, setShowChequerasModal] = useState(false);
    const [chequerasList, setChequerasList] = useState([]);
    const [loadingChequeras, setLoadingChequeras] = useState(false);
    const [savingChequera, setSavingChequera] = useState(false);
    const [chequeraFilterCuenta, setChequeraFilterCuenta] = useState('');
    const [chequeraFilterActivo, setChequeraFilterActivo] = useState('all');
    const [editingChequera, setEditingChequera] = useState(null);
    const [chequeraAlertsCount, setChequeraAlertsCount] = useState(0);
    const [chequeraFormData, setChequeraFormData] = useState({
        cuenta_bancaria_id: '',
        serie: '',
        desde: '',
        hasta: '',
        siguiente_correlativo: '',
        alerta_stock_bajo: '10',
        activo: true,
        notas: ''
    });

    const [formData, setFormData] = useState({
        id_empresa: '',
        cod_banco: '',
        numero: '',
        nombre: '',
        activa: 'S',
        cod_tipo: '',
        cod_cta: '',
        orden: '',
        saldo_inicial: '0.00',
        fecha_saldo_inicial: ''
    });

    useEffect(() => {
        fetchData();
        fetchInitialCompanies();
        fetchChequeraAlertsSummary();
    }, []);

    const fetchData = async () => {
        try {
            const res = await api.get('/bancos/cuentas');
            setAccounts(res.data || []);
        } catch (err) {
            addToast('Error al cargar cuentas bancarias', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchInitialCompanies = async () => {
        try {
            const res = await api.get('/bancos/catalogos');
            setEmpresas(res.data.empresas);
        } catch (err) {
            addToast('Error al cargar empresas', 'error');
        }
    };

    const fetchCatalogsForCompany = async (id_empresa, preserveSelected = true) => {
        if (!id_empresa) return;
        try {
            const res = await api.get(`/bancos/catalogos?id_empresa=${id_empresa}`);
            setBancos(res.data.bancos || []);
            setTipos(res.data.tipos || []);
            
            if (!editingAccount && !preserveSelected) {
                setFormData(prev => ({ 
                    ...prev, 
                    cod_banco: res.data.bancos[0]?.id || '',
                    cod_tipo: res.data.tipos[0]?.id || ''
                }));
            }
        } catch (err) {
            addToast('Error al cargar bancos y tipos para la empresa', 'error');
        }
    };

    const fetchBancosList = async () => {
        try {
            const res = await api.get('/bancos/entidades-banco');
            setListaBancos(res.data.bancos || []);
            setNextCodigoBanco(res.data.nextCodigo || '');
            return res.data;
        } catch (err) {
            addToast('Error al obtener lista de bancos', 'error');
            return null;
        }
    };

    const fetchTiposCuentaList = async () => {
        try {
            const res = await api.get('/bancos/tipos-cuenta');
            setListaTiposCuenta(res.data.tipos || []);
            setNextCodigoTipoCuenta(res.data.nextCodigo || '');
            return res.data;
        } catch (err) {
            addToast('Error al obtener tipos de cuenta', 'error');
            return null;
        }
    };

    const fetchTiposRemesasList = async () => {
        try {
            const res = await api.get('/bancos/tipos-remesas');
            setListaTiposRemesas(res.data.tipos || []);
            setNextCodigoTipoRemesa(res.data.nextCodigo || '');
            return res.data;
        } catch (err) {
            addToast('Error al obtener tipos de remesas', 'error');
            return null;
        }
    };

    const fetchChequeraAlertsSummary = async () => {
        try {
            const res = await api.get('/bancos/chequeras', { params: { activo: '1' } });
            const list = Array.isArray(res.data) ? res.data : [];
            const alerts = list.filter(chq => chq.agotado || chq.stock_bajo).length;
            setChequeraAlertsCount(alerts);
        } catch {
            // Silencioso en carga inicial si el usuario no tiene permisos de chequeras
        }
    };

    const fetchChequeras = async (cuentaFilter = chequeraFilterCuenta, activoFilter = chequeraFilterActivo) => {
        setLoadingChequeras(true);
        try {
            const params = {};
            if (cuentaFilter) params.cuenta_bancaria_id = cuentaFilter;
            if (activoFilter && activoFilter !== 'all') params.activo = activoFilter;
            const res = await api.get('/bancos/chequeras', { params });
            const rows = Array.isArray(res.data) ? res.data : [];
            setChequerasList(rows);
            if (!cuentaFilter && activoFilter === 'all') {
                setChequeraAlertsCount(rows.filter(chq => chq.activo && (chq.agotado || chq.stock_bajo)).length);
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar chequeras', 'error');
        } finally {
            setLoadingChequeras(false);
        }
    };

    const resetBancoForm = (nextCod = nextCodigoBanco) => {
        setEditingBancoCodigo(null);
        setBancoFormData({
            descripcion: '',
            codigo: nextCod || '',
            todas_empresas: true,
            id_empresa: formData.id_empresa || empresas[0]?.id || ''
        });
    };

    const resetTipoCuentaForm = (nextCod = nextCodigoTipoCuenta) => {
        setEditingTipoCuentaCodigo(null);
        setTipoCuentaFormData({
            descripcion: '',
            codigo: nextCod || '',
            todas_empresas: true,
            id_empresa: formData.id_empresa || empresas[0]?.id || ''
        });
    };

    const resetTipoRemesaForm = (nextCod = nextCodigoTipoRemesa) => {
        setEditingTipoRemesaCodigo(null);
        setTipoRemesaFormData({
            descripcion: '',
            codigo: nextCod || '',
            todas_empresas: true,
            id_empresa: formData.id_empresa || empresas[0]?.id || ''
        });
    };

    const handleOpenCatalogModal = async (initialTab = 'BANCOS') => {
        setActiveCatalogTab(initialTab);
        setSearchBancoTerm('');
        setSearchTipoCuentaTerm('');
        setSearchTipoRemesaTerm('');
        setShowCatalogModal(true);

        const [bData, tcData, trData] = await Promise.all([
            fetchBancosList(),
            fetchTiposCuentaList(),
            fetchTiposRemesasList()
        ]);
        resetBancoForm(bData?.nextCodigo || '');
        resetTipoCuentaForm(tcData?.nextCodigo || '');
        resetTipoRemesaForm(trData?.nextCodigo || '');
    };

    const handleCloseCatalogModal = () => {
        setShowCatalogModal(false);
        setEditingBancoCodigo(null);
        setEditingTipoCuentaCodigo(null);
        setEditingTipoRemesaCodigo(null);
        if (formData.cod_banco === '__NEW_BANK__') {
            setFormData(prev => ({ ...prev, cod_banco: bancos[0]?.id || '' }));
        }
    };

    const resolveCatalogEditEmpresaScope = (item) => {
        if (Number(item?.empresas_count) === 1 && item?.empresas_nombres) {
            const targetName = String(item.empresas_nombres).trim().toLowerCase();
            const matchedEmpresa = empresas.find(
                emp => String(emp.nombre || '').trim().toLowerCase() === targetName
            );
            if (matchedEmpresa) {
                return { todas_empresas: false, id_empresa: matchedEmpresa.id };
            }
        }
        return {
            todas_empresas: true,
            id_empresa: formData.id_empresa || empresas[0]?.id || ''
        };
    };

    const handleEditBanco = (b) => {
        setEditingBancoCodigo(b.codigo);
        const scope = resolveCatalogEditEmpresaScope(b);
        setBancoFormData({
            codigo: b.codigo || '',
            descripcion: b.descripcion || '',
            ...scope
        });
    };

    const handleSaveBanco = async (e) => {
        e.preventDefault();
        if (!bancoFormData.descripcion.trim()) {
            addToast('El nombre del banco es obligatorio', 'warning');
            return;
        }
        setSavingBanco(true);
        try {
            if (editingBancoCodigo !== null) {
                const res = await api.put(`/bancos/entidades-banco/${encodeURIComponent(editingBancoCodigo)}`, {
                    descripcion: bancoFormData.descripcion,
                    todas_empresas: bancoFormData.todas_empresas,
                    id_empresa: bancoFormData.todas_empresas ? undefined : bancoFormData.id_empresa
                });
                addToast(res.data.message || 'Banco actualizado exitosamente', 'success');
            } else {
                const res = await api.post('/bancos/entidades-banco', bancoFormData);
                addToast(res.data.message || 'Banco registrado exitosamente', 'success');
                if (showModal && res.data?.codigo) {
                    setFormData(prev => ({ ...prev, cod_banco: res.data.codigo }));
                }
            }

            const targetEmpresa = formData.id_empresa || empresas[0]?.id;
            if (targetEmpresa) {
                await fetchCatalogsForCompany(targetEmpresa, true);
            }
            fetchData();
            const bData = await fetchBancosList();
            resetBancoForm(bData?.nextCodigo || '');
            if (showModal && editingBancoCodigo === null) {
                setShowCatalogModal(false);
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar el banco', 'error');
        } finally {
            setSavingBanco(false);
        }
    };

    const handleEditTipoCuenta = (t) => {
        setEditingTipoCuentaCodigo(t.codigo);
        const scope = resolveCatalogEditEmpresaScope(t);
        setTipoCuentaFormData({
            codigo: t.codigo || '',
            descripcion: t.descripcion || '',
            ...scope
        });
    };

    const handleSaveTipoCuenta = async (e) => {
        e.preventDefault();
        if (!tipoCuentaFormData.descripcion.trim()) {
            addToast('La descripción del tipo de cuenta es obligatoria', 'warning');
            return;
        }
        setSavingTipoCuenta(true);
        try {
            if (editingTipoCuentaCodigo !== null) {
                const res = await api.put(`/bancos/tipos-cuenta/${encodeURIComponent(editingTipoCuentaCodigo)}`, {
                    descripcion: tipoCuentaFormData.descripcion,
                    todas_empresas: tipoCuentaFormData.todas_empresas,
                    id_empresa: tipoCuentaFormData.todas_empresas ? undefined : tipoCuentaFormData.id_empresa
                });
                addToast(res.data.message || 'Tipo de cuenta actualizado', 'success');
            } else {
                const res = await api.post('/bancos/tipos-cuenta', tipoCuentaFormData);
                addToast(res.data.message || 'Tipo de cuenta registrado', 'success');
                if (showModal && res.data?.codigo) {
                    setFormData(prev => ({ ...prev, cod_tipo: res.data.codigo }));
                }
            }
            const targetEmpresa = formData.id_empresa || empresas[0]?.id;
            if (targetEmpresa) {
                await fetchCatalogsForCompany(targetEmpresa, true);
            }
            fetchData();
            const tcData = await fetchTiposCuentaList();
            resetTipoCuentaForm(tcData?.nextCodigo || '');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar tipo de cuenta', err.response?.status === 409 ? 'warning' : 'error');
        } finally {
            setSavingTipoCuenta(false);
        }
    };

    const handleDeleteTipoCuenta = async (t) => {
        const ok = await confirm(
            `¿Está seguro de eliminar el tipo de cuenta "${t.descripcion}" (${t.codigo})?`,
            { title: 'Eliminar Tipo de Cuenta', variant: 'danger' }
        );
        if (!ok) return;
        try {
            const res = await api.delete(`/bancos/tipos-cuenta/${encodeURIComponent(t.codigo)}`);
            addToast(res.data.message || 'Tipo de cuenta eliminado', 'success');
            if (editingTipoCuentaCodigo === t.codigo) resetTipoCuentaForm();
            const targetEmpresa = formData.id_empresa || empresas[0]?.id;
            if (targetEmpresa) await fetchCatalogsForCompany(targetEmpresa, true);
            fetchData();
            const tcData = await fetchTiposCuentaList();
            resetTipoCuentaForm(tcData?.nextCodigo || '');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar tipo de cuenta', err.response?.status === 409 ? 'warning' : 'error');
        }
    };

    const handleEditTipoRemesa = (r) => {
        setEditingTipoRemesaCodigo(r.codigo);
        const scope = resolveCatalogEditEmpresaScope(r);
        setTipoRemesaFormData({
            codigo: r.codigo || '',
            descripcion: r.descripcion || '',
            ...scope
        });
    };

    const handleSaveTipoRemesa = async (e) => {
        e.preventDefault();
        if (!tipoRemesaFormData.descripcion.trim()) {
            addToast('La descripción del tipo de remesa es obligatoria', 'warning');
            return;
        }
        setSavingTipoRemesa(true);
        try {
            if (editingTipoRemesaCodigo !== null) {
                const res = await api.put(`/bancos/tipos-remesas/${encodeURIComponent(editingTipoRemesaCodigo)}`, {
                    descripcion: tipoRemesaFormData.descripcion,
                    todas_empresas: tipoRemesaFormData.todas_empresas,
                    id_empresa: tipoRemesaFormData.todas_empresas ? undefined : tipoRemesaFormData.id_empresa
                });
                addToast(res.data.message || 'Tipo de remesa actualizado', 'success');
            } else {
                const res = await api.post('/bancos/tipos-remesas', tipoRemesaFormData);
                addToast(res.data.message || 'Tipo de remesa registrado', 'success');
            }
            const trData = await fetchTiposRemesasList();
            resetTipoRemesaForm(trData?.nextCodigo || '');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar tipo de remesa', err.response?.status === 409 ? 'warning' : 'error');
        } finally {
            setSavingTipoRemesa(false);
        }
    };

    const handleDeleteTipoRemesa = async (r) => {
        const ok = await confirm(
            `¿Está seguro de eliminar el tipo de remesa "${r.descripcion}" (${r.codigo})?`,
            { title: 'Eliminar Tipo de Remesa', variant: 'danger' }
        );
        if (!ok) return;
        try {
            const res = await api.delete(`/bancos/tipos-remesas/${encodeURIComponent(r.codigo)}`);
            addToast(res.data.message || 'Tipo de remesa eliminado', 'success');
            if (editingTipoRemesaCodigo === r.codigo) resetTipoRemesaForm();
            const trData = await fetchTiposRemesasList();
            resetTipoRemesaForm(trData?.nextCodigo || '');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar tipo de remesa', err.response?.status === 409 ? 'warning' : 'error');
        }
    };

    // Chequeras handlers
    const resetChequeraForm = (defaultCuentaId = chequeraFilterCuenta) => {
        setEditingChequera(null);
        setChequeraFormData({
            cuenta_bancaria_id: defaultCuentaId ? String(defaultCuentaId) : '',
            serie: '',
            desde: '',
            hasta: '',
            siguiente_correlativo: '',
            alerta_stock_bajo: '10',
            activo: true,
            notas: ''
        });
    };

    const handleOpenChequerasModal = async (cuentaId = '') => {
        const cuentaStr = cuentaId ? String(cuentaId) : '';
        setChequeraFilterCuenta(cuentaStr);
        setChequeraFilterActivo('all');
        resetChequeraForm(cuentaStr);
        setShowChequerasModal(true);
        await fetchChequeras(cuentaStr, 'all');
    };

    const handleEditChequera = (chq) => {
        setEditingChequera(chq);
        setChequeraFormData({
            cuenta_bancaria_id: String(chq.cuenta_bancaria_id),
            serie: chq.serie || '',
            desde: String(chq.desde ?? ''),
            hasta: String(chq.hasta ?? ''),
            siguiente_correlativo: String(chq.siguiente_correlativo ?? ''),
            alerta_stock_bajo: String(chq.alerta_stock_bajo ?? 10),
            activo: Boolean(chq.activo),
            notas: chq.notas || ''
        });
    };

    const handleSaveChequera = async (e) => {
        e.preventDefault();
        if (savingChequera) return;
        if (!chequeraFormData.cuenta_bancaria_id) {
            addToast('Seleccione una cuenta bancaria', 'warning');
            return;
        }
        const desdeNum = parseInt(chequeraFormData.desde, 10);
        const hastaNum = parseInt(chequeraFormData.hasta, 10);
        if (!Number.isInteger(desdeNum) || desdeNum < 1 || !Number.isInteger(hastaNum) || hastaNum < desdeNum) {
            addToast('El rango debe ser válido (Desde >= 1 y Hasta >= Desde)', 'warning');
            return;
        }
        const sigRaw = chequeraFormData.siguiente_correlativo;
        const sigNum = sigRaw === '' || sigRaw === null || sigRaw === undefined
            ? desdeNum
            : Number(sigRaw);
        if (!Number.isInteger(sigNum) || sigNum < desdeNum || sigNum > hastaNum + 1) {
            addToast('El siguiente correlativo debe estar entre Desde y Hasta + 1', 'warning');
            return;
        }
        setSavingChequera(true);
        try {
            const payload = {
                cuenta_bancaria_id: Number(chequeraFormData.cuenta_bancaria_id),
                serie: chequeraFormData.serie,
                desde: desdeNum,
                hasta: hastaNum,
                siguiente_correlativo: sigNum,
                alerta_stock_bajo: chequeraFormData.alerta_stock_bajo === '' ? 10 : Number(chequeraFormData.alerta_stock_bajo),
                activo: Boolean(chequeraFormData.activo),
                notas: chequeraFormData.notas || null
            };
            if (editingChequera) {
                const res = await api.put(`/bancos/chequeras/${editingChequera.id}`, payload);
                addToast(res.data.message || 'Chequera actualizada exitosamente', 'success');
            } else {
                const res = await api.post('/bancos/chequeras', payload);
                addToast(res.data.message || 'Chequera registrada exitosamente', 'success');
            }
            resetChequeraForm(chequeraFilterCuenta);
            await fetchChequeras(chequeraFilterCuenta, chequeraFilterActivo);
            fetchChequeraAlertsSummary();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar la chequera', err.response?.status === 409 ? 'warning' : 'error');
        } finally {
            setSavingChequera(false);
        }
    };

    const handleDeleteChequera = async (chq) => {
        const ok = await confirm(
            `¿Está seguro de eliminar/desactivar la chequera ${chq.serie ? `serie "${chq.serie}" ` : ''}(${chq.desde}-${chq.hasta})?`,
            { title: 'Eliminar Chequera', variant: 'danger' }
        );
        if (!ok) return;
        try {
            const res = await api.delete(`/bancos/chequeras/${chq.id}`);
            addToast(res.data?.message || 'Chequera procesada exitosamente', 'success');
            if (editingChequera?.id === chq.id) resetChequeraForm(chequeraFilterCuenta);
            await fetchChequeras(chequeraFilterCuenta, chequeraFilterActivo);
            fetchChequeraAlertsSummary();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar chequera', 'error');
        }
    };

    const filteredListaBancos = useMemo(() => {
        if (!searchBancoTerm) return listaBancos;
        const low = searchBancoTerm.toLowerCase();
        return listaBancos.filter(b =>
            (b.descripcion || '').toLowerCase().includes(low) ||
            (b.codigo || '').toLowerCase().includes(low)
        );
    }, [listaBancos, searchBancoTerm]);

    const filteredTiposCuenta = useMemo(() => {
        if (!searchTipoCuentaTerm) return listaTiposCuenta;
        const low = searchTipoCuentaTerm.toLowerCase();
        return listaTiposCuenta.filter(t =>
            (t.descripcion || '').toLowerCase().includes(low) ||
            (t.codigo || '').toLowerCase().includes(low)
        );
    }, [listaTiposCuenta, searchTipoCuentaTerm]);

    const filteredTiposRemesas = useMemo(() => {
        if (!searchTipoRemesaTerm) return listaTiposRemesas;
        const low = searchTipoRemesaTerm.toLowerCase();
        return listaTiposRemesas.filter(r =>
            (r.descripcion || '').toLowerCase().includes(low) ||
            (r.codigo || '').toLowerCase().includes(low)
        );
    }, [listaTiposRemesas, searchTipoRemesaTerm]);

    // Filters and Pagination logic
    const filteredAccounts = useMemo(() => {
        if (!searchTerm) return accounts;
        const lowSearch = searchTerm.toLowerCase();
        return accounts.filter(acc => 
            (acc.numero || '').toLowerCase().includes(lowSearch) ||
            (acc.nombre || '').toLowerCase().includes(lowSearch) ||
            (acc.empresa_nombre || '').toLowerCase().includes(lowSearch) ||
            (acc.banco_nombre || '').toLowerCase().includes(lowSearch) ||
            (acc.cod_cta || '').toLowerCase().includes(lowSearch)
        );
    }, [accounts, searchTerm]);

    const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
    const paginatedAccounts = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAccounts.slice(start, start + itemsPerPage);
    }, [filteredAccounts, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const handleCompanyChange = (id_empresa) => {
        setFormData(prev => ({ ...prev, id_empresa, cod_banco: '', cod_tipo: '' }));
        fetchCatalogsForCompany(id_empresa, false);
    };

    const handleOpenModal = async (account = null) => {
        if (account) {
            const ordenValue = account.orden !== undefined && account.orden !== null ? account.orden : '';
            setFormData({
                id_empresa: account.id_empresa, 
                cod_banco: account.cod_banco, 
                numero: account.numero, 
                nombre: account.nombre, 
                activa: account.activa,
                cod_tipo: account.cod_tipo || '',
                cod_cta: account.cod_cta || '',
                orden: ordenValue,
                saldo_inicial: account.saldo_inicial !== undefined && account.saldo_inicial !== null ? String(account.saldo_inicial) : '0.00',
                fecha_saldo_inicial: account.fecha_saldo_inicial || ''
            });
            setEditingAccount(account);
            await fetchCatalogsForCompany(account.id_empresa, true);
        } else {
            setEditingAccount(null);
            const firstEmp = empresas[0]?.id || '';
            setFormData({ 
                id_empresa: firstEmp, 
                cod_banco: '', 
                numero: '', 
                nombre: '', 
                activa: 'S',
                cod_tipo: '',
                cod_cta: '',
                orden: '',
                saldo_inicial: '0.00',
                fecha_saldo_inicial: ''
            });
            if (firstEmp) await fetchCatalogsForCompany(firstEmp, false);
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            if (editingAccount) {
                await api.put(`/bancos/cuentas/${editingAccount.corr}`, formData);
                addToast('Cuenta actualizada con éxito', 'success');
            } else {
                await api.post('/bancos/cuentas', formData);
                addToast('Cuenta creada con éxito', 'success');
            }
            setShowModal(false);
            fetchData();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar la cuenta', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleStatus = async (account) => {
        if (!canManageCuentas) return;
        const newStatus = account.activa === 'S' ? 'N' : 'S';
        const ok = await confirm(
            `¿Está seguro que desea ${newStatus === 'S' ? 'activar' : 'desactivar'} la cuenta ${account.numero}?`,
            {
                title: newStatus === 'S' ? 'Activar Cuenta Bancaria' : 'Desactivar Cuenta Bancaria',
                confirmText: newStatus === 'S' ? 'Activar' : 'Desactivar',
                variant: newStatus === 'N' ? 'danger' : 'primary'
            }
        );
        if (!ok) return;

        try {
            await api.put(`/bancos/cuentas/${account.corr}`, { ...account, activa: newStatus });
            addToast(`Cuenta ${newStatus === 'S' ? 'activada' : 'desactivada'}`, 'success');
            fetchData();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cambiar estado', 'error');
        }
    };

    const handleOneClickNav = (targetKey, account) => {
        navigateToBancosTarget(navigate, targetKey, {
            empresaId: account.id_empresa,
            cuentaId: account.corr,
            numeroCuenta: account.numero
        });
    };

    if (loading) return <div className="p-8 text-center text-muted">Cargando cuentas bancarias...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Landmark size={22} color="var(--primary)" />
                        Cuentas Bancarias
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.15rem 0 0 0' }}>
                        Gestión de cuentas por empresa, catálogos y talonarios de cheques.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px', maxWidth: '280px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar cuenta..."
                            style={{ paddingLeft: '2.25rem', width: '100%', height: '36px', fontSize: '0.825rem' }}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn-secondary" onClick={() => handleOpenCatalogModal('BANCOS')} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.9rem', fontSize: '0.825rem' }}>
                        <Landmark size={16} />
                        Bancos
                    </button>
                    <button className="btn-secondary" onClick={() => handleOpenCatalogModal('TIPOS_CUENTA')} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.9rem', fontSize: '0.825rem' }}>
                        <Layers size={16} />
                        Catálogos
                    </button>
                    <button className="btn-secondary" onClick={() => handleOpenChequerasModal('')} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.9rem', fontSize: '0.825rem' }}>
                        <BookOpen size={16} />
                        Chequeras
                        {chequeraAlertsCount > 0 && (
                            <span className="badge" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}>
                                {chequeraAlertsCount}
                            </span>
                        )}
                    </button>
                    {canManageCuentas && (
                        <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.95rem', fontSize: '0.825rem' }}>
                            <Plus size={16} />
                            Nueva Cuenta
                        </button>
                    )}
                </div>
            </div>

            <div className="card glass table-responsive" style={{ padding: 0 }}>
                <table style={{ fontSize: '0.8rem', width: '100%', minWidth: '1040px', borderCollapse: 'collapse', marginTop: 0 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Empresa</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Banco</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Nombre de Cuenta</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', minWidth: '130px' }}>Cuenta Contable</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Número de Cuenta</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Saldo Inicial</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Estado</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedAccounts.length === 0 && (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No se encontraron cuentas bancarias.
                                </td>
                            </tr>
                        )}
                        {paginatedAccounts.map(account => (
                            <tr key={account.corr} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: '500' }}>{account.empresa_nombre || account.id_empresa}</td>
                                <td style={{ padding: '0.45rem 0.5rem' }}>{account.banco_nombre || account.cod_banco}</td>
                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                    <div>{account.nombre || '-'}</div>
                                    {account.tipo_nombre && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{account.tipo_nombre}</div>
                                    )}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', minWidth: '130px' }}>
                                    {account.cod_cta ? (
                                        <code style={{ color: 'var(--primary)' }}>{account.cod_cta}</code>
                                    ) : (
                                        <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: 'rgba(255,193,7,0.2)', color: '#ffc007', border: '1px solid rgba(255,193,7,0.3)' }}>
                                            Sin Cta. Contable
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <Hash size={13} color="var(--text-muted)" />
                                        <code>{account.numero}</code>
                                    </div>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontWeight: 600 }}>{moneyFmt(account.saldo_inicial)}</div>
                                    {account.fecha_saldo_inicial && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            Desde {formatDateDMY(account.fecha_saldo_inicial)}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => toggleStatus(account)}
                                        disabled={!canManageCuentas}
                                        style={{ background: 'none', border: 'none', cursor: canManageCuentas ? 'pointer' : 'default', padding: 0 }}
                                        title={canManageCuentas ? 'Clic para cambiar estado' : ''}
                                    >
                                        {account.activa === 'S' ? (
                                            <span className="badge badge-active" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>
                                                Activa
                                            </span>
                                        ) : (
                                            <span className="badge badge-inactive" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>
                                                Inactiva
                                            </span>
                                        )}
                                    </button>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'nowrap' }}>
                                        {canGoConciliar && (
                                            <button
                                                type="button"
                                                onClick={() => handleOneClickNav('conciliacion', account)}
                                                title="Ir a Conciliación Bancaria con esta cuenta"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                    padding: '0.2rem 0.45rem', fontSize: '0.72rem', fontWeight: 600,
                                                    borderRadius: '5px', cursor: 'pointer',
                                                    background: 'rgba(16,185,129,0.12)', color: '#10b981',
                                                    border: '1px solid rgba(16,185,129,0.28)'
                                                }}
                                            >
                                                <Scale size={12} /> Conciliar
                                            </button>
                                        )}
                                        {canGoMovimientos && (
                                            <button
                                                type="button"
                                                onClick={() => handleOneClickNav('movimientos', account)}
                                                title="Ir a Movimientos Bancarios con esta cuenta"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                    padding: '0.2rem 0.45rem', fontSize: '0.72rem', fontWeight: 600,
                                                    borderRadius: '5px', cursor: 'pointer',
                                                    background: 'rgba(59,130,246,0.12)', color: '#60a5fa',
                                                    border: '1px solid rgba(59,130,246,0.28)'
                                                }}
                                            >
                                                <ArrowRightLeft size={12} /> Mov.
                                            </button>
                                        )}
                                        {canGoKardex && (
                                            <button
                                                type="button"
                                                onClick={() => handleOneClickNav('kardex', account)}
                                                title="Ver Kardex / Auxiliar de esta cuenta"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                    padding: '0.2rem 0.45rem', fontSize: '0.72rem', fontWeight: 600,
                                                    borderRadius: '5px', cursor: 'pointer',
                                                    background: 'rgba(168,85,247,0.12)', color: '#c084fc',
                                                    border: '1px solid rgba(168,85,247,0.28)'
                                                }}
                                            >
                                                <FileSpreadsheet size={12} /> Kardex
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleOpenChequerasModal(account.corr)}
                                            title="Gestionar chequeras / talonarios de esta cuenta"
                                            style={{
                                                background: 'none', color: '#f59e0b', padding: '0.25rem', cursor: 'pointer',
                                                display: 'inline-flex', alignItems: 'center'
                                            }}
                                        >
                                            <BookOpen size={15} />
                                        </button>
                                        {canManageCuentas && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenModal(account)}
                                                style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                                                title="Editar cuenta"
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
                        gap: '0.75rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.02)'
                    }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Mostrando {paginatedAccounts.length} de {filteredAccounts.length} resultados
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                                className="btn-secondary"
                                style={{ padding: '0.35rem', minWidth: 'auto' }}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span style={{ fontSize: '0.8rem', padding: '0 0.5rem' }}>
                                Página <strong>{currentPage}</strong> de {totalPages}
                            </span>
                            <button
                                className="btn-secondary"
                                style={{ padding: '0.35rem', minWidth: 'auto' }}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{editingAccount ? <Edit2 size={18} color="var(--primary)" /> : <Plus size={18} color="var(--primary)" />}{editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}</span>}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Empresa</label>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                value={formData.id_empresa}
                                onChange={e => handleCompanyChange(e.target.value)}
                                disabled={Boolean(editingAccount)}
                                required
                            >
                                <option value="">Seleccione Empresa</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Estado</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '36px' }}>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, activa: formData.activa === 'S' ? 'N' : 'S' })}
                                    style={{
                                        position: 'relative',
                                        width: '44px',
                                        height: '22px',
                                        minHeight: 0,
                                        background: formData.activa === 'S' ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
                                        border: 'none',
                                        borderRadius: '11px',
                                        cursor: 'pointer',
                                        transition: 'background 0.3s',
                                        padding: 0
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '2px',
                                            left: formData.activa === 'S' ? '24px' : '2px',
                                            width: '18px',
                                            height: '18px',
                                            background: 'white',
                                            borderRadius: '50%',
                                            transition: 'left 0.3s'
                                        }}
                                    />
                                </button>
                                <span style={{ fontSize: '0.8rem', color: formData.activa === 'S' ? 'var(--text)' : 'var(--text-muted)' }}>
                                    {formData.activa === 'S' ? 'Activa' : 'Inactiva'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="form-grid form-grid-2">
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Banco</label>
                                <button
                                    type="button"
                                    onClick={() => handleOpenCatalogModal('BANCOS')}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--primary)',
                                        cursor: 'pointer', fontSize: '0.75rem',
                                        display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: 0
                                    }}
                                >
                                    <Plus size={13} /> Gestionar
                                </button>
                            </div>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                value={formData.cod_banco}
                                onChange={e => {
                                    if (e.target.value === '__NEW_BANK__') {
                                        handleOpenCatalogModal('BANCOS');
                                    } else {
                                        setFormData({ ...formData, cod_banco: e.target.value });
                                    }
                                }}
                                required
                                disabled={!formData.id_empresa}
                            >
                                <option value="">Seleccione Banco</option>
                                {bancos.map(ban => (
                                    <option key={ban.id} value={ban.id}>{ban.descripcion}</option>
                                ))}
                                <option value="__NEW_BANK__" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                    ➕ Agregar nuevo banco...
                                </option>
                            </select>
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Tipo de Cuenta</label>
                                <button
                                    type="button"
                                    onClick={() => handleOpenCatalogModal('TIPOS_CUENTA')}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--primary)',
                                        cursor: 'pointer', fontSize: '0.75rem',
                                        display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: 0
                                    }}
                                >
                                    <Plus size={13} /> Nuevo Tipo
                                </button>
                            </div>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                value={formData.cod_tipo}
                                onChange={e => setFormData({ ...formData, cod_tipo: e.target.value })}
                                required
                                disabled={!formData.id_empresa}
                            >
                                <option value="">Seleccione Tipo</option>
                                {tipos.map(t => (
                                    <option key={t.id} value={t.id}>{t.descripcion}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Número de Cuenta</label>
                            <div style={{ position: 'relative' }}>
                                <Hash size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.825rem', width: '100%' }}
                                    placeholder="000-0000000-00"
                                    value={formData.numero}
                                    onChange={e => setFormData({ ...formData, numero: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cta. Contable</label>
                            <div style={{ position: 'relative' }}>
                                <FileText size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.825rem', width: '100%' }}
                                    placeholder="1101-01-01"
                                    value={formData.cod_cta}
                                    onChange={e => setFormData({ ...formData, cod_cta: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Orden</label>
                            <input
                                type="number"
                                placeholder="0"
                                style={{ height: '36px', fontSize: '0.825rem', width: '100%', maxWidth: '120px' }}
                                value={formData.orden === undefined ? '' : formData.orden}
                                onChange={e => setFormData({ ...formData, orden: e.target.value })}
                                min="0"
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Nombre Alterno / Representante</label>
                        <div style={{ position: 'relative' }}>
                            <User size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.825rem', width: '100%' }}
                                placeholder="Ej: Cuenta de Planilla o Nombre del dueño"
                                value={formData.nombre}
                                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Saldo Inicial ($) (Opcional)</label>
                            <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                style={{ height: '36px', fontSize: '0.825rem', width: '100%' }}
                                value={formData.saldo_inicial}
                                onChange={e => setFormData({ ...formData, saldo_inicial: e.target.value })}
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                Por defecto $0.00 para cuentas que ya contienen su historial inicial migrado.
                            </span>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha Saldo Inicial (Opcional)</label>
                            <input
                                type="date"
                                style={{ height: '36px', fontSize: '0.825rem', width: '100%' }}
                                value={formData.fecha_saldo_inicial || ''}
                                onChange={e => setFormData({ ...formData, fecha_saldo_inicial: e.target.value })}
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1, height: '36px', fontSize: '0.825rem' }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" disabled={submitting} style={{ flex: 2, height: '36px', fontSize: '0.825rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                            <Save size={16} />
                            {submitting ? 'Guardando...' : (editingAccount ? 'Actualizar Cuenta' : 'Guardar Cuenta')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal Unificado de Catálogos Bancarios: Bancos, Tipos de Cuenta y Tipos de Remesas */}
            <Modal
                open={showCatalogModal}
                onClose={handleCloseCatalogModal}
                title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={18} color="var(--primary)" />
                        Catálogos Bancarios
                    </span>
                }
                size="lg"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
                        {[
                            { key: 'BANCOS', label: `Bancos (${listaBancos.length})` },
                            { key: 'TIPOS_CUENTA', label: `Tipos de Cuenta (${listaTiposCuenta.length})` },
                            { key: 'TIPOS_REMESAS', label: `Tipos de Remesas (${listaTiposRemesas.length})` }
                        ].map(tab => {
                            const active = activeCatalogTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setActiveCatalogTab(tab.key)}
                                    style={{
                                        height: '32px',
                                        padding: '0 0.85rem',
                                        fontSize: '0.8rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: active ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                        color: active ? '#fff' : 'var(--text-muted)',
                                        fontWeight: active ? 600 : 500
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {activeCatalogTab === 'BANCOS' && (
                        <>
                            {canManageCuentas && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {editingBancoCodigo !== null ? <Edit2 size={15} color="var(--primary)" /> : <Plus size={15} color="var(--primary)" />}
                                            {editingBancoCodigo !== null ? `Editar Banco (${editingBancoCodigo})` : 'Registrar Nuevo Banco'}
                                        </span>
                                        {editingBancoCodigo !== null && (
                                            <button type="button" onClick={() => resetBancoForm()} className="btn-secondary" style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <X size={13} /> Cancelar edición
                                            </button>
                                        )}
                                    </div>
                                    <form onSubmit={handleSaveBanco} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                        <div className="form-grid form-grid-2" style={{ gap: '0.7rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Nombre del Banco *</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: BANCO AZTECA"
                                                    value={bancoFormData.descripcion}
                                                    onChange={e => setBancoFormData(prev => ({ ...prev, descripcion: e.target.value.toUpperCase() }))}
                                                    required
                                                    style={{ height: '36px', fontSize: '0.825rem', textTransform: 'uppercase', width: '100%' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Código</label>
                                                <input
                                                    type="text"
                                                    placeholder="00"
                                                    value={bancoFormData.codigo}
                                                    disabled={editingBancoCodigo !== null}
                                                    onChange={e => setBancoFormData(prev => ({ ...prev, codigo: e.target.value }))}
                                                    style={{ height: '36px', fontSize: '0.825rem', width: '110px', textAlign: 'center', fontWeight: 'bold', opacity: editingBancoCodigo !== null ? 0.65 : 1 }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={bancoFormData.todas_empresas}
                                                    onChange={e => setBancoFormData(prev => ({ ...prev, todas_empresas: e.target.checked }))}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                />
                                                <span>Habilitar para <strong>todas las empresas</strong></span>
                                            </label>
                                            {!bancoFormData.todas_empresas && (
                                                <div style={{ marginTop: '0.45rem' }}>
                                                    <select
                                                        value={bancoFormData.id_empresa}
                                                        onChange={e => setBancoFormData(prev => ({ ...prev, id_empresa: e.target.value }))}
                                                        style={{ height: '36px', fontSize: '0.825rem', width: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                                        required={!bancoFormData.todas_empresas}
                                                    >
                                                        <option value="">Seleccione Empresa</option>
                                                        {empresas.map(emp => (
                                                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button type="submit" className="btn-primary" disabled={savingBanco || !bancoFormData.descripcion.trim()} style={{ height: '36px', padding: '0 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}>
                                                <Save size={15} />
                                                {savingBanco ? 'Guardando...' : (editingBancoCodigo !== null ? 'Actualizar Banco' : 'Guardar Banco')}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Bancos en Sistema ({filteredListaBancos.length})</span>
                                    <div style={{ position: 'relative', width: '190px' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input type="text" placeholder="Buscar banco..." value={searchBancoTerm} onChange={e => setSearchBancoTerm(e.target.value)} style={{ height: '32px', fontSize: '0.78rem', paddingLeft: '1.85rem', width: '100%' }} />
                                    </div>
                                </div>
                                <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', minWidth: '480px', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: 0 }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', width: '70px' }}>Código</th>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>Descripción</th>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'right' }}>Empresas</th>
                                                {canManageCuentas && <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'center', width: '70px' }}>Acción</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredListaBancos.length === 0 ? (
                                                <tr><td colSpan={canManageCuentas ? 4 : 3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron bancos</td></tr>
                                            ) : filteredListaBancos.map((b, idx) => (
                                                <tr key={`${b.codigo}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem' }}><code style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{b.codigo}</code></td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{b.descripcion}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                        <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: b.empresas_count >= empresas.length && empresas.length > 0 ? 'rgba(40,167,69,0.15)' : 'rgba(255,193,7,0.15)', color: b.empresas_count >= empresas.length && empresas.length > 0 ? '#28a745' : '#ffc107', border: 'none' }}>
                                                            {b.empresas_count >= empresas.length && empresas.length > 0 ? 'Todas' : `${b.empresas_count} emp.`}
                                                        </span>
                                                    </td>
                                                    {canManageCuentas && (
                                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                            <button type="button" onClick={() => handleEditBanco(b)} title="Editar banco" style={{ background: 'none', color: 'var(--text-muted)', padding: '0.2rem', cursor: 'pointer' }}>
                                                                <Edit2 size={14} />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {activeCatalogTab === 'TIPOS_CUENTA' && (
                        <>
                            {canManageCuentas && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {editingTipoCuentaCodigo !== null ? <Edit2 size={15} color="var(--primary)" /> : <Plus size={15} color="var(--primary)" />}
                                            {editingTipoCuentaCodigo !== null ? `Editar Tipo de Cuenta (${editingTipoCuentaCodigo})` : 'Nuevo Tipo de Cuenta Bancaria'}
                                        </span>
                                        {editingTipoCuentaCodigo !== null && (
                                            <button type="button" onClick={() => resetTipoCuentaForm()} className="btn-secondary" style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <X size={13} /> Cancelar edición
                                            </button>
                                        )}
                                    </div>
                                    <form onSubmit={handleSaveTipoCuenta} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                        <div className="form-grid form-grid-2" style={{ gap: '0.7rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Descripción *</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: CUENTA CORRIENTE"
                                                    value={tipoCuentaFormData.descripcion}
                                                    onChange={e => setTipoCuentaFormData(prev => ({ ...prev, descripcion: e.target.value.toUpperCase() }))}
                                                    required
                                                    style={{ height: '36px', fontSize: '0.825rem', textTransform: 'uppercase', width: '100%' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Código</label>
                                                <input
                                                    type="text"
                                                    placeholder="01"
                                                    value={tipoCuentaFormData.codigo}
                                                    disabled={editingTipoCuentaCodigo !== null}
                                                    onChange={e => setTipoCuentaFormData(prev => ({ ...prev, codigo: e.target.value.toUpperCase() }))}
                                                    style={{ height: '36px', fontSize: '0.825rem', width: '110px', textAlign: 'center', fontWeight: 'bold', opacity: editingTipoCuentaCodigo !== null ? 0.65 : 1 }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={tipoCuentaFormData.todas_empresas}
                                                    onChange={e => setTipoCuentaFormData(prev => ({ ...prev, todas_empresas: e.target.checked }))}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                />
                                                <span>Aplicar a <strong>todas las empresas</strong></span>
                                            </label>
                                            {!tipoCuentaFormData.todas_empresas && (
                                                <div style={{ marginTop: '0.45rem' }}>
                                                    <select
                                                        value={tipoCuentaFormData.id_empresa}
                                                        onChange={e => setTipoCuentaFormData(prev => ({ ...prev, id_empresa: e.target.value }))}
                                                        style={{ height: '36px', fontSize: '0.825rem', width: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                                        required={!tipoCuentaFormData.todas_empresas}
                                                    >
                                                        <option value="">Seleccione Empresa</option>
                                                        {empresas.map(emp => (
                                                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button type="submit" className="btn-primary" disabled={savingTipoCuenta || !tipoCuentaFormData.descripcion.trim()} style={{ height: '36px', padding: '0 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}>
                                                <Save size={15} />
                                                {savingTipoCuenta ? 'Guardando...' : (editingTipoCuentaCodigo !== null ? 'Actualizar Tipo' : 'Guardar Tipo')}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Tipos de Cuenta ({filteredTiposCuenta.length})</span>
                                    <div style={{ position: 'relative', width: '190px' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input type="text" placeholder="Buscar tipo..." value={searchTipoCuentaTerm} onChange={e => setSearchTipoCuentaTerm(e.target.value)} style={{ height: '32px', fontSize: '0.78rem', paddingLeft: '1.85rem', width: '100%' }} />
                                    </div>
                                </div>
                                <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', minWidth: '480px', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: 0 }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', width: '70px' }}>Código</th>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>Descripción</th>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'right' }}>Empresas</th>
                                                {canManageCuentas && <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'center', width: '85px' }}>Acciones</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTiposCuenta.length === 0 ? (
                                                <tr><td colSpan={canManageCuentas ? 4 : 3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay tipos de cuenta registrados</td></tr>
                                            ) : filteredTiposCuenta.map((t, idx) => (
                                                <tr key={`${t.codigo}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem' }}><code style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{t.codigo}</code></td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{t.descripcion}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                        <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: t.empresas_count >= empresas.length && empresas.length > 0 ? 'rgba(40,167,69,0.15)' : 'rgba(255,193,7,0.15)', color: t.empresas_count >= empresas.length && empresas.length > 0 ? '#28a745' : '#ffc107', border: 'none' }}>
                                                            {t.empresas_count >= empresas.length && empresas.length > 0 ? 'Todas' : `${t.empresas_count} emp.`}
                                                        </span>
                                                    </td>
                                                    {canManageCuentas && (
                                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                                                <button type="button" onClick={() => handleEditTipoCuenta(t)} title="Editar" style={{ background: 'none', color: 'var(--text-muted)', padding: '0.2rem', cursor: 'pointer' }}><Edit2 size={14} /></button>
                                                                <button type="button" onClick={() => handleDeleteTipoCuenta(t)} title="Eliminar" style={{ background: 'none', color: '#ef4444', padding: '0.2rem', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {activeCatalogTab === 'TIPOS_REMESAS' && (
                        <>
                            {canManageCuentas && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {editingTipoRemesaCodigo !== null ? <Edit2 size={15} color="var(--primary)" /> : <Plus size={15} color="var(--primary)" />}
                                            {editingTipoRemesaCodigo !== null ? `Editar Tipo de Remesa (${editingTipoRemesaCodigo})` : 'Nuevo Tipo de Remesa / Movimiento'}
                                        </span>
                                        {editingTipoRemesaCodigo !== null && (
                                            <button type="button" onClick={() => resetTipoRemesaForm()} className="btn-secondary" style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <X size={13} /> Cancelar edición
                                            </button>
                                        )}
                                    </div>
                                    <form onSubmit={handleSaveTipoRemesa} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                        <div className="form-grid form-grid-2" style={{ gap: '0.7rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Descripción *</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: REMESA EN EFECTIVO"
                                                    value={tipoRemesaFormData.descripcion}
                                                    onChange={e => setTipoRemesaFormData(prev => ({ ...prev, descripcion: e.target.value.toUpperCase() }))}
                                                    required
                                                    style={{ height: '36px', fontSize: '0.825rem', textTransform: 'uppercase', width: '100%' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Código</label>
                                                <input
                                                    type="text"
                                                    placeholder="01"
                                                    value={tipoRemesaFormData.codigo}
                                                    disabled={editingTipoRemesaCodigo !== null}
                                                    onChange={e => setTipoRemesaFormData(prev => ({ ...prev, codigo: e.target.value.toUpperCase() }))}
                                                    style={{ height: '36px', fontSize: '0.825rem', width: '110px', textAlign: 'center', fontWeight: 'bold', opacity: editingTipoRemesaCodigo !== null ? 0.65 : 1 }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={tipoRemesaFormData.todas_empresas}
                                                    onChange={e => setTipoRemesaFormData(prev => ({ ...prev, todas_empresas: e.target.checked }))}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                />
                                                <span>Aplicar a <strong>todas las empresas</strong></span>
                                            </label>
                                            {!tipoRemesaFormData.todas_empresas && (
                                                <div style={{ marginTop: '0.45rem' }}>
                                                    <select
                                                        value={tipoRemesaFormData.id_empresa}
                                                        onChange={e => setTipoRemesaFormData(prev => ({ ...prev, id_empresa: e.target.value }))}
                                                        style={{ height: '36px', fontSize: '0.825rem', width: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)' }}
                                                        required={!tipoRemesaFormData.todas_empresas}
                                                    >
                                                        <option value="">Seleccione Empresa</option>
                                                        {empresas.map(emp => (
                                                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button type="submit" className="btn-primary" disabled={savingTipoRemesa || !tipoRemesaFormData.descripcion.trim()} style={{ height: '36px', padding: '0 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}>
                                                <Save size={15} />
                                                {savingTipoRemesa ? 'Guardando...' : (editingTipoRemesaCodigo !== null ? 'Actualizar Tipo' : 'Guardar Tipo')}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Tipos de Remesas ({filteredTiposRemesas.length})</span>
                                    <div style={{ position: 'relative', width: '190px' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input type="text" placeholder="Buscar remesa..." value={searchTipoRemesaTerm} onChange={e => setSearchTipoRemesaTerm(e.target.value)} style={{ height: '32px', fontSize: '0.78rem', paddingLeft: '1.85rem', width: '100%' }} />
                                    </div>
                                </div>
                                <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', minWidth: '480px', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: 0 }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', width: '70px' }}>Código</th>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>Descripción</th>
                                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'right' }}>Empresas</th>
                                                {canManageCuentas && <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'center', width: '85px' }}>Acciones</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTiposRemesas.length === 0 ? (
                                                <tr><td colSpan={canManageCuentas ? 4 : 3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay tipos de remesas registrados</td></tr>
                                            ) : filteredTiposRemesas.map((r, idx) => (
                                                <tr key={`${r.codigo}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem' }}><code style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{r.codigo}</code></td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{r.descripcion}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                        <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: r.empresas_count >= empresas.length && empresas.length > 0 ? 'rgba(40,167,69,0.15)' : 'rgba(255,193,7,0.15)', color: r.empresas_count >= empresas.length && empresas.length > 0 ? '#28a745' : '#ffc107', border: 'none' }}>
                                                            {r.empresas_count >= empresas.length && empresas.length > 0 ? 'Todas' : `${r.empresas_count} emp.`}
                                                        </span>
                                                    </td>
                                                    {canManageCuentas && (
                                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                                                <button type="button" onClick={() => handleEditTipoRemesa(r)} title="Editar" style={{ background: 'none', color: 'var(--text-muted)', padding: '0.2rem', cursor: 'pointer' }}><Edit2 size={14} /></button>
                                                                <button type="button" onClick={() => handleDeleteTipoRemesa(r)} title="Eliminar" style={{ background: 'none', color: '#ef4444', padding: '0.2rem', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                        <button type="button" onClick={handleCloseCatalogModal} className="btn-secondary" style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}>
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal de Chequeras / Talonarios (R4.1) */}
            <Modal
                open={showChequerasModal}
                onClose={() => setShowChequerasModal(false)}
                title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <BookOpen size={18} color="var(--primary)" />
                        Gestión de Chequeras / Talonarios
                    </span>
                }
                size="lg"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
                        <div style={{ flex: '2 1 260px' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Filtrar por Cuenta</label>
                            <select
                                value={chequeraFilterCuenta}
                                onChange={e => {
                                    const val = e.target.value;
                                    setChequeraFilterCuenta(val);
                                    if (!editingChequera) setChequeraFormData(prev => ({ ...prev, cuenta_bancaria_id: val }));
                                    fetchChequeras(val, chequeraFilterActivo);
                                }}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                            >
                                <option value="">Todas las cuentas</option>
                                {sortCuentas(accounts).map(c => (
                                    <option key={c.corr} value={c.corr}>{formatCuentaLabel(c)}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: '1 1 140px' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Estado</label>
                            <select
                                value={chequeraFilterActivo}
                                onChange={e => {
                                    const val = e.target.value;
                                    setChequeraFilterActivo(val);
                                    fetchChequeras(chequeraFilterCuenta, val);
                                }}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                            >
                                <option value="all">Todas</option>
                                <option value="1">Activas</option>
                                <option value="0">Inactivas</option>
                            </select>
                        </div>
                    </div>

                    {canManageChequeras && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                    {editingChequera ? <Edit2 size={15} color="var(--primary)" /> : <Plus size={15} color="var(--primary)" />}
                                    {editingChequera ? `Editar Talonario #${editingChequera.id}` : 'Registrar Nuevo Talonario'}
                                </span>
                                {editingChequera && (
                                    <button type="button" onClick={() => resetChequeraForm(chequeraFilterCuenta)} className="btn-secondary" style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <X size={13} /> Cancelar edición
                                    </button>
                                )}
                            </div>
                            <form onSubmit={handleSaveChequera} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                <div className="form-grid form-grid-3" style={{ gap: '0.65rem' }}>
                                    <div className="span-2">
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Cuenta Bancaria *</label>
                                        <select
                                            value={chequeraFormData.cuenta_bancaria_id}
                                            disabled={Boolean(editingChequera)}
                                            onChange={e => setChequeraFormData(prev => ({ ...prev, cuenta_bancaria_id: e.target.value }))}
                                            required
                                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', opacity: editingChequera ? 0.65 : 1 }}
                                        >
                                            <option value="">Seleccione cuenta...</option>
                                            {sortCuentas(accounts).map(c => (
                                                <option key={c.corr} value={c.corr}>{formatCuentaLabel(c)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Serie (Opcional)</label>
                                        <input
                                            type="text"
                                            maxLength={30}
                                            placeholder="Ej: A-2026"
                                            value={chequeraFormData.serie}
                                            onChange={e => setChequeraFormData(prev => ({ ...prev, serie: e.target.value }))}
                                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                        />
                                    </div>
                                </div>

                                <div className="form-grid form-grid-3" style={{ gap: '0.65rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Desde # *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            required
                                            placeholder="1001"
                                            value={chequeraFormData.desde}
                                            onChange={e => {
                                                const nextDesde = e.target.value;
                                                setChequeraFormData(prev => ({
                                                    ...prev,
                                                    desde: nextDesde,
                                                    siguiente_correlativo: (!editingChequera && (!prev.siguiente_correlativo || prev.siguiente_correlativo === prev.desde))
                                                        ? nextDesde
                                                        : prev.siguiente_correlativo
                                                }));
                                            }}
                                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Hasta # *</label>
                                        <input
                                            type="number"
                                            min={chequeraFormData.desde || '1'}
                                            required
                                            placeholder="1100"
                                            value={chequeraFormData.hasta}
                                            onChange={e => setChequeraFormData(prev => ({ ...prev, hasta: e.target.value }))}
                                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Siguiente Correlativo</label>
                                        <input
                                            type="number"
                                            min={chequeraFormData.desde || 1}
                                            max={chequeraFormData.hasta ? Number(chequeraFormData.hasta) + 1 : undefined}
                                            placeholder="1001"
                                            value={chequeraFormData.siguiente_correlativo}
                                            onChange={e => setChequeraFormData(prev => ({ ...prev, siguiente_correlativo: e.target.value }))}
                                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                        />
                                    </div>
                                </div>

                                <div className="form-grid form-grid-3" style={{ gap: '0.65rem', alignItems: 'end' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Alerta Stock Bajo</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={chequeraFormData.alerta_stock_bajo}
                                            onChange={e => setChequeraFormData(prev => ({ ...prev, alerta_stock_bajo: e.target.value }))}
                                            style={{ width: '100%', maxWidth: '120px', height: '36px', fontSize: '0.825rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Notas (Opcional)</label>
                                        <input
                                            type="text"
                                            maxLength={255}
                                            placeholder="Observación..."
                                            value={chequeraFormData.notas}
                                            onChange={e => setChequeraFormData(prev => ({ ...prev, notas: e.target.value }))}
                                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={chequeraFormData.activo}
                                                onChange={e => setChequeraFormData(prev => ({ ...prev, activo: e.target.checked }))}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                            <span>Activa</span>
                                        </label>
                                        <button type="submit" className="btn-primary" disabled={savingChequera} style={{ height: '36px', padding: '0 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}>
                                            <Save size={15} />
                                            {savingChequera ? 'Guardando...' : (editingChequera ? 'Actualizar' : 'Registrar')}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="table-responsive" style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                        <table style={{ width: '100%', minWidth: '820px', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: 0 }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>Cuenta</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>Serie</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>Rango</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'center' }}>Siguiente #</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'center' }}>Disponibles</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'center' }}>Estado / Stock</th>
                                    {canManageChequeras && <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'center' }}>Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {loadingChequeras ? (
                                    <tr><td colSpan={canManageChequeras ? 7 : 6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando chequeras...</td></tr>
                                ) : chequerasList.length === 0 ? (
                                    <tr><td colSpan={canManageChequeras ? 7 : 6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay chequeras registradas para este filtro.</td></tr>
                                ) : chequerasList.map(chq => (
                                    <tr key={chq.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.45rem 0.5rem' }}>
                                            <div style={{ fontWeight: 500 }}>{chq.banco_nombre ? `[${chq.banco_nombre}] ` : ''}{chq.cuenta_nombre || chq.numero_cuenta}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{chq.numero_cuenta} {chq.empresa_nombre ? `· ${chq.empresa_nombre}` : ''}</div>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem' }}>{chq.serie || '-'}</td>
                                        <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}><code>{chq.desde} – {chq.hasta}</code></td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 600, color: 'var(--primary)' }}>#{chq.siguiente_correlativo}</td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>{chq.disponibles}</td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            {!chq.activo ? (
                                                <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: 'rgba(107,114,128,0.18)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.3)' }}>
                                                    Inactiva
                                                </span>
                                            ) : chq.agotado ? (
                                                <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                                    Agotado (0)
                                                </span>
                                            ) : chq.stock_bajo ? (
                                                <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <AlertTriangle size={12} /> Stock Bajo ({chq.disponibles} disp.)
                                                </span>
                                            ) : (
                                                <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                                                    Activa ({chq.disponibles} disp.)
                                                </span>
                                            )}
                                        </td>
                                        {canManageChequeras && (
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                                    <button type="button" onClick={() => handleEditChequera(chq)} title="Editar chequera" style={{ background: 'none', color: 'var(--text-muted)', padding: '0.2rem', cursor: 'pointer' }}><Edit2 size={14} /></button>
                                                    <button type="button" onClick={() => handleDeleteChequera(chq)} title="Eliminar / Desactivar chequera" style={{ background: 'none', color: '#ef4444', padding: '0.2rem', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setShowChequerasModal(false)} className="btn-secondary" style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}>
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}





