/* ============================================================
   AIGift 原型 · 模拟数据与字典
   ============================================================ */

/* 头像配色（暖色系） */
const AVATAR_COLORS = [
  ["#B23A4E", "#8C2838"],
  ["#BE933A", "#9A7322"],
  ["#7E906F", "#5F6E52"],
  ["#C77A57", "#A85B3A"],
  ["#7B6BA8", "#5C4F86"],
  ["#3F7E8C", "#2C5F6B"],
  ["#A84A6F", "#823052"],
  ["#5C8A5E", "#426A44"],
];

/* 字典（用于表单选项） */
const DICT = {
  relationship: [
    "恋人", "配偶", "父母", "子女", "兄弟姐妹", "长辈亲戚",
    "朋友", "闺蜜", "同学", "同事", "领导", "客户", "师生", "其他",
  ],
  gender: ["男", "女", "其他"],
  ageRange: ["婴幼儿", "儿童", "少年", "青年", "中年", "中老年", "老年"],
  closeness: ["普通", "熟悉", "亲密", "至亲"],
  lifeStage: ["单身", "恋爱中", "已婚", "有娃", "备孕", "空巢"],
  personality: [
    "内向", "外向", "沉稳", "活泼", "浪漫", "务实", "文艺", "极客",
    "宅", "感性", "理性", "传统", "新潮", "简约", "品质控", "爱惊喜",
  ],
  hobbies: [
    "运动", "阅读", "音乐", "影视", "游戏", "旅行", "美食", "烹饪",
    "摄影", "园艺", "手工", "宠物", "数码", "美妆", "收藏", "茶酒",
    "户外", "二次元", "健身", "冥想",
  ],
  materialPrefs: ["实用型", "体验型", "仪式感", "收藏型", "颜值型", "品牌型"],
  diet: ["无", "过敏", "素食", "忌口"],
  living: ["独居", "合租", "家庭", "宿舍"],
  giftType: ["实物", "虚拟", "体验", "DIY手工", "红包礼金", "不限"],
  delivery: ["当面", "快递", "虚拟", "不限"],
  occasion: [
    "生日", "纪念日", "春节", "情人节", "母亲节", "父亲节", "教师节",
    "中秋", "圣诞", "感谢", "道歉", "探望", "乔迁", "升职", "毕业",
    "表白", "见面礼", "回礼", "无特殊",
  ],
};

/* 必填字段（用于校验与完整度计算） */
const REQUIRED = ["name", "gender", "ageRange", "relationship", "occasion", "budget"];
/* 选填字段权重（用于完整度计算） */
const OPTIONAL_FIELDS = [
  "closeness", "occupation", "lifeStage", "personality", "hobbies",
  "diet", "living", "materialPrefs", "taboos", "personalIdea",
  "giftType", "delivery", "deadline",
];

/* 场景模板 */
const SCENARIO_TEMPLATES = [
  {
    key: "birthday", label: "生日", icon: "🎂",
    apply: { occasion: "生日", giftType: ["实物"], deadline: "", budget: 300 },
  },
  {
    key: "valentine", label: "情人节", icon: "💌",
    apply: { occasion: "情人节", giftType: ["实物", "体验"], relationship: "恋人", budget: 500, personality: ["浪漫"] },
  },
  {
    key: "mother", label: "母亲节", icon: "🌷",
    apply: { occasion: "母亲节", relationship: "父母", gender: "女", ageRange: "中年", budget: 400, materialPrefs: ["实用型", "品质控"] },
  },
  {
    key: "anniversary", label: "纪念日", icon: "💍",
    apply: { occasion: "纪念日", giftType: ["仪式感"] , budget: 800, personality: ["浪漫", "爱惊喜"] },
  },
  {
    key: "thanks", label: "感谢", icon: "🙏",
    apply: { occasion: "感谢", budget: 200, materialPrefs: ["实用型"] },
  },
  {
    key: "love", label: "恋爱", icon: "❤️",
    apply: { relationship: "恋人", personality: ["浪漫", "感性"], materialPrefs: ["仪式感", "颜值型"] },
  },
  {
    key: "business", label: "商务", icon: "💼",
    apply: { relationship: "客户", materialPrefs: ["品牌型", "品质控"], budget: 600, personality: ["沉稳"] },
  },
  {
    key: "newhome", label: "乔迁", icon: "🏠",
    apply: { occasion: "乔迁", giftType: ["实物"], materialPrefs: ["实用型"], budget: 300 },
  },
];

