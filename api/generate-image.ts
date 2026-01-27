import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(request: VercelRequest, response: VercelResponse) {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) return response.status(500).json({ error: '服务器未配置 QWEN_API_KEY' });
    
    const { prompt } = request.body;

    try {
        // 1. 提交任务
        const submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'X-DashScope-Async': 'enable'
            },
            body: JSON.stringify({
                model: 'wanx-v1',
                input: { prompt },
                parameters: { size: '1024*1024', n: 1 }
            })
        });

        const taskData = await submitRes.json();
        const taskId = taskData.output?.task_id;

        if (!taskId) throw new Error(taskData.message || "任务提交失败");

        // 2. 简易轮询结果 (Serverless 限制，最多运行 10s 左右)
        let attempts = 0;
        while (attempts < 5) {
            await new Promise(r => setTimeout(r, 2000));
            const checkRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            const statusData = await checkRes.json();
            if (statusData.output?.task_status === 'SUCCEEDED') {
                return response.status(200).json({ url: statusData.output.results[0].url });
            }
            if (statusData.output?.task_status === 'FAILED') {
                throw new Error("通义万相渲染失败");
            }
            attempts++;
        }
        return response.status(202).json({ error: "渲染时间较长，请稍后刷新" });
    } catch (error: any) {
        return response.status(500).json({ error: error.message });
    }
}
