---
title: "TasteGate AI — Qloo Agentic Hackathon 冲奖方案与 Review 基线"
version: "1.0"
as_of: "2026-10-16"
status: "STRATEGY FROZEN FOR FEASIBILITY REVIEW — NOT IMPLEMENTED"
competition: "Qloo Agentic Hackathon"
proposed_project: "TasteGate AI"
language: "zh-CN"
owner_intent: "独立参赛；争取前三；真实 Qloo 集成；面向评委可运行且可审核"
---

# TasteGate AI — Qloo Agentic Hackathon 冲奖方案与 Review 基线

> **文档用途**：供后续 Devpost 草稿、Codex 开发、每阶段工程 Review、演示制作与最终提交检查使用。本文将此前对话中的竞赛研究、选择理由、产品假设、设计思路、风险和执行计划整理为**可追溯的策略基线**，不是已通过工程验收的报告。
>
>
> **真伪与状态约束**：文中的赛事规则/奖金/竞品情况主要来自截至 2026-10-16 的研究与已上传《全球 AI Agent Hackathon 赛事研究百科 v1.4》；涉及奖励、资格、确切提交字段、Qloo API 支持范围，提交前必须回到官方网页和账户后台核验。建议架构、产品名称、Benchmark 和验收目标均为我们提出的方案，**不属于 Qloo 官方要求、已完成的项目成果或获奖保证**。

## 0. 执行摘要（供未来重新打开时 1 分钟回忆）

- **比赛**：Qloo Agentic Hackathon（Devpost）：https://qloo.devpost.com/
- **已完成**：Devpost 个人报名成功；Qloo Hackathon API Key 申请表已提交，页面确认“will get your API key by email within a few business days”。**尚未取得 Key 的完成证明**。
- **尚未完成**：新 Devpost 项目草稿、公开 GitHub 仓库、真实 API 调用、网站部署、测试、提交作品。
- **候选名**：`TasteCompass AI` 已被策略研究淘汰；正式建议项目名称 **`TasteGate AI`**。
- **定位**：**The Cultural Quality Gate for AI Agents**。不是第 N 个旅行/餐厅推荐器，而是让现有 AI Agent 的文化相关推荐经过**验证 → 证据审查 → 有界修复 → 再验证 → 可审计报告**。
- **不可替代的 sponsor 能力**：Qloo Taste AI / Taste Graph 提供实体解析、文化偏好关联、候选结果与可用解释信号；这些信号应当实质影响结果，而非用于页面装饰。
- **创新主张（待实证）**：把文化关联变为可插拔的 AI Recommendation Quality Assurance 能力，并通过 LLM-only 与 Qloo-grounded 的公平对照证明价值。
- **首要工程 Go/No-Go**：拿到 API Key 后，必须用真实数据复现“原始推荐 → 可审计审核 → Qloo 支撑的替换 → 前后证据差异”；做不到则缩小为电影推荐 QA，绝不虚构解释与分数。
- **截止**：研究快照为 **2026-10-30 23:45 EDT = 2026-10-31 16:45 NZDT**；最终以 Devpost 账户倒计时/Official Rules 为准。
- **执行原则**：Graph Hacks 的 10 月 19 日交付先保住；Qloo 项目按独立赛事交付，无须堆叠多 Agent、付费云服务或不可验证的 AI 功能。

---

## 1. 赛事情报与规则核验

### 1.1 已在此前研究中记录的赛事信息

| 项目 | 当前研究记录 | 可信度与动作 |
|---|---|---|
| 赛事入口 | https://qloo.devpost.com/ | 官方网页；最后重新检查当前状态 |
| 官方规则 | https://qloo.devpost.com/rules | 以最新版本为准 |
| 比赛形式 | 全球线上 | 已报名成功 ≠ 确认获奖/税务资格 |
| 总现金池 | US$25,000 | 2026-10-16 研究快照；检查奖金细则 |
| 奖项拆分 | 第一 US$15,000、第二 US$6,000、第三 US$4,000 | 先前检索记录；以本届最新 Rules 核对 |
| 额外商业激励 | 曾报道可能存在 US$25,000 投资机会 | **非竞赛现金奖 / 非无条件付款**；条款和真实性需另验，不计入奖金池 |
| 截止时间 | 2026-10-31 16:45 NZDT | 用户截图 Devpost 右侧倒计时与该时间相符 |
| 评分维度 | Technological Implementation / Design / Potential Impact / Quality of the Idea | 上轮研究记录为各 25%，提交前再次核验 |
| 必需 sponsor 技术 | Qloo API 实质集成 | 已有研究的重要约束 |
| 公网项目 | 需要在线可访问、可供评委免费测试的产品 | 上轮研究；正式提交前核对 |
| 公开源码 | 提供带 License 的公开仓库及运行说明 | 上轮研究；正式提交前核对 |
| 视频 | 上轮研究：不强制 | 仍建议自制 2–3 分钟演示；此为策略建议 |
| 新西兰资格 | 页面接受注册，用户已报名 | 奖金资格、地域限制、发奖/签证/税务仍以官方条款为准 |