/* 已保存的送礼对象 */
const SEED_RECIPIENTS = [
  {
    id: "r1", name: "小雅", initial: "雅",
    gender: "女", ageRange: "青年", age: 27,
    relationship: "恋人", closeness: "亲密",
    occupation: "互联网产品经理", lifeStage: "恋爱中",
    personality: ["浪漫", "文艺", "爱惊喜"],
    hobbies: ["阅读", "摄影", "美食", "旅行"],
    materialPrefs: ["颜值型", "仪式感"],
    diet: "无", living: "合租", taboos: "不喜欢太浮夸的颜色",
    importantDates: [{ date: "2026-11-08", occasion: "生日", recurring: true }],
    colorIdx: 0,
  },
  {
    id: "r2", name: "妈妈", initial: "妈",
    gender: "女", ageRange: "中老年",
    relationship: "父母", closeness: "至亲",
    occupation: "退休教师", lifeStage: "空巢",
    personality: ["务实", "传统", "沉稳"],
    hobbies: ["园艺", "茶酒", "烹饪"],
    materialPrefs: ["实用型", "品质控"],
    diet: "忌口", living: "家庭", taboos: "不要甜食",
    importantDates: [
      { date: "2026-08-02", occasion: "生日", recurring: true },
      { date: "2026-05-10", occasion: "母亲节", recurring: true },
    ],
    colorIdx: 3,
  },
  {
    id: "r3", name: "老王", initial: "王",
    gender: "男", ageRange: "中年",
    relationship: "领导", closeness: "熟悉",
    occupation: "部门总监", lifeStage: "已婚",
    personality: ["沉稳", "品质控"],
    hobbies: ["茶酒", "运动", "户外"],
    materialPrefs: ["品牌型", "实用型"],
    diet: "无", living: "家庭", taboos: "",
    importantDates: [],
    colorIdx: 5,
  },
  {
    id: "r4", name: "豆豆", initial: "豆",
    gender: "男", ageRange: "儿童", age: 6,
    relationship: "子女", closeness: "至亲",
    occupation: "小学一年级", lifeStage: "有娃",
    personality: ["活泼", "爱惊喜"],
    hobbies: ["游戏", "二次元", "运动"],
    materialPrefs: ["体验型"],
    diet: "过敏", living: "家庭", taboos: "坚果过敏",
    importantDates: [{ date: "2026-09-15", occasion: "生日", recurring: true }],
    colorIdx: 2,
  },
];

/* 礼物推荐池 —— 带标签与画像适配，供生成器筛选打分 */
const GIFT_POOL = [
  { name: "定制星空投影仪", tags: ["浪漫","颜值","创意"], types:["实物"], min:150, max:300, fit:["浪漫","文艺","爱惊喜"] },
  { name: "手冲咖啡礼盒套装", tags: ["实用","品质"], types:["实物"], min:200, max:450, fit:["务实","品质控"] },
  { name: "真丝印花丝巾", tags: ["颜值","品质","品牌"], types:["实物"], min:300, max:600, fit:["传统","品质控"], gender:"女" },
  { name: "高端香薰蜡烛礼盒", tags: ["颜值","仪式感"], types:["实物"], min:200, max:400, fit:["浪漫","文艺","爱惊喜"] },
  { name: "智能恒温杯垫套装", tags: ["实用","科技"], types:["实物"], min:150, max:300, fit:["务实","宅"] },
  { name: "私人定制肖像插画", tags: ["创意","仪式感","颜值"], types:["虚拟","DIY手工"], min:200, max:500, fit:["文艺","爱惊喜","浪漫"] },
  { name: "精品茶具礼盒", tags: ["品质","实用","传统"], types:["实物"], min:300, max:700, fit:["传统","沉稳","品质控"] },
  { name: "亲子乐高探索套装", tags: ["体验","创意"], types:["实物"], min:200, max:400, fit:["活泼","爱惊喜"], age:["儿童","少年"] },
  { name: "双人温泉 spa 套餐", tags: ["体验","仪式感"], types:["体验"], min:500, max:900, fit:["浪漫","爱惊喜","品质控"] },
  { name: "限量版机械键盘", tags: ["科技","品质","品牌"], types:["实物"], min:400, max:800, fit:["极客","务实"], gender:"男" },
  { name: "手工皮具长款钱包", tags: ["品质","实用","品牌"], types:["实物"], min:300, max:600, fit:["品质控","沉稳"] },
  { name: "进口红酒礼盒", tags: ["品质","传统","品牌"], types:["实物"], min:300, max:800, fit:["沉稳","品质控","传统"] },
  { name: "亲子烘焙体验课", tags: ["体验","创意"], types:["体验"], min:200, max:400, fit:["活泼","爱惊喜"], age:["儿童"] },
  { name: "北欧风桌面绿植组合", tags: ["颜值","实用"], types:["实物"], min:100, max:250, fit:["文艺","简约","宅"] },
  { name: "高档商务钢笔礼盒", tags: ["品牌","品质","实用"], types:["实物"], min:300, max:700, fit:["沉稳","品质控","品牌型"] },
  { name: "真皮卡夹名片夹", tags: ["实用","品质","品牌"], types:["实物"], min:200, max:400, fit:["沉稳","品牌型","品质控"] },
  { name: "定制回忆相册手账", tags: ["创意","仪式感","颜值"], types:["DIY手工"], min:100, max:300, fit:["文艺","浪漫","爱惊喜","感性"] },
  { name: "颈椎按摩仪", tags: ["实用","健康","科技"], types:["实物"], min:250, max:500, fit:["务实","品质控","传统"], age:["中年","中老年","老年"] },
  { name: "儿童科学实验套装", tags: ["体验","创意","实用"], types:["实物"], min:150, max:350, fit:["活泼"], age:["儿童","少年"] },
  { name: "高定香水体验装", tags: ["颜值","品牌","仪式感"], types:["实物"], min:300, max:600, fit:["浪漫","品质控","颜值型"], gender:"女" },
  { name: "户外露营天幕套装", tags: ["体验","实用"], types:["实物"], min:400, max:800, fit:["户外","活泼","务实"] },
  { name: "书法文房四宝礼盒", tags: ["传统","品质","文艺"], types:["实物"], min:300, max:600, fit:["传统","文艺","沉稳"] },
];

