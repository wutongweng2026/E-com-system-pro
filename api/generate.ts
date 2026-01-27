import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');

    // 使用用户定义的 QWEN_API_KEY
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) return response.status(500).json({ error: '服务器未配置 QWEN_API_KEY' });

    try {
        const dashscopeRes = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(request.body)
        });

        const data = await dashscopeRes.json();
        return response.status(200).json(data);
    } catch (error: any) {
        return response.status(500).json({ error: error.message });
    }
}
