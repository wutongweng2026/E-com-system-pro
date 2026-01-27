import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, ChevronDown, Sparkles, Clipboard, LoaderCircle, AlertCircle, Send, Layout, Target, Zap, Share2, History, Pencil, Eye, Box, FileText, Image as ImageIcon, Search, X } from 'lucide-react';
import { ProductSKU } from '../lib/types';
import { callQwen } from '../lib/ai';

interface AIDescriptionViewProps {
    skus: ProductSKU[];
}

interface GenerationResult {
    copy: string;
    visualHooks: string;
    keywords: string[];
}

export const AIDescriptionView = ({ skus }: AIDescriptionViewProps) => {
    const [selectedSkuId, setSelectedSkuId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const [sellingPoints, setSellingPoints] = useState('');
    const [platform, setPlatform] = useState('京东/淘宝');
    const [strategy, setStrategy] = useState('高转化爆单');
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) setIsSearchOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredSkus = useMemo(() => {
        if (!searchTerm) return skus.slice(0, 8);
        const lower = searchTerm.toLowerCase();
        return skus.filter(s => s.code.toLowerCase().includes(lower) || s.name.toLowerCase().includes(lower)).slice(0, 10);
    }, [skus, searchTerm]);

    const selectedSku = useMemo(() => skus.find(s => s.id === selectedSkuId), [skus, selectedSkuId]);

    useEffect(() => {
        if (selectedSku) {
            const autoPoints = [`${selectedSku.brand} ${selectedSku.model}`, selectedSku.configuration, selectedSku.mode === '入仓' ? '官方仓发货' : '工厂直发'].filter(Boolean).join('；');
            setSellingPoints(autoPoints);
        }
    }, [selectedSku]);
    
    const handleGenerate = async () => {
        if (!sellingPoints && !selectedSkuId) {
            setError('请至少选择一个商品资产或输入核心卖点。');
            return;
        }
        setIsLoading(true);
        setError('');
        
        try {
            const prompt = `
                作为首席运营官，请为产品创作针对[${platform}]平台的[${strategy}]方案。
                产品: ${selectedSku?.name || '通用产品'}
                卖点: ${sellingPoints}
                
                严格以 JSON 返回：
                {
                  "copy": "文案正文，包含换行和 Emoji",
                  "visualHooks": "设计建议关键词",
                  "keywords": ["SEO词1", "SEO词2", "SEO词3"]
                }
            `;

            const textResult = await callQwen(prompt, true);
            setResult(JSON.parse(textResult || '{}'));
        } catch (err: any) {
            setError(`文案启航失败: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (!result) return;
        navigator.clipboard.writeText(result.copy);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
    };

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest leading-none">百炼 Qwen 模型训练中</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 文案实验室</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Neural Copywriting Hub Powered by Alibaba Cloud</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-8 relative overflow-hidden">
                        <div className="space-y-3 relative z-30" ref={searchRef}>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Box size={14} className="text-brand" /> 1. 挂载物理资产</label>
                            <div className="relative">
                                <input type="text" placeholder="搜索 SKU..." value={selectedSku ? selectedSku.name : searchTerm} onChange={(e) => { setSearchTerm(e.target.value); if (selectedSkuId) setSelectedSkuId(''); setIsSearchOpen(true); }} onFocus={() => setIsSearchOpen(true)} className="w-full bg-slate-50 border border-slate-200 rounded-[24px] pl-12 pr-10 py-4 text-sm font-black text-slate-700 outline-none focus:border-brand shadow-inner transition-all" />
                                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                            {isSearchOpen && !selectedSkuId && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-[28px] shadow-2xl z-50 p-4 max-h-64 overflow-y-auto no-scrollbar animate-slideIn">
                                    {filteredSkus.map(sku => (
                                        <button key={sku.id} onClick={() => { setSelectedSkuId(sku.id); setSearchTerm(''); setIsSearchOpen(false); }} className="w-full flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl text-left transition-colors group">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-brand transition-all"><Box size={18} /></div>
                                            <div className="min-w-0"><p className="text-xs font-black text-slate-800 truncate">{sku.name}</p></div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Layout size={14} className="text-blue-500" /> 2. 策略维度</label>
                            <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full bg-slate-100 border-none rounded-xl px-4 py-2 text-[10px] font-black text-slate-500 outline-none">
                                {['京东/淘宝', '小红书', '抖音'].map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <select value={strategy} onChange={e => setStrategy(e.target.value)} className="w-full bg-slate-100 border-none rounded-xl px-4 py-2 text-[10px] font-black text-slate-500 outline-none">
                                <option value="高转化爆单">极致转化 (Conversion-Max)</option>
                                <option value="感性种草">深度种草 (Content-Inspiration)</option>
                            </select>
                        </div>

                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Target size={14} className="text-amber-500" /> 3. 核心卖点</label>
                            <textarea value={sellingPoints} onChange={e => setSellingPoints(e.target.value)} className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none no-scrollbar" />
                        </div>

                        <button onClick={handleGenerate} disabled={isLoading} className="w-full py-5 rounded-[24px] bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">
                            {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : <Zap size={20} />}
                            生成 Qwen 营销方案
                        </button>
                    </div>
                </div>

                <div className="lg:col-span-8 flex flex-col space-y-8">
                    <div className="bg-white rounded-[48px] p-12 h-full flex flex-col shadow-sm border border-slate-100 relative overflow-hidden group">
                        <div className="relative z-10 flex items-center justify-between mb-10 border-b border-slate-50 pb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-3xl bg-slate-50 flex items-center justify-center text-brand border border-slate-100 shadow-inner">
                                    <FileText size={28} />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">预览 Qwen 产出结果</h3>
                            </div>
                            {result && (
                                <button onClick={handleCopy} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs border ${copyStatus === 'copied' ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-500'}`}>
                                    <Clipboard size={14} /> {copyStatus === 'copied' ? '已复制' : '复制文案'}
                                </button>
                            )}
                        </div>

                        <div className="relative z-10 flex-1">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                    <div className="w-20 h-20 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-8"></div>
                                    <p className="font-black text-xs uppercase tracking-[0.4em]">Qwen Processing...</p>
                                </div>
                            ) : result ? (
                                <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 h-full">
                                    <div className="xl:col-span-8 bg-slate-50/50 rounded-[40px] p-10 border border-slate-100 shadow-inner">
                                        <pre className="whitespace-pre-wrap text-[15px] text-slate-700 font-bold leading-relaxed font-sans">{result.copy}</pre>
                                    </div>
                                    <div className="xl:col-span-4 space-y-6">
                                        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">视觉建议</h4>
                                            <p className="text-xs text-slate-600 italic leading-relaxed">{result.visualHooks}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-200">
                                    <p className="font-black text-sm uppercase tracking-[0.3em]">Ready to ignite Qwen</p>
                                </div>
                            )}
                            {error && <div className="mt-8 p-6 bg-rose-50 text-rose-500 rounded-3xl text-xs font-bold flex items-center gap-3"><AlertCircle size={20}/> {error}</div>}
                        </div>
                        <div className="mt-12 pt-8 border-t border-slate-50 text-center shrink-0">
                             <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Content Intelligence Powered by Alibaba Cloud Bailian</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
