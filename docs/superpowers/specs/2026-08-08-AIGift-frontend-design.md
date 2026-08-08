# AIGift 前端技术方案设计（微信小程序）

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 创建日期 | 2026-08-08 |
| 状态 | 待评审 |
| 关联 | PRD：`2026-08-01-AIGift-prd-design.md`；后端设计：`2026-08-08-AIGift-backend-design.md`；原型：`prototype/` |
| 参考实现 | fixbill（`/Users/loongwind/Documents/Workspace/Test/fixbill/miniprogram`） |

> 本文档是 AIGift 前端（原生微信小程序）实现的权威技术契约。产品行为以 PRD 为准，UI 视觉以 `prototype/` 高保真原型为准（配色与布局），技术细节以本文档为准。所有文案中文。

---

## 1. 概述与设计目标

AIGift 前端是一个**原生微信小程序**（无框架，CommonJS `require`，与 fixbill 同构），在桌面"手机框"里还原原型所模拟的小程序体验。4 个 tabBar（推荐/对象/历史/我的）+ 1 个结果覆盖页。核心闭环：选对象 → 填画像+场景 → 生成 AI 推荐 → 反馈 → 沉淀历史。

**设计目标**：

1. **最大化复用 fixbill 前端骨架**——`cloud.js` 单例 + env-sharing、`api.js` 统一解包、`helpers.js`、`custom-tab-bar`、globalData 脏标记刷新模式、表单（`data-field` 统一输入 + errors map + submitting 互斥）。
2. **真接入组件化**——fixbill 的 `components/` 是死代码（页面未注册），AIGift 把高频卡片真正抽成组件并在页面 `usingComponents` 注册。
3. **复刻原型设计系统**——完整移植暖色配色令牌；字体按评审决策用**纯系统字体**（不加载远程字体），靠配色 + 字号/字重层级 + 留白还原"策展"气质。
4. **支撑开发落地**——给出目录树、页面清单、组件清单、完整度算法、广告/分享/订阅的前端配套代码骨架、API 契约对齐（见后端设计 §11）。

**非目标（MVP 不做）**：商品库与购买链接、社区 UGC、深度学习推荐、管理后台。

---

## 2. 架构总览

### 2.1 云开发环境共享

AIGift 与 fixbill **共用云环境** `cloud1-1g2pvzhx7a072799`（资源归属 AppID `wx6519e3f00ba15d11`）。AIGift 小程序前端用 env-sharing 访问：

```js
// utils/cloud.js（复用 fixbill，改 RESOURCE_APPID/ENV 注释说明）
const RESOURCE_APPID = 'wx6519e3f00ba15d11';   // 资源归属（fixbill 主体）
const RESOURCE_ENV   = 'cloud1-1g2pvzhx7a072799';
```

> ⚠️ 前置：CloudBase 控制台把 AIGift 的 AppID 加入该环境的"环境共享授权列表"。若 AIGift 不单独申请 AppID（挂 fixbill 同主体），则去掉 env-sharing、`cloud.js` 改用普通 `wx.cloud.init`——以实际为准，本文档按"独立 AppID + env-sharing"编写。

### 2.2 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 框架 | 原生小程序 | 与 fixbill 同构、PRD 全程用 wx API（wx.login/wx.cloud/requestSubscribeMessage）、无构建 |
| 状态 | `globalData` + 脏标记 + Storage | 复用 fixbill 三件套，避免引入 MobX/Redux |
| tabBar | 自定义（`custom-tab-bar`） | 复用 fixbill，支持自定义样式/图标/角标 |
| 字体 | 系统字体栈 | 评审决策：远程字体小程序不可直连，主包体积优先 |
| 组件 | 真注册接入 | 修 fixbill 组件未接入的坑 |
| 测试 | Jest（纯函数）+ miniprogram-simulate（组件）+ UAT | 见 §11 |

---

## 3. 目录结构

