import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DollarSign, Bot, LoaderCircle, AlertCircle, ChevronsUpDown, ChevronDown, Store, PieChart, LayoutDashboard, TrendingUp, ChevronLeft, ChevronRight, Sparkles, Filter, CheckSquare, Square, Search, Target, DatabaseZap } from 'lucide-react';
import { callQwen } from '../lib/ai';
import { DB } from '../lib/db';
import { getSkuIdentifier } from '../lib/helpers';
import { ProductSKU, Shop } from '../lib/types';

interface ProfitData {
    skuCode: string;
    skuName: string;
    shopName: string;
    revenue: number;
    cogs: number;
    adSpend: number;
    grossProfit: number;
    netProfit: number;
    netProfitMargin: number;
}

interface ShopSummary {
    shopId: string;
    shopName: string;
    revenue: number;
    cogs: number;
    adSpend: number;
    netProfit: number;
    margin: number;
}

interface KpiData {
    totalRevenue: number;
    totalCogs: number;
    totalAdSpend: number;
    totalGrossProfit: number;
    totalNetProfit: number;
    avgNetProfitMargin: number;
}

const getInitialDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
};

export const AIProfitAnalyticsView = ({ skus, shops, addToast }: { skus: ProductSKU[], shops: Shop[], addToast: any }) => {
    const [startDate, setStartDate] = useState(getInitialDates().startDate);
    const [endDate, setEndDate] = useState(getInitialDates().endDate);
    const [selectedShopId, setSelectedShopId] = useState('all');
    const [sortBy, setSortBy] = useState<{ key: keyof ProfitData, direction: 'asc' | 'desc' }>({ key: 'netProfit', direction: 'desc' });
    
    const [isLoading, setIsLoading] = useState(false);
    const [tableData, setTableData] = useState<ProfitData[]>([]);
    const [kpis, setKpis] = useState<KpiData>({ totalRevenue: 0, totalCogs: 0, totalAdSpend: 0, totalGrossProfit: 0, totalNetProfit: 0, avgNetProfitMargin: 0 });
    
    const [aiInsight, setAiInsight] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const ROWS_PER_PAGE = 10;

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [szData, jztData] = await Promise.all([
                    DB.getRange('fact_shangzhi', startDate, endDate),
                    DB.getRange('fact_jingzhuntong', startDate, endDate)
                ]);

                const skuMap = new Map(skus.map(s => [s.code, s]));
                const shopMap = new Map(shops.map(s => [s.id, s.name]));
                const adSpendMap = new Map<string, number>();

                jztData.forEach((r: any) => {
                    const skuCode = getSkuIdentifier(r);
                    if (skuCode) adSpendMap.set(skuCode, (adSpendMap.get(skuCode) || 0) + Number(r.cost || 0));
                });

                const profitMap = new Map<string, Omit<ProfitData, 'skuCode' | 'netProfitMargin'>>();

                szData.forEach((r: any) => {
                    const skuCode = getSkuIdentifier(r);
                    if (!skuCode) return;
                    const skuInfo = skuMap.get(skuCode);
                    if (!skuInfo) return;
                    
                    // 店铺过滤逻辑
                    if (selectedShopId !== 'all' && skuInfo.shopId !== selectedShopId) return;
                    
                    const revenue = Number(r.paid_amount) || 0;
                    const cogs = (skuInfo.costPrice || 0) * (Number(r.paid_items) || 0);
                    
                    const entry = profitMap.get(skuCode) || { skuName: skuInfo.name, shopName: shopMap.get(skuInfo.shopId) || '未知', revenue: 0, cogs: 0, adSpend: 0, grossProfit: 0, netProfit: 0 };
                    entry.revenue += revenue;
                    entry.cogs += cogs;
                    entry.grossProfit += (revenue - cogs);
                    profitMap.set(skuCode, entry);
                });

                profitMap.forEach((data, skuCode) => {
                    data.adSpend = adSpendMap.get(skuCode) || 0;
                    data.netProfit = data.grossProfit - data.adSpend;
                });

                let tRev = 0, tCogs = 0, tAd = 0, tGross = 0, tNet = 0;
                const finalTableData = Array.from(profitMap.entries()).map(([skuCode, data]) => {
                    tRev += data.revenue; tCogs += data.cogs; tAd += data.adSpend; tGross += data.grossProfit; tNet += data.netProfit;
                    return { skuCode, ...data, netProfitMargin: data.revenue > 0 ? data.netProfit / data.revenue : 0 };
                });

                setKpis({ totalRevenue: tRev, totalCogs: tCogs, totalAdSpend: tAd, totalGrossProfit: tGross, totalNetProfit: tNet, avgNetProfitMargin: tRev > 0 ? tNet / tRev : 0 });
                setTableData(finalTableData);
            } finally { setIsLoading(false); }
        };
        fetchData();
    }, [startDate, endDate, selectedShopId, skus, shops]);

    const handleAiAnalysis = async () => {
        setIsAiLoading(true);
        setAiInsight('');
        try {
            const topRisks = [...tableData].sort((a,b) => a.netProfitMargin - b.netProfitMargin).slice(0, 5);
            const dataStr = topRisks.map(s => `${s.skuName}: ¥${s.revenue.toLocaleString()} (利润率:${(s.netProfitMargin*100).toFixed(1)}%)`).join('; ');
            const shopName = selectedShopId === 'all' ? '全域' : (shops.find(s => s.id === selectedShopId)?.name || '指定店铺');
            
            const prompt = `你是首席财务官。当前[${shopName}]利润审计发现以下低利润或亏损SKU：${dataStr}。请根据货品成本和广告比，给出 3 条提高盈利能力的专业建议，保持精炼，200字以内。不要提及任何AI模型名称。`;
            const result = await callQwen(prompt);
            setAiInsight(result || "审计意见生成失败。");
        } catch (err: any) {
            setAiInsight(`无法连接审计引擎: ${err.message}`);
        } finally { setIsAiLoading(false); }
    };

    const sortedTableData = useMemo(() => [...tableData].sort((a,b) => {
        const valA = a[sortBy.key]; const valB = b[sortBy.key];
        return sortBy.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    }), [tableData, sortBy]);

    const paginatedTableData = useMemo(() => sortedTableData.slice((currentPage-1)*ROWS_PER_PAGE, currentPage*ROWS_PER_PAGE), [sortedTableData, currentPage]);
    const totalPages = Math.ceil(tableData.length / ROWS_PER_PAGE);

    return (
        <div className="p-8 md:p-12 w-full animate-fadeIn space-y-10 min-h-screen bg-[#F8FAFC]">
            {/* Header - Standardized 3-line format */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-10">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-[0.3em] leading-none">盈利模型审计中</span>
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">利润透视中心</h1>
                    <p className="text-slate-400 font-bold text-sm tracking-wide">Physical SKU & Store Level Profit Intelligence</p>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-10 flex flex-wrap gap-8 items-end relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分析店铺范围</label>
                    <div className="relative">
                        <select 
                            value={selectedShopId} 
                            onChange={e => { setSelectedShopId(e.target.value); setCurrentPage(1); }}
                            className="min-w-[220px] bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-black text-slate-700 outline-none focus:border-brand appearance-none shadow-inner"
                        >
                            <option value="all">全域资产分析</option>
                            {shops.map((s: Shop) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分析周期</label>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1 shadow-inner">
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} className="bg-transparent border-none text-[11px] font-black text-slate-700 px-3 py-2 outline-none" />
                        <span className="text-slate-300 font-black">-</span>
                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} className="bg-transparent border-none text-[11px] font-black text-slate-700 px-3 py-2 outline-none" />
                    </div>
                </div>

                <div className="flex items-center gap-4 ml-auto">
                    <div className="p-4 bg-brand/5 rounded-2xl border border-brand/10 flex items-center gap-3">
                        <Target size={18} className="text-brand" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">分析中资产: {tableData.length} SKU</span>
                    </div>
                </div>
            </div>

            {/* KPI Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-8">
                <KpiCard title="总收入 (GMV)" value={`¥${kpis.totalRevenue.toLocaleString()}`} color="text-slate-900" bg="bg-slate-50" />
                <KpiCard title="广告总消耗" value={`¥${kpis.totalAdSpend.toLocaleString()}`} color="text-amber-600" bg="bg-amber-50" />
                <KpiCard title="最终净利润" value={`¥${kpis.totalNetProfit.toLocaleString()}`} color={kpis.totalNetProfit < 0 ? 'text-rose-600' : 'text-brand'} bg={kpis.totalNetProfit < 0 ? 'bg-rose-50' : 'bg-brand/5'} />
                <KpiCard title="平均利润率" value={`${(kpis.avgNetProfitMargin*100).toFixed(2)}%`} color={kpis.avgNetProfitMargin < 0 ? 'text-rose-600' : 'text-brand'} bg={kpis.avgNetProfitMargin < 0 ? 'bg-rose-50' : 'bg-brand/5'} />
                <KpiCard title="货品总成本" value={`¥${kpis.totalCogs.toLocaleString()}`} color="text-slate-500" bg="bg-slate-100" />
                <KpiCard title="全站投产比" value={kpis.totalAdSpend > 0 ? (kpis.totalRevenue / kpis.totalAdSpend).toFixed(2) : '0.00'} color="text-blue-600" bg="bg-blue-50" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Detailed Table */}
                <div className="lg:col-span-8 bg-white rounded-[48px] p-10 shadow-sm border border-slate-100 min-h-[600px] flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                    <div className="flex items-center justify-between mb-8 relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-brand">
                                <LayoutDashboard size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">SKU 级物理利润审计</h3>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Physical Performance Ledger</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto no-scrollbar relative z-10">
                        <table className="w-full text-[11px] table-fixed min-w-[800px]">
                            <thead>
                                <tr className="text-left text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                                    <th className="pb-5 px-2 w-[250px]">资产明细</th>
                                    <th className="pb-5 px-2 text-right w-[120px]">成交 GMV</th>
                                    <th className="pb-5 px-2 text-right w-[120px]">最终净利润</th>
                                    <th className="pb-5 px-2 text-right w-[100px]">利润率</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {isLoading ? (
                                    <tr><td colSpan={4} className="py-20 text-center text-slate-300 animate-pulse">正在穿透物理数据...</td></tr>
                                ) : paginatedTableData.length === 0 ? (
                                    <tr><td colSpan={4} className="py-20 text-center text-slate-300">选定周期内无经营记录</td></tr>
                                ) : paginatedTableData.map(row => (
                                    <tr key={row.skuCode} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="py-5 px-2">
                                            <div className="font-black text-slate-800 truncate text-xs" title={row.skuName}>{row.skuName}</div>
                                            <div className="text-[9px] text-slate-400 font-black mt-1 uppercase tracking-tighter opacity-60 flex items-center gap-2">
                                                <span className="font-mono">{row.skuCode}</span>
                                                <span className="bg-slate-100 px-1 rounded">{row.shopName}</span>
                                            </div>
                                        </td>
                                        <td className="py-5 px-2 text-right font-mono font-bold text-slate-600">¥{row.revenue.toLocaleString()}</td>
                                        <td className={`py-5 px-2 text-right font-mono font-black ${row.netProfit < 0 ? 'text-rose-500' : 'text-brand'}`}>¥{row.netProfit.toLocaleString()}</td>
                                        <td className="py-5 px-2 text-right">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${row.netProfitMargin < 0 ? 'bg-rose-50 text-rose-600' : 'bg-brand/10 text-brand'}`}>{(row.netProfitMargin*100).toFixed(1)}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-8 mt-auto relative z-10 border-t border-slate-50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">第 {currentPage} / {totalPages} 页</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-slate-900 disabled:opacity-20 transition-all bg-slate-50/50 hover:bg-white"><ChevronLeft size={16} /></button>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2.5 rounded-xl border border-slate-100 text-slate-400 hover:text-slate-900 disabled:opacity-20 transition-all bg-slate-50/50 hover:bg-white"><ChevronRight size={16} /></button>
                            </div>
                        </div>
                    )}
                </div>

                {/* AI Insight Sidebar */}
                <div className="lg:col-span-4 bg-white rounded-[48px] p-10 flex flex-col relative overflow-hidden group shadow-sm border border-slate-100">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-brand/5 rounded-full blur-[100px] -translate-y-1/3 translate-x-1/3 pointer-events-none"></div>
                    
                    <div className="flex items-center gap-5 mb-10 relative z-10">
                        <div className="w-16 h-16 rounded-[24px] bg-brand flex items-center justify-center shadow-2xl shadow-brand/30 border border-white/20">
                            <Bot size={32} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase">利润诊断官</h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Neural Profit Audit Opinion</p>
                        </div>
                    </div>

                    <button 
                        onClick={handleAiAnalysis} 
                        disabled={isAiLoading || tableData.length === 0} 
                        className="w-full relative z-10 mb-10 py-5 rounded-[24px] bg-navy text-white font-black text-sm shadow-2xl shadow-navy/20 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95 uppercase tracking-widest disabled:opacity-50"
                    >
                        {isAiLoading ? <LoaderCircle size={20} className="animate-spin" /> : <DatabaseZap size={20} />}
                        启动利润多维审计
                    </button>

                    <div className="relative z-10 flex-1 bg-slate-50/50 rounded-[32px] p-8 border border-slate-100 overflow-y-auto no-scrollbar shadow-inner min-h-[300px]">
                        {isAiLoading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300">
                                <LoaderCircle className="animate-spin" size={32} />
                                <p className="text-[10px] font-black uppercase tracking-widest">正在穿透毛利分层...</p>
                            </div>
                        ) : aiInsight ? (
                            <div className="text-sm text-slate-600 leading-loose whitespace-pre-wrap font-medium">
                                {aiInsight}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-300 italic opacity-60">
                                <p className="text-xs font-black uppercase tracking-widest">Awaiting Audit job</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const KpiCard = ({ title, value, color, bg }: any) => (
    <div className={`p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all ${bg} group`}>
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{title}</h4>
        <p className={`text-2xl font-black tabular-nums tracking-tighter ${color}`}>{value}</p>
    </div>
);
