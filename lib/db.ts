
/**
 * Advanced IndexedDB Wrapper with Real-time Cloud Sync (Hybrid Architecture)
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DB_NAME = 'ShujianDB';
const DB_VERSION = 3;

// 缓存 Supabase 客户端实例
let supabaseInstance: SupabaseClient | null = null;

export const DB = {
  getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        const factTables = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service'];
        factTables.forEach(tableName => {
          if (!db.objectStoreNames.contains(tableName)) {
            const store = db.createObjectStore(tableName, { keyPath: 'id', autoIncrement: true });
            store.createIndex('date', 'date', { unique: false });
            store.createIndex('sku_date', ['sku_code', 'date'], { unique: false });
          }
        });
        if (!db.objectStoreNames.contains('app_config')) {
          db.createObjectStore('app_config');
        }
      };
    });
  },

  // 获取云端客户端（带缓存）
  async getSupabase(): Promise<SupabaseClient | null> {
    if (supabaseInstance) return supabaseInstance;
    // 尝试从 IndexedDB 获取配置，如果失败则返回 null
    try {
        const config = await this.loadConfig('cloud_sync_config', null);
        if (config && config.url && config.key) {
          supabaseInstance = createClient(config.url, config.key);
          return supabaseInstance;
        }
    } catch(e) {
        return null;
    }
    return null;
  },

  // 核心：智能全量/增量自动拉取 (Auto-Pull Smart Sync)
  async syncPull(): Promise<boolean> {
    const supabase = await this.getSupabase();
    if (!supabase) return false;

    // 获取上次同步时间
    const syncConfig = await this.loadConfig('cloud_sync_config', { lastSync: '1970-01-01T00:00:00.000Z' });
    const lastSync = syncConfig.lastSync || '1970-01-01T00:00:00.000Z';
    const newSyncTime = new Date().toISOString();

    console.log(`☁️ 启动云端热同步，增量起点: ${lastSync}`);

    try {
      // 1. 同步配置项 (Metadata)
      // 配置表比较特殊，使用 updated_at 判断，若无则拉取所有
      const { data: configs } = await supabase.from('app_config').select('*').gt('updated_at', lastSync);
      if (configs && configs.length > 0) {
        console.log(`[Sync] 更新配置项: ${configs.length} 条`);
        for (const item of configs) {
          if (item.key !== 'cloud_sync_config') {
             // 写入本地，但不回推云端 (false)
             await this.saveConfig(item.key, item.data, false); 
          }
        }
      }

      // 2. 同步事实表 (Fact Tables) - 支持分页拉取海量数据
      const tables = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service'];
      
      for (const table of tables) {
          let hasMore = true;
          let page = 0;
          const pageSize = 1000;
          let totalPulled = 0;

          while (hasMore) {
              const { data, error } = await supabase
                  .from(table)
                  .select('*')
                  .gt('created_at', lastSync)
                  .range(page * pageSize, (page + 1) * pageSize - 1)
                  .order('created_at', { ascending: true }); // 按创建时间正序，保证数据连贯性

              if (error) {
                  console.error(`[Sync Error] Failed to fetch ${table}:`, error);
                  hasMore = false;
              } else if (data && data.length > 0) {
                  // 写入本地，禁用回推云端
                  await this.bulkAdd(table, data, false);
                  totalPulled += data.length;
                  
                  if (data.length < pageSize) {
                      hasMore = false; // 取不满说明是最后一页
                  } else {
                      page++;
                  }
              } else {
                  hasMore = false;
              }
          }
          if (totalPulled > 0) console.log(`[Sync] ${table}: 拉取并合并了 ${totalPulled} 条记录`);
      }

      // 3. 更新同步时间戳
      await this.saveConfig('cloud_sync_config', { ...syncConfig, lastSync: newSyncTime }, false);
      return true;
    } catch (e) {
      console.error("云端同步异常:", e);
      return false;
    }
  },

  // 核心：写入时自动推送到云端 (Write-Through)
  // 新增 syncToCloud 参数，默认为 true。当从云端拉取数据写入本地时，设为 false 防止死循环。
  async pushToCloud(tableName: string, data: any | any[], conflictKey?: string) {
    const supabase = await this.getSupabase();
    if (!supabase) return;

    // 异步执行，不阻塞 UI 响应
    setTimeout(async () => {
      try {
        const payload = Array.isArray(data) ? data : [data];
        // 清理 payload
        const cleanPayload = payload.map(({ id, ...rest }: any) => {
            // 注意：通常我们不上传本地自增 ID，让 Supabase 生成，或者如果本地 ID 有效则保留
            // 这里为了简化，我们上传除 id 外的所有字段，利用唯一键去重
            // 如果数据源包含 id 且需要保持一致，则保留 id
            // 为了安全，建议清理掉 undefined
            const clean = { ...rest }; 
            if (clean.date instanceof Date) clean.date = clean.date.toISOString().split('T')[0];
            return clean;
        });

        const { error } = await supabase.from(tableName).upsert(cleanPayload, { 
            onConflict: conflictKey || undefined
        });
        
        if (error) console.error(`[Cloud Push] Upload to ${tableName} failed:`, error.message);
        // else console.log(`[Cloud Push] Success: ${cleanPayload.length} rows -> ${tableName}`);
      } catch (e) {
        console.error(`[Cloud Push] Error pushing to ${tableName}:`, e);
      }
    }, 0);
  },

  async deleteRows(tableName: string, ids: any[]): Promise<void> {
    const db = await this.getDB();
    // Local Delete
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      ids.forEach(id => store.delete(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Cloud Delete
    const supabase = await this.getSupabase();
    if (supabase) {
        // 注意：本地删除通过 ID，云端 ID 可能不一致。
        // 如果我们没有同步 ID，这里删除可能会有问题。
        // 建议：对于物理事实数据，通常不建议硬删除，或者仅在本地维护清洗。
        // 如果必须删除，最好基于业务主键（如 date + sku_code）。
        // 目前暂且保留基于 ID 的删除逻辑，假设后续会完善 ID 同步机制。
        // 为了安全起见，这里仅打印日志，防止误删云端数据。
        console.warn("Local delete performed. Cloud delete skipped to prevent ID mismatch.");
    }
  },

  // 重构：支持 syncToCloud 参数
  async bulkAdd(tableName: string, rows: any[], syncToCloud: boolean = true): Promise<void> {
    const db = await this.getDB();
    // Local Write
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      // put 会覆盖主键相同的记录，或新增
      rows.forEach(row => store.put(row)); 
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Cloud Write (Write-Through)
    if (syncToCloud) {
        let conflictKey = undefined; // Default to Supabase primary key
        if (tableName === 'fact_shangzhi') conflictKey = 'date,sku_code';
        else if (tableName === 'fact_jingzhuntong') conflictKey = 'date,tracked_sku_id,account_nickname';
        else if (tableName === 'fact_customer_service') conflictKey = 'date,agent_account';

        // 分批推送
        const BATCH_SIZE = 200;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            this.pushToCloud(tableName, rows.slice(i, i + BATCH_SIZE), conflictKey);
        }
    }
  },

  async getTableRows(tableName: string): Promise<any[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getRange(tableName: string, startDate: string, endDate: string): Promise<any[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      const index = store.index('date');
      const range = IDBKeyRange.bound(startDate, endDate);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveConfig(key: string, data: any, syncToCloud: boolean = true): Promise<void> {
    const db = await this.getDB();
    // Local Write
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['app_config'], 'readwrite');
      const store = transaction.objectStore('app_config');
      store.put(data, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Cloud Write
    // cloud_sync_config 本身不上传，避免 key 泄露或循环覆盖
    if (syncToCloud && key !== 'cloud_sync_config') {
        this.pushToCloud('app_config', { key, data, updated_at: new Date().toISOString() }, 'key');
    }
  },

  async loadConfig<T>(key: string, defaultValue: T): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(['app_config'], 'readonly');
      const store = transaction.objectStore('app_config');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result !== undefined ? request.result : defaultValue);
      request.onerror = () => resolve(defaultValue);
    });
  },

  async getAllConfigs(): Promise<Record<string, any>> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(['app_config'], 'readonly');
      const store = transaction.objectStore('app_config');
      const items: any = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
              items[cursor.key] = cursor.value;
              cursor.continue();
          } else {
              resolve(items);
          }
      };
    });
  },

  async clearTable(tableName: string): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async exportFullDatabase(): Promise<string> {
    const db = await this.getDB();
    const exportData: any = {
      version: DB_VERSION,
      timestamp: new Date().toISOString(),
      tables: {}
    };

    const tableNames = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service', 'app_config'];
    
    for (const tableName of tableNames) {
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);
      
      if (tableName === 'app_config') {
          exportData.tables[tableName] = await new Promise((resolve) => {
              const items: any = {};
              const cursorReq = store.openCursor();
              cursorReq.onsuccess = (e: any) => {
                  const cursor = e.target.result;
                  if (cursor) {
                      items[cursor.key] = cursor.value;
                      cursor.continue();
                  } else {
                      resolve(items);
                  }
              };
          });
      } else {
          exportData.tables[tableName] = await new Promise((resolve) => {
              const request = store.getAll();
              request.onsuccess = () => resolve(request.result);
          });
      }
    }
    return JSON.stringify(exportData);
  },

  async importFullDatabase(jsonString: string): Promise<void> {
    const data = JSON.parse(jsonString);
    const db = await this.getDB();
    const tableNames = Object.keys(data.tables);

    for (const tableName of tableNames) {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      store.clear();
      
      if (tableName === 'app_config') {
          const configItems = data.tables[tableName];
          for (const key in configItems) {
              store.put(configItems[key], key);
          }
      } else {
          const rows = data.tables[tableName];
          rows.forEach((row: any) => store.put(row));
      }
    }
  }
};