### 1.2 基于四维评分的作品原则

1. **Technological Implementation（25%）**：Qloo 的真实调用必须进入决策链，代码与运行证据可检查；LLM 不得冒充 Qloo 返回的数据。
2. **Design（25%）**：第一次访问即有一键 Demo、清晰 Before/After、证据抽屉与明确错误状态；不让评委安装复杂环境或自行提供 API Key。
3. **Potential Impact（25%）**：目标客户是已有推荐能力的 AI 产品/开发团队；它们需要量化并改善文化推荐的有效证据，而非只得到更流畅的话术。
4. **Quality of the Idea（25%）**：创新点是为其他 Agent 提供可插拔质量门禁，而不是单体文化推荐助手；必须审视同类竞品是否已有等效能力。

> 25%×4 的权重是在此前对话中对官方规则的研究结论，本文保留该结论用于设计，但**不将后续规则变更排除在外**。

### 1.3 必须在提交前再次确认的官方问题

- 当前 Rules 版本、评审权重、提交必填字段、是否限制赛前代码复用。
- 公共 Repo 的许可证要求、是否允许使用付费 LLM 和第三方地理数据。
- Judge 访问与 API 限额：评审期使用成本、请求限制和公网可用性要求。
- API Key 仅供此 Hackathon 使用时的许可证与数据保留约束。
- 新西兰居住者实际获奖资格、发奖身份核验和适用税务。
- API 数据衍生展示、结果缓存、日志保存与不得进行的推断。

---

## 2. 竞品扫描与选题判断

### 2.1 前届参考（并非本届直接对手）

| 项目 | 之前研究中记录的方向 | 启示 |
|---|---|---|
| GeoTaste | 地理位置 + 文化偏好，用于商业/市场分析 | 文化智能可以服务 B2B 决策 |
| Alloy | 文化契合尽调 | 可解释、商业风险与依据比单纯推荐更有张力 |
| Zesty | Unrecommendation：跳出传统相似推荐 | 清晰的反常规洞察有利于创意辨识度 |
| Resonance AI | 前届获奖名单中出现 | 需要检查详情，本文不推断其核心功能 |

### 2.2 本届已发现的公开参赛作品（截至前次研究；不能视为全量）

