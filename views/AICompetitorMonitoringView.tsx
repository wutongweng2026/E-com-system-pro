import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Binoculars, ShieldAlert, Zap, Bot, Target, Search, BarChart3, Globe, Plus, Store, X, ChevronDown, CheckSquare, Square, TrendingUp, Activity, LayoutDashboard, Database, RefreshCw, Trash2, Edit3, ArrowUp, ArrowDown, ChevronRight, Scale, Calculator } from 'lucide-react';
import { MonitoredCompetitorShop, CompetitorGroup, CompetitorProductSpec } from '../lib/types';
import { getSkuIdentifier } from '../lib/helpers';

interface CompMonitoringProps {
    compShops: MonitoredCompetitorShop[];
    compGroups: CompetitorGroup[];
    shangzhiData: any[];
    onUpdateCompShops: (data: MonitoredCompetitorShop[]) => void;
    onUpdateCompGroups: (data: CompetitorGroup[]) => void;
    addToast: any;
}

// 趋势图指标配置
const TREND_METRICS = [
    { key: 'uv', label: '访客数', color: '#06B6D4' },
    { key: 'paid_items', label: '成交件数', color: '#8B5CF6' },
    { key: 'pv', label: '浏览量', color: '#22C55E' },
    { key: 'paid_amount', label: '成交金额', color: '#10B981' },
    { key: 'cvr', label: '转化率', color: '#F43F5E' },
    { key: 'avgPrice', label: '单台均价', color: '#F59E0B' }
];

// 趋势图组件
const CompetitorTrendChart = ({ data, selectedMetrics }: { data: any[], selectedMetrics: Set<string> }) => {
    if (data.length < 2 || selectedMetrics.size === 0) return (
        <div className="h-32 flex flex-col items-center justify-center text-slate-300 gap-2">
            <Activity size={32} strokeWidth={1} />
            <p className="text-[10px] font-black uppercase tracking-widest">请选择指标以激活趋势流</p>
        </div>
    );

    const width = 1000; const height = 150; 
    const padding = { top: 20, right: 40, bottom: 20, left: 40 };
    
    const metricMaxMap = new Map<string, number>();
    selectedMetrics.forEach(key => metricMaxMap.set(key, Math.max(...data.map(d => d[key] || 0), 0.0001)));
    
    const xScale = (i: number) => padding.left + (i / (data.length - 1)) * (width - padding.left - padding.right);
    const yScale = (v: number, key: string) => { 
        const max = metricMaxMap.get(key) || 1; 
        return height - padding.bottom - (v / max) * (height - padding.top - padding.bottom); 
    };

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible cursor-crosshair">
            {Array.from(selectedMetrics).map(key => {
                const config = TREND_METRICS.find(m => m.key === key);
                const pts = data.map((d, i) => `${xScale(i)},${yScale(d[key] || 0, key)}`).join(' L ');
                return (
                    <g key={key} className="transition-all duration-700">
                        <path d={`M ${pts}`} fill="none" stroke={config?.color || '#ccc'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                );
            })}
        </svg>
    );
};

