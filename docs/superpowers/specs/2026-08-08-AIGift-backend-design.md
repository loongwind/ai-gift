# AIGift 后端技术方案设计

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 创建日期 | 2026-08-08 |
| 状态 | 待评审 |
| 关联 | PRD：`2026-08-01-AIGift-prd-design.md`；前端设计：`2026-08-08-AIGift-frontend-design.md` |
| 参考实现 | fixbill（`/Users/loongwind/Documents/Workspace/Test/fixbill`） |

> 本文档是 AIGift 后端（微信云开发）实现的权威技术契约。产品行为以 PRD 为准，技术细节以本文档为准。所有文案中文。

---

## 1. 概述与设计目标

AIGift 后端是一个部署在微信云开发（CloudBase）上的 **单云函数 + 内部路由** 服务，与作者另一个项目 fixbill **共用同一云环境**，靠 `aigift_` 前缀隔离资源。核心职责：用户/对象管理、AI 礼物推荐、额度计费、节日提醒（订阅消息）、分享裂变、数据埋点。

**设计目标**：

1. **最大化复用 fixbill**——目录结构、`index.js`/`router.js`/`common/`/`middleware/` 骨架、db 访问层、鉴权与校验中间件、错误处理、测试 mock 方案直接照搬，降低实现与运维成本。
2. **支撑后续开发落地**——给出可粘贴的目录树、完整数据模型（列/类型/索引）、API 契约清单、4 条核心业务流的代码骨架、环境变量与部署 checklist。
3. **关键链路稳健**——额度扣减用单语句原子更新防超扣；AI 调用有重试 + 静态兜底；提醒任务幂等可重入。
4. **安全合规**——AI Key 仅存云函数环境变量；写操作全经鉴权；用户输入过内容安全检测。

**非目标（MVP 不做）**：管理后台 UI（PRD §15.2 的可配置项用环境变量 + DB 常量承载）、电商商品库、深度学习推荐、多模型 A/B。

---

## 2. 架构总览

### 2.1 资源隔离（对齐 PRD §11.1）

| 资源 | fixbill | AIGift |
|---|---|---|
| CloudBase 环境 | `cloud1-1g2pvzhx7a072799` | **共用同一环境** |
| 云函数 | `fixbill_app` | `aigift_app`（独立） |
| 数据库表 | `fixbill_*` | `aigift_*`（独立） |
| 定时触发器 | `fixbill_*` | `aigift_*`（独立） |
| 环境变量 | `FIXBILL_*` | `AIGIFT_*` |

> ⚠️ 部署前置：若 AIGift 小程序为独立 AppID，需在 CloudBase 控制台将该 AppID 加入 `cloud1-1g2pvzhx7a072799` 的"环境共享授权列表"，前端方能通过 env-sharing 访问云函数。

### 2.2 请求处理流

```
小程序 wx.cloud.callFunction({ name:'aigift_app', data:{ route, ...payload } })
   │
   ▼
index.js
   ├─ Timer 事件?  → TIMER_ROUTE_MAP[TriggerName] → handler({}, {isInternal:true}, ctx) → 包 {code:0,...}
   ├─ parseEvent(event) → { route, data, token, wxContext, userInfo }
   ├─ isPublicRoute(route)?  → userInfo=null（如 user/autoLogin）
   │   else authenticate(route,data,token,source) → userInfo（openid 自动建号）
   ├─ router.getHandler(route) → handler（handlerCache 懒加载）
   └─ handler({...data,_route:route}, userInfo, {...context,WX_CONTEXT})
        ├─ 返回裸 data → index.js 包 {code:0,message,data}
        └─ 抛 BusinessError → errorHandler → {code,message,data:null}
```

- **统一响应信封**：`{ code, message, data }`，`code=0` 成功，`data` 恒存在（失败为 null）。
- **数据库**：CloudBase Node SDK 的 `models.$runSQLRaw`（托管连接，无连接池代码）。`db.js` 自实现 `?` 占位符转义 + 指数退避重试（MAX_RETRIES=3）。
- **事务**：CloudBase `$runSQLRaw` **不支持真事务**。fixbill 的 `transaction(cb)` 是伪事务（commit/rollback 为空函数）。本设计**只在多表写入时使用伪事务做"语句串行 + 抛错中止"**；**额度扣减等强一致性需求改用单语句条件更新**（见 §6.1），不依赖伪事务。

---

## 3. 目录结构

镜像 fixbill，新增 `ai/` 抽象层与 8 个业务模块。

```
cloudfunctions/aigift_app/
├── index.js              Timer 分发(TIMER_ROUTE_MAP) + parseEvent + 鉴权注入（复用 fixbill）
├── router.js             route→handler 表 + PUBLIC_ROUTES + handlerCache（复用）
├── package.json          @cloudbase/node-sdk / axios / uuid / jsonwebtoken / bcryptjs(+dev jest)
├── common/
│   ├── db.js             cloudbase init 单例 + query(sql,params) + transaction(cb)（复用）
│   ├── constants.js      ErrorCodes / 业务枚举 / 必填选填字典 / 兜底礼物清单 / 额度规则默认值
│   ├── response.js       success(data) / error(code,message)（复用）
│   ├── security.js       checkText / checkMedia / getAccessToken（内存缓存）（复用+扩展）
│   └── utils.js          parseEvent / generateUUID / parseJSONSafe 等（复用）
├── middleware/
│   ├── auth.js           authenticate（openid 自动建号、归属校验入口）（复用）
│   ├── errorHandler.js   BusinessError + errorHandler（复用）
│   ├── validator.js      validate(data, rules) 声明式校验（复用）
│   └── rateLimit.js      【新增】通用限流中间件（DB-backed 滑窗，覆盖写入路由，评审 S4）
├── ai/                   【新增】AI 推荐抽象层
│   ├── provider.js       RecommendationProvider 基类 + 工厂 getProvider()
│   ├── deepseekProvider.js  默认实现：axios 调 DeepSeek，结构化 JSON
│   ├── promptBuilder.js  System/User Prompt 组装（含学习闭环历史注入）
│   └── fallback.js       场景静态兜底清单（按 occasion 取）
└── modules/
    ├── user/             autoLogin（含每日登录奖励）/ getUserInfo（额度+用户资料）/ deleteAccount（注销·级联删除，评审 I6）
    ├── recipient/        create / update / delete(软删) / list / detail
    ├── recommend/        generate（额度扣减+AI+兜底）/ regenerate（复用快照+去重，评审 I3）
    ├── quota/            rewardVideoServerCallback（服务端回调·S3）/ shareReward / getLogs
    ├── reminder/         list / add / remove / listPendingConsents（待重新授权的循环提醒，供前端 onShow 拉取）
    ├── share/            inviteCallback
    ├── feedback/         create（整体评分）/ updateItem（采纳/不采纳/收藏）
    ├── history/          list（按对象/时间分组+分页，评审 I9）
    └── system/           scanReminders（定时·订阅消息）/ reconcileQuota（定时·对账巡检 S1）/ dbKeepAlive（定时）
```

