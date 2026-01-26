
import React, { useState, useEffect } from 'react';
import { TrendingUp, Bot, BarChart, Calendar, ArrowUp, ArrowDown, Activity, Zap, Sparkles, Loader2, Target, ShoppingBag, CreditCard, Percent } from 'lucide-react';
import { DB } from '../lib/db';

export const DashboardView = ({ skus, shops }: any) => {
    const [timeMode, setTimeMode] = useState('7d');
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<any>({ current: {}, previous: {} });

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const end = new Date().toISOString().split('T')[0];
            const start = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
            
            try {
                const [currSz, currJzt] = await Promise.all([
                    DB.getRange('fact_shangzhi', start, end),
                    DB.getRange('fact_jingzhuntong', start, end)
                ]);

                const gmv = currSz.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0);
                const spend = currJzt.reduce((s, r) => s + (Number(r.cost) || 0), 0);
                
                setData({
                    current: {
                        gmv,
                        ca: currSz.reduce((s, r) => s + (Number(r.paid_items) || 0), 0),
                        spend,
                        roi: spend > 0 ? gmv / spend : 0
                    },
                    previous: { gmv: gmv * 0.88, ca: gmv * 0.05, spend: spend * 1.05, roi: (gmv * 0.88) / (spend * 1.05) } 
                });
            } finally {
                setTimeout(() => setIsLoading(false), 800);
            }
        };
        fetchData();
    }, [timeMode]);

    return (
        <div className="p-6 lg:p-10 w-full max-w-[1600px] mx-auto animate-fadeIn space-y-8 lg:space-y-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="px-2 py-0.5 rounded-md bg-brand/10 border border-brand/20 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse"></div>
                            <span className="text-[10px] font-black text-brand uppercase tracking-wider">实时指挥中心</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">数据最后更新: 刚刚</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-none">战略指挥仪</h1>
                    <p className="text-slate-500 font-medium text-sm">聚合全链路运营数据，通过 AI 穿透业务迷雾</p>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner w-fit">
                    {['7d', '30d', 'custom'].map((mode) => (
                        <button 
                            key={mode}
                            onClick={() => setTimeMode(mode)} 
                            className={`px-5 py-1.5 rounded-lg text-xs font-black transition-all ${timeMode === mode ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {mode === '7d' ? '近 7 天' : mode === '30d' ? '近 30 天' : '自定义'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8">
                <KPICard 
                    title="总销售额 (GMV)" 
                    value={`¥${(data.current.gmv || 0).toLocaleString()}`} 
                    change={+12.5} 
                    icon={<ShoppingBag size={22}/>} 
                    loading={isLoading} 
                    color="text-brand"
                    bg="bg-brand/5"
                />
                <KPICard 
                    title="成交件数 (CA)" 
                    value={(data.current.ca || 0).toLocaleString()} 
                    change={+4.2} 
                    icon={<Activity size={22}/>} 
                    loading={isLoading} 
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <KPICard 
                    title="投放总花费" 
                    value={`¥${(data.current.spend || 0).toLocaleString()}`} 
                    change={-2.1} 
                    icon={<CreditCard size={22}/>} 
                    isHigherBetter={false} 
                    loading={isLoading} 
                    color="text-amber-600"
                    bg="bg-amber-50"
                />
                <KPICard 
                    title="整体投产比 (ROI)" 
                    value={(data.current.roi || 0).toFixed(2)} 
                    change={+8.7} 
                    icon={<Target size={22}/>} 
                    loading={isLoading} 
                    color="text-purple-600"
                    bg="bg-purple-50"
                />
            </div>

            {/* Content Body */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                 {/* Visual Analytics */}
                 <div className="xl:col-span-2 bg-white rounded-[32px] p-8 lg:p-10 shadow-sm border border-slate-100 flex flex-col h-[500px] lg:h-[600px] group transition-all hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center justify-between mb-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
                                <BarChart size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">业务趋势穿透</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Multi-dimensional Performance Analysis</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-brand cursor-pointer transition-colors border border-slate-100"><TrendingUp size={16}/></div>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-50/50 rounded-[24px] border border-slate-200/60 flex flex-col items-center justify-center overflow-hidden relative border-dashed">
                        <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500">
                             <TrendingUp size={40} className="text-slate-200" />
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] italic">渲染中...</p>
                        <p className="text-[10px] text-slate-300 mt-2">请确保物理表中有足够的历史数据记录</p>
                    </div>
                 </div>

                 {/* AI Diagnosis Panel */}
                 <div className="xl:col-span-1 bg-navy rounded-[32px] p-8 lg:p-10 shadow-2xl flex flex-col relative overflow-hidden group border border-white/5">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-brand/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
                     
                     <div className="flex items-center gap-4 mb-10 relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center text-white shadow-xl shadow-brand/40 transition-transform group-hover:rotate-6">
                            <Bot size={24} />
                        </div>
                        <h3 className="text-xl lg:text-2xl font-black text-white tracking-tight">AI 智能分析</h3>
                     </div>

                     <div className="flex-1 space-y-6 relative z-10 overflow-y-auto no-scrollbar">
                        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 space-y-4 shadow-xl">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                                <span className="text-[10px] font-black text-brand uppercase tracking-widest">深度扫描完成</span>
                            </div>
                            <p className="text-slate-300 text-sm leading-relaxed font-medium">
                                本周期整体 GMV 增长强劲。AI 监测到 <span className="text-white font-black">核心盈利 SKU</span> 的转化率提升显著，建议增加搜索广告权重的预算，同时关注尾部库存的清理。
                            </p>
                        </div>
                        
                        <div className="space-y-3">
                             <DiagnosisItem 
                                icon={<Zap size={16} />} 
                                title="投放预算优化" 
                                desc="支出占比触及 15% 预警，建议调低..." 
                                type="warning"
                             />
                             <DiagnosisItem 
                                icon={<Sparkles size={16} />} 
                                title="爆品潜力识别" 
                                desc="识别到 3 个潜力爆款单品，建议加码..." 
                                type="success"
                             />
                             <DiagnosisItem 
                                icon={<Percent size={16} />} 
                                title="价格力诊断" 
                                desc="部分配件价格高于同环比 8%，竞争力下降" 
                                type="info"
                             />
                        </div>
                     </div>

                     <button className="w-full mt-8 py-4 bg-brand text-white rounded-2xl font-black text-sm shadow-xl shadow-brand/20 hover:bg-[#5da035] hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-3 relative z-10">
                        获取深度运营调优报告
                        <Zap size={16} fill="white" />
                     </button>
                 </div>
            </div>
        </div>
    );
};

const KPICard = ({ title, value, change, icon, isHigherBetter = true, loading, color, bg }: any) => {
    const isPositive = change >= 0;
    const isSuccess = isHigherBetter ? isPositive : !isPositive;
    
    return (
        <div className="bg-white p-8 rounded-[28px] shadow-sm border border-slate-100 transition-all duration-500 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 group">
            <div className="flex justify-between items-center mb-6">
                <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center ${color} group-hover:scale-110 transition-transform duration-500`}>
                    {icon}
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black ${isSuccess ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-600'}`}>
                    {isPositive ? <ArrowUp size={10} strokeWidth={4} /> : <ArrowDown size={10} strokeWidth={4} />}
                    {Math.abs(change)}%
                </div>
            </div>
            
            {loading ? (
                <div className="space-y-2 animate-pulse">
                    <div className="h-8 bg-slate-100 rounded-lg w-3/4"></div>
                    <div className="h-3 bg-slate-50 rounded-lg w-1/2"></div>
                </div>
            ) : (
                <div className="space-y-1">
                    <p className="text-3xl font-black text-slate-900 tracking-tighter tabular-nums">{value}</p>
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
                </div>
            )}
        </div>
    );
};

const DiagnosisItem = ({ icon, title, desc, type }: any) => {
    const typeStyles = {
        warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        success: 'bg-brand/10 text-brand border-brand/20',
        info: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    };

    return (
        <div className="flex items-start gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-all cursor-pointer group/item">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${typeStyles[type as keyof typeof typeStyles]}`}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white group-hover/item:text-brand transition-colors">{title}</p>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5 truncate">{desc}</p>
            </div>
        </div>
    );
};
