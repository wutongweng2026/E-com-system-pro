
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    TrendingUp, ShoppingBag, Activity, CreditCard, Target, 
    ArrowUp, ArrowDown, Sparkles, Bot as BotIcon, ChevronRight, 
    Filter, ShieldAlert, PackageSearch, Flame, DatabaseZap, 
    Star, CalendarX, X, LayoutDashboard, MousePointer2 
} from 'lucide-react';
import { DB } from '../lib/db';
import { ProductSKU, Shop } from '../lib/types';
import { getSkuIdentifier } from '../lib/helpers';

type RangeType = '7d' | '30d' | 'custom';
type MetricKey = 'gmv' | 'ca' | 'spend' | 'roi';

interface MetricPoint { current: number; previous: number; }
interface MetricGroup { total: MetricPoint; self: MetricPoint; pop: MetricPoint; }
interface DailyRecord { date: string; self: number; pop: number; total: number; }

interface Diagnosis {
    id: string;
    type: 'asset' | 'stock_severe' | 'explosive' | 'data_gap' | 'high_potential';
    title: string;
    desc: string;
    skuInfo?: string;
    details: Record<string, string | number>;
    severity: 'critical' | 'warning' | 'info' | 'success';
}

const formatVal = (v: number, isFloat = false) => isFloat ? v.toFixed(2) : Math.round(v).toLocaleString();

