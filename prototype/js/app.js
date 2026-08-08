/* ============================================================
   AIGift 原型 · 应用逻辑（状态 / 路由 / 渲染 / 交互）
   ============================================================ */
(function () {
  "use strict";

  const {
    AVATAR_COLORS, DICT, REQUIRED, OPTIONAL_FIELDS,
    SCENARIO_TEMPLATES, SEED_RECIPIENTS, GIFT_POOL,
    SEED_HISTORY, SEED_FLOW, tagClass, budgetText,
  } = window.AIGIFT_DATA;

  /* ---------- 状态 ---------- */
  const DEFAULT_FORM = {
    name: "", gender: "", ageRange: "", relationship: "",
    closeness: "", occupation: "", lifeStage: "",
    personality: [], hobbies: [], materialPrefs: [],
    diet: "", living: "", taboos: "",
    occasion: "", budget: 300, deadline: "",
    giftType: [], delivery: "", count: 5,
    personalIdea: "", supplement: "",
  };

  const state = {
    route: "recommend",
    quota: 5,
    totalGenerated: 8,
    acceptedTotal: 11,
    recipients: SEED_RECIPIENTS.map(r => ({ ...r, personality:[...r.personality], hobbies:[...r.hobbies], materialPrefs:[...r.materialPrefs], importantDates:[...(r.importantDates||[])] })),
    currentRecipientId: null,
    scenario: null,
    form: { ...DEFAULT_FORM },
    lastResults: null,
    lastFeedback: {},
    history: SEED_HISTORY.map(h => ({ ...h, items:[...h.items] })),
    flow: SEED_FLOW.map(f => ({ ...f })),
    interstitialCount: 0,
    dailyClaimed: false,
  };

  /* ---------- DOM ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const screens = $$(".screen");
  const navTitle = $("#navTitle");
  const modalLayer = $("#modalLayer");
  const toastEl = $("#toast");
  const loaderEl = $("#loader");

  /* ---------- 图标 ---------- */
  const ICO = {
    gift: '<svg viewBox="0 0 24 24"><path d="M20 7h-2.5a3.5 3.5 0 00-5.5-4 3.5 3.5 0 00-5.5 4H4a1 1 0 00-1 1v3h18V8a1 1 0 00-1-1zm-9 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM3 13h7v9H5a2 2 0 01-2-2v-7zm11 9v-9h7v7a2 2 0 01-2 2h-5z" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 00-2.4 1.2l-7-4a3 3 0 000-2.4l7-4A3 3 0 1015 5l-7 4a3 3 0 100 6l7 4A3 3 0 1018 16z" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2 9 19.2 20 8.2l-1.5-1.5z" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4L10.6 10.6l6.3-6.3z" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" fill="currentColor"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M17.6 6.4A8 8 0 104 12h2a6 6 0 101.8-4.2L8 8h4v2H5V4h2v2.3A8 8 0 0117.6 6.4z" fill="currentColor"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zM19 14l.9 2.6L22.5 17.5 19.9 18.4 19 21l-.9-2.6L15.5 17.5 18.1 16.6 19 14zM5 14l.7 2L7.7 16.7 5.7 17.4 5 19.4 4.3 17.4 2.3 16.7 4.3 16 5 14z" fill="currentColor"/></svg>',
    coin: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15v2h-2v-2a4 4 0 01-2-1.2l1.4-1.4A2.5 2.5 0 1013 9a2.5 2.5 0 00-2.5 2.5h-2A4.5 4.5 0 0113 7v2a4 4 0 010 8z" fill="currentColor"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M7 7V5a5 5 0 0110 0v2h3v14H4V7h3zm2 0h6V5a3 3 0 00-6 0v2z" fill="currentColor"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M12 2a6 6 0 00-6 6v4l-2 3v2h16v-2l-2-3V8a6 6 0 00-6-6zm0 20a3 3 0 003-3H9a3 3 0 003 3z" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3zm-1 13l5-5-1.4-1.4L11 12.2 9.4 10.6 8 12l3 3z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg>',
    msg: '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H8l-5 4V6a2 2 0 011-2z" fill="currentColor"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 00-5 5c0 3 2 4 2 6h6c0-2 2-3 2-6a5 5 0 00-5-5zm-1 16h2v4h-2v-4z" fill="currentColor"/></svg>',
    timer: '<svg viewBox="0 0 24 24"><path d="M12 2l1 2h3v2h-1.1A7 7 0 1112 21a7 7 0 01-6-4h2.2A5 5 0 0012 19a5 5 0 100-10 5 5 0 00-4.6 3H10v2H4v-6h2v2.5A7 7 0 0111 5.1V4h-1V2h2z" fill="currentColor"/></svg>',
  };

  /* ---------- 工具 ---------- */
  const avatarGrad = idx => {
    const [a, b] = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    return `linear-gradient(135deg, ${a}, ${b})`;
  };
  const escape = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let toastTimer;
  function toast(msg, kind = "info") {
    const ico = kind === "ok" ? `<span class="toast__ico-ok">${ICO.check}</span>` : `<span class="toast__ico-info">${ICO.sparkle}</span>`;
    toastEl.innerHTML = `${ico}<span>${msg}</span>`;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 1900);
  }

  function openModal(html) {
    modalLayer.innerHTML = `<div class="sheet">${html}</div>`;
    modalLayer.classList.add("is-open");
    modalLayer.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    modalLayer.classList.remove("is-open");
    modalLayer.setAttribute("aria-hidden", "true");
    setTimeout(() => (modalLayer.innerHTML = ""), 300);
  }

  /* ---------- 完整度计算 ---------- */
  function computeCompleteness() {
    const f = state.form;
    const reqFilled = REQUIRED.filter(k => {
      const v = f[k];
      return v !== "" && !(Array.isArray(v) && v.length === 0);
    }).length;
    const optFilled = OPTIONAL_FIELDS.filter(k => {
      const v = f[k];
      return v !== "" && !(Array.isArray(v) && v.length === 0);
    }).length;
    const pct = Math.round((reqFilled / REQUIRED.length) * 42 + (optFilled / OPTIONAL_FIELDS.length) * 58);
    const tier = pct >= 85 ? 2 : pct >= 60 ? 1 : 0;
    return { pct: Math.min(100, pct), tier, reqMissing: REQUIRED.length - reqFilled };
  }

  function refreshCompleteness() {
    const { pct, tier, reqMissing } = computeCompleteness();
    const bar = $("#compFill");
    const pctEl = $("#compPct");
    const badge = $("#compBadge");
    const hint = $("#compHint");
    const genBtn = $("#genBtn");
    if (!bar) return;
    bar.style.width = pct + "%";
    pctEl.textContent = pct + "%";
    badge.setAttribute("data-tier", tier);
    badge.innerHTML = `<span class="dot"></span>${tier === 2 ? "高精准推荐 🌟" : tier === 1 ? "精准推荐 ✨" : "标准推荐"}`;
    if (reqMissing > 0) {
      hint.innerHTML = `还差 <b style="color:var(--rose-d)">${reqMissing}</b> 个必填项即可生成 · 填越多越准`;
      if (genBtn) genBtn.disabled = true;
    } else {
      const remain = 100 - pct;
      hint.innerHTML = remain > 10
        ? `信息越完整，推荐越精准 · 再填几项可达高精准 <span style="color:var(--gold-d)">↑</span>`
        : `完美！信息非常充分，将获得高精准推荐 🌟`;
      if (genBtn) genBtn.disabled = state.quota <= 0 && state.route === "recommend";
    }
    const range = $("#budgetRange");
    if (range) {
      const p = ((state.form.budget - 0) / 1000) * 100;
      range.style.setProperty("--p", p + "%");
    }
  }

  /* ============================================================
     路由
     ============================================================ */
  function go(route) {
    state.route = route;
    screens.forEach(s => s.classList.toggle("is-active", s.dataset.screen === route));
    $$(".tab").forEach(t => t.setAttribute("data-active", t.dataset.tab === route ? "true" : "false"));
    const active = $(`.screen[data-screen="${route}"]`);
    if (active) { active.scrollTop = 0; navTitle.textContent = active.dataset.title; }
    if (route === "recipients") renderRecipients();
    if (route === "history") renderHistory();
    if (route === "profile") renderProfile();
    if (route === "recommend") refreshCompleteness();
    setDockVisible();
  }

  function setDockVisible() {
    const d = document.getElementById("genDock");
    if (!d) return;
    const overlayActive = !!document.querySelector(".screen--overlay.is-active");
    d.style.display = state.route === "recommend" && !overlayActive ? "" : "none";
  }

  function openResult() {
    const r = $(`.screen[data-screen="result"]`);
    r.classList.add("is-active");
    r.scrollTop = 0;
    navTitle.textContent = "推荐结果";
    $$(".tab").forEach(t => t.setAttribute("data-active", "false"));
    setDockVisible();
  }
  function closeResult() {
    $(`.screen[data-screen="result"]`).classList.remove("is-active");
    go("recommend");
  }

  /* ============================================================
     推荐首页渲染
     ============================================================ */
  function renderRecommend() {
    const f = state.form;
    const screen = $(`.screen[data-screen="recommend"]`);
    const savedScroll = screen ? screen.scrollTop : 0;
    const requiredSet = new Set(REQUIRED);

    const seg = (field, options, { multi = false } = {}) => options.map(o => {
      const val = f[field];
      const on = multi ? (val || []).includes(o) : val === o;
      return `<button class="seg__btn${multi ? " seg--multi__btn" : ""}" data-seg="${field}" data-val="${o}" data-multi="${multi}" data-active="${on}">${multi ? '<span class="check">' + ICO.check + "</span>" : ""}${o}</button>`;
    }).join("");

    const fieldLabel = (label, field, { required = false } = {}) =>
      `<div class="field__label">${required ? '<span class="req">*</span>' : ""}${label}${!required && !requiredSet.has(field) ? `<span class="opt">+ 精准度</span>` : ""}</div>`;

    screen.innerHTML = `
      <!-- 完整度 -->
      <div class="completeness">
        <div class="comp__top">
          <span class="comp__label">${ICO.sparkle}推荐完整度</span>
          <span class="comp__pct" id="compPct">0%</span>
        </div>
        <div class="comp__bar"><div class="comp__fill" id="compFill"></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:9px">
          <span class="comp__hint" id="compHint"></span>
          <span class="comp__badge" id="compBadge" data-tier="0"><span class="dot"></span>标准推荐</span>
        </div>
      </div>

      <!-- 问候 + 额度 -->
      <div class="hero">
        <div>
          <div class="h-eyebrow">Hi, 为 TA 挑一份走心的礼物</div>
        </div>
      </div>
      <div class="quota">
        <div class="quota__icon">${ICO.gift}</div>
        <div class="quota__txt">
          <div class="quota__num"><span id="quotaNum">${state.quota}</span><small>次免费额度</small></div>
          <div class="quota__label">用完可看视频 / 分享 / 登录补充</div>
        </div>
        <button class="quota__add" data-action="open-reward">${ICO.play}+3</button>
      </div>

      <!-- 送礼对象 -->
      <div class="section">
        <div class="section__head"><div class="h-title">送给谁</div><span class="link" data-action="go-recipients">管理 ›</span></div>
        <div class="recipient-rail" id="recipientRail"></div>
      </div>

      <!-- 场景模板 -->
      <div class="section">
        <div class="section__head"><div class="h-title">快速场景</div><span class="h-sub" style="font-size:11.5px">一键预填</span></div>
        <div class="tmpl-rail" id="tmplRail"></div>
      </div>

      <!-- 表单 -->
      <div class="section">
        <div class="section__head"><div class="h-title">对象画像</div></div>

        <div class="field">
          ${fieldLabel("称呼 / 昵称", "name", { required: true })}
          <input class="input" data-field="name" value="${escape(f.name)}" placeholder="如：小雅、妈妈" />
        </div>
        <div class="field">${fieldLabel("关系", "relationship", { required: true })}<div class="seg">${seg("relationship", DICT.relationship)}</div></div>
        <div class="field">${fieldLabel("性别", "gender", { required: true })}<div class="seg">${seg("gender", DICT.gender)}</div></div>
        <div class="field">${fieldLabel("年龄段", "ageRange", { required: true })}<div class="seg">${seg("ageRange", DICT.ageRange)}</div></div>
        <div class="field">${fieldLabel("亲密程度", "closeness")}<div class="seg">${seg("closeness", DICT.closeness)}</div></div>
        <div class="field">${fieldLabel("职业 / 身份", "occupation")}<input class="input" data-field="occupation" value="${escape(f.occupation)}" placeholder="如：产品经理、学生" /></div>
        <div class="field">${fieldLabel("人生阶段", "lifeStage")}<div class="seg">${seg("lifeStage", DICT.lifeStage)}</div></div>
        <div class="field">${fieldLabel("性格标签", "personality")}<div class="seg seg--multi">${seg("personality", DICT.personality, { multi: true })}</div></div>
        <div class="field">${fieldLabel("兴趣爱好", "hobbies")}<div class="seg seg--multi">${seg("hobbies", DICT.hobbies, { multi: true })}</div></div>
        <div class="field">${fieldLabel("物质偏好", "materialPrefs")}<div class="seg seg--multi">${seg("materialPrefs", DICT.materialPrefs, { multi: true })}</div></div>
        <div class="field">${fieldLabel("饮食禁忌", "diet")}<div class="seg">${seg("diet", DICT.diet)}</div></div>
        <div class="field">${fieldLabel("居住情况", "living")}<div class="seg">${seg("living", DICT.living)}</div></div>
        <div class="field">
          ${fieldLabel("⚠️ 禁忌 / 雷区", "taboos")}
          <textarea class="textarea" data-field="taboos" placeholder="颜色 / 数字 / 寓意 / 品类（AI 会规避）">${escape(f.taboos)}</textarea>
        </div>
      </div>

      <div class="section">
        <div class="section__head"><div class="h-title">这次送礼</div></div>
        <div class="field">${fieldLabel("送礼场合", "occasion", { required: true })}<div class="seg">${seg("occasion", DICT.occasion)}</div></div>
        <div class="field">
          ${fieldLabel("预算区间", "budget", { required: true })}
          <div class="range">
            <span class="range__val" id="budgetVal">${budgetText(f.budget)}</span>
            <input type="range" id="budgetRange" min="0" max="1000" step="50" value="${f.budget}" data-field="budget" />
          </div>
        </div>
        <div class="field">${fieldLabel("期望礼物类型", "giftType")}<div class="seg seg--multi">${seg("giftType", DICT.giftType, { multi: true })}</div></div>
        <div class="field">${fieldLabel("送达方式", "delivery")}<div class="seg">${seg("delivery", DICT.delivery)}</div></div>
        <div class="field">${fieldLabel("推荐条数", "count")}<div class="seg">${[3,5,8,10].map(n=>`<button class="seg__btn" data-seg="count" data-val="${n}" data-active="${f.count===n}">${n} 条</button>`).join("")}</div></div>
        <div class="field">
          ${fieldLabel("个人想法 / 灵感", "personalIdea")}
          <textarea class="textarea" data-field="personalIdea" placeholder="已有初步想法？告诉 AI 让它更懂你">${escape(f.personalIdea)}</textarea>
        </div>
        <div class="field">
          ${fieldLabel("其他补充", "supplement")}
          <textarea class="textarea" data-field="supplement" placeholder="任何额外信息">${escape(f.supplement)}</textarea>
        </div>
      </div>

      <div class="adslot adslot--banner">${ICO.bag}Banner 广告位</div>
    `;

    renderRecipientRail();
    renderTmplRail();
    refreshCompleteness();
    if (screen) screen.scrollTop = savedScroll;
  }

  function renderRecipientRail() {
    const rail = $("#recipientRail");
    if (!rail) return;
    const cur = state.currentRecipientId;
    let html = state.recipients.map(r => `
      <div class="rchip" data-action="select-recipient" data-id="${r.id}" data-active="${r.id === cur}">
        <div class="rchip__avatar" style="background:${avatarGrad(r.colorIdx)}">${escape(r.initial)}</div>
        <div class="rchip__name">${escape(r.name)}</div>
        <div class="rchip__rel">${escape(r.relationship)}</div>
      </div>`).join("");
    html += `<div class="rchip rchip--add" data-action="new-recipient">${ICO.plus}<span style="font-size:11.5px">新建</span></div>`;
    rail.innerHTML = html;
  }

  function renderTmplRail() {
    const rail = $("#tmplRail");
    if (!rail) return;
    rail.innerHTML = SCENARIO_TEMPLATES.map(t => `
      <button class="tmpl" data-action="apply-template" data-key="${t.key}" data-active="${state.scenario === t.key}">
        <span>${t.icon}</span><span>${t.label}</span>
      </button>`).join("");
  }

  /* ---------- 选对象 / 模板 ---------- */
  function selectRecipient(id) {
    const r = state.recipients.find(x => x.id === id);
    if (!r) return;
    state.currentRecipientId = id;
    state.scenario = null;
    state.form = {
      ...DEFAULT_FORM,
      name: r.name, gender: r.gender, ageRange: r.ageRange,
      relationship: r.relationship, closeness: r.closeness || "",
      occupation: r.occupation || "", lifeStage: r.lifeStage || "",
      personality: [...r.personality], hobbies: [...r.hobbies],
      materialPrefs: [...r.materialPrefs], diet: r.diet || "",
      living: r.living || "", taboos: r.taboos || "",
    };
    renderRecommend();
    toast(`已载入「${r.name}」的画像`, "ok");
  }

  function applyTemplate(key) {
    const t = SCENARIO_TEMPLATES.find(x => x.key === key);
    if (!t) return;
    state.scenario = key;
    const a = t.apply;
    Object.entries(a).forEach(([k, v]) => {
      if (Array.isArray(v)) state.form[k] = [...v];
      else state.form[k] = v;
    });
    renderRecommend();
    toast(`已套用「${t.label}」模板`, "ok");
  }

  /* ============================================================
     生成推荐
     ============================================================ */
  function budgetBand(v) {
    if (v <= 50) return { min: 0, max: 50 };
    if (v <= 100) return { min: 50, max: 100 };
    if (v <= 300) return { min: 100, max: 300 };
    if (v <= 500) return { min: 300, max: 500 };
    if (v <= 1000) return { min: 500, max: 1000 };
    return { min: 1000, max: 3000 };
  }

  function generateResults() {
    const f = state.form;
    const band = budgetBand(f.budget);
    const count = f.count || 5;
    const fitTokens = [...(f.personality || []), ...(f.hobbies || []), ...(f.materialPrefs || [])];
    const typeFilter = (f.giftType || []).filter(t => t !== "不限");

    let pool = GIFT_POOL.filter(g => {
      if (typeFilter.length && !g.types.some(t => typeFilter.includes(t))) return false;
      if (g.max < band.min * 0.6 || g.min > band.max * 1.4) return false;
      if (g.gender && f.gender && g.gender !== f.gender) return false;
      if (g.age && f.ageRange && !g.age.includes(f.ageRange)) return false;
      if (f.taboos && /甜食|坚果/.test(f.taboos) && /食品|零食|糕点/.test(g.name)) return false;
      return true;
    });

    const scored = pool.map(g => {
      let s = 64 + Math.floor(Math.random() * 6);
      g.fit.forEach(t => { if (fitTokens.includes(t)) s += 9; });
      return { ...g, _score: Math.min(98, s) };
    }).sort((a, b) => b._score - a._score);

    let picks = scored.slice(0, count);
    if (picks.length < count) {
      const used = new Set(picks.map(p => p.name));
      GIFT_POOL.forEach(g => {
        if (picks.length >= count) return;
        if (used.has(g.name)) return;
        if (g.gender && f.gender && g.gender !== f.gender) return;
        picks.push({ ...g, _score: 68 + Math.floor(Math.random() * 12) });
        used.add(g.name);
      });
    }

    return picks.map(decorateGift);
  }

  function decorateGift(g) {
    const f = state.form;
    const band = budgetBand(f.budget);
    const lo = Math.max(g.min, Math.floor(band.min * 0.8));
    const hi = Math.min(g.max, Math.ceil(band.max * 1.1));
    const priceRange = `¥${lo} – ${hi}`;
    const hints = ["京东 / 天猫", "线下精品店", "品牌官方定制", "小红书好物馆", "线下商场"];
    const purchaseHint = hints[Math.floor(Math.random() * hints.length)];
    return {
      name: g.name,
      matchScore: g._score,
      priceRange,
      purchaseHint,
      tags: g.tags,
      reason: buildReason(g, f),
    };
  }

  function buildReason(g, f) {
    const parts = [];
    const rel = f.relationship;
    const occ = f.occasion || "送礼";
    if (rel && /恋人|配偶|恋爱/.test(rel)) {
      parts.push(`考虑到你们是${rel}关系，${occ}这样的时刻最适合传递心意，`);
    } else if (rel) {
      parts.push(`送给${rel}的${occ}礼物，讲究的是得体与贴心，`);
    } else {
      parts.push(`这份${occ}礼物，`);
    }
    if (f.personality && f.personality.length) {
      parts.push(`结合 TA「${f.personality.slice(0, 2).join("、")}」的性格，`);
    }
    if (f.hobbies && f.hobbies.length) {
      parts.push(`以及 TA 对「${f.hobbies.slice(0, 2).join("、")}」的热爱，`);
    }
    if (g.tags.includes("实用")) parts.push(`这款实用又日常，能被高频使用；`);
    else if (g.tags.includes("仪式感") || g.tags.includes("浪漫")) parts.push(`这款自带仪式感，足以制造一个难忘的瞬间；`);
    else if (g.tags.includes("品质") || g.tags.includes("品牌")) parts.push(`品质与品牌兼顾，送出手有分量；`);
    else if (g.tags.includes("创意")) parts.push(`独特而有创意，能体现你的用心；`);
    if (f.taboos) parts.push(`并已为你规避了 TA 的忌讳。`);
    else parts.push(`价位也贴合你的预算。`);
    return parts.join("");
  }

  function handleGenerate() {
    const { reqMissing } = computeCompleteness();
    if (reqMissing > 0) {
      toast(`还差 ${reqMissing} 个必填项`);
      return;
    }
    if (state.quota <= 0) {
      openReward(true);
      return;
    }
    state.quota -= 1;
    state.totalGenerated += 1;
    addFlow("use", `生成推荐 · ${state.form.name || "对象"}`, -1);

    loaderEl.classList.add("is-open");
    setTimeout(() => {
      loaderEl.classList.remove("is-open");
      state.lastResults = generateResults();
      state.lastFeedback = {};
      renderResult();
      openResult();
      // 插屏频控：首次推荐不插，每会话最多 2 次
      state.interstitialCount += 1;
      if (state.interstitialCount > 1 && state.interstitialCount <= 3) {
        setTimeout(openInterstitial, 600);
      }
      updateQuotaUI();
    }, 1900);
  }

  /* ============================================================
     结果页渲染
     ============================================================ */
  function renderResult() {
    const screen = $(`.screen[data-screen="result"]`);
    const savedScroll = screen ? screen.scrollTop : 0;
    const results = state.lastResults || [];
    const avg = results.length ? Math.round(results.reduce((s, r) => s + r.matchScore, 0) / results.length) : 0;
    const f = state.form;

    const cards = results.map((g, i) => {
      const fb = state.lastFeedback[i];
      const status = fb === "accepted" ? "accepted" : fb === "rejected" ? "rejected" : "";
      return `
      <div class="gift-card" data-status="${status}" style="animation-delay:${i * 0.08}s">
        <div class="gift-card__top">
          <div class="seal ${i === 0 ? "seal--rose" : ""}">
            <span class="seal__num">${g.matchScore}<small></small></span>
          </div>
          <div class="gift-card__main">
            <div class="gift-card__name">${escape(g.name)}</div>
            <div class="gift-card__price">${ICO.coin}${g.priceRange}</div>
            <div class="gift-card__tags">${g.tags.map(t => `<span class="tag ${tagClass(t)}">${t}</span>`).join("")}</div>
          </div>
        </div>
        <div class="note">
          <div class="note__label">— AI 的推荐理由 —</div>
          <div class="note__txt">${escape(g.reason)}</div>
          <div class="note__hint">${ICO.bag}建议购买：${escape(g.purchaseHint)}</div>
        </div>
        <div class="gift-card__actions">
          <button class="gact" data-action="feedback" data-idx="${i}" data-kind="accepted" data-on="${fb === "accepted"}">
            ${ICO.check}采纳
          </button>
          <button class="gact gact--reject" data-action="feedback" data-idx="${i}" data-kind="rejected" data-on="${fb === "rejected"}">
            ${ICO.close}不采纳
          </button>
          <button class="gact gact--save" data-action="feedback" data-idx="${i}" data-kind="saved" data-on="${fb === "saved"}" title="收藏">
            ${ICO.heart}
          </button>
        </div>
      </div>`;
    }).join("");

    screen.innerHTML = `
      <div class="result-head">
        <div class="seal seal--lg"><span class="seal__num">${avg}</span></div>
        <div class="result-head__title">为「${escape(f.name || "TA")}」精选 ${results.length} 份礼物</div>
        <div class="result-head__sub">${escape(f.occasion || "送礼")} · ${budgetText(f.budget)} · 综合匹配度 ${avg}</div>
      </div>
      ${cards}
      <div class="adslot adslot--banner">${ICO.bag}Banner 广告位</div>
      <div style="display:flex;gap:10px;margin-top:6px">
        <button class="btn btn--ghost btn--sm" data-action="regenerate" style="flex:1">${ICO.refresh}换一批</button>
        <button class="btn btn--gold btn--sm" data-action="open-share" style="flex:1">${ICO.share}分享 +2</button>
      </div>
      <button class="btn btn--ghost btn--block" style="margin-top:10px" data-action="close-result">${ICO.msg}返回继续编辑</button>
    `;
    if (screen) screen.scrollTop = savedScroll;
  }

  function handleFeedback(idx, kind) {
    const cur = state.lastFeedback[idx];
    state.lastFeedback[idx] = cur === kind ? "" : kind;
    if (kind === "accepted" && cur !== "accepted") {
      state.acceptedTotal += 1;
      toast("已记录采纳，将优化后续推荐", "ok");
    }
    renderResult();
    // 滚动保持位置
    const screen = $(`.screen[data-screen="result"]`);
    screen.scrollTop = screen.scrollTop;
  }

  /* ============================================================
     对象页
     ============================================================ */
  function renderRecipients() {
    const screen = $(`.screen[data-screen="recipients"]`);
    const list = state.recipients.map(r => {
      const completeness = recipientCompleteness(r);
      return `
      <div class="list-item" data-action="select-recipient-from-list" data-id="${r.id}">
        <div class="avatar" style="background:${avatarGrad(r.colorIdx)}">${escape(r.initial)}</div>
        <div class="list-item__main">
          <div class="list-item__name">${escape(r.name)} <span style="font-size:11px;color:var(--ink-3);font-weight:400">· ${escape(r.relationship)}</span></div>
          <div class="list-item__meta">${escape(r.gender)} · ${escape(r.ageRange)} · ${r.hobbies.slice(0, 2).join("、") || "暂无标签"}</div>
        </div>
        <div class="list-item__end">
          <div class="num">${completeness}%</div>
          <div style="font-size:10px;color:var(--ink-3)">完整度</div>
        </div>
      </div>`;
    }).join("");

    screen.innerHTML = `
      <div class="h-eyebrow">Recipient Library</div>
      <div class="section__head" style="margin-top:4px"><div class="h-title">送礼对象 (${state.recipients.length})</div></div>
      ${list}
      <button class="btn btn--primary btn--block" data-action="new-recipient" style="margin-top:14px">${ICO.plus}新建送礼对象</button>
      <div class="adslot adslot--banner" style="margin-top:18px">${ICO.bag}Banner 广告位</div>
    `;
  }

  function recipientCompleteness(r) {
    let filled = 0, total = 0;
    ["name", "gender", "ageRange", "relationship", "closeness", "occupation", "lifeStage", "diet", "living", "taboos"].forEach(k => {
      total++; if (r[k]) filled++;
    });
    ["personality", "hobbies", "materialPrefs"].forEach(k => { total++; if (r[k] && r[k].length) filled++; });
    return Math.round((filled / total) * 100);
  }

  function selectRecipientFromList(id) {
    go("recommend");
    setTimeout(() => selectRecipient(id), 50);
  }

  /* ============================================================
     历史页
     ============================================================ */
  function renderHistory() {
    const screen = $(`.screen[data-screen="history"]`);
    const groups = {};
    state.history.forEach(h => {
      const key = h.recipientName;
      (groups[key] = groups[key] || []).push(h);
    });
    const html = Object.entries(groups).map(([name, items]) => {
      const cards = items.map(h => `
        <div class="hist-card" data-action="reuse-history" data-id="${h.recipientId}">
          <div class="hist-card__top">
            <div class="hist-card__who">${escape(h.occasion)} · ${budgetText(h.budget)}</div>
            <div class="hist-card__date">${escape(h.date)}</div>
          </div>
          <div class="hist-card__items">
            ${h.items.map(it => `<div class="hist-item"><span class="hist-item__dot" data-s="${it.status}"></span>${escape(it.name)}${it.status === "accepted" ? ' <span style="color:var(--sage);font-size:11px">已采纳</span>' : it.status === "rejected" ? ' <span style="color:var(--terra);font-size:11px">未采纳</span>' : ""}</div>`).join("")}
          </div>
        </div>`).join("");
      return `<div class="hist-group"><div class="hist-group__label">${escape(name)}</div>${cards}</div>`;
    }).join("");

    screen.innerHTML = `
      <div class="h-eyebrow">Recommendation History</div>
      <div class="section__head" style="margin-top:4px"><div class="h-title">推荐历史</div></div>
      ${html || '<div class="h-sub">暂无历史记录</div>'}
    `;
  }

  /* ============================================================
     我的页
     ============================================================ */
  function renderProfile() {
    const screen = $(`.screen[data-screen="profile"]`);
    const acceptRate = state.totalGenerated ? Math.round((state.acceptedTotal / (state.totalGenerated * 4)) * 100) : 0;
    const flowHtml = state.flow.map(f => `
      <div class="flow-item">
        <div class="flow-item__ico" data-t="${f.type}">${f.type === "add" ? ICO.coin : ICO.gift}</div>
        <div class="flow-item__main">
          <div class="flow-item__title">${escape(f.title)}</div>
          <div class="flow-item__time">${escape(f.time)}</div>
        </div>
        <div class="flow-item__amt ${f.amt > 0 ? "up" : "down"}">${f.amt > 0 ? "+" : ""}${f.amt}</div>
      </div>`).join("");

    const reminders = state.recipients
      .flatMap(r => (r.importantDates || []).map(d => ({ ...d, name: r.name })))
      .slice(0, 4);
    const reminderHtml = reminders.length ? reminders.map(d => `
      <div class="flow-item">
        <div class="flow-item__ico" data-t="add">${ICO.bell}</div>
        <div class="flow-item__main">
          <div class="flow-item__title">${escape(d.name)} · ${escape(d.occasion)}</div>
          <div class="flow-item__time">${escape(d.date)}${d.recurring ? " · 每年" : ""}</div>
        </div>
      </div>`).join("") : `<div class="h-sub">暂无提醒</div>`;

    screen.innerHTML = `
      <div class="profile-head">
        <div class="avatar avatar--lg" style="background:${avatarGrad(0)}">会</div>
        <div class="profile-head__name">微信用户</div>
        <div class="profile-head__id">AIGift · openid ·•••8723</div>
      </div>

      <div class="stat-grid">
        <div class="stat"><div class="stat__num rose">${state.quota}</div><div class="stat__label">剩余额度</div></div>
        <div class="stat"><div class="stat__num">${state.totalGenerated}</div><div class="stat__label">累计推荐</div></div>
        <div class="stat"><div class="stat__num gold">${Math.min(99, acceptRate)}%</div><div class="stat__label">采纳率</div></div>
      </div>

      <div class="card card--pad" style="margin-bottom:18px">
        <div class="section__head" style="margin:0 0 6px"><div class="h-title" style="font-size:15px">额度流水</div></div>
        ${flowHtml}
      </div>

      <div class="card card--pad" style="margin-bottom:18px">
        <div class="section__head" style="margin:0 0 6px"><div class="h-title" style="font-size:15px">节日 / 纪念日提醒</div></div>
        ${reminderHtml}
      </div>

      <div class="menu-row" data-action="toast-nav">
        <div class="menu-row__ico" style="background:var(--rose)">${ICO.shield}</div>
        <div class="menu-row__title">隐私与数据</div>
        <div class="menu-row__arrow">${ICO.chev}</div>
      </div>
      <div class="menu-row" data-action="toast-nav">
        <div class="menu-row__ico" style="background:var(--gold)">${ICO.info}</div>
        <div class="menu-row__title">关于 AIGift</div>
        <div class="menu-row__arrow">${ICO.chev}</div>
      </div>
      <div class="menu-row" data-action="toast-nav">
        <div class="menu-row__ico" style="background:var(--sage)">${ICO.msg}</div>
        <div class="menu-row__title">意见反馈</div>
        <div class="menu-row__arrow">${ICO.chev}</div>
      </div>
      <div class="adslot adslot--banner" style="margin-top:18px">${ICO.bag}Banner 广告位</div>
    `;
  }

  /* ============================================================
     模态：激励视频 / 分享 / 新建对象 / 插屏
     ============================================================ */
  function openReward(force) {
    openModal(`
      <div class="reward">
        <div class="sheet__handle"></div>
        <div class="seal seal--lg seal--rose reward__seal"><span class="seal__num">${ICO.play}</span></div>
        <div class="sheet__title">${force ? "额度不足，看视频继续" : "观看激励视频"}</div>
        <div class="sheet__sub">完整观看即可获得 <b style="color:var(--rose-d)">+3 次</b> 推荐额度</div>
        <div class="reward__countdown" id="rewardCd">${ICO.timer}准备播放…</div>
        <button class="btn btn--primary btn--block" data-action="watch-video">${ICO.play}立即观看</button>
        <button class="btn btn--ghost btn--block" style="margin-top:10px" data-action="close-modal">稍后再说</button>
      </div>
    `);
  }

  function watchVideo() {
    const cd = $("#rewardCd");
    if (!cd) return;
    let n = 5;
    cd.innerHTML = `${ICO.timer}观看中 · 剩余 <span class="num">${n}</span>s`;
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(t);
        state.quota += 3;
        addFlow("add", "观看激励视频", 3);
        updateQuotaUI();
        closeModal();
        toast("已到账 +3 次额度", "ok");
      } else {
        cd.innerHTML = `${ICO.timer}观看中 · 剩余 <span class="num">${n}</span>s`;
      }
    }, 800);
  }

  function openShare() {
    openModal(`
      <div class="sheet__handle"></div>
      <div class="sheet__title">分享给好友</div>
      <div class="sheet__sub">TA 首次进入小程序，你即可获得 <b style="color:var(--rose-d)">+2 次</b> 额度</div>
      <div style="display:flex;gap:10px;margin:18px 0">
        <button class="btn btn--ghost btn--block btn--sm" data-action="close-modal">${ICO.msg}微信好友</button>
        <button class="btn btn--ghost btn--block btn--sm" data-action="close-modal">生成卡片</button>
      </div>
      <button class="btn btn--primary btn--block" data-action="share-done">${ICO.share}模拟分享成功 +2</button>
    `);
  }

  function shareDone() {
    state.quota += 2;
    addFlow("add", "分享好友奖励", 2);
    updateQuotaUI();
    closeModal();
    toast("已到账 +2 次额度", "ok");
  }

  function openInterstitial() {
    openModal(`
      <div class="interstitial">
        <div class="interstitial__visual">
          <span>专属好物 · 限时优惠</span>
          <span class="interstitial__skip">跳过 3</span>
        </div>
        <div class="interstitial__cta">— 插屏广告位（频控：首次推荐不插）—</div>
        <button class="btn btn--ghost btn--block btn--sm" data-action="close-modal">关闭广告</button>
      </div>
    `);
    let n = 3;
    const skip = $(".interstitial__skip");
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); }
      else if (skip) skip.textContent = `跳过 ${n}`;
    }, 1000);
  }

  function openNewRecipient() {
    const seg = (field, options, multi = false) => options.map(o =>
      `<button class="seg__btn" data-nr-seg="${field}" data-val="${o}" data-multi="${multi}">${o}</button>`).join("");
    openModal(`
      <div class="sheet__handle"></div>
      <div class="sheet__title">新建送礼对象</div>
      <div class="sheet__sub">填写越多，未来推荐越准</div>
      <div class="field" style="margin-top:14px">
        <div class="field__label"><span class="req">*</span>昵称</div>
        <input class="input" id="nrName" placeholder="如：老张、妹妹" />
      </div>
      <div class="field"><div class="field__label"><span class="req">*</span>关系</div><div class="seg">${seg("relationship", DICT.relationship)}</div></div>
      <div class="field"><div class="field__label"><span class="req">*</span>性别</div><div class="seg">${seg("gender", DICT.gender)}</div></div>
      <div class="field"><div class="field__label"><span class="req">*</span>年龄段</div><div class="seg">${seg("ageRange", DICT.ageRange)}</div></div>
      <div class="field"><div class="field__label">性格（可多选）</div><div class="seg seg--multi">${seg("personality", DICT.personality, true)}</div></div>
      <div class="field"><div class="field__label">爱好（可多选）</div><div class="seg seg--multi">${seg("hobbies", DICT.hobbies, true)}</div></div>
      <button class="btn btn--primary btn--block" data-action="save-recipient">${ICO.check}保存对象</button>
    `);
    state.nrDraft = { name: "", relationship: "", gender: "", ageRange: "", personality: [], hobbies: [] };
  }

  function saveRecipient() {
    const d = state.nrDraft;
    if (!d.name || !d.relationship || !d.gender || !d.ageRange) {
      toast("请完成必填项");
      return;
    }
    const id = "r" + (state.recipients.length + 1) + "_" + Date.now().toString(36).slice(-3);
    const initial = d.name.slice(0, 1);
    state.recipients = [{
      id, name: d.name, initial,
      gender: d.gender, ageRange: d.ageRange, relationship: d.relationship,
      personality: d.personality, hobbies: d.hobbies, materialPrefs: [],
      diet: "", living: "", occupation: "", lifeStage: "", closeness: "", taboos: "",
      importantDates: [], colorIdx: state.recipients.length,
    }, ...state.recipients];
    closeModal();
    toast("对象已创建", "ok");
    if (state.route === "recipients") renderRecipients();
    else { go("recommend"); setTimeout(() => selectRecipient(id), 60); }
  }

  /* ---------- 额度 / 流水 ---------- */
  function addFlow(type, title, amt) {
    state.flow = [{ type, title, time: "刚刚", amt }, ...state.flow].slice(0, 12);
  }
  function updateQuotaUI() {
    const n = $("#quotaNum");
    if (n) n.textContent = state.quota;
    refreshCompleteness();
  }

  /* ============================================================
     事件分发
     ============================================================ */
  const app = $("#app");

  // 点击委托
  app.addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (tab) { go(tab.dataset.tab); return; }

    const actEl = e.target.closest("[data-action]");
    if (!actEl) return;
    const a = actEl.dataset.action;

    switch (a) {
      case "go-recipients": go("recipients"); break;
      case "open-reward": openReward(false); break;
      case "watch-video": watchVideo(); break;
      case "open-share": openShare(); break;
      case "share-done": shareDone(); break;
      case "select-recipient": selectRecipient(actEl.dataset.id); break;
      case "select-recipient-from-list": selectRecipientFromList(actEl.dataset.id); break;
      case "new-recipient": openNewRecipient(); break;
      case "apply-template": applyTemplate(actEl.dataset.key); break;
      case "generate": handleGenerate(); break;
      case "feedback": handleFeedback(+actEl.dataset.idx, actEl.dataset.kind); break;
      case "regenerate": handleGenerate(); break;
      case "close-result": closeResult(); break;
      case "close-modal": closeModal(); break;
      case "reuse-history": {
        const id = actEl.dataset.id;
        go("recommend");
        if (id) setTimeout(() => selectRecipient(id), 60);
        break;
      }
      case "save-recipient": saveRecipient(); break;
      case "toast-nav": toast("原型演示：此入口已规划"); break;
    }
  });

  // 文本/范围输入
  app.addEventListener("input", e => {
    const el = e.target;
    if (el.dataset.field) {
      const val = el.type === "range" ? +el.value : el.value;
      state.form[el.dataset.field] = val;
      if (el.dataset.field === "budget") {
        $("#budgetVal").textContent = budgetText(val);
        el.style.setProperty("--p", ((val / 1000) * 100) + "%");
      }
      refreshCompleteness();
    }
    if (el.id === "nrName") state.nrDraft.name = el.value;
  });

  // 段选择 / 多选
  app.addEventListener("click", e => {
    const segEl = e.target.closest("[data-seg]");
    if (segEl) {
      const field = segEl.dataset.seg;
      const val = segEl.dataset.val;
      const multi = segEl.dataset.multi === "true";
      if (field === "count") state.form.count = +val;
      else if (multi) {
        const arr = state.form[field] || [];
        const i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1); else arr.push(val);
        state.form[field] = arr;
      } else {
        state.form[field] = state.form[field] === val ? "" : val;
      }
      renderRecommend();
      return;
    }
    // 新建对象模态内段选择
    const nrSeg = e.target.closest("[data-nr-seg]");
    if (nrSeg) {
      const field = nrSeg.dataset.nrSeg, val = nrSeg.dataset.val, multi = nrSeg.dataset.multi === "true";
      if (multi) {
        const arr = state.nrDraft[field] || [];
        const i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1); else arr.push(val);
        state.nrDraft[field] = arr;
      } else {
        state.nrDraft[field] = state.nrDraft[field] === val ? "" : val;
      }
      nrSeg.setAttribute("data-active", "true");
      $$(`[data-nr-seg="${field}"]`).forEach(b => {
        const on = multi ? state.nrDraft[field].includes(b.dataset.val) : state.nrDraft[field] === b.dataset.val;
        b.setAttribute("data-active", on);
        if (multi) b.classList.toggle("seg--multi__btn", true);
      });
      if (multi) {
        $$(`[data-nr-seg="${field}"]`).forEach(b => {
          const on = state.nrDraft[field].includes(b.dataset.val);
          b.style.background = on ? "var(--rose-bg)" : "";
          b.style.color = on ? "var(--rose-d)" : "";
          b.style.borderColor = on ? "var(--rose-l)" : "";
        });
      }
    }
  });

  // 阻止 range 的 input 触发 refreshCompleteness 之外的重渲染（已处理）

  /* ---------- 初始化 ---------- */
  function renderGenerateDock() {
    // 生成按钮浮于 tabBar 之上，仅推荐页可见
    let dock = $("#genDock");
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "genDock";
      dock.className = "generate-dock";
      dock.innerHTML = `<button class="btn btn--primary btn--block" id="genBtn" data-action="generate">${ICO.sparkle}生成 AI 推荐</button>`;
      $("#app").appendChild(dock);
    }
  }

  function init() {
    // 状态栏时间
    $("#statusTime").textContent = (() => {
      const d = new Date();
      return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
    })();

    renderRecommend();
    renderGenerateDock();
    go("recommend");

    // 每日登录奖励（模拟）
    setTimeout(() => {
      if (!state.dailyClaimed) {
        state.dailyClaimed = true;
        state.quota += 1;
        addFlow("add", "每日登录奖励", 1);
        updateQuotaUI();
        toast("每日登录 +1 次额度", "ok");
      }
    }, 1400);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
