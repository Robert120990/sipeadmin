const axios = require('axios');

async function test() {
    try {
        // First get a token (assuming admin/admin123)
        const loginRes = await axios.post('http://localhost:5001/api/login', {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginRes.data.token;

        console.log('Testing GET /api/config/accounting...');
        const getRes = await axios.get('http://localhost:5001/api/config/accounting', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('GET Response:', getRes.data);

        console.log('Testing POST /api/config/accounting...');
        const postRes = await axios.post('http://localhost:5001/api/config/accounting', {
            host: '127.0.0.1',
            user: 'test',
            password: 'testpassword',
            database_name: 'testdb',
            port: 3306
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('POST Response:', postRes.data);

    } catch (error) {
        console.error('Error during test:', error.response?.status, error.response?.data || error.message);
    }
}

test();
