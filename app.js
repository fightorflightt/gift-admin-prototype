"use strict";

const DEMO_DAY = "2026-11-13";
const DEMO_START = DEMO_DAY + "T16:25";
const LIMIT_COUNT = 50;
const LIMIT_CENTS = 20000;
const STORAGE_KEY = "dmj-gift-admin-prototype-v1";
const productMap = {
  tb: { platform: "淘宝", name: "清新花香随身淡香水 30ml", id: "753812904621", price: 10289, original: 12900, image: "perfume.jpg", amount: 2, quantity: 10 },
  jd: { platform: "京东", name: "认养一头牛 有机全脂纯牛奶", id: "100089226432", price: 4990, original: 6990, image: "milk.jpg", amount: 1, quantity: 1 },
  vip: { platform: "唯品会", name: "女士轻便运动休闲鞋", id: "691084362", price: 8900, original: 12900, image: "shoe.svg", amount: 5, quantity: 30 },
};
const statuses = { active: "进行中", ended: "已结束", stopped: "已停止" };
const audiences = ["唯品会新客", "唯品会沉睡用户", "新客 / 沉睡复购"];
const initialRecords = [
  { id: "TB001", platform: "tb", method: "托管", date: "2026-11-13T16:21:35", amount: 200, count: 32, claimed: 24, used: 18, redeemed: 3600, state: "active", claimStart: "2026-11-13T16:21", claimEnd: "2026-11-13T23:59", useText: "11-13 23:59 前可用", note: "每人限领 1 个" },
  { id: "JD001", platform: "jd", method: "手动", date: "2026-11-13T16:13:43", amount: 100, count: 50, claimed: 12, used: 9, redeemed: 900, state: "active", claimStart: "2026-11-13T16:13", claimEnd: "2026-11-15T23:59", useText: "领取后 1 天内可用", note: "绑定同 SPU" },
  { id: "VIP001", platform: "vip", method: "手动", date: "2026-11-12T09:35:16", amount: 500, count: 30, claimed: 18, used: 18, redeemed: 9000, state: "ended", claimStart: "2026-11-12T09:35", claimEnd: "2026-11-12T23:59", useText: "11-12 23:59 前可用", note: "不限领取人群" },
  { id: "JD002", platform: "jd", method: "手动", date: "2026-11-11T11:40:08", amount: 300, count: 20, claimed: 7, used: 7, redeemed: 2100, state: "stopped", claimStart: "2026-11-11T11:40", claimEnd: "2026-11-11T23:59", useText: "领取后 1 天内可用", note: "绑定同 SPU" },
];

const $ = (selector) => document.querySelector(selector);
const filters = $("#filters");
const createForm = $("#create-form");
const source = $("#source");
const amount = $("#amount");
const quantity = $("#quantity");
const promotion = $("#promotion");
let records = readRecords();
let applied = {};
let recordsPage = 1;
let recordsPageSize = 10;
let ordersPage = 1;
let ordersPageSize = 10;
let selectedPlatform = "tb";
let identified = false;
let stopTarget = null;
let focusedOrder = "";
let activeReturnFocus = null;
let toastTimer;
const dateModes = {};

function readRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length && saved.every((record) => record && Object.hasOwn(productMap, record.platform))) return saved;
  } catch {}
  return structuredClone(initialRecords);
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function money(cents) {
  return "¥" + (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timestamp(value) { return value.replace("T", " "); }
function shortTime(value) { return timestamp(value.slice(5, 16)); }
function status(record) { return statuses[record.state]; }
function icon(id) { return '<svg aria-hidden="true"><use href="#' + id + '"></use></svg>'; }
function tag(label, style = "") { return '<span class="tag ' + style + '">' + label + '</span>'; }
function platformTag(key) { return tag(productMap[key].platform, key); }
function image(product) { return '<img src="./assets/' + product.image + '" alt="">'; }
function sum(rows, value) { return rows.reduce((total, record) => total + value(record), 0); }
function fieldValue(name) { return createForm.elements.namedItem(name).value; }
function dialog(id) { return document.getElementById(id); }

function notify(message) {
  const toast = $("#toast");
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function todayUsage(platform) {
  const today = records.filter((record) => record.platform === platform && record.date.slice(0, 10) === DEMO_DAY);
  return { count: sum(today, (record) => record.count), cents: sum(today, (record) => record.count * record.amount) };
}

function matchingRecords() {
  const keyword = (applied.keyword || "").trim().toLowerCase();
  return records.filter((record) => {
    const day = record.date.slice(0, 10);
    const product = productMap[record.platform];
    return (!applied.platform || record.platform === applied.platform)
      && (!applied.start || day >= applied.start)
      && (!applied.end || day <= applied.end)
      && (!applied.status || status(record) === applied.status)
      && (!keyword || product.name.toLowerCase().includes(keyword) || product.id.includes(keyword));
  });
}

function renderStats(rows) {
  const totals = [
    { title: "有效订单", value: sum(rows, (record) => record.used), unit: "单", dot: "#3478e5" },
    { title: "礼金发放", value: sum(rows, (record) => record.count), unit: "个", note: "发放金额 " + money(sum(rows, (record) => record.amount * record.count)), dot: "#e68a20" },
    { title: "礼金核销", value: money(sum(rows, (record) => record.redeemed)), note: "核销 " + sum(rows, (record) => record.used) + " 个", dot: "#229a66" },
    { title: "进行中礼金", value: rows.filter((record) => record.state === "active").length, unit: "批", dot: "#7951e8" },
  ];
  $("#stats").innerHTML = totals.map(({ title, value, unit, note, dot }) =>
    '<div class="stat" style="--dot:' + dot + '"><span class="stat-label">' + title + '</span><strong class="stat-value">' +
    value + (unit ? '<small>' + unit + '</small>' : '') + '</strong>' +
    (note ? '<span class="stat-note">' + note + '</span>' : '') + '</div>'
  ).join("");
  $("#quotas").innerHTML = '<div class="quota-heading"><strong>今日礼金限额</strong><small>已发放 / 每日额度</small></div>' +
    Object.keys(productMap).map((key) => {
      const used = todayUsage(key);
      return '<div class="quota-platform">' + platformTag(key) +
        '<span aria-label="发放个数"><strong>' + used.count + '</strong> <small>/ ' + LIMIT_COUNT + ' 个</small></span>' +
        '<span aria-label="发放金额"><strong>' + money(used.cents) + '</strong> <small>/ ' + money(LIMIT_CENTS) + '</small></span></div>';
    }).join("");
}

function productCell(record) {
  const product = productMap[record.platform];
  return '<div class="product-cell">' + image(product) + '<div class="product-copy">' +
    platformTag(record.platform) + '<strong class="product-name">' + product.name +
    '</strong><small class="product-meta">商品 ID ' + product.id + '</small><small class="product-meta">券后 ' +
    money(product.price) + '　原价 ' + money(product.original) + '</small></div></div>';
}

function pageNav(total, current, size, type) {
  const last = Math.max(1, Math.ceil(total / size));
  return '<span>共 ' + total + ' 条</span><div class="pager">' +
    '<button type="button" data-page="' + type + '" data-direction="-1" aria-label="上一页"' + (current <= 1 ? ' disabled' : '') + '>' + icon("left") + '</button>' +
    '<span class="page-number" aria-current="page">' + current + '</span>' +
    '<button type="button" data-page="' + type + '" data-direction="1" aria-label="下一页"' + (current >= last ? ' disabled' : '') + '>' + icon("right") + '</button>' +
    '<select aria-label="每页条数" data-size="' + type + '">' + [10, 20, 50].map((number) =>
      '<option value="' + number + '"' + (size === number ? ' selected' : '') + '>' + number + ' 条/页</option>'
    ).join("") + '</select></div>';
}

function renderRecords() {
  const rows = matchingRecords();
  renderStats(rows);
  recordsPage = Math.min(recordsPage, Math.max(1, Math.ceil(rows.length / recordsPageSize)));
  const offset = (recordsPage - 1) * recordsPageSize;
  $("#records").innerHTML = rows.slice(offset, offset + recordsPageSize).map((record) =>
    '<tr><td class="left">' + productCell(record) + '</td><td class="left">' +
    tag(record.method, record.method === "托管" ? "managed" : "manual") +
    '<span class="cell-note">' + timestamp(record.date) + '</span></td><td class="left"><strong>' +
    money(record.amount) + ' / 个</strong><span class="cell-note">发放 ' + record.count + ' 个</span><span class="cell-note">' + record.note +
    '</span></td><td class="left validity">领取　' + shortTime(record.claimStart) + ' 至 ' + shortTime(record.claimEnd) +
    '<span class="cell-note">使用　' + record.useText + '</span></td><td><strong>' + record.claimed + ' 个</strong></td><td><strong>' +
    money(record.redeemed) + '</strong></td><td>' + tag(status(record), record.state) + '</td>' +
    '<td><div class="record-actions"><button type="button" class="text-button" data-copy="' + record.id +
    '">复制文案</button><a class="text-button" href="#orders/' + record.id + '">订单明细</a>' +
    (record.state === "active" && record.method === "手动" ?
      '<button type="button" class="text-button stop" data-stop="' + record.id + '">停止发放</button>' : '') + '</div></td></tr>'
  ).join("") || '<tr><td class="empty" colspan="8">暂无符合条件的礼金记录</td></tr>';
  $("#records-pagination").innerHTML = pageNav(rows.length, recordsPage, recordsPageSize, "records");
}

function sampleOrders(record) {
  const product = productMap[record.platform];
  const times = ["16:59:41", "16:53:08", "16:51:23", "16:46:15", "16:44:56", "16:37:28", "16:32:06", "16:29:11", "16:21:49"];
  const subsidies = [100, 0, 50, 0, 0, 100, 50, 0, 0];
  const payment = Math.max(0, product.price - record.amount);
  return Array.from({ length: record.used }, (_, index) => {
    const time = times[index % times.length];
    return '<tr><td class="left">示例订单 ' + String(record.used - index).padStart(4, "0") + '</td><td class="left muted">' +
      record.date.slice(0, 10) + ' ' + time + '</td><td>' + money(record.amount) + '</td><td>' + money(payment) +
      '</td><td>' + money(Math.round(payment * .05)) + '</td><td>' + money(subsidies[index % subsidies.length]) +
      '</td><td>' + tag("已付款", "paid") + '</td><td>' + platformTag(record.platform) + '</td></tr>';
  });
}

function renderOrders(record) {
  const product = productMap[record.platform];
  const rows = sampleOrders(record);
  ordersPage = Math.min(ordersPage, Math.max(1, Math.ceil(rows.length / ordersPageSize)));
  const offset = (ordersPage - 1) * ordersPageSize;
  const metrics = [["发放个数", record.count + " 个"], ["领取个数", record.claimed + " 个"], ["核销金额", money(record.redeemed)]];
  $("#orders-page").innerHTML = '<a class="return-link" href="#records">' + icon("left") + '返回礼金创建记录</a>' +
    '<div class="panel"><div class="panel-header"><h1 id="orders-heading" tabindex="-1">礼金订单明细</h1></div><div class="summary-product order-summary">' +
    image(product) + '<div class="product-copy">' + platformTag(record.platform) + ' <strong>' + product.name +
    '</strong><small class="cell-note">商品 ID ' + product.id + '　·　' + record.method + '创建　·　' + timestamp(record.date) +
    '</small></div><div class="order-metrics">' + metrics.map(([name, value]) =>
      '<div><small>' + name + '</small><strong>' + value + '</strong></div>'
    ).join("") + '</div></div><div class="table-scroll"><table class="orders-table" aria-label="礼金订单明细">' +
    '<colgroup><col style="width:18%"><col style="width:18%"><col style="width:10%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:12%"><col style="width:11%"></colgroup>' +
    '<thead><tr>' + ["订单编号", "下单时间", "礼金抵扣", "实付金额", "佣金", "补贴", "订单状态", "平台"].map((name, index) =>
      '<th scope="col"' + (index < 2 ? ' class="left"' : '') + '>' + name + '</th>'
    ).join("") + '</tr></thead><tbody>' + (rows.slice(offset, offset + ordersPageSize).join("") ||
      '<tr><td class="empty" colspan="8">暂无礼金订单</td></tr>') + '</tbody></table></div><div class="pagination">' +
    pageNav(rows.length, ordersPage, ordersPageSize, "orders") + '</div></div>';
}

function route() {
  const record = records.find((entry) => location.hash === "#orders/" + entry.id);
  const previous = focusedOrder;
  $("#records-page").hidden = Boolean(record);
  $("#orders-page").hidden = !record;
  if (record) {
    if (previous !== record.id) ordersPage = 1;
    focusedOrder = record.id;
    renderOrders(record);
    $("#orders-heading").focus({ preventScroll: true });
  } else {
    focusedOrder = "";
    renderRecords();
    if (previous) document.querySelector('[href="#orders/' + previous + '"]')?.focus({ preventScroll: true });
  }
  if (previous !== focusedOrder) window.scrollTo(0, 0);
}

function resetFilters() {
  filters.elements.namedItem("start").value = "2026-11-07";
  filters.elements.namedItem("end").value = DEMO_DAY;
  applyFilters();
}

function applyFilters() {
  const data = Object.fromEntries(new FormData(filters));
  if (data.start && data.end && data.start > data.end) {
    notify("创建结束日期须晚于或等于开始日期");
    return;
  }
  applied = data;
  recordsPage = 1;
  renderRecords();
}

function unitInput(id, value, unit, rules) {
  return '<div class="unit-field"><input type="number" id="' + id + '" name="' + id + '" value="' + value + '" ' + rules +
    '><span>' + unit + '</span></div>';
}

function platformFields() {
  if (selectedPlatform === "tb") return '<div class="form-row"><label class="field-label" for="minimum">实付金额 ≥</label>' +
    unitInput("minimum", "", "元", 'min="0" step="0.01" placeholder="选填"') + '</div>' +
    '<div class="form-row"><label class="field-label required" for="per-user">每个用户最多可领</label>' +
    unitInput("per-user", 1, "个", 'min="1" max="50" step="1" required') + '</div>';

  const bind = '<div class="form-row"><label class="field-label required" for="spu">绑定同 SPU 商品</label>' +
    '<div class="toggle-line"><input id="spu" class="switch" name="spu" type="checkbox" role="switch" checked>同一购买页面下不同规格的商品均可使用该礼金</div></div>';
  if (selectedPlatform === "jd") return bind;

  return bind + '<div class="form-row"><label class="field-label required" for="single-link">单链接限领</label>' +
    '<div class="toggle-line"><input id="single-link" class="switch" name="single-link" type="checkbox" role="switch">每个链接仅限领取一张礼金</div></div>' +
    '<div class="form-row"><span class="field-label">礼金可领取人群</span><div class="people" role="group" aria-label="礼金可领取人群">' +
    audiences.map((audience) => '<label><input name="audience" value="' + audience + '" type="checkbox">' + audience + '</label>').join("") +
    '<span class="muted">默认不限人群，可多选</span></div></div>';
}

function dateRow(kind, title, choices) {
  return '<div class="form-row" id="date-' + kind + '"><span class="field-label required">' + title + '</span><div class="date-content">' +
    '<div class="date-pair"><input name="' + kind + '-start" type="datetime-local" aria-label="' + title + '开始" required><span class="muted">至</span>' +
    '<input name="' + kind + '-end" type="datetime-local" aria-label="' + title + '结束" required></div><div class="segments" role="group" aria-label="' + title + '快捷选项">' +
    choices.map(([text, value]) => '<button type="button" class="segment" data-date="' + kind + '" data-choice="' + value + '" aria-pressed="false">' + text + '</button>').join("") + '</div></div></div>';
}

function localMinute(date) {
  const zone = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - zone).toISOString().slice(0, 16);
}

function endAfter(start, days) {
  const end = new Date(start);
  if (Number.isNaN(end.valueOf())) return "";
  end.setDate(end.getDate() + days - 1);
  end.setHours(23, 59, 0, 0);
  return localMinute(end);
}

function syncUseDates() {
  const useStart = createForm.elements.namedItem("use-start");
  const useEnd = createForm.elements.namedItem("use-end");
  const claimStart = fieldValue("claim-start");
  if (dateModes.use === "custom") return;
  useStart.value = claimStart;
  useEnd.value = dateModes.use === "same" ? fieldValue("claim-end") : endAfter(claimStart, Number(dateModes.use));
}

function setDateMode(kind, mode) {
  dateModes[kind] = mode;
  const block = $("#date-" + kind);
  for (const control of block.querySelectorAll("[data-date]")) {
    control.setAttribute("aria-pressed", String(control.dataset.choice === mode));
  }
  const start = createForm.elements.namedItem(kind + "-start");
  const end = createForm.elements.namedItem(kind + "-end");
  if (kind === "claim" && mode !== "custom") end.value = endAfter(start.value, Number(mode));
  if (kind === "use") syncUseDates();
}

function renderDates() {
  const claim = selectedPlatform === "tb" ? [["当天", "1"], ["7天", "7"], ["15天", "15"]] : [["当天", "1"], ["3天", "3"], ["7天", "7"]];
  const use = selectedPlatform === "vip" ? [["与领取时间一致", "same"], ["1天内", "1"]] : [["1天内", "1"], ["3天内", "3"], ["7天内", "7"]];
  $("#date-fields").innerHTML = dateRow("claim", "领取时间", [...claim, ["自定义时间", "custom"]]) +
    dateRow("use", "使用时间", [...use, ["自定义时间", "custom"]]);
  for (const kind of ["claim", "use"]) {
    createForm.elements.namedItem(kind + "-start").value = DEMO_START;
    createForm.elements.namedItem(kind + "-end").value = DEMO_DAY + "T23:59";
  }
  setDateMode("claim", "1");
  setDateMode("use", selectedPlatform === "vip" ? "same" : "custom");
}

function exampleSource(key) {
  const product = productMap[key];
  if (key === "tb") return "淘口令 · " + product.name;
  return "商品链接 · " + product.id;
}

function showProduct() {
  const product = productMap[selectedPlatform];
  $("#selected-product").innerHTML = identified
    ? '<div class="summary-product">' + image(product) + '<div class="product-copy"><strong class="product-name">' + product.name +
      '</strong><small class="product-meta">商品 ID ' + product.id + '　 券后价 ' + money(product.price) + '</small></div></div>'
    : '<button type="button" class="text-button" id="use-example">填入演示商品</button>';
}

function createError(message = "") {
  const error = $("#create-error");
  error.textContent = message;
  error.hidden = !message;
}

function updateTotal() {
  $("#total").textContent = money(Math.round(Number(amount.value) * 100) * (Number(quantity.value) || 0));
}

function pickPlatform(key) {
  selectedPlatform = key;
  $("#platform-options").innerHTML = Object.entries(productMap).map(([value, item]) =>
    '<button class="segment" type="button" data-platform="' + value + '" aria-pressed="' + (key === value) + '">' + item.platform + '</button>'
  ).join("");
  source.value = exampleSource(key);
  amount.value = productMap[key].amount.toFixed(2);
  quantity.value = productMap[key].quantity;
  identified = true;
  showProduct();
  $("#platform-fields").innerHTML = platformFields();
  renderDates();
  createError();
  updateTotal();
}

function identify() {
  const product = productMap[selectedPlatform];
  const value = source.value.trim();
  identified = value === exampleSource(selectedPlatform) || value === product.id ||
    new RegExp("(^|[^0-9])" + product.id + "([^0-9]|$)").test(value);
  showProduct();
  createError(identified ? "" : "此原型支持所选平台的演示商品。请填入演示商品后重试。");
}

function submitGift() {
  if (!identified) return createError("请先识别商品");
  const claimStart = fieldValue("claim-start"), claimEnd = fieldValue("claim-end");
  const useStart = fieldValue("use-start"), useEnd = fieldValue("use-end");
  if (claimStart >= claimEnd || useStart >= useEnd) return createError("领取和使用的结束时间均须晚于对应的开始时间");
  const count = Number(quantity.value), cents = Math.round(Number(amount.value) * 100);
  const quota = todayUsage(selectedPlatform);
  const remaining = { count: Math.max(0, LIMIT_COUNT - quota.count), cents: Math.max(0, LIMIT_CENTS - quota.cents) };
  if (count > remaining.count || count * cents > remaining.cents) {
    return createError(productMap[selectedPlatform].platform + "今日剩余 " + remaining.count + " 个 / " + money(remaining.cents) + "，请调整发放个数或礼金金额。");
  }

  const data = new FormData(createForm);
  const notes = [];
  if (selectedPlatform === "tb") {
    notes.push("每人限领 " + Number(data.get("per-user")) + " 个");
    if (data.get("minimum") !== "") notes.push("实付 ≥ " + money(Math.round(Number(data.get("minimum")) * 100)));
  } else {
    if (data.has("spu")) notes.push("绑定同 SPU");
    if (data.has("single-link")) notes.push("单链接限领");
    if (selectedPlatform === "vip") notes.push(data.getAll("audience").join("、") || "不限领取人群");
  }
  const id = "DEMO" + Date.now().toString(36).toUpperCase();
  records.unshift({
    id, platform: selectedPlatform, method: "手动", date: DEMO_START + ":00", amount: cents, count,
    claimed: 0, used: 0, redeemed: 0, state: "active", claimStart, claimEnd, useStart, useEnd,
    useText: shortTime(useEnd) + " 前可用", note: notes.join(" · "),
  });
  const persisted = saveRecords();
  filters.reset();
  resetFilters();
  dialog("create-dialog").close();
  notify(persisted ? "礼金创建成功" : "礼金创建成功，本次演示有效");
}

function openCopy(record) {
  const product = productMap[record.platform];
  $("#copy-product").innerHTML = image(product) + '<div class="product-copy"><strong class="product-name">' + product.name +
    '</strong><small class="cell-note">券后价 ' + money(product.price) + '　 单个礼金 ' + money(record.amount) +
    '</small></div>' + platformTag(record.platform);
  promotion.value = [product.name,
    "领 " + money(record.amount) + " 礼金，券后叠加礼金预计 " + money(Math.max(0, product.price - record.amount)),
    "领取时间  " + shortTime(record.claimStart) + " 至 " + shortTime(record.claimEnd),
    "领取礼金  https://example.com/gift/" + record.id.toLowerCase()
  ].join("\n");
  dialog("copy-dialog").showModal();
}

async function copyText() {
  try {
    await navigator.clipboard.writeText(promotion.value);
  } catch {
    promotion.select();
    if (!document.execCommand("copy")) {
      notify("文案已选中，请使用复制快捷键");
      return;
    }
  }
  dialog("copy-dialog").close();
  notify("文案已复制");
}

function renderCurrent(type) {
  if (type === "records") renderRecords();
  else {
    const record = records.find((entry) => entry.id === focusedOrder);
    if (record) renderOrders(record);
  }
}

filters.addEventListener("submit", (event) => { event.preventDefault(); applyFilters(); });
filters.addEventListener("reset", () => queueMicrotask(resetFilters));
$("#open-create").addEventListener("click", () => {
  pickPlatform(applied.platform || "tb");
  dialog("create-dialog").showModal();
});
$("#identify").addEventListener("click", identify);
$("#copy-button").addEventListener("click", copyText);
source.addEventListener("input", () => { identified = false; showProduct(); createError(); });
createForm.addEventListener("input", (event) => {
  updateTotal();
  createError();
  const field = event.target.name;
  if (field?.startsWith("claim-") || field?.startsWith("use-")) {
    const kind = field.split("-")[0];
    setDateMode(kind, "custom");
    if (kind === "claim") syncUseDates();
  }
});
createForm.addEventListener("submit", (event) => { event.preventDefault(); submitGift(); });
$("#confirm-stop").addEventListener("click", () => {
  if (!stopTarget || stopTarget.state !== "active") return;
  stopTarget.state = "stopped";
  saveRecords();
  renderRecords();
  dialog("confirm-dialog").close();
  notify("已停止发放");
});
const mobile = matchMedia("(max-width: 880px)");
function updateMenu() {
  const open = mobile.matches ? document.body.classList.contains("sidebar-open") : !document.body.classList.contains("sidebar-closed");
  $("#menu-button").setAttribute("aria-expanded", String(open));
}
$("#menu-button").addEventListener("click", () => {
  document.body.classList.toggle(mobile.matches ? "sidebar-open" : "sidebar-closed");
  if (mobile.matches) document.body.classList.remove("sidebar-closed");
  updateMenu();
});
mobile.addEventListener("change", () => {
  document.body.classList.remove("sidebar-open", "sidebar-closed");
  updateMenu();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { close, platform, date, choice, copy, stop, page, direction } = button.dataset;
  if (close) dialog(close).close();
  if (platform && platform !== selectedPlatform) {
    pickPlatform(platform);
    document.querySelector('[data-platform="' + platform + '"]').focus();
  }
  if (date) {
    setDateMode(date, choice);
    if (date === "claim") syncUseDates();
  }
  if (button.id === "use-example") { source.value = exampleSource(selectedPlatform); identify(); $("#identify").focus(); }
  if (copy) {
    const record = records.find((entry) => entry.id === copy);
    if (record) openCopy(record);
  }
  if (stop) {
    stopTarget = records.find((entry) => entry.id === stop);
    if (stopTarget) {
      activeReturnFocus = '[data-copy="' + stopTarget.id + '"]';
      $("#stop-copy").textContent = "确认停止「" + productMap[stopTarget.platform].name + "」的礼金发放？";
      dialog("confirm-dialog").showModal();
    }
  }
  if (page) {
    if (page === "records") recordsPage += Number(direction);
    else ordersPage += Number(direction);
    renderCurrent(page);
    const selector = '[data-page="' + page + '"][data-direction="';
    (document.querySelector(selector + direction + '"]:not(:disabled)') ||
      document.querySelector(selector + (-Number(direction)) + '"]:not(:disabled)'))?.focus();
  }
});

dialog("confirm-dialog").addEventListener("close", () => {
  if (activeReturnFocus && !document.activeElement?.closest(".record-actions")) document.querySelector(activeReturnFocus)?.focus();
  activeReturnFocus = null;
  stopTarget = null;
});
document.addEventListener("change", (event) => {
  const type = event.target.dataset.size;
  if (!type) return;
  if (type === "records") { recordsPageSize = Number(event.target.value); recordsPage = 1; }
  else { ordersPageSize = Number(event.target.value); ordersPage = 1; }
  renderCurrent(type);
  document.querySelector('[data-size="' + type + '"]')?.focus();
});

window.addEventListener("hashchange", route);
updateMenu();
resetFilters();
route();