```
miniprogram/
├── app.js                  onLaunch→initCloud→autoLogin + globalData（含脏标记/广告计数）
├── app.json                pages 注册 + custom tabBar(4) + window 全局样式 + 云函数配置
├── app.wxss                设计令牌（CSS 变量：仅配色 + 尺寸） + 全局工具类
├── project.config.json     appid + 云环境 + 最低基础库(2.19.4+)
├── sitemap.json
├── custom-tab-bar/         4 tab 组件（复用 fixbill）
├── images/                 tab 图标 / logo / 分享封面（扁平）
├── pages/
│   ├── recommend/          首页（tab）
│   ├── result/             结果覆盖页（navigateTo，非 tab）
│   ├── recipients/         对象列表（tab）
│   ├── recipient-edit/     对象新建/编辑（navigateTo）
│   ├── recipient-detail/   对象详情：画像+关联历史+重要日期（navigateTo）
│   ├── history/            历史（tab）
│   ├── profile/            我的（tab）
│   └── settings/           设置：隐私/关于/反馈/注销（navigateTo，评审 4.1）
├── components/             【真接入：页面 .json 的 usingComponents 注册】
│   ├── completeness-bar/   完整度进度条 + 分档徽章
│   ├── quota-bar/          额度条 +「看视频 +N」
│   ├── segment-group/      单选/多选分段选择器（表单主力）
│   ├── recipient-form/     画像表单（首页内联 & 编辑页共用）
│   ├── gift-card/          礼物建议卡（含采纳/不采纳/收藏）
│   ├── recipient-card/     对象卡（列表/横向轨）
│   ├── ad-slot/            广告位封装（banner/插屏/激励）
│   └── empty-state/        空态
└── utils/
    ├── cloud.js            initCloud 单例 + env-sharing + callFunction（复用 fixbill）
    ├── api.js              callApi 统一 {code,message,data} 解包 + 自动 loading（复用）
    ├── constants.js        ApiRoutes / ErrorCodes / 业务枚举 / 字典 DICT / 场景模板 / CacheKeys / 广告单元ID / REMINDER_TMPL_ID / 额度规则
    ├── helpers.js          formatXxx / showError/Success/Confirm / debounce（复用）
    ├── auth.js             autoLogin 态恢复 / syncProfile（复用）
    ├── ad.js               banner/插屏/激励实例 + 频控 + 待弹标志（复用并扩展）
    └── completeness.js     【新增纯函数】computeCompleteness(form)
```

---

## 4. 云开发初始化与登录

### 4.1 initCloud 单例（复用 fixbill）

```js
// utils/cloud.js
let cloudInstance = null, initPromise = null;
const RESOURCE_APPID = 'wx6519e3f00ba15d11', RESOURCE_ENV = 'cloud1-1g2pvzhx7a072799';
async function initCloud() {
  if (initPromise) return initPromise;
  if (cloudInstance) return cloudInstance;
  initPromise = (async () => {
    wx.cloud.init({ env: RESOURCE_ENV, traceUser: true });
    const cloud = new wx.cloud.Cloud({ resourceAppid: RESOURCE_APPID, resourceEnv: RESOURCE_ENV });
    await cloud.init();
    cloudInstance = cloud;
    return cloudInstance;
  })();
  return initPromise;
}
async function callFunction(options) { const cloud = await initCloud(); return cloud.callFunction(options); }
module.exports = { initCloud, callFunction };
```

### 4.2 autoLogin 流（复用 fixbill）

```js
// app.js
App({
  globalData: {
    userInfo: null, openid: null, isLoggedIn: false,
    // 跨页刷新脏标记
    needRefreshRecommend: false, needRefreshRecipients: false,
    needRefreshHistory: false, needRefreshProfile: false,
    // 会话级广告计数
    sessionInterstitialCount: 0,
  },
  onLaunch() { initCloud().then(() => this.doAutoLogin()); },
  onShow() { if (!this.globalData.isLoggedIn) this.doAutoLogin(); },
  doAutoLogin() {
    if (this.globalData.isLoggedIn) return;            // 幂等
    // openid 由云函数 wxContext 自动提供（云开发特性），无需前端 wx.login/code2session（评审 4.2）
    callApi('user/autoLogin', {}, false)
      .then((d) => {
        this.globalData.userInfo = d;
        this.globalData.openid = d.openid;
        this.globalData.isLoggedIn = true;
        wx.setStorageSync('userInfo', d);
        // 每日登录奖励由后端 autoLogin 内处理，前端只刷新额度显示
      })
      .catch((err) => showError(err.message));
  },
});
```

