
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 明确注入特定变量，移除全局 'process.env': {} 以避免副作用
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ""),
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || ""),
    'process.env.SUPABASE_KEY': JSON.stringify(process.env.SUPABASE_KEY || ""),
    // 如果其他库严格依赖 process.env.NODE_ENV，Vite 通常会自动处理，
    // 但为了兼容性，可以显式定义 NODE_ENV
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  build: {
    // 解决 "Adjust chunk size limit" 告警
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // 物理分块策略：将大型依赖独立打包，降低单个 JS 文件的体积
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-utils': ['lucide-react', 'xlsx', '@google/genai']
        }
      }
    }
  }
});
