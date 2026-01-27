
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calculator, Wand2, RefreshCw, Clipboard, Plus, Trash2, Search, Settings2, ShieldCheck, Zap, Info, Save, FileSpreadsheet, Edit3, Layers, CheckCircle2, RotateCcw, Download, Cloud, CloudOff, X, UploadCloud, ChevronDown, Bot, LayoutGrid, DollarSign, Sparkles, MinusCircle, PlusCircle } from 'lucide-react';
import { QuotingData, QuotingDiscount } from '../lib/types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DB } from '../lib/db';
import { parseExcelFile } from '../lib/excel';
import * as XLSX from 'xlsx';

interface AIQuotingViewProps {
    quotingData: QuotingData;
    onUpdate: (newData: QuotingData) => void;
    addToast: (type: 'success' | 'error', title: string, message: string) => void;
}

const DEFAULT_ROWS = ["主机", "内存", "硬盘 1", "硬盘 2", "显卡", "电源", "选件"];
const CATEGORY_OPTIONS = ["主机", "内存", "硬盘", "显卡", "电源", "散热", "机箱", "外设", "选件"];

export const AIQuotingView = ({ quotingData, onUpdate, addToast }: AIQuotingViewProps) => {
    // 权限与云端状态
    const [isAdmin, setIsAdmin] = useState(false);
    const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
    const [isCloudConnected, setIsCloudConnected] = useState(false);
    
    // 报价构建状态
    const [configRows, setConfigRows] = useState<string[]>(DEFAULT_ROWS);
    const [selectedItems, setSelectedItems] = useState<Record<string, { model: string, qty: number, category: string }>>({});
    const [nlpInput, setNlpInput] = useState('');
    const [isMatching, setIsMatching] = useState(false);
    
    // 商务优惠状态
    const [selectedDiscountIndex, setSelectedDiscountIndex] = useState<number>(-1);
    const [immediateDiscount, setImmediateDiscount] = useState<number>(0);
    
    const [results, setResults] = useState<{
        cost: number, 
        final: number, 
        configList: any[], 
        discountApplied: number,
        margin: number,
        subtraction: number
    } | null>(null);

    // 云端报价库数据
    const [partsLibrary, setPartsLibrary] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [newPart, setNewPart] = useState({ category: '主机', model: '', price: '' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 折扣编辑临时状态
    const [newDiscount, setNewDiscount] = useState({ min_qty: '', rate: '' });

    // 初始化云端连接并拉取配件库
    useEffect(() => {
        const initCloud = async () => {
            const config = await DB.loadConfig('cloud_sync_config', null);
            if (config && config.url && config.key) {
                const client = createClient(config.url, config.key);
                setSupabase(client);
                const { data, error } = await client.from('dim_quoting_library').select('*').order('category', { ascending: true });
                if (!error && data) {
                    setPartsLibrary(data);
                    setIsCloudConnected(true);
                }
            }
        };
        initCloud();
        
        const initialItems: any = {};
        DEFAULT_ROWS.forEach(row => {
            initialItems[row] = { model: '', qty: 0, category: row.includes('硬盘') ? '硬盘' : row };
        });
        setSelectedItems(initialItems);
    }, []);

    const refreshLibrary = async () => {
        if (!supabase) return;
        const { data, error } = await supabase.from('dim_quoting_library').select('*').order('category', { ascending: true });
        if (!error && data) setPartsLibrary(data);
    };

    const handleSavePart = async () => {
        if (!newPart.model || !newPart.price) return;
        if (!supabase) {
            addToast('error', '未连接云端', '请在“云端同步”页面配置 Supabase。');
            return;
        }
        const item = { id: Math.random().toString(36).substr(2, 9), category: newPart.category, model: newPart.model, price: parseFloat(newPart.price) };
        const { error } = await supabase.from('dim_quoting_library').upsert(item);
        if (!error) {
            addToast('success', '库写入成功', `型号 [${newPart.model}] 已同步全员。`);
            setNewPart({ ...newPart, model: '', price: '' });
            refreshLibrary();
        } else {
            addToast('error', '物理写入失败', '网络连接异常或数据库权限受限。');
        }
    };

    const handleDeletePart = async (id: string) => {
        if (!supabase) {
            addToast('error', '删除失败', '未建立云端物理链路。');
            return;
        }
        const { error } = await supabase.from('dim_quoting_library').delete().eq('id', id);
        if (!error) { addToast('success', '擦除成功', '已从全局库移除型号。'); refreshLibrary(); }
        else { addToast('error', '操作失败', '无法同步删除指令至云端。'); }
    };

    const handleDownloadTemplate = () => {
        const headers = [['分类', '型号', '单价']];
        const data = [['主机', 'ThinkStation P360', '5200'], ['内存', '16G DDR5 4800MHz', '450'], ['硬盘', '1TB NVMe Gen4 SSD', '600']];
        const ws = XLSX.utils.aoa_to_sheet([...headers, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "配件导入模版");
        XLSX.writeFile(wb, "配件库导入模版.xlsx");
        addToast('success', '模版下载成功', '请按模版格式填写后上传。');
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!supabase) {
            addToast('error', '导入失败', '请先配置并连接云端数据库。');
            return;
        }
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const { data } = parseExcelFile(evt.target?.result);
                const newItems = data.map((row: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    category: String(row['分类'] || row['Category'] || '主机'),
                    model: String(row['型号'] || row['Model'] || ''),
                    price: parseFloat(row['单价'] || row['Price'] || '0')
                })).filter(i => i.model && !isNaN(i.price));
                const { error } = await supabase.from('dim_quoting_library').upsert(newItems);
                if (error) throw error;
                addToast('success', '批量同步完成', `已向云端注入 ${newItems.length} 条物理配件。`);
                refreshLibrary();
            } catch (err: any) { addToast('error', '同步异常', '网络超时或数据格式不兼容。'); }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const addRow = () => {
        const newRowName = `自定义项 ${configRows.length + 1}`;
        setConfigRows([...configRows, newRowName]);
        setSelectedItems({ ...selectedItems, [newRowName]: { model: '', qty: 0, category: '选件' } });
    };

    const removeRow = (rowName: string) => {
        setConfigRows(configRows.filter(r => r !== rowName));
        const newItems = { ...selectedItems };
        delete newItems[rowName];
        setSelectedItems(newItems);
    };

    const handleAddDiscount = () => {
        if (!newDiscount.min_qty || !newDiscount.rate) return;
        const updatedDiscounts = [...quotingData.discounts, { min_qty: parseInt(newDiscount.min_qty), rate: parseFloat(newDiscount.rate) }].sort((a, b) => a.min_qty - b.min_qty);
        onUpdate({ ...quotingData, discounts: updatedDiscounts });
        setNewDiscount({ min_qty: '', rate: '' });
    };

    const handleNlpMatch = () => {
        if (!nlpInput) return;
        setIsMatching(true);
        setTimeout(() => {
            const newSelection: any = { ...selectedItems };
            const inputLower = nlpInput.toLowerCase();
            partsLibrary.forEach(p => {
                if (inputLower.includes(p.model.toLowerCase())) {
                    const matchingRow = configRows.find(r => selectedItems[r].category === p.category && !newSelection[r].model);
                    if (matchingRow) {
                        newSelection[matchingRow] = { ...newSelection[matchingRow], model: p.model, qty: 1 };
                    }
                }
            });
            setSelectedItems(newSelection);
            setIsMatching(false);
            addToast('success', '解析完成', '已自动匹配云端配件库。');
        }, 800);
    };

    const calculate = () => {
        let totalCost = 0;
        const configList: any[] = [];
        configRows.forEach(rowName => {
            const item = selectedItems[rowName];
            if (item && item.model && item.qty > 0) {
                const part = partsLibrary.find(p => p.model === item.model);
                const unitPrice = part?.price || 0;
                totalCost += unitPrice * item.qty;
                configList.push({ cat: rowName, model: item.model, qty: item.qty, price: unitPrice });
            }
        });
        if (totalCost === 0) return;
        const margin = quotingData.settings.margin || 1.15;
        const discountRate = selectedDiscountIndex >= 0 ? quotingData.discounts[selectedDiscountIndex].rate : 1;
        let finalPriceRaw = (totalCost * margin * discountRate) - immediateDiscount;
        const intPrice = Math.floor(finalPriceRaw);
        const base = Math.floor(intPrice / 100) * 100;
        const lastTwo = intPrice % 100;
        let finalPriceRounded = lastTwo < 50 ? base + 50 : base + 99;
        setResults({ cost: totalCost, final: finalPriceRounded, configList, discountApplied: discountRate, margin: margin, subtraction: immediateDiscount });
    };

    if (isAdmin) {
        return (
            <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10 pb-20 bg-[#F8FAFC]">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2"><div className="w-2 h-2 rounded-full bg-slate-400"></div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Master Pricing Backend</span></div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">报价库物理后台</h1>
                        <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Global Shared Parts Library & Pricing Logic</p>
                    </div>
                    <button onClick={() => setIsAdmin(false)} className="px-10 py-3 rounded-xl bg-navy text-white font-black text-xs hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl"><Calculator size={14} /> 返回指挥终端</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4 space-y-8">
                        <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-8">
                            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-widest"><Settings2 size={18} className="text-brand" /> 1. 计算核心因子</h3>
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">预留溢价倍率 (Margin)</label>
                                <input type="number" step="0.01" value={quotingData.settings.margin} onChange={e => onUpdate({ ...quotingData, settings: { margin: parseFloat(e.target.value) || 1 }})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-black text-slate-700 outline-none focus:border-brand shadow-inner" />
                            </div>
                            <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><DollarSign size={14} className="text-brand"/> 阶梯折扣策略管理</h4>
                                <div className="space-y-3 mb-6">
                                    {quotingData.discounts.map((d, i) => (
                                        <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 group">
                                            <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase">起订量</span><span className="text-xs font-black text-slate-700">{d.min_qty} 件</span></div>
                                            <div className="flex flex-col text-right"><span className="text-[9px] font-black text-slate-400 uppercase">折扣系数</span><span className="text-xs font-black text-brand">{d.rate}</span></div>
                                            <button onClick={() => onUpdate({ ...quotingData, discounts: quotingData.discounts.filter((_, idx) => idx !== i) })} className="ml-2 p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><X size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="number" placeholder="数量" value={newDiscount.min_qty} onChange={e => setNewDiscount({...newDiscount, min_qty: e.target.value})} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-brand" />
                                    <input type="number" step="0.01" placeholder="系数" value={newDiscount.rate} onChange={e => setNewDiscount({...newDiscount, rate: e.target.value})} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-brand" />
                                    <button onClick={handleAddDiscount} className="col-span-2 py-2 bg-brand text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md">新增折扣阶梯</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-8 space-y-8">
                        <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100">
                             <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-widest"><Layers size={18} className="text-brand" /> 2. 全局配件库维护</h3>
                                <div className="flex gap-2">
                                    <button onClick={handleDownloadTemplate} className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 font-black text-[10px] hover:bg-slate-50 transition-all flex items-center gap-2 uppercase"><Download size={14}/> 下载标准模版</button>
                                    <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 font-black text-[10px] hover:bg-slate-50 transition-all flex items-center gap-2 uppercase"><UploadCloud size={14}/> 批量同步配件</button>
                                    <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx,.xls" />
                                </div>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
                                <select value={newPart.category} onChange={e => setNewPart({...newPart, category: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-700 outline-none focus:border-brand shadow-inner">{CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                <input placeholder="型号名称" value={newPart.model} onChange={e => setNewPart({...newPart, model: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-700 outline-none focus:border-brand shadow-inner" />
                                <input placeholder="成本单价" type="number" value={newPart.price} onChange={e => setNewPart({...newPart, price: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-700 outline-none focus:border-brand shadow-inner" />
                                <button onClick={handleSavePart} className="bg-brand text-white rounded-xl font-black text-[10px] hover:bg-[#5da035] transition-all shadow-xl shadow-brand/20 uppercase tracking-widest">录入型号</button>
                             </div>
                             <div className="relative mb-6">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input placeholder="在库中搜索型号规格..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-6 py-3.5 text-xs font-black text-slate-700 outline-none focus:border-brand shadow-inner" />
                             </div>
                             <div className="overflow-y-auto max-h-[500px] no-scrollbar rounded-3xl border border-slate-100">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 sticky top-0 z-10"><tr className="text-slate-400 font-black uppercase tracking-widest"><th className="p-4">分类</th><th className="p-4">型号</th><th className="p-4 text-right">成本价</th><th className="p-4 text-center">操作</th></tr></thead>
                                    <tbody className="divide-y divide-slate-50">{partsLibrary.filter(p => !searchQuery || p.model.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                                            <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-4 font-black text-slate-500 uppercase text-[10px]">{p.category}</td>
                                                <td className="p-4 font-black text-slate-800">{p.model}</td>
                                                <td className="p-4 text-right font-mono font-black text-slate-600">¥{p.price.toLocaleString()}</td>
                                                <td className="p-4 text-center"><button onClick={() => handleDeletePart(p.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-2 opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button></td>
                                            </tr>
                                        ))}</tbody>
                                </table>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2"><div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div><span className="text-[10px] font-black text-brand uppercase tracking-widest leading-none">精密报价算法引擎就绪</span></div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI 智能报价系统</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Professional Precision Pricing & Cloud Assets Sync</p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsAdmin(true)} className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 font-black text-[10px] hover:bg-slate-50 transition-all shadow-sm uppercase tracking-widest flex items-center gap-2"><Settings2 size={14}/> 管理在库配件</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                        <div className="space-y-4 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Bot size={16} className="text-brand" /> 1. 智能配置文本解析</label>
                            <div className="relative group">
                                <textarea value={nlpInput} onChange={e => setNlpInput(e.target.value)} placeholder="粘贴客户的原始配置单，系统将自动识别型号并计算报价..." className="w-full h-28 bg-slate-50 border border-slate-200 rounded-[32px] px-8 py-6 text-sm font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none transition-all" />
                                <button onClick={handleNlpMatch} disabled={isMatching} className="absolute right-4 bottom-4 p-4 rounded-2xl bg-navy text-white hover:bg-slate-800 shadow-xl transition-all active:scale-95 disabled:opacity-30">
                                    {isMatching ? <RefreshCw size={20} className="animate-spin" /> : <Wand2 size={20} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 relative z-10">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><LayoutGrid size={16} className="text-brand" /> 2. 硬件链路清单</label>
                                <button onClick={addRow} className="text-brand hover:text-[#5da035] flex items-center gap-1 text-[10px] font-black uppercase"><PlusCircle size={14}/> 添加硬件项</button>
                            </div>
                            <div className="space-y-3">
                                {configRows.map(row => (
                                    <div key={row} className="flex items-center gap-4 bg-slate-50/50 p-2 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all group">
                                        <div className="w-24 relative">
                                            <select value={selectedItems[row]?.category} onChange={e => setSelectedItems({...selectedItems, [row]: { ...selectedItems[row], category: e.target.value }})} className="w-full bg-transparent border-none text-[10px] font-black uppercase text-slate-400 outline-none pl-2 appearance-none">{CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                        </div>
                                        <select value={selectedItems[row]?.model || ''} onChange={e => setSelectedItems({...selectedItems, [row]: { ...selectedItems[row], model: e.target.value, qty: selectedItems[row]?.qty || 1 }})} className="flex-1 bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-black text-slate-700 outline-none focus:border-brand appearance-none shadow-inner">
                                            <option value="">-- 未选定配件 --</option>
                                            {partsLibrary.filter(p => p.category === selectedItems[row]?.category).map(m => <option key={m.id} value={m.model}>{m.model} (¥{m.price})</option>)}
                                        </select>
                                        <div className="w-20">
                                            <input type="number" placeholder="数量" value={selectedItems[row]?.qty || ''} onChange={e => setSelectedItems({...selectedItems, [row]: { ...selectedItems[row], qty: parseInt(e.target.value) || 0 }})} className="w-full bg-white border border-slate-100 rounded-xl px-2 py-2.5 text-xs font-black text-center text-slate-800 outline-none" />
                                        </div>
                                        <button onClick={() => removeRow(row)} className="p-2 text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><MinusCircle size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-100 space-y-6 relative z-10">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><DollarSign size={16} className="text-brand" /> 3. 商务优惠配置</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">折扣套餐选择</label>
                                    <div className="relative">
                                        <select value={selectedDiscountIndex} onChange={e => setSelectedDiscountIndex(parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-black text-slate-700 outline-none focus:border-brand appearance-none shadow-inner"><option value="-1">-- 无折扣套餐 --</option>{quotingData.discounts.map((d, i) => (<option key={i} value={i}>满 {d.min_qty} 件 / {d.rate} 折</option>))}</select>
                                        <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">订单立减金额 (CNY)</label>
                                    <input type="number" placeholder="0.00" value={immediateDiscount || ''} onChange={e => setImmediateDiscount(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-black text-slate-700 outline-none focus:border-brand shadow-inner" />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-6">
                            <button onClick={() => { setSelectedItems({}); setNlpInput(''); setResults(null); setImmediateDiscount(0); setSelectedDiscountIndex(-1); }} className="px-8 py-4 rounded-2xl bg-slate-100 text-slate-500 font-black text-xs hover:bg-slate-200 transition-all uppercase tracking-widest"><RotateCcw size={16}/></button>
                            <button onClick={calculate} className="flex-1 py-4 rounded-2xl bg-brand text-white font-black text-sm hover:bg-[#5da035] shadow-2xl shadow-brand/20 transition-all active:scale-95 uppercase tracking-[0.2em] flex items-center justify-center gap-3"><Calculator size={20}/> 生成报价</button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-5 h-full">
                    <div className="bg-white rounded-[48px] p-10 h-full min-h-[600px] flex flex-col text-slate-900 shadow-xl border border-slate-100 relative overflow-hidden group/result">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-[100px] -translate-y-1/3 translate-x-1/3 pointer-events-none"></div>
                        <div className="flex items-center gap-4 mb-12 relative z-10 border-b border-slate-50 pb-8">
                             <div className="w-14 h-14 rounded-3xl bg-brand/5 border border-brand/10 flex items-center justify-center text-brand"><FileSpreadsheet size={28} /></div>
                             <div><h3 className="text-xl font-black tracking-tight uppercase">报价核对</h3><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Physical Pricing Manifest</p></div>
                        </div>

                        <div className="flex-1 relative z-10 flex flex-col">
                            {results ? (
                                <div className="space-y-10 animate-fadeIn flex flex-col h-full">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">建议零售价 (战略进位后)</p>
                                        <div className="flex flex-col gap-2">
                                            <span className="text-7xl font-black tabular-nums tracking-tighter text-slate-900">¥{results.final.toLocaleString()}</span>
                                            <div className="flex gap-2">
                                                {results.discountApplied < 1 && (<span className="text-rose-500 text-[10px] font-black uppercase bg-rose-50 px-2 py-1 rounded border border-rose-100">套餐 {(results.discountApplied * 10).toFixed(1)} 折</span>)}
                                                {results.subtraction > 0 && (<span className="text-blue-500 text-[10px] font-black uppercase bg-blue-50 px-2 py-1 rounded border border-blue-100">已立减 ¥{results.subtraction}</span>)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-[32px] p-8 border border-slate-100 flex-1 overflow-y-auto no-scrollbar shadow-inner">
                                        <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2"><Layers size={14} className="text-brand" /> 物理资产组装清单</h4>
                                        <div className="space-y-4">
                                            {results.configList.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center border-b border-slate-100 pb-3">
                                                    <div className="min-w-0"><p className="text-[8px] font-black text-brand uppercase">{item.cat}</p><p className="text-xs font-bold text-slate-800 truncate">{item.model}</p></div>
                                                    <div className="text-right"><p className="text-xs font-mono font-black text-slate-900">x{item.qty}</p><p className="text-[9px] text-slate-400 font-bold">¥{item.price.toLocaleString()}</p></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="pt-8 border-t border-slate-100 space-y-8">
                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase">总硬成本</p><p className="text-xl font-mono font-black text-slate-600">¥{results.cost.toLocaleString()}</p></div>
                                            <div className="space-y-1 text-right"><p className="text-[9px] font-black text-slate-400 uppercase">预估纯毛利</p><p className="text-xl font-black text-brand">¥{(results.final - results.cost).toLocaleString()}</p></div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => { navigator.clipboard.writeText(results.configList.map(i => `${i.cat}: ${i.model} x${i.qty}`).join('\n') + `\n总价: ¥${results.final}`); addToast('success', '已复制', '报价单文本已存入剪贴板。'); }} className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-xs hover:bg-slate-50 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"><Clipboard size={14}/> 复制文本</button>
                                            <button className="px-10 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs hover:bg-black shadow-xl shadow-slate-200 transition-all active:scale-95 uppercase tracking-widest flex items-center gap-2"><Download size={14}/> 导出报价单</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-6 opacity-40">
                                    <div className="w-24 h-24 rounded-[40px] border border-dashed border-slate-300 flex items-center justify-center"><Calculator size={48} /></div>
                                    <p className="text-xs font-black uppercase tracking-[0.4em]">Ready to calc price</p>
                                    <p className="text-[10px] text-center leading-relaxed font-bold">挂载左侧配件清单并生成报价，<br/>算法将生成高密度的利润审计报告。</p>
                                </div>
                            )}
                        </div>
                        <div className="mt-8 pt-6 border-t border-slate-50 flex justify-between items-center relative z-10 shrink-0">
                             <div className="flex items-center gap-2"><Sparkles size={14} className="text-brand animate-pulse"/><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Neural Pricing Active</p></div>
                             <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">Yunzhou Intelligence Hub</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