- **无 token**，全靠 openid；前端缓存 `userInfo` 到 Storage + globalData。
- 全局取用：`getApp().globalData.userInfo`。

---

## 5. API 封装与全局状态

### 5.1 callApi（复用 fixbill）

```js
// utils/api.js
async function callOnce(route, data, showLoading) {
  if (showLoading) wx.showLoading({ title: '加载中...', mask: true });
  try {
    const res = await callFunction({ name: 'aigift_app', data: { route, ...data } });
    wx.hideLoading();
    if (res.result && res.result.code !== undefined && res.result.code !== 0) {
      return Promise.reject({ code: res.result.code, message: res.result.message });
    }
    return res.result && res.result.data !== undefined ? res.result.data : res.result;
  } catch (err) {
    wx.hideLoading();
    return Promise.reject({ code: err.code || -1, message: err.message || '网络异常，请稍后重试' });
  }
}
// 网络错误（code=-1）自动重试 1 次；业务错误（code>0）不重试（评审 I4）
async function callApi(route, data = {}, showLoading = true) {
  try { return await callOnce(route, data, showLoading); }
  catch (err) {
    if (err.code === -1) return await callOnce(route, data, showLoading);  // 网络错误重试一次
    throw err;
  }
}
module.exports = { callApi, get: callApi, post: callApi, put: callApi, del: callApi };
```

- resolve 出 `data`，reject 出 `{code,message}`；页面统一 `showError(err.message)`。
- 静默调用（如埋点、刷新额度）传 `showLoading=false`。
- **网络错误重试**：`code=-1`（云函数冷启动/超时/断网）自动重试 1 次；业务错误码（如 `RATE_LIMITED`/`QUOTA_*`）不重试，直接交页面处理。

### 5.2 跨页刷新：globalData 脏标记（复用 fixbill 模式）

写操作成功 → 置对应脏标记 `true`；目标页 `onShow` 检查命中则重载并清 flag：

```js
// pages/recipients/index.js
onShow() {
  this.syncTabBar();
  if (this.data.initialized && !getApp().globalData.needRefreshRecipients) return;
  this.loadList();
}
// loadList 末尾：getApp().globalData.needRefreshRecipients = false;
```

脏标记：`needRefreshRecommend / needRefreshRecipients / needRefreshHistory / needRefreshProfile`。

---

## 6. 页面与交互

页面注册顺序（`app.json`）：recommend 首页在前。tabBar 4 项：recommend / recipients / history / profile。result/recipient-edit/recipient-detail 为 navigateTo 页。

### 6.1 recommend（首页，核心）

布局（自上而下）：

1. **吸顶 `completeness-bar`**：实时完整度 + 分档徽章 + 必填缺失提示。
2. **`quota-bar`**：剩余次数 +「看视频 +N」入口（额度不足时高亮）。
3. **对象横向轨**（`recipient-card` 横滑）：选已有对象（预填画像）/ +新建（跳 recipient-edit）。
4. **场景模板标签**（`segment-group` 单行横滑）：一键预填 occasion/budget/giftType 等。
5. **画像表单**（`recipient-form` 组件）：name/relationship/gender/ageRange（必填）+ closeness/occupation/lifeStage/personality(多选)/hobbies(多选)/materialPrefs(多选)/diet/living/taboos。
6. **送礼参数**：occasion(必填)/budget(滑块)/giftType(多选)/delivery/count(3/5/8/10)/personalIdea/supplement。
7. **banner 广告位**（`ad-slot`）。
8. **吸底「生成推荐」按钮**：必填缺失置灰 + 提示；额度不足跳激励视频弹窗。

