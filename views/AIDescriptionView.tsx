import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, ChevronDown, Sparkles, Clipboard, LoaderCircle, AlertCircle, Send, Layout, Target, Zap, Share2, History, Pencil, Eye, Box, FileText, Image as ImageIcon, Search, X, PenTool, Hash } from 'lucide-react';
import { ProductSKU } from '../lib/types';
import { callQwen } from '../lib/ai';

interface AIDescriptionViewProps {
    skus: ProductSKU[];
}

interface GenerationResult {
    copy: string;
    visualHooks: string;
    keywords: string[];
    headline: string;
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
        const lower = searchTerm.toLowerCase().trim();
        if (!lower) return skus.slice(0, 8);
        return skus.filter(s => s.code.toLowerCase().includes(lower) || s.name.toLowerCase().includes(lower)).slice(0, 10);
    }, [skus, searchTerm]);

    const selectedSku = useMemo(() => skus.find(s => s.id === selectedSkuId), [skus, selectedSkuId]);

    useEffect(() => {
        if (selectedSku) {
            const autoPoints = [
                selectedSku.brand ? `品牌: ${selectedSku.brand}` : '',
                selectedSku.model ? `型号: ${selectedSku.model}` : '',
                selectedSku.configuration ? `核心参数: ${selectedSku.configuration}` : '',
                selectedSku.mode === '入仓' ? '官方仓极速发货' : '原厂直供'
            ].filter(Boolean).join('；');
            setSellingPoints(autoPoints);
        }
    }, [selectedSku]);
    
    const handleGenerate = async () => {
        if (!sellingPoints && !selectedSkuId) {
            setError('请至少选择一个物理资产或录入核心卖点。');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult(null);
        
        try {
            const prompt = `
                你是一名顶尖电商运营专家。请为以下产品创作针对[${platform}]平台的[${strategy}]营销方案。
                
                【物理资产参数】
                名称: ${selectedSku?.name || '未命名产品'}
                核心卖点: ${sellingPoints}
                
                【文案要求】
                1. 针对${platform}的语言环境：如果是小红书，请多用 Emoji，语感要有种草力；如果是京东，请强调专业感和正品保障。
                2. 标题要足够吸睛，正文逻辑清晰。
                
                严格以 JSON 返回（不要包含 Markdown 标记）：
                {
                  "headline": "一个极致吸睛的爆款标题",
                  "copy": "正文内容，包含排版换行和必要的 Emoji",
                  "visualHooks": "给美工的视觉设计建议关键词",
                  "keywords": ["流量搜索词1", "流量搜索词2", "流量搜索词3"]
                }
            `;

            const textResult = await callQwen(prompt, true);
            const parsed = JSON.parse(textResult || '{}');
            setResult(parsed);
        } catch (err: any) {
            setError(`文案实验室链路异常: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (!result) return;
        const textToCopy = `${result.headline}\n\n${result.copy}`;
        navigator.clipboard.writeText(textToCopy);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
    };

    return (
        <div className="p-8 md:p-12 w-full animate-fadeIn space-y-10 min-h-screen bg-[#F8FAFC]">
            {/* Header - Standardized 3-line format */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-10">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-[0.3em] leading-none">深度神经网络训练中</span>
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">AI 文案实验室</h1>
                    <p className="text-slate-400 font-bold text-sm tracking-wide">Neural Copywriting Hub & Strategic Content Factory</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Configuration Panel */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-10 space-y-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                        
                        <div className="space-y-4 relative z-10" ref={searchRef}>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Box size={14} className="text-brand" /> 1. 挂载物理资产
                            </label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="搜索或选择 SKU..." 
                                    value={selectedSku ? selectedSku.name : searchTerm} 
                                    onChange={(e) => { 
                                        setSearchTerm(e.target.value); 
                                        if (selectedSkuId) setSelectedSkuId(''); 
                                        setIsSearchOpen(true); 
                                    }} 
                                    onFocus={() => setIsSearchOpen(true)} 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-[24px] pl-12 pr-10 py-4 text-sm font-black text-slate-700 outline-none focus:border-brand shadow-inner transition-all" 
                                />
                                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                {selectedSku && (
                                    <button onClick={() => { setSelectedSkuId(''); setSearchTerm(''); }} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            {isSearchOpen && !selectedSkuId && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-[28px] shadow-2xl z-50 p-4 max-h-64 overflow-y-auto no-scrollbar animate-slideIn">
                                    {filteredSkus.length > 0 ? filteredSkus.map(sku => (
                                        <button key={sku.id} onClick={() => { setSelectedSkuId(sku.id); setIsSearchOpen(false); }} className="w-full flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl text-left transition-colors group">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-brand transition-all"><Box size={18} /></div>
                                            <div className="min-w-0"><p className="text-xs font-black text-slate-800 truncate">{sku.name}</p></div>
                                        </button>
                                    )) : (
                                        <div className="p-8 text-center text-slate-300 text-[10px] font-black uppercase">未命中物理资产</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Layout size={14} className="text-blue-500" /> 2. 投放分发环境
                            </label>
                            <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
                                {['京东/淘宝', '小红书', '抖音'].map(p => (
                                    <button key={p} onClick={() => setPlatform(p)} className={`py-2.5 rounded-xl text-[10px] font-black transition-all ${platform === p ? 'bg-white text-slate-900 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}>{p}</button>
                                ))}
                            </div>
                            <div className="relative">
                                <select value={strategy} onChange={e => setStrategy(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-black text-slate-700 outline-none focus:border-brand appearance-none shadow-sm">
                                    <option value="高转化爆单">极致成交 (Conversion Max)</option>
                                    <option value="感性种草">情感种草 (Content Warmth)</option>
                                    <option value="竞品狙击">参数对冲 (Spec Duel)</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <div className="space-y-4 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Target size={14} className="text-amber-500" /> 3. 物理卖点萃取
                            </label>
                            <textarea 
                                value={sellingPoints} 
                                onChange={e => setSellingPoints(e.target.value)} 
                                placeholder="输入核心参数、优势或特殊需求..."
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none no-scrollbar transition-all" 
                            />
                        </div>

                        <button 
                            onClick={handleGenerate} 
                            disabled={isLoading} 
                            className="w-full py-6 rounded-[28px] bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl shadow-brand/20 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-[0.2em] flex items-center justify-center gap-3"
                        >
                            {isLoading ? <LoaderCircle size={22} className="animate-spin" /> : <Zap size={22} className="fill-white" />}
                            {isLoading ? '文案计算中...' : '启动智能营销方案'}
                        </button>
                    </div>
                </div>

                {/* Output Area */}
                <div className="lg:col-span-8 flex flex-col space-y-8">
                    <div className="bg-white rounded-[56px] p-12 h-full flex flex-col shadow-sm border border-slate-100 relative overflow-hidden group/result">
                        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(112,173,71,0.02),transparent_70%)] pointer-events-none"></div>
                        
                        <div className="relative z-10 flex items-center justify-between mb-10 border-b border-slate-50 pb-8">
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-16 rounded-[24px] bg-slate-50 flex items-center justify-center text-brand border border-slate-100 shadow-inner group-hover/result:rotate-6 transition-transform">
                                    <FileText size={32} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">预览营销产出结果</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Algorithmic Content Preview</p>
                                </div>
                            </div>
                            {result && (
                                <button onClick={handleCopy} className={`flex items-center gap-3 px-8 py-3 rounded-2xl font-black text-xs transition-all active:scale-95 ${copyStatus === 'copied' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-slate-900 text-white shadow-xl shadow-slate-200 hover:bg-black'}`}>
                                    <Clipboard size={14} /> {copyStatus === 'copied' ? '已成功复制' : '复制全量文案'}
                                </button>
                            )}
                        </div>

                        <div className="relative z-10 flex-1">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                    <div className="w-24 h-24 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-10"></div>
                                    <p className="font-black text-xs uppercase tracking-[0.4em] animate-pulse">Neural Engine Processing...</p>
                                </div>
                            ) : result ? (
                                <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 h-full animate-fadeIn">
                                    <div className="xl:col-span-8 flex flex-col space-y-6">
                                        <div className="bg-slate-50/50 rounded-[40px] p-10 border border-slate-100 shadow-inner">
                                            <h4 className="text-[10px] font-black text-brand uppercase tracking-widest mb-6 flex items-center gap-2">
                                                <PenTool size={14} /> 爆点标题建议
                                            </h4>
                                            <h2 className="text-2xl font-black text-slate-900 leading-tight mb-10">{result.headline}</h2>
                                            
                                            <h4 className="text-[10px] font-black text-brand uppercase tracking-widest mb-6 flex items-center gap-2">
                                                <FileText size={14} /> 营销正文预览
                                            </h4>
                                            <pre className="whitespace-pre-wrap text-[15px] text-slate-700 font-bold leading-loose font-sans bg-white/50 p-6 rounded-3xl border border-white/40">{result.copy}</pre>
                                        </div>
                                    </div>
                                    <div className="xl:col-span-4 space-y-8">
                                        <div className="bg-navy rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group/tip">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-brand/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10">
                                                <ImageIcon size={14} className="text-brand" /> 视觉设计建议
                                            </h4>
                                            <p className="text-sm font-bold text-slate-300 italic leading-relaxed relative z-10">{result.visualHooks}</p>
                                        </div>

                                        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                                <Hash size={14} className="text-brand" /> SEO 推荐词
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {result.keywords.map(kw => (
                                                    <span key={kw} className="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black border border-slate-100">#{kw}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-200 gap-6 opacity-30">
                                    <Sparkles size={64} strokeWidth={1} />
                                    <p className="font-black text-sm uppercase tracking-[0.4em]">Awaiting Strategic Inputs</p>
                                </div>
                            )}
                            {error && <div className="mt-8 p-6 bg-rose-50 text-rose-500 rounded-3xl text-xs font-bold flex items-center gap-3 border border-rose-100 animate-slideIn"><AlertCircle size={20}/> {error}</div>}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center justify-between opacity-30 grayscale hover:grayscale-0 transition-all px-12 pt-6">
                <div className="flex items-center gap-4">
                    <Sparkles size={16} className="text-brand animate-pulse"/>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">Content Neural Engine v4.2.0</p>
                </div>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Yunzhou Intelligence Command Subsystem</p>
            </div>
        </div>
    );
};