**handler 统一签名**（同 fixbill）：

```js
module.exports = async function handler(data, userInfo, handlerContext) {
  // data: 业务参数（index.js 已合并 _wxContext/_route）
  // userInfo: auth 产物（用户路由 {userId/openid}，公开路由 null，Timer {isInternal:true}）
  // handlerContext: {...context, WX_CONTEXT}，供 getOpenId(handlerContext) 取 openid
  // 返回裸 data，由 index.js 包成 {code:0,...}
};
```

---

## 4. 数据模型（MySQL，`aigift_` 前缀）

PRD §10 已给出 9 张表与关键字段，本节给出**工程级定义**（列类型、索引、PRD 未明确的列与约束）。JSON 列用 `JSON.stringify` 写、`JSON.parse` 读（同 fixbill，不用 MySQL 原生 JSON 函数）。所有表带 `created_at`/`updated_at`；NULL 比较用 `<=>`；软删除用 `deleted_at <=> NULL`。主键 `id` 用 UUID（varchar(36)）。

### 4.1 `aigift_users` — 用户与额度

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | UUID |
| `openid` | varchar(64) UQ | 微信 openid |
| `nickname` | varchar(64) | 昵称（可由前端同步） |
| `avatar` | varchar(512) | 头像 URL |
| `free_quota` | int DEFAULT 3 | **原子扣减目标列**（额度缓存值） |
| `used_count` | int DEFAULT 0 | 累计生成次数（统计用） |
| `last_login_date` | date | 最近登录日 |
| `daily_login_claimed` | date | 每日登录奖励幂等位 |
| `status` | tinyint DEFAULT 1 | 1 正常 / 0 禁用 |
| `created_at`/`updated_at` | datetime | |

- 索引：`openid` UQ。
- **额度对账**：`aigift_quota_logs` 为流水审计源；`free_quota` 是实时余额（原子更新保证一致）。可定期跑对账任务 `SUM(amount) == free_quota` 巡检。

### 4.2 `aigift_recipients` — 送礼对象画像

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `owner_openid` | varchar(64) | 归属（idx） |
| `name` | varchar(64) | 称呼（必填） |
| `gender` | varchar(16) | 男/女/其他（必填） |
| `age_range` | varchar(16) | 年龄段（必填） |
| `age` | int | 具体年龄（选填） |
| `birthday` | date | 生日（选填，可生成提醒） |
| `relationship` | varchar(16) | 关系（必填） |
| `closeness` | varchar(16) | 亲密程度 |
| `occupation` | varchar(64) | 职业/身份 |
| `life_stage` | varchar(16) | 人生阶段 |
| `personality` | JSON | 性格标签数组 |
| `hobbies` | JSON | 爱好数组 |
| `material_prefs` | JSON | 物质偏好数组 |
| `diet` | varchar(16) | 饮食禁忌 |
| `living` | varchar(16) | 居住情况 |
| `taboos` | text | 禁忌/雷区自由文本（强约束） |
| `completeness_score` | int | 完整度分（保存时由后端重算） |
| `deleted_at` | datetime | 软删除（null=有效） |
| `created_at`/`updated_at` | datetime | |

- 索引：`(owner_openid, deleted_at)`。
- 多选字段（personality/hobbies/material_prefs）以 JSON 数组存取。

### 4.3 `aigift_important_dates` — 重要日期提醒

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `recipient_id` | varchar(36) | 关联对象（idx） |
| `owner_openid` | varchar(64) | 归属（idx） |
| `date` | date | 日期 |
| `occasion` | varchar(32) | 场合（生日/纪念日…） |
| `is_recurring` | tinyint DEFAULT 0 | 是否每年循环 |
| `notified_year` | int DEFAULT 0 | **已推送年份**（循环提醒按年去重） |
| `created_at` | datetime | |

- 索引：`date`、`(recipient_id)`。
- 去重逻辑见 §6.3。

### 4.4 `aigift_recommendations` — 推荐主记录

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `owner_openid` | varchar(64) | |
| `recipient_id` | varchar(36) | 关联对象（可空，若临时对象） |
| `recipient_snapshot` | JSON | **对象快照**（对象日后修改不影响历史复现） |
| `input_context` | JSON | 本次输入（occasion/budget/count/idea 等） |
| `occasion` | varchar(32) | |
| `budget` | int | |
| `count` | int | 推荐条数 |
| `model_provider` | varchar(32) | deepseek/… |
| `model_name` | varchar(64) | |
| `tokens_used` | int | |
| `cost_estimate` | decimal(10,4) | 估算成本（元） |
| `latency_ms` | int | |
| `is_fallback` | tinyint DEFAULT 0 | 是否兜底产出（质量分析用） |
| `created_at` | datetime | |

- 索引：`(owner_openid, created_at)`、`(recipient_id)`。

### 4.5 `aigift_recommendation_items` — 单条建议 + 反馈

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `recommendation_id` | varchar(36) | FK→recommendations（idx） |
| `recipient_id` | varchar(36) | 冗余（idx，便于按对象聚合） |
| `name` | varchar(128) | 礼物名 |
| `reason` | text | 推荐理由 |
| `price_range` | varchar(64) | "¥100 – 200" |
| `purchase_hint` | varchar(128) | 购买渠道提示 |
| `tags` | JSON | 标签数组 |
| `match_score` | int | 匹配分 |
| `feedback` | enum('pending','accepted','rejected','saved') DEFAULT 'pending' | |
| `feedback_at` | datetime | |
| `created_at` | datetime | |

- 索引：`(recommendation_id)`、`(recipient_id, feedback)`（学习闭环查询用）。
- **设计要点**：把建议条目从主记录拆出独立表，采纳率等指标可直接 `GROUP BY feedback` 聚合，无需解析 JSON（对齐 PRD §10）。

### 4.6 `aigift_quota_logs` — 额度流水

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `openid` | varchar(64) | |
| `type` | enum('new_user','reward_video','share','daily_login','consume','refund','adjustment') | `adjustment`=对账巡检补偿（S1） |
| `amount` | int | +加 / −扣 |
| `balance_after` | int | 操作后余额（审计） |
| `ref_type` | varchar(32) | recommendation/invite/video… |
| `ref_id` | varchar(36) | |
| `created_at` | datetime | |