关键逻辑：

```js
// 输入统一收集（data-field）
onFieldInput(e) {
  const { field, multi } = e.currentTarget.dataset;
  if (multi) { /* 多选 toggle */ }
  else this.setData({ [`form.${field}`]: e.detail.value, [`errors.${field}`]: '' });
  this.refreshCompleteness();   // debounce 后算完整度
},
async onGenerate() {
  const { reqMissing } = computeCompleteness(this.data.form);
  if (reqMissing > 0) return showError(`还差 ${reqMissing} 个必填项`);
  const app = getApp();
  if ((app.globalData.userInfo.freeQuota || 0) <= 0) return this.openReward();
  this.setData({ generating: true });           // 显示 AI 思考动画
  try {
    const res = await callApi('recommend/generate', this.buildPayload(), false);
    app.globalData.lastResult = res;
    app.globalData.userInfo.freeQuota = res.balance;
    app.globalData.needRefreshHistory = true;
    app.globalData.needRefreshProfile = true;
    markPendingInterstitial();                  // 标记待弹插屏（频控在结果页消费）
    wx.navigateTo({ url: '/pages/result/result' });
  } catch (err) { showError(err.message); }
  finally { this.setData({ generating: false }); }
},
```

- 表单超长，靠分段卡片 + 吸顶完整度锚定体验；`scroll-view` 分块。
- 生成中 `generating` 态显示 AI 思考动画，对冲 P95<8s 等待感。

### 6.2 result（结果覆盖页）

- 礼物卡列表（`gift-card`）：名称/匹配分（印章式）/价格/标签/AI 理由/购买提示 + 每条采纳·不采纳·收藏。
- 平均匹配分汇总头。
- 底部「换一批」（`recommend/regenerate`）、「分享 +2」（`onShareAppMessage`）、「返回继续编辑」。
- `onShow` 消费待弹插屏（首推不插，每会话 ≤2 次）。
- 反馈：`feedback/updateItem`，乐观更新卡片状态。

```js
onShow() { tryShowPendingInterstitial(); },
async onFeedback(e) {
  const { itemId, feedback } = e.currentTarget.dataset;
  // toggle：再点取消
  const next = this.data.activeFeedback[itemId] === feedback ? 'pending' : feedback;
  try {
    await callApi('feedback/updateItem', { itemId, feedback: next }, false);
    this.setData({ [`activeFeedback.${itemId}`]: next === 'pending' ? '' : next });
    if (feedback === 'accepted') showSuccess('已记录，将优化后续推荐');
  } catch (err) { showError(err.message); }
},
```

### 6.3 recipients / recipient-edit / recipient-detail

- **recipients**（tab）：对象卡列表（头像/关系/标签/完整度）+ 新建；点击跳 detail；长按/滑动删除（`recipient/delete`，软删）。
- **recipient-edit**（navigateTo）：复用 `recipient-form` 全量字段；按 `options.id` 区分新建/编辑；保存 `recipient/create|update`，置 `needRefreshRecipients/needRefreshRecommend`。
- **recipient-detail**（navigateTo）：画像只读 + 关联历史（点进跳 history 带 `recipientId`）+ 重要日期管理（新增时 `requestSubscribeMessage`，见 §9）。

### 6.4 history（tab）

- 按 对象/时间 分组；分页 `page/pageSize/hasMore`，`onReachBottom` 触发 `loadMore`，下拉刷新。
- 每条「基于此再推荐」：带 `recommendationId` 跳 recommend，注入上下文。

### 6.5 profile（tab）

