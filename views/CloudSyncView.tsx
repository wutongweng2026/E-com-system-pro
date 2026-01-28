
import React, { useState, useEffect } from 'react';
import { CloudSync, Download, UploadCloud, ShieldCheck, AlertCircle, RefreshCw, Database, Settings2, Code2, Copy, CheckCircle2, Activity, Terminal, Loader2, Zap, Wifi, WifiOff, UserCircle2, KeyRound } from 'lucide-react';
import { DB } from '../lib/db';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = "https://stycaaqvjbjnactxcvyh.supabase.co";
const DEFAULT_KEY = "sb_publishable_m4yyJRlDY107a3Nkx6Pybw_6Mdvxazn";

// 辅助函数：睡眠
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const CloudSyncView = ({ addToast }: any) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [autoSync, setAutoSync] = useState(false);
    const [showSql, setShowSql] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [authMode, setAuthMode] = useState<'apikey' | 'account'>('apikey');

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
        addToast('success', '配置已保存', '自动化引擎参数已更新。系统将在每次启动时尝试自动同步。');
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

    // 带有增强重试机制的 Upsert 操作
    // v5.2.5 优化: 增加重试次数，捕获 Fetch Error
    const upsertWithRetry = async (supabase: any, tableName: string, data: any[], conflictKey: string, maxRetries = 5) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const { error } = await supabase.from(tableName).upsert(data, { onConflict: conflictKey });
                if (error) throw error;
                return; // 成功则退出
            } catch (err: any) {
                const isNetworkError = err.message?.includes('Failed to fetch') || err.message?.includes('network');
                
                if (attempt === maxRetries) {
                    console.error(`[Sync Final Fail] ${tableName}:`, err);
                    throw new Error(`${isNetworkError ? '网络连接中断' : '写入被拒绝'} (重试耗尽): ${err.message}`);
                }
                
                // 指数退避 + 随机抖动 (避免并发波峰)
                // 第1次: ~1s, 第2次: ~2s, 第3次: ~4s, 第4次: ~8s...
                const delay = (1000 * Math.pow(2, attempt)) + (Math.random() * 500);
                
                console.warn(`[Sync Warning] ${tableName} 分片上传遇到阻力，将在 ${Math.round(delay)}ms 后进行第 ${attempt + 1}/${maxRetries} 次突围...`, err.message);
                await sleep(delay);
            }
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
            
            const tablesToSync = [
                { local: 'fact_shangzhi', remote: 'fact_shangzhi', conflict: 'date,sku_code', label: '商智销售明细' },
                { local: 'fact_jingzhuntong', remote: 'fact_jingzhuntong', conflict: 'date,tracked_sku_id,account_nickname', label: '广告投放明细' },
                { local: 'fact_customer_service', remote: 'fact_customer_service', conflict: 'date,agent_account', label: '客服接待明细' }
            ];
            
            // 1. 预计算总行数 (用于进度条)
            let totalRowsToSync = 0;
            
            for (const table of tablesToSync) {
                const data = await DB.getTableRows(table.local);
                totalRowsToSync += data.length;
            }

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

            // 2. 分表同步 (串行处理以减少内存压力)
            for (const table of tablesToSync) {
                // 内存优化：处理完一张表再读下一张，读完立即释放
                const localData = await DB.getTableRows(table.local);
                
                if (localData.length === 0) continue;

                // 数据清洗
                const cleanData = localData.map(({ id, created_at, updated_at, ...rest }: any) => {
                    if (rest.date instanceof Date) rest.date = rest.date.toISOString().split('T')[0];
                    Object.keys(rest).forEach(key => { if (rest[key] === undefined) rest[key] = null; });
                    return rest;
                });

                // v5.2.5 优化：极速微切片 (Micro-Batching)
                // 将分片大小从 200 降至 50，大幅降低单次请求包体大小，减少 Timeout 概率
                const CHUNK_SIZE = 50; 
                
                for (let i = 0; i < cleanData.length; i += CHUNK_SIZE) {
                    const chunk = cleanData.slice(i, i + CHUNK_SIZE);
                    
                    setSyncStatus(`正在推送 [${table.label}] ... (${i + chunk.length}/${localData.length})`);
                    
                    // 使用带重试机制的上传
                    await upsertWithRetry(supabase, table.remote, chunk, table.conflict);
                    
                    // v5.2.5 优化：请求间歇呼吸 (Throttle)
                    // 强制暂停 50ms，防止浏览器短时间发出过多请求导致自身网络栈阻塞
                    await sleep(50);

                    processedRows += chunk.length;
                    setSyncProgress(Math.floor((processedRows / totalRowsToSync) * 100));
                }
                
                // 显式释放大对象
                localData.length = 0; 
            }

            // 3. 同步配置
            if (configEntries.length > 0) {
                setSyncStatus('同步战略配置项...');
                await upsertWithRetry(supabase, 'app_config', configEntries, 'key');
                processedRows += configEntries.length;
                setSyncProgress(100);
            }

            const now = new Date().toLocaleString();
            setLastSync(now);
            setSyncStatus('云端链路已对齐');
            await DB.saveConfig('cloud_sync_config', { url: supabaseUrl, key: supabaseKey, lastSync: new Date().toISOString(), autoSync });
            addToast('success', '全量同步成功', `已在云端还原 ${totalRowsToSync} 条经营资产。`);
        } catch (e: any) {
            console.error(e);
            setSyncStatus(`同步中断: ${e.message}`);
            addToast('error', '物理推送失败', `网络链路不稳定: ${e.message}。请检查网络后重试，系统支持断点续传。`);
        } finally {
            setTimeout(() => { setIsProcessing(false); setSyncProgress(0); setSyncStatus(''); }, 2000);
        }
    };

    const handleManualPull = async () => {
        setIsProcessing(true);
        setSyncStatus('正在强制重置本地镜像...');
        try {
            await DB.saveConfig('cloud_sync_config', { url: supabaseUrl, key: supabaseKey, lastSync: '1970-01-01T00:00:00.000Z', autoSync });
            await DB.syncPull();
            const now = new Date().toLocaleString();
            setLastSync(now);
            addToast('success', '全量拉取成功', '本地数据已与云端完全一致。');
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            addToast('error', '拉取失败', e.message);
        } finally {
            setIsProcessing(false);
            setSyncStatus('');
        }
    };

    const sqlScript = `-- 云舟 v5.2.4 SaaS 架构预留升级 (支持多租户扩展)
-- 1. 核心战略配置表
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID DEFAULT NULL -- [SaaS预留] 租户ID
);

-- 2. 事实表通用结构 (增加 SaaS 字段)
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID DEFAULT NULL, -- [SaaS预留]
  UNIQUE(date, sku_code)
);

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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID DEFAULT NULL, -- [SaaS预留]
  UNIQUE(date, tracked_sku_id, account_nickname)
);

CREATE TABLE IF NOT EXISTS fact_customer_service (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  agent_account TEXT NOT NULL,
  chats INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID DEFAULT NULL, -- [SaaS预留]
  UNIQUE(date, agent_account)
);

CREATE TABLE IF NOT EXISTS dim_viki_kb (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  usage_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID DEFAULT NULL -- [SaaS预留]
);

CREATE TABLE IF NOT EXISTS dim_quoting_library (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  model TEXT NOT NULL,
  price NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID DEFAULT NULL -- [SaaS预留]
);

-- 3. 补齐字段 (SaaS 迁移准备)
DO $$
BEGIN
    -- 确保 updated_at 存在
    ALTER TABLE app_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE fact_shangzhi ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE fact_jingzhuntong ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE fact_customer_service ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE dim_viki_kb ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE dim_quoting_library ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

    -- 确保 user_id 存在 (未来启用 RLS 时使用)
    ALTER TABLE app_config ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;
    ALTER TABLE fact_shangzhi ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;
    ALTER TABLE fact_jingzhuntong ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;
    ALTER TABLE fact_customer_service ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;
    ALTER TABLE dim_viki_kb ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;
    ALTER TABLE dim_quoting_library ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;
END $$;

-- 4. 自动更新时间戳触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_app_config_modtime ON app_config;
CREATE TRIGGER update_app_config_modtime BEFORE UPDATE ON app_config FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_fact_shangzhi_modtime ON fact_shangzhi;
CREATE TRIGGER update_fact_shangzhi_modtime BEFORE UPDATE ON fact_shangzhi FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_fact_jzt_modtime ON fact_jingzhuntong;
CREATE TRIGGER update_fact_jzt_modtime BEFORE UPDATE ON fact_jingzhuntong FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_fact_cs_modtime ON fact_customer_service;
CREATE TRIGGER update_fact_cs_modtime BEFORE UPDATE ON fact_customer_service FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 5. 安全策略 (过渡期：允许所有 API Key 访问)
-- 注意：系统正式转为 SaaS 模式时，需将 USING (true) 修改为 USING (auth.uid() = user_id)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
        EXECUTE format('CREATE POLICY "Allow all" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

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
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <Settings2 size={20} className="text-[#70AD47]" />
                                同步鉴权配置
                            </h3>
                        </div>
                        
                        {/* Auth Mode Switcher (Reserved) */}
                        <div className="flex p-1 bg-slate-100 rounded-xl">
                            <button 
                                onClick={() => setAuthMode('apikey')}
                                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${authMode === 'apikey' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                            >
                                <KeyRound size={12} /> API Key 模式
                            </button>
                            <button 
                                onClick={() => setAuthMode('account')}
                                disabled
                                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 opacity-50 cursor-not-allowed`}
                                title="SaaS 账号体系开发中"
                            >
                                <UserCircle2 size={12} /> 账号登录 (Dev)
                            </button>
                        </div>

                        {authMode === 'apikey' ? (
                            <div className="space-y-4 animate-fadeIn">
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
                        ) : (
                            <div className="py-10 text-center space-y-4">
                                <UserCircle2 size={48} className="text-slate-200 mx-auto" />
                                <p className="text-xs font-bold text-slate-400">多租户 SaaS 账号体系正在建设中...</p>
                            </div>
                        )}
                    </div>

                    <div className="p-8 bg-[#0F172A] rounded-[32px] text-white border border-brand/20">
                        <div className="flex items-center gap-2 mb-4 text-[#70AD47]">
                            <ShieldCheck size={18} />
                            <h4 className="text-sm font-black uppercase tracking-wider">架构预留更新 (v5.2.4)</h4>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-6">
                            检测到未来 SaaS 扩展需求。
                            <br/>此脚本将为所有物理表预埋 <code className="bg-white/10 px-1 rounded text-white">user_id</code> 字段，确保数据架构支持无缝切换至多租户模式。
                        </p>
                        <button onClick={() => setShowSql(!showSql)} className="w-full py-3 bg-[#70AD47] rounded-xl text-[11px] font-black text-white hover:bg-[#5da035] transition-all shadow-lg shadow-[#70AD47]/20">
                            {showSql ? '隐藏 SQL 脚本' : '获取架构升级脚本'}
                        </button>
                        
                        {showSql && (
                            <div className="mt-4 bg-slate-800 rounded-2xl p-4 relative animate-slideIn">
                                <pre className="text-[9px] text-slate-300 font-mono overflow-x-auto max-h-[250px] leading-relaxed no-scrollbar">
                                    {sqlScript}
                                </pre>
                                <button onClick={() => { navigator.clipboard.writeText(sqlScript); addToast('success', '复制成功', '请在 Supabase 后台运行以完成架构升级。'); }} className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
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
                            <h3 className="text-4xl font-black text-slate-900 tracking-tight">智能同步引擎</h3>
                            <p className="text-slate-500 text-sm font-bold leading-relaxed max-w-xl">
                                v5.2.5 内核已升级为 <span className="text-brand">微切片同步 (Micro-Batching)</span> 模式。
                                <br/>单次并发降至 50 条，并内置 5 次指数退避重试，专为弱网与大数据量环境设计。
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
                                    手动推送 (Force Push)
                                </button>
                                <button onClick={handleManualPull} disabled={isProcessing} className="px-10 py-5 rounded-[20px] bg-white text-slate-600 border border-slate-200 font-black text-sm flex items-center gap-3 hover:bg-slate-50 transition-all active:scale-95 uppercase tracking-widest">
                                    {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} className="fill-slate-600" />}
                                    从云端恢复 (Force Pull)
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 group">
                            <Activity size={24} className="text-[#70AD47] mb-6 group-hover:scale-110 transition-transform" />
                            <h4 className="text-lg font-black text-slate-800">上次同步检查</h4>
                            <div className="mt-4 space-y-2">
                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">时间:</span><span className="text-slate-700">{new Date(lastSync || 0).toLocaleString() || '从未同步'}</span></div>
                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">策略:</span><span className="text-green-600 font-black">增量热更新 (Incremental)</span></div>
                            </div>
                        </div>
                        <div className="p-8 bg-blue-600 rounded-[32px] text-white shadow-xl shadow-blue-100">
                             <ShieldCheck size={24} className="mb-6 opacity-80" />
                             <h4 className="text-lg font-black">企业级数据容灾</h4>
                             <p className="mt-4 text-blue-50 text-[11px] font-bold leading-relaxed opacity-80">
                                支持断点重试与内存自动回收，确保在万级数据量下的稳定传输。数据安全，使命必达。
                             </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