- 索引：`(openid, created_at)`。

### 4.7 `aigift_invites` — 分享裂变

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `inviter_openid` | varchar(64) | 邀请者（idx） |
| `invitee_openid` | varchar(64) **UQ** | 被邀请者（UQ 天然幂等） |
| `rewarded` | tinyint DEFAULT 0 | 是否已奖励邀请者 |
| `reward_log_id` | varchar(36) | 关联的奖励流水 |
| `created_at` | datetime | |

### 4.8 `aigift_feedback` — 推荐整体满意度

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `recommendation_id` | varchar(36) | idx |
| `openid` | varchar(64) | |
| `rating` | tinyint | 1–5 |
| `comment` | text | |
| `created_at` | datetime | |

### 4.9 `aigift_analytics_events` — 埋点

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(36) PK | |
| `openid` | varchar(64) | idx |
| `event_name` | varchar(64) | idx（漏斗/事件） |
| `event_data` | JSON | |
| `created_at` | datetime | idx |

- 索引：`(event_name, created_at)`。

---

## 5. 路由与鉴权

### 5.1 route 字符串格式与分类

`"模块/动作"`，例 `user/autoLogin`、`recommend/generate`。三类：

| 分类 | 判断 | 鉴权 |
|---|---|---|
| 公开路由 | `PUBLIC_ROUTES.includes(route)` | 免鉴权，userInfo=null |
| 内部路由 | `route.startsWith('system/')` | Timer 传 `{isInternal:true}` 绕过；HTTP 调用需 `AIGIFT_INTERNAL_TASK_SECRET` token |
| 业务路由 | 其余 | openid 鉴权（自动建号），handler 内联归属校验 |

- `PUBLIC_ROUTES = ['user/autoLogin', 'quota/rewardVideoServerCallback']`。
  - `user/autoLogin`：openid 由 `wxContext` 提供（云函数 `event` 自带），**无需前端传 loginCode/无需 code2session**（评审 4.2：loginCode 冗余，砍掉）。
  - `quota/rewardVideoServerCallback`：靠微信广告签名校验鉴权（非 openid），见 §6.4。
- **MVP 不实现 admin/JWT 模块**（fixbill 有，AIGift 砍掉）。

### 5.2 鉴权机制（复用 fixbill `auth.js`）

- 小程序来源：从 `data._wxContext`（index.js 注入）取 openid，**不走 JWT**。
- **自动建号**：authenticate 内查不到 `aigift_users` 即 INSERT（发新人额度 +3、写 `new_user` 流水），前端免显式注册。
- **归属校验**：handler 内联——查到记录后 `row.owner_openid !== openid` 抛 `NOT_FOUND`（不抛 FORBIDDEN，避免泄露资源存在性）。

### 5.3 错误码分段（`common/constants.js`）

复用 fixbill 分段编号风格，AIGift 段：

```
SUCCESS              0
VALIDATION_ERROR  1001   通用校验
UNAUTHORIZED      1002
FORBIDDEN         1003
RATE_LIMITED      1004   限流
USER_NOT_FOUND    2001   用户
RECOMMEND_FAIL    3001   recommend（AI+兜底均失败，触发退款）
QUOTA_INSUFFICIENT 4001  quota
QUOTA_DAILY_VIDEO_CAP 4002  激励视频达日上限
REMINDER_CONSENT_MISSING 5001  reminder（订阅授权缺失/发送失败）
INVITE_ALREADY_RECORDED 5002  share（被邀请者已记录，幂等返回 rewarded:false 时用）
CONTENT_UNSAFE    6001   ai/content
AI_TIMEOUT        6002
INTERNAL_ERROR    9001   系统
```

---

## 6. 核心业务流

### 6.1 额度原子扣减（防超扣核心）

**不依赖真事务**，用单语句条件更新（CloudBase MySQL 单语句原子）。扣减与流水写入放入伪事务 `transaction(cb)` 串行执行（评审 S1 方案 A），并配套对账巡检任务（方案 B）兜底崩溃窗口：

```js
// modules/recommend/generate.js 内，调用 AI 之前
async function consumeQuota(openid, refId) {
  // 伪事务串行：UPDATE 与 INSERT 同一逻辑单元，任一失败抛错中止（review S1 方案A）
  return await transaction(async (tx) => {
    const [r] = await tx.query(
      'UPDATE aigift_users SET free_quota = free_quota - 1, used_count = used_count + 1, updated_at = NOW() WHERE openid = ? AND free_quota >= 1 AND status = 1',
      [openid]
    );
    if (!r || r.affectedRows !== 1) {
      throw new BusinessError(ErrorCodes.QUOTA_INSUFFICIENT, '免费额度不足');
    }
    const [u] = await tx.query('SELECT free_quota FROM aigift_users WHERE openid = ?', [openid]);
    await tx.query(
      'INSERT INTO aigift_quota_logs (id, openid, type, amount, balance_after, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?,?,NOW())',
      [generateUUID(), openid, 'consume', -1, u.free_quota, 'recommendation', refId]
    );
    return u.free_quota;
  });
}

// 补偿退款（仅当 AI 与兜底均失败时）——同样在伪事务内串行
async function refundQuota(openid, refId) {
  return await transaction(async (tx) => {
    await tx.query('UPDATE aigift_users SET free_quota = free_quota + 1 WHERE openid = ?', [openid]);
    const [u] = await tx.query('SELECT free_quota FROM aigift_users WHERE openid = ?', [openid]);
    await tx.query(
      'INSERT INTO aigift_quota_logs (id, openid, type, amount, balance_after, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?,?,NOW())',
      [generateUUID(), openid, 'refund', 1, u.free_quota, 'recommendation', refId]
    );
    return u.free_quota;
  });
}
```

**对账巡检（review S1 方案 B）**：新增 `system/reconcileQuota`（每日定时，见 §8）。逻辑：对每个活跃用户，`expected = 初始额度 + SUM(奖励类流水) - SUM(consume 流水)`，与 `users.free_quota` 比对；不一致则写一条 `type='adjustment'` 补偿流水（以流水为准修正 `free_quota`）并告警。流水表 `type` 枚举增加 `adjustment`。

> ⚠️ 残留风险（诚实标注）：CloudBase 无真 ACID，伪事务无法回滚已提交的单语句。极端崩溃（UPDATE 后、INSERT 前）仍可能产生"已扣无流水"。`reconcileQuota` 每日巡检将其修正为 adjustment 流水，业务影响可忽略（最坏单次偏差 1 额度）。

