
/**
 * Advanced IndexedDB Wrapper for Shujian E-com System
 * Optimized for millions of rows (2.4M+ records).
 */
const DB_NAME = 'ShujianDB';
const DB_VERSION = 3; // Incremented version for index support

export const DB = {
  getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        
        // Dynamic Data Stores (Fact Tables)
        const factTables = ['fact_shangzhi', 'fact_jingzhuntong', 'fact_customer_service'];
        factTables.forEach(tableName => {
          if (!db.objectStoreNames.contains(tableName)) {
            // We use an auto-incrementing key for rows to allow duplicate SKUs on different dates
            const store = db.createObjectStore(tableName, { keyPath: 'id', autoIncrement: true });
            // CRITICAL: Create indices for fast querying without full table scans
            store.createIndex('date', 'date', { unique: false });
            store.createIndex('sku_date', ['sku_code', 'date'], { unique: false });
          }
        });

        // Config Store for metadata
        if (!db.objectStoreNames.contains('app_config')) {
          db.createObjectStore('app_config');
        }
      };
    });
  },

  // Save multiple rows efficiently using a single transaction
  async bulkAdd(tableName: string, rows: any[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      
      rows.forEach(row => store.put(row));
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  // Optimized range query: only fetch what you need from disk
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

  async saveConfig(key: string, data: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['app_config'], 'readwrite');
      const store = transaction.objectStore('app_config');
      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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

  async clearTable(tableName: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};
