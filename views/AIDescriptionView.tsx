
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, ChevronDown, Sparkles, Clipboard, LoaderCircle, AlertCircle, Send, Layout, Target, Zap, Share2, History, Pencil, Eye, Box, FileText, Image as ImageIcon, Search, X } from 'lucide-react';
import { ProductSKU } from '../lib/types';
import { GoogleGenAI } from "@google/genai";

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

    // 处理点击外部关闭搜索框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 智能过滤 SKU 选项
    const filteredSkus = useMemo(() => {
        if (!searchTerm) return skus.slice(0, 8);
        const lower = searchTerm.toLowerCase();
        return skus.filter(s => 
            s.code.toLowerCase().includes(lower) || 
            s.name.toLowerCase().includes(lower) ||
            (s.model && s.model.toLowerCase().includes(lower))
        ).slice(0, 10);
    }, [skus, searchTerm]);

    const selectedSku = useMemo(() => skus.find(s => s.id === selectedSkuId), [skus, selectedSkuId]);

    // 智能提取 SKU 资产属性
    useEffect(() => {
        if (selectedSku) {
            const autoPoints = [
                `${selectedSku.brand} ${selectedSku.model}`,
                selectedSku.configuration,
                selectedSku.mode === '入仓' ? '官方仓发货' : '工厂直发',
                selectedSku.promoPrice ? `限时优惠价 ¥${selectedSku.promoPrice}` : '',
            ].filter(Boolean).join('；');
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
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
                作为一名拥有10年经验的电商首席运营官，请为以下产品创作针对[${platform}]平台的[${strategy}]风格营销方案。
                
                产品底层数据:
                - 商品: ${selectedSku?.name || '通用产品'}
                - 品牌: ${selectedSku?.brand || '未指定'}
                - 参数: ${selectedSku?.configuration || '标准规格'}
                - 核心卖点: ${sellingPoints}
                
                任务要求:
                1. 输出一段极具吸引力的正文文案。
                2. 针对文案主题，输出3个适配该文案的AI绘画关键词（用于生成主图/详情图）。
                3. 提取3个核心SEO搜索关键词。
                
                请严格按照以下 JSON 格式返回，不要有任何其他解释文字：
                {
                  "copy": "文案正文，包含合适的换行和 Emoji",
                  "visualHooks": "给设计人员的构图关键词，例如：极简风、光影对比...",
                  "keywords": ["关键词1", "关键词2", "关键词3"]
                }
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });

            const parsed = JSON.parse(response.text || '{}');
            setResult(parsed);
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
            {/* Header - Standardized */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest leading-none">文案策略神经模型训练中</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 文案实验室</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Neural Copywriting Hub & Strategic Content Engine</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Control Panel: 模拟驾驶舱输入 */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                        
                        {/* Searchable SKU Selector */}
                        <div className="space-y-3 relative z-30" ref={searchRef}>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Box size={14} className="text-brand" /> 1. 挂载物理资产</label>
                            <div className="relative">
                                <input 
                                    type="text"
                                    placeholder="搜索 SKU、名称或型号..."
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
                                {selectedSkuId && (
                                    <button onClick={() => { setSelectedSkuId(''); setSearchTerm(''); }} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 transition-colors">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            {isSearchOpen && !selectedSkuId && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-[28px] shadow-2xl z-50 p-4 max-h-64 overflow-y-auto no-scrollbar animate-slideIn">
                                    {filteredSkus.length > 0 ? (
                                        filteredSkus.map(sku => (
                                            <button 
                                                key={sku.id} 
                                                onClick={() => {
                                                    setSelectedSkuId(sku.id);
                                                    setSearchTerm('');
                                                    setIsSearchOpen(false);
                                                }}
                                                className="w-full flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl text-left transition-colors group"
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-brand group-hover:bg-brand/10 transition-all"><Box size={18} /></div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-slate-800 truncate">{sku.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{sku.code} • {sku.model || '标准型号'}</p>
                                                </div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest italic">未找到匹配资产</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Layout size={14} className="text-blue-500" /> 2. 目标平台 & 策略</label>
                            <div className="grid grid-cols-2 gap-3">
                                {['京东/淘宝', '小红书', '抖音', '站外长文'].map(p => (
                                    <button 
                                        key={p} 
                                        onClick={() => setPlatform(p)}
                                        className={`py-3 text-[10px] font-black rounded-xl border-2 transition-all uppercase tracking-widest ${platform === p ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <select 
                                value={strategy} 
                                onChange={e => setStrategy(e.target.value)}
                                className="w-full bg-slate-100 border-none rounded-xl px-4 py-2 text-[10px] font-black text-slate-500 outline-none mt-2"
                            >
                                <option value="高转化爆单">策略: 极致转化 (Conversion-Max)</option>
                                <option value="感性种草">策略: 深度种草 (Content-Inspiration)</option>
                                <option value="参数评测">策略: 理性评测 (Spec-Professional)</option>
                                <option value="幽默反差">策略: 趣味互动 (Creative-Viral)</option>
                            </select>
                        </div>

                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Target size={14} className="text-amber-500" /> 3. 核心卖点修正</label>
                            <textarea
                                value={sellingPoints}
                                onChange={e => setSellingPoints(e.target.value)}
                                placeholder="输入产品的独特优势，AI将以此为核心..."
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none no-scrollbar"
                            />
                        </div>

                        <button 
                            onClick={handleGenerate} 
                            disabled={isLoading}
                            className="w-full py-5 rounded-[24px] bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl shadow-brand/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
                        >
                            {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : <Zap size={20} className="fill-white" />}
                            生成战略营销方案
                        </button>
                    </div>
                </div>

                {/* Output Canvas: 沉浸式结果展示 */}
                <div className="lg:col-span-8 flex flex-col space-y-8">
                    <div className="bg-white rounded-[48px] p-12 h-full flex flex-col shadow-sm border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(112,173,71,0.03),transparent_70%)] pointer-events-none"></div>
                        
                        <div className="relative z-10 flex items-center justify-between mb-10 border-b border-slate-50 pb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-3xl bg-slate-50 flex items-center justify-center text-brand border border-slate-100 shadow-inner group-hover:rotate-6 transition-transform duration-500">
                                    <FileText size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">预览实验室产出结果</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Physical Copywriting Output</p>
                                </div>
                            </div>
                            {result && (
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={handleCopy}
                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs transition-all active:scale-95 shadow-sm border ${copyStatus === 'copied' ? 'bg-green-50 border-green-200 text-green-600' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-white hover:border-slate-200'}`}
                                    >
                                        <Clipboard size={14} /> {copyStatus === 'copied' ? '已存入剪贴板' : '复制正文文案'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="relative z-10 flex-1 flex flex-col">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                    <div className="w-20 h-20 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-8"></div>
                                    <p className="font-black text-xs uppercase tracking-[0.4em] animate-pulse">Neural Content Processing...</p>
                                </div>
                            ) : result ? (
                                <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 h-full">
                                    {/* 文案主干 */}
                                    <div className="xl:col-span-8 flex flex-col">
                                        <div className="bg-slate-50/50 rounded-[40px] p-10 border border-slate-100 h-full overflow-y-auto no-scrollbar shadow-inner animate-fadeIn">
                                            <div className="flex items-center gap-2 mb-6 text-brand">
                                                <Eye size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Final Copy Preview</span>
                                            </div>
                                            <pre className="whitespace-pre-wrap text-[15px] text-slate-700 font-bold leading-relaxed font-sans">
                                                {result.copy}
                                            </pre>
                                        </div>
                                    </div>

                                    {/* 运营辅助指标 */}
                                    <div className="xl:col-span-4 space-y-6 animate-slideIn">
                                        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ImageIcon size={14} className="text-blue-500" /> 视觉指令建议</h4>
                                            <p className="text-xs text-slate-600 font-bold leading-relaxed bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 italic">
                                                {result.visualHooks}
                                            </p>
                                        </div>

                                        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Share2 size={14} className="text-brand" /> SEO 关键词池</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {result.keywords.map((kw, i) => (
                                                    <span key={i} className="px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-black border border-slate-100">#{kw}</span>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        <div className="p-6 bg-[#020617] rounded-3xl text-white group/banner">
                                            <div className="flex items-center gap-2 mb-3 text-brand">
                                                <Sparkles size={14} className="animate-pulse" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">AI Strategy Tip</span>
                                            </div>
                                            <p className="text-[10px] font-medium leading-relaxed opacity-70">
                                                建议在发布时配合高饱和度产品图，并在黄金 2 小时内引导 5-10 条评论以激活平台加权。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-200">
                                    <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mb-8 border border-dashed border-slate-200 opacity-50">
                                        <Send size={48} />
                                    </div>
                                    <p className="font-black text-sm uppercase tracking-[0.3em] opacity-40">Ready to ignite your content</p>
                                    <p className="text-[10px] mt-4 font-bold opacity-30 uppercase tracking-widest max-w-xs text-center">配置左侧物理资产与策略维度，<br/>算法决策引擎将为您生成全链路营销文案。</p>
                                </div>
                            )}

                            {error && (
                                <div className="mt-8 p-6 bg-rose-50 border border-rose-100 rounded-3xl text-rose-500 text-xs font-bold flex items-center gap-3 animate-slideIn">
                                    <AlertCircle size={20} className="opacity-60" /> {error}
                                </div>
                            )}
                        </div>

                        <div className="mt-12 pt-8 border-t border-slate-50 text-center shrink-0">
                             <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Content Intelligence Powered by Gemini 3.0 Creative Core</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