- 额度详情 + 流水（`quota/getLogs` 分页）。
- 提醒列表（增删，`reminder/list|add|remove`）。
- **设置入口** → 独立 `pages/settings`（评审 4.1 差异1：设置项含隐私协议、关于、反馈、注销，适合独立页）：
  - 隐私协议：`web-view` 打开 H5 或独立 `pages/privacy`。
  - 反馈：复用表单页模式，提交 `feedback` 类内容。
  - 关于：版本号（含 `AIGIFT_VERSION`）/联繫方式。
  - **注销账号（评审 I6）**：`wx.showModal` 二次确认 → 调 `user/deleteAccount` → 清 Storage → 回登录页。

---

## 7. 完整度算法（从原型移植为纯函数）

```js
// utils/completeness.js
const REQUIRED = ['name', 'gender', 'ageRange', 'relationship', 'occasion', 'budget'];
const OPTIONAL_FIELDS = ['closeness','occupation','lifeStage','personality','hobbies',
  'diet','living','materialPrefs','taboos','personalIdea','giftType','delivery','deadline'];
// 注：字段集与原型 prototype/js/data.js 的 REQUIRED/OPTIONAL_FIELDS 逐字段一致；
// count（推荐条数）/supplement（其他补充）不计入完整度（前者是参数、后者是自由文本）。
const filled = v => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);

function computeCompleteness(form) {
  const reqFilled = REQUIRED.filter(k => filled(form[k])).length;
  const optFilled = OPTIONAL_FIELDS.filter(k => filled(form[k])).length;
  const pct = Math.min(100, Math.round(reqFilled / REQUIRED.length * 42 + optFilled / OPTIONAL_FIELDS.length * 58));
  return { pct, tier: pct >= 85 ? 2 : pct >= 60 ? 1 : 0, reqMissing: REQUIRED.length - reqFilled };
}
module.exports = { computeCompleteness, REQUIRED, OPTIONAL_FIELDS };
```

- **前端实时算**（输入 debounce 后刷新进度条/徽章/按钮置灰）。
- **后端保存时重算**并存 `recipients.completeness_score`（后端 `common/constants.js` 维护同一份字典作为契约）。
- **契约一致性（评审 I8）**：前后端两份字典须逐字段一致，靠人工同步易漂移。方案：把 REQUIRED/OPTIONAL_FIELDS/DICT/场景模板/预算分档抽取为仓库内单一 JSON 源文件，构建脚本同时生成前端 `utils/constants.dict.js` 与后端 `common/dict.js`；或新增 PUBLIC 路由 `config/dict` 让前端启动时拉取并缓存。MVP 先用"单一 JSON 源 + 手动同步 + 单测比对"，V2 再上 codegen/接口。

分档徽章：tier0 标准 / tier1 精准✨ / tier2 高精准🌟（文案同原型）。

---

## 8. 设计系统（令牌）

### 8.1 配色（完整移植原型暖色系，为 wxss CSS 变量）

```css
/* app.wxss */
page {
  /* paper / ink 中性 */
  --paper: #FAF4E8; --paper-2: #F3EAD6; --paper-3: #EADFC6;
  --ink: #2B231E; --ink-2: #5C5147; --ink-3: #8E8275;
  /* 四色系 */
  --rose: #B23A4E; --rose-d: #8C2838; --rose-l: #E9C7CD; --rose-bg: #FBEDF0;
  --gold: #BE933A; --gold-d: #9A7322; --gold-l: #E6D29A; --gold-bg: #F7F0D9;
  --sage: #7E906F; --sage-bg: #E9EEE2;
  --terra: #C77A57; --terra-bg: #F6E4D9;
  --line: #E6DAC4; --line-2: #D6C7AA;
  /* 尺寸 */
  --radius-sm: 10rpx; --radius-md: 16rpx; --radius-lg: 22rpx; --radius-xl: 30rpx;
  --space-xs: 8rpx; --space-sm: 16rpx; --space-md: 24rpx; --space-lg: 32rpx; --space-xl: 48rpx;
  background: var(--paper);
  color: var(--ink);
  font-size: 28rpx; line-height: 1.5;
}
```

### 8.2 字体（评审决策：纯系统字体）