/* 历史推荐记录 */
const SEED_HISTORY = [
  {
    recipientId: "r1", recipientName: "小雅", date: "07-12",
    occasion: "纪念日", budget: 800,
    items: [
      { name: "定制回忆相册手账", status: "accepted" },
      { name: "双人温泉 spa 套餐", status: "accepted" },
      { name: "高定香水体验装", status: "rejected" },
    ],
  },
  {
    recipientId: "r2", recipientName: "妈妈", date: "05-10",
    occasion: "母亲节", budget: 400,
    items: [
      { name: "真丝印花丝巾", status: "accepted" },
      { name: "颈椎按摩仪", status: "pending" },
    ],
  },
  {
    recipientId: "r3", recipientName: "老王", date: "04-22",
    occasion: "感谢", budget: 600,
    items: [
      { name: "精品茶具礼盒", status: "accepted" },
      { name: "高档商务钢笔礼盒", status: "rejected" },
    ],
  },
];

/* 额度流水 */
const SEED_FLOW = [
  { type: "use", title: "生成推荐 · 小雅", time: "今天 14:22", amt: -1 },
  { type: "add", title: "观看激励视频", time: "今天 14:20", amt: 3 },
  { type: "use", title: "生成推荐 · 妈妈", time: "昨天 10:05", amt: -1 },
  { type: "add", title: "每日登录奖励", time: "昨天 09:00", amt: 1 },
  { type: "add", title: "分享好友 · 小林", time: "前天 20:30", amt: 2 },
  { type: "add", title: "新人福利", time: "07-28 21:15", amt: 3 },
];

/* 标签 → 颜色映射 */
function tagClass(tag) {
  const map = { 实用:"sage", 体验:"gold", 创意:"terra", 颜值:"gold", 品质:"sage", 品牌:"terra", 仪式感:"rose", 浪漫:"rose", 健康:"sage", 科技:"terra", 传统:"gold" };
  return "tag--" + (map[tag] || "gold");
}

/* 预算区间文本 */
function budgetText(v) {
  if (v <= 50) return "¥0 – 50";
  if (v <= 100) return "¥50 – 100";
  if (v <= 300) return "¥100 – 300";
  if (v <= 500) return "¥300 – 500";
  if (v <= 1000) return "¥500 – 1000";
  return "¥1000+";
}

window.AIGIFT_DATA = {
  AVATAR_COLORS, DICT, REQUIRED, OPTIONAL_FIELDS,
  SCENARIO_TEMPLATES, SEED_RECIPIENTS, GIFT_POOL,
  SEED_HISTORY, SEED_FLOW, tagClass, budgetText,
};
