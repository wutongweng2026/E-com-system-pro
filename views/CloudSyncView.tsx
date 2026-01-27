
import React, { useState, useEffect } from 'react';
import { CloudSync, Download, UploadCloud, ShieldCheck, AlertCircle, RefreshCw, Database, Settings2, Code2, Copy, CheckCircle2, Activity, Terminal, Loader2 } from 'lucide-react';
import { DB } from '../lib/db';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = "https://stycaaqvjbjnactxcvyh.supabase.co";
const DEFAULT_KEY = "sb_publishable_m4yyJRlDY107a3Nkx6Pybw_6Mdvxazn";

export const CloudSyncView = ({ addToast }: any) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [autoSync, setAutoSync] = useState(false);
    const [showSql, setShowSql] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

    // 进度追踪状态
    const [syncProgress, setSyncProgress] = useState(0);
    const [syncStatus, setSyncStatus] = useState('');

    useEffect(() => {
        const loadSettings = async () => {
            const config = await DB.loadConfig('cloud_sync_config', { 
                url: DEFAULT_URL, 
                key: DEFAULT_KEY, 
                lastSync: null,
                autoSync: true 
            });
            setSupabaseUrl(config.url);
            setSupabaseKey(config.key);
            setLastSync(config.lastSync);
            setAutoSync(config.autoSync);
        };
        loadSettings();
    }, []);

    const saveSettings = async () => {
        await DB.saveConfig('cloud_sync_config', { 
            url: supabaseUrl, 
            key: supabaseKey, 
            lastSync,
            autoSync 
        });
        addToast('success', '配置已保存', '同步引擎参数已更新。');
        setConnectionStatus('idle');
    };

    const testConnection = async () => {
        if (!supabaseUrl || !supabaseKey) return;
        setConnectionStatus('testing');
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { error } = await supabase.from('app_config').select('key').limit(1);
            if (error) {
                if (error.code === '42P01') throw new Error("云端数据库尚未初始化。请执行下方的 SQL 脚本。");
                throw error;
            }
            setConnectionStatus('success');
            addToast('success', '连接测试成功', '云端数据库响应正常。');
        } catch (e: any) {
            setConnectionStatus('error');
            addToast('error', '连接失败', e.message);
        }
    };

    const handleCloudPush = async () => {
        if (!supabaseUrl || !supabaseKey) {
            addToast('error', '同步失败', '请先配置 Supabase 参数。');
            return;
        }
        
        setIsProcessing(true);
        setSyncProgress(0);
        setSyncStatus('正在扫描物理链路资产...');
        
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            // 核心物理事实表
            const tablesToSync = [
                { local: 'fact_shangzhi', remote: 'fact_shangzhi', conflict: 'date,sku_code', label: '商智销售明细' },
                { local: 'fact_jingzhuntong', remote: 'fact_jingzhuntong', conflict: 'date,tracked_sku_id,account_nickname', label: '广告投放明细' },
                { local: 'fact_customer_service', remote: 'fact_customer_service', conflict: 'date,agent_account', label: '客服接待明细' }
            ];
            
            let totalRowsToSync = 0;
            const tableDataMap: Record<string, any[]> = {};
            for (const table of tablesToSync) {
                const data = await DB.getTableRows(table.local);
                tableDataMap[table.local] = data;
                totalRowsToSync += data.length;
            }

            // 同步 app_config 中的所有维度
            const configData = await DB.getAllConfigs();
            const configEntries = Object.entries(configData)
                .filter(([key]) => !['cloud_sync_config', 'dim_viki_kb', 'dim_quoting_library'].includes(key))
                .map(([key, data]) => ({ key, data }));
            
            totalRowsToSync += configEntries.length;

            if (totalRowsToSync === 0) {
                setSyncStatus('未检测到本地待同步数据。');
                setIsProcessing(false);
                return;
            }

            let processedRows = 0;

            // 1. 同步事实流水
            for (const table of tablesToSync) {
                const localData = tableDataMap[table.local];
                if (localData.length === 0) continue;

                const cleanData = localData.map(({ id, created_at, ...rest }: any) => {
                    if (rest.date instanceof Date) rest.date = rest.date.toISOString().split('T')[0];
                    Object.keys(rest).forEach(key => { if (rest[key] === undefined) rest[key] = null; });
                    return rest;
                });

                const CHUNK_SIZE = 400; 
                for (let i = 0; i < cleanData.length; i += CHUNK_SIZE) {
                    const chunk = cleanData.slice(i, i + CHUNK_SIZE);
                    setSyncStatus(`推送 ${table.label}: ${i} / ${localData.length}`);
                    const { error } = await supabase.from(table.remote).upsert(chunk, { onConflict: table.conflict });
                    if (error) throw new Error(`[${table.remote}] 写入失败: ${error.message}`);
                    processedRows += chunk.length;
                    setSyncProgress(Math.floor((processedRows / totalRowsToSync) * 100));
                }
            }

            // 2. 同步战略配置项
            if (configEntries.length > 0) {
                setSyncStatus('同步战略配置项...');
                const { error: configError } = await supabase.from('app_config').upsert(configEntries, { onConflict: 'key' });
                if (configError) throw configError;
                processedRows += configEntries.length;
                setSyncProgress(100);
            }

            const now = new Date().toLocaleString();
            setLastSync(now);
            setSyncStatus('云端链路已对齐');
            await DB.saveConfig('cloud_sync_config', { url: supabaseUrl, key: supabaseKey, lastSync: now, autoSync });
            addToast('success', '全量同步成功', `已在云端还原 ${totalRowsToSync} 条经营资产。`);
        } catch (e: any) {
            console.error(e);
            setSyncStatus(`同步中断: ${e.message}`);
            addToast('error', '物理推送失败', e.message);
        } finally {
            setTimeout(() => { setIsProcessing(false); setSyncProgress(0); setSyncStatus(''); }, 2000);
        }
    };

    const handleCloudPull = async () => {
        setIsProcessing(true);
        setSyncStatus('正在从云端拉取全量镜像...');
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            // 拉取配置项
            const { data: configs, error: configError } = await supabase.from('app_config').select('*');
            if (configError) throw configError;
            if (configs) {
                for (const item of configs) {
                    await DB.saveConfig(item.key, item.data);
                }
            }

            // 拉取流水事实
            const factTables = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service'];
            for (const table of factTables) {
                const { data, error } = await supabase.from(table).select('*');
                if (error) throw error;
                if (data && data.length > 0) await DB.bulkAdd(table, data);
            }
            
            addToast('success', '拉取成功', '异地战略资产已就绪，系统正在重载物理空间。');
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            addToast('error', '拉取失败', e.message);
        } finally {
            setIsProcessing(false);
            setSyncStatus('');
        }
    };

    const sqlScript = `-- 云舟 E-com System 完整物理层初始化脚本
-- 必须在 Supabase SQL Editor 中执行一次

-- 1. 核心战略配置表
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. VIKI 云端共享知识库
CREATE TABLE IF NOT EXISTS dim_viki_kb (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  usage_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 智能报价共享配件库
CREATE TABLE IF NOT EXISTS dim_quoting_library (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  model TEXT NOT NULL,
  price NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. 商智销售明细表
CREATE TABLE IF NOT EXISTS fact_shangzhi (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  sku_code TEXT NOT NULL,
  product_name TEXT,
  brand TEXT,
  category_l1 TEXT,
  category_l2 TEXT,
  category_l3 TEXT,
  shop_name TEXT,
  business_mode TEXT,
  pv INTEGER,
  uv INTEGER,
  paid_amount NUMERIC,
  paid_items INTEGER,
  paid_users INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, sku_code)
);

-- 5. 京准通广告明细表
CREATE TABLE IF NOT EXISTS fact_jingzhuntong (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  account_nickname TEXT,
  tracked_sku_id TEXT NOT NULL,
  cost NUMERIC,
  clicks INTEGER,
  impressions INTEGER,
  total_order_amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, tracked_sku_id, account_nickname)
);

-- 6. 客服统计明细表
CREATE TABLE IF NOT EXISTS fact_customer_service (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  agent_account TEXT NOT NULL,
  chats INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, agent_account)
);

-- 权限开放
ALTER TABLE app_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE dim_viki_kb DISABLE ROW LEVEL SECURITY;
ALTER TABLE dim_quoting_library DISABLE ROW LEVEL SECURITY;
ALTER TABLE fact_shangzhi DISABLE ROW LEVEL SECURITY;
ALTER TABLE fact_jingzhuntong DISABLE ROW LEVEL SECURITY;
ALTER TABLE fact_customer_service DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';`;

    return (
        <div className="p-8 md:p-10 w-full animate-fadeIn space-y-8 pb-20">
            {/* Standardized Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-brand animate-pulse"></div>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">物理链路云端同步就绪</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">异地同步中心</h1>
                    <p className="text-slate-500 font-medium text-xs mt-1 italic">Cross-Device Strategic Sync & Cloud Persistence</p>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest ${
                    connectionStatus === 'success' ? 'bg-green-50 border-green-200 text-green-600' :
                    connectionStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-600' :
                    'bg-slate-50 border-slate-200 text-slate-400'
                }`}>
                    <Activity size={12} className={connectionStatus === 'testing' ? 'animate-pulse' : ''} />
                    云端状态: {
                        connectionStatus === 'testing' ? '测试中...' :
                        connectionStatus === 'success' ? '连接成功' :
                        connectionStatus === 'error' ? '需初始化' : '待测试'
                    }
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <Settings2 size={20} className="text-[#70AD47]" />
                            同步参数配置
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Supabase API URL</label>
                                <input type="text" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="https://xxx.supabase.co" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-[#70AD47]" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Anon Key / Service Role</label>
                                <input type="password" value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-[#70AD47]" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={saveSettings} className="flex-1 py-3 rounded-xl bg-slate-800 text-white font-black text-xs hover:bg-slate-700 transition-all">保存配置</button>
                                <button onClick={testConnection} className="px-6 py-3 rounded-xl border-2 border-slate-800 text-slate-800 font-black text-xs hover:bg-slate-50 transition-all">连接测试</button>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 bg-[#0F172A] rounded-[32px] text-white border border-brand/20">
                        <div className="flex items-center gap-2 mb-4 text-[#70AD47]">
                            <Terminal size={18} />
                            <h4 className="text-sm font-black uppercase tracking-wider">初始化云数据库</h4>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-6">
                            API 不具备建表权限。请点击下方按钮复制 SQL 并在 Supabase 网站的 SQL Editor 中点击 Run 执行。
                        </p>
                        <button onClick={() => setShowSql(!showSql)} className="w-full py-3 bg-[#70AD47] rounded-xl text-[11px] font-black text-white hover:bg-[#5da035] transition-all shadow-lg shadow-[#70AD47]/20">
                            {showSql ? '隐藏 SQL 脚本' : '查看并复制脚本'}
                        </button>
                        
                        {showSql && (
                            <div className="mt-4 bg-slate-800 rounded-2xl p-4 relative animate-slideIn">
                                <pre className="text-[9px] text-slate-300 font-mono overflow-x-auto max-h-[250px] leading-relaxed no-scrollbar">
                                    {sqlScript}
                                </pre>
                                <button onClick={() => { navigator.clipboard.writeText(sqlScript); addToast('success', '复制成功', '请在 Supabase 后台运行。'); }} className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
                                    <Copy size={14} className="text-white"/>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-8 space-y-8">
                    <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#70AD47]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <div className="relative z-10 space-y-6">
                            <h3 className="text-4xl font-black text-slate-900 tracking-tight">异地同步引擎</h3>
                            <p className="text-slate-500 text-sm font-bold leading-relaxed max-w-xl">
                                点击推送将本地所有“经营数据”与“补货/竞品策略”保存至云端；在 PyCharm 或另一台电脑点击拉取即可瞬间恢复。
                                <br/><span className="text-brand">注：VIKI 知识库与报价配件库现已实现实时云端存储，无需手动同步。</span>
                            </p>
                            
                            {isProcessing && (
                                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-4 animate-fadeIn">
                                    <div className="flex justify-between items-end">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">物理链路处理中</p>
                                            <p className="text-xs font-bold text-slate-700 flex items-center gap-2"><Loader2 size={12} className="animate-spin text-[#70AD47]" /> {syncStatus}</p>
                                        </div>
                                        <p className="text-xl font-black text-[#70AD47]">{syncProgress}%</p>
                                    </div>
                                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#70AD47] transition-all duration-500 ease-out shadow-[0_0_12px_rgba(112,173,71,0.4)]" style={{ width: `${syncProgress}%` }}></div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-4 pt-4">
                                <button onClick={handleCloudPush} disabled={isProcessing} className="px-10 py-5 rounded-[20px] bg-[#70AD47] text-white font-black text-sm flex items-center gap-3 hover:bg-[#5da035] shadow-2xl shadow-[#70AD47]/30 active:scale-95 disabled:bg-slate-200 transition-all uppercase tracking-widest">
                                    {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                                    同步经营流水 (Push)
                                </button>
                                <button onClick={handleCloudPull} disabled={isProcessing} className="px-10 py-5 rounded-[20px] bg-white text-slate-600 border border-slate-200 font-black text-sm flex items-center gap-3 hover:bg-slate-50 transition-all active:scale-95 uppercase tracking-widest">
                                    从云端恢复镜像 (Pull)
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 group">
                            <Activity size={24} className="text-[#70AD47] mb-6 group-hover:scale-110 transition-transform" />
                            <h4 className="text-lg font-black text-slate-800">上次同步状态</h4>
                            <div className="mt-4 space-y-2">
                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">时间:</span><span className="text-slate-700">{lastSync || '从未同步'}</span></div>
                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">状态:</span><span className="text-green-600 font-black">云端战略对齐</span></div>
                            </div>
                        </div>
                        <div className="p-8 bg-blue-600 rounded-[32px] text-white shadow-xl shadow-blue-100">
                             <ShieldCheck size={24} className="mb-6 opacity-80" />
                             <h4 className="text-lg font-black">异地协作安全</h4>
                             <p className="mt-4 text-blue-50 text-[11px] font-bold leading-relaxed opacity-80">
                                同步数据仅存储在您私人的 Supabase。支持在 PyCharm 中直连 PostgreSQL 进行高级 SQL 查询，方便您二次开发。
                             </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