```css
font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Helvetica, sans-serif;
```

- **不加载远程字体**（原型 Fraunces/Noto Serif SC/LXGW WenKai 走 CDN，小程序不可直连）。
- 靠**配色 + 字号/字重层级 + 大量留白 + 印章式匹配分**还原原型的"策展"气质，舍弃衬线/手写体。
- 标题层级用 `font-weight: 600/700` + 字号阶梯；关键数字（匹配分/额度）放大加粗 + 印章圆形容器。

### 8.3 标签→颜色映射（统一双轨）

- CSS 端：`.tag--rose/.tag--gold/.tag--sage/.tag--terra` 工具类。
- JS 端：`tagClass(tag)` 纯函数（`utils/helpers.js`），映射表单一处维护（修 fixbill CSS/JS 双份重复）。

---

## 9. 广告接入（微信流量主）

| 位 | API | 频控/触发 |
|---|---|---|
| Banner | `wx.createBannerAd`，首页/结果页/我的常驻 | `onError` 隐藏容器（见下降级） |
| 插屏 | `wx.createInterstitialAd`，生成成功后触发 | **首次推荐不插；每会话 ≤2 次**（globalData 计数） |
| 激励视频 | `wx.createRewardedVideoAd`，额度不足/主动点触发 | **`onClose` 仅做 UI；发奖由服务端回调驱动**（S3） |

```js
// utils/ad.js（复用 fixbill 并扩展）
function markPendingInterstitial() { getApp().globalData.pendingInterstitial = true; }
function tryShowPendingInterstitial() {
  const app = getApp();
  if (!app.globalData.pendingInterstitial) return;
  if (app.globalData.sessionInterstitialCount >= 2) return;        // 会话上限
  app.globalData.pendingInterstitial = false;
  app.globalData.sessionInterstitialCount += 1;
  const ad = wx.createInterstitialAd({ adUnitId: AD_UNITS.interstitial });
  ad.show().catch(() => {});
}

// 激励视频：页面 onLoad 预加载，onClose 仅 UI 跳转（发奖靠服务端回调，评审 S3）
function preloadRewardVideo() {
  const openid = getApp().globalData.openid;
  this._rewardVideo = wx.createRewardedVideoAd({
    adUnitId: AD_UNITS.rewardVideo,
    // 透传用户标识，供微信服务端回调原样回传（具体字段以流量主文档为准）
    userId: openid,
  });
  this._rewardVideo.load().catch(() => {});                        // 预加载减少等待
}
function watchRewardVideo() {
  const video = this._rewardVideo || wx.createRewardedVideoAd({ adUnitId: AD_UNITS.rewardVideo });
  video.onClose((res) => {
    if (!res.isEnded) return showSuccess('未看完视频，未获得额度');
    showSuccess('奖励审核中，稍后到账');                            // 不直接发奖
    // 服务端 rewardVideoServerCallback 由微信回调驱动发奖；
    // 前端 2-3s 后轮询一次 getUserInfo 刷新额度，或等 onShow 自然刷新
    setTimeout(() => refreshQuota(), 2500);
  });
  video.show().catch(() => video.load().then(() => video.show()));
}
```

- **广告单元 ID** 占位放 `constants.js#AD_UNITS`，过审后填真实 ID。
- **流量主准入降级（评审 4.2）**：小程序 UV < 1000 无法开通流量主，且审核期广告实例可能 `onError`。`ad-slot` 组件统一监听 `onError` → `hidden=true` 隐藏容器，避免空白/报错；激励视频 `onError` → 引导用户改走"分享 +2"补充额度。
- **激励视频安全（S3）**：前端**不再调用** `quota/rewardVideoCallback`；发奖完全由微信广告服务端回调 `quota/rewardVideoServerCallback`（签名校验 + trans_id 幂等）驱动。前端只负责播放与 UI 反馈，额度到账经 `getUserInfo` 刷新体现。详见后端 §6.4。
- **RATE_LIMITED 处理（S4）**：`callApi` reject 带 `code=1004` 时，`showError('操作太频繁，请稍后再试')`，不展示重试按钮（限流是预期行为）。