export const DashboardView = ({ skus, shops, addToast }: { skus: ProductSKU[], shops: Shop[], addToast: any }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [activeMetric, setActiveMetric] = useState<MetricKey>('gmv');
    const [rangeType, setRangeType] = useState<RangeType>('7d');
    const [isFullReportOpen, setIsFullReportOpen] = useState(false);
    const [customRange, setCustomRange] = useState({
        start: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    
    const [data, setData] = useState<Record<MetricKey, MetricGroup>>({
        gmv: { total: {current: 0, previous: 0}, self: {current: 0, previous: 0}, pop: {current: 0, previous: 0} },
        ca: { total: {current: 0, previous: 0}, self: {current: 0, previous: 0}, pop: {current: 0, previous: 0} },
        spend: { total: {current: 0, previous: 0}, self: {current: 0, previous: 0}, pop: {current: 0, previous: 0} },
        roi: { total: {current: 0, previous: 0}, self: {current: 0, previous: 0}, pop: {current: 0, previous: 0} }
    });

    const [allTrends, setAllTrends] = useState<Record<MetricKey, DailyRecord[]>>({ gmv: [], ca: [], spend: [], roi: [] });
    const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);

    const enabledSkusMap = useMemo(() => {
        const map = new Map<string, ProductSKU>();
        skus.forEach(s => { if (s.isStatisticsEnabled) map.set(s.code, s); });
        return map;
    }, [skus]);

    const shopIdToMode = useMemo(() => new Map(shops.map(s => [s.id, s.mode])), [shops]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            let start = rangeType === 'custom' ? customRange.start : new Date(Date.now() - (rangeType === '7d' ? 6 : 29) * 86400000).toISOString().split('T')[0];
            let end = rangeType === 'custom' ? customRange.end : new Date().toISOString().split('T')[0];

            const diff = Math.ceil(Math.abs(new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
            const prevEnd = new Date(new Date(start).getTime() - 86400000).toISOString().split('T')[0];
            const prevStart = new Date(new Date(prevEnd).getTime() - (diff - 1) * 86400000).toISOString().split('T')[0];

            try {
                const [currSz, currJzt, prevSz, prevJzt] = await Promise.all([
                    DB.getRange('fact_shangzhi', start, end),
                    DB.getRange('fact_jingzhuntong', start, end),
                    DB.getRange('fact_shangzhi', prevStart, prevEnd),
                    DB.getRange('fact_jingzhuntong', prevStart, prevEnd)
                ]);

                const getStats = (sz: any[], jzt: any[]) => {
                    const stats = { gmv: { total: 0, self: 0, pop: 0 }, ca: { total: 0, self: 0, pop: 0 }, spend: { total: 0, self: 0, pop: 0 } };
                    sz.forEach(r => {
                        const code = getSkuIdentifier(r);
                        if (code && enabledSkusMap.has(code)) {
                            const val = Number(r.paid_amount) || 0;
                            const items = Number(r.paid_items) || 0;
                            const mode = shopIdToMode.get(enabledSkusMap.get(code)?.shopId || '') || '自营';
                            stats.gmv.total += val; stats.ca.total += items;
                            if (['自营', '入仓'].includes(mode)) { stats.gmv.self += val; stats.ca.self += items; }
                            else { stats.gmv.pop += val; stats.ca.pop += items; }
                        }
                    });
                    jzt.forEach(r => {
                        const code = getSkuIdentifier(r);
                        if (code && enabledSkusMap.has(code)) {
                            const cost = Number(r.cost) || 0;
                            const mode = shopIdToMode.get(enabledSkusMap.get(code)?.shopId || '') || '自营';
                            stats.spend.total += cost;
                            if (['自营', '入仓'].includes(mode)) stats.spend.self += cost; else stats.spend.pop += cost;
                        }
                    });
                    return stats;
                };

                const curr = getStats(currSz, currJzt);
                const prev = getStats(prevSz, prevJzt);
                
                // 计算趋势流
                const dailyAgg: Record<string, DailyRecord> = {};
                for(let i=0; i<diff; i++) {
                    const ds = new Date(new Date(start).getTime() + i * 86400000).toISOString().split('T')[0];
                    dailyAgg[ds] = { date: ds, self: 0, pop: 0, total: 0 };
                }
                
                currSz.forEach(r => {
                    const code = getSkuIdentifier(r);
                    if (code && enabledSkusMap.has(code) && dailyAgg[r.date]) {
                        const mode = shopIdToMode.get(enabledSkusMap.get(code)?.shopId || '') || '自营';
                        const val = Number(r.paid_amount) || 0;
                        if (['自营', '入仓'].includes(mode)) dailyAgg[r.date].self += val; else dailyAgg[r.date].pop += val;
                        dailyAgg[r.date].total += val;
                    }
                });

                setData({
                    gmv: { total: { current: curr.gmv.total, previous: prev.gmv.total }, self: { current: curr.gmv.self, previous: prev.gmv.self }, pop: { current: curr.gmv.pop, previous: prev.gmv.pop } },
                    ca: { total: { current: curr.ca.total, previous: prev.ca.total }, self: { current: curr.ca.self, previous: prev.ca.self }, pop: { current: curr.ca.pop, previous: prev.ca.pop } },
                    spend: { total: { current: curr.spend.total, previous: prev.spend.total }, self: { current: curr.spend.self, previous: prev.spend.self }, pop: { current: curr.spend.pop, previous: prev.spend.pop } },
                    roi: { 
                        total: { current: curr.spend.total > 0 ? curr.gmv.total / curr.spend.total : 0, previous: prev.spend.total > 0 ? prev.gmv.total / prev.spend.total : 0 },
                        self: { current: curr.spend.self > 0 ? curr.gmv.self / curr.spend.self : 0, previous: prev.spend.self > 0 ? prev.gmv.self / prev.spend.self : 0 },
                        pop: { current: curr.spend.pop > 0 ? curr.gmv.pop / curr.spend.pop : 0, previous: prev.spend.pop > 0 ? prev.gmv.pop / prev.spend.pop : 0 }
                    }
                });
                setAllTrends({ ...allTrends, gmv: Object.values(dailyAgg) });

                // 仿真诊断逻辑
                const newDiag: Diagnosis[] = [];
                if (curr.gmv.total < prev.gmv.total * 0.8) newDiag.push({ id: 'drop', type: 'data_gap', severity: 'critical', title: '全链路增长失速', desc: 'GMV 环比下降超过 20%，物理层流量转化出现断层。', details: { '环比降幅': formatPercent((curr.gmv.total - prev.gmv.total)/prev.gmv.total) } });
                if (curr.spend.total > prev.spend.total * 1.5) newDiag.push({ id: 'spend', type: 'explosive', severity: 'warning', title: '营销成本激增', desc: '广告消耗异常拉升，需立即穿透计划组审计 ROI 质量。', details: { '增幅': '+50%+' } });
                
                setDiagnoses(newDiag);

            } catch (e) { console.error(e); }
            finally { setTimeout(() => setIsLoading(false), 400); }
        };
        fetchData();
    }, [rangeType, customRange, enabledSkusMap, shopIdToMode]);

    return (
        <div className="p-8 md:p-12 w-full animate-fadeIn space-y-10 min-h-screen bg-[#F8FAFC]">
            {/* Command Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-slate-200 pb-10">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-[0.3em]">物理层指挥链路已建立</span>
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter">战略指挥控制台</h1>
                    <p className="text-slate-400 font-bold text-sm tracking-wide">Strategic Performance Intelligence & AI Decision Matrix</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                    {rangeType === 'custom' && (
                        <div className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-2xl shadow-sm animate-slideIn">
                            <input type="date" value={customRange.start} onChange={e => setCustomRange(p => ({...p, start: e.target.value}))} className="bg-transparent border-none text-[10px] font-black text-slate-600 px-2 outline-none cursor-pointer" />
                            <span className="text-slate-300 font-black">/</span>
                            <input type="date" value={customRange.end} onChange={e => setCustomRange(p => ({...p, end: e.target.value}))} className="bg-transparent border-none text-[10px] font-black text-slate-600 px-2 outline-none cursor-pointer" />
                        </div>
                    )}
                    <div className="flex bg-slate-200/50 p-1.5 rounded-[20px] shadow-inner border border-slate-200">
                        {[{id:'7d',l:'近7天'},{id:'30d',l:'近30天'},{id:'custom',l:'自定义'}].map(i => (
                            <button key={i.id} onClick={() => setRangeType(i.id as RangeType)} className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all ${rangeType === i.id ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-slate-500 hover:text-slate-700'}`}>{i.l}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* KPI Array */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                <KPICard isActive={activeMetric === 'gmv'} onClick={() => setActiveMetric('gmv')} title="GMV" value={data.gmv} prefix="¥" icon={<ShoppingBag size={22}/>} color="text-brand" bg="bg-brand/5" trend={allTrends.gmv} />
                <KPICard isActive={activeMetric === 'ca'} onClick={() => setActiveMetric('ca')} title="CA" value={data.ca} icon={<Activity size={22}/>} color="text-blue-600" bg="bg-blue-50" />
                <KPICard isActive={activeMetric === 'spend'} onClick={() => setActiveMetric('spend')} title="广告消耗" value={data.spend} prefix="¥" icon={<CreditCard size={22}/>} isHigherBetter={false} color="text-amber-600" bg="bg-amber-50" />
                <KPICard isActive={activeMetric === 'roi'} onClick={() => setActiveMetric('roi')} title="ROI" value={data.roi} isFloat icon={<Target size={22}/>} color="text-purple-600" bg="bg-purple-50" />
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                {/* Growth Visualizer */}
                <div className="xl:col-span-8 bg-white rounded-[56px] p-12 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group/chart">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(112,173,71,0.02),transparent_60%)] pointer-events-none"></div>
                    <div className="flex items-center justify-between mb-12 relative z-10">
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-[24px] bg-slate-50 flex items-center justify-center text-brand border border-slate-100 shadow-inner group-hover/chart:rotate-6 transition-transform">
                                <TrendingUp size={32} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase">{activeMetric} 增长拓扑流</h3>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Physical Performance Temporal Stream</p>
                            </div>
                        </div>
                        <div className="flex gap-8">
                            <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-brand shadow-lg shadow-brand/20"></div><span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">自营体系</span></div>
                            <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-blue-500 shadow-lg shadow-blue-500/20"></div><span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">POP 体系</span></div>
                        </div>
                    </div>
                    <div className="flex-1 min-h-[350px]">
                         {allTrends.gmv.length > 0 ? <MainTrendVisual data={allTrends.gmv} /> : <div className="h-full flex items-center justify-center text-slate-200 italic font-black uppercase tracking-widest opacity-20">No Data Stream Detected</div>}
                    </div>
                </div>

                {/* AI Insight Room */}
                <div className="xl:col-span-4 bg-white rounded-[56px] p-12 shadow-xl border border-slate-100 flex flex-col relative overflow-hidden group/diag">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-[100px] -translate-y-1/3 translate-x-1/3"></div>
                    <div className="flex items-center gap-5 mb-10 relative z-10">
                        <div className="w-16 h-16 rounded-[24px] bg-brand flex items-center justify-center shadow-2xl shadow-brand/30 border border-white/20 group-hover/diag:scale-110 transition-transform duration-500">
                            <BotIcon size={32} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">AI 战略诊断室 <Sparkles size={20} className="text-brand animate-pulse" /></h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Neural Decision Intelligence</p>
                        </div>
                    </div>

                    <div className="flex-1 space-y-6 relative z-10 overflow-y-auto no-scrollbar pr-2 mb-10">
                        {diagnoses.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 rounded-[40px] border border-dashed border-slate-200 p-10 text-center opacity-40">
                                <DatabaseZap size={48} className="text-slate-300 mb-6" />
                                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">物理链路平稳，系统暂无风险</p>
                            </div>
                        ) : diagnoses.map(d => (
                            <div key={d.id} className={`p-8 rounded-[32px] border ${d.severity === 'critical' ? 'bg-rose-50/50 border-rose-100' : 'bg-slate-50 border-slate-100'} hover:shadow-xl transition-all group/card cursor-default`}>
                                <div className="flex items-center gap-4 mb-4">
                                    {d.severity === 'critical' ? <ShieldAlert className="text-rose-500" size={24}/> : <Star className="text-amber-500" size={24}/>}
                                    <h4 className={`text-lg font-black uppercase tracking-tight ${d.severity === 'critical' ? 'text-rose-600' : 'text-slate-800'}`}>{d.title}</h4>
                                </div>
                                <p className="text-xs font-bold text-slate-500 leading-relaxed mb-6">{d.desc}</p>
                                <div className="bg-white/60 rounded-2xl p-5 border border-white/20 space-y-2">
                                    {Object.entries(d.details).map(([k,v]) => (
                                        <div key={k} className="flex justify-between text-[10px] font-black uppercase">
                                            <span className="text-slate-400 tracking-widest">{k}</span>
                                            <span className="text-slate-900">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button className="w-full relative z-10 py-6 bg-slate-900 text-white rounded-[28px] font-black text-sm hover:bg-black transition-all flex items-center justify-center gap-4 shadow-2xl shadow-slate-200 active:scale-95 uppercase tracking-[0.2em]">
                        穿透多源明细报告 <ChevronRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;

const KPICard = ({ title, value, prefix = "", isFloat = false, icon, isHigherBetter = true, color, bg, isActive, onClick }: any) => {
    const chg = value.total.previous === 0 ? 0 : ((value.total.current - value.total.previous) / value.total.previous) * 100;
    const isGood = (chg >= 0 && isHigherBetter) || (chg < 0 && !isHigherBetter);

    return (
        <button onClick={onClick} className={`bg-white rounded-[40px] border-2 text-left transition-all duration-500 group flex flex-col overflow-hidden relative active:scale-95 ${isActive ? 'border-brand shadow-2xl scale-[1.03] ring-8 ring-brand/5' : 'border-slate-100 shadow-sm hover:shadow-xl hover:border-slate-200'}`}>
            <div className="p-8 flex-1 space-y-8">
                <div className="flex justify-between items-start">
                    <div className={`w-16 h-16 ${bg} rounded-[24px] flex items-center justify-center ${color} group-hover:scale-110 transition-transform duration-700 shadow-inner`}>{icon}</div>
                    <div className="text-right">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{title}</h3>
                        <div className={`px-2 py-1 rounded-lg inline-flex items-center gap-1.5 ${isGood ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-600'}`}>
                            {chg >= 0 ? <ArrowUp size={10} strokeWidth={4}/> : <ArrowDown size={10} strokeWidth={4}/>}
                            <span className="text-[10px] font-black tabular-nums">{Math.abs(chg).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
                <div className="space-y-1">
                    <p className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">{prefix}{formatVal(value.total.current, isFloat)}</p>
                    <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest ml-1">Current Cycle Performance</p>
                </div>
            </div>
            <div className={`px-8 py-5 border-t flex justify-between items-center ${isActive ? 'bg-brand/5 border-brand/10' : 'bg-slate-50 border-slate-50'}`}>
                 <div className="flex items-center gap-3">
                     <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">自营</span>
                        <span className="text-xs font-black text-slate-700 tabular-nums">{prefix}{formatVal(value.self.current, isFloat)}</span>
                     </div>
                     <div className="w-[1px] h-6 bg-slate-200"></div>
                     <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">POP</span>
                        <span className="text-xs font-black text-slate-700 tabular-nums">{prefix}{formatVal(value.pop.current, isFloat)}</span>
                     </div>
                 </div>
                 <div className={`w-12 h-6 rounded flex items-center justify-center ${color} opacity-20`}>
                    <Activity size={16} />
                 </div>
            </div>
        </button>
    );
};

const MainTrendVisual = ({ data }: { data: DailyRecord[] }) => {
    const width = 1000; const height = 300; const padding = { top: 40, right: 40, bottom: 40, left: 40 };
    const maxVal = Math.max(...data.map(d => Math.max(d.self, d.pop)), 0.1) * 1.2;
    
    const getX = (i: number) => padding.left + (i / (data.length - 1)) * (width - padding.left - padding.right);
    const getY = (v: number) => height - padding.bottom - (v / maxVal) * (height - padding.top - padding.bottom);

    const generatePath = (vals: number[]) => {
        if(vals.length === 0) return "";
        return `M ${getX(0)},${getY(vals[0])} ` + vals.slice(1).map((v,i) => `L ${getX(i+1)},${getY(v)}`).join(' ');
    };

    const generateAreaPath = (vals: number[]) => {
        if(vals.length === 0) return "";
        return generatePath(vals) + ` L ${getX(vals.length-1)},${height-padding.bottom} L ${getX(0)},${height-padding.bottom} Z`;
    };

    return (
        <div className="w-full h-full relative font-sans group/canvas">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="selfGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#70AD47" stopOpacity="0.2"/><stop offset="100%" stopColor="#70AD47" stopOpacity="0"/></linearGradient>
                    <linearGradient id="popGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2"/><stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/></linearGradient>
                </defs>
                
                {/* Grids */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                    <line key={p} x1={padding.left} y1={getY(maxVal * p / 1.2)} x2={width-padding.right} y2={getY(maxVal * p / 1.2)} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="5 5" />
                ))}

                {/* Area Paths */}
                <path d={generateAreaPath(data.map(d => d.self))} fill="url(#selfGrad)" className="transition-all duration-700" />
                <path d={generateAreaPath(data.map(d => d.pop))} fill="url(#popGrad)" className="transition-all duration-700" />

                {/* Stroke Paths */}
                <path d={generatePath(data.map(d => d.self))} fill="none" stroke="#70AD47" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-xl transition-all duration-700" />
                <path d={generatePath(data.map(d => d.pop))} fill="none" stroke="#3B82F6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-xl transition-all duration-700" />

                {/* X Axis labels */}
                <text x={padding.left} y={height-10} textAnchor="start" fontSize="10" fill="#94a3b8" fontWeight="900" className="uppercase">{data[0].date}</text>
                <text x={width-padding.right} y={height-10} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="900" className="uppercase">{data[data.length-1].date}</text>
            </svg>
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover/canvas:opacity-100 transition-opacity">
                <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-2xl">
                    <MousePointer2 size={12}/> 全链路数据已就绪
                </div>
            </div>
        </div>
    );
};
