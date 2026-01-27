import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrendingUp, Bot, ChevronDown, Sparkles, LoaderCircle, AlertCircle, CalendarDays, BarChartHorizontalBig, Search, Box, LayoutDashboard, Target, Activity, X } from 'lucide-react';
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
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [selectedSku, setSelectedSku] = useState<ProductSKU | null>(null);
    const [forecastDays, setForecastDays] = useState<number>(7);
    const [influencingFactors, setInfluencingFactors] = useState('');
    const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!selectedSku) return;
        setIsLoading(true);
        setError('');

        try {
            const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const allRows = await DB.getRange('fact_shangzhi', ninetyDaysAgo.toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
            const historicalData = allRows
                .filter(row => getSkuIdentifier(row) === selectedSku.code)
                .map(row => ({ date: row.date, sales: Number(row.paid_items) || 0 }))
                .sort((a, b) => a.date.localeCompare(b.date));
            
            if (historicalData.length < 3) throw new Error("历史样本不足 3 天。");

            const prompt = `你是一名算法专家。请根据销量：${JSON.stringify(historicalData)}，预测未来${forecastDays}天销量。营销变量：${influencingFactors || '无'}。严格按 JSON 返回 summary, analysis, forecast 数组。`;
            const textResult = await callQwen(prompt, true);
            setForecastResult(JSON.parse(textResult || "{}") as ForecastResult);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const totalPredictedSales = forecastResult?.forecast.reduce((sum, item) => sum + item.predicted_sales, 0) || 0;

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 销售预测中心 (Qwen 版)</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Demand Forecasting Powered by DashScope</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-10 space-y-8">
                        <div className="space-y-3">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">选择资产</label>
                             <select onChange={(e) => setSelectedSku(skus.find(s=>s.id===e.target.value)||null)} className="w-full bg-slate-50 border border-slate-200 rounded-[24px] px-6 py-4 text-sm font-black text-slate-700 outline-none">
                                 <option value="">-- 选择 SKU --</option>
                                 {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                             </select>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">时间投影</label>
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                                {[7, 14, 30].map(days => (
                                    <button key={days} onClick={() => setForecastDays(days)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all ${forecastDays === days ? 'bg-white shadow-md' : 'text-slate-400'}`}>未来 {days} 天</button>
                                ))}
                            </div>
                        </div>
                        <button onClick={handleGenerate} disabled={isLoading || !selectedSku} className="w-full py-5 rounded-[24px] bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl transition-all disabled:opacity-30 flex items-center justify-center gap-2">
                            {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : <TrendingUp size={20} />} 执行预测
                        </button>
                    </div>
                </div>

                <div className="lg:col-span-8">
                    <div className="bg-white rounded-[48px] p-10 shadow-sm border border-slate-100 min-h-[500px]">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-[400px] text-slate-300 animate-pulse"><LoaderCircle className="animate-spin mb-4" size={40}/><p className="font-black text-xs uppercase tracking-widest">Qwen Is Thinking...</p></div>
                        ) : forecastResult ? (
                            <div className="animate-fadeIn space-y-10">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4">周期累计预测</h4>
                                        <p className="text-4xl font-black text-slate-900 tabular-nums">{totalPredictedSales.toLocaleString()} <span className="text-sm text-slate-300 ml-1">PCS</span></p>
                                    </div>
                                </div>
                                <div className="bg-[#020617] rounded-[40px] p-10 text-white relative overflow-hidden">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center"><Bot size={24} /></div>
                                        <h3 className="text-lg font-black tracking-tight">Qwen 算法诊断</h3>
                                    </div>
                                    <div className="bg-white/5 rounded-[24px] p-8 border border-white/10">
                                        <p className="text-sm font-bold leading-relaxed mb-4 text-slate-100">{forecastResult.summary}</p>
                                        <p className="text-xs text-slate-400 font-medium italic leading-relaxed">{forecastResult.analysis}</p>
                                    </div>
                                </div>
                            </div>
                        ) : <div className="h-[400px] flex items-center justify-center text-slate-200 uppercase tracking-widest font-black opacity-30">Awaiting Target Selection</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