---

## 10. 分享裂变 + 提醒订阅消息

### 10.1 分享裂变

```js
// pages/recommend 或 result
onShareAppMessage() {
  const openid = getApp().globalData.openid;
  return {
    title: '不知道送什么？让 AI 帮你挑一份走心的礼物',
    path: `/pages/recommend/recommend?inviter=${openid}`,   // 带邀请者
    imageUrl: '/images/share-cover.jpg',
  };
},
onShareTimeline() { return { title: '...', query: `inviter=${openid}` }; },

// app.js onLaunch / onShow 解析被邀请者首次进入
const launchOptions = wx.getLaunchOptionsSync();
if (launchOptions.query && launchOptions.query.inviter && !wx.getStorageSync('inviteHandled')) {
  callApi('share/inviteCallback', { inviterOpenid: launchOptions.query.inviter }, false)
    .then(() => wx.setStorageSync('inviteHandled', true));   // 前端幂等；后端 invitee UQ 兜底
}
```

> **分享到账反馈（评审 4.1 差异2）**：分享奖励仅在**好友打开小程序后**经 `share/inviteCallback` 发放，非分享者主动触发即到账。结果页/首页「分享 +2」按钮旁须加文案「好友打开后自动到账」，避免用户期待即时反馈。

### 10.2 提醒订阅消息

```js
// pages/recipient-detail 新增/编辑重要日期时
const REMINDER_TMPL_ID = require('../../utils/constants').REMINDER_TMPL_ID; // 与后端 AIGIFT_REMINDER_TMPL_ID 同一模板
wx.requestSubscribeMessage({
  tmplIds: [REMINDER_TMPL_ID],
  success: (res) => {
    if (res[REMINDER_TMPL_ID] === 'accept') {
      callApi('reminder/add', { recipientId, date, occasion, isRecurring });
    } else {
      showError('未授权提醒，将无法发送');   // 仍可保存日期，但不发推送
    }
  },
});
```

- **已知限制**：每次授权 = 1 次发送配额；循环提醒次年需重新授权。MVP：建日期时收 1 次、推 1 次；次年到期前在 App 打开时由前端提示再授权。

### 10.3 循环提醒待授权队列（评审 4.2）

次年需重新授权的循环提醒，由前端在 App `onShow` 主动引导（避免用户漏掉）：

```js
// app.js onShow（已登录后，每日最多弹一次）
async function checkPendingConsents() {
  if (wx.getStorageSync('consentPromptedDate') === today) return;
  const { list } = await callApi('reminder/listPendingConsents', {}, false); // 后端返回需重新授权的循环提醒
  if (!list.length) return;
  wx.setStorageSync('consentPromptedDate', today);
  wx.requestSubscribeMessage({
    tmplIds: [REMINDER_TMPL_ID],
    success: (res) => { /* accept 则后端该日期本年可推送；reject 忽略，次日再提示 */ },
  });
}
```

> 后端 `reminder/listPendingConsents` 返回 `is_recurring=1` 且本年尚未授权/已推送过的提醒；前端用 Storage 控制每日只弹一次，避免打扰。

---

## 11. 错误处理与性能

- **错误**：`callApi` reject → `showError(err.message)`；表单 `errors` map + 红框；提交 `submitting` 互斥防重（复用 fixbill）。
- **重试按钮（评审 I4）**：关键操作（生成推荐、加载列表）失败且为网络错误时，展示空态组件的「重试」按钮回调原方法，而非仅 toast。
- **性能与资源（含评审 F1-F4）**：
  - 骨架屏/空态（`empty-state` 组件）覆盖列表加载。
  - history/profile 流水分页（`onReachBottom`）。
  - recommend 生成期 AI 思考动画，对冲等待感（**主路径 P95<8s，长尾（重试/兜底）<10s**，对齐后端 §6.2 延迟预算）。
  - **图片资源（F3）**：主包图片用 WebP、单文件 ≤ 200KB；图标优先 CSS/emoji，大图走 CloudBase 云存储 CDN。
  - **分包与预加载（F1/F2）**：MVP 7 页 + 组件若逼近主包 2MB，将 `recipient-edit/detail`、`history` 拆入分包，并在 `app.json` 配 `preloadRule` 预加载结果页所属分包，降低导航延迟。
  - **tab 角标同步（F4）**：`custom-tab-bar` 在 `onShow`/全局事件中读 `globalData.freeQuota` 刷新「我的」额度角标、「历史」新标记。