| 项目 | 已公开的方向（此前研究摘要） | 与我们发生的竞争 |
|---|---|---|
| [Taste Council](https://devpost.com/software/taste-council) | 多人用餐偏好交集和重新规划 | 聚合偏好与推荐体验 |
| [TasteBridge](https://devpost.com/software/tastebridge-s0jqr2) | 迁居后的文化融入、第一周计划 | 文化迁居与生活推荐 |
| [CultOS](https://devpost.com/software/cultos-autonomous-cultural-intelligence-engine) | 音乐演出赞助品牌匹配 | 商业文化匹配 |
| [AURA CultureGuard](https://devpost.com/software/aura-cultureguard) | 品牌合作审计与文化风险 | “文化审核”名称/功能有部分概念重叠 |
| [Overlap](https://devpost.com/software/overlap-9iy76z) | 品牌受众匹配、Qloo 与 AI 对比 | B2B 决策 + 实证对照 |
| [Shelfwise](https://devpost.com/software/shelfwise-ctyxlo) | 图书馆策展、跨媒介推荐与证据 | 可见成熟的产品/工程完成度 |

**注意**：这些是此前公开搜索的研究笔记，未统一独立跑过全部 Demo、并非官方排名，也不代表截至决赛日的完整参赛池。需要在提交前再抽样检查本届新增质量评估/推荐治理型作品。

### 2.3 候选方向对比（策略判断，不是官方评分）

| 方向 | 差异化 | 商业价值 | 与现有能力适配 | 决策 |
|---|---|---|---|---|
| `TasteCompass AI`：旅行/餐饮/娱乐泛推荐 | 弱 | 中 | 高 | **淘汰**：同质化严重 |
| `Encore`：演出与品牌商业匹配 | 中 | 高 | 中 | 备选，已有类似公开作品 |
| `FirstFriend`：跨文化迁居助手 | 中低 | 高 | 高 | 备选，存在概念重叠 |
| **`TasteGate AI`：其他 Agent 的文化推荐质量门禁** | **潜在较强** | **高** | **极高** | **选定，进入技术可行性验证** |

**决策理由**：用户已有 Agent Loop、Governance、Evidence Ledger、Eval、Fail-Closed 等工程经验；相比重做泛推荐 UI，TasteGate 更能够利用技术专长，同时有可复现的业务效果对照。**核心挑战**是证明 Qloo 提供的数据真的足以支撑可靠的审核与修复，而不是换一个名字的推荐器。

---

## 3. 最终产品定义

### 3.1 名称与 Pitch

**Name**：`TasteGate AI`  
**Subtitle**：`The Cultural Quality Gate for AI Agents`  
**Tagline**：`Audit, repair, and verify AI recommendations with Qloo-powered cultural intelligence.`

**One-liner**：把 Qloo 的 Taste Graph 变成 Agent 的可审计推荐质量门禁，让 AI 产品能够验证原推荐的实体与证据、修复有问题的候选，并交付可追溯的前后对比报告。

### 3.2 目标用户与问题

- **直接客户**：建设旅行、城市发现、文化消费、内容策展或零售 AI Agent 的产品/开发团队。
- **最终用户**：希望 AI 推荐贴合电影、音乐与兴趣、不仅仅是“最热门”的普通消费者。
- **痛点**：LLM 推荐的候选可能真实存在，却缺少透明的文化契合证据；也可能产生实体歧义、违反城市等明确约束，或给出未经核实的解释。
- **承诺边界**：能够验证实体与规则、展示部分文化关联的真实依据；**不能直接保证人一定喜欢、品牌一定转化或 Qloo 能提供每个地点的精确事实**。

### 3.3 产品不是 / 是

**不是**：又一个“告诉我喜欢的音乐，推荐三家餐厅”的泛用 Chatbot；也不是仅把 Qloo 分数贴在 LLM 答案旁边。  
**是**：现有推荐系统的预发布检查层，像软件交付的 Quality Gate 一样，对推荐的**来源真实性、硬约束、证据覆盖、替代方案**产生机器可读结果。

### 3.4 核心流程

```text
External AI Agent recommendations + user taste preferences + hard constraints
                    |
                    v
            Input/Schema Validation
                    |
                    v
          Entity Resolution (Qloo)
                    |
                    v
          Taste Insights (Qloo)
                    |
                    v
      Evidence / Constraint Audit Gate
             /              \
       ALLOW/REVIEW       REPAIR NEEDED
             |                 |
             |         Bounded Candidate Search
             |                 |
             |         Qloo-Grounded Repair
             |                 |
             |            Re-validate
             \               /
                    |
                    v
    Before/After Report + Evidence Ledger + JSON Contract
```

### 3.5 决策语义（非常重要）

使用**双层门禁**，不要把文化关联偷换为确定的喜爱概率。

1. **硬门禁（BLOCK）**：输入数据错误、实体/位置无法可靠确认、与明确类型/地区等约束冲突、明显引用了不存在的 Qloo 证据、缺失必需字段。
2. **软门禁（REVIEW / REPAIR SUGGESTED）**：证据不足、偏好关联弱、解释不可用、候选排名落后。允许不确定性与人工复核；不能无根据断言“该推荐对你不适合”。
3. **证据缺失（UNKNOWN）**：当 Qloo 不覆盖某候选/解释不可用时必须如实报告；不准回退到 LLM 凭空给出“Qloo 证明”。

建议状态枚举：`PASS` / `REVIEW` / `REPAIR_SUGGESTED` / `BLOCKED` / `UNKNOWN`。把真正的 Fail-Closed 应用在**数据欺骗、硬约束、越权外部动作**上，而不是所有低文化相似度。

---

## 4. 核心 Demo 场景

**用户画像输入（合成演示）**：

> “I love Radiohead, Wong Kar-wai films, and Japanese jazz cafés. Plan a culturally interesting evening in New York.”

**上游 AI 给出（必须明确标为原 Agent 的输出；不应冒称真实运行结果）**：一些常规热门餐厅、连锁咖啡馆、大众景点，可能存在兴趣匹配依据不足与地理约束问题。

**TasteGate 演示三步**：

1. **Audit**：定位推荐中的真实 Qloo 实体；核对城市、类别、用户明确的限制，显示每个候选的“实体已确认 / 数据不足 / 硬约束失败”。
2. **Repair**：利用 Qloo 返回的跨领域候选与文化偏好信号寻找替代；重新进行硬约束检查；保留无法证明时的 `REVIEW/UNKNOWN` 结果。
3. **Proof**：显示 Qloo 请求标识/实体 ID/接口元数据（仅保留允许展示的字段）、输入约束、修复原因与最终 JSON；并排展示 Before/After。

**一键开始 Demo**：评委不需自己的 Key、不需配置模型、不需登录；应限制恶意流量。  
**额外失败演示**：Qloo 超时/限额/实体查无结果时正确降级，而非假装审核通过。

---

## 5. Qloo API 可行性与合规约束

### 5.1 上轮研究中的候选接口

| 接口/参数 | 设计用途 | 何时才可以写成“已支持” |
|---|---|---|
| `GET /search` | 解析电影、歌曲、地点等兴趣实体与原推荐实体 | API Key 下成功运行并查看实际字段 |
| `GET /v2/insights` | 文化偏好驱动的跨类别推荐与相关候选 | 有真实调用与实体/排名证据 |
| `filter.results.entities` | 指定审核候选集合 | 检验 Hackathon Key 允许用法、语义和返回方式 |
| `feature.explainability=true` | 尝试获取解释/贡献信息 | 真实观察到相应字段及适用边界；缺失时保持 UNKNOWN |
| `GET /v2/tags` | 查询可用类别/标签 | 文档、Key 与字段确认通过 |

官方入口：

- API 文档：https://docs.qloo.com/
- Hackathon developer guide：https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
- 官方 Kit：https://github.com/qloo/qloo-hackathon-kit
- Devpost Rules：https://qloo.devpost.com/rules

**重要区分**：以上是上轮研究中认为可行的接口/参数名称，**不是已执行成功的 API 记录**。特别是 Explainability 可能没有完整解释，不能承诺每个候选都有贡献向量；需要校验 API 类别、地理覆盖、分页、错误码、缓存许可和限额。

### 5.2 API 验证必须回答的 10 个问题

- [ ] 是否已收到并安全存储比赛 API Key（不得贴入公开 README/日志/聊天）？
- [ ] 能否真实查询至少 2 种不同类型的文化实体？
- [ ] 能否对一个候选结果集做约束/过滤，且结果语义明确？
- [ ] 能否从音乐或电影输入关联到另一个领域，且覆盖演示城市？
- [ ] 有哪些标识与字段适合展示可审计证据？
- [ ] Explainability 在哪些请求中实际返回？缺失时如何表示？
- [ ] 地点类型是否具有可靠地理字段？需要额外可靠地理数据时如何区分来源？
- [ ] Qloo Key 的速率限制、日调用预算、并发限制和超时特征是什么？
- [ ] 是否允许在公网应用展示/缓存/导出结果的哪些部分？
- [ ] 遇到 429/5xx/无结果时，系统是否能安全返回 `UNKNOWN/REVIEW`？

### 5.3 不得违背的原则

- Qloo 聚合文化信号**不是**对单个用户的确定偏好预测，**不是**“喜欢概率”。
- 任何模拟响应必须有 `source_mode=fixture` / `SIMULATED DATA` 标识；与 live 分开。
- 不对个人敏感属性进行逆向推断或声称其宗教、种族、政治倾向等。
- 不把 API Key 放在浏览器 bundle、GitHub、视频录屏、异常栈里。
- 不用无法追溯的数据伪造“Qloo 认可”。

---

## 6. 软件架构与接口契约（拟实施方案）

### 6.1 推荐技术栈

| 组件 | 推荐 | 取舍理由 |
|---|---|---|
| Web | Next.js + React + TypeScript | 单仓全栈，快速完成可运行产品 |
| UI | Tailwind CSS + 自定义设计系统 | 为评分中的 Design 留出空间 |
| Agent | 有界 TypeScript Tool Loop | 易审计，能明确约束步数与工具权限 |
| Qloo | 服务端 REST API Client（可选研究 MCP） | 控制 Key、限流、缓存与调用证据 |
| LLM | 可配置、低成本的托管模型 API | 评委无需依赖开发者本机 Ollama 在线 |
| 输出校验 | Zod + 类型与实体检查 | LLM 不是安全边界 |
| Evidence | request_id + run_id + trace + Qloo IDs | Review 时可关联用户操作与实际 API |
| 测试 | Vitest + Playwright + fixtures/contract tests | 支持干净环境与评委路径 |
| 部署 | Vercel 或等效公网稳定平台 | 评审期免费可访问 |
| CI | GitHub Actions | Lint / Typecheck / tests / build |

优先少量可靠工具，而不是多 Agent 堆叠。有关 `agentic-intent-gate` 仅可复用许可证允许的通用思想/依赖，并披露旧项目来源与赛期新增范围；不得直接照搬旧项目冒充新作。

### 6.2 建议模块

```text
app/
  demo/                       # Judge 一键案例
  audit/                      # 审核前后与 evidence 视图
  api/audit/                  # 服务端入口
src/
  domain/                     # preferences, constraints, findings, decisions
  agents/                     # bounded-loop + tool dispatcher
  qloo/                       # typed client, entity resolution, insights
  audit/                      # hard constraints + evidence coverage
  repair/                     # candidate generation + revalidation
  report/                     # Evidence Ledger + JSON export
  security/                   # key handling, rate limit, payload redaction
  observability/              # structured trace, error handling
  fixtures/                   # 明确标识的 synthetic data
 tests/
  unit/
  contract/
  e2e/
docs/
  product.md
  architecture.md
  qloo-contracts.md
  evaluation.md
  judge-guide.md
  competition.md
  demo-script.md
 evidence/
  live-runs/                 # 脱敏原始真实执行证据
  benchmarks/                 # 原始评测与复现材料
```

### 6.3 概念 JSON 输出结构（待 API Probe 后定稿）

```json
{
  "run_id": "demo-001",
  "source_mode": "live",
  "input_summary": {
    "preference_entities": ["music-entity-id", "movie-entity-id"],
    "destination": "New York"
  },
  "findings": [
    {
      "candidate_id": "original-candidate-1",
      "verdict": "REVIEW",
      "reason_code": "INSUFFICIENT_TASTE_EVIDENCE",
      "evidence_refs": []
    }
  ],
  "repairs": [
    {
      "replaces": "original-candidate-1",
      "replacement_entity_id": "qloo-entity-id",
      "evidence_refs": ["qloo-call-ref-002"]
    }
  ],
  "final_status": "REVIEW",
  "limitations": ["Cultural affinity does not prove personal preference"]
}
```

*以上 JSON 完全是内部设计示例，不代表 Qloo 官方响应格式。`live` 只能在真实 API 端到端调用之后使用。*

### 6.4 性能与安全边界

- 单次请求最多 N 次工具调用（N 由负载测量决定），全局超时和重试上限；所有重复动作具备 idempotent 处理思路。
- 数据源分别标注 Qloo、用户明示、上游 Agent 和可选第三方地理来源；证据混合时必须区分。
- 缓存、限流、输入长度限制、防止 prompt injection 影响工具权限与报告标记。
- 部署公开 Demo 的身份/速率保护不应阻塞评委一键体验。
- 模型/第三方服务故障时暴露错误，不自动转到看似“真实”的静态成功页面。

---

## 7. 必须演示的产品体验与设计

### 7.1 Judge Journey（最多 3 分钟理解）

1. 首页 8–15 秒：一句话解释“AI 推荐需要文化证据质量门禁”，显示 **Try Live Audit**（真实状态清楚标记）。
2. 点击内置案例：展示 3–5 个上游 Agent 候选，含明确原始用户偏好。
3. 实时审查：逐步出现 Entity Resolve → Taste Insights → Constraint Check 的进度；失败不隐藏。
4. 前后对比：保留通过项，对问题项给出替换与理由，展示不能修复的 `UNKNOWN`。
5. 展开一条 Evidence Ledger：能看到实际 Qloo 相关实体 ID、调用映射、为何阻断或建议修复。
6. 导出机器可读 JSON，说明这一层可以插入其他 Agent 工作流。

### 7.2 UI 主要屏幕

- **Landing / Use Case**：适合不懂 AI 基础设施的评委。
- **Audit Workspace**：左 Original / 中 Gate / 右 Repaired；不要过度复杂。
- **Evidence Drawer**：实体、来源、软/硬规则、有限解释、警告和 trace。
- **Evaluation Page**：方法、数据集、数据原始出处、已测结果与局限。

### 7.3 失败路径必须真实

- 原推荐包含无法识别的文化实体 → `UNKNOWN`（不补造实体）。
- 推荐违反明确城市/类型限制 → `BLOCKED`。
- Qloo API 超时/限额 → 明示失败及能否重试，不输出虚构的高分推荐。
- Qloo 无 explainability → 仅保留可证实的关联数据，并解释“无法给出详细归因”。

---

## 8. Evaluation：冲奖证据，而不是指标营销

### 8.1 主实验设计

在相同用户输入、同一批上游推荐和相同硬约束下比较：

- **Baseline：LLM-only 或原推荐**，不使用 Qloo 额外证据。
- **Treatment：TasteGate** 对同一候选输入做审核、修复和再验证。

理想条件下，候选生成模型、温度、输入上下文和评估盲评设置固定；避免 treatment 因得到更多人工调优而虚假获胜。

### 8.2 Golden Dataset v0（建议 30 例，未构建）

| 类型 | 案例数 | 关注点 |
|---|---:|---|
| 电影/音乐跨域 | 8 | 关联与实体解析 |
| 音乐/餐饮/城市发现 | 8 | 地理条件与文化信号 |
| 混合多偏好 | 6 | 偏好冲突、证据缺口 |
| 恶意/不可用/故障 | 8 | 假实体、错城市、429、空数据、注入等 |
| **合计** | **30** | 覆盖正常、边界和失败 |

### 8.3 指标定义

- **Verified Entity Rate**：拥有可核验真实实体标识的候选比例。
- **Hard Constraint Violation Rate**：明示规则违反次数/总审核项；要拆分发现率与最终残留率。
- **Evidence Coverage**：有至少一条合规可追溯证据的最终候选比例。
- **Repair Resolution Rate**：实际解决问题的修复案例数 / 发起修复案例数。
- **Unsupported Claim Rate**：推荐解释里无法从提供的证据支持的主张比例。
- **Latency**：p50/p95 和失败比例；必须标记样本数。
- **Human Preference Blind Review**（可选）：人工盲选两组推荐的相关性与实用性。与“实体可验证”指标分开报告。

**禁止**：将文化关联强度当概率、将 evidence coverage 当准确率、少数运行得出“99.9%可靠”、调高阈值后只展示成功案例。

### 8.4 测试与证据台账

每个测试案例至少保存：`case_id / input / constraints / original / qloo_requests_redacted / qloo_entity_ids / agent_decisions / final / expected / observed / pass_fail / timing / source_mode / commit_sha`。

最少的自动化验收用例：

- TC01：真实 Qloo 实体解析与 Insights 进入最终决策证据。
- TC02：无 Qloo 证据时不会伪造“supported by Qloo”。
- TC03：城市/类别硬约束失败时发生正确拦截。
- TC04：至少一次有效替代推荐，其新实体可追溯。
- TC05：Explainability 缺失时报告不确定性。
- TC06：429/5xx/超时/空数据的可恢复或安全降级。
- TC07：重复调用不会制造不一致的报告关联。
- TC08：公共 Demo 不暴露 API Key、Token、私人日志。
- TC09：评委从零打开在线产品无需登录/自行配置 Key。
- TC10：干净环境可运行测试，README 实际命令准确。

---

## 9. 交付清单与优先级

| 功能/产物 | 优先级 | 通过标准 |
|---|---|---|
| Judge 一键案例 | P0 | 无需模型/API Key 本地设置即可访问；live/fixture 有标注 |
| 输入与输出 Schema | P0 | 错误输入 fail-fast，字段语义明确 |
| Qloo 实体解析 | P0 | 真实请求证据、名称歧义处理 |
| Qloo Insights | P0 | 至少两个跨领域例子，Qloo 数据改变决策 |
| Audit Gate | P0 | 硬约束与证据不足正确分类 |
| 有界 Repair | P0 | 实际修复并再验证，失败可解释 |
| Before / After UI | P0 | 原始、审查、修复结果同屏可比 |
| Evidence Ledger | P0 | 一条候选可追溯真实证据与来源 |
| 公开运行的 App | P0 | 可在比赛/评审期间访问，不依赖作者电脑 |
| 公开 Repo + License | P0 | 完整构建、运行、架构、测试说明 |
| JSON Report Export | P1 | 可供其他 Agent 或 CI 集成的稳定 Schema |
| 30-case Benchmark | P1 | 固定数据与完整原始结果；无造假 |
| 2–3 分钟视频 | P1 | 现场录真实运行/错误路径，辅助评委理解 |
| MCP/CI Plugin | P2 | 仅在 P0/P1 全部可靠后追加 |

### 最终提交文件建议

- `README.md` — 项目价值与一键访问；本地运行。
- `LICENSE` — 符合主办方及依赖许可证。
- `.env.example` — 空值模板，不包含 Key。
- `docs/competition.md` — 正式规则映射、赛期新旧代码界线。
- `docs/qloo-contracts.md` — 成功返回结构和真实限制（脱敏）。
- `docs/evaluation.md` — 实际指标及无法完成的内容。
- `docs/judge-guide.md` — 评委 2 分钟走通路径。
- `evidence/` — 真实 API 调用与截图、失败路径、版本信息。
- Devpost 项目草稿/正式提交表单 — 最后检查链接和字段。

---

## 10. 开发节奏与 Go/No-Go 检查点（NZDT）

> 由于 10 月同时间还有 Graph Hacks、GitLab、HackerRank 等项目，以下是**资源冲突下的计划**，不是固定承诺。优先交付真正能参加评审的 P0，而不是把 P2 功能排满日历。

| 日期 | Phase | 主要产物 | 必须的通过条件 |
|---|---|---|---|
| 10/16–10/19 | P0：规则、产品、草稿 | Devpost 草稿、PRD、需求与 API Probe 计划 | Graph Hacks 截止前不因新赛分心 |
| 10/20–10/21 | P1：Qloo 真集成 | Key 验证、实体查找、Insights、基础数据合同测试 | **Go/No-Go #1**：至少两个跨领域 live 例子可用 |
| 10/22–10/23 | P2：最小闭环 | Audit → Repair → Revalidate → Evidence JSON | 至少 1 个 live Happy Path + 1 个真实 Error Path |
| 10/24–10/26 | P3：UI + 部署 | Public Demo、Before/After、保底用例 | 冲突于 HackerRank，需尽量提前构建 |
| 10/27–10/28 | P4：评估与质量 | 最少 3 个演示场景、Benchmark、Judge Guide | 对照数据真实且可复现 |
| 10/29–10/30 | P5：Freeze/Submit | Devpost、Repo、证据、视频（若完成） | 至少提前 24 小时完成主要提交工作 |
| **10/31 16:45** | **赛事截止** | 提交确认截屏 | 以官方倒计时为准 |

### Go/No-Go #1：API 可行性（建议 10/21）

- **GO**：能够可靠解析兴趣/候选、查询跨领域关联、构造真实证据与至少一例 Qloo-grounded repair。
- **PIVOT**：跨域广度不足但电影类别稳定 → 收缩为 `TasteGate Movies`；依然保留 Audit/Repair/Proof 的差异化。
- **NO-GO**：Key 未发、无真实数据、API 不支持核心语义、评审期额度无法支撑 → 不得伪造 Live 成品；先处理权限或项目调整。

### Go/No-Go #2：公网演示（建议 10/27）

- 外部网络可访问；匿名评委可一键触发至少一个真实工作流。
- 每个关键节点有可视状态；失败时看到可信的错误而不是静默空白。
- Evidence 与最终结果匹配，测试/文档在提交 commit 上复现。

### Freeze 原则

- 最迟截止前 24 小时：功能冻结，重点做许可证、密钥、对外访问、评委体验、Devpost 字段审核。
- 真实 API Key 受限制时，允许标注 Fixture 的教学演示，**但不可代替必须的 Live 证据**。

---

## 11. 风险登记（后续 Review 每轮更新）

| ID | 风险 | 影响 | 优先级 | 缓解方案 | 状态 |
|---|---|---|---|---|---|
| R01 | Qloo API Key 未及时发放 | 无法 live 集成 | Critical | 查邮件/垃圾箱，联系官方 Discord；先做模拟接口与 Schema | OPEN |
| R02 | Insights 不支持想象中的跨域“质量裁判”能力 | 选题核心失真 | Critical | 真实探针验证；必要时缩到单类别 | OPEN |
| R03 | Explainability 不可用/不覆盖部分候选 | 解释失真风险 | High | `UNKNOWN`，显示真实 Qloo 信息，不造归因 | OPEN |
| R04 | 地理信息不可靠 | 审核误判 | High | 分离 Qloo 与外部数据源；没有证据则不宣称验证 | OPEN |
| R05 | 竞品已有类似 Audit/Quality 产品 | 差异化下降 | Medium | 重新扫描并强化开放 JSON / QA、可测证据 | OPEN |
| R06 | Graph Hacks/GitLab/HackerRank 时间冲突 | 交付失败 | High | 前置最小集成、压缩 P2、明确冻结日期 | OPEN |
| R07 | Qloo Rate Limit / 云服务成本 | 评委无法运行 | High | 限流、预算、合规缓存、预案与故障提示 | OPEN |
| R08 | 模型凭空编造 Qloo 证据 | 信誉/评分损失 | Critical | Evidence ID 只能来自工具响应、类型校验、失败测试 | OPEN |
| R09 | 公网 Demo 无法稳定在线 | 失分或失格 | Critical | 外网 Playwright、匿名冒烟、持续运行预算 | OPEN |
| R10 | 参赛资格/奖项/旧代码许可理解错误 | 参赛风险 | High | Rules 文件快照、合同清单、正式核验 | OPEN |

---

## 12. Devpost 草稿文本（可直接复制）

**Project Name**：TasteGate AI — The Cultural Quality Gate for AI Agents  
**Tagline**：Audit, repair, and verify AI recommendations with Qloo-powered cultural intelligence.

### Project Overview — English

> AI agents can generate convincing recommendations, but how do we know whether those recommendations are genuinely aligned with the user's cultural interests?
>
> TasteGate AI is a cultural quality assurance layer for AI agents, powered by Qloo's Taste AI API.
>
> Rather than acting as another recommendation chatbot, TasteGate is designed to evaluate existing AI-generated recommendations, verify entities and cultural affinities using Qloo's Taste Graph, identify unsupported recommendations or constraint violations, and propose evidence-backed alternatives.
>
> The planned application will provide an interactive before-and-after comparison, explainable recommendation evidence, bounded agentic repair workflows, and structured audit reports that developers can integrate into their own AI applications.
>
> Our goal is to make cultural grounding a testable, auditable, and reusable capability for trustworthy AI recommendation systems.
>
> **Planned stack:** Qloo Taste AI, AI Agents, TypeScript, Next.js, Tool Calling, Evaluation, and Explainable AI.

> 这份草稿采用 **planned / designed to** 等计划语态；正式提交必须根据已经通过的功能改写为实际完成事实，移除未实现的术语和功能承诺。

---

## 13. 评委 3 分钟演示草稿（非赛事必填要求）

| 时间 | 画面与论点 | 需要的真实证据 |
|---|---|---|
| 0:00–0:20 | 痛点：普通 Agent 推荐流畅但证据不可靠 | 一个上游 AI 推荐示例 |
| 0:20–0:40 | TasteGate 定位：Cultural Quality Gate | 简化架构，明确 Qloo 是关键工具 |
| 0:40–1:20 | Audit：实体/硬规则/证据 | Live API 过程及日志映射 |
| 1:20–1:55 | Repair：Qloo 支撑替代 | 原候选 vs 新候选和来源 |
| 1:55–2:20 | Proof：Evidence Ledger、JSON | 可展开 evidence IDs 与约束规则 |
| 2:20–2:45 | Eval：同输入 LLM-only vs TasteGate | 真实记录、样本量、局限 |
| 2:45–3:00 | 产品价值、公开 Repo、Live Demo 链接 | 真实可访问入口 |

**严禁**：把静态剪辑、离线 JSON、mock trace 当成完整真实调用；没有证据的结果必须标明演示模拟。

---

## 14. 每轮 Review 的固定模板（后续可直接复制并追加）

```markdown
## Review — YYYY-MM-DD — Phase N

### 基线
- Project: TasteGate AI
- Commit SHA:
- Branch:
- Reviewer:
- Environment:
- API Mode: live / fixture / mixed (标明每条调用)
- Submitted artifact(s):

### 必要证据
- Rule/eligibility changes since last review:
- Qloo live trace (redacted):
- Data contract/provenance:
- UI screenshot / recording:
- Test command and exact result:
- Deployed external URL and cold-start result:
- Evaluation dataset revision:

### 评分对照（独立判断，非官方得分）
- Technological Implementation: PASS / PARTIAL / BLOCKED
- Design: PASS / PARTIAL / BLOCKED
- Potential Impact: PASS / PARTIAL / BLOCKED
- Quality of the Idea: PASS / PARTIAL / BLOCKED

### Critical findings
- P0:
- P1:
- P2:

### Risks updated
- Rxx:

### Ship decision
- GO / GO WITH CONDITIONS / BLOCKED
- Explicit next actions:
- Evidence required before next review:
```

### Reviewer 必查项目

- 真实 Qloo API 调用是否发生于**本次评审 commit**，而非旧日志？
- 所有前端显示的 Qloo ID、偏好信号与后端日志是否能对上？
- 解释、关联、地理与主观偏好是否被混为一谈？
- 是否发生了多重 LLM 洗稿而不改变底层决策的“假 Agentic”？
- `BLOCKED / UNKNOWN / REVIEW` 是否能从刻意设计的坏输入触发？
- 审查失败时能否阻止结果被误标成 verified？
- 如果移除 Qloo API，项目是否失去**核心价值**？若没有，说明 sponsor 集成不足。
- 外网是否能跑；README 是否能从全新环境复现；License 是否正确？
- 承诺是否全部与实现一致，所有指标是否能独立重算？

---

## 15. 官方参考与历史研究入口

1. Qloo Agentic Hackathon：https://qloo.devpost.com/
2. Official Rules：https://qloo.devpost.com/rules
3. Devpost Project Gallery：https://qloo.devpost.com/project-gallery
4. Qloo API Documentation：https://docs.qloo.com/
5. Qloo Hackathon Developer Guide：https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
6. Qloo Hackathon Kit：https://github.com/qloo/qloo-hackathon-kit
7. 本人已上传研究资料：《全球 AI Agent、MCP、数字人和 GenAI 竞赛研究百科》v1.4，2026-10-16，第 06 章 Qloo。
8. 上文 2.2 竞品 Devpost URL（请每次 Review 随时更新）。

**资料来源与可靠性说明**：
- **用户操作事实**：Devpost 登记成功 + Qloo API Key Request Form 获得收件确认，依据本轮用户提供截图。
- **赛事快照**：官方网页与研究百科 v1.4（并不等于永久实时状态）。
- **竞品分析**：此前研究中的公开项目搜索；未独立审计完整参赛作品池。
- **工程方案与预测**：本次规划，不应写成已完成事实。

---

## 16. 版本历史与下一步

| 版本 | 日期 | 变更 | 决策 |
|---|---|---|---|
| v1.0 | 2026-10-16 | 固化竞赛情报、竞品研究、弃用 TasteCompass、选定 TasteGate、架构、Eval、风险和 Review 模板 | **等待 Key；先建立 Devpost 草稿，再做 API 可行性探针** |

### 当前下一步（按顺序）

- [ ] 创建 Qloo Devpost `TasteGate AI` 项目草稿（**不要最终提交**）。
- [ ] 等候 API Key 邮件；若数个工作日无结果，联系 Qloo 官方支持；不要公开密钥。
- [ ] 获取最新 Rules / API 文档快照，标出 25% 评分与交付要求是否有变化。
- [ ] Codex 实现最小 Qloo Probe，产出脱敏 live 请求/响应及契约测试。
- [ ] 对核心假设 `Audit → Repair → Revalidate → Proof` 作 Go/No-Go 判断。
- [ ] 通过后再开发完整 UI、Benchmark 与公共部署。

**最终策略结论**：优先 `TasteGate AI`，因为它用 Qloo 提供 Agent 推荐的文化依据，并以独立质量门禁 + Evidence + Repair 产生差异化。但该选题的“可审核与修复”能力仍是**待真实数据验证的中心假设**；其是否具备真正冲奖优势，要由 Live Probe、Benchmark、竞品二次审查和评委真实体验共同决定。
