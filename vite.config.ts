
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 关键修复：将环境变量注入到浏览器环境
    // 既支持 Gemini API_KEY，也支持 Supabase 的连接凭证
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ""),
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || ""),
    'process.env.SUPABASE_KEY': JSON.stringify(process.env.SUPABASE_KEY || ""),
    'process.env': {}
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
