import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrendingUp, Bot, ChevronDown, Sparkles, LoaderCircle, AlertCircle, CalendarDays, BarChartHorizontalBig, Search, Box, LayoutDashboard, Target, Activity, X } from 'lucide-react';
import { DB } from '../lib/db';
import { ProductSKU } from '../lib/types';
import { getSkuIdentifier } from '../lib/helpers';

interface Forecast {
    date: string;
    predicted_sales: number;
}

interface ForecastResult {
    summary: string;
    analysis: string;
    forecast: Forecast[];
}

export const AISalesForecastView = ({ skus }: { skus: ProductSKU[] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [selectedSku, setSelectedSku] = useState<ProductSKU | null>(null);
    const searchRef = useRef<HTMLDivElement>(null);

    const [forecastDays, setForecastDays] = useState<number>(7);
    const [influencingFactors, setInfluencingFactors] = useState('');
    const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // 点击外部关闭搜索下拉
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 过滤 SKU
    const filteredOptions = useMemo(() => {
        if (!searchTerm) return skus.slice(0, 10);
        const lower = searchTerm.toLowerCase();
        return skus.filter(s => 
            s.code.toLowerCase().includes(lower) || 
            s.name.toLowerCase().includes(lower) ||
            (s.model && s.model.toLowerCase().includes(lower))
        ).slice(0, 10);
    }, [skus, searchTerm]);

    const handleGenerate = async () => {
        if (!selectedSku) {
            setError('请先搜索并选择一个SKU。');
            return;
        }
        setIsLoading(true);
        setError('');
        setForecastResult(null);

        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const startDateStr = ninetyDaysAgo.toISOString().split('T')[0];
            const todayStr = new Date().toISOString().split('T')[0];

            const allRows = await DB.getRange('fact_shangzhi', startDateStr, todayStr);
            const historicalData = allRows
                .filter(row => getSkuIdentifier(row) === selectedSku.code)
                .map(row => ({ date: row.date, sales: Number(row.paid_items) || 0 }))
                .sort((a, b) => a.date.localeCompare(b.date));
            
            if (historicalData.length < 3) {
                 throw new Error("用于预测的历史销售样本过少（至少需要3天以上的数据）。请前往数据中心补充同步。");
            }

            const historicalDataCsv = "Date,Sales\n" + historicalData.map(d => `${d.date},${d.sales}`).join('\n');
            
            const prompt = `你是一名顶级电商算法专家。请根据以下[${selectedSku.name}]的历史销量：
            \`\`\`csv
            ${historicalDataCsv}
            \`\`\`
            营销变量：${influencingFactors || '无特殊营销活动'}
            
            任务：预测未来${forecastDays}天的销量。考虑：
            1. 历史趋势的惯性；2. 周期性特征；3. 营销变量对斜率的修正。
            
            必须严格按JSON返回：
            {
              "summary": "一句预测总结",
              "analysis": "预测逻辑简析",
              "forecast": [{ "date": "YYYY-MM-DD", "predicted_sales": 数字 }]
            }`;
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemini-3-flash-preview',
                    contents: { parts: [{ text: prompt }] },
                    config: { responseMimeType: "application/json" }
                })
            });

            if (!response.ok) throw new Error("AI 预测服务连接失败");
            
            const resData = await response.json();
            const resultJson = JSON.parse(resData.candidates?.[0]?.content?.parts?.[0]?.text || resData.text || "{}") as ForecastResult;
            setForecastResult(resultJson);
        } catch (err: any) {
            setError(err.message || 'AI 预测引擎响应异常');
        } finally {
            setIsLoading(false);
        }
    };
    
    const totalPredictedSales = forecastResult?.forecast.reduce((sum, item) => sum + item.predicted_sales, 0) || 0;

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10">
            {/* Standardized Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">算法决策流计算中</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 销售预测中心</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Predictive Sales Intelligence & Demand Forecasting Engine</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Side Control Panel */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-10 space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                        
                        {/* Searchable SKU Selector */}
                        <div className="space-y-3 relative z-10" ref={searchRef}>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1. 资产搜索检索</label>
                            <div className="relative">
                                <input 
                                    type="text"
                                    placeholder="输入 SKU 编码、型号或名称..."
                                    value={selectedSku ? selectedSku.name : searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        if(selectedSku) setSelectedSku(null);
                                        setIsSearchOpen(true);
                                    }}
                                    onFocus={() => setIsSearchOpen(true)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-[24px] pl-12 pr-10 py-4 text-sm font-black text-slate-700 outline-none focus:border-brand shadow-inner transition-all"
                                />
                                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                                {selectedSku && (
                                    <button onClick={() => { setSelectedSku(null); setSearchTerm(''); }} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 transition-colors">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            
                            {isSearchOpen && !selectedSku && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-[28px] shadow-2xl z-50 p-4 max-h-64 overflow-y-auto no-scrollbar animate-slideIn">
                                    {filteredOptions.length > 0 ? (
                                        filteredOptions.map(sku => (
                                            <button 
                                                key={sku.id} 
                                                onClick={() => { setSelectedSku(sku); setIsSearchOpen(false); setForecastResult(null); }}
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

                        {/* Forecast Days */}
                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">2. 时间窗口投影</label>
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200">
                                {[7, 14, 30].map(days => (
                                    <button 
                                        key={days} 
                                        onClick={() => setForecastDays(days)} 
                                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all ${forecastDays === days ? 'bg-white text-slate-900 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        未来 {days} 天
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Influencing Factors */}
                        <div className="space-y-3 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">3. 动态干扰因子 (可选)</label>
                            <textarea
                                value={influencingFactors}
                                onChange={e => setInfluencingFactors(e.target.value)}
                                placeholder="输入未来营销事件，如“618 满减”、“小红书投放”"
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[28px] px-6 py-4 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none no-scrollbar"
                            />
                        </div>

                        <button 
                            onClick={handleGenerate} 
                            disabled={isLoading || !selectedSku}
                            className="w-full py-5 rounded-[24px] bg-brand text-white font-black text-sm shadow-2xl shadow-brand/20 hover:bg-[#5da035] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30 uppercase tracking-widest"
                        >
                            {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : <TrendingUp size={20} />}
                            执行高精度算法预测
                        </button>
                    </div>
                </div>

                {/* Result Display Area */}
                <div className="lg:col-span-8 flex flex-col space-y-8">
                    {/* Forecast Main Content */}
                    <div className="bg-white rounded-[48px] p-10 shadow-sm border border-slate-100 flex-1 relative overflow-hidden flex flex-col group/result">
                        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(112,173,71,0.03),transparent_70%)] pointer-events-none"></div>
                        
                        <div className="flex items-center justify-between mb-10 border-b border-slate-50 pb-8 shrink-0 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-3xl bg-slate-50 flex items-center justify-center text-brand border border-slate-100 shadow-inner group-hover/result:scale-110 transition-transform duration-500">
                                    <LayoutDashboard size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">销售预测分析报告</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Physical Performance Projections</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 relative z-10">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                    <div className="w-20 h-20 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-6"></div>
                                    <p className="font-black text-xs uppercase tracking-[0.4em] animate-pulse">Algorithmic Processing...</p>
                                </div>
                            ) : error ? (
                                <div className="bg-rose-50/50 rounded-[32px] p-10 text-rose-500 flex flex-col items-center text-center gap-4 border border-rose-100 animate-slideIn">
                                    <AlertCircle size={48} className="opacity-40" />
                                    <div className="space-y-1">
                                        <p className="font-black text-sm uppercase">预测任务被中断</p>
                                        <p className="text-xs font-bold leading-relaxed max-w-sm">{error}</p>
                                    </div>
                                </div>
                            ) : forecastResult ? (
                                <div className="animate-fadeIn space-y-10">
                                    {/* KPI Summary */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                                            <div className="flex justify-between items-start mb-4">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">周期累计预测销量</h4>
                                                <div className="text-brand opacity-40"><Target size={20}/></div>
                                            </div>
                                            <p className="text-4xl font-black text-slate-900 tabular-nums tracking-tighter">{totalPredictedSales.toLocaleString()} <span className="text-sm text-slate-300 ml-1">PCS</span></p>
                                        </div>
                                        <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                                            <div className="flex justify-between items-start mb-4">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">平均单日预估</h4>
                                                <div className="text-blue-500 opacity-40"><Activity size={20}/></div>
                                            </div>
                                            <p className="text-4xl font-black text-slate-900 tabular-nums tracking-tighter">{(totalPredictedSales / forecastDays).toFixed(1)} <span className="text-sm text-slate-300 ml-1">PCS/D</span></p>
                                        </div>
                                    </div>

                                    {/* Daily Projection Flow */}
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            <div className="w-1 h-3 bg-brand rounded-full"></div> 物理层投影数据流
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {forecastResult.forecast.map((item, idx) => (
                                                <div key={item.date} className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm hover:border-brand transition-all group/item">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase">{item.date}</span>
                                                        <span className="text-[9px] font-black text-brand bg-brand/5 px-2 py-0.5 rounded uppercase">D+{idx+1}</span>
                                                    </div>
                                                    <p className="text-xl font-black text-slate-800 tabular-nums">{item.predicted_sales}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* AI Insight Room Card */}
                                    <div className="bg-[#020617] rounded-[40px] p-10 text-white relative overflow-hidden group/ai">
                                        <div className="absolute top-0 right-0 w-80 h-80 bg-brand/10 rounded-full blur-[100px] -translate-y-1/3 translate-x-1/3"></div>
                                        <div className="flex items-center gap-4 mb-8 relative z-10">
                                            <div className="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center shadow-lg border border-white/10 group-hover/ai:rotate-6 transition-transform">
                                                <Bot size={24} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black tracking-tight flex items-center gap-2">AI 算法深度诊断 <Sparkles size={14} className="text-brand animate-pulse" /></h3>
                                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Neural Forecasting Insight</p>
                                            </div>
                                        </div>
                                        <div className="relative z-10 bg-white/5 rounded-[24px] p-8 border border-white/10">
                                            <p className="text-sm font-bold leading-relaxed mb-4 text-slate-100">{forecastResult.summary}</p>
                                            <p className="text-xs text-slate-400 font-medium italic leading-relaxed">{forecastResult.analysis}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-60">
                                    <BarChartHorizontalBig size={80} className="mb-8 opacity-10" />
                                    <p className="font-black text-sm uppercase tracking-[0.3em] italic">Awaiting Target Selection</p>
                                    <p className="text-[10px] mt-4 font-bold max-w-sm text-center leading-relaxed">在左侧搜索指定 SKU 并设定预测参数，<br/>算法决策引擎将为您生成未来时空的销量投影。</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-10 pt-8 border-t border-slate-50 text-center shrink-0">
                             <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Decision Intelligence Powered by Gemini 3.0 Experimental Core</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};