
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MessageCircle, Bot, ChevronDown, Sparkles, LoaderCircle, AlertCircle, Clipboard, UserCircle, ShieldCheck, Brain, Search, Plus, Trash2, Edit3, UploadCloud, Download, BookOpen, Send, X, CheckCircle2, Zap, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { ProductSKU, Shop, KnowledgeBaseItem } from '../lib/types';
import { GoogleGenAI } from "@google/genai";
import { DB } from '../lib/db';
import { parseExcelFile } from '../lib/excel';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

export const AIAssistantView = ({ skus, shops, addToast }: { skus: ProductSKU[], shops: Shop[], addToast: any }) => {
    // 基础状态
    const [activeTab, setActiveTab] = useState<'chat' | 'viki'>('chat');
    const [selectedSkuId, setSelectedSkuId] = useState<string>('');
    
    // 云端同步配置
    const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

    // 会话相关
    const [question, setQuestion] = useState('');
    const [chatResponse, setChatResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isVikiFound, setIsVikiFound] = useState(false);

    // VIKI 知识库相关
    const [vikiItems, setVikiItems] = useState<KnowledgeBaseItem[]>([]);
    const [vikiSearch, setVikiSearch] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<KnowledgeBaseItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 初始化 Supabase 客户端
    useEffect(() => {
        const initCloud = async () => {
            const config = await DB.loadConfig('cloud_sync_config', null);
            if (config && config.url && config.key) {
                const client = createClient(config.url, config.key);
                setSupabase(client);
                const { data, error } = await client.from('dim_viki_kb').select('*');
                if (!error && data) setVikiItems(data);
            }
        };
        initCloud();
    }, []);

    const refreshKb = async () => {
        if (!supabase) {
            addToast('error', '同步失败', '未配置云端同步参数。');
            return;
        }
        setIsLoading(true);
        const { data, error } = await supabase.from('dim_viki_kb').select('*');
        if (!error && data) {
            setVikiItems(data);
            addToast('success', '同步成功', '已从云端拉取最新 VIKI 记忆。');
        } else {
            addToast('error', '同步失败', '网络连接异常或 API Key 已失效。');
        }
        setIsLoading(false);
    };

    const saveToCloud = async (item: any) => {
        if (!supabase) {
            addToast('error', '未连接云端', '请先在“云端同步”页面配置 Supabase 参数。');
            return false;
        }
        const { error } = await supabase.from('dim_viki_kb').upsert(item);
        if (error) {
            addToast('error', '物理写入失败', '云端数据库连接超时。');
            return false;
        }
        await refreshKb();
        return true;
    };

    const deleteFromCloud = async (id: string) => {
        if (!supabase) {
            addToast('error', '删除失败', '云端引擎未就绪。');
            return;
        }
        const { error } = await supabase.from('dim_viki_kb').delete().eq('id', id);
        if (error) {
            addToast('error', '擦除失败', '无法同步删除操作至云端。');
        } else {
            await refreshKb();
            addToast('success', '物理擦除成功', '已从全局库同步移除。');
        }
    };

    const filteredViki = useMemo(() => {
        if (!vikiSearch) return vikiItems;
        const lower = vikiSearch.toLowerCase();
        return vikiItems.filter(i => 
            i.question.toLowerCase().includes(lower) || 
            i.answer.toLowerCase().includes(lower) ||
            i.category?.toLowerCase().includes(lower)
        );
    }, [vikiItems, vikiSearch]);

    const handleAsk = async () => {
        if (!question) return;
        setIsLoading(true);
        setChatResponse('');
        setIsVikiFound(false);
        try {
            const matchedViki = vikiItems.find(i => question.includes(i.question) || i.question.includes(question));
            let vikiContext = "";
            if (matchedViki) {
                vikiContext = `[VIKI 知识库事实匹配]: ${matchedViki.answer}`;
                setIsVikiFound(true);
            }
            const sku = skus.find(s => s.id === selectedSkuId);
            const shop = shops.find(sh => sh.id === sku?.shopId);
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const productContext = sku ? `当前商品: ${sku.name} (${sku.code})\n配置: ${sku.configuration}\n价格: ¥${sku.sellingPrice}\n店铺: ${shop?.name}` : '通用咨询';
            const prompt = `你现在是“云舟”金牌客服。参考背景: ${productContext}\n参考VIKI: ${vikiContext}\n提问: "${question}"\n回复要求: 礼貌、专业、严格遵循VIKI事实、简短直接。回复：`;
            const result = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
            setChatResponse(result.text || '');
        } catch (err: any) { addToast('error', '大脑离线', 'AI 神经模型响应超时，请检查网络。'); }
        finally { setIsLoading(false); }
    };

    const handleImportTemplate = () => {
        const headers = [['问题', '答案', '分类']];
        const ws = XLSX.utils.aoa_to_sheet(headers);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "VIKI导入模版");
        XLSX.writeFile(wb, "VIKI_Template.xlsx");
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!supabase) { addToast('error', '导入失败', '未配置云端数据库。'); return; }
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const { data } = parseExcelFile(evt.target?.result);
                const newItems = data.map((row: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    question: String(row['问题'] || ''),
                    answer: String(row['答案'] || ''),
                    category: String(row['分类'] || '通用')
                })).filter(i => i.question && i.answer);
                const { error } = await supabase.from('dim_viki_kb').upsert(newItems);
                if (error) throw error;
                await refreshKb();
                addToast('success', '同步成功', `已向云端注入 ${newItems.length} 条记忆。`);
            } catch (err: any) { addToast('error', '上传失败', '数据格式错误或云端响应超时。'); }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-10 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2"><div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div><span className="text-[10px] font-black text-brand uppercase tracking-widest leading-none text-brand/70">智能服务神经模型</span></div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">智能客服助手</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 opacity-60">Neural CS Copilot & Cloud VIKI Strategic Knowledge Base</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
                    <button onClick={() => setActiveTab('chat')} className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'chat' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}><MessageCircle size={14} /> 智能会话</button>
                    <button onClick={() => setActiveTab('viki')} className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'viki' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}><Brain size={14} /> VIKI 知识库</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {activeTab === 'chat' ? (
                    <>
                        <div className="lg:col-span-4 space-y-8">
                            <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 space-y-8 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                                <div className="space-y-4 relative z-10"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Zap size={14} className="text-brand" /> 1. 物理资产挂载</label><div className="relative"><select value={selectedSkuId} onChange={e => setSelectedSkuId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[24px] px-6 py-4 text-sm font-black text-slate-700 outline-none focus:border-brand appearance-none shadow-inner"><option value="">-- 通用问答模式 --</option>{skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                                <div className="p-6 bg-[#020617] rounded-[32px] text-white"><div className="flex items-center gap-2 mb-4 text-[#70AD47]"><ShieldCheck size={18} /><h4 className="text-xs font-black uppercase tracking-widest">共享审计开启</h4></div><p className="text-[10px] text-slate-400 font-medium leading-relaxed">客服大脑已集成云端对齐。您和其他席位的客服将共享同一个 VIKI 知识库，同步修改即时全域生效。</p></div>
                            </div>
                        </div>
                        <div className="lg:col-span-8 h-[650px] flex flex-col bg-white rounded-[48px] shadow-sm border border-slate-100 overflow-hidden relative">
                             <div className="flex-1 overflow-y-auto p-10 space-y-8 no-scrollbar relative z-10">
                                {chatResponse ? (<div className="flex gap-4 animate-fadeIn"><div className="w-10 h-10 rounded-2xl bg-brand flex items-center justify-center text-white shadow-lg shrink-0"><Bot size={24} /></div><div className="max-w-[85%] space-y-2"><div className="bg-white border border-slate-100 px-6 py-5 rounded-3xl rounded-tl-none text-[15px] font-bold text-slate-700 shadow-sm leading-loose">{chatResponse}{isVikiFound && (<div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-2"><span className="bg-brand/10 text-brand px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><Brain size={10} /> VIKI 记忆匹配</span></div>)}</div></div></div>) : (<div className="h-full flex flex-col items-center justify-center text-slate-200"><div className="w-24 h-24 rounded-[40px] bg-slate-50 flex items-center justify-center mb-6 border border-dashed border-slate-200"><MessageCircle size={48} /></div><p className="font-black text-sm uppercase tracking-[0.4em]">Ready to assist</p></div>)}
                             </div>
                             <div className="p-8 bg-white border-t border-slate-50 relative z-10"><div className="relative"><input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAsk()} placeholder="在此输入客户问题..." className="w-full bg-slate-50 border border-slate-200 rounded-[32px] pl-8 pr-40 py-6 text-sm font-black text-slate-800 outline-none focus:border-brand shadow-inner" /><button onClick={handleAsk} disabled={isLoading || !question} className="absolute right-3 top-3 bottom-3 px-10 rounded-[24px] bg-brand text-white font-black text-xs hover:bg-[#5da035] shadow-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-30 uppercase tracking-widest">{isLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} 建议回复</button></div></div>
                        </div>
                    </>
                ) : (
                    <div className="lg:col-span-12 space-y-10">
                        <div className="flex items-center justify-between">
                            <div className="p-8 rounded-[40px] bg-white border border-slate-100 shadow-sm flex items-center gap-6 h-32 w-80"><Cloud size={24} className="text-brand opacity-20" /><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">云端记忆</p><p className="text-3xl font-black text-slate-900 tracking-tight">{vikiItems.length} 条</p></div></div>
                            <div className="flex items-center gap-3">
                                <button onClick={refreshKb} className="px-6 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-500 font-black text-[11px] uppercase hover:bg-slate-50 transition-all flex items-center gap-2"><RefreshCw size={14} className={isLoading ? 'animate-spin' : ''}/> 拉取云端记忆</button>
                                <button onClick={handleImportTemplate} className="px-6 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-500 font-black text-[11px] uppercase hover:bg-slate-50 transition-all flex items-center gap-2"><Download size={14}/> 下载模版</button>
                                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-500 font-black text-[11px] uppercase hover:bg-slate-50 transition-all flex items-center gap-2"><UploadCloud size={14}/> 批量导入</button>
                                <button onClick={() => { setEditingItem(null); setIsAddModalOpen(true); }} className="px-10 py-3.5 rounded-xl bg-brand text-white font-black text-[11px] uppercase hover:bg-[#5da035] shadow-2xl transition-all flex items-center gap-2"><Plus size={16}/> 手动新增</button>
                                <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".xlsx,.xls" />
                            </div>
                        </div>
                        <div className="bg-white rounded-[48px] p-10 shadow-sm border border-slate-100 flex flex-col min-h-[500px]">
                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6 border-b border-slate-50 pb-8"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-brand"><BookOpen size={24} /></div><div><h3 className="font-black text-slate-800 text-lg tracking-tight uppercase">VIKI 共享战略记忆库</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Shared Global Knowledge Space</p></div></div><div className="relative"><Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" /><input placeholder="搜索问题或答案..." value={vikiSearch} onChange={e => setVikiSearch(e.target.value)} className="w-full md:w-80 bg-slate-50 border border-slate-200 rounded-[24px] pl-14 pr-6 py-4 text-xs font-black text-slate-700 outline-none focus:border-brand shadow-inner transition-all" /></div></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {filteredViki.map(item => (
                                    <div key={item.id} className="p-8 rounded-[40px] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-xl transition-all group relative"><div className="flex justify-between items-start mb-6"><span className="bg-white border border-slate-200 px-3 py-1 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.category || '通用'}</span><div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingItem(item); setIsAddModalOpen(true); }} className="p-2 text-slate-400 hover:text-brand"><Edit3 size={16}/></button><button onClick={() => deleteFromCloud(item.id)} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 size={16}/></button></div></div><div className="space-y-4"><p className="text-sm font-black text-slate-800">{item.question}</p><p className="text-xs font-bold text-slate-500 leading-loose">{item.answer}</p></div></div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isAddModalOpen && (
                <div className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fadeIn">
                    <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-xl p-10 border border-slate-200 relative"><button onClick={() => setIsAddModalOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-800"><X size={24}/></button><h3 className="text-xl font-black text-slate-900 mb-8 uppercase">{editingItem ? '编辑云端记忆' : '同步新记忆至云端'}</h3><div className="space-y-6"><input placeholder="分类" defaultValue={editingItem?.category} id="viki_cat" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 text-xs font-black outline-none focus:border-brand shadow-inner" /><input placeholder="问题 *" defaultValue={editingItem?.question} id="viki_q" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 text-xs font-black outline-none focus:border-brand shadow-inner" /><textarea placeholder="标准回复 *" defaultValue={editingItem?.answer} id="viki_a" className="w-full h-40 bg-slate-50 border border-slate-200 rounded-[32px] px-6 py-5 text-xs font-bold text-slate-700 outline-none focus:border-brand shadow-inner resize-none" /></div><div className="mt-10 pt-8 border-t border-slate-50 flex gap-4"><button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 rounded-2xl border border-slate-200 text-slate-500 font-black text-xs uppercase">取消</button><button onClick={async () => { const q = (document.getElementById('viki_q') as HTMLInputElement).value; const a = (document.getElementById('viki_a') as HTMLTextAreaElement).value; const c = (document.getElementById('viki_cat') as HTMLInputElement).value; if (!q || !a) return; const item = { id: editingItem?.id || Math.random().toString(36).substr(2, 9), question: q, answer: a, category: c || '通用' }; if (await saveToCloud(item)) setIsAddModalOpen(false); }} className="flex-[2] py-4 rounded-2xl bg-brand text-white font-black text-xs shadow-xl uppercase tracking-widest">执行云端同步</button></div></div>
                </div>
            )}
        </div>
    );
};
