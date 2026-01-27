
import React, { useState, useEffect } from 'react';
import { Bot, ChevronDown, Sparkles, Clipboard, LoaderCircle, AlertCircle, Send, Layout } from 'lucide-react';
import { ProductSKU } from '../lib/types';
import { GoogleGenAI } from "@google/genai";

interface AIDescriptionViewProps {
    skus: ProductSKU[];
}

export const AIDescriptionView = ({ skus }: AIDescriptionViewProps) => {
    const [selectedSkuId, setSelectedSkuId] = useState<string>('');
    const [sellingPoints, setSellingPoints] = useState('');
    const [platform, setPlatform] = useState('京东/淘宝');
    const [tone, setTone] = useState('专业严谨');
    const [generatedDescription, setGeneratedDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copyButtonText, setCopyButtonText] = useState('复制文案');

    useEffect(() => {
        if (selectedSkuId) {
            const sku = skus.find(s => s.id === selectedSkuId);
            if (sku) {
                const autoSellingPoints = [
                    sku.name,
                    sku.model,
                    sku.configuration,
                    `${sku.brand}品牌`,
                ].filter(Boolean).join('；');
                setSellingPoints(autoSellingPoints);
            }
        }
    }, [selectedSkuId, skus]);
    
    const handleGenerate = async () => {
        if (!sellingPoints) {
            setError('核心卖点不能为空。');
            return;
        }
        setIsLoading(true);
        setError('');
        
        try {
            const sku = skus.find(s => s.id === selectedSkuId);
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
                作为一名顶尖电商运营专家，请为以下产品创作一份[${platform}]平台的销售文案。
                
                产品基本信息:
                - 名称: ${sku?.name || '未指定'}
                - 品牌: ${sku?.brand || '未指定'}
                - 核心参数: ${sku?.configuration || '未指定'}
                
                核心卖点: ${sellingPoints}
                文案语调: ${tone}
                
                要求:
                1. 如果是小红书风格，请多使用表情符号，分段清晰，带上热门标签。
                2. 如果是京东/淘宝风格，请突出产品规格，采用结构化的参数列表+情感化文案。
                3. 文案要极具感染力，直击用户痛点。
                
                直接输出文案内容，不要有任何开场白。
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
            });

            setGeneratedDescription(response.text || '');
        } catch (err: any) {
            setError(`文案启航失败: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedDescription);
        setCopyButtonText('已存入剪贴板');
        setTimeout(() => setCopyButtonText('复制文案'), 2000);
    };

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-8">
            {/* Header - Standardized */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">文案创作引擎已点火</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 文案实验室</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 italic">Smart Content Generation Engine & Creative Copy Lab</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Control Panel */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">1. 挂载商品资产</label>
                            <div className="relative">
                                <select 
                                    value={selectedSkuId} 
                                    onChange={e => setSelectedSkuId(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-[#70AD47] appearance-none shadow-sm"
                                >
                                    <option value="">-- 选择SKU库中的资产 --</option>
                                    {skus.map(sku => <option key={sku.id} value={sku.id}>{sku.name}</option>)}
                                </select>
                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">2. 目标输出平台</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['京东/淘宝', '小红书', '抖音短视频', '详情页长文'].map(p => (
                                    <button 
                                        key={p} 
                                        onClick={() => setPlatform(p)}
                                        className={`py-2 text-[10px] font-black rounded-xl border-2 transition-all ${platform === p ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">3. 核心卖点 & 钩子</label>
                            <textarea
                                value={sellingPoints}
                                onChange={e => setSellingPoints(e.target.value)}
                                placeholder="输入产品的独特优势，AI将以此为核心..."
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-[#70AD47] resize-none shadow-inner no-scrollbar"
                            />
                        </div>

                        <button 
                            onClick={handleGenerate} 
                            disabled={isLoading}
                            className="w-full py-4 rounded-2xl bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-lg shadow-brand/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
                        >
                            {isLoading ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            生成创意文案
                        </button>
                    </div>
                </div>

                {/* Output Panel */}
                <div className="lg:col-span-8">
                    <div className="bg-white rounded-[40px] p-10 h-full flex flex-col shadow-xl border border-slate-100 relative overflow-hidden group">
                        <div className="