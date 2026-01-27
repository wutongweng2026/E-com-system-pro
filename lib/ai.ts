/**
 * 阿里云百炼 (DashScope) 统一调度引擎
 * 采用 OpenAI 兼容模式
 */

export const AI_CONFIG = {
    endpoint: '/api/generate', // 通过 Vercel Serverless Proxy 转发，保障安全
    model: 'qwen-plus', 
};

export async function callQwen(prompt: string, isJson: boolean = false) {
    // 生产环境下通过后端 API 转发，本地环境下直接调用（需配置跨域）
    const response = await fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: AI_CONFIG.model,
            messages: [
                { role: 'system', content: isJson ? '你是一个专业的数据分析专家，必须严格返回 JSON 对象，不要包含任何 Markdown 标记。' : '你是一个资深的电商战略运营专家。' },
                { role: 'user', content: prompt }
            ],
            ...(isJson ? { response_format: { type: 'json_object' } } : {})
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`百炼引擎响应异常: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    // 兼容 OpenAI 格式
    return data.choices[0].message.content;
}

/**
 * 阿里云百炼 - 通义万相 (Wanx-v1) 图片生成
 * 注意：万相 API 需要异步轮询，此函数封装了提交与查询逻辑
 */
export async function generateWanxImage(prompt: string) {
    const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
    });

    if (!response.ok) throw new Error("视觉渲染任务提交失败");
    const result = await response.json();
    return result.url;
}
