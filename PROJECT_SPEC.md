# Vibe Mobile — Dealer Management & Status System
## 开发交接文档 (Project Spec for VS Code)

> 目的：这份文件包含项目所有已定案的需求、数据库结构、业务规则和待建功能。
> 用途：在 VS Code 里照着开发，或喂给 AI 编程助手（Copilot / Cursor / Cline）作为上下文。
> 参考 UI：`prototype.html`（可点的原型，展示所有页面长相）。

---

## 1. 项目概述

Client 是一家 **Master Dealer**，代理 **Vibe Mobile** 电话卡。这套系统**只服务 master 这一边**，是一本电子账本 + 报表 + dashboard。

**系统只做记录 + 算钱 + 报表，不收钱、不下单**（下单收钱在 Vibe 官网跑）。

核心目的：
1. 记录每个 dealer 向 master 买了多少套餐 / top-up。
2. 算 master 的 **2% commission**（只算 reload 那部分）。
3. 跟 Vibe 公司月度对账。
4. Master dashboard：一眼看全部（总额、2%、排行、套餐分布、配送、对账）。

---

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 数据库 + Auth + Storage | **Supabase** (Postgres) |
| 前端框架 | **Next.js** (React) — 建议 App Router |
| 部署 | **Vercel** |
| 样式 | 参考 prototype.html 的深色主题（自订 CSS 或 Tailwind） |

**Supabase 项目信息：**
- Organization: `Vibe Master Dealer`
- Project: `dealer management`
- Region: Southeast Asia (Singapore) `ap-southeast-1`
- Project URL: `https://xjrgoebelqgariqnahxm.supabase.co`（在 Supabase → Settings → API 拿 anon key）
- ⚠️ 用**私人 Gmail** 账号建的（跟公司 Claude 分开）。日后交接给 uncle = 给账号密码。
- RLS（Row Level Security）已在所有表启用 → **权限策略待写**（见第 7 章）。

**环境变量（`.env.local`）：**
```
NEXT_PUBLIC_SUPABASE_URL=https://xjrgoebelqgariqnahxm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<在 Supabase Settings → API 拿>
```

---

## 3. 业务模式（核心，务必看懂）

### 3.1 套餐（Vibe 卖给 dealer 的产品）

| 套餐 | 价钱 | SIM 卡 | Reload 额度 | Reload % | 赠品 |
|------|------|--------|------------|----------|------|
| A | RM349 | 20 + 20 免费 | RM300 | **7%** | 1 张抽奖券 |
| B | RM695 | 40 + 50 免费 | RM600 | **7.5%** | 2 张抽奖券 |
| C | RM1,270 | 100 + 150 免费 | RM1,000 | **8%** | 3 张抽奖券 + 1 VIP 号码 |

### 3.2 钱 vs Points（两个独立单位，永不相加）

- 💵 **现金 (RM)**：真正进出的钱。
- 🎟️ **Top-up 额度 / Points**：充进 SIM 的面值，1 point = RM1 面值。

**换算 = dealer 的 rate**。例：
- 8% dealer 买 1000 points → 付 **RM920**，master 赚 **RM20 (2%)**
- 7.5% dealer 买 1000 points → 付 **RM925**
- 7% dealer 买 1000 points → 付 **RM930**

### 3.3 Rate 规则（关键）

- 每个 dealer 有一个「**当前套餐 / rate**」。
- **rate 跟着 dealer 最新买的套餐走**（升级降级都变）。买 C 就 8%，之后买 A 就掉回 7%。
- Accountant 每次 dealer 换套餐要**实时更新**这个 rate。
- 这个 rate 套用在他之后所有的**日常 top-up**上。

### 3.4 Master 的 2%（固定）

- **Master 永远固定赚 2%，只算在 reload / top-up 那部分**（SIM 卡、赠品不算）。
- 公式：`commission = points × 2%`（系统自动算，已在数据库做成 generated column）。

### 3.5 交易两种类型

1. **买套餐 (package)**：记 SIM 数、初始 reload、赠品；**更新 dealer 当前 rate**；money = 套餐价 × 数量。
2. **日常 top-up (topup)**：金额浮动（上个月客户回来充的也算），用 dealer 当前 rate 算 2%。

### 3.6 其他规则

