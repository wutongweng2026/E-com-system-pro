import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DollarSign, Bot, LoaderCircle, AlertCircle, ChevronsUpDown, ChevronDown, Store, PieChart, LayoutDashboard, TrendingUp, ChevronLeft, ChevronRight, Sparkles, Filter, CheckSquare, Square, Search } from 'lucide-react';
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
    const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
    const [isShopDropdownOpen, setIsShopDropdownOpen] = useState(false);
    const shopDropdownRef = useRef<HTMLDivElement>(null);
    const [sortBy, setSortBy] = useState<{ key: keyof ProfitData, direction: 'asc' | 'desc' }>({ key: 'netProfit', direction: 'desc' });
    
    const [isLoading, setIsLoading] = useState(false);
    const [tableData, setTableData] = useState<ProfitData[]>([]);
    const [shopSummaries, setShopSummaries] = useState<ShopSummary[]>([]);
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
                const shopAgg = new Map<string, Omit<ShopSummary, 'shopId' | 'shopName' | 'margin'>>();

                szData.forEach((r: any) => {
                    const skuCode = getSkuIdentifier(r);
                    if (!skuCode) return;
                    const skuInfo = skuMap.get(skuCode);
                    if (!skuInfo) return;
                    if (selectedShopIds.length > 0 && !selectedShopIds.includes(skuInfo.shopId)) return;
                    
                    const revenue = Number(r.paid_amount) || 0;
                    const cogs = (skuInfo.costPrice || 0) * (Number(r.paid_items) || 0);
                    
                    const entry = profitMap.get(skuCode) || { skuName: skuInfo.name, shopName: shopMap.get(skuInfo.shopId) || '未知', revenue: 0, cogs: 0, adSpend: 0, grossProfit: 0, netProfit: 0 };
                    entry.revenue += revenue;
                    entry.cogs += cogs;
                    entry.grossProfit += (revenue - cogs);
                    profitMap.set(skuCode, entry);

                    const sAgg = shopAgg.get(skuInfo.shopId) || { revenue: 0, cogs: 0, adSpend: 0, netProfit: 0 };
                    sAgg.revenue += revenue;
                    sAgg.cogs += cogs;
                    shopAgg.set(skuInfo.shopId, sAgg);
                });

                profitMap.forEach((data, skuCode) => {
                    data.adSpend = adSpendMap.get(skuCode) || 0;
                    data.netProfit = data.grossProfit - data.adSpend;
                });

                jztData.forEach((r: any) => {
                    const skuCode = getSkuIdentifier(r);
                    const skuInfo = skuCode ? skuMap.get(skuCode) : null;
                    if (skuInfo && shopAgg.has(skuInfo.shopId)) {
                        const sAgg = shopAgg.get(skuInfo.shopId)!;
                        sAgg.adSpend += Number(r.cost || 0);
                    }
                });

                let tRev = 0, tCogs = 0, tAd = 0, tGross = 0, tNet = 0;
                const finalTableData = Array.from(profitMap.entries()).map(([skuCode, data]) => {
                    tRev += data.revenue; tCogs += data.cogs; tAd += data.adSpend; tGross += data.grossProfit; tNet += data.netProfit;
                    return { skuCode, ...data, netProfitMargin: data.revenue > 0 ? data.netProfit / data.revenue : 0 };
                });

                setKpis({ totalRevenue: tRev, totalCogs: tCogs, totalAdSpend: tAd, totalGrossProfit: tGross, totalNetProfit: tNet, avgNetProfitMargin: tRev > 0 ? tNet / tRev : 0 });
                setTableData(finalTableData);
                setShopSummaries(Array.from(shopAgg.entries()).map(([shopId, data]) => ({
                    shopId, shopName: shopMap.get(shopId) || '未知', ...data, netProfit: data.revenue - data.cogs - data.adSpend, margin: data.revenue > 0 ? (data.revenue - data.cogs - data.adSpend) / data.revenue : 0
                })));
            } finally { setIsLoading(false); }
        };
        fetchData();
    }, [startDate, endDate, selectedShopIds, skus, shops]);

    const handleAiAnalysis = async () => {
        setIsAiLoading(true);
        try {
            const dataStr = sortedTableData.slice(0, 5).map(s => `${s.skuName}: ¥${s.revenue} (利润率:${(s.netProfitMargin*100).toFixed(1)}%)`).join('; ');
            const prompt = `你是首席财务官。当前利润审计：${dataStr}。请根据货品成本和广告比，给出 3 条提高利润率的专业建议，200字以内。`;
            const result = await callQwen(prompt);
            setAiInsight(result || "审计意见生成失败。");
        } catch (err: any) {
            setAiInsight(`无法连接 Gemini 引擎: ${err.message}`);
        } finally { setIsAiLoading(false); }
    };

    const sortedTableData = useMemo(() => [...tableData].sort((a,b) => {
        const valA = a[sortBy.key]; const valB = b[sortBy.key];
        return sortBy.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    }), [tableData, sortBy]);

    const paginatedTableData = useMemo(() => sortedTableData.slice((currentPage-1)*ROWS_PER_PAGE, currentPage*ROWS_PER_PAGE), [sortedTableData, currentPage]);

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">Gemini-3 Flash 盈利模型审计中</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 利润透视中心</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Physical SKU & Store Level Profit Intelligence</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 rounded-[32px] shadow-xl border border-slate-100">
                    <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[11px] font-black outline-none" />
                    <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[11px] font-black outline-none" />
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {[
                    { title: '总收入 (GMV)', value: `¥${kpis.totalRevenue.toLocaleString()}`, color: 'text-slate-900' },
                    { title: '最终净利润', value: `¥${kpis.totalNetProfit.toLocaleString()}`, color: kpis.totalNetProfit < 0 ? 'text-rose-600' : 'text-brand' },
                    { title: '平均利润率', value: `${(kpis.avgNetProfitMargin*100).toFixed(2)}%`, color: kpis.avgNetProfitMargin < 0 ? 'text-rose-600' : 'text-brand' }
                ].map(k => (
                    <div key={k.title} className="p-8 rounded-[32px] bg-white border border-slate-100 shadow-sm">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase mb-3">{k.title}</h4>
                        <p className={`text-2xl font-black tabular-nums tracking-tighter ${k.color}`}>{k.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white rounded-[48px] p-10 shadow-sm border border-slate-100 min-h-[500px]">
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-8">SKU 级物理利润审计</h3>
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="text-left text-slate-400 font-black uppercase border-b border-slate-100"><th className="pb-4">资产明细</th><th className="pb-4 text-right">GMV</th><th className="pb-4 text-right">净利润</th><th className="pb-4 text-right">利润率</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {paginatedTableData.map(row => (
                                <tr key={row.skuCode} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-4 font-black text-slate-800">{row.skuName}<p className="text-[9px] text-slate-400">{row.skuCode}</p></td>
                                    <td className="py-4 text-right font-mono">¥{row.revenue.toLocaleString()}</td>
                                    <td className={`py-4 text-right font-mono font-black ${row.netProfit < 0 ? 'text-rose-500' : 'text-brand'}`}>¥{row.netProfit.toLocaleString()}</td>
                                    <td className="py-4 text-right"><span className={`px-2 py-1 rounded-lg text-[10px] font-black ${row.netProfitMargin < 0 ? 'bg-rose-50 text-rose-600' : 'bg-brand/10 text-brand'}`}>{(row.netProfitMargin*100).toFixed(1)}%</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="lg:col-span-4 bg-white rounded-[48px] p-10 flex flex-col relative overflow-hidden group">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-14 h-14 rounded-3xl bg-brand flex items-center justify-center text-white shadow-lg"><Bot size={28} /></div>
                        <h3 className="text-xl font-black tracking-tight">Gemini 利润诊断官</h3>
                    </div>
                    <button onClick={handleAiAnalysis} disabled={isAiLoading} className="w-full py-5 rounded-[24px] bg-brand text-white font-black text-sm shadow-xl hover:bg-[#5da035] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                        {isAiLoading ? <LoaderCircle size={20} className="animate-spin" /> : <TrendingUp size={20} />} 启动 Gemini 审计建议
                    </button>
                    <div className="mt-8 flex-1 bg-slate-50/50 rounded-[32px] p-8 border border-slate-100 overflow-y-auto no-scrollbar shadow-inner">
                        {isAiLoading ? <p className="text-xs text-slate-400 font-bold animate-pulse">正在穿透物理层进行多维利润审计...</p> : aiInsight || <p className="text-xs text-slate-300 italic text-center py-20">点击上方按钮获取 AI 诊断意见</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};