export const AICompetitorMonitoringView = ({ compShops, compGroups, shangzhiData, onUpdateCompShops, onUpdateCompGroups, addToast }: CompMonitoringProps) => {
    const [activeSubTab, setActiveSubTab] = useState<'shop' | 'cannon'>('shop');
    const [period, setPeriod] = useState<7 | 30>(7);
    const [selectedTrendMetrics, setSelectedTrendMetrics] = useState<Set<string>>(new Set(['uv', 'paid_items']));

    // Modals
    const [isAddShopModalOpen, setIsAddShopModalOpen] = useState(false);
    const [isAddCannonModalOpen, setIsAddCannonModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<CompetitorGroup | null>(null);

    // 计算逻辑
    const computePerformance = (skuCodes: string[], shopName?: string) => {
        const now = new Date();
        const start = new Date(now.getTime() - period * 86400000).toISOString().split('T')[0];
        const end = now.toISOString().split('T')[0];

        const filtered = shangzhiData.filter(r => {
            if (r.date < start || r.date > end) return false;
            const code = getSkuIdentifier(r);
            if (shopName && r.shop_name === shopName) return true;
            if (code && skuCodes.includes(code)) return true;
            return false;
        });

        const totals = filtered.reduce((acc, r) => {
            acc.pv += Number(r.pv) || 0;
            acc.uv += Number(r.uv) || 0;
            acc.paid_items += Number(r.paid_items) || 0;
            acc.paid_amount += Number(r.paid_amount) || 0;
            return acc;
        }, { pv: 0, uv: 0, paid_items: 0, paid_amount: 0 });

        const dailyMap = new Map<string, any>();
        filtered.forEach(r => {
            if (!dailyMap.has(r.date)) dailyMap.set(r.date, { date: r.date, pv: 0, uv: 0, paid_items: 0, paid_amount: 0, cvr: 0, avgPrice: 0 });
            const ent = dailyMap.get(r.date);
            ent.pv += Number(r.pv) || 0;
            ent.uv += Number(r.uv) || 0;
            ent.paid_items += Number(r.paid_items) || 0;
            ent.paid_amount += Number(r.paid_amount) || 0;
            ent.cvr = ent.uv > 0 ? (Number(r.paid_users) || 0) / ent.uv : 0;
            ent.avgPrice = ent.paid_items > 0 ? ent.paid_amount / ent.paid_items : 0;
        });

        const dailyData = Array.from(dailyMap.values()).sort((a,b) => a.date.localeCompare(b.date));

        return {
            ...totals,
            cvr: totals.uv > 0 ? totals.paid_items / totals.uv : 0,
            avgPrice: totals.paid_items > 0 ? totals.paid_amount / totals.paid_items : 0,
            dailyData
        };
    };

    const handleSaveGroup = (groupData: any) => {
        if (editingGroup) {
            onUpdateCompGroups(compGroups.map(g => g.id === editingGroup.id ? { ...groupData, id: g.id } : g));
            addToast('success', '更新成功', `对比组 [${groupData.name}] 已保存。`);
        } else {
            onUpdateCompGroups([...compGroups, { ...groupData, id: Date.now().toString() }]);
            addToast('success', '创建成功', `新对比组 [${groupData.name}] 已加入实验室。`);
        }
        setIsAddCannonModalOpen(false);
        setEditingGroup(null);
    };

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10">
            {/* Header - Standardized */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">竞品雷达神经模型训练中</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 竞品监控中心</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 italic">Competitive Intelligence System & Market Radar</p>
                </div>

                <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-xl">
                    <button onClick={() => setActiveSubTab('shop')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeSubTab === 'shop' ? 'bg-navy text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>竞店战略监控</button>
                    <button onClick={() => setActiveSubTab('cannon')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeSubTab === 'cannon' ? 'bg-navy text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>竞品对比监控</button>
                </div>
            </div>

            {/* Global Controls */}
            <div className="flex flex-wrap items-center justify-between gap-6 bg-slate-50 p-6 rounded-[32px] border border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                        <button onClick={() => setPeriod(7)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${period === 7 ? 'bg-brand text-white shadow-md' : 'text-slate-400'}`}>近 7 天</button>
                        <button onClick={() => setPeriod(30)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${period === 30 ? 'bg-brand text-white shadow-md' : 'text-slate-400'}`}>近 30 天</button>
                    </div>
                    <div className="flex gap-2">
                        {TREND_METRICS.map(m => (
                            <button 
                                key={m.key} 
                                onClick={() => setSelectedTrendMetrics(p => { const n = new Set(p); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); return n; })}
                                className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase transition-all flex items-center gap-2 ${selectedTrendMetrics.has(m.key) ? 'bg-white border-slate-300 text-slate-800 shadow-sm' : 'border-transparent text-slate-400 opacity-50'}`}
                            >
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }}></div>
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
                {activeSubTab === 'shop' ? (
                    <button onClick={() => setIsAddShopModalOpen(true)} className="px-6 py-3 rounded-xl bg-brand text-white font-black text-xs hover:bg-[#5da035] shadow-lg shadow-brand/20 transition-all flex items-center gap-2"><Plus size={14}/> 添加监控竞店</button>
                ) : (
                    <button onClick={() => { setEditingGroup(null); setIsAddCannonModalOpen(true); }} className="px-6 py-3 rounded-xl bg-brand text-white font-black text-xs hover:bg-[#5da035] shadow-lg shadow-brand/20 transition-all flex items-center gap-2"><Plus size={14}/> 创建竞品组</button>
                )}
            </div>

            {/* Content Area */}
            {activeSubTab === 'shop' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {compShops.length === 0 ? (
                        <div className="md:col-span-2 py-32 bg-white rounded-[48px] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                            <Store size={64} strokeWidth={1} className="mb-4 opacity-20" />
                            <p className="font-black uppercase tracking-widest text-sm">暂无监控中的竞店资产</p>
                        </div>
                    ) : compShops.map(shop => {
                        const stats = computePerformance(shop.skuCodes, shop.name);
                        return (
                            <div key={shop.id} className="bg-white rounded-[48px] p-8 border border-slate-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                <div className="flex items-center justify-between mb-8 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-brand"><Store size={24} /></div>
                                        <div>
                                            <h3 className="text-xl font-black text-slate-800 tracking-tight">{shop.name}</h3>
                                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">监控 SKU: {shop.skuCodes.length}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => onUpdateCompShops(compShops.filter(s => s.id !== shop.id))} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-300 hover:text-rose-500 flex items-center justify-center transition-all"><Trash2 size={16} /></button>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-8 relative z-10">
                                    <MetricBox label="访客数 (UV)" value={stats.uv} color="text-cyan-600" />
                                    <MetricBox label="成交量 (Items)" value={stats.paid_items} color="text-purple-600" />
                                    <MetricBox label="GMV (Revenue)" value={stats.paid_amount} prefix="¥" color="text-brand" />
                                </div>

                                <div className="bg-slate-50 rounded-[32px] p-6 border border-slate-100 relative z-10">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">物理流实时趋势</span>
                                        <div className="flex gap-2">
                                            {Array.from(selectedTrendMetrics).map(m => (
                                                <div key={m} className="w-2 h-2 rounded-full" style={{ backgroundColor: TREND_METRICS.find(tm => tm.key === m)?.color }}></div>
                                            ))}
                                        </div>
                                    </div>
                                    <CompetitorTrendChart data={stats.dailyData} selectedMetrics={selectedTrendMetrics} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {activeSubTab === 'cannon' && (
                <div className="space-y-8">
                    {compGroups.length === 0 ? (
                         <div className="py-32 bg-white rounded-[48px] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                            <Scale size={64} strokeWidth={1} className="mb-4 opacity-20" />
                            <p className="font-black uppercase tracking-widest text-sm">尚未建立对比实验室 (Comp Groups)</p>
                        </div>
                    ) : compGroups.map(group => (
                        <div key={group.id} className="bg-white rounded-[48px] p-10 border border-slate-100 shadow-sm relative overflow-hidden group/cannon">
                             <div className="flex items-center justify-between mb-10 border-b border-slate-50 pb-8">
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-3xl bg-navy flex items-center justify-center text-brand shadow-lg group-hover/cannon:rotate-12 transition-transform duration-500">
                                        <Target size={28} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{group.name} 对比组</h3>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Side-by-Side Competitive Duel</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => { setEditingGroup(group); setIsAddCannonModalOpen(true); }} className="px-6 py-2.5 rounded-xl border border-slate-100 text-slate-400 font-black text-[10px] hover:bg-slate-50 transition-all uppercase tracking-widest flex items-center gap-2"><Edit3 size={14}/> 编辑</button>
                                    <button onClick={() => onUpdateCompGroups(compGroups.filter(g => g.id !== group.id))} className="px-6 py-2.5 rounded-xl border border-rose-100 text-rose-500 font-black text-[10px] hover:bg-rose-50 transition-all uppercase tracking-widest flex items-center gap-2"><Trash2 size={14}/> 移除</button>
                                </div>
                             </div>

                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                 {/* Spec Table */}
                                 <div className="space-y-6">
                                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Globe size={14}/> 物理规格参差对齐</h4>
                                     <div className="overflow-hidden rounded-3xl border border-slate-100 bg-slate-50/30">
                                         <table className="w-full text-[11px] text-left">
                                             <thead className="bg-slate-100/50">
                                                 <tr className="text-slate-500 font-black uppercase">
                                                     <th className="p-4 w-[25%] border-r border-slate-100">核心指标</th>
                                                     <th className="p-4 text-brand">{group.productA.name} (A)</th>
                                                     <th className="p-4 text-blue-600">{group.productB.name} (B)</th>
                                                 </tr>
                                             </thead>
                                             <tbody className="divide-y divide-slate-100">
                                                 <SpecRow label="SKU 编码" a={group.productA.sku} b={group.productB.sku} isMono />
                                                 <SpecRow label="上架时间" a={group.productA.listingDate} b={group.productB.listingDate} />
                                                 <SpecRow label="前台售价" a={`¥${group.productA.price}`} b={`¥${group.productB.price}`} isBold />
                                                 <SpecRow label="CPU" a={group.productA.cpu} b={group.productB.cpu} />
                                                 <SpecRow label="内存 / RAM" a={group.productA.ram} b={group.productB.ram} />
                                                 <SpecRow label="硬盘 / SSD" a={group.productA.ssd} b={group.productB.ssd} />
                                                 <SpecRow label="显卡 / GPU" a={group.productA.gpu} b={group.productB.gpu} />
                                                 <SpecRow label="屏幕规格" a={group.productA.screen} b={group.productB.screen} />
                                                 <SpecRow label="尺寸" a={group.productA.size} b={group.productB.size} />
                                             </tbody>
                                         </table>
                                     </div>
                                 </div>

                                 {/* Performance Showdown */}
                                 <div className="space-y-6">
                                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Activity size={14}/> 全链路性能对冲审计</h4>
                                     <div className="grid grid-cols-1 gap-6">
                                         <DuelMetrics group={group} shangzhiData={shangzhiData} period={period} selectedTrendMetrics={selectedTrendMetrics} />
                                     </div>
                                 </div>
                             </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals for Adding data */}
            {isAddShopModalOpen && (
                <AddShopModal isOpen={isAddShopModalOpen} onClose={() => setIsAddShopModalOpen(false)} onConfirm={(s) => { onUpdateCompShops([...compShops, { ...s, id: Date.now().toString() }]); setIsAddShopModalOpen(false); }} />
            )}
            {isAddCannonModalOpen && (
                <AddCannonModal isOpen={isAddCannonModalOpen} onClose={() => { setIsAddCannonModalOpen(false); setEditingGroup(null); }} onConfirm={handleSaveGroup} initialData={editingGroup} />
            )}
        </div>
    );
};

const MetricBox = ({ label, value, prefix = "", color = "text-slate-800" }: any) => (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:bg-white transition-colors group/box">
        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className={`text-lg font-black tabular-nums tracking-tighter ${color}`}>{prefix}{value.toLocaleString()}</p>
    </div>
);

const SpecRow = ({ label, a, b, isMono = false, isBold = false }: any) => (
    <tr className="hover:bg-white transition-colors">
        <td className="p-4 font-black text-slate-400 border-r border-slate-100">{label}</td>
        <td className={`p-4 ${isMono ? 'font-mono' : ''} ${isBold ? 'font-black text-slate-900' : 'text-slate-600'}`}>{a || '-'}</td>
        <td className={`p-4 ${isMono ? 'font-mono' : ''} ${isBold ? 'font-black text-slate-900' : 'text-slate-600'}`}>{b || '-'}</td>
    </tr>
);

const DuelMetrics = ({ group, shangzhiData, period, selectedTrendMetrics }: any) => {
    const start = new Date(Date.now() - period * 86400000).toISOString().split('T')[0];
    const getStats = (sku: string) => {
        const rows = shangzhiData.filter((r:any) => getSkuIdentifier(r) === sku && r.date >= start);
        const totals = rows.reduce((acc:any, r:any) => {
            acc.uv += Number(r.uv) || 0;
            acc.paid_items += Number(r.paid_items) || 0;
            acc.paid_amount += Number(r.paid_amount) || 0;
            return acc;
        }, { uv: 0, paid_items: 0, paid_amount: 0 });
        
        const dailyMap = new Map();
        rows.forEach((r:any) => {
            if(!dailyMap.has(r.date)) dailyMap.set(r.date, { date: r.date, uv: 0, paid_items: 0, paid_amount: 0, cvr: 0, avgPrice: 0 });
            const ent = dailyMap.get(r.date);
            ent.uv += Number(r.uv) || 0;
            ent.paid_items += Number(r.paid_items) || 0;
            ent.paid_amount += Number(r.paid_amount) || 0;
            ent.cvr = ent.uv > 0 ? (Number(r.paid_users) || 0) / ent.uv : 0;
            ent.avgPrice = ent.paid_items > 0 ? ent.paid_amount / ent.paid_items : 0;
        });
        
        return { ...totals, avgPrice: totals.paid_items > 0 ? totals.paid_amount / totals.paid_items : 0, dailyData: Array.from(dailyMap.values()).sort((a,b) => a.date.localeCompare(b.date)) };
    };

    const statsA = getStats(group.productA.sku);
    const statsB = getStats(group.productB.sku);

    const DuelKPI = ({ label, a, b, isCurrency = false, isFloat = false }: any) => {
        const diff = a - b;
        const pA = (a / (a + b || 1)) * 100;
        const formatVal = (v: number) => isCurrency ? `¥${v.toLocaleString()}` : isFloat ? v.toFixed(2) : v.toLocaleString();
        
        return (
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-slate-400">{label}</span>
                    <span className={diff > 0 ? 'text-brand' : 'text-blue-500'}>
                        {diff > 0 ? `A 领跑 +${formatVal(Math.abs(diff))}` : `B 领跑 +${formatVal(Math.abs(diff))}`}
                    </span>
                </div>
                <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    <div className="bg-brand h-full transition-all duration-700" style={{ width: `${pA}%` }}></div>
                    <div className="bg-blue-500 h-full transition-all duration-700" style={{ width: `${100 - pA}%` }}></div>
                </div>
                <div className="flex justify-between text-[11px] font-black tabular-nums">
                    <span className="text-slate-800">{formatVal(a)}</span>
                    <span className="text-slate-800">{formatVal(b)}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-slate-50/50 p-8 rounded-[40px] border border-slate-100 space-y-10">
             <DuelKPI label="近 7/30 天成交总额 (GMV)" a={statsA.paid_amount} b={statsB.paid_amount} isCurrency />
             <DuelKPI label="全平台访客吸引力 (UV)" a={statsA.uv} b={statsB.uv} />
             <DuelKPI label="物理成交件数 (Paid Items)" a={statsA.paid_items} b={statsB.paid_items} />
             <DuelKPI label="周期单台均价 (Avg Price)" a={statsA.avgPrice} b={statsB.avgPrice} isCurrency isFloat />
             
             <div className="pt-8 border-t border-slate-200">
                <div className="flex justify-between items-center mb-6">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">成交趋势对撞流</span>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-brand"></div><span className="text-[9px] font-black text-slate-500">Product A</span></div>
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-[9px] font-black text-slate-500">Product B</span></div>
                    </div>
                </div>
                <div className="relative h-40">
                    <div className="absolute inset-0 opacity-100"><CompetitorTrendChart data={statsA.dailyData} selectedMetrics={selectedTrendMetrics} /></div>
                    <div className="absolute inset-0 opacity-40 mix-blend-multiply"><CompetitorTrendChart data={statsB.dailyData} selectedMetrics={selectedTrendMetrics} /></div>
                </div>
             </div>
        </div>
    );
};

// Modals
const AddShopModal = ({ isOpen, onClose, onConfirm }: any) => {
    const [name, setName] = useState('');
    const [skus, setSkus] = useState('');
    if(!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fadeIn">
            <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg p-10 m-4 border border-slate-200">
                <h3 className="text-2xl font-black text-slate-900 mb-8">添加监控竞店</h3>
                <div className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">竞店名称 *</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-brand" placeholder="例如：联想京东自营官方旗舰店" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">监控 SKU (选填)</label>
                        <textarea value={skus} onChange={e => setSkus(e.target.value)} className="w-full h-32 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-brand resize-none" placeholder="输入核心竞品 SKU 编码，以回车分隔" />
                    </div>
                </div>
                <div className="flex gap-4 mt-10 pt-8 border-t border-slate-100">
                    <button onClick={onClose} className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-500 font-black text-xs hover:bg-slate-50 transition-all uppercase">取消</button>
                    <button onClick={() => onConfirm({ name, skuCodes: skus.split('\n').filter(Boolean) })} className="flex-1 py-3.5 rounded-xl bg-brand text-white font-black text-xs hover:bg-[#5da035] shadow-xl shadow-brand/20 transition-all uppercase">确认加入雷达</button>
                </div>
            </div>
        </div>
    );
};

const AddCannonModal = ({ isOpen, onClose, onConfirm, initialData }: any) => {
    const [name, setName] = useState('');
    const [prodA, setProdA] = useState<Partial<CompetitorProductSpec>>({});
    const [prodB, setProdB] = useState<Partial<CompetitorProductSpec>>({});
    
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name || '');
                setProdA(initialData.productA || {});
                setProdB(initialData.productB || {});
            } else {
                setName('');
                setProdA({});
                setProdB({});
            }
        }
    }, [isOpen, initialData]);

    if(!isOpen) return null;
    
    const ProductForm = ({ label, data, setData, color }: any) => (
        <div className="space-y-4 p-6 bg-slate-50/50 rounded-3xl border border-slate-100">
            <h4 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${color}`}><div className={`w-1.5 h-3 rounded-full ${color.replace('text', 'bg')}`}></div> {label}</h4>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">SKU 编码</label>
                    <input value={data.sku || ''} onChange={e => setData({...data, sku: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">显示名称</label>
                    <input value={data.name || ''} onChange={e => setData({...data, name: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">前台售价</label>
                    <input type="number" value={data.price || ''} onChange={e => setData({...data, price: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">上架日期</label>
                    <input type="date" value={data.listingDate || ''} onChange={e => setData({...data, listingDate: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">CPU 型号</label>
                    <input value={data.cpu || ''} onChange={e => setData({...data, cpu: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">内存规格</label>
                    <input value={data.ram || ''} onChange={e => setData({...data, ram: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">硬盘 / 屏幕</label>
                    <input placeholder="容量" value={data.ssd || ''} onChange={e => setData({...data, ssd: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand mb-1" />
                    <input placeholder="屏幕" value={data.screen || ''} onChange={e => setData({...data, screen: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">显卡 / 尺寸</label>
                    <input placeholder="GPU" value={data.gpu || ''} onChange={e => setData({...data, gpu: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand mb-1" />
                    <input placeholder="尺寸" value={data.size || ''} onChange={e => setData({...data, size: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-brand" />
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fadeIn overflow-y-auto">
            <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl p-10 m-4 border border-slate-200 h-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{initialData ? '编辑对比实验室' : '建立竞品对比实验室'}</h3>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Dual-Product Specification Entry</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 hover:text-slate-900 flex items-center justify-center transition-all"><X size={24} /></button>
                </div>
                
                <div className="space-y-8">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">实验组名称 *</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black outline-none focus:border-brand" placeholder="例如：13代主流笔记本 A/B 对抗组" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <ProductForm label="目标产品 (A)" data={prodA} setData={setProdA} color="text-brand" />
                        <ProductForm label="对照竞品 (B)" data={prodB} setData={setProdB} color="text-blue-500" />
                    </div>
                </div>

                <div className="flex gap-4 mt-10 pt-8 border-t border-slate-100">
                    <button onClick={onClose} className="flex-1 py-4 rounded-2xl border border-slate-200 text-slate-500 font-black text-xs hover:bg-slate-50 transition-all uppercase">取消</button>
                    <button onClick={() => onConfirm({ name, productA: prodA, productB: prodB })} className="flex-[2] py-4 rounded-2xl bg-navy text-white font-black text-xs hover:bg-slate-800 shadow-xl shadow-navy/20 transition-all uppercase tracking-widest">保存并运行实验室</button>
                </div>
            </div>
        </div>
    );
};