- **一手交钱一手交货** → 每笔当场结清，**不需要「结余」**，纯流水记录。
- **SIM**：实体 SIM 要配送（有运费 + 可设最低配送数量）；**eSIM 即时，不用配送**。
- **激活奖励（AWP/Bonus5/MNP/Perpetual）不进本系统** —— 那是 Vibe 跟 dealer 的事。
- **收据**：手动上传图片 + 手动 key（AI 不自动填，因为账单不显示公司名，猜不准）。

---

## 4. 角色（严格隔离，各看各的）

只有 master 这边登入。Dealer、Customer 都不登入。

| 角色 | 职责 | 能看 |
|------|------|------|
| **Master** | 老板 | Dashboard、Dealer 名单、月度报表、对账（全局） |
| **Accountant** | 记账 + 核对 | 录入交易、交易记录、对账、报表 |
| **CS** | Dealer 管理 + 物流 | 开户/新增 dealer、Dealer 名单、SIM 配送 |

- 严格隔离：CS 看不到财务、Accountant 看不到 CS 专属的东西（用 Supabase RLS 实现）。
- **开户 = 新增 dealer 到系统**。因为每个 dealer 都是 master 这边亲手开户的 → 保证没人漏在系统外。

---

## 5. 数据库结构（已在 Supabase 建好）

以下三张表**已经跑过、存在了**。RLS 已启用，但**权限策略还没写**。

```sql
-- 1) Dealer 名单（已导入 242 家，来自 dealers_import.csv）
create table dealers (
  id uuid primary key default gen_random_uuid(),
  company_name   text not null,
  company_no     text,            -- SSM 公司号码
  contact_person text,
  phone          text,
  email          text,
  address        text,
  region         text,            -- 城镇级：Ipoh / Teluk Intan / Taiping ...
  package        text check (package in ('A','B','C')),  -- 当前套餐（多数先留空，之后再补）
  rate           numeric,         -- 对应 %（A=7, B=7.5, C=8）
  status         text default 'active' check (status in ('active','inactive')),
  notes          text,
  created_at     timestamptz default now()
);
create index idx_dealers_company on dealers (company_name);
create index idx_dealers_region  on dealers (region);

-- 2) 交易记录（套餐采购 + 日常 top-up）
create table transactions (
  id uuid primary key default gen_random_uuid(),
  dealer_id       uuid references dealers(id) on delete restrict,
  tx_date         date not null default current_date,
  type            text not null check (type in ('package','topup')),
  package         text check (package in ('A','B','C')),   -- 只有买套餐时填
  points          numeric not null default 0,              -- reload 面值
  money_rm        numeric not null default 0,              -- 收 dealer 的钱
  rate            numeric,                                 -- 当时用的 %
  commission_rm   numeric generated always as (round(points * 0.02, 2)) stored,  -- 你的 2%
  sim_type        text check (sim_type in ('physical','esim')),
  delivery_status text default 'na' check (delivery_status in ('na','pending','sent')),
  receipt_url     text,           -- 收据图片（存 Supabase Storage）
  status          text not null default 'pending' check (status in ('pending','verified','flagged')),
  recorded_by     uuid,           -- CS/accountant（auth user）
  verified_by     uuid,
  note            text,
  created_at      timestamptz default now()
);
create index idx_tx_dealer on transactions (dealer_id);
create index idx_tx_date   on transactions (tx_date);
create index idx_tx_status on transactions (status);

-- 3) Vibe 公司月度对账
create table company_statements (
  id uuid primary key default gen_random_uuid(),
  month                 date not null,     -- 该月份（用 1 号代表）
  company_total_points  numeric,           -- Vibe 出的 total top-up
  company_profit_rm     numeric,           -- Vibe 出的盈利数字
  reconciled            boolean default false,
  note                  text,
  created_at            timestamptz default now()
);
```

**还要建的表（待做）：**
```sql
-- profiles：登入用户 + 角色（连 Supabase Auth）
create table profiles (
  id uuid primary key references auth.users(id),
  name  text,
  email text,
  role  text not null check (role in ('master','accountant','cs')),
  created_at timestamptz default now()
);
```

---

## 6. 数据现状