**扣减时机**：先扣后生成（防并发刷量）。`free_quota >= 1` 的 WHERE 在单语句内原子完成"检查+扣减"，并发请求只有余额足够的能拿到 `affectedRows=1`，天然防超扣。

### 6.2 AI 推荐（Provider 抽象 + 兜底）

`recommend/generate` 顺序：

```js
async function generate(data, userInfo, ctx) {
  const openid = getOpenId(ctx);
  validate(data, [
    { field: 'recipientId', rules: [{ type: 'string' }] }, // 或 inline 画像
    { field: 'occasion', rules: [{ type: 'required' }, { type: 'enum', values: OCCASIONS }] },
    { field: 'budget', rules: [{ type: 'required' }, { type: 'positive' }] },
    { field: 'count', rules: [{ type: 'enum', values: [3,5,8,10] }] },
  ]);

  // 1) 限流由路由层（index.js 对写入路由统一应用 rateLimit 中间件，见 §7）完成，handler 内不重复

  // 2) 内容安全：自由文本过审（不扣额度）
  const freeText = [data.taboos, data.personalIdea, data.supplement].filter(Boolean).join(' ');
  if (freeText) {
    const t = await checkText(freeText, openid, 2);
    if (!t.safe) throw new BusinessError(ErrorCodes.CONTENT_UNSAFE, '输入包含敏感内容');
  }

  const recId = generateUUID();
  // 3) 原子扣额度
  const balance = await consumeQuota(openid, recId);

  try {
    // 4) 对象快照：recipientId 有则校验归属；否则用 inlineRecipient 创建新对象后快照
    //    （inline 必须持久化为 aigift_recipients 记录，否则 items.recipient_id 为空、学习闭环失效）
    let recipient = data.recipientId
      ? await loadOwnedRecipient(data.recipientId, openid)        // helper：SELECT + 归属校验
      : await createRecipientFromInline(data.inlineRecipient, openid); // helper：校验必填 + INSERT + 回读
    if (!recipient) throw new BusinessError(ErrorCodes.VALIDATION_ERROR, '对象不存在');

    // 5) 学习闭环：查该对象最近 N 条已反馈建议
    const history = recipient
      ? await query('SELECT name, feedback FROM aigift_recommendation_items WHERE recipient_id = ? AND feedback IN (?,?) ORDER BY created_at DESC LIMIT 10', [recipient.id, 'accepted', 'rejected'])
      : [];

    // 6) 调 AI：初次 7s + 重试 5s，仍失败走兜底（对齐 PRD §8.4；延迟预算见 §6.2 末）
    let result, isFallback = false;
    const provider = getProvider(); // 默认 DeepSeek
    const budgets = [7000, 5000]; // 初次 7s、重试 5s
    for (let attempt = 0; attempt < budgets.length && !result; attempt++) {
      try { result = await provider.generate({ recipient, input: data, history }, { timeoutMs: budgets[attempt] }); }
      catch (e) { /* 记日志，进入下一轮重试 */ }
    }
    if (!result) { isFallback = true; result = fallback(data); } // ai/fallback.js 静态清单

    // 7) 落库 recommendation + items（伪事务；items 单条批量 INSERT，全成或全败，杜绝半成品 review S2）
    try {
      await transaction(async (tx) => {
        await tx.query('INSERT INTO aigift_recommendations (id, owner_openid, recipient_id, recipient_snapshot, input_context, occasion, budget, count, model_provider, model_name, tokens_used, cost_estimate, latency_ms, is_fallback, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
          [recId, openid, recipient?.id || null, JSON.stringify(recipient || {}), JSON.stringify(data), data.occasion, data.budget, data.count, result.model, result.modelName, result.tokensUsed, result.cost, result.latencyMs, isFallback ? 1 : 0]);
        if (result.results.length) {
          const placeholders = result.results.map(() => '(?,?,?,?,?,?,?,?,\'pending\',NOW())').join(',');
          const params = [];
          for (const it of result.results) {
            params.push(generateUUID(), recId, recipient?.id || null, it.name, it.reason, it.priceRange, it.purchaseHint, JSON.stringify(it.tags || []), it.matchScore);
          }
          await tx.query(`INSERT INTO aigift_recommendation_items (id, recommendation_id, recipient_id, name, reason, price_range, purchase_hint, tags, match_score, feedback, created_at) VALUES ${placeholders}`, params);
        }
      });
    } catch (e) {
      // 补偿：删孤儿主记录 + 退款，避免"有主记录无 items"的半成品
      await query('DELETE FROM aigift_recommendations WHERE id = ?', [recId]);
      await refundQuota(openid, recId);
      throw e;
    }

    return { recommendationId: recId, items: result.results, isFallback, balance };
  } catch (e) {
    // AI+兜底均失败（理论兜底必成功）→ 退款
    if (e.code !== ErrorCodes.QUOTA_INSUFFICIENT) await refundQuota(openid, recId);
    throw e;
  }
}
```

**Provider 抽象**：

```js
// ai/provider.js
class RecommendationProvider {
  // opts.timeoutMs 控制单次超时；返回结构化结果或抛错（由调用方重试/兜底）
  async generate(context, opts = {}) { // → { results:[{name,reason,priceRange,purchaseHint,tags,matchScore}], summary, model, modelName, tokensUsed, cost, latencyMs }
    throw new Error('not implemented');
  }
}
function getProvider() {
  const name = (process.env.AIGIFT_AI_PROVIDER || 'deepseek').toLowerCase();
  if (name === 'deepseek') return new DeepSeekProvider();
  // 预留：openai / qwen
  return new DeepSeekProvider();
}

// ai/deepseekProvider.js
const axios = require('axios');
class DeepSeekProvider extends RecommendationProvider {
  async generate(ctx, opts = {}) {
    const { systemPrompt, userPrompt } = buildPrompt(ctx); // ai/promptBuilder.js
    const timeoutMs = opts.timeoutMs || 7000;
    const t0 = Date.now();
    const resp = await axios.post('https://api.deepseek.com/chat/completions', {
      model: process.env.AIGIFT_AI_MODEL || 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' }, // 优先 JSON 模式（待确认2：上线前需 POC 验证稳定性）
    }, { headers: { Authorization: `Bearer ${process.env.AIGIFT_AI_API_KEY}` }, timeout: timeoutMs });
    const raw = resp.data.choices[0].message.content;
    const parsed = parseJSONSafe(raw); // 容错：失败抛错触发外层重试/兜底
    return { ...parsed, model: 'deepseek', modelName: resp.data.model, tokensUsed: resp.data.usage?.total_tokens || 0, cost: estimateCost(resp.data.usage), latencyMs: Date.now() - t0 };
  }
}
```

