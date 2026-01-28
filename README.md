# 云舟 (Yunzhou) | 智能电商全链路运营指挥中心

> **"轻舟已过万重山"** —— 搭载 Gemini 3.0 Pro 的新一代电商私有化智能运营系统。

## 🚢 系统愿景
**云舟 (Yunzhou)** 是一款专为高阶电商团队设计的“数据+AI”双驱动作战系统。它打破了传统 BI 报表只看不做的局限，通过**本地 IndexedDB 存储**保障操作流畅性，并深度集成 **Google Gemini 3.0** 模型，实现了从数据清洗、利润穿透、销售预测到文案/视觉生成的一站式闭环。

---

## 🏗️ 部署架构 (Architecture)

本系统采用 **Local-First (本地优先) + Cloud Sync (云端同步)** 的混合架构，确保极致性能与数据安全。

1.  **前端托管 (Vercel)**: 
    *   通过 GitHub 自动构建。
    *   负责静态资源分发与 Gemini API 的请求调度。
2.  **本地数据库 (IndexedDB)**: 
    *   核心业务数据（销量、SKU、配置）默认存储在操作员的浏览器本地。
    *   读写速度极快，无网络延迟，保护商业机密。
3.  **云端持久化 (Supabase)**: 
    *   作为**永久数据备份**与**多设备同步中心**。
    *   通过 SQL 表格 (PostgreSQL) 存储结构化数据。
    *   支持异地办公：在公司电脑点“推送”，回家电脑点“拉取”，无缝衔接。

---

## 🚀 部署指南 (Deployment)

### 第一步：配置 Supabase (云数据库)
1.  登录 [Supabase](https://supabase.com) 创建一个新 Project。
2.  进入 **Project Settings -> API**，获取 `Project URL` 和 `anon / public` Key。
3.  进入 **SQL Editor**，将本系统 `CloudSyncView.tsx` 页面中提供的 **"初始化云数据库 SQL 脚本"** 复制并运行。
    *   *注意：这会自动创建 `fact_shangzhi`, `app_config` 等所有必要的物理表。*

### 第二步：配置 Vercel (应用托管)
1.  将代码推送到 GitHub。
2.  在 Vercel 中 Import 该仓库。
3.  在 **Environment Variables** (环境变量) 中添加：
    *   `API_KEY`: 您的 Google Gemini API Key。
4.  点击 **Deploy**。

---

## 🛠️ 核心功能 (Features)

### 1. 战略指挥 (Dashboard)
*   **v5.0.2 内核**: 集成 Gemini 3 Pro 逻辑推理引擎。
*   **全景监控**: 实时聚合 GMV、ROI、广告消耗等核心指标。
*   **智能诊断**: AI 自动扫描库存断货、投放亏损等异常并在首页预警。

### 2. 数据中心 (Data Center)
*   **物理清洗**: 支持 Excel 导入（商智/京准通/客服），自动识别表头并清洗脏数据。
*   **IndexedDB**: 本地存储百万级行数据，查询无延迟。

### 3. AI 实验工场 (AI Labs)
*   **智能报价**: 基于配件库成本与利润率策略，自动计算整机报价。
*   **竞品雷达**: A/B 规格参数对冲，自动生成差异化竞争策略。
*   **文案/视觉**: 生成小红书/京东风格文案及高质量产品摄影图。

---

## 🔐 数据安全说明
*   **API Key 安全**: 建议在 Vercel 环境变量中配置，不要硬编码在代码中。
*   **云端权限**: Supabase 默认开启 RLS (Row Level Security)，请确保使用 SQL 脚本中的 `DISABLE ROW LEVEL SECURITY` 或自行配置策略以允许读写。

---

_Powered by React 19, Vite, TailwindCSS, & Google Gemini._