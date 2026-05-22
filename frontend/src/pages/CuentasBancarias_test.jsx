import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Landmark, User, Hash, Edit2, X, Save, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function CuentasBancarias() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const res = await api.get('/bancos/cuentas');
            setAccounts(res.data);
            setLoading(false);
        } catch (err) {
            addToast('Error al cargar cuentas bancarias', 'error');
        }
    };

    const filteredAccounts = useMemo(() => {
        if (!searchTerm) return accounts;
        const lowSearch = searchTerm.toLowerCase();
        return accounts.filter(acc => 
            (acc.numero || '').toLowerCase().includes(lowSearch) ||
            (acc.nombre || '').toLowerCase().includes(lowSearch)
        );
    }, [accounts, searchTerm]);

    const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
    const paginatedAccounts = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAccounts.slice(start, start + itemsPerPage);
    }, [filteredAccounts, currentPage]);

    if (loading) return <div>Cargando...</div>;

    return (
        <div style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h1><Landmark size={32} /> Cuentas Bancarias</h1>
                <button onClick={() => setShowModal(true)}>Nueva Cuenta</button>
            </div>

            <div className='card glass'>
                <table>
                    <thead>
                        <tr>
                            <th>Empresa</th>
                            <th>Banco</th>
                            <th>Nombre</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedAccounts.map(account => (
                            <tr key={account.corr}>
                                <td>{account.empresa_nombre}</td>
                                <td>{account.banco_nombre}</td>
                                <td>{account.nombre}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
                    <div>
                        <h2>Nueva Cuenta</h2>
                        <button onClick={() => setShowModal(false)}>Cerrar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