**延迟预算（评审 I2）**：单次 AI 调用典型 3-6s，初次超时 7s、重试 5s、兜底 <0.5s。PRD §5.4「P95 < 8s」针对**主成功路径**（单次成功，占 90%+）成立；重试/兜底属长尾（>P95），前端用 AI 思考动画掩盖感知延迟。整体链路：冷启动(≤2s) + DB/内容安全(≤0.5s) + AI(≤7s) + 落库(≤0.5s) ≈ P95 < 10s（含长尾），主路径 < 8s。**上线前需用真实 DeepSeek API 做 POC 实测**（待确认2），若主路径 P95 偏高则下调 `budgets` 或关掉重试。

- **重试**：provider 抛错（网络/超时/JSON 非法）时循环重试至多 2 次（初次 + 1 次），仍失败才走兜底，对齐 PRD §8.4。
- **inline 对象**：`createRecipientFromInline` 校验必填（name/gender/ageRange/relationship）后 INSERT 并回读，保证 `items.recipient_id` 正确关联、学习闭环与历史可用。
- **兜底清单** `ai/fallback.js`：按 `occasion` 维护若干静态精选礼物（curated，含 name/tags/priceRange/purchaseHint），装饰通用 reason，`matchScore` 给固定区间。MVP 不入库（符合 PRD §8.4）。
- **成本控制**：`estimateCost(usage)` 按模型单价估算；日聚合 `SUM(cost_estimate)` 超 `AIGIFT_DAILY_BUDGET` 写告警日志（MVP 不硬拦截）。
- **`recommend/regenerate` 契约（评审 I3）**：
  - **消耗额度**：是，扣 1 次（同 generate，走 `consumeQuota`）。
  - **数据源**：复用原 recommendation 的 `recipient_snapshot` + `input_context`（不读最新对象，保证"基于此再推荐"的可复现语义）。
  - **去重**：将原 recommendation 的 items 名称作为"避免重复"注入 prompt（`promptBuilder` 增加 `excludeNames` 入参）。
  - **与"基于此再推荐"的关系**：PRD §5.5 的「基于此再推荐」= 前端从历史跳 recommend 页并预填 + 调 `regenerate`；二者是同一能力的不同入口（历史入口 vs 结果页"换一批"入口）。
  - **限流**：与 generate 共享限流窗口（见 §7）。

### 6.3 提醒 + 订阅消息（fixbill 没有，全新）

**前端配合**：用户新增/编辑重要日期时 `wx.requestSubscribeMessage`（模板 ID = `AIGIFT_REMINDER_TMPL_ID`）收集一次性授权。

**后端 `system/scanReminders`**（cron `0 0 9 * * * *`，每天 9:00）：

```js
async function scanReminders(_data, userInfo, _ctx) {
  if (!userInfo || !userInfo.isInternal) throw new BusinessError(ErrorCodes.FORBIDDEN, '仅内部任务可调用');
  const accessToken = await getAccessToken(); // common/security.js，内存缓存 + 过期刷新
  const rows = await query(
    `SELECT d.*, r.name AS recipient_name FROM aigift_important_dates d
     LEFT JOIN aigift_recipients r ON r.id = d.recipient_id
     WHERE d.notified_year != YEAR(CURDATE()) AND (
       (d.is_recurring = 0 AND d.date = CURDATE())
       OR (d.is_recurring = 1 AND MONTH(d.date) = MONTH(CURDATE()) AND DAY(d.date) = DAY(CURDATE()))
     )`
  );
  let sent = 0;
  for (const d of rows) {
    const ok = await sendSubscribeMessage(accessToken, {
      touser: d.owner_openid,
      template_id: process.env.AIGIFT_REMINDER_TMPL_ID,
      page: 'pages/history/history',
      data: buildReminderData(d), // 按模板字段填充
    });
    if (ok) {
      await query('UPDATE aigift_important_dates SET notified_year = YEAR(CURDATE()) WHERE id = ?', [d.id]);
      sent++;
    }
    // 失败（授权配额耗尽等）跳过，次年再试；不无限重试
  }
  return { success: true, scanned: rows.length, sent };
}
```

- `getAccessToken`：调微信 `cgi-bin/token`（`WX_MINI_APPID/SECRET`），内存缓存至 `expires_in` 前 5 分钟。
- `sendSubscribeMessage`：调 `cgi-bin/message/subscribe/send`，失败返回 false。
- **已知限制（写入文档）**：每次 `requestSubscribeMessage` 授权 = 1 次发送配额；循环提醒每年需重新授权。MVP：建日期时收 1 次、推 1 次；次年到期前在 App 打开时由前端提示再授权。

### 6.4 激励视频 / 分享 / 每日登录奖励

| 来源 | 后端实现 | 幂等/防刷 |
|---|---|---|
| **激励视频** | **服务端回调** `quota/rewardVideoServerCallback`（PUBLIC，签名校验）：微信广告服务端在用户看完视频后回调，校验签名 + trans_id 幂等后发奖 | trans_id 去重（已发奖则跳过）；日上限降至 **3**；openid 短窗异常检测 |
| 分享 | `share/inviteCallback`：被邀请者首带 `inviter` scene 进入时调 | `INSERT aigift_invites (invitee_openid UQ)`；插入成功（非重复）才奖 inviter `+2` + 流水，置 `rewarded=1` |
| 每日登录 | `user/autoLogin` 内：`daily_login_claimed != CURDATE()` | `UPDATE aigift_users SET daily_login_claimed = CURDATE() ...` + `+1` 流水；同日重复登录不重复发 |

**激励视频服务端回调（评审 S3，提升为 MVP P0）**：激励视频是核心变现杠杆，客户端上报可被直接构造 `callFunction` 伪造（白嫖额度 → 广告收入归零）。MVP 接入微信流量主服务端回调：

