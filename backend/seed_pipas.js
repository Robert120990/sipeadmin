require('dotenv').config();
const mysql = require('mysql2/promise');

async function seed() {
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL);

        // Get all carriers to distribute pipas
        const [carriers] = await db.query('SELECT id FROM carriers');
        if (carriers.length === 0) {
            await db.query("INSERT INTO carriers (code, description) VALUES ('TR-GEN', 'Transportes Generales')");
            carriers.push({ id: 1 });
        }
        const cId1 = carriers[0].id;
        const cId2 = carriers.length > 1 ? carriers[1].id : cId1;

        const pipas = [
            { code: 'PIPA-5K', carrier_id: cId1, compartments: [{ title: 'C1', capacity: 3000}, { title: 'C2', capacity: 2000}] },
            { code: 'PIPA-8K', carrier_id: cId2, compartments: [{ title: 'C1', capacity: 4000}, { title: 'C2', capacity: 4000}] },
            { code: 'PIPA-10K', carrier_id: cId1, compartments: [{ title: 'C1', capacity: 4000}, { title: 'C2', capacity: 3000}, { title: 'C3', capacity: 3000}] },
            { code: 'PIPA-4.5K', carrier_id: cId2, compartments: [{ title: 'C1', capacity: 2000}, { title: 'C2', capacity: 2500}] },
            { code: 'PIPA-9K', carrier_id: cId1, compartments: [{ title: 'C1', capacity: 3000}, { title: 'C2', capacity: 3000}, { title: 'C3', capacity: 3000}] },
            { code: 'PIPA-12K', carrier_id: cId2, compartments: [{ title: 'C1', capacity: 4000}, { title: 'C2', capacity: 4000}, { title: 'C3', capacity: 4000}] }
        ];

        for (const p of pipas) {
            try {
                await db.query('INSERT INTO tankers (code, carrier_id, compartments) VALUES (?, ?, ?)', [p.code, p.carrier_id, JSON.stringify(p.compartments)]);
            } catch(e) { /* ignore dupes */ }
        }

        console.log("Seeded pipas successfully.");
        await db.end();
    } catch (e) {
        console.error(e);
    }
}
seed();
