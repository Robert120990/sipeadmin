const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

async function testAI() {
    console.log("Testing AI with model: gemini-2.0-flash");
    console.log("API Key present:", !!process.env.GEMINI_API_KEY);
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: "Hola, responde test." }] }]
        });
        console.log("Result success!");
        console.log("Text:", result.text || (result.candidates && result.candidates[0]?.content?.parts[0]?.text));
    } catch (error) {
        console.error("AI Error:", error);
    }
}

testAI();