1. CloudBase 控制台开启 `aigift_app` 的 HTTP 访问，得到 `https://tcb-api.../http/aigift_app`。
2. 微信公众平台「流量主 → 广告位管理」配置该 URL 为激励视频回调地址。
3. 新增路由 `quota/rewardVideoServerCallback`（加入 `PUBLIC_ROUTES`，**靠签名校验而非 openid 鉴权**），微信回调体含 `{ openid, trans_id, adUnitId, isEnded, signature, ... }`。
4. handler 流程：`verifySignature(body, AIGIFT_AD_CALLBACK_SECRET)` → 失败拒；`isEnded !== true` 拒；查 `aigift_quota_logs` 该 trans_id 是否已发奖（幂等）→ 已发跳过；查今日 `reward_video` 计数 < 日上限(3) → 发奖 `+3` + 写流水（`ref_id=trans_id`）。
5. **前端配套**：`onClose` 仅做 UI 跳转（"奖励审核中"），额度到账由服务端回调驱动；前端在结果页/首页 `onShow` 重新拉 `user/getUserInfo` 刷新额度，或在等待期轮询 1-2 次。

```js
// modules/quota/rewardVideoServerCallback.js（PUBLIC，签名校验）
async function rewardVideoServerCallback(data) {
  if (!verifyAdSignature(data, process.env.AIGIFT_AD_CALLBACK_SECRET))
    throw new BusinessError(ErrorCodes.FORBIDDEN, '签名校验失败');
  if (!data.isEnded) return { success: false, reason: 'not_ended' };
  const todayCount = await countTodayRewardVideo(data.openid);
  if (todayCount >= VIDEO_DAILY_CAP) throw new BusinessError(ErrorCodes.QUOTA_DAILY_VIDEO_CAP, '今日激励视频已达上限');
  // trans_id 幂等：INSERT ... WHERE NOT EXISTS（或先查后插）
  const awarded = await tryAwardByTransId(data.openid, data.trans_id, 3);
  return { success: awarded };
}
```

> `verifyAdSignature` 按微信流量主服务端回调签名算法实现（具体算法以微信文档为准，secret 存 `AIGIFT_AD_CALLBACK_SECRET`）。`tryAwardByTransId` 用 trans_id 唯一性保证幂等（同一视频只发一次）。日上限 3 + 异常检测（如同一 openid 1 分钟内多次回调）作为纵深防御。

> 奖励额度数值（视频 +3 / 分享 +2 / 登录 +1 / 新人 +3）集中 `common/constants.js`，可被环境变量覆盖。

### 6.5 注销与数据删除（评审 I6，MVP 即实现）

微信小程序审核日益重视隐私合规，PRD §13 要求"用户数据可删除接口"。新增 `user/deleteAccount`（鉴权路由）：

- 软删 `aigift_users`（`status=0` + 置 `deleted_at`，保留 30 天冷数据便于误删恢复，到期由巡检硬删）。
- 级联处理关联数据：硬删 `aigift_recipients` / `aigift_important_dates` / `aigift_recommendations` / `aigift_recommendation_items` / `aigift_quota_logs` / `aigift_invites` / `aigift_feedback` / `aigift_analytics_events`（`WHERE owner_openid = ?` 或 `openid = ?`）。
- 清除登录态（前端同步清 Storage）。
- 返回 `{ success: true }`，前端跳转回登录页。

> 因 CloudBase 无真事务，级联删除按"先删子表、后置用户 status"顺序串行；中途失败记告警日志，由 `reconcileQuota` 同类巡检或人工补删。删除是幂等操作（重复调用无副作用）。

---

## 7. 横切关注点

- **校验**：`validator.validate(data, rules)` 声明式（required/string/number/positive/array/date/maxLength/enum）。
- **错误**：`BusinessError(code,msg)` + `errorHandler` 兜底 catch；`system/*` handler 统一改抛 `BusinessError`（修 fixbill 抛裸 Error 的瑕疵）。
- **限流（评审 S4）**：`middleware/rateLimit.js` 提供 openid 维度的 **DB-backed 滑窗限流**（按 openid+route 查最近一条记录的 `created_at` 判窗口，索引查询，避免 N+1）。覆盖所有写入/高频路由：
  - `recommend/generate` / `recommend/regenerate`：≥ 5s 间隔（防刷推荐）。
  - `quota/rewardVideoServerCallback`：日上限 3 + 短窗异常检测（防回调伪造刷量）。
  - `recipient/create` / `feedback/create` 等：轻量限流（如 2s 间隔）。
  - 实现备注：DB-backed 保证多云函数实例一致；内存 Map 仅作单实例内的快速短路。超限抛 `RATE_LIMITED(1004)`。
- **安全**：AI Key 仅环境变量；写操作经鉴权 + 归属校验；输入长度/枚举校验；自由文本过 `checkText`。
- **内容安全**：复用 fixbill `security.js`（checkText 同步、checkMedia 异步）。AIGift 对自由文本（taboos/idea/supplement）在生成前检测。
- **可观测性与告警（评审 I10）**：
  - **指标采集**：关键 handler 在 `try/finally` 记录 `aigift_analytics_events`（`event_name=api_call`，data 含 route/latencyMs/success/errorCode）+ AI 调用记 model/tokens/cost；CloudBase 日志同时落 `console` 供平台采集。
  - **关键指标**：云函数错误率（目标 < 1%）、推荐 P95、AI 成本日累计、额度异常（对账偏差数）、激励视频回调成功率。
  - **告警渠道**：日均成本超 `AIGIFT_DAILY_BUDGET`、错误率突增、对账偏差 > 阈值 → 通过 CloudBase 监控 + 微信服务通知/邮件告警（MVP 用日志 + 手动巡检，V2 接自动告警）。
  - **版本可追溯（评审 I5）**：部署时把 Git SHA 注入环境变量 `AIGIFT_VERSION`，错误日志带上版本号，便于回滚定位。

---

## 8. 定时触发器与部署

### 8.1 触发器（`aigift_` 前缀）

| 触发器 | Cron（7 段） | 路由 | 说明 |
|---|---|---|---|
| `aigift_daily_reminder` | `0 0 1 * * * *` ⚠️ | `system/scanReminders` | 北京时间每天 9:00 扫描到期提醒，下发订阅消息 |
| `aigift_quota_reconcile` | `0 0 18 * * * *` ⚠️ | `system/reconcileQuota` | 每日对账巡检（评审 S1 方案 B），修正 free_quota/流水偏差 |
| `aigift_db_keepalive` | `0 */20 * * * * *` | `system/dbKeepAlive` | 每 20 分钟 MySQL 保活 |

> ⚠️ **cron 时区（待确认 3）**：CloudBase/微信云开发定时触发器的 7 段 cron 时区需上线前实测确认（历史 TCB 为 UTC）。若为 UTC，北京 9:00 = UTC 1:00 → `0 0 1 * * * *`；北京次日 02:00 对账 = UTC 18:00 → `0 0 18 * * * *`。上表按 UTC 编排；若实测为北京时间，则 reminder 改 `0 0 9 * * * *`、reconcile 改 `0 0 2 * * * *`。**部署前务必用一次空跑验证**。
> **keepalive 复用（待确认 6）**：若 fixbill 已有 DB keepalive 触发器，单一环境内一个即够，AIGift 可不重复建 `aigift_db_keepalive`——部署前确认。