- **兼容**：`project.config.json` 设最低基础库 **2.19.4+**（env-sharing + 订阅消息 + 激励视频稳定支持）。

---

## 12. 测试策略

fixbill 前端无自动化测试。AIGift MVP：

| 层 | 工具 | 范围 |
|---|---|---|
| 纯函数单测 | Jest（与后端同仓库 `tests/`） | `completeness.js`、`helpers.formatXxx`、`tagClass`、预算分档 |
| 组件渲染 | `miniprogram-simulate` | `gift-card`、`completeness-bar`、`segment-group` 渲染与事件 |
| E2E 关键流 | 微信开发者工具自动化（`wechatide-skill`）+ 人工 UAT | 登录→建对象→填表单→生成→反馈；额度耗尽→激励→再生成；分享；提醒授权 |

覆盖率：纯逻辑层 ≥ 85%；UI 层以 UAT 兜底。纯函数单测优先（TDD：先写 `completeness.test.js` 再移植）。

---

## 13. 相对 fixbill 的复用 / 新增 / 调整

**直接复用**：`cloud.js`（改 RESOURCE 常量）、`api.js`、`helpers.js`、`auth.js`、`custom-tab-bar`、globalData 脏标记模式、表单（data-field + errors + submitting）模式。

**新增**：`utils/completeness.js` 纯函数；`utils/constants.js` 的字典 DICT/场景模板/预算分档（源自原型 `data.js`）；`segment-group`/`recipient-form`/`completeness-bar`/`quota-bar`/`gift-card` 等组件；`pages/settings`（隐私/关于/反馈/注销）；激励视频**服务端回调驱动发奖**的前端配套（onClose 仅 UI + 预加载 + 额度轮询，S3）；插屏频控/分享到账文案；**循环提醒待授权队列**（onShow 弹起，4.2）；`callApi` 网络错误重试（I4）；广告 `onError` 降级 + tab 角标同步（F3/F4）。

**调整**：配色令牌换暖色系（paper/ink + rose/gold/sage/terra）；字体改纯系统；组件真接入（页面 `usingComponents` 注册）；标签颜色映射单一来源；延迟目标主路径 P95<8s、长尾<10s。

**砍掉**：远程字体加载；前端 loginCode（openid 由 wxContext 提供）；前端直接发奖调用（改服务端回调）。

---

## 14. 已知限制与遗留决策

1. **字体**：纯系统字体，牺牲原型衬线/手写气质，靠配色与版式补偿。
2. **激励视频依赖服务端回调（S3 已修）**：发奖由微信广告服务端回调驱动，需流量主开通 + 回调 URL 配置正确；配置错误时前端靠额度轮询/重拉兜底感知，但存在到账延迟。
3. **订阅消息**：年度循环提醒需每年重新授权（wx 限制），由 `onShow` 待授权队列引导。
4. **AppID/env-sharing（待确认 1）**：本文档假设 AIGift 独立 AppID + 共享 fixbill 环境；若实际挂同主体则简化 `cloud.js`（去 env-sharing）。
5. **完整度契约（I8）**：前后端字典一致性 MVP 靠单一 JSON 源 + 单测比对，V2 上 codegen/`config/dict` 接口。
6. **流量主未开通期**：UV < 1000 无法开通流量主，广告位降级隐藏、激励视频引导改走分享补充额度。
