import axios from 'axios';

const api = axios.create({
    baseURL: '/api'
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Evitar redirección si es la petición de login
            if (!error.config.url.includes('/login')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login?expired=1';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
