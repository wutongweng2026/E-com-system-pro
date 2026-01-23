
import type { VercelRequest, VercelResponse } from '@vercel/node';
// Use GenerateContentParameters instead of GenerateContentRequest according to guidelines
import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters } from '@google/genai';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Use GenerateContentParameters instead of GenerateContentRequest
        const body: GenerateContentParameters = request.body;

        if (!process.env.API_KEY) {
            return response.status(500).json({ error: 'API_KEY environment variable not set.' });
        }
        
        // Initialize GoogleGenAI with named apiKey parameter
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Call generateContent directly on ai.models
        const geminiResponse: GenerateContentResponse = await ai.models.generateContent(body);

        return response.status(200).json(geminiResponse);

    } catch (error: any) {
        console.error("Error in serverless function:", error);
        return response.status(500).json({ error: error.message || 'An unexpected error occurred.' });
    }
}
