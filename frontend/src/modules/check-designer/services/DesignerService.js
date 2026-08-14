import api from '../../../services/api'; // Ruta relativa a src/services/api.js

/**
 * Servicio para interactuar con la API del diseñador de cheques.
 */
const DesignerService = {
    /**
     * Obtiene la lista de formatos de cheque.
     * @param {Object} [params] - Parámetros de consulta (banco_id, is_active).
     * @returns {Promise<Array>}
     */
    getFormats: async (params = {}) => {
        const query = new URLSearchParams(params).toString();
        const response = await api.get(`/check-designer/formats?${query}`);
        return response.data;
    },

    /**
     * Obtiene un formato de cheque específico por su ID.
     * @param {number} id - ID del formato.
     * @returns {Promise<Object>}
     */
    getFormatById: async (id) => {
        const response = await api.get(`/check-designer/formats/${id}`);
        return response.data;
    },

    /**
     * Crea un nuevo formato de cheque.
     * @param {Object} formatData - Datos del formato.
     * @returns {Promise<Object>}
     */
    createFormat: async (formatData) => {
        const response = await api.post('/check-designer/formats', formatData);
        return response.data;
    },

    /**
     * Actualiza la configuración general de un formato de cheque.
     * @param {number} id - ID del formato.
     * @param {Object} formatData - Datos a actualizar.
     * @returns {Promise<Object>}
     */
    updateFormat: async (id, formatData) => {
        const response = await api.put(`/check-designer/formats/${id}`, formatData);
        return response.data;
    },

    /**
     * Actualiza específicamente el diseño JSON de un formato.
     * @param {number} id - ID del formato.
     * @param {Object} designJson - El nuevo diseño JSON.
     * @returns {Promise<Object>}
     */
    saveDesign: async (id, designJson) => {
        const response = await api.patch(`/check-designer/formats/${id}/design`, { design_json: designJson });
        return response.data;
    },

    /**
     * Desactiva (borra lógicamente) un formato de cheque.
     * @param {number} id - ID del formato.
     * @returns {Promise<Object>}
     */
    deleteFormat: async (id) => {
        const response = await api.delete(`/check-designer/formats/${id}`);
        return response.data;
    },

    /**
     * Obtiene la lista de bancos para poblar el selector.
     * @returns {Promise<Array>}
     */
    getBancos: async () => {
        const response = await api.get('/check-designer/bancos');
        return response.data;
    },

    /**
     * Obtiene la lista de calibraciones de impresoras.
     * @returns {Promise<Array>}
     */
    getCalibrations: async () => {
        const response = await api.get('/check-designer/calibrations');
        return response.data;
    },

    /**
     * Guarda la calibración de una impresora.
     * @param {Object} calibrationData - Datos de calibración.
     * @returns {Promise<Object>}
     */
    saveCalibration: async (calibrationData) => {
        const response = await api.post('/check-designer/calibrations', calibrationData);
        return response.data;
    },
};

export default DesignerService;
