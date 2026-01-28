
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
    const config = await this.loadConfig('cloud_sync_config', null);
    if (config && config.url && config.key) {
      supabaseInstance = createClient(config.url, config.key);
      return supabaseInstance;
    }
    return null;
  },

  // 核心：启动时自动拉取云端最新配置 (Auto-Pull)
  async syncPull(): Promise<boolean> {
    const supabase = await this.getSupabase();
    if (!supabase) return false;

    console.log("☁️ 开始执行云端自动同步...");
    try {
      // 1. 同步配置项 (Metadata)
      const { data: configs, error } = await supabase.from('app_config').select('*');
      if (!error && configs) {
        for (const item of configs) {
          // 不覆盖云端配置本身，防止死循环
          if (item.key !== 'cloud_sync_config') {
             await this.saveConfig(item.key, item.data, false); // false = don't push back
          }
        }
      }
      return true;
    } catch (e) {
      console.error("云端同步失败:", e);
      return false;
    }
  },

  // 核心：写入时自动推送到云端 (Write-Through)
  async pushToCloud(tableName: string, data: any | any[], conflictKey?: string) {
    const supabase = await this.getSupabase();
    if (!supabase) return;

    // 异步执行，不阻塞 UI
    setTimeout(async () => {
      try {
        const payload = Array.isArray(data) ? data : [data];
        // 清理 payload 中的 undefined，Supabase 不接受
        const cleanPayload = payload.map(item => {
            const clean = { ...item };
            // 确保日期格式正确
            if (clean.date instanceof Date) clean.date = clean.date.toISOString().split('T')[0];
            return clean;
        });

        const { error } = await supabase.from(tableName).upsert(cleanPayload, { 
            onConflict: conflictKey || 'id' 
        });
        
        if (error) console.error(`[Cloud Sync] Upload to ${tableName} failed:`, error.message);
        else console.log(`[Cloud Sync] Successfully pushed ${cleanPayload.length} rows to ${tableName}`);
      } catch (e) {
        console.error(`[Cloud Sync] Error pushing to ${tableName}:`, e);
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
        // 注意：这里假设本地 ID 和云端 ID 一致，或者通过其他唯一键删除。
        // 对于 fact 表，通常通过 id 删除。如果是 config，逻辑不同。
        supabase.from(tableName).delete().in('id', ids).then(({ error }) => {
            if (error) console.error("Cloud delete failed:", error);
        });
    }
  },

  async bulkAdd(tableName: string, rows: any[]): Promise<void> {
    const db = await this.getDB();
    // Local Write
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      rows.forEach(row => store.put(row));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Cloud Write (Write-Through)
    // 自动判断冲突键
    let conflictKey = 'id';
    if (tableName === 'fact_shangzhi') conflictKey = 'date,sku_code';
    else if (tableName === 'fact_jingzhuntong') conflictKey = 'date,tracked_sku_id,account_nickname';
    else if (tableName === 'fact_customer_service') conflictKey = 'date,agent_account';

    // 分批推送，避免请求过大
    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        this.pushToCloud(tableName, rows.slice(i, i + BATCH_SIZE), conflictKey);
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
    if (syncToCloud && key !== 'cloud_sync_config') {
        this.pushToCloud('app_config', { key, data }, 'key');
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
    
    // Cloud Clear (Dangerous, maybe just log for now or implement if strictly needed)
    // const supabase = await this.getSupabase();
    // if (supabase) supabase.from(tableName).delete().neq('id', 0); 
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
