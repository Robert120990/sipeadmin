const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { authenticateToken } = require('../middleware/auth');

router.post('/pagos/chat', authenticateToken, async (req, res) => {
    try {
        const { prompt, context } = req.body;
        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({ error: "Falta configurar GEMINI_API_KEY en el backend." });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const todayStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const systemInstruction = `Eres un asistente financiero y operativo experto del sistema SIPE Admin, enfocado en el "Control de Múltiples Pagos y Recordatorios".
Hoy es ${todayStr} (formato DD/MM/YYYY).
El usuario te dará una petición en lenguaje natural. Tú recibirás el "context" que es un arreglo con TODOS los datos actuales que el usuario ve en pantalla.
Tu objetivo es analizar lo que pide y devolver UN ÚNICO OBJETO JSON ESTRICTO con la acción que el frontend debe ejecutar.

INSTRUCCIONES DE ACCIÓN:
Si el usuario saluda, pregunta resúmenes o dudas generales que no requieren filtrar o pagar en la tabla interactiva, usa "action": "NONE". Y respóndele en "reply" dando los datos que extrajiste de la tabla.
Si el usuario quiere ver o buscar facturas específicas, de fechas específicas (ej. "hoy"), proveedores, o deudas de una empresa, usa "action": "FILTER" y llena "action_params" con las claves "ubicacion" (la empresa sugerida), "descripcion" (el concepto o la fecha exacta DD/MM/YYYY) y "estado" ('P', 'C' o 'ALL'). Manda la fecha en "descripcion" si el usuario pide búsquedas de tiempo.
Si el usuario quiere pagar o marcar como pagado algo específico, usa "action": "PAY" y pon el "id_recordatorio" numérico exacto que encontraste en el context matchando la orden.

DEBES RESPONDER ÚNICAMENTE EN UN JSON VÁLIDO CON ESTA ESTRUCTURA:
{
    "reply": "Tu mensaje amigable y humano respondiendo al usuario basado fuertemente en su contexto.",
    "action": "NONE" | "FILTER" | "PAY",
    "action_params": {
        "ubicacion": "", 
        "descripcion": "", 
        "estado": "ALL", 
        "id_recordatorio": null 
    }
}`;

        const cleanContext = (context || []).map(c => ({
            id_recordatorio: c.id_recordatorio,
            ubicacion: c.ubicacion, 
            descripcion: c.descripcion, 
            monto: c.monto, 
            estado: c.estado, 
            vence: c.vence 
        }));

        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: `CONTEXTO DE DATOS ACTUALES: ${JSON.stringify(cleanContext)}\n\nCOMANDO DEL USUARIO: ${prompt}` }] }],
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json"
            }
        });

        let rawText = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (rawText.startsWith('```json')) {
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        res.json(JSON.parse(rawText));
    } catch (error) {
        console.error("AI Agent Error:", error);
        res.status(500).json({ error: "No se pudo procesar la solicitud con IA.", details: error.message });
    }
});

module.exports = router;