### 8.2 部署 checklist

- 部署用 `manageFunctions.updateFunctionCode`（**非** `manageCloudRun`），`functionRootPath` 指向 `cloudfunctions/`，`functionName:'aigift_app'`。
- 触发器用 `createFunctionTrigger`，**一次性传完整触发器列表**（会整体替换，避免互相覆盖）。
- 部署后等 10-30s 生效。
- 环境变量配置见 §9。
- 若独立 AppID：CloudBase 控制台将 AIGift AppID 加入环境共享授权列表；微信流量主后台配置激励视频回调 URL（HTTP 网关地址）。
- **共用环境监控（评审 I1）**：关注 CloudBase MySQL 慢查询数、连接池利用率、云函数冷启动时间、并发数。定义迁移独立环境的触发条件：连续 3 天推荐 P95 > 10s、或 MySQL 连接池利用率 > 80%、或错误率 > 1%——任一命中则评估迁移。
- **灰度/回滚（评审 I5）**：CloudBase 支持按比例灰度发布；保留最近 2 个可回滚版本，回滚流程文档化。

---

## 9. 环境变量与配置

| 变量 | 用途 | 必需 |
|---|---|---|
| `CLOUDBASE_ENV_ID` / `TCB_ENV_ID` | db.js 初始化 cloudbase | 是 |
| `AIGIFT_WX_APPID` / `AIGIFT_WX_SECRET` | AIGift 小程序换 access_token、订阅消息发送（评审 4.4：**独立 AppID 时必须用 AIGIFT_ 前缀**，避免与 fixbill 的 `WX_MINI_*` 互相覆盖） | 是 |
| `AIGIFT_AI_API_KEY` | DeepSeek API Key（仅云函数侧） | 是 |
| `AIGIFT_AI_PROVIDER` | 默认 deepseek | 否 |
| `AIGIFT_AI_MODEL` | 默认 deepseek-chat | 否 |
| `AIGIFT_REMINDER_TMPL_ID` | 提醒订阅消息模板 ID | 是 |
| `AIGIFT_AD_CALLBACK_SECRET` | 激励视频服务端回调签名校验密钥（S3） | 是 |
| `AIGIFT_INTERNAL_TASK_SECRET` | system/* 路由 HTTP 调用 token | 是 |
| `AIGIFT_DAILY_BUDGET` | 日均成本告警阈值（元） | 否 |
| `AIGIFT_QUOTA_NEW_USER` / `_VIDEO` / `_SHARE` / `_LOGIN` | 额度规则（默认 3/3/2/1） | 否 |
| `AIGIFT_VIDEO_DAILY_CAP` | 激励视频每日上限（默认 3） | 否 |

> 注：fixbill CLAUDE.md 中的 `FIXBILL_MYSQL_HOST/...` 在当前 db.js 中未被使用（连接由 `$runSQLRaw` 托管），属历史遗留，AIGift 不沿用。
> **getAccessToken 缓存**：`security.js` 内存缓存按 `(appid, secret)` 维度缓存 token；AIGift 用 `AIGIFT_WX_*`、fixbill 用 `WX_MINI_*`，两套互不干扰（评审 4.4）。

---

## 10. 测试策略

复用 fixbill 的 Jest + mock 方案：`tests/` 在仓库根，`jest.config.js` 设 `testEnvironment:'node'`、`moduleNameMapper` mock `@cloudbase/node-sdk`，每个测试 `jest.mock('common/db')` 链式 `mockResolvedValueOnce`。

**重点单测**：

| 用例 | 覆盖点 |
|---|---|
| `consumeQuota` 余额不足 | `affectedRows=0` → 抛 `QUOTA_INSUFFICIENT`，不写流水 |
| `consumeQuota` 正常 | `affectedRows=1` → 余额递减 + 写 consume 流水（伪事务串行） |
| `generate` AI 失败→兜底 | provider 抛错 → `is_fallback=1`，仍返回结果、不退款 |
| `generate` AI+兜底均失败 | 退款 +1 + 写 refund 流水 |
| `generate` 内容不安全 | 扣额度前拒绝，`QUOTA` 不变 |
| `generate` 落库失败补偿（S2） | items 批量 INSERT 失败 → 删孤儿主记录 + 退款，无半成品 |
| `regenerate` 去重（I3） | 原 items 名称注入 excludeNames，复用原 snapshot |
| `rewardVideoServerCallback` 签名失败（S3） | 伪造/无签名 → FORBIDDEN，不发奖 |
| `rewardVideoServerCallback` 幂等 | 同 trans_id 二次回调 → 不重复发奖 |
| `rewardVideoServerCallback` 日上限 | 当日第 4 次 → `QUOTA_DAILY_VIDEO_CAP` |
| `reconcileQuota` 偏差修正（S1） | free_quota 与流水推算不一致 → 写 adjustment 流水并修正 |
| `scanReminders` 循环去重 | 同年重复扫描 `notified_year` 命中不再发 |
| `scanReminders` 非内部调用 | 抛 FORBIDDEN |
| `deleteAccount` 级联（I6） | 用户软删 + 所有关联表硬删，重复调用幂等 |
| `inviteCallback` 幂等 | 重复 INSERT invitee UQ 冲突 → 不重复发奖 |
| `autoLogin` 每日登录幂等 | 同日二次登录不发 |
| `rateLimit` 窗口（S4） | generate 5s 内二次调用 → `RATE_LIMITED` |

覆盖率目标：分支/函数/行 ≥ 85%（对齐 fixbill）。

---

## 11. API 契约清单（前端消费）

所有调用：`wx.cloud.callFunction({ name:'aigift_app', data:{ route, ...params } })`，响应统一 `{code,message,data}`。

| route | 入参（关键） | 返回 data |
|---|---|---|
| `user/autoLogin` | —（openid 由 wxContext 提供） | `{ userId, openid, nickname, avatar, freeQuota, isNew }`（含每日登录奖励发放） |
| `user/getUserInfo` | — | `{ userId, nickname, avatar, freeQuota, usedCount }` |
| `user/deleteAccount` | —（鉴权） | `{ success }`（软删用户 + 级联硬删关联数据，评审 I6） |
| `recipient/list` | — | `{ list:[{id,name,relationship,gender,ageRange,hobbies,completenessScore,...}] }` |
| `recipient/detail` | `{ id }` | `{ recipient:{全字段}, importantDates:[] }` |
| `recipient/create` | `{ name,gender,ageRange,relationship,... }` | `{ recipient }` |
| `recipient/update` | `{ id, ...fields }` | `{ recipient }` |
| `recipient/delete` | `{ id }` | `{ success }`（软删） |
| `recommend/generate` | `{ recipientId? , inlineRecipient?, occasion, budget, count, giftType?, taboos?, personalIdea?, supplement? }`（recipientId 与 inlineRecipient 二选一；inline 会创建对象记录） | `{ recommendationId, items:[{name,reason,priceRange,purchaseHint,tags,matchScore}], isFallback, balance }` |
| `recommend/regenerate` | `{ recommendationId }`（鉴权+限流） | 同 generate；**复用原 snapshot+input_context，原 items 名称注入 prompt 去重，消耗 1 额度**（评审 I3） |
| `feedback/updateItem` | `{ itemId, feedback:'accepted'\|'rejected'\|'saved' }` | `{ success }` |
| `feedback/create` | `{ recommendationId, rating, comment? }` | `{ success }` |
| `quota/getLogs` | `{ page, pageSize }` | `{ list:[{type,amount,balanceAfter,title,createdAt}], total, page, hasMore }` |
| `quota/rewardVideoServerCallback` | `{ openid, trans_id, adUnitId, isEnded, signature }`（**PUBLIC·签名校验**，微信广告服务端回调） | `{ success }`（签名失败 FORBIDDEN；trans_id 幂等；日上限 3） |
| `share/inviteCallback` | `{ inviterOpenid }` | `{ rewarded }`（幂等：被邀请者已记录则返回 `{rewarded:false}`，不抛错） |
| `reminder/list` | — | `{ list:[{id,recipientId,recipientName,date,occasion,isRecurring}] }` |
| `reminder/listPendingConsents` | — | `{ list:[{reminderId,recipientName,date,occasion}] }`（`is_recurring=1` 且需重新授权的循环提醒，供前端 onShow 弹起 requestSubscribeMessage） |
| `reminder/add` | `{ recipientId, date, occasion, isRecurring }` | `{ reminder }` |
| `reminder/remove` | `{ id }` | `{ success }` |
| `history/list` | `{ recipientId?, page, pageSize }` | `{ list:[{recommendationId,recipientName,occasion,budget,createdAt,items:[{name,feedback}]}], total, hasMore }` |

---

## 12. 相对 fixbill 的复用 / 新增 / 调整

**直接复用**：`index.js`（Timer 分发 + parseEvent + 鉴权注入）、`router.js`（routes 表 + handlerCache + PUBLIC_ROUTES）、`common/db.js`（cloudbase 单例 + query + transaction）、`common/response.js`、`common/utils.js`、`middleware/auth.js`、`middleware/errorHandler.js`、`middleware/validator.js`、Jest + mock 测试骨架。

**新增**：`ai/` 抽象层（provider/deepseek/promptBuilder/fallback）；`middleware/rateLimit.js` 通用限流（S4）；激励视频**服务端回调 + 签名校验 + trans_id 幂等**（S3）；订阅消息（`getAccessToken` + `subscribeMessage.send`）；额度原子扣减与退款（伪事务串行）；`system/reconcileQuota` 对账巡检（S1）；`user/deleteAccount` 注销级联（I6）；自由文本内容安全；学习闭环历史注入；成本估算与日预算告警；监控埋点与版本号（I10/I5）。

**调整**：环境变量名（`AIGIFT_*`，access_token 用 `AIGIFT_WX_*` 与 fixbill 隔离）；触发器新增 `aigift_quota_reconcile`、cron 按时区编排；表前缀 `aigift_`；错误码分段（新增 `RATE_LIMITED`/`INVITE_ALREADY_RECORDED`）；`system/*` handler 改抛 `BusinessError`。

**砍掉**：admin 模块与 JWT（MVP 不做管理后台）；前端 loginCode（openid 由 wxContext 提供）。

---

## 13. 已知限制与遗留决策

1. **伪事务残留（S1/S2 已缓解）**：CloudBase 无真 ACID。`generate` 落库用批量 INSERT（全成全败）+ 失败补偿（删孤儿 + 退款）杜绝 items 半成品；额度扣减用伪事务串行 + `reconcileQuota` 日巡检修正。极端崩溃的"1 额度偏差"由日对账自动修正，业务影响可忽略。
2. **激励视频依赖服务端回调（S3 已修）**：发奖由微信广告服务端回调驱动，需流量主开通 + 回调 URL/`AIGIFT_AD_CALLBACK_SECRET` 正确配置；配置错误会导致发奖失败（前端轮询/重拉 `getUserInfo` 兜底感知）。
3. **订阅消息年度授权**：循环提醒次年需重新授权（wx 限制），前端 `onShow` 经 `reminder/listPendingConsents` 弹起 `requestSubscribeMessage` 引导。
4. **JSON 列查询（评审 I7）**：MVP 仅存储/全量读取；V2"推荐质量分析后台/画像沉淀"若需按标签查询，需迁移为关联表或引入虚拟列索引。
5. **激励视频/分享/每日登录额度数值** 可被环境变量覆盖，便于运营调参。

---

## 14. 待确认事项（评审第五节，含假设默认值）

> 以下 6 项在开发前需确认；未确认前按"假设默认"推进设计，不阻塞落地，但实现时须以实测/实际配置为准。

| # | 待确认事项 | 假设默认（本文档据此编写） | 确认方式 |
|---|---|---|---|
| 1 | AIGift 是否独立 AppID | 独立 AppID + env-sharing 共用 fixbill 环境 | 产品/技术负责人定论；若同主体则简化前端 `cloud.js` |
| 2 | DeepSeek `response_format:json_object` 稳定性 | 可用 | 上线前用真实 API POC；不稳则降级为正则抽 `json` 块 |
| 3 | CloudBase 定时触发器 cron 时区 | UTC（北京 9:00 = UTC 1:00） | 部署前一次空跑验证；若北京时间则改回 `0 0 9` |
| 4 | CloudBase Node SDK 是否已支持真事务 | 当前版本不支持 | 编码前查 SDK 文档；若支持则 `generate` 落库可改真事务 |
| 5 | 订阅消息模板字段 | 待创建（`buildReminderData` 按模板字段填） | 微信公众平台创建模板后确认字段 |
| 6 | fixbill 是否已有 DB keepalive 触发器 | 已有 → AIGift 复用、不重复建 | 部署前查 fixbill 触发器列表 |
