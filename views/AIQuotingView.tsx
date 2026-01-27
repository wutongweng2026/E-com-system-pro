
import React, { useState, useMemo } from 'react';
import { Calculator, Wand2, RefreshCw, Clipboard, Plus, Trash2, Search, Settings2, ShieldCheck, Zap, Info, Save, FileSpreadsheet, Edit3, Layers, CheckCircle2, RotateCcw, Download } from 'lucide-react';
import { QuotingData, QuotingDiscount } from '../lib/types';

interface AIQuotingViewProps {
    quotingData: QuotingData;
    onUpdate: (newData: QuotingData) => void;
    addToast: (type: 'success' | 'error', title: string, message: string) => void;
}

// 界面显示的配置行
const CONFIG_ROWS = ["主机", "内存", "硬盘 1", "硬盘 2", "显卡", "电源", "选件"];

// 对应数据库中的类目映射
const CATEGORY_MAP: Record<string, string> = {
    "主机": "主机",
    "内存": "内存",
    "硬盘 1": "硬盘",
    "硬盘 2": "硬盘",
    "显卡": "显卡",
    "电源": "电源",
    "选件": "选件"
};

export const AIQuotingView = ({ quotingData, onUpdate, addToast }: AIQuotingViewProps) => {
    const [isAdmin, setIsAdmin] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Record<string, { model: string, qty: number }>>({});
    const [nlpInput, setNlpInput] = useState('');
    const [isMatching, setIsMatching] = useState(false);
    
    // Result States
    const [results, setResults] = useState<{cost: number, final: number, configList: {cat: string, model: string, qty: number, price: number}[]} | null>(null);

    // --- Admin Side States ---
    const [newPart, setNewPart] = useState({ category: '主机', model: '', price: '' });
    const [searchQuery, setSearchQuery] = useState('');

    const handleReset = () => {
        setSelectedItems({});
        setNlpInput('');
        setResults(null);
        addToast('success', '已重置', '当前配置方案已清空。');
    };

    const handleNlpMatch = () => {
        if (!nlpInput) return;
        setIsMatching(true);
        
        setTimeout(() => {
            const newSelection: any = {};
            const inputLower = nlpInput.toLowerCase();
            
            // 简单匹配逻辑
            Object.entries(quotingData.prices).forEach(([cat, models]) => {
                Object.keys(models).forEach(model => {
                    if (inputLower.includes(model.toLowerCase())) {
                        // 如果是硬盘，优先填入硬盘1，如果1有了填入2
                        if (cat === '硬盘') {
                            if (!newSelection['硬盘 1']) newSelection['硬盘 1'] = { model, qty: 1 };
                            else if (!newSelection['硬盘 2']) newSelection['硬盘 2'] = { model, qty: 1 };
                        } else {
                            newSelection[cat] = { model, qty: 1 };
                        }
                    }
                });
            });
            
            setSelectedItems(newSelection);
            setIsMatching(false);
            addToast('success', 'AI 识别完成', '已根据输入自动匹配最佳硬件组合。');
        }, 800);
    };

    const calculate = () => {
        let totalCost = 0;
        const configList: any[] = [];

        for (const [rowName, item] of Object.entries(selectedItems) as [string, { model: string, qty: number }][]) {
            if (!item.model || item.qty <= 0) continue;
            
            const dbCat = CATEGORY_MAP[rowName];
            const unitPrice = quotingData.prices[dbCat]?.[item.model] || 0;
            const lineCost = unitPrice * item.qty;
            
            totalCost += lineCost;
            configList.push({
                cat: rowName,
                model: item.model,
                qty: item.qty,
                price: unitPrice
            });
        }

        if (totalCost === 0) {
            addToast('error', '计算失败', '请至少选择一件配件。');
            return;
        }

        const margin = quotingData.settings.margin || 1.15;
        let rawFinal = totalCost * margin;
        
        // 应用阶梯折扣
        const totalQty = (Object.values(selectedItems) as { qty: number }[]).reduce((sum, item) => sum + item.qty, 0);
        const activeDiscount = quotingData.discounts
            .filter(d => totalQty >= d.min_qty)
            .sort((a, b) => b.min_qty - a.min_qty)[0];
        
        if (activeDiscount) {
            rawFinal *= activeDiscount.rate;
        }

        /**
         * 核心进位算法：
         * 价格后2位数 小于50 按后两位50 生成报价
         * 大于等于50 按后两位99 生成报价
         */
        const intPrice = Math.floor(rawFinal);
        const base = Math.floor(intPrice / 100) * 100;
        const lastTwoDigits = intPrice % 100;
        
        let final: number;
        if (lastTwoDigits < 50) {
            final = base + 50;
        } else {
            final = base + 99;
        }

        setResults({ cost: totalCost, final, configList });
    };

    // --- Admin Handlers ---
    const updateSettings = (updates: any) => {
        onUpdate({ ...quotingData, settings: { ...quotingData.settings, ...updates } });
        addToast('success', '设置已更新', '全局计算参数已生效。');
    };

    const handleAddPart = () => {
        if (!newPart.model || !newPart.price) return;
        const updatedPrices = { ...quotingData.prices };
        if (!updatedPrices[newPart.category]) updatedPrices[newPart.category] = {};
        updatedPrices[newPart.category][newPart.model] = parseFloat(newPart.price);
        onUpdate({ ...quotingData, prices: updatedPrices });
        setNewPart({ ...newPart, model: '', price: '' });
        addToast('success', '录入成功', '型号已同步至库。');
    };

    if (isAdmin) {
        return (
            <div className="p-8 md:p-10 w-full animate-fadeIn space-y-8 pb-20">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Pricing Backend</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">报价库管理后台</h1>
                        <p className="text-slate-500 font-medium text-xs mt-1 italic">Master Pricing Data Governance & Configuration</p>
                    </div>
                    <button onClick={() => setIsAdmin(false)} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 text-white font-black text-[10px] hover:bg-slate-700 transition-all shadow-sm uppercase tracking-widest">
                        <Calculator size={14} /> 返回报价界面
                    </button>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-6">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 tracking-tight">
                        <div className="w-1.5 h-4 bg-[#70AD47] rounded-full"></div>
                        1. 核心计算参数与折扣
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">预留加价倍率 (Margin)</label>
                            <input type="number" step="0.01" value={quotingData.settings.margin} onChange={e => updateSettings({ margin: parseFloat(e.target.value) || 1 })} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-700 w-32 focus:border-[#70AD47] outline-none" />
                        </div>
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">N件N折阶梯设置</label>
                            <div className="flex flex-wrap gap-4">
                                {quotingData.discounts.map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">满 {d.min_qty} 件</span>
                                        <span className="text-sm font-black text-[#70AD47]">{d.rate} 折</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2 tracking-tight">
                        <div className="w-1.5 h-4 bg-brand rounded-full"></div>
                        2. 快速录入配件
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <select value={newPart.category} onChange={e => setNewPart({...newPart, category: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none shadow-sm">
                            {Object.keys(CATEGORY_MAP).filter(k => !k.includes('2')).map(c => <option key={c} value={CATEGORY_MAP[c]}>{CATEGORY_MAP[c]}</option>)}
                        </select>
                        <input placeholder="型号名称" value={newPart.model} onChange={e => setNewPart({...newPart, model: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none shadow-sm" />
                        <input placeholder="成本单价" type="number" value={newPart.price} onChange={e => setNewPart({...newPart, price: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none shadow-sm" />
                        <button onClick={handleAddPart} className="bg-brand text-white rounded-xl font-black text-[10px] hover:bg-[#5da035] transition-all uppercase tracking-widest shadow-lg shadow-brand/20">确认添加至库</button>
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-800 tracking-tight">3. 现有数据维护</h3>
                        <div className="relative">
                            <input placeholder="搜索型号..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none w-64 shadow-sm" />
                            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                        </div>
                    </div>
                    <div className="p-4 max-h-[400px] overflow-y-auto no-scrollbar">
                        <table className="w-full text-xs">
                            <tbody className="divide-y divide-slate-50">
                                {Object.entries(quotingData.prices).flatMap(([cat, models]) => 
                                    Object.entries(models)
                                        .filter(([model]) => !searchQuery || model.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .map(([model, price]) => (
                                        <tr key={`${cat}-${model}`} className="hover:bg-slate-50 transition-colors group">
                                            <td className="py-3 px-4 font-black text-slate-400 uppercase text-[10px] w-32">{cat}</td>
                                            <td className="py-3 px-4 font-black text-slate-800">{model}</td>
                                            <td className="py-3 px-4 font-mono font-black text-slate-600">¥{price.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right">
                                                <button className="text-slate-300 hover:text-rose-500 font-black text-[10px] uppercase opacity-0 group-hover:opacity-100 transition-opacity">删除记录</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-8">
            {/* Header - Standardized */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">精密报价算法引擎就绪</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 智能报价系统</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 italic">Professional Precision Pricing & Configuration Parser</p>
                </div>
                <button onClick={() => setIsAdmin(true)} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 font-black text-[10px] hover:bg-slate-50 transition-all shadow-sm uppercase tracking-widest">
                    <Settings2 size={14} /> 管理报价库
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2 tracking-tight">
                            <Zap size={18} className="text-amber-500 fill-amber-500" />
                            智能配置解析
                        </h3>
                        <textarea 
                            value={nlpInput}
                            onChange={e => setNlpInput(e.target.value)}
                            placeholder="在此处粘贴客户的配置单文本，云舟 AI 将自动识别对应硬件..."
                            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-[24px] px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none mb-4 no-scrollbar"
                        />
                        <button onClick={handleNlpMatch} disabled={isMatching} className="w-full py-4 rounded-2xl bg-slate-800 text-white font-black text-xs hover:bg-slate-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50 uppercase tracking-widest shadow-lg shadow-slate-200">
                            {isMatching ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />} 智能识别并自动匹配配件
                        </button>

                        <div className="mt-10 space-y-2">
                            <div className="grid grid-cols-12 gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2">
                                <div className="col-span-3">配件类型</div>
                                <div className="col-span-7">选定型号规格</div>
                                <div className="col-span-2 text-center">数量</div>
                            </div>
                            {CONFIG_ROWS.map(rowName => {
                                const dbCat = CATEGORY_MAP[rowName];
                                return (
                                    <div key={rowName} className="grid grid-cols-12 gap-4 items-center bg-slate-50/50 p-2 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-sm transition-all">
                                        <div className="col-span-3 font-black text-[10px] uppercase text-slate-500 pl-3">{rowName}</div>
                                        <div className="col-span-7">
                                            <select 
                                                value={selectedItems[rowName]?.model || ''}
                                                onChange={e => setSelectedItems({...selectedItems, [rowName]: { model: e.target.value, qty: 1 }})}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-brand appearance-none"
                                            >
                                                <option value="">-- 未选定 --</option>
                                                {Object.keys(quotingData.prices[dbCat] || {}).map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <input 
                                                type="number"
                                                value={selectedItems[rowName]?.qty || 0}
                                                onChange={e => setSelectedItems({...selectedItems, [rowName]: { ...selectedItems[rowName], qty: parseInt(e.target.value) || 0 }})}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-black text-center text-slate-700 outline-none focus:border-brand"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-8 flex gap-3">
                             <button onClick={handleReset} className="px-8 py-4 rounded-[20px] bg-white border border-slate-200 text-slate-500 font-black text-[11px] hover:bg-slate-50 flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-widest">
                                <RotateCcw size={18} /> 重置
                            </button>
                            <button onClick={calculate} className="flex-1 py-4 rounded-[20px] bg-brand text-white font-black text-[11px] hover:bg-[#5da035] shadow-xl shadow-brand/20 flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-widest">
                                <Calculator size={18} /> 生成全链路报价
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-5">
                    <div className="bg-white rounded-[40px] p-10 h-full text-slate-800 shadow-xl border border-slate-100 relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        
                        <div className="relative z-10 flex items-center gap-2 mb-8 border-b border-slate-50 pb-4">
                            <div className="w-1.5 h-6 bg-brand rounded-full"></div>
                            <h3 className="text-xl font-black tracking-tight uppercase">报价明细单结果</h3>
                        </div>
                        
                        <div className="relative z-10 flex-1 flex flex-col">
                            {results ? (
                                <div className="space-y-8 animate-fadeIn flex flex-col h-full">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">建议零售价 (精细化进位)</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-6xl font-black text-slate-900 tabular-nums tracking-tighter">¥{results.final.toLocaleString()}</span>
                                            <span className="text-brand text-xs font-black uppercase bg-brand/10 px-2 py-0.5 rounded">含税包邮</span>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-[32px] p-8 border border-slate-100 flex-1 overflow-y-auto no-scrollbar shadow-inner">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 opacity-60">
                                            <Layers size={14} /> 选定硬件明细集
                                        </h4>
                                        <div className="space-y-4">
                                            {results.configList.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-start gap-4 border-b border-slate-200/50 pb-3 last:border-0">
                                                    <div className="min-w-0">
                                                        <p className="text-[9px] font-black text-brand uppercase tracking-widest">{item.cat}</p>
                                                        <p className="text-xs font-black text-slate-700 truncate">{item.model}</p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className="text-xs font-mono font-black text-slate-900">x{item.qty}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold">¥{item.price.toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-6 space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">核算总成本:</span>
                                                <p className="font-mono text-lg font-black text-slate-600 tabular-nums">¥{results.cost.toLocaleString()}</p>
                                            </div>
                                            <div className="space-y-1 text-right">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">预估毛利润:</span>
                                                <p className="text-brand font-black text-lg tabular-nums">¥{(results.final - results.cost).toLocaleString()} <span className="text-[10px]">({(((results.final - results.cost)/results.final)*100).toFixed(1)}%)</span></p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => {
                                                const text = results.configList.map(i => `${i.cat}: ${i.model} x${i.qty}`).join('\n') + `\n总报价: ¥${results.final}`;
                                                navigator.clipboard.writeText(text);
                                                addToast('success', '已复制', '配置清单已存入剪贴板。');
                                            }} className="flex-1 py-4 rounded-[20px] bg-slate-100 text-slate-600 font-black text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 uppercase tracking-widest">
                                                <Clipboard size={14} /> 复制文本清单
                                            </button>
                                            <button className="px-10 py-4 rounded-[20px] bg-brand text-white font-black text-xs hover:bg-[#5da035] shadow-xl shadow-brand/20 flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-widest">
                                                <Download size={14} /> 导出文件
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 text-center">
                                    <Calculator size={80} className="mb-6 opacity-10" />
                                    <p className="text-sm font-black uppercase tracking-[0.3em]">Awaiting Selection</p>
                                    <p className="text-[10px] mt-4 font-bold opacity-40 uppercase tracking-widest">请在左侧解析配置并核算报价</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
