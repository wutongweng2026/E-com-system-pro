/**
 * Google Gemini API 统一调度引擎
 */
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini API client
// Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const AI_CONFIG = {
    model: 'gemini-3-flash-preview', 
    imageModel: 'gemini-2.5-flash-image'
};

/**
 * 通用文本生成接口
 * @param prompt 提示词
 * @param isJson 是否强制返回 JSON
 */
export async function callQwen(prompt: string, isJson: boolean = false) {
    // Using generateContent for text answers
    const response = await ai.models.generateContent({
        model: AI_CONFIG.model,
        contents: prompt,
        config: {
            systemInstruction: isJson 
                ? '你是一个专业的数据分析专家，必须严格返回 JSON 对象，不要包含任何 Markdown 标记。' 
                : '你是一个资深的电商战略运营专家。',
            responseMimeType: isJson ? "application/json" : "text/plain"
        }
    });

    // The simplest and most direct way to get the generated text content is by accessing the .text property
    return response.text;
}

/**
 * Google Gemini - 图像生成 (gemini-2.5-flash-image)
 * @param prompt 创意描述词
 */
export async function generateWanxImage(prompt: string) {
    // Generate images using gemini-2.5-flash-image by default
    const response = await ai.models.generateContent({
        model: AI_CONFIG.imageModel,
        contents: {
            parts: [
                {
                    text: prompt,
                },
            ],
        },
    });

    // The output response may contain both image and text parts; iterate through all parts to find the image part.
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64EncodeString: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType};base64,${base64EncodeString}`;
        } else if (part.text) {
            console.log(part.text);
        }
    }
    
    throw new Error("未能生成图像资产。");
}
