import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Image as ImageIcon, Bot, ChevronDown, Sparkles, LoaderCircle, AlertCircle, Download, Maximize2, Layers, Search, X, Box, Upload, Palette, Monitor, Zap, RotateCcw, Share2, Ruler } from 'lucide-react';
import { ProductSKU } from '../lib/types';
import { generateWanxImage } from '../lib/ai';

interface AIAdImageViewProps {
    skus: ProductSKU[];
}

export const AIAdImageView = ({ skus }: AIAdImageViewProps) => {
    const [selectedSkuId, setSelectedSkuId] = useState<string>('');
    const [prompt, setPrompt] = useState('');
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const selectedSku = useMemo(() => skus.find(s => s.id === selectedSkuId), [skus, selectedSkuId]);

    useEffect(() => {
        if (selectedSku) setPrompt(`一款${selectedSku.brand}${selectedSku.name}。商业摄影风格，白底干净背景，极致光影，4K。`);
    }, [selectedSku]);

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        setError('');
        try {
            const url = await generateWanxImage(prompt);
            setImgUrl(url);
        } catch (err: any) {
            setError(`视觉渲染中断: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 视觉创意舱 (Gemini 版)</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Visual Generation Powered by Google Gemini</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-8">
                        <div className="space-y-3">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">挂载物理资产</label>
                             <select value={selectedSkuId} onChange={e => setSelectedSkuId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[24px] px-6 py-4 text-sm font-black text-slate-700 outline-none">
                                 <option value="">-- 选择 SKU --</option>
                                 {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                             </select>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">创意指令</label>
                            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none" />
                        </div>
                        <button onClick={handleGenerate} disabled={isLoading || !prompt} className="w-full py-5 rounded-[24px] bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl transition-all disabled:opacity-50">
                            {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : <Sparkles size={20} />} 启动 Gemini 渲染
                        </button>
                    </div>
                </div>

                <div className="lg:col-span-8 flex flex-col space-y-8">
                    <div className="bg-white rounded-[48px] p-10 h-full min-h-[600px] flex flex-col shadow-sm border border-slate-100 items-center justify-center">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                <div className="w-24 h-24 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-10"></div>
                                <p className="font-black text-xs uppercase tracking-[0.4em]">Gemini Rendering...</p>
                            </div>
                        ) : imgUrl ? (
                            <img src={imgUrl} className="max-w-full max-h-full rounded-[32px] shadow-2xl border-8 border-white object-contain bg-slate-50" alt="Generated" />
                        ) : <div className="text-slate-200 font-black uppercase tracking-widest opacity-20">Ready to visualize</div>}
                        {error && <div className="mt-8 p-6 bg-rose-50 text-rose-500 rounded-3xl text-xs font-bold animate-slideIn">{error}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
