
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Image as ImageIcon, Bot, ChevronDown, Sparkles, LoaderCircle, AlertCircle, Download, Maximize2, Layers, Search, X, Box, Upload, Palette, Monitor, Zap, RotateCcw, Share2, Ruler } from 'lucide-react';
import { ProductSKU } from '../lib/types';
import { GoogleGenAI } from "@google/genai";

interface AIAdImageViewProps {
    skus: ProductSKU[];
}

const STYLE_PRESETS = [
    { id: 'minimalist', label: '极简/医疗', prompt: 'minimalist, soft natural lighting, high-end skincare aesthetic, clean white background' },
    { id: 'tech', label: '赛博/科技', prompt: 'cyberpunk neon, glowing accents, cinematic dark background, hyper-detailed tech style' },
    { id: 'luxury', label: '奢侈/高奢', prompt: 'luxury fashion photography, gold and black palette, sharp focus, marble surface, elegant shadows' },
    { id: 'natural', label: '自然/户外', prompt: 'outdoor natural sunlight, blurred forest background, organic textures, hyper-realistic' },
];

export const AIAdImageView = ({ skus }: AIAdImageViewProps) => {
    // SKU 搜索相关
    const [selectedSkuId, setSelectedSkuId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // 图片生成/修改相关
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [quality, setQuality] = useState<'1K' | '2K' | '4K'>('1K');
    const [pixelSize, setPixelSize] = useState<'default' | '800' | '1024'>('default');
    const [selectedStyle, setSelectedStyle] = useState('minimalist');
    const [base64Image, setBase64Image] = useState<string | null>(null);
    
    // 渲染状态
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // 点击外部关闭搜索框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 智能过滤 SKU
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

    // 自动填充 Prompt
    useEffect(() => {
        if (selectedSku) {
            const stylePrompt = STYLE_PRESETS.find(s => s.id === selectedStyle)?.prompt || '';
            const sizeNote = pixelSize !== 'default' ? `，图片精准尺寸为 ${pixelSize}x${pixelSize} 像素` : '';
            setPrompt(`一款${selectedSku.brand}${selectedSku.name}，型号为${selectedSku.model || ''}，配置为${selectedSku.configuration || ''}。背景要求：${stylePrompt}${sizeNote}。商业摄影级别，极致细节。`);
        }
    }, [selectedSku, selectedStyle, pixelSize]);

    // 处理文件上传
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const b64 = readerEvent.target?.result as string;
                setBase64Image(b64);
                setPrompt(prev => prev ? `参考上传图片，${prev}` : "对上传的图片进行背景融合与商业视觉优化，保持产品主体不变，提升光影质感。");
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        if (!prompt) return;

        // Guideline: Mandatory API Key selection for Pro model
        const needsPro = quality === '2K' || quality === '4K' || pixelSize === '1024';
        if (needsPro) {
            if (!(await (window as any).aistudio.hasSelectedApiKey())) {
                await (window as any).aistudio.openSelectKey();
                // Guideline: Assume successful selection after dialog opens and proceed
            }
        }

        setIsLoading(true);
        setError('');
        
        try {
            // Guideline: Always use direct SDK and create a new instance right before call
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // 逻辑处理：如果选择了 800/1024 像素，强制设为 1:1 比例
            let finalAspectRatio = aspectRatio;
            if (pixelSize !== 'default') {
                finalAspectRatio = '1:1';
            }

            // 如果选择了 2K/4K，或者 1024 像素，自动升级到 Pro 模型
            const modelName = needsPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
            
            const contents: any = {
                parts: [{ text: prompt }]
            };

            if (base64Image) {
                const mimeType = base64Image.split(';')[0].split(':')[1];
                const data = base64Image.split(',')[1];
                contents.parts.unshift({
                    inlineData: { data, mimeType }
                });
            }

            const response = await ai.models.generateContent({
                model: modelName,
                contents: contents,
                config: {
                    imageConfig: {
                        aspectRatio: finalAspectRatio as any,
                        ...(modelName.includes('pro') ? { imageSize: quality } : {})
                    }
                }
            });

            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    setImgUrl(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                    return;
                }
            }
            throw new Error("视觉引擎返回异常，未检测到图像流。");
        } catch (err: any) {
            // Guideline: Handle "Requested entity was not found" error by prompting user for key
            if (err.message?.includes("Requested entity was not found.")) {
                await (window as any).aistudio.openSelectKey();
            }
            setError(`渲染中断: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10 pb-20">
            {/* Header - Standardized */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest leading-none">视觉策略神经模型训练中</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 视觉创意舱</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Neural Generative Visuals & Commercial Creative Studio</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Control Panel */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        {/* 1. SKU Selector */}
                        <div className="space-y-3 relative z-30" ref={searchRef}>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Box size={14} className="text-brand" /> 1. 物理资产挂载</label>
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
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{sku.code}</p>
                                                </div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest italic">未找到匹配资产</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. White Background Upload */}
                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Upload size={14} className="text-blue-500" /> 2. 挂载参考图 (如白底图)</label>
                            <div className="relative group">
                                {base64Image ? (
                                    <div className="relative w-full h-32 rounded-[24px] overflow-hidden border-2 border-brand/20 bg-slate-50">
                                        <img src={base64Image} className="w-full h-full object-contain" alt="Reference" />
                                        <button onClick={() => setBase64Image(null)} className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-full hover:scale-110 transition-transform shadow-lg"><X size={12}/></button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[24px] cursor-pointer hover:bg-slate-100 hover:border-brand transition-all group">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <Upload className="w-8 h-8 mb-2 text-slate-300 group-hover:text-brand" />
                                            <p className="text-[10px] font-black text-slate-400 uppercase">点击上传 PNG/JPG</p>
                                        </div>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* 3. Style Presets */}
                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Palette size={14} className="text-amber-500" /> 3. 视觉风格策略</label>
                            <div className="grid grid-cols-2 gap-2">
                                {STYLE_PRESETS.map(style => (
                                    <button 
                                        key={style.id} 
                                        onClick={() => setSelectedStyle(style.id)}
                                        className={`py-2 text-[10px] font-black rounded-xl border-2 transition-all uppercase ${selectedStyle === style.id ? 'bg-navy border-navy text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                                    >
                                        {style.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 4. Output Specification */}
                        <div className="space-y-4 relative z-10">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Monitor size={14} className="text-purple-500" /> 4. 输出比例</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['1:1', '3:4', '16:9'].map(r => (
                                        <button 
                                            key={r} 
                                            disabled={pixelSize !== 'default'}
                                            onClick={() => setAspectRatio(r)} 
                                            className={`py-2 text-[10px] font-black rounded-xl border transition-all ${pixelSize !== 'default' ? 'opacity-30 cursor-not-allowed bg-slate-50' : aspectRatio === r ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Ruler size={14} className="text-indigo-500" /> 5. 精准像素规模 (1:1)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => setPixelSize('default')} className={`py-2 text-[10px] font-black rounded-xl border transition-all ${pixelSize === 'default' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>默认生成</button>
                                    <button onClick={() => setPixelSize('800')} className={`py-2 text-[10px] font-black rounded-xl border transition-all ${pixelSize === '800' ? 'bg-brand text-white border-brand shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>800x800</button>
                                    <button onClick={() => setPixelSize('1024')} className={`py-2 text-[10px] font-black rounded-xl border transition-all ${pixelSize === '1024' ? 'bg-brand text-white border-brand shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>1024x1024</button>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">渲染质量级别</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['1K', '2K', '4K'].map(q => (
                                        <button key={q} onClick={() => setQuality(q as any)} className={`py-2 text-[10px] font-black rounded-xl border transition-all ${quality === q ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>{q}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 5. Prompt Textarea */}
                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Zap size={14} className="text-brand fill-brand" /> 6. 创意指令修正</label>
                            <textarea
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="描述具体的构图、光影 or 针对上传图的修改意见..."
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none no-scrollbar"
                            />
                        </div>

                        <button 
                            onClick={handleGenerate} 
                            disabled={isLoading || !prompt}
                            className="w-full py-5 rounded-[24px] bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl shadow-brand/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
                        >
                            {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : <Sparkles size={20} className="fill-white" />}
                            启动视觉渲染引擎
                        </button>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="lg:col-span-8 flex flex-col space-y-8">
                    <div className="bg-white rounded-[48px] p-10 h-full min-h-[650px] flex flex-col shadow-sm border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(112,173,71,0.03),transparent_70%)] pointer-events-none"></div>
                        
                        <div className="relative z-10 flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-brand border border-slate-100 shadow-inner group-hover:rotate-6 transition-transform duration-500">
                                    <ImageIcon size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">预览渲染输出</h3>
                                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">High-Precision Visual Rendering</p>
                                </div>
                            </div>
                            {imgUrl && (
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => {
                                            const link = document.createElement('a');
                                            link.href = imgUrl;
                                            link.download = `yunzhou_creative_${Date.now()}.png`;
                                            link.click();
                                        }}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs transition-all hover:bg-slate-800 shadow-xl active:scale-95"
                                    >
                                        <Download size={14} /> 导出为高清图片
                                    </button>
                                    <button 
                                        onClick={() => setBase64Image(imgUrl)}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl font-black text-xs transition-all hover:bg-slate-50 active:scale-95"
                                        title="将此图作为参考图进行微调"
                                    >
                                        <RotateCcw size={14} /> 迭代优化
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                    <div className="relative mb-10">
                                        <div className="w-24 h-24 border-4 border-slate-100 border-t-brand rounded-full animate-spin"></div>
                                        <Sparkles size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand animate-pulse" />
                                    </div>
                                    <p className="font-black text-xs uppercase tracking-[0.4em] animate-pulse mb-2">Neural Visual Processing...</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">正在进行像素级物理光影计算</p>
                                </div>
                            ) : imgUrl ? (
                                <div className="relative w-full h-full max-h-[600px] flex items-center justify-center group/canvas animate-fadeIn">
                                    <img src={imgUrl} className="max-w-full max-h-full rounded-[32px] shadow-2xl border-8 border-white object-contain bg-slate-50 transition-all group-hover/canvas:shadow-brand/20" alt="Generated Output" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/canvas:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20">
                                            <p className="text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Maximize2 size={12}/> 高精细度成品展示</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-200">
                                    <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center mb-8 border border-dashed border-slate-200 opacity-50 shadow-inner group-hover:scale-110 transition-transform">
                                        <ImageIcon size={48} />
                                    </div>
                                    <p className="font-black text-sm uppercase tracking-[0.3em] opacity-40">Ready to ignite your vision</p>
                                    <p className="text-[10px] mt-4 font-bold opacity-30 uppercase tracking-widest max-w-xs text-center">挂载物理资产，选择比例与风格，<br/>启动视觉创作引擎生成高精细度电商创意。</p>
                                </div>
                            )}

                            {error && (
                                <div className="absolute bottom-8 left-8 right-8 p-6 bg-rose-50 border border-rose-100 rounded-3xl text-rose-500 text-xs font-bold flex items-center gap-3 animate-slideIn">
                                    <AlertCircle size={20} className="opacity-60" /> {error}
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-brand'}`}></span>
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{isLoading ? 'Engine Running' : 'Visual Engine Idle'}</p>
                            </div>
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Neural Creativity Powered by Gemini 3.0 Pro Image Core</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