- `dealers` 表：**已导入 242 家真实 dealer**（CSV 文件：`dealers_import.csv`）。
  - 栏位：company_name, phone, contact_person, address, region。
  - `package` / `rate` 大多空着，之后由 uncle 逐个分配 ABC。
  - ⚠️ 1 家（AHHLONG COMMUNICATION ENTERPRISE）电话缺失，待 uncle 补。
  - 电话号码是照片转录的，建议再抽查。
- `transactions` / `company_statements`：空的，等系统上线后录入。

---

## 7. 待建功能（按角色）

参考 `prototype.html` 的 UI。

### Master
- **Dashboard**（一眼看全部）：
  - KPI：本月 total top-up (points)、你的 2% (RM)、dealer 总数、待核对数
  - Dealer 排行（列表为主，可切金字塔）
  - 套餐销售分布（A/B/C 甜甜圈）
  - 每月趋势图
  - 配送状态 + 对账状态
- **Dealer 名单**（搜索、筛选地区、看套餐/rate）
- **月度报表**（每 dealer 总额 + 2%，导出 Excel / PDF）
- **月度对账**（系统 total vs Vibe statement）

### Accountant
- **录入交易**：选 dealer → 选类型（套餐/top-up）→ 填 points + money + 收据 → 提交（status=pending）
  - 买套餐时自动更新该 dealer 的 package + rate
  - 界面实时显示：钱 / points / 你的 2%
- **交易记录**（列表 + 核对：pending → verified）
- **月度对账** + **报表**

### CS
- **开户 / 新增 Dealer**（公司名、SSM、电话、email、地区、初始套餐）
- **Dealer 名单**
- **SIM 配送**（实体 SIM 标记 pending → sent；eSIM 即时；可设最低配送量；可发通知）

### 跨角色
- **每日自动报告**（每早发给 master：昨日总额、最活跃、变不活跃提醒）→ 用 cron / Supabase Edge Function + 定时
- **Real-time 更新**（Supabase Realtime）
- **角色严格隔离**（RLS policies）

---

## 8. VS Code 起步（建议顺序）

```bash
# 1. 建 Next.js 项目
npx create-next-app@latest vibe-dealer --typescript --app

# 2. 装 Supabase
cd vibe-dealer
npm install @supabase/supabase-js @supabase/ssr

# 3. 建 .env.local（填入上面的 URL + anon key）

# 4. 建 Supabase client（lib/supabase.ts）
# 5. 建 Auth（登入 + profiles 角色）
# 6. 一个个建页面（先 Dealer 名单，因为数据已经有了）
```

**开发顺序建议：**
1. Auth 登入 + profiles 角色 + RLS 策略（先把权限打好地基）
2. Dealer 名单页（数据已存在，最快看到成果）
3. CS 开户页
4. Accountant 录入交易（核心逻辑：套餐更新 rate、算 2%）
5. 交易记录 + 核对
6. Master Dashboard
7. 月度报表 + 对账 + 导出
8. 配送、每日报告、Real-time
9. 部署 Vercel + 自订 domain

---

## 9. 关键规则速查（写代码时别搞错）

- ✅ Master 2% = `points × 2%`，**只算 reload/top-up 的 points**，固定。
- ✅ Dealer rate 跟**最新套餐**走（A=7% / B=7.5% / C=8%），换套餐要更新。
- ✅ 钱和 points **分两栏**，永不相加。
- ✅ 一手交钱一手交货 → **无结余**，纯流水。
- ✅ 只有 `verified` 的交易才计入对账、报表、排行。
- ✅ eSIM 即时；实体 SIM 才配送。
- ✅ 系统只**记录**，不下单、不收钱、不连 Vibe/电话公司系统。
- ✅ 激活奖励（AWP/Bonus5/MNP/Perpetual）**不做**。
- ✅ 角色严格隔离（RLS）。

---

## 10. 相关文件

- `prototype.html` — 可点的 UI 原型（所有页面参考样式）
- `dealers_import.csv` — 242 家 dealer 数据
- `项目方向文档_Dealer_Management_System.md` — 早期完整需求讨论记录
- `报价单_Dealer管理系统_CreatiqAI.docx` — 报价单
- `电话卡Dealer管理系统_方案说明.docx` / `..._Proposal_EN.docx` — 给 client 的方案说明
