import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrendingUp, Bot, ChevronDown, Sparkles, LoaderCircle, AlertCircle, CalendarDays, BarChartHorizontalBig, Search, Box, LayoutDashboard, Target, Activity, X, SearchCode, History } from 'lucide-react';
import { callQwen } from '../lib/ai';
import { DB } from '../lib/db';
import { ProductSKU } from '../lib/types';
import { getSkuIdentifier } from '../lib/helpers';

interface ForecastResult {
    summary: string;
    analysis: string;
    forecast: { date: string, predicted_sales: number }[];
}

export const AISalesForecastView = ({ skus }: { skus: ProductSKU[] }) => {
    // SKU 搜索与选择状态
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [selectedSku, setSelectedSku] = useState<ProductSKU | null>(null);
    const searchRef = useRef<HTMLDivElement>(null);

    // 预测参数
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

    // 过滤 SKU 列表
    const filteredSkus = useMemo(() => {
        const lower = searchTerm.toLowerCase().trim();
        if (!lower) return skus.slice(0, 8);
        return skus.filter(s => 
            s.code.toLowerCase().includes(lower) || 
            s.name.toLowerCase().includes(lower) ||
            (s.model && s.model.toLowerCase().includes(lower))
        ).slice(0, 15);
    }, [skus, searchTerm]);

    const handleGenerate = async () => {
        if (!selectedSku) {
            setError('请先搜索并选定一个 SKU 物理资产。');
            return;
        }
        setIsLoading(true);
        setError('');
        setForecastResult(null);

        try {
            // 获取过去 90 天的历史数据
            const end = new Date().toISOString().split('T')[0];
            const start = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
            
            const allRows = await DB.getRange('fact_shangzhi', start, end);
            
            // 按日期聚合该 SKU 的销量
            const dailyMap = new Map<string, number>();
            allRows.forEach(row => {
                if (getSkuIdentifier(row) === selectedSku.code) {
                    dailyMap.set(row.date, (dailyMap.get(row.date) || 0) + (Number(row.paid_items) || 0));
                }
            });

            const historicalData = Array.from(dailyMap.entries())
                .map(([date, sales]) => ({ date, sales }))
                .sort((a, b) => a.date.localeCompare(b.date));
            
            if (historicalData.length < 3) {
                throw new Error(`历史物理数据点不足（当前仅 ${historicalData.length} 天），AI 无法建立可靠的时序模型。`);
            }

            const prompt = `
                你是一名资深供应链算法专家，专注于电商销量时间序列预测。
                
                【输入数据】
                目标资产: ${selectedSku.name} (${selectedSku.code})
                型号规格: ${selectedSku.model || '通用'}
                历史 90 天销量数据 (Date/Sales): ${JSON.stringify(historicalData)}
                外部影响变量: ${influencingFactors || '常规经营'}
                预测步长: 未来 ${forecastDays} 天
                
                【任务】
                1. 分析历史销售趋势、周期性（周度规律）及波动特征。
                2. 结合外部变量（如大促、缺货恢复等）预测未来 ${forecastDays} 天的每日成交量。
                3. 提供一份简明的诊断摘要。
                
                【约束】
                严格以 JSON 格式返回，不要包含 Markdown 标记：
                {
                  "summary": "一句话核心结论",
                  "analysis": "关于趋势和异常点的详细分析",
                  "forecast": [
                    {"date": "YYYY-MM-DD", "predicted_sales": 0}
                  ]
                }
            `;

            const textResult = await callQwen(prompt, true);
            const parsed = JSON.parse(textResult || "{}") as ForecastResult;
            
            if (!parsed.forecast || !Array.isArray(parsed.forecast)) {
                throw new Error("预测引擎返回了非标准的数据结构。");
            }

            setForecastResult(parsed);
        } catch (err: any) {
            setError(err.message || "预测链路中断，请检查物理数据。");
        } finally {
            setIsLoading(false);
        }
    };
    
    const totalPredictedSales = useMemo(() => 
        forecastResult?.forecast.reduce((sum, item) => sum + (item.predicted_sales || 0), 0) || 0
    , [forecastResult]);

    return (
        <div className="p-8 md:p-12 w-full animate-fadeIn space-y-10 min-h-screen bg-[#F8FAFC]">
            {/* Header - Standardized 3-line format */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">时序算法预测模型就绪</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">销售预测中心</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Neural Demand Forecasting & Inventory Projection Hub</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Configuration Sidebar */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-10 space-y-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                        
                        <div className="space-y-4 relative z-10" ref={searchRef}>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <SearchCode size={14} className="text-brand" /> 1. 挂载预测资产
                            </label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="搜索 SKU 编码或名称..." 
                                    value={selectedSku ? selectedSku.name : searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        if (selectedSku) setSelectedSku(null);
                                        setIsSearchOpen(true);
                                    }}
                                    onFocus={() => setIsSearchOpen(true)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-[24px] pl-12 pr-10 py-4 text-sm font-black text-slate-700 outline-none focus:border-brand shadow-inner transition-all" 
                                />
                                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                {selectedSku && (
                                    <button 
                                        onClick={() => { setSelectedSku(null); setSearchTerm(''); }}
                                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            
                            {isSearchOpen && !selectedSku && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-[28px] shadow-2xl z-50 p-4 max-h-72 overflow-y-auto no-scrollbar animate-slideIn">
                                    {filteredSkus.length > 0 ? filteredSkus.map(sku => (
                                        <button 
                                            key={sku.id} 
                                            onClick={() => { setSelectedSku(sku); setIsSearchOpen(false); }} 
                                            className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl text-left transition-colors group"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-brand transition-all">
                                                <Box size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-slate-800 truncate">{sku.name}</p>
                                                <p className="text-[9px] font-mono text-slate-400 mt-0.5">{sku.code}</p>
                                            </div>
                                        </button>
                                    )) : (
                                        <div className="p-10 text-center text-slate-300 text-[10px] font-black uppercase">无匹配物理资产</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <CalendarDays size={14} className="text-blue-500" /> 2. 时间投影步长
                            </label>
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                                {[7, 14, 30].map(days => (
                                    <button 
                                        key={days} 
                                        onClick={() => setForecastDays(days)} 
                                        className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all ${forecastDays === days ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        未来 {days} 天
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Target size={14} className="text-amber-500" /> 3. 环境变量干预 (可选)
                            </label>
                            <textarea 
                                value={influencingFactors} 
                                onChange={e => setInfluencingFactors(e.target.value)}
                                placeholder="输入外部变量，例如：双11活动、库存即将到货、竞品调价等..."
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none no-scrollbar transition-all" 
                            />
                        </div>

                        <button 
                            onClick={handleGenerate} 
                            disabled={isLoading || !selectedSku} 
                            className="w-full py-6 rounded-[28px] bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl shadow-brand/20 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 uppercase tracking-[0.2em]"
                        >
                            {isLoading ? <LoaderCircle size={22} className="animate-spin" /> : <TrendingUp size={22} />}
                            {isLoading ? '预测计算中...' : '执行全链路预测'}
                        </button>
                        
                        {error && (
                            <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 animate-slideIn">
                                <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                                <p className="text-xs font-bold text-rose-600 leading-relaxed">{error}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Forecast Display */}
                <div className="lg:col-span-8 flex flex-col space-y-10">
                    <div className="bg-white rounded-[56px] p-12 h-full flex flex-col shadow-sm border border-slate-100 relative overflow-hidden group/result">
                        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(112,173,71,0.02),transparent_70%)] pointer-events-none"></div>
                        
                        <div className="relative z-10 flex items-center justify-between mb-12 border-b border-slate-50 pb-10">
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-16 rounded-[24px] bg-slate-50 flex items-center justify-center text-brand border border-slate-100 shadow-inner group-hover/result:rotate-6 transition-transform">
                                    <BarChartHorizontalBig size={32} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">预测产出矩阵</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Algorithmic Demand Projection Results</p>
                                </div>
                            </div>
                            {forecastResult && (
                                <div className="px-6 py-3 bg-brand text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-brand/20">
                                    时序模型已收敛
                                </div>
                            )}
                        </div>

                        <div className="relative z-10 flex-1 flex flex-col">
                            {isLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                                    <div className="w-24 h-24 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-10"></div>
                                    <p className="font-black text-xs uppercase tracking-[0.4em] animate-pulse">Neural Engine Processing...</p>
                                </div>
                            ) : forecastResult ? (
                                <div className="space-y-10 animate-fadeIn flex flex-col h-full">
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="p-10 rounded-[40px] bg-slate-50 border border-slate-100 shadow-inner group">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                                <History size={14} className="text-brand" /> 周期累计销量投影
                                            </h4>
                                            <p className="text-6xl font-black text-slate-900 tabular-nums tracking-tighter">
                                                {totalPredictedSales.toLocaleString()} 
                                                <span className="text-xl text-slate-300 ml-3 uppercase tracking-widest">PCS</span>
                                            </p>
                                        </div>
                                        <div className="p-10 rounded-[40px] bg-navy text-white relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand/10 rounded-full blur-3xl"></div>
                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
                                                <Bot size={14} className="text-brand" /> 算法核心结论
                                            </h4>
                                            <p className="text-lg font-black leading-relaxed relative z-10">{forecastResult.summary}</p>
                                        </div>
                                    </div>

                                    {/* Detailed Forecast List */}
                                    <div className="flex-1 bg-slate-50/50 rounded-[48px] p-10 border border-slate-100 shadow-inner overflow-hidden flex flex-col">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                                            <Activity size={14} className="text-brand" /> 逐日预测明细记录
                                        </h4>
                                        <div className="flex-1 overflow-y-auto no-scrollbar pr-4 -mr-4">
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                                {forecastResult.forecast.map((item, idx) => (
                                                    <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center gap-3 hover:shadow-xl hover:-translate-y-1 transition-all">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase">{item.date.split('-').slice(1).join('/')}</span>
                                                        <span className="text-2xl font-black text-slate-800 tabular-nums">{item.predicted_sales}</span>
                                                        <span className="text-[8px] font-black text-brand uppercase tracking-widest">PCS</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* AI Commentary */}
                                    <div className="bg-white rounded-[32px] p-10 border border-slate-100 shadow-sm">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">深入时序诊断分析</h4>
                                        <p className="text-sm text-slate-600 font-medium leading-loose italic">{forecastResult.analysis}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-8 opacity-40">
                                    <div className="w-28 h-28 rounded-[40px] border-4 border-dashed border-slate-200 flex items-center justify-center">
                                        <TrendingUp size={56} strokeWidth={1} />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <p className="text-sm font-black uppercase tracking-[0.4em]">Engine Awaiting Initialization</p>
                                        <p className="text-[10px] font-bold text-slate-400">请选择左侧 SKU 资产并点击“执行预测”启动 AI 神经网络计算</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-12 pt-8 border-t border-slate-50 flex justify-between items-center relative z-10 shrink-0">
                            <div className="flex items-center gap-3 grayscale opacity-30">
                                <Sparkles size={16} className="text-brand animate-pulse"/>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Algorithmic Pipeline Active</p>
                            </div>
                            <p className="text-[9px] font-black text-slate-200 uppercase tracking-[0.2em] italic">Yunzhou Intelligence Hub v4.2.0</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};