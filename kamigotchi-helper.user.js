/* eslint-disable no-multi-spaces */
// ==UserScript==
// @name         Kamigotchi辅助脚本-公开版 (helper)
// @namespace    http://tampermonkey.net/
// @version      1.1.21
// @downloadURL  https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-helper.user.js
// @updateURL    https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-helper.meta.js
// @homepageURL  https://github.com/funcreator2030/kamigotchi-scripts
// @x-release-date 2026/7/10 09:22:44
// @description  Kamigotchi辅助脚本公开版：一键升级+技能管理+自动合成(DOM步长真值)+LT显示+地块适配分析+杀手候选扫描+启动窗口复活+精确清算线(每周全网最强杀手扫描)
// @match        https://*.kamigotchi.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// 🔻SYNC→内部版[1.1.20 看板白名单三批]：版本仪式（@name/@version/banner/启动log/命令清单banner 同步升 v1.1.20）
// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    Kamigotchi 辅助脚本 · 公开版 v1.1.21                         ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  本脚本是核心脚本的配套组件，与核心脚本同时安装在 Tampermonkey 中运行。         ║
// ║  核心脚本负责部署/停采/喂食/复活等主流程；本辅助脚本提供以下能力：              ║
// ║                                                                              ║
// ║  1. LT 显示增强   —— 在每张 kami 卡片上叠加清算线（LT）徽标，危险的标红。       ║
// ║                     用 CSS 伪元素 + data 属性实现，React 重渲染也不会洗掉。     ║
// ║  2. 自动升级      —— 游戏加载完成后自动为可升级的 kami 执行升级；               ║
// ║                     按标准 build 顺序自动加技能点；检测到非标准技能时           ║
// ║                     用 Respec 药水自动重置再按标准加点。杀手 kami 自动跳过。    ║
// ║  3. 自动合成      —— 按优先级列表（CRAFT_PRIORITY）周期性合成物品。             ║
// ║                     步长只认 DOM 实时读数（链上 API 的 stamina.sync 是         ║
// ║                     检查点旧值，不随时间回复，不可用作真值）。                  ║
// ║                     遵循"先查后锁"纪律：确认有活干才占 TX 锁。                  ║
// ║  4. 启动窗口复活  —— 核心脚本启动需等约 2 分钟，本脚本加载快：刷新后一进游戏    ║
// ║                     就先批量复活死亡 kami（与核心共享防重发记录和 revive 锁）。 ║
// ║  5. 地块适配分析  —— kamiAnalyze()：按 body+hand 属性把 kami 分类到最适合的     ║
// ║                     地块类型，标出 majority/minority 分布，转移决策一目了然。   ║
// ║  6. 杀手候选扫描  —— findKillerCandidates()：在你自己账户的 kami 里，按         ║
// ║                     出生属性（vioBase/harmBase/powBase）筛出天生适合转型         ║
// ║                     做杀手的候选（选秀工具，非敌情侦察），零 API 成本，         ║
// ║                     启动后自动跑一次。                                          ║
// ║  7. 实时步长接口  —— getStaminaFromDOM()：从页面读取实时步长，                  ║
// ║                     是本脚本和核心脚本合成决策的唯一步长真值来源。              ║
// ║  8. 精确清算线    —— 每周自动全网扫描最强杀手（四桶档案存 localStorage 的       ║
// ║                     kami_top_predators 键，独立键值不覆盖其他数据），按游戏      ║
// ║                     合约官方公式重算全库清算线；代码内置默认档案兜底。          ║
// ║                                                                              ║
// ║  ▍与其他脚本的协作（通过 window.xxx 接口互相调用）：                            ║
// ║   - 核心脚本 → 调用本脚本的 getStaminaFromDOM()（读步长）、                     ║
// ║     __getMinorityKamis()（转移停采）                                          ║
// ║   - 本脚本 → 调用核心脚本的 TX 锁接口（hasEmergencyLock 等），                  ║
// ║     升级/重置前让路紧急停采                                                    ║
// ║   - 精简数据库脚本 → 提供 window.kami_core_db（本脚本升级/扫描/分析的数据源）   ║
// ║   - 杀手监控脚本 → 维护 window.MY_KILLER_KAMIS（本脚本升级/重置自动跳过名单）   ║
// ║                                                                              ║
// ║  ▍自动任务时刻表：                                                             ║
// ║   - 自动升级：游戏加载完成后自动执行，之后每 30 分钟检查一次                   ║
// ║   - 自动合成：脚本启动 5 分钟后首次检测，之后每 30 分钟一次                     ║
// ║   - LT 显示刷新：每 5 分钟一次（手动刷新 window.__refreshLT()）                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ============================================================
// 【术语速览（第一次使用前建议先读这里）】
// ------------------------------------------------------------
// TX            — 链上交易（transaction）。脚本的每个"写"操作都要发 TX、消耗 gas。
// TX 双锁       — 核心/辅助脚本共享的两把发交易互斥锁：紧急锁（紧急停采专用，
//                 最高优先级，其他操作一律让路）+ 普通锁（升级/合成/复活等
//                 常规操作互斥）。目的：防止多个脚本同时发 TX 造成 nonce 冲突。
// 清算线（LT）  — kami 采集时 HP% 低于此线，就可能被其他玩家的杀手 kami 清算
//                 （击杀）。由 harmony、体质、防御技能加成算出，单位为 HP 百分比。
// 步长(stamina) — 账户级行动力资源（0~100，随时间回复），合成等操作消耗步长。
// build         — 技能加点方案。"标准 build"指本脚本内置的采集向加点方案
//                 （作者的策略，可自定义，见 STANDARD_SKILLS 板块的新手提示）。
// 标准技能      — 属于标准 build 的技能 ID 集合（STANDARD_SKILLS）；kami 点了
//                 集合之外的技能即"非标准"，会触发自动重置（Respec）。
// Respec        — 技能洗点：消耗 1 瓶 Respec Potion（洗点药水）重置 kami 的
//                 全部技能点，之后可重新分配。
// affinity      — 亲和属性（地形属性）。kami 的 body/hand 部件与采集地块都带
//                 属性（normal/eerie/scrap/insect），属性匹配的地块采集收益最优。
// majority/minority — 账户内 kami 按最适合的地块分四类后，数量最多的一类为
//                 majority（主流类），其余为 minority（少数派）——多账户分工
//                 时 minority 是转移到其他账户的候选。
// db-first      — 优先在本地精简数据库（window.kami_core_db，由精简数据库
//                 脚本构建）的内存数据里筛选，只对少量候选发 API 查询的
//                 省时策略，通常几秒完成。
// ============================================================

// ============================================================
// 【常用控制台命令速查】
// ------------------------------------------------------------
// upgradekamis()           - 手动触发一轮升级+技能管理
// checkAllKamiSkills()     - 检查全部 kami 的技能是否符合标准 build（只查不改）
// getRespecPotionCount()   - 查看背包 Respec 药水数量
// kamiAnalyze()            - 地块适配分析（majority/minority 分布，四色分类输出）
// findKillerCandidates()   - 在自己账户的 kami 里找适合转型杀手的候选（db-first，几秒完成）
// scanTopPredators()       - 全网扫描最强杀手并更新威胁档案（自动：无档案/超7天时启动自扫）
// showTopPredators()       - 查看当前生效的顶尖杀手档案（含来源与扫描时间）
// refreshPreciseLT()       - 手动按当前档案重算全库精确清算线
// showHealth()             - 代码健康看板：期望表对照心跳，标红"该跑没跑"的模块（每30分钟自检）
// autoCraft()              - 手动触发一轮自动合成
// startAutoCraft()         - 启动自动合成周期任务
// stopAutoCraft()          - 停止自动合成周期任务
// window.__refreshLT()     - 手动刷新卡片上的 LT 显示
// ============================================================
(function () {
  'use strict';

  // ============================================================
  // 【板块：日志基础设施（log / __kamiLogBuffer）】
  // ------------------------------------------------------------
  // ▍功能：
  //   提供全脚本统一的 log() 函数：控制台输出自动带 [辅助脚本] 前缀
  //   和配置时区的时间（默认浏览器本地）；同时把一份剥离样式标记的明文推送到与核心
  //   脚本共享的日志缓冲区 window.__kamiLogBuffer，供核心脚本的
  //   saveKamiLogs() 把核心/辅助两个脚本的日志合并导出保存。
  // ▍触发时机：
  //   脚本内所有需要留痕的输出都走 log()；以 "[调试]" 开头的高频调试
  //   输出走 console.log()，由下方"调试总开关"板块统一放行/拦截。
  // ▍依赖：
  //   - window.__kamiLogBuffer：跨脚本共享的数组缓冲区，哪个脚本先
  //     启动就由谁创建（本函数检测到不存在或非数组时会自行初始化）；
  //   - 不依赖 DOM、localStorage、链上 API。
  // ▍核心流程：
  //   1) 取当前时间 +8 小时偏移，格式化为 "YYYY-MM-DD HH:mm:ss"；
  //   2) 控制台先打印前缀行、再打印内容本身（分两行打印，保留
  //      console 对对象的原生展开能力，不把对象强转成字符串）；
  //   3) 把各参数序列化为明文（字符串剥离 %c 样式标记避免乱码；
  //      对象走 JSON.stringify，失败则退回 String()），拼成一行
  //      push 进缓冲区。
  // ▍边界与保护：
  //   - 缓冲区写入整体包在 try/catch 中：buffer 不可用只影响日志
  //     存档，不影响控制台输出；
  //   - JSON.stringify 失败（循环引用等）时回退 String(a) 容错。
  // ▍可调参数：
  //   - TZ_OFFSET_HOURS — 时区设置（v1.1.3 起）：'auto' 自动跟随浏览器
  //     本地时区；也可写死数字（小时，如 8 / -5 / 5.5）。
  // ▍相关控制台命令：
  //   - saveKamiLogs()（核心脚本提供）— 导出 __kamiLogBuffer 中的
  //     全部日志。
  // ▍补充说明（Console 中日志来源链接的显示差异）：
  //   同步调用链里的 console.log（如在 Console 手动执行命令）来源
  //   显示为短串 VM####:line；异步回调（Promise/setTimeout/RAF）里
  //   的输出显示为长串 userscript.html?name…:line。这由 V8 按
  //   "调用栈是否处于 microtask/macrotask"决定，与函数定义位置无关，
  //   脚本层面无法改变；若希望全部显示为 VM 短串，可把 Tampermonkey
  //   设置中的 Inject Mode 改为 Instant。
  // ============================================================

  // 【时区设置】（v1.1.3 起）'auto'=自动跟随浏览器本地时区；也可写死数字（小时）：8=UTC+8、-5=UTC-5、5.5=UTC+5:30
  const TZ_OFFSET_HOURS = 'auto';
  const __TZ_OFFSET_MS = (TZ_OFFSET_HOURS === 'auto')
      ? -new Date().getTimezoneOffset() * 60 * 1000
      : Number(TZ_OFFSET_HOURS) * 60 * 60 * 1000;

  //=====定义日志格式，自动加配置时区的时间前缀=====
  function log(...args) {
    const now = new Date();
    // UTC 毫秒数 +8 小时偏移，再借 toISOString 格式化成 "YYYY-MM-DD HH:mm:ss"
    const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);

    const prefix = `[辅助脚本][${beijingTime}]`;

    // 控制台输出：前缀与内容分两行打印，保留 console 对对象的展开能力
    console.log(prefix);
    console.log(...args);

    // 推送到核心脚本的日志缓冲区，让 saveKamiLogs() 能保存
    try {
      if (!Array.isArray(window.__kamiLogBuffer)) {
        window.__kamiLogBuffer = [];
      }
      const plainText = args.map(a => {
        if (typeof a === 'string') return a.replace(/%c/g, '');
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      window.__kamiLogBuffer.push(`${prefix} ${plainText}`);
    } catch (_) { /* buffer 不可用就忽略，不影响控制台输出 */ }
  }

  //=====提示脚本启动======
  log('✅Kamigotchi辅助脚本-公开版 v1.1.21 已成功启动，等待网页加载完成…');   // 🔻SYNC→内部版[1.1.20 看板白名单三批]

  // ============ [版本检查] 启动时对比 GitHub 最新版本，提示用户是否已更新 ============
  // 🔻SYNC→内部版[1.1.21 版本检查]（内部版无 GitHub 分发，同步时可整块跳过）
  (function versionCheck() {
      const SELF_NAME = '辅助脚本';
      const SELF_VERSION = '1.1.21';   // ⚠️ 版本仪式第6处：升版时必须同步改这里
      const META_URL = 'https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-helper.meta.js';
      let firstSeen = null;
      try {   // 本机此版本首次运行时间 ≈ 篡改猴安装/更新时间（无法直接读TM，取首次见到该版本的时刻）
          const k = 'kami_ver_seen_' + SELF_NAME + '_' + SELF_VERSION;
          firstSeen = localStorage.getItem(k);
          if (!firstSeen) { firstSeen = new Date().toLocaleString('zh-CN'); localStorage.setItem(k, firstSeen); }
      } catch (e) { firstSeen = '未知'; }
      const cmpVer = (a, b) => {   // 返回 -1/0/1
          const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
              const d = (pa[i] || 0) - (pb[i] || 0);
              if (d) return d > 0 ? 1 : -1;
          }
          return 0;
      };
      setTimeout(async () => {
          try {
              const resp = await fetch(META_URL + '?_=' + Date.now(), { cache: 'no-store' });
              const txt = await resp.text();
              const remoteVer = (txt.match(/@version\s+v?([\d.]+)/) || [])[1];
              const relDate = (txt.match(/@x-release-date\s+(\S+[^\n\r]*)/) || [])[1] || '未知';
              if (!remoteVer) { log(`ℹ️ [版本检查] 无法解析 GitHub 最新版本，跳过（网络/格式异常）`); return; }
              const c = cmpVer(SELF_VERSION, remoteVer);
              if (c === 0) {
                  log(`✅ [版本检查] ${SELF_NAME} v${SELF_VERSION} 已是 GitHub 最新（该版发布于 ${relDate}；本机安装/更新于 ${firstSeen}）`);
              } else if (c < 0) {
                  log(`%c⚠️ [版本检查] GitHub 最新为 v${remoteVer}（发布于 ${relDate}），本机 ${SELF_NAME} 还是 v${SELF_VERSION}（本机更新于 ${firstSeen}）→ 请到篡改猴面板「实用工具→检查用户脚本更新」拉取最新`,
                      'color: orange; font-weight: bold;');
              } else {
                  log(`ℹ️ [版本检查] 本机 ${SELF_NAME} v${SELF_VERSION} 比 GitHub(v${remoteVer}) 更新（本地开发版）`);
              }
          } catch (e) {
              log(`ℹ️ [版本检查] 获取 GitHub 最新版本失败（${e && e.message || e}），跳过`);
          }
      }, 8000);   // 延迟 8s，避开启动拥挤；raw 带 CORS *，页面上下文可直接 fetch
  })();

  // ============================================================
  // 【板块：LT 显示样式注入（injectLTStyle）】
  // ------------------------------------------------------------
  // ▍功能：
  //   向页面注入一段全局 CSS，为"LT 清算线显示"和"危险 Kami 标红"
  //   提供纯样式层的渲染通道。
  //   为什么用 data 属性 + ::after 伪元素、而不是往卡片里插 DOM 节点：
  //   游戏前端是 React，重渲染会把脚本插入的子节点整批删掉；而 data-*
  //   只是元素上的 attribute，React 重渲染通常不会清除它。并且修改
  //   attribute 不触发 childList 型 MutationObserver，不会与本脚本
  //   自己的 DOM 监听形成"写入→触发→再写入"的反馈循环。
  // ▍触发时机：脚本载入时立即执行一次（IIFE）。
  // ▍依赖：document.head（尚不存在时回退挂到 document.documentElement）。
  // ▍核心流程：
  //   1) 检查 id 为 __aux_lt_style__ 的 <style> 是否已存在，存在即
  //      直接返回（防重复注入）；
  //   2) 创建 <style> 元素并写入两条规则；
  //   3) append 到 head（或根元素）。
  // ▍CSS 规则逐条说明：
  //   - [data-lt-tag]::after — 凡带 data-lt-tag 属性的元素，在其内容
  //     末尾追加 " " + 属性值（即 LT 百分比文本）；颜色 #7F8C8D（灰）
  //     加 !important 盖过站点样式，margin-left: 6px 与 HP 数字拉开
  //     间距，font-size: 0.8em 缩小字号、font-weight: normal 取消加粗，
  //     整体弱化显示、不干扰原 HP 读数。
  //   - [data-kami-danger="1"] — 凡带 data-kami-danger="1" 属性的元素
  //     文字标红 #E74C3C（危险警示色），!important 防止被 React 行内
  //     样式或站点样式覆盖。
  // ▍边界与保护：
  //   - 固定 id __aux_lt_style__ 防重复注入（脚本被多次执行也安全）。
  // ▍可调参数：
  //   - #7F8C8D — LT 标签文字颜色；#E74C3C — 危险标红颜色；
  //   - margin-left: 6px / font-size: 0.8em — LT 标签与 HP 的间距和
  //     字号，可按视觉喜好微调。
  // ▍相关控制台命令：无（样式一次注入后由 combinedUIUpdate 写属性驱动）。
  // ============================================================
  (function injectLTStyle() {
    if (document.getElementById('__aux_lt_style__')) return;  // 防重复
    const style = document.createElement('style');
    style.id = '__aux_lt_style__';
    style.textContent = `
      [data-lt-tag]::after {
        content: " " attr(data-lt-tag);
        color: #7F8C8D !important;
        margin-left: 6px;
        font-size: 0.8em;
        font-weight: normal;
      }
      [data-kami-danger="1"] {
        color: #E74C3C !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  })();

  // ============================================================
  // 【板块：调试总开关（attachDebugGate）】
  // ------------------------------------------------------------
  // ▍功能：
  //   给 console.log 打补丁，统一拦截所有以 "[调试]" 开头的高频调试
  //   输出：开关关闭（默认）时直接吞掉，开启时原样放行。调试语句因此
  //   可以常驻代码中，正常使用时控制台不被刷屏。
  // ▍触发时机：脚本载入时立即执行一次（IIFE），此后对整个页面的
  //   console.log 调用生效。
  // ▍依赖：
  //   - window.__AUX_DEBUG__：布尔型全局开关，优先级最高；
  //   - localStorage key "aux_debug"：值为字符串 "1" 时开启，作为
  //     跨刷新的持久开关（仅在 __AUX_DEBUG__ 未设置为布尔时才读它）。
  // ▍核心流程：
  //   1) 用 RAW_LOG 保存原始 console.log，拦截后仍经它真正输出；
  //   2) 计算 DEBUG：window.__AUX_DEBUG__ 是布尔就用它，否则看
  //      localStorage.aux_debug === '1'；
  //   3) 替换 console.log：首个参数是字符串且以 "[调试]" 开头时，
  //      DEBUG 关 → 直接 return 吞掉；DEBUG 开 → 首次放行前额外
  //      打印一次"调试模式已开启"提示（shownOnce 保证只提示一次）；
  //   4) 其余输出一律透传给 RAW_LOG，行为与原生一致；
  //   5) 在 window 上定义只读属性 __AUX_DEBUG_ACTIVE__，供外部查询
  //      当前开关状态。
  // ▍边界与保护：
  //   - 前缀判断包在 try/catch 中，任何异常都不影响日志正常透传；
  //   - DEBUG 在脚本载入时一次性确定，运行中改 localStorage 需刷新
  //     页面才生效。
  // ▍可调参数：
  //   - '[调试]' — 被拦截的日志前缀标记，调试语句需以它开头。
  // ▍相关控制台命令：
  //   - localStorage.setItem('aux_debug', '1') 后刷新 — 开启调试输出；
  //   - localStorage.removeItem('aux_debug') 后刷新 — 关闭调试输出；
  //   - window.__AUX_DEBUG_ACTIVE__ — 查询当前是否处于调试模式。
  // ============================================================
  (function attachDebugGate() {
    // 保存原始 console.log，拦截后仍通过它真正输出
    const RAW_LOG = console.log.bind(console);
    // 开关优先级：window.__AUX_DEBUG__（布尔）> localStorage.aux_debug === '1'
    const DEBUG =
      (typeof window.__AUX_DEBUG__ === 'boolean' ? window.__AUX_DEBUG__ : null) ??
      (localStorage.getItem('aux_debug') === '1');
    let shownOnce = false;
    console.log = function patchedConsoleLog(...args) {
      try {
        const first = args[0];
        if (typeof first === 'string' && first.startsWith('[调试]')) {
          if (!DEBUG) return;
          if (!shownOnce) {
            RAW_LOG('🧪 调试模式已开启（仅此一次提示）');
            shownOnce = true;
          }
        }
      } catch (_) {}
      return RAW_LOG(...args);
    };
    // 只读属性：供外部随时查询当前调试开关状态
    Object.defineProperty(window, '__AUX_DEBUG_ACTIVE__', {
      get() { return !!DEBUG; }
    });
  })();

  // ===== 简易 sleep，用于异步等待 =====
  // delay(ms)：Promise 化的 setTimeout，供 async 流程 await 使用
  const delay = ms => new Promise(res => setTimeout(res, ms));

  // ============================================================
  // 【板块：精简数据库恢复】
  // ------------------------------------------------------------
  // ▍功能：
  //   确保 window.kami_core_db（由"精简数据库脚本"构建的账户全量 Kami
  //   数据，每条 17 个字段，含清算线 LT）在本脚本中可用：数据库脚本
  //   已先行加载时直接复用内存中的数组，否则从 localStorage 的持久化
  //   副本反序列化恢复。
  // ▍触发时机：脚本载入时立即执行一次。
  // ▍依赖：
  //   - window.kami_core_db：精简数据库脚本维护的内存数组；
  //   - localStorage key "kami_core_db"：数据库的持久化 JSON 副本。
  // ▍核心流程：
  //   1) window.kami_core_db 已是数组 → 直接使用并打印条数；
  //   2) 否则读 localStorage.kami_core_db（缺省用 '[]'），JSON.parse
  //      后经 Array.isArray 校验，是数组才采用，否则置空数组；
  //   3) 解析异常（JSON 损坏等）→ 打日志并置空数组兜底。
  // ▍边界与保护：
  //   - try/catch + Array.isArray 双重校验，任何情况下
  //     window.kami_core_db 最终都是数组，后续 find/遍历不会抛错；
  //   - 数据为空时，LT 显示等功能自动退化为"查不到记录就跳过该卡"。
  // ▍新手提示：
  //   首次使用本套件时，请先运行一次【精简数据库脚本】构建数据库；
  //   否则本脚本的 LT 显示、技能重置门槛判断、地块适配分析、杀手候选
  //   扫描都会因为查不到数据而跳过或降级。数据库建好后持久化在
  //   localStorage 中，之后刷新页面无需重跑；日常新增 kami 由核心脚本
  //   的 syncKamiDb() 增量补全。
  // ▍可调参数：无。
  // ▍相关控制台命令：
  //   - window.kami_core_db — 在 Console 直接查看当前数据库内容。
  // ============================================================
  if (Array.isArray(window.kami_core_db)) {
    log(`📦 已检测到已加载的精简数据库，共 ${window.kami_core_db.length} 条 Kami`);
    log('🔍 控制台查看：window.kami_core_db');
  } else {
    try {
      const core = JSON.parse(localStorage.getItem('kami_core_db') || '[]');
      window.kami_core_db = Array.isArray(core) ? core : [];
      log(`📦 精简数据库已恢复到内存，共 ${window.kami_core_db.length} 条 Kami`);
      log('🔍 控制台查看：window.kami_core_db');
    } catch (e) {
      log('❌ 读取 kami_core_db 失败：', e);
      window.kami_core_db = [];
    }
  }

  // ===== 获取imgNumber函数（与核心脚本一致）=====
  // 从节点（本身是 <img> 时直接用，否则在其内部找 src 含 /kami/ 的图）
  // 提取 Kami 形象图编号：匹配 src 中的 /kami/<数字>.gif，返回字符串
  // 编号，找不到返回 null。imgNumber 是本脚本与精简数据库
  // （kami_core_db）对齐记录的主键，实现须与核心脚本保持一致。
  function getimgNumber(node) {
    const img = node.tagName === 'IMG'
      ? node
      : node.querySelector('img[src*="/kami/"]');
    const m = img?.src?.match(/\/kami\/(\d+)\.gif/);
    return m ? m[1] : null;
  }

  // ============================================================
  // 【板块：LT 清算线显示 + 危险 Kami 标红（combinedUIUpdate）】
  // ------------------------------------------------------------
  // ▍功能：
  //   在 party 面板每张 Kami 卡片的 HP 文本后追加该 Kami 的清算线
  //   LT（灰色小字，如 "31.25%"），并把"采集中且 HP 已逼近清算线"
  //   的危险 Kami 的 HP 文本整体标红，让玩家一眼看出谁快被杀。
  //   渲染完全走"data 属性 + 注入 CSS"方案（见上方样式注入板块），
  //   不插入任何 DOM 节点，React 重渲染后显示依然存在。
  // ▍触发时机：
  //   1) 页面就绪（waitForPageReady 达成）后立即执行一次；
  //   2) #party 区域发生 DOM 变化（如点眼睛图标切换卡片展开状态）
  //      时，经 300ms 防抖后执行；
  //   3) 每 5 分钟定时兜底执行一次；
  //   4) 在 Console 手动执行 window.__refreshLT() 时。
  // ▍依赖：
  //   - DOM：div#party 下的卡片列表（选择器
  //     div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div，
  //     依赖站点当前 DOM 层级）；卡片内 src 含 /kami/<编号>.gif 的
  //     形象图（提供 imgNumber）；src 含 /assets/kami_ 的状态图标及
  //     其下一个兄弟节点（HP 文本）；src 含 eye-half 的眼睛图标
  //     （页面就绪判据之一）；
  //   - window.kami_core_db：按 imgNumber 检索记录，取 LT 字段；
  //   - 上方注入的 [data-lt-tag]::after 与 [data-kami-danger="1"]
  //     两条 CSS 规则。
  // ▍核心流程：
  //   1) waitForPageReady：用 MutationObserver 监听 body 的 childList
  //      变化（替代每秒轮询，省 CPU），"眼睛图标 + 卡片列表"同时出现
  //      即视为就绪；60 秒超时强制放行，避免异常页面卡死流程；
  //   2) 启动时先清理历史 DOM 插入方案的残留（span.__lt_percent__
  //      节点、data-lt-inserted 标记），防止视觉重复或 dataset 干扰；
  //   3) combinedUIUpdate 遍历每张卡片：提取 imgNumber → 找状态图标
  //      与 HP 节点 → 正则解析 HP 百分比（优先带括号的 "(xx%)"，
  //      回退裸 "xx%"）→ 按 imgNumber 查数据库取 LT；
  //   4) 任务1（LT 显示）：把 LT 格式化为两位小数百分比写入
  //      hpDiv.dataset.ltTag，由 CSS ::after 自动渲染在 HP 之后；
  //   5) 任务2（危险标红）：状态图标 src 含 kami_harvesting（采集中）
  //      且 HP% < LT+2 时写 data-kami-danger="1"，否则删除该属性；
  //   6) 注册 #party 的 MutationObserver（300ms 防抖）与 5 分钟兜底
  //      定时器，保证卡片被 React 重建后属性能被重新写入。
  // ▍边界与保护：
  //   - 每张卡片的处理包在独立 try/catch 中，单卡异常不影响其余卡片；
  //   - imgNumber / hpDiv / 数据库记录任一缺失即跳过该卡（容错回退，
  //     只影响该卡显示，不报错不中断）；
  //   - dataset 写入前先比对旧值，值相同不重写：属性突变最少化，且
  //     attribute 突变本就不触发 childList observer，与 #party 监听
  //     不构成反馈循环，大量卡片同屏也不会引发突变风暴；
  //   - waitForPageReady 有 60 秒超时保护；兜底定时器内亦有 try/catch；
  //   - 顺手清空历史方案遗留的 inline style 颜色，避免样式叠加冲突。
  // ▍可调参数：
  //   - killPercent + 2 — 危险判定的安全余量（百分点）：调大更早标红
  //     （更保守），调小则贴线才提示；
  //   - toFixed(2) — LT 标签保留的小数位数；
  //   - 300（ms）— #party 突变防抖窗口：调小响应更快但重算更频繁；
  //   - 5 * 60 * 1000（ms）— 兜底重跑间隔；
  //   - 60000（ms）— 页面就绪等待的超时上限。
  // ▍相关控制台命令：
  //   - window.__refreshLT() — 立即手动重跑一次 LT 显示与危险标红。
  // ============================================================

  function combinedUIUpdate() {
    (window.__kamiHealthBeats = window.__kamiHealthBeats || {})['LT显示'] = Date.now();   // 健康心跳
    // party 面板中的 Kami 卡片列表（依赖站点当前的 DOM 层级结构）
    const kamiList = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
    console.log('[调试] combinedUIUpdate: 检测到卡片数量 =', kamiList.length);

    kamiList.forEach((kamiDiv, idx) => {
      try {
        // === 获取基础元素 ===
        const imgNumber = getimgNumber(kamiDiv);
        if (!imgNumber) {
          console.log(`[调试] 卡片#${idx+1} 跳过：未找到 imgNumber`);
          return;
        }

        // 状态图标：src 含 /assets/kami_（harvesting/resting 等）；HP 文本在其下一个兄弟节点
        const stateImg = kamiDiv.querySelector('img[src*="/assets/kami_"]');
        const hpDiv = stateImg?.nextElementSibling || null;

        if (!hpDiv) {
          console.log(`[调试] 卡片#${idx+1} 未找到 hpDiv`);
          return;
        }

        // === 获取HP和LT ===
        // HP 优先匹配带括号的 "(xx%)" 格式，找不到再回退匹配裸 "xx%"
        const hpText = hpDiv?.textContent?.trim() || '';
        const match = hpText.match(/\((\d+)%\)/) || hpText.match(/(\d+)%/);
        const hpPercent = match ? parseInt(match[1], 10) : NaN;

        console.log(`[调试] 卡片#${idx+1} img=${imgNumber} hpText="${hpText}" hp%=${isNaN(hpPercent) ? 'NaN' : hpPercent}`);

        // 用 imgNumber 在精简数据库中检索该 Kami，LT 字段即清算线百分比
        const record = window.kami_core_db?.find(k => k.imgNumber === imgNumber);
        const killPercent = Number(record?.LT);

        if (!record) {
          console.log(`[调试] 卡片#${idx+1} 未命中DB：img=${imgNumber}`);
        }

        // === 任务1：通过 dataset.ltTag 显示 LT（CSS ::after 自动渲染）===
        // 不用 appendChild span 的原因：React 重渲染会删掉脚本插入的节点。
        //   data-* 属性写入属于 attribute 突变，不会触发 childList observer，
        //   与 #party 监听不构成反馈循环；配合下方"值相同不重写"，
        //   大量卡片同屏时也不会引发突变风暴。
        if (!isNaN(killPercent)) {
          const newTag = `${killPercent.toFixed(2)}%`;
          if (hpDiv.dataset.ltTag !== newTag) {
            hpDiv.dataset.ltTag = newTag;  // 去重写入：值相同不触发突变
          }
        }

        // === 任务2：标红危险 kami（用 data-kami-danger + CSS）===
        // 不用 hpDiv.style.color 的原因：inline style 会被 React 重渲染重置；
        //   data 属性 + CSS !important 在重渲染后依然生效，更稳
        // 仅"采集中"的 Kami 参与危险判定（休息中的 Kami 不会被清算）
        const isHarvesting = stateImg?.src?.includes('kami_harvesting') ?? false;
        let isDanger = '';
        if (isHarvesting && !isNaN(hpPercent) && !isNaN(killPercent)) {
          // HP% 低于 清算线+2 即标红：+2 个百分点是安全余量，宁可早提示
          if (hpPercent < killPercent + 2) isDanger = '1';
        }
        if ((hpDiv.dataset.kamiDanger || '') !== isDanger) {
          if (isDanger) hpDiv.dataset.kamiDanger = '1';
          else delete hpDiv.dataset.kamiDanger;
        }
        // 顺手清掉历史 inline style 方案写下的颜色残留，避免与 CSS 规则叠加
        if (hpDiv.style.color) hpDiv.style.color = '';

      } catch (e) {
        console.log('[调试] 处理单卡异常：', e);
      }
    });
  }

  // 使用 MutationObserver 检测页面就绪，替代每秒轮询
  function waitForPageReady() {
    return new Promise((resolve) => {
      // 就绪判据：party 卡片列表已渲染，且眼睛图标（eye-half）已出现
      const check = () => {
        const kamiList = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
        const eyeHalf = document.querySelector('img[src*="eye-half"]');
        return eyeHalf && kamiList.length > 0;
      };

      // 先检查是否已经ready
      if (check()) {
        resolve();
        return;
      }

      // 使用 MutationObserver 监听DOM变化
      const observer = new MutationObserver((mutations, obs) => {
        if (check()) {
          obs.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // 超时保护：60秒后强制resolve
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 60000);
    });
  }

  // 启动UI更新，监测 #party 区域变化自动插入
  waitForPageReady().then(() => {
    log('✅ 页面已就绪，启动UI更新（LT显示+标红）');

    // 清理历史 DOM 插入方案的残留（LT span 节点 + dataset.ltInserted 标记），
    // 避免视觉重复或 dataset 干扰（现行方案见上方板块说明）
    const oldSpans = document.querySelectorAll('span.__lt_percent__');
    oldSpans.forEach(s => s.remove());
    const oldFlags = document.querySelectorAll('[data-lt-inserted]');
    oldFlags.forEach(el => delete el.dataset.ltInserted);
    if (oldSpans.length > 0 || oldFlags.length > 0) {
      log(`🧹 清理旧版残留: ${oldSpans.length} 个 LT span + ${oldFlags.length} 个 dataset.ltInserted`);
    }

    combinedUIUpdate();

    // 监测 #party 区域，用户切换眼睛状态时自动重新插入
    const partyDiv = document.querySelector('#party');
    if (partyDiv) {
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          combinedUIUpdate();
        }, 300);  // 300ms防抖
      });
      observer.observe(partyDiv, { childList: true, subtree: true });
      log('👁️ 已启动 #party 区域监测，切换眼睛状态时自动插入LT');
    }

    // 每 5 分钟兜底重跑一次，覆盖 MutationObserver 漏触发的极端情况
    setInterval(() => {
      try { combinedUIUpdate(); } catch (e) { log('⚠️ [LT兜底] 异常: ' + (e?.message||e)); }
    }, 5 * 60 * 1000);
    log('⏰ 已启动 LT 5 分钟兜底定时器');
  });

  // 暴露手动刷新入口：Console 执行 window.__refreshLT() 可立即重跑一次 LT 显示与标红
  window.__refreshLT = combinedUIUpdate;

  // ============================================================
  // 【板块：技能系统 — 标准技能定义（STANDARD_SKILLS）】
  // ------------------------------------------------------------
  // ▍功能：
  //   定义自动技能管理认可的"标准技能"集合（技能 ID 的 Set）。技能
  //   巡检时，Kami 已点的技能若不在此集合内，视为非标准加点，会触发
  //   技能重置并按加点顺序表 SKILL_ORDER 重新加点。
  // ▍触发时机：脚本载入时定义常量；由"自动升级 + 技能管理"流程在
  //   每次技能检查时引用。
  // ▍依赖：与加点顺序表 SKILL_ORDER 保持一致（两处需同步维护）。
  // ▍核心流程：无独立流程，仅作为集合供 has() 查询。
  // ▍边界与保护：
  //   - 杀手白名单（见下一板块）中的 Kami 不参与此判断，不会被重置。
  // ▍可调参数：
  //   - 集合内的技能 ID — 3 开头为生存类、4 开头为收益类；增删 ID
  //     时必须同步修改 SKILL_ORDER，否则会出现"刚点完就被判为非标准
  //     而再次重置"的循环。
  // ▍新手提示：
  //   此标准 build 是作者面向"少被清算、采集更久"目标的个人策略，
  //   不是唯一解。想改用自己的 build：需同步修改 STANDARD_SKILLS
  //   （本板块）与 SKILL_ORDER、SKILL_CAP（见下文"标准技能 build
  //   定义"板块）三处，保持集合一致。若某只 kami 想完全手动加点、
  //   不被自动化管理，把它的编号加入下文的 RESET_WHITELIST 即可。
  // ▍相关控制台命令：无。
  // ============================================================

  // 标准技能列表（与SKILL_ORDER一致，不在此列表中的技能会被重置）
  const STANDARD_SKILLS = new Set([
    311, 312, 313,  // 生存类
    321, 322, 323,  // 生存类（321=meticulous, 323=armor）
    331,            // 单点生存
    341, 343,       // 生存类（不含342）
    352, 353,       // 生存类（不含351）
    361,            // 单点生存
    411, 412, 413,  // 收益类
    421, 422,       // 收益类
    431             // 单点收益
  ]);

  // ============================================================
  // 【板块：杀手白名单（RESET_WHITELIST）】
  // ------------------------------------------------------------
  // ▍功能：
  //   声明"杀手用途"Kami 的 index 集合。杀手 Kami 的加点思路与采集
  //   Kami 完全不同，绝不能被自动升级/技能重置/自动加点改动，因此
  //   命中白名单的 Kami 会被上述流程整体跳过。
  // ▍触发时机：脚本载入时定义；每次自动升级/技能巡检前查询。
  // ▍依赖：
  //   - window.MY_KILLER_KAMIS：核心脚本维护的杀手集合（监控脚本会
  //     向其注册成员），与本地 RESET_WHITELIST 合并判断。
  // ▍核心流程：判断某 Kami 是否为杀手时，RESET_WHITELIST 与
  //   window.MY_KILLER_KAMIS 任一命中即视为杀手，跳过自动处理。
  // ▍边界与保护：
  //   - 双集合合并判断，避免两份名单不同步导致杀手被误重置。
  // ▍可调参数：
  //   - RESET_WHITELIST 集合内容 — 把你自己的杀手 Kami 的 index（即
  //     kami 的数字编号，游戏中名字旁 # 后的数字）填进下方大括号内，
  //     多个用逗号分隔；自动升级/重置/加点将完全跳过它们。
  //     已在杀手监控脚本里配置过的 kami 会自动注册进
  //     window.MY_KILLER_KAMIS，无需在此重复填写；此处适合填监控脚本
  //     覆盖不到、或单纯想手动管理的个体。
  // ▍相关控制台命令：无。
  // ============================================================
  const RESET_WHITELIST = new Set([
    // 在此填入你的杀手 Kami index（数字编号），例如：1234, 5678
  ]);

  // 合并 RESET_WHITELIST + window.MY_KILLER_KAMIS（核心脚本维护，监控脚本会注册）
  // 任一命中即认为是杀手 kami，跳过自动升级/技能重置/技能加点
  // ============================================================
  // 【板块：杀手保护名单判断】
  // ------------------------------------------------------------
  // ▍功能：判断一只 kami 是否属于"保护名单"。命中保护的 kami 会被
  //   自动升级 / 技能重置 / 自动加点全部跳过，只能由用户手动操作。
  //   典型场景：杀手 kami 走攻击系加点，与标准采集 build 完全不同，
  //   若被自动化按标准顺序重置/加点，会直接毁掉杀手 build。
  // ▍触发时机：handleOneKamiLevelAndSkill 处理每只 kami 的入口处调用。
  // ▍依赖：
  //   - RESET_WHITELIST：本脚本内定义的 Set<number>，手工维护的
  //     kami 编号保护名单（填入不希望被自动化改动的编号，例如自养
  //     杀手或特殊 build 的个体）。
  //   - window.MY_KILLER_KAMIS：核心脚本暴露的 Set<number>，当前
  //     账户正在服役的杀手 kami 编号，由核心脚本动态维护。
  // ▍核心流程：1) 编号统一转 Number 2) 查 RESET_WHITELIST
  //   3) 查 window.MY_KILLER_KAMIS；命中任一即返回 true。
  // ▍边界与保护：MY_KILLER_KAMIS 未加载或类型不符时安全跳过该项
  //   检查（先判 instanceof Set），不会抛错。
  // ▍可调参数：RESET_WHITELIST 的内容 — 增删编号即可调整保护范围。
  // ▍相关控制台命令：无（内部工具函数）。
  // ============================================================
  function _isProtectedKami(index) {
    const idx = Number(index);
    if (RESET_WHITELIST.has(idx)) return true;
    if (window.MY_KILLER_KAMIS instanceof Set && window.MY_KILLER_KAMIS.has(idx)) return true;
    return false;
  }

  // ============================================================
  // 【板块：清算线计算】
  // ------------------------------------------------------------
  // ▍功能：本地复刻链上清算判定公式，计算一只 kami 的清算线：
  //   LT   = 会被杀手清算的 HP 百分比线（HP% 低于该线即可被清算）；
  //   LTHP = 对应的绝对 HP 值（清算比例 × maxhp）。
  //   与精简数据库脚本使用同一套公式，保证升级/加点后本地实时重算
  //   出的 LT 与数据库全量重建的结果一致，无需等下一轮全量扫描。
  // ▍触发时机：handleOneKamiLevelAndSkill 末尾的"数据库更新"阶段，
  //   在升级/加点/重置确实发生后调用。
  // ▍依赖：纯计算函数，无 DOM / window 接口 / 存储依赖；入参取自
  //   链上 API getByIndex 返回的 stats / traits / bonuses 字段。
  // ▍核心流程（逐变量说明）：
  //   1) 合法性检查：harmony、maxhp 必须 > 0，否则返回 null（容错）。
  //   2) E（体质威胁系数）：body 部件 affinity 为 'normal' 取 0.2，
  //      其余体质取 0.5 —— 非 normal 体存在被属性克制的杀手，
  //      按最坏情况（被克制）估算，威胁系数更高。
  //   3) deltaR = max(0, 0.5 - ratio)：ratio 为防御技能提供的
  //      bonuses.defense.threshold.ratio 加成，基准缺口 0.5，
  //      每点技能线性削减该乘数项，点满后归零。
  //   4) deltaS = max(0, 0.4 - shift)：shift 同理，基准缺口 0.4；
  //      注意 deltaS 是加法项，直接抬高清算比例——未点 shift 类
  //      技能时清算线天生高出 40 个百分点，这是防御系技能加点
  //      优先级排最前的根本原因。
  //   5) normCdf：标准正态分布 CDF 的多项式近似（Abramowitz &
  //      Stegun 7.1.26 的 erf 近似；a1~a5 与 0.3275911 均为该公式
  //      的固定系数，最大误差约 1.5e-7）。
  //   6) phi = Φ(ln(V / harmony))，截断到 [0,1]：harmony 相对杀手
  //      Violence 越高，ln 越负、phi 越小、清算线越低。
  //   7) frac = clamp01( phi × 0.4 × (1 + E + deltaR) + deltaS )，
  //      0.4 为清算公式的基准比例常数；frac 即"可被清算的 HP
  //      剩余比例上限"。
  // ▍边界与保护：phi、frac 均双向截断到 [0,1]；harmony/maxhp 非正
  //   时返回 { LT:null, LTHP:null }，调用方按"无数据"处理。
  // ▍可调参数：V_CONST = 41 — 假想攻击方（杀手）的 Violence 基准值。
  //   调大 = 假设敌人更强 → 算出的 LT 更高、策略更保守；调小则更
  //   激进。应与实际环境中活跃杀手的 Violence 水平匹配。
  // ▍相关控制台命令：无（内部工具函数）。
  // ============================================================
  // ⚠️ v1.1.1 起：实际清算线改由下方【精确清算线计算】板块负责（官方公式 +
  //   顶尖杀手档案）；本旧公式保留作参考/对照，不再参与任何决策。
  // 假想杀手的 Violence 基准值（见上方"可调参数"说明）
  const V_CONST = 41;
  function computeLiquidationLine(V, harmony, bodyAffinity, ratio, shift, maxhp) {
      // 数据缺失容错：harmony / maxhp 非正数时无法计算，返回 null
      if (!(harmony > 0) || !(maxhp > 0)) return { LT: null, LTHP: null };
      const body = String(bodyAffinity || '').toLowerCase();
      // 体质威胁系数：normal 体取 0.2，其余体质按最坏情况（被属性克制）取 0.5
      const E = (body === 'normal') ? 0.2 : 0.5;
      // 防御 ratio 加成的剩余缺口（基准 0.5，点满归零，进入乘数项）
      const deltaR = Math.max(0, 0.5 - (ratio ?? 0));
      // 防御 shift 加成的剩余缺口（基准 0.4，加法项，直接抬高清算比例）
      const deltaS = Math.max(0, 0.4 - (shift ?? 0));
      // 标准正态分布 CDF 的多项式近似（Abramowitz & Stegun 7.1.26，误差约 1.5e-7）
      const normCdf = x => {
          const sign = x < 0 ? -1 : 1;
          // 除以 √2：把标准正态 CDF 的自变量换算成 erf 的自变量
          x = Math.abs(x) / Math.SQRT2;
          const t = 1 / (1 + 0.3275911 * x);
          // a1~a5：erf 近似公式的固定多项式系数
          const a1 = 0.254829592, a2 = -0.284496736,
                a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
          const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
          // 利用对称性处理负半轴
          return sign === 1 ? 0.5 * (1 + y) : 0.5 * (1 - y);
      };
      // phi = Φ(ln(V/harmony))：harmony 相对杀手 Violence 越高，phi 越小
      const phi = Math.max(0, Math.min(1, normCdf(Math.log(V / harmony))));
      // 清算比例 = phi × 0.4 × (1 + 体质系数 + ratio缺口) + shift缺口，截断到 [0,1]
      const frac = Math.max(0, Math.min(1, phi * 0.4 * (1 + E + deltaR) + deltaS));
      return {
          LT: +(frac * 100).toFixed(2),
          LTHP: +(frac * maxhp).toFixed(2)
      };
  }

  // ============================================================
  // 【板块：精确清算线计算（官方公式 + 顶尖杀手档案）】
  // ------------------------------------------------------------
  // ▍功能：按游戏合约的官方精确公式计算清算线，威胁参数来自
  //   "全网最强杀手档案"（见文件后部【全网最强杀手扫描】板块）：
  //     清算线% = Φ(ln(攻Vio/守Harm)) × 0.4 × (1 + 亲和 + 攻ATR − 守DTR)
  //               + (攻ATS − 守DTS)      （负值截断为 0 = 不可杀）
  //   亲和规则（合约 LibAffinity 源码确认）：
  //     攻hand 克 守body = +0.5（EERIE克SCRAP、SCRAP克INSECT、INSECT克EERIE）
  //     被克 = −0.5；攻守双方都是 NORMAL = +0.2；其余组合（含单方 NORMAL）= 0
  //   与上方旧公式的区别：旧公式相当于把"满配假想杀手"（V41+满攻击技能+
  //   永远克制）焊死在公式里，普遍偏保守约 30 个百分点；本公式改用
  //   "真实存在的最强杀手"参数——清算线更准 → 停采线更低 → 采集更久省 gas。
  // ▍威胁参数来源（优先级）：
  //   1) localStorage「kami_top_predators」—— 每周自动全网扫描的最新结果；
  //   2) 无扫描数据时用下方 TOP_PREDATORS_DEFAULT 内置默认档案兜底。
  // ▍依赖：无外部依赖（纯计算）；档案维护见后部扫描板块。
  // ▍相关控制台命令：scanTopPredators() / showTopPredators() / refreshPreciseLT()
  // ============================================================

  // localStorage 专用键——独立键值对，与 kami_core_db / kami_mode / gas 记录等互不覆盖
  const TOP_PREDATORS_KEY = 'kami_top_predators';
  // 扫描结果有效期：超过 7 天则启动时自动重扫
  const TOP_PREDATORS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  // 技能重置优先级门槛（精确清算线刻度；旧公式刻度的 75% ≈ 新刻度 40%）
  const RESPEC_LT_THRESHOLD = 40;
  // 内置默认档案（兜底：首次运行还没有扫描数据时按这份算；2026-07-07 全网实测四桶最强样本）
  // 字段：hand=杀手的手型亲和；vio=Violence 总值；ats/atr=攻击方 threshold 技能加成
  // ⚠️ 同步维护：精简数据库脚本（公开≥1.1.8/内部≥1.1.13）内置同值副本 DB_TOP_PREDATORS，且构建时直接按其写精确初值——改这里的公式或默认档案必须两处同步。
  const TOP_PREDATORS_DEFAULT = [
    { label: '包络EERIE手',  hand: 'EERIE',  vio: 36, ats: 0.29, atr: 0.50 },   // 维度包络：vio/atr 取 0707 #11224、ats 取 0708 #4277（非真实个体，对已知现实恒保守）
    { label: '默认SCRAP手',  hand: 'SCRAP',  vio: 41, ats: 0.30, atr: 0.50 },
    { label: '默认INSECT手', hand: 'INSECT', vio: 36, ats: 0.26, atr: 0.50 },
    { label: '默认NORMAL手', hand: 'NORMAL', vio: 34, ats: 0.30, atr: 0.50 },
  ];

  // 标准正态 CDF（与上方旧公式同一 Abramowitz–Stegun 近似，抽出为共享工具）
  function __ltCdf(x) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
    return sign === 1 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  // 亲和 shift（合约规则：special 仅在双方都是 NORMAL 时生效）
  const __LT_BEATS = { EERIE: 'SCRAP', SCRAP: 'INSECT', INSECT: 'EERIE' };
  function __ltAffinity(attHand, defBody) {
    if (attHand === 'NORMAL' && defBody === 'NORMAL') return 0.2;
    if (attHand === 'NORMAL' || defBody === 'NORMAL') return 0;
    if (__LT_BEATS[attHand] === defBody) return 0.5;
    if (__LT_BEATS[defBody] === attHand) return -0.5;
    return 0;
  }
  // 单对精确清算线：atk={vio,hand,ats,atr}，def={harm,body,dtr,dts} → %（0~100）
  function computePreciseLT(atk, def) {
    if (!(atk.vio > 0) || !(def.harm > 0)) return 0;
    const animosity = __ltCdf(Math.log(atk.vio / def.harm)) * 0.4;
    const efficacy  = 1 + __ltAffinity(String(atk.hand || '').toUpperCase(), String(def.body || '').toUpperCase())
                        + (atk.atr || 0) - (def.dtr || 0);
    const shift     = (atk.ats || 0) - (def.dts || 0);
    return Math.max(0, Math.min(1, animosity * efficacy + shift)) * 100;
  }
  // ── 活跃度感知选档：账面最强 ≠ 真威胁——主人长期不上链的杀手实战威胁极低（0707 实测：
  //    SCRAP 账面最强 #4711 的主人已沉寂 115 天）。每桶剔除"主人超过 PREDATOR_INACTIVE_DAYS
  //    天无链上动作"的候选、其余全部参与取最坏；整桶都沉寂则整桶保守回退（线宁高勿低）。
  //    活跃度用时实查（accounts.getByID 本地 ECS 零 gas），10 分钟记忆缓存；扫描后立即失效重选。
  //    注意：精简数据库脚本的公式副本不含本选档逻辑（建库初值保持静态保守档案），属有意差异。
  const PREDATOR_INACTIVE_DAYS = 10;   // 主人超过该天数无链上动作 → 该杀手降级不参与清算线（可调）
  let __predSelCache = null;           // { at, result } 选档记忆缓存
  function __ownerInactiveDays(ownerId) {
    // 返回主人已沉寂天数；查不到（无 id / API 未就绪 / 无记录）返回 0 = 按活跃处理（保守）
    try {
      if (!ownerId) return 0;
      const last = window.network?.explorer?.accounts?.getByID?.(ownerId)?.time?.last;
      return last > 0 ? Math.max(0, (Date.now() / 1000 - last) / 86400) : 0;
    } catch (e) { return 0; }
  }
  const __fmtAgoDays = ts => ts > 0 ? `${((Date.now() / 1000 - ts) / 86400).toFixed(1)} 天前活跃` : '活跃度未知';
  // 读取当前生效的威胁档案：优先扫描结果（经活跃度过滤），缺失/损坏时用内置默认
  function getEffectivePredators() {
    if (__predSelCache && Date.now() - __predSelCache.at < 10 * 60000) return __predSelCache.result;
    let result = null;
    try {
      const raw = localStorage.getItem(TOP_PREDATORS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const list = [], demoted = [];
        for (const h of ['EERIE', 'SCRAP', 'INSECT', 'NORMAL']) {
          const cands = (data?.buckets?.[h] || []).filter(e => e && e.vio > 0);
          if (!cands.length) continue;
          const idles = cands.map(e => ({ e, idle: __ownerInactiveDays(e.ownerId) }));
          const actives = idles.filter(x => x.idle <= PREDATOR_INACTIVE_DAYS).map(x => x.e);
          if (actives.length) {   // 只有存在活跃候选时才真正降级沉寂者；整桶沉寂=全桶回退
            for (const x of idles) if (x.idle > PREDATOR_INACTIVE_DAYS)
              demoted.push({ hand: h, index: x.e.index, owner: x.e.owner || '', idleDays: Math.round(x.idle) });
          }
          const used = actives.length ? actives : cands;
          for (const e of used) list.push({ label: `#${e.index}${e.owner ? '@' + e.owner : ''}`, hand: h, vio: e.vio, ats: e.ats || 0, atr: e.atr || 0, lt24: e.lt24 });
        }
        if (list.length) result = { list, source: '全网扫描', at: data.at || 0, demoted, benchHarm: data.benchHarm };
      }
    } catch (e) {}
    if (!result) result = { list: TOP_PREDATORS_DEFAULT, source: '内置默认', at: 0, demoted: [] };
    __predSelCache = { at: Date.now(), result };
    return result;
  }
  // 对给定威胁档案列表取最坏清算线（compareLT 与 computePreciseLTForRecord 共用）
  function __worstLTOver(preds, harmony, bodyAffinity, ratio, shift, maxhp) {
    if (!(harmony > 0) || !(maxhp > 0)) return { LT: null, LTHP: null };
    const def = { harm: harmony, body: bodyAffinity, dtr: ratio ?? 0, dts: shift ?? 0 };
    let worst = 0;
    for (const p of preds) {
      const lt = computePreciseLT(p, def);
      if (lt > worst) worst = lt;
    }
    return { LT: +worst.toFixed(2), LTHP: +((worst / 100) * maxhp).toFixed(2) };
  }
  // 按一条 db 记录的守方参数，对全部"活跃档案"取最坏清算线（主人沉寂的杀手已被 getEffectivePredators 降级）。
  // 返回与旧 computeLiquidationLine 相同的 { LT, LTHP } 形状，便于原调用点直接替换。
  function computePreciseLTForRecord(harmony, bodyAffinity, ratio, shift, maxhp) {
    return __worstLTOver(getEffectivePredators().list, harmony, bodyAffinity, ratio, shift, maxhp);
  }

  // ============================================================
  // 【板块：等级经验表与升级次数计算】
  // ------------------------------------------------------------
  // ▍功能：维护"每级升到下一级所需 XP"的静态成本表（Lv 1→56），
  //   并根据当前等级与累计经验计算一次能连升多少级——这是自动升级
  //   一次要发多少笔升级 tx 的直接依据。
  // ▍触发时机：handleOneKamiLevelAndSkill 查到 kami 的 level/xp 后调用。
  // ▍依赖：纯静态表 + 纯函数，无外部依赖。
  // ▍核心流程（computeLevelUps）：从当前等级开始逐级模拟扣除：
  //   1) 查表取 XP_COST[cur]（cur 级升到 cur+1 级所需经验）；
  //   2) 经验足够则扣除、等级 +1、可升次数 +1；
  //   3) 表缺项或经验不足即停止，返回 { ups: 可升次数,
  //      targetLevel: 升完后的等级, xpRemain: 剩余经验 }。
  // ▍边界与保护：level/xp 强转 Number 并容错为 0；cur 达到
  //   MAX_LEVEL_SUPPORTED 或查不到表项时安全停止，不会死循环。
  // ▍可调参数：
  //   - XP_COST：经验表，相邻等级增长系数 ≈1.259（≈10^0.1，
  //     即每 10 级所需经验恰好 ×10）；游戏调整经验曲线时需同步更新。
  //   - MAX_LEVEL_SUPPORTED = 56 — 经验表覆盖的最高等级；游戏开放
  //     更高等级时需先扩充 XP_COST 再抬高此值，否则自动升级到此即停。
  // ▍相关控制台命令：无（内部工具函数）。
  // ============================================================
  // XP_COST[n] = 从 n 级升到 n+1 级所需经验
  const XP_COST = {
    // 1-10级
    1:40, 2:50, 3:63, 4:79, 5:100,
    6:126, 7:159, 8:200, 9:252, 10:317,
    // 11-20级
    11:400, 12:503, 13:634, 14:798, 15:1005,
    16:1266, 17:1593, 18:2006, 19:2526, 20:3180,
    // 21-30级
    21:4004, 22:5041, 23:6347, 24:7991, 25:10061,
    26:12667, 27:15948, 28:20079, 29:25280, 30:31827,
    // 31-35级
    31:40071, 32:50449, 33:63516, 34:79966, 35:100678,
    // 36-40级
    36:126744, 37:159558, 38:200868, 39:252873, 40:318342,
    // 41-45级
    41:400761, 42:504518, 43:635138, 44:799575, 45:1006585,
    // 46-50级
    46:1267190, 47:1595265, 48:2008279, 49:2528222, 50:3182779,
    // 51-56级
    51:4007119, 52:5044963, 53:6351608, 54:7996674, 55:10067813, 56:12675377
  };
  const MAX_LEVEL_SUPPORTED = 56;  // 经验表覆盖的最高等级；游戏开放更高等级时需先扩充 XP_COST

  function computeLevelUps(level, xp) {
    let cur = Number(level)||0, left = Number(xp)||0, ups = 0;
    while (cur < MAX_LEVEL_SUPPORTED) {
      // 查不到表项（超出支持上限）或经验不足即停止
      const need = XP_COST[cur]; if (!need || left < need) break;
      left -= need; cur += 1; ups += 1;
    }
    return { ups, targetLevel: cur, xpRemain: left };
  }

  // ============================================================
  // 【板块：标准技能 build 定义】
  // ------------------------------------------------------------
  // ▍功能：定义采集型 kami 的标准技能 build——每个技能的投点上限
  //   （SKILL_CAP）与加点先后顺序（SKILL_ORDER）。自动加点严格按
  //   此顺序执行；投点落在此集合之外的技能视为"非标准技能"，会
  //   触发下文的检测与重置流程。
  // ▍设计原则：先生存 → 再收益。优先点满降低清算线的防御系技能
  //   （threshold ratio / shift 类），让 kami 能在地块上安全采集
  //   更久，之后再点产出/回复类收益技能——对应整套脚本"减少 TX、
  //   省 gas、采集更久"的总体策略。
  // ▍结构说明：
  //   - 技能 ID 为三位数编码：首位区分技能树大类（3xx / 4xx 两棵
  //     树），后两位为树内节点编号。
  //   - SKILL_CAP：Map<技能ID, 投点上限>。大多数技能上限 5 点；
  //     331 / 361 / 431 上限仅 1 点（一点即满的关键节点）。
  //   - SKILL_ORDER：标准加点顺序，自动加点从前往后逐个点到上限，
  //     点满一个再进下一个。
  // ▍触发时机：静态配置，脚本加载时定义；加点与检测流程随时读取。
  // ▍依赖：需与 STANDARD_SKILLS（标准技能 ID 集合）保持一致，否则
  //   新增的标准技能会被误判为非标准而反复触发重置。
  // ▍边界与保护：SKILL_CAP 未登记的技能在加点时按默认上限 5 处理。
  // ▍可调参数：直接调整 SKILL_ORDER 顺序或 SKILL_CAP 上限即可改变
  //   标准 build（记得同步 STANDARD_SKILLS）。
  // ▍相关控制台命令：无（静态配置）。
  // ============================================================
  // 每个技能的投点上限
  const SKILL_CAP = new Map([
    [311,5],[312,5],[313,5],[321,5],[322,5],[323,5],[331,1],[341,5],[342,5],[343,5],[351,5],[352,5],[353,5],[361,1],
    [411,5],[412,5],[413,5],[421,5],[422,5],[431,1],
  ]);
  // 标准加点顺序：从前往后依次点满（先防御生存，后收益）
  const SKILL_ORDER = [311,312,321,323,331,322,343,341,313,353,352,361,411,412,421,431,413,422];

  // ============================================================
  // 【板块：Respec 药水库存查询】
  // ------------------------------------------------------------
  // ▍功能：查询当前账户背包中 Respec Potion（技能洗点药水）的数量。
  //   链上技能重置每次消耗 1 瓶，重置前必须先确认库存。
  // ▍触发时机：一键升级流程开始时查询一次，之后随重置消耗在内存中
  //   递减，不重复查询。
  // ▍依赖：
  //   - window.network.network.connectedAddress：当前连接的钱包地址
  //     （兼容 .value_ 与 .value 两种字段封装）。
  //   - window.network.explorer.accounts.getByOperator(addr)：链上 API，
  //     按操作者地址查询账户信息（含 inventories 背包数组）。
  // ▍核心流程：1) 取钱包地址 2) 查账户信息 3) 在 inventories 中按
  //   item.index === RESPEC_POTION_INDEX 定位药水 4) 返回 balance。
  // ▍边界与保护：账户无背包数据时返回 0；任何异常捕获后记日志并
  //   返回 0——把"查询失败"当作"没有药水"，宁可跳过重置也不冒险。
  // ▍可调参数：RESPEC_POTION_INDEX = 11403 — Respec Potion 在游戏
  //   物品注册表中的 item.index，仅游戏更新物品表时才需修改。
  // ▍相关控制台命令：无（内部工具函数）。
  // ============================================================

  const RESPEC_POTION_INDEX = 11403;  // Respec Potion（洗点药水）的 item.index

  /**
   * 获取 Respec Potion 的数量
   */
  async function getRespecPotionCount() {
    try {
      // 钱包地址字段存在 .value_ 与 .value 两种封装，做兼容读取
      const addr = window.network?.network?.connectedAddress?.value_
                || window.network?.network?.connectedAddress?.value;
      const acc = await window.network?.explorer?.accounts?.getByOperator(addr);

      if (!acc?.inventories) return 0;

      // 在背包数组中按物品 index 定位 Respec Potion
      const potion = acc.inventories.find(inv => inv.item?.index === RESPEC_POTION_INDEX);
      return potion?.balance ?? 0;
    } catch (e) {
      log(`❌ 获取 Respec Potion 数量失败: ${e?.message || e}`);
      return 0;
    }
  }

  // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：新增冷却计算工具，
  // 与核心脚本 _cooldownRemainSec 同源（同一 T=180s / time.last 锚点公式）。
  // 🔻SYNC→内部版[1.1.18 升级冷却预筛]：用途升级——handleOneKamiLevelAndSkill
  // 入口现直接用本函数的 remain 做"本轮跳过/继续"判定（冷却预筛），不再是
  // 纯观察；升级流程内其余调用点（等级升级前、加点前、Respec 失败分支）走到
  // 时已过入口预筛，remain 恒为 0，仍按原样打观察日志，供事后 grep 核对，
  // 不重复刷屏预筛信息。复活（helperReviveOnce）保持纯观察，不接入预筛
  // ——死亡是保命操作，须尽快复活，不因冷却跳过等下轮，且复活对象是 DEAD
  // kami，冷却语义未定。
  // ============================================================
  // 【板块：冷却计算工具（_obsCooldownAge）】
  // ------------------------------------------------------------
  // ▍功能：给定 harvest.time.last（秒级时间戳），返回 { age, remain }——
  //   age=距上次操作已过多少秒，remain=距冷却结束还剩多少秒（>0 表示
  //   大概率仍在冷却窗内）。
  // ▍用途说明：
  //   - 升级/加点/Respec（handleOneKamiLevelAndSkill 入口，见该函数
  //     核心流程步骤 3）：remain>0 → 预筛跳过，本轮不发任何升级/加点/
  //     Respec tx，下一个 30 分钟周期自然重试；
  //   - 复活（helperReviveOnce）：仅打观察日志，不影响复活判定；
  //   - 事后可 grep "🔬 [" 统计 age<180 与 age>=180 两组的操作成败率。
  // ▍边界与保护：timeLastSec 读不到（null/undefined/0/非正数）返回 null，
  //   调用处需自行处理 null（升级预筛处：读不到则跳过预筛、按原逻辑继续；
  //   复活/观察日志处：跳过该次观察日志或标记"age未知"）。
  // ============================================================
  function _obsCooldownAge(timeLastSec) {  // 返回 {age, remain}，读不到返回 null
    if (!(timeLastSec > 0)) return null;
    const age = Math.round(Date.now() / 1000 - timeLastSec);
    return { age, remain: Math.max(0, 180 - age) };
  }

  // ============================================================
  // 【板块：非标准技能检测】
  // ------------------------------------------------------------
  // ▍功能：对比一只 kami 的实际技能投点与标准 build，找出所有
  //   "点了但不属于标准 build"的技能。存在非标准投点通常意味着
  //   该 kami 曾被手动加点或沿用过旧的加点方案——技能点被占用后，
  //   标准的防御/收益技能就点不满，因此需要先 Respec 重置、再按
  //   标准顺序重新加点。
  // ▍触发时机：handleOneKamiLevelAndSkill 中，等级升级完成之后、
  //   分配技能点之前调用。
  // ▍依赖：STANDARD_SKILLS —— 标准 build 技能 ID 集合（Set<number>）。
  // ▍核心流程：遍历链上返回的 investments 投点明细，收集
  //   points > 0 且 skillId 不在 STANDARD_SKILLS 中的项，
  //   以 [{ skillId, points }] 数组返回；空数组 = 投点全部标准。
  // ▍边界与保护：investments 不是数组时返回空数组（视为无非标准
  //   技能，不触发重置）；points 强转 Number 容错。
  // ▍可调参数：无（标准集合在 STANDARD_SKILLS 中维护）。
  // ▍相关控制台命令：无（内部工具函数）。
  // ============================================================
  function detectNonStandardSkills(investments) {
    const nonStandard = [];
    if (!Array.isArray(investments)) return nonStandard;

    investments.forEach(inv => {
      const skillId = Number(inv?.index);
      const points = Number(inv?.points) || 0;
      if (points > 0 && !STANDARD_SKILLS.has(skillId)) {
        nonStandard.push({ skillId, points });
      }
    });

    return nonStandard;
  }

  // ============================================================
  // 【板块：技能重置（Respec）】
  // ------------------------------------------------------------
  // ▍功能：调用链上接口重置一只 kami 的全部技能投点，返还所有
  //   技能点（链上自动消耗 1 瓶 Respec Potion）。
  // ▍触发时机：检测到非标准技能、且满足重置条件（药水 ≥ 1 且
  //   清算线 LT > RESPEC_LT_THRESHOLD(40%)）时由主流程调用。
  // ▍依赖：window.network.api.player.pet.skill.reset(kamiId) 链上 API。
  // ▍核心流程：1) 校验 API 可用性 2) 发送重置 tx 3) 等待确认。
  // ▍边界与保护：
  //   - API 不可用直接 throw，由主流程 catch 记日志后继续后续步骤。
  //   - tx 对象有 wait 方法则等待链上确认；没有（钱包封装差异）则
  //     回退为固定等待 10 秒，避免重置尚未生效就去读旧投点。
  // ▍可调参数：delay(10000) — 回退等待毫秒数，链上拥堵时可调大。
  // ▍相关控制台命令：无（内部工具函数）。
  // ============================================================
  async function resetKamiSkills(kamiId, kamiIndex, timeLastSec) {
    const resetApi = window.network?.api?.player?.pet?.skill?.reset;
    if (!resetApi) {
      throw new Error('skill.reset API 不可用');
    }

    // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：Respec 发 tx 前记录 time.last age，
    // 仅用于事后 grep 统计 age<180（冷却窗内）与 age>=180 两组的重置成败率，不影响本次是否发送 tx。
    const __respecObs = _obsCooldownAge(timeLastSec);
    if (__respecObs) {
      log(`🔬 [Respec/冷却观察] #${kamiIndex} age=${__respecObs.age}s remain=${__respecObs.remain}s（${__respecObs.age < 180 ? '⚠️冷却窗内' : '已过冷却'}）→ 发送重置tx前`);
    }

    log(`🔄 正在重置 #${kamiIndex} 的技能...`);
    const tx = await resetApi(kamiId);
    // 有 wait 方法则等链上确认，否则回退固定等待
    if (typeof tx?.wait === 'function') {
      await tx.wait();
    } else {
      await delay(10000);
    }
    log(`✅ #${kamiIndex} 技能重置成功`);
    // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：Respec 成功分支观察日志——
    // Respec 消耗稀缺药水，成功=药水已消耗且投点已重置，供事后与失败分支对照统计。
    if (__respecObs) {
      log(`🔬 [Respec/冷却观察] #${kamiIndex} age=${__respecObs.age}s → 结果=成功（已消耗1瓶Respec药水）`);
    }
  }

  // ============================================================
  // 【板块：技能加点（连续发送模式）】
  // ------------------------------------------------------------
  // ▍功能：把一只 kami 的可用技能点按 SKILL_ORDER 全部投出。采用
  //   "连续发送、只等最后一笔"模式：先算好完整加点计划，再不间断
  //   发出全部 upgrade tx，最后只等待最后一笔确认——链上按 nonce
  //   顺序执行，最后一笔确认即代表前面全部完成。相比逐笔等确认，
  //   整体耗时从 N × 确认时间降到约 1 × 确认时间。
  // ▍触发时机：handleOneKamiLevelAndSkill 确认有可用技能点后调用。
  // ▍依赖：
  //   - window.network.api.player.pet.skill.upgrade(kamiId, skillId)：
  //     链上加点 API，一笔 tx 投 1 点。
  //   - window.hasEmergencyLock() / window.waitForEmergencyRelease()：
  //     核心脚本的紧急锁接口（TX 双锁机制的一半）。杀手来袭等紧急
  //     场景核心脚本会上锁，本函数每笔 tx 发送前都先让路，避免与
  //     救急 tx 抢 nonce。
  //   - SKILL_ORDER / SKILL_CAP：标准 build 定义板块。
  // ▍核心流程：
  //   1) 制定计划：按 SKILL_ORDER 遍历，每个技能可投点数 =
  //      min(上限 - 已投, 剩余技能点)，生成 plan=[{skillId,times}]，
  //      直到技能点分完或顺序走完；
  //   2) 连续发送：双层循环逐笔调用 upgrade，记录 lastTx 与已发笔数；
  //   3) 收尾：等待 lastTx 确认（无 wait 方法时回退等 12 秒）。
  // ▍边界与保护：
  //   - 紧急锁让路：每笔 tx 前检查，锁存在则等待释放（上限 300 秒）；
  //     等待超时或释放接口缺失 → 置 failed 双层退出，停止发送。
  //     已发出的 tx 不回滚（无害：点数没投完，下一轮会继续补）。
  //   - 单笔发送失败：记日志并停止后续发送，避免出现 nonce 空洞让
  //     后面的 tx 全部卡住。
  //   - 确认阶段出错只记警告不抛出——tx 已发出，结果以链上为准。
  //   - 技能点为 0 或无可投计划时直接返回 0，不发任何 tx。
  // ▍可调参数：
  //   - SKILL_CAP.get(skillId) ?? 5 — 未登记上限的技能按 5 点处理。
  //   - 300000（毫秒）— 等待紧急锁释放的上限，调小 = 更快放弃当前这只。
  //   - delay(12000) — 无 wait 方法时的回退确认等待。
  // ▍相关控制台命令：无（内部函数，由一键升级流程调用）。
  // ============================================================

  /**
   * 技能加点（连续发送模式）
   * 先算好每个技能要投几点，连续发送所有 tx，只等最后一笔确认
   * @param {string} kamiId - kami 实体 ID（链上调用用）
   * @param {number} kamiIndex - kami 编号（日志显示用）
   * @param {number} skillPoints - 本次可分配的技能点数
   * @param {Map<number,number>} investmentsMap - 当前已投点明细（技能ID → 点数）
   * @returns {number} 实际发送的 tx 笔数
   */
  async function upgradeSkillsByOrder(kamiId, kamiIndex, skillPoints, investmentsMap, timeLastSec) {
    if (!skillPoints || skillPoints <= 0) return 0;
    const api = window.network?.api?.player?.pet?.skill;
    if (!api?.upgrade) throw new Error('api.player.pet.skill.upgrade 不可用');

    // 先计算每个技能需要升几点
    let remaining = skillPoints;
    const plan = [];  // [{ skillId, times }]
    for (const skillId of SKILL_ORDER) {
      if (remaining <= 0) break;
      // 未在 SKILL_CAP 登记的技能按默认上限 5 点处理
      const cap = SKILL_CAP.get(skillId) ?? 5;
      const cur = investmentsMap.get(skillId) ?? 0;
      // 本技能可投点数 = min(上限 - 已投, 剩余技能点)
      const take = Math.min(Math.max(0, cap - cur), remaining);
      if (take > 0) {
        plan.push({ skillId, times: take });
        remaining -= take;
      }
    }

    if (plan.length === 0) {
      log(`[#${kamiIndex}] 无技能需要升级`);
      return 0;
    }

    const totalTx = plan.reduce((s, p) => s + p.times, 0);
    log(`🚀 [#${kamiIndex}] 连续发送 ${totalTx} 笔技能升级tx（${plan.map(p => `${p.skillId}x${p.times}`).join(', ')}）...`);

    // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：加点连发前记录 time.last age，
    // 仅用于事后 grep 统计 age<180（冷却窗内）与 age>=180 两组的加点成败率，不影响本次发送。
    const __skillObs = _obsCooldownAge(timeLastSec);
    if (__skillObs) {
      log(`🔬 [加点/冷却观察] #${kamiIndex} 加点前 time.last age=${__skillObs.age}s remain=${__skillObs.remain}s（${__skillObs.age < 180 ? '⚠️冷却窗内' : '已过冷却'}）→ 计划发送${totalTx}笔`);
    }

    // 连续发送所有tx
    let sent = 0;
    let lastTx = null;
    let failed = false;
    for (const { skillId, times } of plan) {
      if (failed) break;
      for (let i = 0; i < times; i++) {
        // 每笔tx前：如果紧急锁存在，等待释放（最多300秒）再继续，而不是直接中断
        if (window.hasEmergencyLock?.()) {
          if (typeof window.waitForEmergencyRelease === 'function') {
            const released = await window.waitForEmergencyRelease(`#${kamiIndex}技能升级`, 300000);
            if (!released) {
              log(`⚠️ [#${kamiIndex}] 等待紧急锁超时，停止发送技能tx（已发${sent}/${totalTx}笔）`);
              failed = true;
              break;
            }
          } else {
            log(`⚠️ [#${kamiIndex}] 紧急锁存在且 waitForEmergencyRelease 不可用，停止（已发${sent}/${totalTx}笔）`);
            failed = true;
            break;
          }
        }
        try {
          const tx = await api.upgrade(kamiId, skillId);
          lastTx = tx;
          sent++;
        } catch (e) {
          log(`❌ [#${kamiIndex}] 技能${skillId}第${i+1}笔tx发送失败: ${e?.message?.slice(0,60) || e}`);
          failed = true;
          break;
        }
      }
    }

    // 等待最后一笔tx确认（链上按 nonce 顺序执行，最后一笔确认即全部完成）
    if (lastTx) {
      try {
        if (typeof lastTx?.wait === 'function') await lastTx.wait(); else await delay(12000);
      } catch (e) {
        log(`⚠️ [#${kamiIndex}] 等待技能升级tx确认出错: ${e?.message?.slice(0,60) || e}`);
      }
    }

    log(`🛡️ [#${kamiIndex}] 技能升级完成，发送${sent}/${totalTx}笔tx`);
    // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：加点结果观察日志——记录本轮起始age、
    // 最终成败与"成功笔数/共几笔"，与上方"加点前"日志成对，供事后 grep 统计。
    if (__skillObs) {
      log(`🔬 [加点/冷却观察] #${kamiIndex} 起始age=${__skillObs.age}s → 加点结果=${sent >= totalTx ? '成功' : (sent > 0 ? '部分成功' : '失败')}（成功${sent}/${totalTx}笔）`);
    }
    return sent;
  }

  // ============================================================
  // 【板块：单只 Kami 升级 + 技能管理主流程】
  // ------------------------------------------------------------
  // ▍功能：对一只 RESTING 状态的 kami 完成一条龙处理：
  //   ① 等级升级（经验够几级升几级，连续发 tx）；
  //   ② 非标准技能检测 → 满足条件时 Respec 重置；
  //   ③ 按标准顺序分配所有可用技能点；
  //   ④ 有实际变化时重算清算线并写回本地数据库。
  // ▍触发时机：由"一键升级所有 RESTING Kami"流程逐只调用。
  // ▍依赖：
  //   - window.network.explorer.kamis.getByIndex(index, opts)：链上
  //     查询（progress=等级经验、skills=技能投点、stats/traits/
  //     bonus/harvest=重算清算线所需字段）。
  //   - window.network.api.player.pet.level(kamiId)：升级 tx。
  //   - window.hasEmergencyLock / window.waitForEmergencyRelease：
  //     核心脚本紧急锁接口（TX 双锁机制）。
  //   - window.kami_core_db + localStorage key 'kami_core_db'：精简
  //     数据库脚本构建的本地数据库（读取 LT 门槛 + 回写新 LT）。
  //   - RESET_WHITELIST / window.MY_KILLER_KAMIS：保护名单。
  // ▍核心流程：
  //   1) 状态检查：非 RESTING 直接跳过（升级/重置/加点均要求休息态）；
  //   2) 保护名单检查：杀手等受保护 kami 跳过，交由用户手动处理；
  //   3) 🔻SYNC→内部版[1.1.18 升级冷却预筛] 冷却预筛：复用 res.harvest.time.last
  //      算出 remain，remain>0（仍在 180s 冷却窗内）→ 本轮整只跳过升级/重置/
  //      加点，留到下一个 30 分钟周期（upgradekamis 由 30 分钟 setInterval
  //      定时触发）自然重升，非永久跳过；一处入口拦住下游全部 tx，避免
  //      "一只 kami 连发多笔 tx 撞冷却、N 笔全废"；
  //   4) 等级升级：computeLevelUps 算出可升次数 → 连续发送升级 tx
  //      （每笔前给紧急锁让路）→ 只等最后一笔确认；
  //   5) 非标准技能检测：升级过则重查投点，否则复用已有数据；先保存
  //      重置前完整投点明细，供"技能重置摘要"做前后对比；
  //   6) 重置决策（两个条件缺一不可）：
  //      - Respec Potion ≥ 1（药水不足只记日志、跳过重置）；
  //      - 该 kami 清算线 LT > RESPEC_LT_THRESHOLD(40%)（药水是稀缺资源，优先洗高清算线
  //        的高危个体；LT 低说明暂时安全，重置不急）。
  //      满足则重置 → 缓冲 2 秒 → 重查投点；
  //   7) 技能点分配：有变化则重查最新状态，确认仍为 RESTING 后调用
  //      upgradeSkillsByOrder 按标准顺序投点；
  //   8) 重置摘要：仅在重置成功时打印一行"[技能重置摘要]"汇总，
  //      含旧投点 → 新投点对比，方便日后 grep 审计；
  //   9) 数据库更新：本次未升级、未加点、未重置则直接跳过（省一次
  //      API 查询）；否则重新拉取 stats/traits/bonus 等字段，用
  //      computeLiquidationLine 重算 LT/LTHP，更新 harmony、maxhp、
  //      ratio、shift、level、harvestId 并写回 localStorage。
  // ▍边界与保护：
  //   - prefetched 预取复用：上层批量扫描时已查过一次的数据直接
  //     传入，避免重复 API 调用；
  //   - 状态双检：入口一次、分配技能点前再一次，防止处理途中 kami
  //     被派去采集/遭攻击导致状态变化后误发 tx；
  //   - 紧急锁让路：升级与加点的每笔 tx 前都检查，上限等 300 秒；
  //   - 冷却预筛非永久跳过：只影响本轮这一只，同轮其他 kami 不受影响；
  //     下个 30 分钟周期自然重新扫描，无漏升风险；
  //   - 重置失败仅记日志，继续走后续加点（按当前投点分配剩余点数）；
  //   - 数据库更新失败仅警告，不影响主流程返回值。
  // ▍可调参数：
  //   - LT 门槛 75（%）— 重置资格线。调低 = 更多 kami 有资格洗点
  //     （更费药水）；调高 = 只救最危险的个体。
  //   - delay(2000) — 重置确认后的缓冲等待，等索引器同步新投点。
  //   - delay(12000) — 升级 tx 无 wait 方法时的回退确认等待。
  // ▍相关控制台命令：无（由一键升级入口统一调用，见下一板块）。
  // ============================================================

  /**
   * 处理单个Kami：升级 + 检测/重置非标准技能 + 加点
   * @param {Object} k - Kami 对象
   * @param {number} respecPotionCount - 当前 Respec Potion 数量
   * @param {Object|null} prefetched - 预取的 getByIndex 数据（含 progress + skills），避免重复查询
   * @returns {boolean} 是否消耗了一个 Respec Potion
   */
  async function handleOneKamiLevelAndSkill(k, respecPotionCount = 0, prefetched = null) {
    let usedPotion = false;

    // 使用预取数据或重新查询
    // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：加 harvest:true 仅为读到 harvest.time.last，
    // 供本函数内升级/加点/Respec 的观察日志计算 age/remain，不改变原有升级判定逻辑。
    const res = prefetched || await window.network.explorer.kamis.getByIndex(k.index, { progress:true, skills:true, harvest:true });

    // 🔻SYNC[1.1.19 升级预筛接线修复]：0709 夜实盘审计定案——冷却预筛/观察日志
    // （1.1.17/1.1.18 加的）整夜 0 输出，但升级模块实际发了 45+ 笔 tx，接线断了：
    // 预扫描阶段（~1788行）的 getByIndex 未带 harvest:true（避免 198+ 只逐只
    // 多读 harvest 的开销），其结果作为 prefetched 传入本函数，触发上面
    // `prefetched || ...` 短路——带 harvest:true 的唯一查询因此永不执行，
    // res.harvest 恒为 undefined，_obsCooldownAge(undefined)=null，下方预筛
    // 与全部 🔬 观察日志因此恒不触发（#15348 在紧急停采窗口排队179秒后连发
    // 升级tx，正是该拦的场景，零日志）。此处不改预扫描查询，只对真正进入本函数
    // 的少数 kami（每轮通常个位数）补读一次 harvest 字段，零风险：失败则
    // res.harvest 保持 undefined，预筛/观察日志按修复前行为（无冷却信息可用，
    // 判定按无冷却处理）跳过，不引入新的失败模式。
    if (res && !res.harvest) {
      try {
        const __hv = await window.network.explorer.kamis.getByIndex(k.index, { harvest: true });
        if (__hv?.harvest) {
          res.harvest = __hv.harvest;
          const __diagCd = _obsCooldownAge(res.harvest?.time?.last);
          if (__diagCd) {
            log(`[升级诊断] #${k.index} 补读 harvest.time.last: age=${__diagCd.age}s remain=${__diagCd.remain}s`);
          }
        }
      } catch (e) {
        log(`[升级诊断] #${k.index} harvest 字段补读失败，本轮按无冷却处理`);
      }
    }

    const state = String(res?.state||'').toUpperCase();
    if (state !== 'RESTING') {
      log(`⏭️ 跳过 #${k.index}（状态=${state}）`);
      return usedPotion;
    }

    // 【保护名单】杀手Kami跳过自动升级/重置/加点，由用户手动处理
    // _isProtectedKami 同时检查 RESET_WHITELIST 与 window.MY_KILLER_KAMIS
    if (_isProtectedKami(k.index)) {
      log(`🛡️ 跳过 #${k.index}（杀手保护清单），升级/重置/加点请手动操作`);
      return usedPotion;
    }

    // 🔻SYNC→内部版[1.1.18 升级冷却预筛]：单只处理入口一处预筛，拦住本函数下游
    // 所有后续 tx（下方"等级升级"连发循环、resetKamiSkills 调用、
    // upgradeSkillsByOrder 调用三处）——升级是"一只 kami 连发多笔 tx"，撞 cooldown
    // 会 N 笔全废，最该预筛。冷却中 → 本轮整只跳过，留到下一个 30 分钟周期
    // （upgradekamis 由 30 分钟 setInterval 定时触发，远大于 180s 冷却窗，
    // 下轮必已解除）自然重升，非永久跳过、无漏升风险。不 await 死等、不占锁，
    // 只影响这一只，同轮其他 kami 不受影响。复用 1.1.17 已有的 _obsCooldownAge
    // 由"纯观察"升级为"预筛判定"依据，下方原观察日志点位保留（本函数走到
    // 那里时说明已过冷却，remain=0，仅供事后统计参考，不再重复刷屏预筛信息）。
    const __cd = _obsCooldownAge(res?.harvest?.time?.last);
    if (__cd && __cd.remain > 0) {
      log(`⏳ [升级/冷却预筛] #${k.index} 冷却中剩余 ${__cd.remain}s（age=${__cd.age}s），本轮跳过升级，留到下一个 30 分钟周期（那时冷却早已解除）`);
      return usedPotion;
    }

    const kamiId = res?.id;
    const level  = res?.progress?.level ?? 0;
    const xp     = res?.progress?.experience ?? 0;

    const { ups, targetLevel } = computeLevelUps(level, xp);
    log(`[#${k.index}] level=${level}, xp=${xp} → 计划升 ${ups} 次，目标 ${targetLevel}`);

    // === 等级升级 ===
    const lvlApi = window.network?.api?.player?.pet?.level;
    if (!lvlApi) throw new Error('api.player.pet.level 不可用');

    // 连续发送升级tx，不逐个等待确认，大幅提升速度
    let actualLevelUps = 0;
    if (ups > 0) {
      log(`🚀 [#${k.index}] 连续发送 ${ups} 次升级tx...`);
      // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：等级升级连发前记录 time.last age，
      // 仅用于事后 grep 统计 age<180（冷却窗内）与 age>=180 两组的升级成败率，不影响本次发送。
      const __lvlObs = _obsCooldownAge(res?.harvest?.time?.last);
      if (__lvlObs) {
        log(`🔬 [升级/冷却观察] #${k.index} 等级升级前 time.last age=${__lvlObs.age}s remain=${__lvlObs.remain}s（${__lvlObs.age < 180 ? '⚠️冷却窗内' : '已过冷却'}）→ 计划升${ups}次`);
      }
      const txList = [];
      for (let i = 0; i < ups; i++) {
        // 每笔tx前：如果紧急锁存在，等待释放（最多300秒）再继续，而不是直接中断
        if (window.hasEmergencyLock?.()) {
          if (typeof window.waitForEmergencyRelease === 'function') {
            const released = await window.waitForEmergencyRelease(`#${k.index}等级升级`, 300000);
            if (!released) {
              log(`⚠️ [#${k.index}] 等待紧急锁超时，停止发送升级tx（已发${txList.length}/${ups}笔）`);
              break;
            }
          } else {
            log(`⚠️ [#${k.index}] 紧急锁存在且 waitForEmergencyRelease 不可用，停止（已发${txList.length}/${ups}笔）`);
            break;
          }
        }
        try {
          const tx = await lvlApi(kamiId);
          txList.push({ tx, fromLevel: level + i });
          actualLevelUps++;
        } catch (e) {
          log(`❌ [#${k.index}] 第 ${i+1}/${ups} 次升级tx发送失败: ${e?.message||e}`);
          break;
        }
      }

      // 等待最后一笔tx确认（链上按nonce顺序执行，最后一笔确认意味着前面的都已完成）
      if (txList.length > 0) {
        const lastTx = txList[txList.length - 1].tx;
        try {
          if (typeof lastTx?.wait === 'function') await lastTx.wait(); else await delay(12000);
        } catch (e) {
          log(`⚠️ [#${k.index}] 等待最后一笔tx确认出错: ${e?.message||e}`);
        }
        log(`⬆️ [#${k.index}] 升级完成: ${level} → ${level + txList.length}（发送${txList.length}笔tx）`);
      }

      // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：等级升级结果观察日志——记录本轮起始age、
      // 最终成败与"成功笔数/共几笔"，与上方"升级前"日志成对，供事后 grep 统计。
      if (__lvlObs) {
        log(`🔬 [升级/冷却观察] #${k.index} 起始age=${__lvlObs.age}s → 等级升级结果=${txList.length >= ups ? '成功' : (txList.length > 0 ? '部分成功' : '失败')}（成功${txList.length}/${ups}笔）`);
      }
    }

    // === 检测非标准技能并重置 ===
    // 优化：如果没有实际升级，复用预取数据，无需重新查询
    let res2, invArr;
    if (actualLevelUps > 0) {
      res2 = await window.network.explorer.kamis.getByIndex(k.index, { skills:true });
      invArr = Array.isArray(res2?.skills?.investments) ? res2.skills.investments : [];
    } else {
      res2 = res;
      invArr = Array.isArray(res?.skills?.investments) ? res.skills.investments : [];
    }

    // 保存重置前完整分配明细，供"技能重置摘要"汇总行做前后对比
    const fullInvBeforeReset = invArr.map(inv => ({
      skillId: Number(inv?.index),
      points: Number(inv?.points) || 0,
    })).filter(s => s.points > 0);

    const nonStandard = detectNonStandardSkills(invArr);
    let resetSucceeded = false;

    if (nonStandard.length > 0) {
      const skillsStr = nonStandard.map(s => `${s.skillId}(${s.points}点)`).join(', ');
      // 打印旧分配全貌（不只是非标准的），方便对比
      const fullStr = fullInvBeforeReset.map(s => `${s.skillId}x${s.points}`).join(', ') || '(空)';
      log(`⚠️ #${k.index} 发现非标准技能: ${skillsStr} | 当前完整分配: [${fullStr}]`);

      // 从精简数据库获取清算线
      const dbRecord = window.kami_core_db?.find(r => r.index === k.index);
      const lt = dbRecord?.LT ?? 0;

      // 重置条件（缺一不可）：Potion数量 >= 1 且 清算线 > RESPEC_LT_THRESHOLD(40%)（药水稀缺，优先洗高危个体）
      if (respecPotionCount < 1) {
        log(`❌ #${k.index} 需要重置技能，但 Respec Potion 不足（当前: ${respecPotionCount}），跳过重置`);
      } else if (lt <= RESPEC_LT_THRESHOLD) {
        log(`⏭️ #${k.index} 清算线较低（LT=${lt}% <= ${RESPEC_LT_THRESHOLD}%），暂不重置，优先处理高清算线的Kami`);
      } else {
        log(`🔄 准备重置 #${k.index} 的技能（LT=${lt}%，消耗 1 个 Respec Potion）...`);

        try {
          await resetKamiSkills(kamiId, k.index, res?.harvest?.time?.last);
          usedPotion = true;
          resetSucceeded = true;
          // 重置确认后稍等 2 秒，等索引器同步新投点再重查
          await delay(2000);

          res2 = await window.network.explorer.kamis.getByIndex(k.index, { skills:true });
          invArr = Array.isArray(res2?.skills?.investments) ? res2.skills.investments : [];
        } catch (e) {
          log(`❌ 重置技能失败 #${k.index}：${e?.message||e}`);
          // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：Respec 失败分支观察日志——
          // 特别标注失败时药水是否仍被扣（tx revert 通常不扣，但需人工核对余额确认）。
          const __respecObsFail = _obsCooldownAge(res?.harvest?.time?.last);
          if (__respecObsFail) {
            log(`🔬 [Respec/冷却观察] #${k.index} age=${__respecObsFail.age}s → 结果=失败（药水是否仍被扣待核对余额）`);
          }
        }
      }
    }

    // === 分配技能点 ===
    // 优化：如果没有实际升级、也没有重置技能，复用已有数据
    let finalCheck, finalState, points, finalInvArr;
    if (actualLevelUps > 0 || usedPotion) {
      // 升级或重置后需要重新查询最新状态
      finalCheck = await window.network.explorer.kamis.getByIndex(k.index, { skills: true });
      finalState = String(finalCheck?.state || '').toUpperCase();
    } else {
      // 没有升级也没有重置，复用 res2 数据
      finalCheck = res2;
      finalState = String(res2?.state || '').toUpperCase();
    }

    if (finalState !== 'RESTING') {
      log(`⚠️ [#${k.index}] 状态已变为${finalState}，跳过技能分配`);
      return usedPotion;
    }

    points = finalCheck?.skills?.points ?? 0;
    finalInvArr = Array.isArray(finalCheck?.skills?.investments) ? finalCheck.skills.investments : [];
    // 当前已投点明细：技能ID → 点数，供加点计划计算各技能的剩余额度
    const invMap = new Map(finalInvArr.map(it => [Number(it?.index), Number(it?.points)||0]));

    if (points > 0) {
      log(`[#${k.index}] 可用技能点：${points} → 开始分配`);
      await upgradeSkillsByOrder(kamiId, k.index, points, invMap, res?.harvest?.time?.last);
    } else {
      log(`[#${k.index}] 无可用技能点，跳过技能升级`);
    }

    // 技能重置摘要：仅在确实重置成功时打印一行汇总，便于 grep "技能重置摘要" 审计
    if (resetSucceeded) {
      try {
        const afterCheck = await window.network.explorer.kamis.getByIndex(k.index, { skills:true });
        const afterArr = Array.isArray(afterCheck?.skills?.investments) ? afterCheck.skills.investments : [];
        const afterStr = afterArr
          .map(inv => ({ id: Number(inv?.index), pts: Number(inv?.points)||0 }))
          .filter(s => s.pts > 0)
          .map(s => `${s.id}x${s.pts}`)
          .join(', ') || '(空)';
        const beforeStr = fullInvBeforeReset.map(s => `${s.skillId}x${s.points}`).join(', ') || '(空)';
        const dbRecord2 = window.kami_core_db?.find(r => r.index === k.index);
        const lt2 = dbRecord2?.LT ?? 0;
        log(`📋 [技能重置摘要] #${k.index} LT=${lt2}% | 旧:[${beforeStr}] → 新:[${afterStr}] | 用Potion=1 | 可分配点=${points}`);
      } catch (e) {
        log(`⚠️ [技能重置摘要] #${k.index} 查询新分配失败: ${e?.message||e}`);
      }
    }

    // 升级/加点/重置后，重新查API更新 kami_core_db 中的清算线
    // 如果既没升级、也没分配技能点、也没重置技能，就没必要更新数据库
    if (actualLevelUps === 0 && points === 0 && !usedPotion) {
      log(`[#${k.index}] 无实际变化（未升级/未加点/未重置），跳过数据库更新`);
      return usedPotion;
    }
    try {
      const updated = await window.network.explorer.kamis.getByIndex(k.index, {
        stats: true, traits: true, bonus: true, harvest: true, progress: true
      });
      if (updated && Array.isArray(window.kami_core_db)) {
        // 重算清算线所需字段：harmony / maxhp / 防御阈值加成 / 体质 / 等级
        const newHarmony = updated.stats?.harmony?.total ?? null;
        const newMaxhp   = updated.stats?.health?.total ?? null;
        const newRatio   = updated.bonuses?.defense?.threshold?.ratio ?? 0;
        const newShift   = updated.bonuses?.defense?.threshold?.shift ?? 0;
        const bodyAff    = updated.traits?.body?.affinity ? String(updated.traits.body.affinity).toLowerCase() : null;
        const newLevel   = updated.progress?.level ?? null;

        // v1.1.1：清算线改用精确公式 + 顶尖杀手档案（旧公式保留在上方作参考）
        const { LT: newLT, LTHP: newLTHP } = computePreciseLTForRecord(newHarmony, bodyAff, newRatio, newShift, newMaxhp);

        const rec = window.kami_core_db.find(r => r.index === k.index);
        if (rec) {
          const oldLT = rec.LT;
          rec.harmony = newHarmony;
          rec.maxhp   = newMaxhp;
          rec.ratio   = newRatio;
          rec.shift   = newShift;
          rec.LT      = newLT;
          rec.LTHP    = newLTHP;
          if (newLevel != null) rec.level = newLevel;
          rec.harvestId = updated.harvest?.id || rec.harvestId;
          // 写回 localStorage，供页面刷新后与其他脚本读取
          localStorage.setItem('kami_core_db', JSON.stringify(window.kami_core_db));
          log(`📊 [数据库更新] #${k.index} LT: ${oldLT}% → ${newLT}%, level: ${newLevel}, harmony: ${newHarmony}, maxhp: ${newMaxhp}`);
        } else {
          log(`⚠️ [数据库更新] #${k.index} 在 kami_core_db 中未找到记录，跳过更新`);
        }
      }
    } catch (dbErr) {
      log(`⚠️ [数据库更新] #${k.index} 更新失败: ${dbErr?.message || dbErr}`);
    }

    return usedPotion;
  }

  // ============================================================
  // === 一键升级所有RESTING的Kami ===
  // ============================================================

  /**
   * 等待紧急锁和普通锁均释放（升级专用）
   * 每15秒轮询一次，最长等待10分钟（紧急锁超时上限）
   * @returns {boolean} true=锁已释放可继续, false=超时放弃
   */
  // ============================================================
  // 【板块：waitForLocksRelease — 等待 TX 双锁释放】
  // ------------------------------------------------------------
  // ▍功能：轮询等待"紧急锁 + 普通锁"两把 TX 锁全部释放，是升级流程
  //   遇到锁冲突时的统一等待入口。两把锁由核心/辅助脚本共享，用于
  //   防止多个脚本同时发交易造成 nonce 冲突。
  // ▍触发时机：upgradekamis() 在两种场景调用——
  //   1) 预扫描期间检测到紧急锁（紧急停采正在发 TX，升级必须让路）；
  //   2) 正式升级前获取普通锁失败（其他操作正持有普通锁）。
  // ▍依赖：
  //   - window.hasEmergencyLock()：核心脚本提供的紧急锁查询接口；
  //   - window.__txNormalLock：共享的普通锁对象（script/operation 字段
  //     标记当前持锁的脚本与操作类型，此处仅用于日志显示持锁方）。
  // ▍核心流程：1) 每 15 秒查询一次两把锁状态；2) 两把锁都不存在 →
  //   返回 true；3) 累计等待超过 10 分钟仍未释放 → 打日志并返回
  //   false，调用方据此放弃本次升级。
  // ▍边界与保护：
  //   - 超时兜底：等待上限与紧急锁自身的 10 分钟超时自动释放对齐；
  //     即使持锁方异常挂死，锁最多 10 分钟后自动过期，等待不会死循环；
  //   - 可选链容错：核心脚本未加载时 hasEmergencyLock 为 undefined，
  //     视作无紧急锁，辅助脚本可独立运行；
  //   - 每轮打印已等待秒数与持锁方信息，便于排查卡锁。
  // ▍可调参数：
  //   - MAX_WAIT = 10*60*1000（10 分钟）— 最长等待时长；调小会更快
  //     放弃本次升级（下个 30 分钟定时周期会重试），调大意义不大
  //     （锁本身 10 分钟必过期）；
  //   - POLL_INTERVAL = 15*1000（15 秒）— 轮询间隔；调小仅让日志更密，
  //     调大则锁释放后最多多等一个间隔才被发现。
  // ▍相关控制台命令：无（内部函数，由 upgradekamis 调用）。
  // ============================================================
  async function waitForLocksRelease() {
    const MAX_WAIT = 10 * 60 * 1000;  // 最长等待10分钟
    const POLL_INTERVAL = 15 * 1000;  // 15秒轮询
    const start = Date.now();

    while (Date.now() - start < MAX_WAIT) {
      // 分别查询两把锁：紧急锁走核心脚本接口，普通锁直接读共享对象
      const hasEmergency = window.hasEmergencyLock?.();
      const hasNormal = !!window.__txNormalLock;

      if (!hasEmergency && !hasNormal) {
        return true;  // 两把锁都释放了
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      const lockInfo = [];
      if (hasEmergency) lockInfo.push('紧急锁');
      if (hasNormal) lockInfo.push(`普通锁[${window.__txNormalLock?.script}/${window.__txNormalLock?.operation}]`);
      log(`[升级等待] ⏳ ${lockInfo.join('+')} 仍存在，已等待${elapsed}秒，继续等待...`);

      await delay(POLL_INTERVAL);
    }

    log(`[升级等待] ⚠️ 等待锁释放超时（${MAX_WAIT/1000}秒），放弃本次升级`);
    return false;
  }

  // ============================================================
  // 【板块：upgradekamis — 批量升级 + 技能管理主流程】
  // ------------------------------------------------------------
  // ▍功能：一键处理所有休息中（RESTING）的 Kami——升级等级、分配
  //   技能点，必要时用 Respec Potion 重置非标准技能后按标准加点重新
  //   分配。采集中（HARVESTING）的 Kami 链上不允许升级，自动跳过。
  //   整体采用"先只读、后写"两阶段设计：确认确实有 Kami 需要处理
  //   之后才去抢 TX 锁，避免无谓地阻塞其他脚本发交易。
  // ▍触发时机：
  //   1) 游戏 API 就绪后自动执行一次（见 waitGameAndUpgrade 板块）；
  //   2) 之后每 30 分钟定时检查一次；
  //   3) 控制台手动运行 upgradekamis()；
  //   4) 被紧急锁中断后 5 秒自动续跑（带进度记录，跳过已处理的）。
  // ▍依赖：
  //   - window.network.explorer.accounts.getByOperator /
  //     kamis.getByIndex — 只读查询（账户 Kami 列表、单只等级/XP/技能）；
  //   - window.network.network.connectedAddress — 钱包地址；
  //   - handleOneKamiLevelAndSkill() — 单只升级+技能的实际执行者（发 TX）；
  //   - TX 双锁接口：window.hasEmergencyLock / tryAcquireNormalLock /
  //     releaseNormalLock / __txNormalLock；
  //   - window.MY_KILLER_KAMIS — 监控脚本注册的自家杀手 Kami 白名单
  //     （经 _isProtectedKami 判定，杀手的专用加点不会被当成非标准重置）；
  //   - window.__upgradeProcessed — 本轮已处理 Kami 的进度 Set，
  //     供中断恢复时去重；
  //   - getRespecPotionCount() — Respec Potion 库存查询。
  // ▍核心流程：
  //   1) 防重入：普通锁已被本脚本的 upgrade 操作持有 → 已有实例在跑，
  //      直接返回；
  //   2) 阶段1（只读，不加锁）：取钱包地址与 Kami 列表（带重试，应对
  //      启动初期数据未就绪）→ 筛出 RESTING → 逐只预扫描等级/XP/
  //      技能点/非标准技能，判定是否需要处理；
  //   3) 过滤出需要升级的，按等级从低到高排序依次处理；
  //   4) 阶段2（写操作）：再次防重入检查 → 获取普通锁（失败则等锁
  //      释放后延迟重试）→ 逐只调用 handleOneKamiLevelAndSkill；
  //   5) 首轮全部完成后释放锁，以 _isRecheck=true 立即复查一遍——
  //      升级过程中可能又产生新的等级/技能点（如喂了 XP 药水），
  //      复查轮结束后不再递归，避免无限循环。
  // ▍边界与保护：
  //   - 锁纪律：只读预扫描全程不占锁；写阶段先查紧急锁再抢普通锁；
  //     finally 无条件释放普通锁，异常也不会漏还；
  //   - 让路紧急停采：预扫描期间、以及每只处理前都检测紧急锁，一旦
  //     出现立即中断循环（emergencyBreak），5 秒后自动重跑续做；
  //   - 断点续跑：每只处理完（无论是否实际升级）记入 __upgradeProcessed，
  //     重跑时跳过已处理的；全部完成后清空进度；
  //   - 杀手白名单：_isProtectedKami 命中的 Kami 视作无非标准技能，
  //     其专用加点不会触发重置；
  //   - 单只容错：单只处理抛错仅记日志，不中断其余 Kami；
  //   - 抢锁竞态：等锁释放后先随机延迟 3~8 秒再抢，多个等锁方错峰；
  //   - 查询失败兜底：预扫描单只失败按 level=999、needsUpgrade=true
  //     记录，排序垫底但保证不被漏掉。
  // ▍可调参数：
  //   - MAX_RETRY = 6 — 获取 Kami 列表最多重试次数，每次间隔
  //     10000ms（10 秒），共约 1 分钟；启动慢的环境可调大；
  //   - delay(200) — 预扫描逐只查询间隔，防节点限流；
  //   - delay(3000 + random*5000) — 抢锁前 3~8 秒随机错峰窗口；
  //   - setTimeout 5000 — 紧急锁出现/中断后 5 秒重试；
  //   - setTimeout 15000 — 普通锁仍被占用时 15 秒后重试；
  //   - delay(2000 + random*1000) — 逐只处理间隔 2~3 秒，平滑 TX 节奏；
  //   - delay(2000) — 复查前缓冲 2 秒，等链上状态刷新。
  // ▍相关控制台命令：
  //   - upgradekamis() — 手动触发本流程；
  //   - checkAllKamiSkills() — 只读体检，预览哪些 Kami 会被处理。
  // ============================================================

  // _isRecheck：复查轮标记——首轮完成后以 true 再跑一遍查漏，复查轮结束即停
  async function upgradekamis(_isRecheck = false) {
    (window.__kamiHealthBeats = window.__kamiHealthBeats || {})['升级巡检'] = Date.now();   // 健康心跳
    // 如果另一个 upgradekamis 实例已在运行（持有普通锁），直接跳过
    const runningLock = window.__txNormalLock;
    if (runningLock?.operation === 'upgrade' && runningLock?.script === 'helper') {
      log('ℹ️ [升级] 升级任务已在运行中，跳过');
      return;
    }

    // ========================================
    // 阶段1：只读查询（不加锁，不阻塞其他操作）
    // ========================================
    let allKamis, restingList, harvestingCount;

    // 获取Kami列表，支持重试（游戏数据/钱包地址可能尚未就绪）
    const MAX_RETRY = 6;  // 最多重试6次，每次等10秒，共约1分钟
    for (let retry = 0; retry <= MAX_RETRY; retry++) {
      try {
        // 钱包地址字段名随构建不同可能是 value_ 或 value，两者都试
        const addr = window.network?.network?.connectedAddress?.value_ || window.network?.network?.connectedAddress?.value;
        // 地址为空、或仍是未解析的包装对象（非字符串）→ 视为未就绪
        if (!addr || typeof addr === 'object') {
          if (retry < MAX_RETRY) {
            log(`⏳ [升级] 钱包地址未就绪（${typeof addr}），10秒后重试 (${retry+1}/${MAX_RETRY})...`);
            await delay(10000);
            continue;
          }
          log('⚠️ [升级] 钱包地址始终不可用，跳过升级');
          return;
        }

        const acc = await window.network.explorer.accounts.getByOperator(addr);
        allKamis = Array.isArray(acc?.kamis) ? acc.kamis : [];

        if (allKamis.length > 0) break;

        if (retry < MAX_RETRY) {
          log(`⏳ [升级] 查询到 0 个 Kami，游戏数据可能未加载完成，10秒后重试 (${retry+1}/${MAX_RETRY})...`);
          await delay(10000);
        }
      } catch (e) {
        if (retry < MAX_RETRY) {
          log(`⚠️ [升级] 获取Kami列表出错: ${e?.message || e}，10秒后重试 (${retry+1}/${MAX_RETRY})...`);
          await delay(10000);
        } else {
          log(`❌ [升级] 获取Kami列表失败，已重试${MAX_RETRY}次: ${e?.message || e}`);
          return;
        }
      }
    }

    if (!allKamis || allKamis.length === 0) {
      log('⚠️ [升级] 重试后仍无法获取 Kami 列表，跳过升级');
      return;
    }

    restingList = allKamis.filter(k => String(k.state||'').toUpperCase() === 'RESTING');
    harvestingCount = allKamis.filter(k => String(k.state||'').toUpperCase() === 'HARVESTING').length;

    log(`📊 Kami 状态: 共 ${allKamis.length} 个, 休息中 ${restingList.length} 个, 采集中 ${harvestingCount} 个`);
    if (harvestingCount > 0) {
      log(`ℹ️ 注意: ${harvestingCount} 个采集中的Kami不能自动升级`);
    }

    if (restingList.length === 0) {
      log('🧮 没有休息中的 Kami 可以升级');
      return;
    }

    // === 预扫描阶段：获取每个Kami的等级/XP/技能点（只读查询，不需要锁）===
    // 跳过本轮已处理的Kami（中断恢复时避免重复扫描）
    const processed = window.__upgradeProcessed || new Set();
    const toScan = restingList.filter(k => !processed.has(k.index));
    if (toScan.length < restingList.length) {
      log(`⏭️ 跳过 ${restingList.length - toScan.length} 个已处理的Kami`);
    }
    if (toScan.length === 0) {
      log('🎉 所有 RESTING Kami 均已处理完毕');
      window.__upgradeProcessed = null;  // 清除进度
      return;
    }

    log(`🔍 预扫描 ${toScan.length} 个 RESTING Kami 的升级需求...`);
    const scanResults = [];
    for (const k of toScan) {
      // 预扫描期间检查紧急锁（让路紧急停采，但无需释放锁因为还没加锁）
      if (window.hasEmergencyLock?.()) {
        log(`[TX锁] ⏸️ 预扫描期间检测到紧急锁，等待释放后继续...`);
        const released = await waitForLocksRelease();
        if (!released) { log('⚠️ 等待锁释放超时，跳过升级'); return; }
      }
      try {
        // 单只详情：progress（等级/XP）+ skills（技能点/投资明细）
        const res = await window.network.explorer.kamis.getByIndex(k.index, { progress: true, skills: true });
        const level  = res?.progress?.level ?? 0;
        const xp     = res?.progress?.experience ?? 0;
        // 由当前等级 + 累计 XP 计算还能连升几级
        const { ups } = computeLevelUps(level, xp);
        const points = res?.skills?.points ?? 0;
        const invArr = Array.isArray(res?.skills?.investments) ? res.skills.investments : [];
        // 白名单杀手视作无非标准技能（保护其专用加点不被重置）
        const nonStandard = _isProtectedKami(k.index) ? [] : detectNonStandardSkills(invArr);

        // 可升等级 / 有未分配技能点 / 有非标准技能，任一命中即需处理
        const needsUpgrade = ups > 0 || points > 0 || nonStandard.length > 0;

        scanResults.push({
          kami: k, level, xp, ups, points, nonStandard, needsUpgrade,
          prefetched: res
        });
      } catch (e) {
        // 查询失败兜底：level=999 排序垫底，但标记需处理，保证不漏
        scanResults.push({ kami: k, level: 999, needsUpgrade: true, prefetched: null });
      }
      // 逐只查询间隔 200ms，防节点限流
      await delay(200);
    }

    // === 过滤 + 按等级从低到高排序 ===
    const needUpgradeList = scanResults
      .filter(s => s.needsUpgrade)
      .sort((a, b) => a.level - b.level);

    const skipCount = scanResults.length - needUpgradeList.length;
    if (skipCount > 0) {
      log(`⏭️ ${skipCount} 个 Kami 无需升级（已满级/无XP/无技能点），跳过`);
    }
    if (needUpgradeList.length === 0) {
      log('🎉 所有 RESTING Kami 均已完成升级，无需操作');
      return;
    }
    log(`📋 需要升级: ${needUpgradeList.length} 个，按等级排序: ${needUpgradeList.map(s => `#${s.kami.index}(Lv${s.level})`).join(', ')}`);

    // ========================================
    // 阶段2：确认有Kami需要升级，获取锁并执行（写操作）
    // ========================================

    // 再次检查：预扫描期间可能有其他 upgradekamis 实例开始运行了
    const existingLock = window.__txNormalLock;
    if (existingLock?.operation === 'upgrade' && existingLock?.script === 'helper') {
      log('ℹ️ [升级] 升级任务已在运行中，跳过');
      return;
    }

    // 抢普通锁：紧急锁存在或普通锁被占时，先等锁释放再延迟重试
    if (window.hasEmergencyLock?.() || !window.tryAcquireNormalLock?.('upgrade', 'helper')) {
      if (window.hasEmergencyLock?.()) {
        log(`[TX锁] ⏸️ 紧急锁存在，等待释放后开始升级...`);
      } else {
        const lock = window.__txNormalLock;
        log(`[TX锁] ⏸️ 普通锁被 [${lock?.script}/${lock?.operation}] 占用，等待释放后开始升级...`);
      }

      const released = await waitForLocksRelease();
      if (!released) return;

      // 随机等 3~8 秒再抢锁：多个等锁方错峰，降低同时抢锁的概率
      await delay(3000 + Math.floor(Math.random() * 5000));

      if (window.hasEmergencyLock?.()) {
        log(`[TX锁] ⏸️ 等待期间又出现紧急锁，重新等待...`);
        setTimeout(() => upgradekamis(), 5000);
        return;
      }
      if (!window.tryAcquireNormalLock?.('upgrade', 'helper')) {
        log(`[TX锁] ⏸️ 普通锁仍被占用，15秒后重试`);
        setTimeout(() => upgradekamis(), 15000);
        return;
      }
    }

    // 紧急锁中断标记：true 表示本轮被紧急停采打断，稍后自动续跑
    let emergencyBreak = false;

    try {
      let respecPotionCount = await getRespecPotionCount();
      log(`💊 当前 Respec Potion 数量: ${respecPotionCount}`);

      // === 逐个处理需要升级的 Kami ===
      for (let i = 0; i < needUpgradeList.length; i++) {
        if (window.hasEmergencyLock?.()) {
          log(`[TX锁] ⏸️ 检测到紧急锁，中断升级（已处理 ${i}/${needUpgradeList.length}）`);
          emergencyBreak = true;
          break;
        }
        const item = needUpgradeList[i];
        const k = item.kami;
        log(`—— 处理 ${i+1}/${needUpgradeList.length}：#${k.index}（Lv${item.level}, +${item.ups}级, ${item.points}技能点）——`);
        try {
          const usedPotion = await handleOneKamiLevelAndSkill(k, respecPotionCount, item.prefetched);
          if (usedPotion) {
            respecPotionCount -= 1;
            log(`💊 剩余 Respec Potion: ${respecPotionCount}`);
          }
          // 记录已处理（无论是否实际升级，都算已检查过）
          if (!window.__upgradeProcessed) window.__upgradeProcessed = new Set();
          window.__upgradeProcessed.add(k.index);
        } catch (e) {
          log(`❌ 处理失败 #${k.index}：${e?.message||e}`);
        }
        // 每只之间隔 2~3 秒（含随机抖动），平滑 TX 节奏
        await delay(2000 + Math.floor(Math.random()*1000));
      }

      if (emergencyBreak) {
        log(`⏳ 紧急锁中断升级，等待锁释放后自动继续剩余Kami...`);
        // 进度已保存在 __upgradeProcessed，重试时会跳过已处理的
        setTimeout(() => upgradekamis(), 5000);
      } else if (!_isRecheck) {
        // 第一轮完成，清除进度，再检查一遍是否有遗漏
        window.__upgradeProcessed = null;
        window.releaseNormalLock?.('upgrade', 'helper');
        log('🔄 升级完成，再检查一遍是否有遗漏...');
        // 等 2 秒让链上状态刷新，再以复查轮身份重跑（复查完不再递归）
        await delay(2000);
        return upgradekamis(true);
      } else {
        log('🎉 一键升级 + 技能分配 全部完成');
        window.__upgradeProcessed = null;  // 清除进度
      }
    } catch (e) {
      log(`❌ 一键升级流程错误：${e?.message||e}`);
    } finally {
      window.releaseNormalLock?.('upgrade', 'helper');
    }
  }

  // ============================================================
  // 【板块：checkAllKamiSkills — 全量技能体检（只读，不发 TX）】
  // ------------------------------------------------------------
  // ▍功能：检查账户下所有 Kami 的技能分配，找出偏离标准加点
  //   （STANDARD_SKILLS）的"非标准技能"，按白名单/清算线高低分组
  //   打印体检报告，并提示 Respec Potion 库存是否够用。纯只读，
  //   不重置、不发任何交易，可随时安全运行。
  // ▍触发时机：仅控制台手动调用 checkAllKamiSkills()。
  // ▍依赖：
  //   - window.network.explorer.accounts.getByOperator /
  //     kamis.getByIndex — 账户与单只技能/等级查询；
  //   - detectNonStandardSkills() — 比对标准加点，返回非标准技能列表；
  //   - _isProtectedKami() — 杀手白名单判定（含 window.MY_KILLER_KAMIS）；
  //   - window.kami_core_db — 精简数据库，按 index 取每只的清算线 LT；
  //   - getRespecPotionCount() — 药水库存查询。
  // ▍核心流程：1) 取账户全部 Kami；2) 逐只查技能投资与等级，检测
  //   非标准技能，并从精简数据库补上 LT；3) console.table 打印总表；
  //   4) 有非标准技能的分三组打印：白名单杀手（不会被动）、高清算线
  //   LT > 40%（upgradekamis 会重置）、低清算线 LT <= 40%（暂不重置，
  //   阈值为 RESPEC_LT_THRESHOLD，精确清算线刻度）；
  //   5) 对比药水库存与高 LT 组数量，提示是否够重置。
  // ▍边界与保护：
  //   - 只读安全：全程无写操作，不需要任何 TX 锁；
  //   - delay(100) — 逐只查询间隔 100ms，防节点限流；
  //   - 数据库无记录时 LT 按 0 处理，归入"暂不重置"组，宁可漏报
  //     不误重置；
  //   - 整体 try/catch：异常只打日志并返回空结果，不影响页面。
  // ▍可调参数 / 魔法数字：
  //   - RESPEC_LT_THRESHOLD(40) — 高/低清算线分界（百分比，精确清算线
  //     刻度）。LT 高说明该 Kami 被清算风险大，优先消耗药水重置降险；
  //     LT 低重置性价比低，先不动。与 upgradekamis 的重置逻辑保持一致；
  //   - name.slice(0, 15) — 表格中名称截断长度，纯显示用。
  // ▍相关控制台命令：
  //   - checkAllKamiSkills() — 运行本体检；
  //   - upgradekamis() — 按体检结论实际执行重置与重新加点。
  // ============================================================

  async function checkAllKamiSkills() {
    log('🔍 正在检查所有Kami的技能分配...');

    try {
      // 钱包地址字段名随构建不同可能是 value_ 或 value，两者都试
      const addr = window.network?.network?.connectedAddress?.value_
                || window.network?.network?.connectedAddress?.value;
      const acc = await window.network?.explorer?.accounts?.getByOperator(addr);

      if (!acc?.kamis?.length) {
        log('未找到任何Kami');
        return { results: [], needsReset: [] };
      }

      // 获取 Respec Potion 数量
      const potionCount = await getRespecPotionCount();
      log(`💊 当前 Respec Potion 数量: ${potionCount}`);

      const results = [];
      const needsReset = [];

      for (const k of acc.kamis) {
        const res = await window.network.explorer.kamis.getByIndex(k.index, {
          skills: true,
          progress: true
        });

        const investments = res?.skills?.investments || [];
        const nonStandard = detectNonStandardSkills(investments);

        // 从精简数据库获取清算线
        const dbRecord = window.kami_core_db?.find(r => r.index === k.index);
        const lt = dbRecord?.LT ?? 0;

        const info = {
          index: k.index,
          name: k.name,
          kamiId: res?.id,
          state: k.state,
          level: res?.progress?.level ?? 0,
          availablePoints: res?.skills?.points ?? 0,
          nonStandardCount: nonStandard.length,
          nonStandardSkills: nonStandard,
          LT: lt
        };

        results.push(info);

        if (nonStandard.length > 0) {
          needsReset.push(info);
        }

        // 逐只查询间隔 100ms，防节点限流
        await delay(100);
      }

      console.table(results.map(r => ({
        '#': r.index,
        '名称': r.name?.slice(0, 15),
        '状态': r.state,
        '等级': r.level,
        '清算线': r.LT + '%',
        '可用点': r.availablePoints,
        '非标准技能数': r.nonStandardCount
      })));

      if (needsReset.length > 0) {
        // 按白名单、清算线分组：RESPEC_LT_THRESHOLD(40%) 为高/低清算线分界——
        // 高 LT 被清算风险大，优先消耗药水重置；低 LT 性价比低，暂不动
        const whitelisted = needsReset.filter(k => _isProtectedKami(k.index));
        const nonWhitelisted = needsReset.filter(k => !_isProtectedKami(k.index));
        const highLT = nonWhitelisted.filter(k => k.LT > RESPEC_LT_THRESHOLD);
        const lowLT = nonWhitelisted.filter(k => k.LT <= RESPEC_LT_THRESHOLD);

        log(`\n⚠️ 发现 ${needsReset.length} 只Kami有非标准技能分配：`);

        if (whitelisted.length > 0) {
          log(`\n🛡️ 杀手白名单（不会被自动升级/重置，${whitelisted.length}只）：`);
          whitelisted.forEach(k => {
            const skillsStr = k.nonStandardSkills.map(s => `${s.skillId}(${s.points}点)`).join(', ');
            log(`   #${k.index} ${k.name} [LT=${k.LT}%]: ${skillsStr}`);
          });
        }

        if (highLT.length > 0) {
          log(`\n🔴 高清算线 (LT > ${RESPEC_LT_THRESHOLD}%)，将会重置（${highLT.length}只）：`);
          highLT.forEach(k => {
            const skillsStr = k.nonStandardSkills.map(s => `${s.skillId}(${s.points}点)`).join(', ');
            log(`   #${k.index} ${k.name} [LT=${k.LT}%]: ${skillsStr}`);
          });
        }

        if (lowLT.length > 0) {
          log(`\n🟡 低清算线 (LT <= ${RESPEC_LT_THRESHOLD}%)，暂不重置（${lowLT.length}只）：`);
          lowLT.forEach(k => {
            const skillsStr = k.nonStandardSkills.map(s => `${s.skillId}(${s.points}点)`).join(', ');
            log(`   #${k.index} ${k.name} [LT=${k.LT}%]: ${skillsStr}`);
          });
        }

        if (highLT.length > 0) {
          if (potionCount >= highLT.length) {
            log(`\n💊 Respec Potion 充足 (${potionCount} >= ${highLT.length})，可以重置所有高清算线Kami`);
          } else {
            log(`\n⚠️ Respec Potion 不足 (${potionCount} < ${highLT.length})，只能重置 ${potionCount} 只Kami`);
          }
        }

        log(`\n💡 运行 upgradekamis() 会自动重置高清算线的非标准技能并重新分配`);
      } else {
        log('✅ 所有Kami的技能分配都是标准的！');
      }

      return { results, needsReset, potionCount };

    } catch (e) {
      log(`❌ 检查失败: ${e?.message||e}`);
      return { results: [], needsReset: [] };
    }
  }

  // ============================================================
  // 【板块：waitGameAndUpgrade — 启动等待 + 自动升级调度】
  // ------------------------------------------------------------
  // ▍功能：脚本载入后自行轮询探测游戏是否加载完成，就绪即触发首次
  //   upgradekamis()，并建立每 30 分钟一次的定时升级检查。
  //   辅助脚本独立探测、不依赖核心脚本的信号：核心脚本采用 120 秒
  //   固定等待，而这里按实际 API 就绪时间判断，通常能更早开始升级。
  // ▍触发时机：脚本载入即启动（IIFE 自执行）。
  // ▍依赖（就绪判定的四个条件，缺一不可）：
  //   - window.network.network.connectedAddress — 钱包已连接（兼容
  //     value_ / value 两种字段名）；
  //   - window.network.api.player.pet.level — 升级 API 可用（写操作入口）；
  //   - window.network.explorer.kamis.getByIndex — 单只查询可用；
  //   - window.network.explorer.accounts.getByOperator — 账户查询可用。
  // ▍核心流程：1) 每 5 秒检测一次四条件（首次检测前也先等一个周期，
  //   给页面脚本注入留出时间）；2) 全部就绪 → 打印耗时并调用
  //   upgradekamis()——其内部自带"Kami 数据未加载则每 10 秒重试"的
  //   兜底，所以 API 就绪即可触发，不必等数据完全加载；3) 建立
  //   30 分钟 setInterval 定时检查；4) 超过 5 分钟仍未就绪 → 放弃
  //   自动触发，提示手动运行。
  // ▍边界与保护：
  //   - 定时器采用 skip 模式：触发时若紧急锁存在，直接跳过本次
  //     30 分钟检查而不是排队等待，避免与紧急停采争 nonce（下个
  //     周期自然会再查）；
  //   - 超时不重试：5 分钟等不到就绪多半是游戏未登录或加载失败，
  //     留给用户手动处理。
  // ▍可调参数：
  //   - MAX_WAIT = 5*60*1000（5 分钟）— 探测就绪的最长等待；
  //   - POLL_MS = 5000（5 秒）— 探测间隔；
  //   - 30*60*1000（30 分钟）— 定时升级检查间隔；调小会更频繁地跑
  //     只读预扫描（无 TX 成本但有查询开销），调大则新攒的等级/
  //     技能点处理更迟。
  // ▍相关控制台命令：upgradekamis() — 等待超时后可手动触发。
  // ============================================================
  (async function waitGameAndUpgrade() {
    const MAX_WAIT = 5 * 60 * 1000;  // 最多等5分钟
    const POLL_MS = 5000;            // 每5秒检测一次
    const start = Date.now();

    log('⏳ [自动升级] 等待游戏加载...');
    while (Date.now() - start < MAX_WAIT) {
      await delay(POLL_MS);

      // 检测条件：钱包已连接 + 升级API可用 + Explorer可用
      const hasAddr = !!window.network?.network?.connectedAddress?.value_
                   || !!window.network?.network?.connectedAddress?.value;
      const hasLevelApi = !!window.network?.api?.player?.pet?.level;
      const hasExplorer = !!window.network?.explorer?.kamis?.getByIndex;
      const hasAccounts = !!window.network?.explorer?.accounts?.getByOperator;

      if (hasAddr && hasLevelApi && hasExplorer && hasAccounts) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        log(`✅ [自动升级] 游戏API就绪（${elapsed}秒），等待Kami数据加载...`);
        upgradekamis();

        // 每30分钟自动检查一次是否有需要升级的Kami
        // 定时器采用 skip 模式：紧急锁存在时直接跳过本次，避免与紧急停采争nonce
        setInterval(() => {
          if (window.hasEmergencyLock?.()) {
            log('⏸️ [定时升级] 紧急锁存在，跳过本次30分钟定时检查');
            return;
          }
          log('🔄 [定时升级] 30分钟定时检查...');
          upgradekamis();
        }, 30 * 60 * 1000);

        return;
      }
    }

    log('⚠️ [自动升级] 等待超时（5分钟），可手动运行 upgradekamis()');
  })();

  // ============================================================
  // 【板块：window 命令挂载 + 控制台命令清单】
  // ------------------------------------------------------------
  // ▍功能：把本脚本的核心函数挂到 window 供控制台手动调用，并在
  //   启动后打印一份醒目的可用命令清单（banner）。
  // ▍触发时机：脚本载入时立即挂载；banner 延迟 3 秒打印——等各模块
  //   的启动日志先刷完，让命令清单出现在控制台靠后位置更醒目。
  // ▍依赖：console.log（%c 样式化输出）；清单中提到的
  //   findKillerCandidates / autoCraft / getStaminaFromDOM /
  //   window.kami_core_db 在其他板块定义。
  // ▍挂载清单：
  //   - window.upgradekamis — 批量升级主流程；
  //   - window.checkAllKamiSkills — 全量技能体检（只读）；
  //   - window.getRespecPotionCount — 查询 Respec Potion 库存；
  //   - window.STANDARD_SKILLS — 标准加点配置（供查看/比对）。
  // ▍边界与保护：无写操作、无 TX；banner 仅打印一次。
  // ▍可调参数：setTimeout 3000 — banner 延迟毫秒数，纯显示节奏。
  // ▍相关控制台命令：见 banner 文案本身——banner 属于代码字符串，
  //   功能变更时需同步人工维护其中的说明。
  // ============================================================

  window.upgradekamis = upgradekamis;
  window.checkAllKamiSkills = checkAllKamiSkills;
  window.getRespecPotionCount = getRespecPotionCount;
  window.STANDARD_SKILLS = STANDARD_SKILLS;

  // 启动 banner：延迟 3 秒打印可用命令清单（简洁样式），等各模块启动日志先刷完
  setTimeout(() => {
    console.log('');
    console.log('════════════════════════════════════');
    console.log('%c🎮 Kamigotchi辅助脚本-公开版 v1.1.21 可用命令', 'color: green; font-weight: bold;');   // 🔻SYNC→内部版[1.1.20 看板白名单三批]
    console.log('════════════════════════════════════');
    console.log('');
    console.log('  📋 checkAllKamiSkills()');
    console.log('     检查所有Kami的技能分配，找出非标准技能');
    console.log('');
    console.log('  ⬆️  %cupgradekamis()', 'color: red; font-size: 14px;');
    console.log('     一键升级所有休息中的Kami（等级+技能），采集中的Kami无法操作');
    console.log('');
    console.log('  💊 getRespecPotionCount()');
    console.log('     查询当前 Respec Potion 数量');
    console.log('');
    console.log('  🗡️  %cfindKillerCandidates()', 'color: red; font-size: 14px;');
    console.log('     扫描所有 kami 找杀手候选（base 属性筛选：vio≥23 ∧ harm≥15 ∧ pow≤12）');
    console.log('     自定义阈值：findKillerCandidates({ vio: 25, harm: 17, pow: 10 })');
    console.log('     %c⚡ db-first：先在 kami_core_db 内存里筛 → 再 1 个 API 验证账户归属 → 仅候选查动态数据', 'color: red;');
    console.log('     %c⚠️ 需配合【精简数据库脚本】重建 db；老 db 自动降级到全 API 扫描', 'color: red;');
    console.log('');
    console.log('  🗡️ %cscanTopPredators()', 'color: red; font-size: 14px;');
    console.log('     全网扫描最强杀手（四桶帕累托前沿+主人+哨兵，20~60秒）；结果供精确清算线使用，7天自动重扫');
    console.log('  📐 showTopPredators() / refreshPreciseLT()');
    console.log('  📊 compareLT()           - 对照 兜底线(数据库初值) vs 实战线(现役档案+活跃度) 的清算线差异，compareLT(true) 全量');
    console.log('     查看当前威胁档案 / 手动按档案重算全库精确清算线');
    console.log('  🩺 %cshowHealth()', 'color: red; font-size: 14px;');
    console.log('     代码健康看板：哪个模块该跑没跑一目了然（每30分钟自检，有问题自动打看板）');
    console.log('');
    console.log('  🔧 autoCraft()');
    console.log('     手动触发一次自动合成（步长≥80时合成物品）');
    console.log('');
    console.log('  📏 getStaminaFromDOM()');
    console.log('     从DOM获取实时步长');
    console.log('');
    console.log('  📊 window.kami_core_db');
    console.log('     查看精简数据库内容');
    console.log('');
    console.log('══════════════════════════════════');
    console.log('⏰ 自动升级将在游戏加载完成后自动执行');
    console.log('⏰ 自动合成将在脚本启动 5 分钟后首次检测，之后每 30 分钟检测');
    console.log('⏰ UI更新（LT显示+标红）每 5 分钟执行一次');
    console.log('%c📝 辅助脚本日志已接入 saveKamiLogs() — 可保存升级/重置/合成完整记录', 'color: #00ff66;');
    console.log('%c   grep "技能重置摘要" 即可查看所有 Respec 重置事件', 'color: #00ff66;');
    console.log('%c🗡️ findKillerCandidates 改为 db-first 流程，启动自动跑一次（几秒级）', 'color: red; font-weight: bold;');
    console.log('%c🔗 升级/reset 同时检查 window.MY_KILLER_KAMIS（监控脚本会自动注册自家 kami）', 'color: cyan; font-weight: bold;');
    console.log('%c🩹 LT 显示改 CSS 伪元素方案，永不被 React 洗掉；调试用 window.__refreshLT()', 'color: red; font-weight: bold;');
    console.log('═════════════════════════════════');
    console.log('');
  }, 3000);

  // ============================================================
  // 【板块：自动合成模块（AutoCraftItems）— 配置与优先级表】
  // ------------------------------------------------------------
  // ▍功能：账号步长（stamina）攒够阈值时，按优先级表自动合成物品，
  //   把闲置步长转化为 XP 药水 / Respec 药水及其原料。步长读数只认
  //   DOM（页面实时显示值），不信 API 缓存值——两者可能不同步，
  //   以 DOM 为准可避免按过期步长发交易导致合成失败。
  // ▍触发时机：脚本启动 5 分钟后首次检测，此后每 30 分钟检测一次；
  //   也可控制台手动 autoCraft() 立即触发一次。
  // ▍依赖：DOM 中的步长显示元素（由 getStaminaFromDOM 解析）、
  //   合成 API（按 recipeId 发交易）、物品库存查询（判断材料是否够）。
  // ▍核心流程：1) 从 DOM 读取实时步长；2) 达到 staminaThreshold 才
  //   进入合成检查；3) 按 CRAFT_PRIORITY 从上到下逐配方尝试：检查
  //   enabled、材料库存、剩余步长，计算本次可合成次数（受 maxCraft /
  //   minCraft / 剩余步长共同约束）后批量合成；4) 依次处理直至步长
  //   不足或配方走完。
  // ▍边界与保护：
  //   - enabled 总开关 + 每配方独立开关，可只停用单个配方；
  //   - 步长阈值 80 起步：攒到接近满值才动手，一次合成更多、单位
  //     步长摊到的 gas 更低（减少 TX + 省 gas 的总原则）；
  //   - maxCraft 限制单笔合成次数上限，防单笔 TX 过大失败；
  //   - minCraft 起批下限：可合成次数不足下限时本轮跳过，宁等下轮
  //     也不拆小批多付 gas；
  //   - materials 中 amount=0 表示"工具"：只要求拥有，不会被消耗。
  // ▍可调参数（AUTO_CRAFT_CONFIG）：
  //   - enabled = true — 自动合成总开关；false 则只保留手动 autoCraft()；
  //   - checkIntervalMs = 30*60*1000（30 分钟）— 定时检测间隔；
  //   - staminaThreshold = 80 — 触发合成的步长下限（DOM 读数 >= 80
  //     才尝试）；调低会更频繁地小批量合成（多付 gas），调高更省
  //     gas 但步长可能顶满溢出、浪费回复；
  //   - minStaminaKeep = 0 — 预留配置，当前版本主流程尚未使用；实际
  //     收工线是主流程内写死的"剩余步长 < 10"，修改此值不会改变行为。
  // ▍新手提示：
  //   默认配方表（CRAFT_PRIORITY，见下方）会自动合成 Fortified XP
  //   Potion、Greater XP Potion、Respec Potion 及其原料（Powdered Red
  //   Amber / Pine Pollen / Shredded Mint），会持续消耗背包里的对应
  //   材料（松果、薄荷等）。fork 后请先确认配方表符合自己的需求：
  //   不想合成某项，把该配方的 enabled 改为 false；完全关闭自动合成，
  //   把 AUTO_CRAFT_CONFIG.enabled 改为 false（或控制台执行
  //   stopAutoCraft()，仅本次会话有效，刷新后恢复）。
  // ▍相关控制台命令：
  //   - autoCraft() — 手动触发一次自动合成检测；
  //   - getStaminaFromDOM() — 查看当前 DOM 实时步长读数。
  // ============================================================

  const AUTO_CRAFT_CONFIG = {
    enabled: true,                    // 总开关
    checkIntervalMs: 30 * 60 * 1000,  // 检测间隔：30分钟
    staminaThreshold: 80,             // 触发合成的步长阈值（>=80才尝试合成）
    minStaminaKeep: 0,                // 保留的最小步长（预留配置，当前版本主流程未使用）
  };

  // 合成优先级配置：按数组顺序从上到下尝试，排前面的配方优先消耗步长。
  // 用户可按需调整顺序与 enabled。字段含义：
  //   recipeId  — 链上配方 ID（合成交易的参数）
  //   name      — 产物名称（仅用于日志显示）
  //   productId — 产物物品 ID（用于库存统计）
  //   stamina   — 单次合成消耗的步长
  //   materials — 材料清单 [{id, name, amount}]；amount 为单次消耗量，
  //               amount=0 表示工具类：只需拥有、不消耗
  //   enabled   — 该配方独立开关
  //   maxCraft  — 单笔 TX 最大合成次数上限
  //   minCraft  — （可选）起批下限：可合成次数不足此值时本轮跳过
  const CRAFT_PRIORITY = [
    {
      recipeId: 29,
      name: 'Fortified XP Potion',
      productId: 11411,
      stamina: 75,
      materials: [
        { id: 11402, name: 'Greater XP Potion', amount: 1 },
        { id: 1107, name: 'Powdered Red Amber', amount: 300 },
        { id: 6006, name: 'Essence of Thought', amount: 1 }
      ],
      enabled: true,
      maxCraft: 10,
    },
    {
      recipeId: 2,
      name: 'Greater XP Potion',
      productId: 11402,
      stamina: 50,
      materials: [
        { id: 1104, name: 'Pine Pollen', amount: 2500 },
        { id: 1006, name: 'Glass Jar', amount: 1 },   // 循环容器：合成占用1/瓶，喂食后返还（非净消耗）
        { id: 23101, name: 'Portable Burner', amount: 0 }  // 工具不消耗，只需拥有
      ],
      enabled: true,
      maxCraft: 10,
    },
    {
      recipeId: 3,
      name: 'Respec Potion',
      productId: 11403,
      stamina: 50,
      materials: [
        { id: 1003, name: 'Plastic Bottle', amount: 1 },
        { id: 1112, name: 'Shredded Mint', amount: 500 }
      ],
      enabled: true,
      maxCraft: 10,
    },
    {
      recipeId: 13,
      name: 'Powdered Red Amber',
      productId: 1107,
      stamina: 20,
      materials: [
        { id: 1007, name: 'Red Amber Crystal', amount: 1 }
      ],
      enabled: true,
      maxCraft: 50,
    },
    {
      recipeId: 6,
      name: 'Pine Pollen',
      productId: 1104,
      stamina: 10,
      materials: [
        // 链上实测配比：1 松果 + 10 步长/次 → 产出 500 松花粉
        { id: 1004, name: 'Pine Cone', amount: 1 }
      ],
      enabled: true,
      maxCraft: 10,
      // 起批下限：凑满 10 次一笔 tx 省 gas——步长不足 100 宁可等下一轮，
      // 不拆小批（拆批 = 同样步长多笔 tx 多付固定 gas；松花粉是囤积材料，不赶时间）
      minCraft: 10,
    },
    {
      recipeId: 9,
      name: 'Shredded Mint',
      productId: 1112,
      stamina: 20,
      materials: [
        { id: 1012, name: 'Mint', amount: 1 }
      ],
      enabled: true,
      maxCraft: 50,
    },
  ];

  // 从DOM获取实时步长（比API更准确）
  // ============================================================
  // 【板块：DOM 实时步长读取（全套件步长唯一真值源）】
  // ------------------------------------------------------------
  // ▍功能：从游戏页面 DOM 直接读取账户当前步长（stamina，0~100），
  //   是整个脚本套件（本辅助脚本 + 核心脚本）唯一认可的步长真值来源。
  // ▍为什么只认 DOM：链上 API 返回的 stamina.sync 是"上一次链上动作时
  //   的检查点值"，不随时间自然回复——步长回满后 sync 仍停留在旧低值。
  //   误用它会把"步长已够"误判成"不够"（漏合成），或反过来发出必败 tx。
  //   页面 DOM 由游戏前端实时渲染，才是当前真实步长。
  // ▍触发时机：autoCraftItems() 每轮检测时调用；每笔合成成功后再次
  //   调用，作为本地扣减值的下限兜底；核心脚本同样以本函数读数为准。
  // ▍依赖：DOM 元素 #MyPath（步长条 SVG 内的路径节点）→ closest('svg')
  //   → previousElementSibling（SVG 前面的 div 即步长显示区域）。
  // ▍核心流程：1) 用 #MyPath 锚定步长区域容器；
  //   2) 方式1：找带 height 属性的 div（其 height 即步长值），并校验
  //      解析结果落在 0~100 区间，防止解析到无关属性；
  //   3) 方式2兜底：遍历容器内所有 div，匹配 "xx/100" 文本取分子；
  //   4) 两种方式都失败返回 null——调用方必须按"读取失败跳过本轮"处理，
  //      绝不允许回退到 API 的陈旧步长值。
  // ▍边界与保护：数值范围校验（0~100）；页面未加载完/前端改版时安全
  //   返回 null；本函数纯读 DOM，无副作用、不发 tx。
  // ▍可调参数：无（选择器与游戏前端结构绑定，前端改版时需同步更新）。
  // ▍相关控制台命令：无（内部函数，供各模块调用）。
  // ============================================================
  function getStaminaFromDOM() {
    // 通过 #MyPath 定位到步长区域
    const myPath = document.querySelector('#MyPath');
    if (myPath) {
      const svg = myPath.closest('svg');
      const container = svg?.previousElementSibling;  // svg前面的div就是步长区域
      if (container) {
        // 方式1：找有height属性的div
        const heightDiv = container.querySelector('div[height]');
        if (heightDiv) {
          const h = parseInt(heightDiv.getAttribute('height'));
          if (!isNaN(h) && h >= 0 && h <= 100) {
            return h;
          }
        }

        // 方式2：找文本 xx/100
        const allDivs = container.querySelectorAll('div');
        for (const div of allDivs) {
          const text = div.textContent?.trim();
          if (/^\d+\/100$/.test(text)) {
            return parseInt(text.split('/')[0]);
          }
        }
      }
    }

    return null;
  }

  // ============================================================
  // 【板块：自动合成——数据查询与材料检查】
  // ------------------------------------------------------------
  // ▍功能：为自动合成主流程提供三个只读查询函数：
  //   - getCraftAccountInfo()  读链上账户信息（主要消费其背包 inventories）
  //   - getItemBalance()       在背包数组中按物品 ID 查持有数量
  //   - checkCraftMaterials()  按配方核对材料，返回材料上限最多能合成几个
  // ▍触发时机：仅被 autoCraftItems() 调用；全部是纯读操作，不发 tx、不占锁。
  // ▍依赖：window.network.network.connectedAddress（当前操作员地址，
  //   兼容 value_ / value 两种字段名）；window.network.explorer.accounts
  //   .getByOperator(addr)（本地 ECS 索引查询，零 gas 成本）。
  // ▍核心流程：
  //   1) getCraftAccountInfo：取连接地址 → getByOperator 查账户 →
  //      返回 { stamina, inventories }。注意：stamina 字段取自
  //      stamina.sync，那是链上检查点旧值、不随时间回复，仅作字段兼容
  //      保留；主流程真正消费的只有 inventories（背包数据没有"随时间
  //      回复"的问题，API 读取是准确的）。步长判断一律走 getStaminaFromDOM()。
  //   2) getItemBalance：inventories.find 按 item.index === itemId 匹配，
  //      查不到返回 0。
  //   3) checkCraftMaterials：遍历 recipe.materials 逐项核对——
  //      · mat.amount === 0 表示"工具类"材料：不随合成消耗，只需拥有
  //        ≥1 个即可，缺失则整个配方直接返回 0（不能合成）；
  //      · 普通材料按 floor(库存 / 单次用量) 算出该材料能支撑的合成
  //        次数，任一材料为 0 次即整体返回 0；
  //      · 所有材料取最小值 = 材料上限；无有效消耗类材料时返回 0。
  // ▍边界与保护：账户查询失败捕获异常并返回 null，主流程按"本轮跳过"
  //   容错；材料不足只打日志不报错，静默等下一轮材料攒够再合成。
  // ▍可调参数：无（配方与材料清单见 CRAFT_PRIORITY 配置板块）。
  // ▍相关控制台命令：无（内部函数）。
  // ============================================================

  // 获取账户信息（返回背包 inventories；stamina 字段仅兼容保留，不用于步长判断）
  async function getCraftAccountInfo() {
    try {
      // 连接地址字段在不同构建下可能叫 value_ 或 value，两者兼容
      const addr = window.network?.network?.connectedAddress?.value_ || window.network?.network?.connectedAddress?.value;
      if (!addr) return null;
      const acc = await window.network.explorer.accounts.getByOperator(addr);
      return {
        // 注意：stamina.sync 是链上检查点旧值（不随时间自然回复），仅作字段兼容保留；
        // 步长判断一律走 getStaminaFromDOM()，绝不使用这个值
        stamina: acc.stamina?.sync ?? 0,
        inventories: acc.inventories || []
      };
    } catch (e) {
      log('❌ [AutoCraft] 获取账户信息失败:', e.message);
      return null;
    }
  }

  // 获取物品数量（按物品 ID 在背包数组中查 balance，查不到返回 0）
  function getItemBalance(inventories, itemId) {
    const item = inventories.find(inv => inv.item?.index === itemId);
    return item?.balance ?? 0;
  }

  // 检查材料是否足够（返回最多能合成多少个）
  function checkCraftMaterials(inventories, recipe) {
    let maxCanCraft = Infinity;

    for (const mat of recipe.materials) {
      const balance = getItemBalance(inventories, mat.id);

      if (mat.amount === 0) {
        // amount=0 表示工具类材料：不随合成消耗，只需拥有 ≥1 个即可
        if (balance < 1) {
          log(`  ❌ [AutoCraft] 缺少工具: ${mat.name}`);
          return 0;
        }
      } else {
        const canMake = Math.floor(balance / mat.amount);
        if (canMake === 0) {
          log(`  ❌ [AutoCraft] 材料不足: ${mat.name} (有${balance}, 需${mat.amount})`);
          return 0;
        }
        maxCanCraft = Math.min(maxCanCraft, canMake);
      }
    }

    return maxCanCraft === Infinity ? 0 : maxCanCraft;
  }

  // ============================================================
  // 【板块：自动合成——交易发送 doCraft】
  // ------------------------------------------------------------
  // ▍功能：对指定配方发送一笔合成交易（recipeId × quantity），等待
  //   上链确认，返回 true/false 供主流程决定继续还是熔断。
  // ▍触发时机：仅被 autoCraftItems() 在普通锁内调用。
  // ▍依赖：window.hasEmergencyLock() / window.waitForEmergencyRelease()
  //   （与核心脚本共享的 TX 双锁体系之"紧急锁"接口）；链上 API
  //   window.network.api.player.account.item.craft(recipeId, quantity)。
  // ▍核心流程：1) 发 tx 前若紧急锁存在（核心脚本正在执行紧急停采等
  //   高优先级操作），最多等 300 秒等其释放，超时则放弃本次合成；
  //   2) 若等待接口不可用则直接放弃——宁可不合成也不与紧急操作争 nonce；
  //   3) 调 craft 接口发 tx，tx.wait() 等待链上确认后返回 true。
  // ▍边界与保护：紧急锁让路（等待/放弃两级处理）；tx 异常捕获后返回
  //   false，由主流程按"revert 即中止本轮"熔断处理。
  // ▍可调参数：300000（毫秒，等待紧急锁释放的上限）——调大更不容易
  //   放弃合成、但会更久占住主流程；调小则更快放弃、留给下轮重试。
  // ▍相关控制台命令：无（内部函数）。
  // ============================================================

  // 执行合成
  async function doCraft(recipeId, quantity) {
    // 发 tx 前：如果紧急锁存在，等待释放（最多 300 秒），超时放弃本次合成
    if (window.hasEmergencyLock?.()) {
      if (typeof window.waitForEmergencyRelease === 'function') {
        const released = await window.waitForEmergencyRelease(`AutoCraft合成`, 300000);
        if (!released) {
          log(`⚠️ [AutoCraft] 等待紧急锁超时，放弃本次合成`);
          return false;
        }
      } else {
        log(`⚠️ [AutoCraft] 紧急锁存在且 waitForEmergencyRelease 不可用，放弃本次合成`);
        return false;
      }
    }
    try {
      const tx = await window.network.api.player.account.item.craft(recipeId, quantity);
      // 等待上链确认（部分环境返回的对象没有 wait 方法，此时视为已发出）
      if (typeof tx?.wait === 'function') await tx.wait();
      return true;
    } catch (e) {
      log(`❌ [AutoCraft] 合成失败: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  // 【板块：自动合成——主流程 autoCraftItems】
  // ------------------------------------------------------------
  // ▍功能：按 CRAFT_PRIORITY 优先级自动合成物品：步长攒到阈值后，
  //   逐配方核对材料与步长，凑满最小批量才发 tx，直到步长用尽或配方
  //   遍历完。设计目标与全套件一致：减少 TX 次数 + 省 gas + 把步长
  //   尽可能换成产出。
  // ▍触发时机：由 startAutoCraft() 注册的定时器调用（启动 5 分钟后
  //   首检，之后每 AUTO_CRAFT_CONFIG.checkIntervalMs 一次）；锁被占
  //   时自行 setTimeout 3 分钟后重试整轮。
  // ▍依赖：
  //   - DOM：getStaminaFromDOM()——步长唯一真值来源；
  //   - window 接口：hasEmergencyLock / tryAcquireNormalLock /
  //     releaseNormalLock（与核心脚本共享的 TX 双锁体系）；
  //   - 链上 API：getCraftAccountInfo()（只消费背包）、doCraft()（发 tx）；
  //   - 配置：AUTO_CRAFT_CONFIG 与 CRAFT_PRIORITY（定义见配置板块）。
  // ▍核心流程：
  //   1) AUTO_CRAFT_CONFIG.enabled 总开关检查；
  //   2) 紧急锁存在 → 延后 3 分钟重试整轮（不与紧急停采争 nonce）；
  //   3) 读 DOM 实时步长；读不到直接跳过本轮——绝不回退 API 的
  //      stamina.sync（链上检查点旧值，不随时间回复，用它会漏掉本该
  //      成功的合成，或发出必败 tx）；
  //   4) API 读背包（背包没有"随时间回复"问题，API 读取是准确的）；
  //   5) 步长 < staminaThreshold → 跳过本轮。注意 1)~5) 全是纯读检测，
  //      不占锁——锁纪律"先查后锁"：确认真有活要干才拿锁，因为
  //      "步长未达阈值"是最常见的轮次结果，若一进来就拿锁，会白白
  //      挡住核心脚本的喂食/复活等模块；
  //   6) 确认要发 tx 才 tryAcquireNormalLock('craft')，拿不到延后 3 分钟；
  //   7) 锁内按 CRAFT_PRIORITY 顺序遍历配方（排前面的优先消耗步长）：
  //      · 每个配方开工前再查一次紧急锁，存在即中断整轮让路；
  //      · recipe.enabled=false 跳过；步长不够单次消耗的静默跳过；
  //      · 本笔数量 = min(材料上限, 步长上限, recipe.maxCraft)；
  //      · 数量 < recipe.minCraft（凑批门槛）→ 本轮不发，等材料/步长
  //        攒够一批再发：tx 有固定 gas 成本，一笔大批量摊薄固定成本，
  //        优于多笔小批量；
  //      · doCraft 发 tx 并等待确认；
  //   8) 每笔成功后：刷新背包快照；步长用"本地确定性扣减 + DOM 重读
  //      取下限"双保险更新（详见循环内注释），杜绝连续合成超扣步长；
  //   9) 任一笔失败（可能已上链 revert、烧了 gas）立即中止整轮：此时
  //      步长/材料/nonce 任一状态都不可信，继续硬试下一配方只会再烧
  //      gas，等下个周期带着新鲜状态重试；
  //  10) 剩余步长 < 10 提前收工；相邻两笔间隔 1 秒防止发 tx 过快。
  // ▍边界与保护：紧急锁三处让路（轮前 / 每配方前 / doCraft 发 tx 前）；
  //   先查后锁；普通锁 finally 必释放；DOM 读取失败跳过整轮；revert
  //   熔断整轮；minCraft 凑批门槛防碎 tx；双保险防步长超扣。
  // ▍可调参数（AUTO_CRAFT_CONFIG / CRAFT_PRIORITY 定义于配置板块，
  //   此处说明它们在主流程中的作用）：
  //   - AUTO_CRAFT_CONFIG.enabled — 总开关，false 时本模块只打日志不干活；
  //   - AUTO_CRAFT_CONFIG.staminaThreshold — 触发合成的步长下限
  //     （≥80 才开工：攒高步长一次合成一大批，减少 tx 次数）；调低会
  //     更频繁地小批合成、多付 gas；
  //   - AUTO_CRAFT_CONFIG.checkIntervalMs — 定时检测间隔（30 分钟）；
  //   - CRAFT_PRIORITY[] 每条配方的字段：enabled（逐配方开关）、
  //     name（日志显示名）、recipeId（链上配方 ID）、stamina（单次
  //     步长消耗）、minCraft（凑批门槛，不满不发）、maxCraft（单笔
  //     数量上限）、materials（材料清单，amount=0 为工具类只需拥有）；
  //   - 180000（3 分钟）— 紧急锁/普通锁被占时的整轮重试延迟；
  //   - 2000（2 秒）— 每笔合成后等 DOM 刷新再重读步长的时间；
  //   - 10 — 剩余步长低于此值提前结束本轮；
  //   - 1000（1 秒）— 相邻两笔合成之间的间隔。
  // ▍相关控制台命令：startAutoCraft() / stopAutoCraft() — 启停周期
  //   任务（见定时任务板块）。
  // ============================================================

  // 主逻辑：自动合成
  async function autoCraftItems() {
    (window.__kamiHealthBeats = window.__kamiHealthBeats || {})['自动合成'] = Date.now();   // 健康心跳
    if (!AUTO_CRAFT_CONFIG.enabled) {
      log('⏸️ [AutoCraft] 自动合成已禁用');
      return;
    }

    // 检查TX锁 - 避免与紧急停采冲突
    if (window.hasEmergencyLock?.()) {
      log(`[TX锁] ⏸️ 紧急锁存在，延后3分钟再合成`);
      setTimeout(() => autoCraftItems(), 180000);
      return;
    }
    // 锁纪律：先查后锁。下面的检测阶段（DOM 步长/背包/阈值）是纯读，不占锁；
    // "步长未达阈值"是最常见的轮次结果，若一进来就拿锁，会白白挡住核心脚本的喂食/复活等模块。
    log('═══════════════════════════════════════');
    log('🔧 [AutoCraft] 开始检测自动合成...');

    // 从 DOM 读取实时步长（全套件步长唯一真值来源）
    let stamina = getStaminaFromDOM();
    if (stamina === null) {
      // 步长只认 DOM（实时真值）。DOM 读不到也不回退 API——stamina.sync 是
      //   链上检查点旧值（不随时间回复），用它必错；本轮跳过合成，下轮再试。
      log('⚠️ [AutoCraft] DOM 步长读取失败，本轮跳过合成（不用陈旧 API 步长）');
      return;
    }
    log(`📊 [AutoCraft] DOM步长: ${stamina}`);

    // 获取背包信息（背包只能走 API；背包没有"随时间回复"问题，API 读取是准确的）
    const info = await getCraftAccountInfo();
    if (!info) {
      log('❌ [AutoCraft] 无法获取背包信息');
      return;
    }
    let inventories = info.inventories;

    // 步长阈值检查（>=80 才触发合成流程：攒高步长一次合成一大批，减少 tx 次数）
    if (stamina < AUTO_CRAFT_CONFIG.staminaThreshold) {
      log(`⏳ [AutoCraft] 步长未达阈值(${stamina}<${AUTO_CRAFT_CONFIG.staminaThreshold}), 跳过合成`);
      return;
    }

    // 有活干才拿锁（发 tx 的合成主循环在锁内）
    if (!window.tryAcquireNormalLock?.('craft', 'helper')) {
      log(`[TX锁] ⏸️ 普通锁被占用，延后3分钟再合成`);
      setTimeout(() => autoCraftItems(), 180000);
      return;
    }

    try {

    // 锁内主循环：以 DOM 读到的实时步长为本轮预算
    let availableStamina = stamina;
    log(`🎯 [AutoCraft] 可用步长: ${availableStamina}`);

    let totalCrafted = 0;

    // 按 CRAFT_PRIORITY 优先级遍历（排前面的配方优先消耗步长）
    for (const recipe of CRAFT_PRIORITY) {
      // 每个合成前检查紧急锁
      if (window.hasEmergencyLock?.()) {
        log(`[TX锁] ⏸️ 检测到紧急锁，中断合成`);
        break;
      }
      if (!recipe.enabled) continue;

      if (availableStamina < recipe.stamina) {
        continue;  // 步长不够这个配方，静默跳过
      }

      log(`🔍 [AutoCraft] 检查 [${recipe.name}]...`);

      // 检查材料
      const maxByMaterials = checkCraftMaterials(inventories, recipe);
      if (maxByMaterials === 0) continue;

      // 实际数量 = min(材料上限, 步长上限, 单笔上限 maxCraft)
      const maxByStamina = Math.floor(availableStamina / recipe.stamina);
      const quantity = Math.min(maxByMaterials, maxByStamina, recipe.maxCraft);

      if (quantity <= 0) continue;
      // minCraft 凑批门槛：不满最小批量宁可等下轮凑满，不拆小批多付 tx 固定 gas
      if (quantity < (recipe.minCraft || 1)) {
        log(`⏳ [AutoCraft] ${recipe.name} 当前最多可合成 x${quantity} < 凑批门槛 x${recipe.minCraft}，等下轮凑满再发（省 gas）`);
        continue;
      }

      // 步长以 DOM 实时值为准，刻意不与 API 的 stamina.sync 取 min：
      //   stamina.sync 是上次链上动作时的检查点值，不含自然回复——步长回满后
      //   sync 仍停在旧低值，拿它取 min 会误判"步长不足"、漏掉本该成功的合成。
      //   连续合成的超扣风险由"本地确定性扣减 + DOM 下限"双保险防住(见下)。
      const finalQty = quantity;

      log(`✨ [AutoCraft] 合成 ${recipe.name} x${finalQty} (消耗${finalQty * recipe.stamina}步长)`);

      const success = await doCraft(recipe.recipeId, finalQty);
      if (success) {
        totalCrafted += finalQty;

        // 刷新背包（合成后材料减少了）
        const newInfo = await getCraftAccountInfo();
        if (newInfo) {
          inventories = newInfo.inventories;
        }

        // 步长更新双保险：本地确定性扣减(每笔消耗已知且精确)为主，DOM 重读作下限兜底。
        //   不单用 DOM 重读——它有渲染滞后(滞后会读到旧高值→下一笔超扣步长而 revert)。
        //   不用 API sync——它是陈旧检查点值。
        //   取两者较低值：DOM 若仍是滞后的旧高值，会被本地扣减值压住，杜绝超扣。
        const expected = availableStamina - finalQty * recipe.stamina;
        await delay(2000);  // 给 DOM 一点更新时间
        const domStam = getStaminaFromDOM();
        availableStamina = (domStam !== null) ? Math.min(domStam, expected) : expected;

        log(`✅ [AutoCraft] 成功! 剩余步长: ${availableStamina}（本地扣减→${expected} / DOM→${domStam}，取低）`);
      } else {
        // revert 即中止本轮：失败后状态已不可信（步长/材料/nonce 任一异常），
        // 继续硬试下一配方只会再烧 gas；30 分钟后下个周期带着新鲜状态重试
        log(`🛑 [AutoCraft] 合成失败（可能已上链 revert 扣 gas），中止本轮合成，下个周期重试`);
        break;
      }

      // 步长用完就停止
      if (availableStamina < 10) {
        log('💤 [AutoCraft] 步长不足10，停止合成');
        break;
      }

      // 合成间隔，避免太快
      await delay(1000);
    }

    log('═══════════════════════════════════════');
    if (totalCrafted > 0) {
      log(`📦 [AutoCraft] 合成完成! 共合成${totalCrafted}次, 剩余步长${availableStamina}`);
    } else {
      log(`📦 [AutoCraft] 本次无可合成物品`);
    }
    } finally {
      // 释放普通锁
      window.releaseNormalLock?.('craft', 'helper');
    }
  }

  // ============================================================
  // 【板块：启动窗口复活（helperReviveOnce / bootHelperRevive）】
  // ------------------------------------------------------------
  // ▍功能：网页刷新后、核心脚本主流程就绪前有约 120~150 秒空档（核心
  //   要等启动流程走完才跑主循环，且主循环里停采/部署优先级高于复活）。
  //   辅助脚本加载快——一进游戏就先批量复活死亡 kami，抢回这段空档，
  //   让死亡 kami 尽早恢复采集。
  // ▍触发时机：脚本加载后自动启动轮询——20 秒后首查，每 20 秒一次，
  //   最多 8 次（覆盖约 160 秒启动窗口）；完成一次有效检查（包括
  //   "无死亡"这种结果）即停止，之后复活完全交由核心脚本的死亡监控
  //   （3 分钟/轮）和主循环两条路径接管。
  // ▍三路复活触发互不冲突：本模块、核心死亡监控、核心主循环都可能
  //   发复活 tx，靠两层共享状态防重复：
  //   1) window.__reviveSentAt（Map：kamiId → 发送时间戳）——同一只
  //      kami 15 分钟内只发一次复活 tx；发送前先登记，发送即失败才
  //      撤销登记；"tx 已发出但确认超时"的保持登记，防慢链场景重发；
  //   2) 与核心共享的 revive 普通锁——拿不到锁就整体让路（说明核心
  //      正在发 tx，稍后由核心接管即可）；核心锁体系尚未就绪时（启动
  //      空档核心不发 tx）不拿锁直发也安全。
  // ▍依赖：
  //   - 链上 API：network.explorer.accounts.getByOperator（账户、kami
  //     名单、背包）、network.explorer.kamis.getByIndex（kamiId 兜底
  //     解析）、network.api.player.pet.item.use（发复活 tx）；
  //   - window 接口：__reviveSentAt（跨脚本共享防重发表）、
  //     kami_core_db（精简数据库脚本构建的 kami 索引表，kamiId 首选来源）、
  //     hasEmergencyLock / tryAcquireNormalLock / releaseNormalLock；
  //   - 物品：Red Ribbon Gummy 复活丝带（item #11001）。
  // ▍核心流程：1) 游戏接口未就绪返回 false（下次轮询再试）；
  //   2) 拉账户 kami 名单，筛出 state === 'DEAD' 的；无死亡即算完成；
  //   3) 查背包丝带数量：为 0 则红字大号告警提示去 Mina 商店购买、
  //      不发 tx（同样算完成，避免每 20 秒重复轰炸告警）；
  //   4) 逐只解析 kamiId（kami_core_db 优先，链上索引 getByIndex 兜底，
  //      都拿不到则跳过该只），过滤 15 分钟冷却内的，并按丝带库存
  //      截断待复活名单；
  //   5) 紧急锁存在或普通锁被占 → 返回 false 让路，下次轮询重试；
  //   6) 锁内逐只发 use(kamiId, 丝带)：发送前先登记 __reviveSentAt；
  //      tx.wait 与 45 秒超时赛跑——成功 / 超时（慢链，保持登记不重发）/
  //      revert 分别打日志；发送即抛异常则撤销登记允许其他路径重试；
  //      相邻两笔间隔 1.2 秒。
  // ▍边界与保护：接口未就绪自动重试、丝带不足熔断（只告警不发 tx）、
  //   15 分钟防重发、丝带库存截断、紧急锁/普通锁双重让路、45 秒确认
  //   超时、单只异常不影响后续、finally 必释放锁、轮询 8 次封顶自停。
  // ▍可调参数：
  //   - HELPER_REVIVE_RIBBON = 11001 — 复活丝带的物品 ID；
  //   - HELPER_REVIVE_COOLDOWN_MS = 15 分钟 — 同一 kami 防重发窗口，
  //     必须与核心脚本保持一致，否则三路防重发互认失效；
  //   - 45000（45 秒）— 单笔复活 tx 的确认超时上限；
  //   - 1200（1.2 秒）— 相邻两笔复活 tx 的发送间隔；
  //   - 20 * 1000 与 8 次 — 启动轮询间隔与次数上限（约 160 秒窗口）。
  // ▍相关控制台命令：无（启动期一次性自动任务）。
  // ============================================================
  const HELPER_REVIVE_RIBBON = 11001;                 // Red Ribbon Gummy 复活丝带
  const HELPER_REVIVE_COOLDOWN_MS = 15 * 60 * 1000;   // 同一 kami 防重发窗口，须与核心脚本一致

  async function helperReviveOnce() {
    const net = window.network;
    const addr = net?.network?.connectedAddress?.value_ || net?.network?.connectedAddress?.value;
    if (!addr || typeof net?.explorer?.accounts?.getByOperator !== 'function') return false;  // 游戏未就绪→继续重试
    let acc;
    try { acc = await net.explorer.accounts.getByOperator(addr); } catch (_) { return false; }
    if (!Array.isArray(acc?.kamis) || acc.kamis.length === 0) return false;

    const dead = acc.kamis.filter(k => String(k?.state || '').toUpperCase() === 'DEAD');
    if (dead.length === 0) { log('🩺 [辅助复活] 启动检查：无死亡 kami'); return true; }

    // 与核心脚本共享的防重发表（kamiId → 发送时间戳），不存在则初始化
    window.__reviveSentAt = window.__reviveSentAt || new Map();
    // 统计背包中复活丝带数量（为 0 只告警不发 tx）
    const ribbons = Number((acc?.inventories || []).find(it => Number(it?.item?.index) === HELPER_REVIVE_RIBBON)?.balance ?? 0);
    if (ribbons <= 0) {
      log(`%c🚨 [辅助复活] ${dead.length} 只 kami 死亡，但背包没有复活丝带 Red Ribbon Gummy(#${HELPER_REVIVE_RIBBON})！请去 Mina 商店购买。不发 tx。`,
          'color: red; font-weight: bold; font-size: 14px;');
      return true;
    }

    // 解析 kamiId（db 优先，本地 API 兜底）+ 15 分钟防重发 + 丝带数量截断
    const now = Date.now();
    const todo = [];
    for (const k of dead) {
      let kid = (window.kami_core_db || []).find(r => Number(r.index) === Number(k.index))?.kamiId || k.id || null;
      if (!kid) { try { kid = (await net.explorer.kamis.getByIndex(k.index, {}))?.id || null; } catch (_) {} }
      if (!kid) continue;
      if (now - (window.__reviveSentAt.get(kid) || 0) <= HELPER_REVIVE_COOLDOWN_MS) continue;
      todo.push({ index: k.index, kamiId: kid });
      // 待复活名单按丝带库存截断：丝带不够时只救排前面的
      if (todo.length >= ribbons) break;
    }
    if (todo.length === 0) { log(`🩺 [辅助复活] ${dead.length} 只死亡均在 15 分钟复活冷却内（其他触发路径已处理），不重发`); return true; }

    if (window.hasEmergencyLock?.()) { log('[TX锁] ⏸️ 紧急锁存在，辅助复活让路（稍后核心接管）'); return false; }
    let locked = false;
    if (typeof window.tryAcquireNormalLock === 'function') {
      if (!window.tryAcquireNormalLock('revive', 'helper')) {
        log('[TX锁] ⏸️ 普通锁被占用，辅助复活让路（稍后核心接管）');
        return false;
      }
      locked = true;
    }
    try {
      log(`%c💀 [辅助复活] 启动窗口批量复活 ${todo.length} 只：${todo.map(t => '#' + t.index).join(', ')}（丝带库存 ${ribbons}）`,
          'color: red; font-weight: bold;');
      for (const t of todo) {
        // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：复活tx前尽量读取 harvest.time.last 记
        // 观察日志（本地ECS只读查询，不消耗gas）；读取失败（网络异常等）不影响复活流程，
        // 仅跳过该条观察日志，绝不影响下方复活tx的发送/等待/防重发逻辑。
        let __reviveObs = null;
        try {
          const __hv = await net.explorer.kamis.getByIndex(t.index, { harvest: true });
          __reviveObs = _obsCooldownAge(__hv?.harvest?.time?.last);
        } catch (_) { /* 观察日志用，读取失败静默跳过 */ }
        if (__reviveObs) {
          log(`🔬 [复活/冷却观察] #${t.index} DEAD age=${__reviveObs.age}s remain=${__reviveObs.remain}s（${__reviveObs.age < 180 ? '⚠️冷却窗内' : '已过冷却'}）→ 发送复活tx前`);
        }

        try {
          window.__reviveSentAt.set(t.kamiId, Date.now());   // 发送前登记：三路触发互不重发
          const tx = await net.api.player.pet.item.use(t.kamiId, HELPER_REVIVE_RIBBON);
          let __reviveResultTag = '已发出（无wait，成败未知）';
          if (typeof tx?.wait === 'function') {
            // tx 确认与 45 秒超时赛跑：慢链时不无限等待（已登记防重发，超时也不会重发）
            const r = await Promise.race([
              tx.wait().then(() => 'ok').catch(() => 'revert'),
              new Promise(rs => setTimeout(() => rs('timeout'), 45000)),
            ]);
            if (r === 'ok') log(`%c✅ [辅助复活] #${t.index} 复活成功`, 'color:green;font-weight:bold;');
            else if (r === 'timeout') log(`⏱️ [辅助复活] #${t.index} tx已发出但确认超时（慢链），15分钟内不重发`);
            else log(`%c❌ [辅助复活] #${t.index} tx执行失败(revert)`, 'color:red;');
            __reviveResultTag = r === 'ok' ? '成功' : (r === 'timeout' ? '超时未知' : '失败');
          } else {
            log(`✅ [辅助复活] #${t.index} 复活tx已发出`);
          }
          // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：复活结果观察日志（tx发送成功分支）。
          if (__reviveObs) {
            log(`🔬 [复活/冷却观察] #${t.index} DEAD age=${__reviveObs.age}s → 复活结果=${__reviveResultTag}`);
          }
        } catch (e) {
          window.__reviveSentAt.delete(t.kamiId);   // 未发出，允许其他路径重试
          log(`%c❌ [辅助复活] #${t.index} 发送失败: ${e?.message || e}`, 'color:red;');
          // 🔬🔻SYNC→内部版[1.1.17 升级/复活冷却观察日志]：复活结果观察日志（tx发送失败分支）。
          if (__reviveObs) {
            log(`🔬 [复活/冷却观察] #${t.index} DEAD age=${__reviveObs.age}s → 复活结果=失败（tx未成功发出）`);
          }
        }
        await delay(1200);
      }
    } finally {
      if (locked) window.releaseNormalLock?.('revive', 'helper');
    }
    return true;
  }

  // 启动轮询：20 秒起查，每 20 秒一次，最多 8 次（覆盖 ~160 秒启动窗口）；
  // 完成一次有效检查（含"无死亡"）即停，之后由核心死亡监控(3分钟/轮)+主循环接管。
  (function bootHelperRevive() {
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      let done = false;
      try { done = await helperReviveOnce(); } catch (e) { log(`⚠️ [辅助复活] 异常: ${e?.message || e}`); }
      if (done || tries >= 8) clearInterval(timer);
    }, 20 * 1000);
  })();

  // ============================================================
  // 【板块：自动合成——定时任务 startAutoCraft / stopAutoCraft】
  // ------------------------------------------------------------
  // ▍功能：管理自动合成的周期调度：启动 5 分钟后做首次检测（等页面
  //   加载完成、数据稳定，也避开启动窗口复活等启动期任务），之后每
  //   AUTO_CRAFT_CONFIG.checkIntervalMs（30 分钟）检测一次。
  // ▍触发时机：脚本初始化时自动调用 startAutoCraft()；用户也可随时
  //   在控制台手动启停。
  // ▍依赖：autoCraftItems()、window.hasEmergencyLock（共享紧急锁）、
  //   AUTO_CRAFT_CONFIG.checkIntervalMs（配置板块）。
  // ▍核心流程：1) start 时先清掉旧定时器，保证重复调用幂等（不会
  //   产生多个并行定时器）；
  //   2) setTimeout 5 分钟 → 首次 autoCraftItems()；
  //   3) setInterval 周期执行；每次触发前先查紧急锁——存在则整次
  //      跳过（skip 模式：不排队、不补跑，直接等下个周期），避免与
  //      核心脚本的紧急停采争 nonce；
  //   4) stop 时清定时器并置空。
  // ▍边界与保护：重复 start 幂等；紧急锁 skip 模式；stop 后可随时
  //   重新 start。
  // ▍可调参数：
  //   - 5 * 60 * 1000（5 分钟）— 首次检测延迟；调短可能在页面数据
  //     未稳定时误判，调长则浪费启动后的第一段高步长窗口；
  //   - AUTO_CRAFT_CONFIG.checkIntervalMs — 周期间隔（30 分钟）；调小
  //     检测更勤但意义有限（步长回复速度固定），调大可能错过高步长窗口。
  // ▍相关控制台命令：startAutoCraft() — 启动/重启周期任务；
  //   stopAutoCraft() — 停止周期任务。
  // ============================================================

  let autoCraftTimer = null;

  function startAutoCraft() {
    if (autoCraftTimer) {
      clearInterval(autoCraftTimer);
    }

    log('🚀 [AutoCraft] 自动合成模块启动，5分钟后首次检测');

    // 启动后延迟5分钟执行第一次（等页面加载+数据稳定）
    setTimeout(() => {
      autoCraftItems();
    }, 5 * 60 * 1000);

    // 每30分钟检测一次
    // 定时器采用 skip 模式：紧急锁存在时直接跳过本次，避免与核心脚本的紧急停采争 nonce
    autoCraftTimer = setInterval(() => {
      if (window.hasEmergencyLock?.()) {
        log('⏸️ [AutoCraft] 紧急锁存在，跳过本次定时合成');
        return;
      }
      autoCraftItems();
    }, AUTO_CRAFT_CONFIG.checkIntervalMs);
  }

  function stopAutoCraft() {
    if (autoCraftTimer) {
      clearInterval(autoCraftTimer);
      autoCraftTimer = null;
    }
    log('🛑 [AutoCraft] 自动合成模块已停止');
  }

  // ============================================================
  // 【板块：Kami 地块适配分析（kamiAnalyze）】
  // ------------------------------------------------------------
  // ▍功能：只读分析工具——扫描账户内所有 Kami 的身体（body）/手部
  //   （hand）属性，对照各采集地块的 affinity（亲和属性），报告每只
  //   Kami 适合去哪种类型的地块采集。纯本地查询计算，不发任何 tx、
  //   不占锁，可随时安全执行。
  // ▍地块匹配规则：
  //   - normal 地块：要求 body='normal' 且 hand='normal'；
  //   - 其他属性地块：body 与地块属性匹配即可；或 body='normal' 且
  //     hand 与地块属性匹配；
  //   - 双属性地块（如 eerie+scrap）：适合其中任一属性的 kami 都可以。
  // ▍触发时机：仅由用户在控制台手动调用，不参与任何自动流程。
  // ▍依赖：window.network.explorer 本地 ECS 索引（读取房间 affinity
  //   与 kami 属性，零 gas 成本），具体见下方各子函数。
  // ▍可调参数：TERRAIN_TYPES = ['normal','eerie','scrap','insect']
  //   — 游戏内全部地形属性枚举；游戏新增地形时需同步扩充。
  // ▍相关控制台命令：kamiAnalyze() — 输出全账户 Kami 的地块适配报告。
  // ============================================================

  const TERRAIN_TYPES = ['normal', 'eerie', 'scrap', 'insect'];

  // ============================================================
  // 【板块：地块适配分析（房间信息 + Kami 四类分类）】
  // ------------------------------------------------------------
  // ▍功能：
  //   1) 房间信息读取：getRoomAffinity（房间地形属性数组）、getRoomName
  //      （房间名）、getCurrentRoomInfo（当前所在房间 index/名称/地形打包）。
  //   2) 适配判定工具：isKamiSuitable（单地块判定）、isKamiSuitableForRoom
  //      （多属性房间判定）、getKamiSuitableTerrain（kami 最适合的地块类型）。
  //   3) 四类分类：classifyKamisByAffinity（纯计算，返回结构化数据）+
  //      analyzeKamiTerrainFit（=kamiAnalyze，控制台友好打印）。把账户内
  //      kami 按 body+hand 属性归入 NORMAL / EERIE / SCRAP / INSECT 四类，
  //      找出 majority（主流类）与 minority（少数派），为多账户"同类集中"
  //      的转移规划提供完整清单。分类与"当前站在哪个地块"完全解耦。
  //   4) __getMinorityKamis：供核心脚本 stopMinorityForTransfer() 调用的
  //      数据接口——核心脚本据此筛出 HARVESTING 状态的少数派批量停采，
  //      为跨账户转移做准备。
  // ▍触发时机：
  //   - 本板块无定时器，全部为手动/被动调用：kamiAnalyze() 由用户在
  //     控制台执行；__getMinorityKamis() 由核心脚本在停采转移流程中调用；
  //     其余为工具函数，供脚本内部复用。
  // ▍依赖：
  //   - window.network.explorer.nodes.all() —— 地图节点列表，读每个房间的
  //     affinity（地形属性数组）与 name；
  //   - window.network.network.connectedAddress.value_ / .value —— 钱包
  //     地址（字段名随游戏前端实现不同，两种写法做双兜底）；
  //   - window.network.explorer.accounts.getByOperator(addr) —— 账户实时
  //     持有的 kami 列表（全流程唯一一次链上 API 调用）；
  //   - window.kami_core_db —— 精简数据库脚本构建的常驻内存数组（17 字段），
  //     提供 body/hand/level/LT/name/kamiId 等字段；body/hand 是静态属性
  //     永不变化，因此分类可以 0 API 瞬时完成（db-first 的性能来源）；
  //   - window.MY_KILLER_KAMIS —— 核心脚本维护的杀手 kami index 集合（Set）；
  //   - TERRAIN_TYPES / log() —— 本脚本前文定义的四类常量与日志函数；
  //   - 不读 DOM、不用 localStorage、不发任何交易（tx），纯只读分析。
  // ▍适配规则表（isKamiSuitable / getKamiSuitableTerrain 的完整规则）：
  //   比较前 body / hand / terrain 一律转小写；body/hand 为 null/undefined
  //   时按空字符串处理，不会抛错。
  //   ① terrain = normal：仅当 body=normal 且 hand=normal 才算适合
  //      （NORMAL 地块要求"纯 normal"个体）；
  //   ② terrain ≠ normal（eerie / scrap / insect）：body=terrain 即适合，
  //      或 body=normal 且 hand=terrain 也适合；
  //   ③ 归类规则（getKamiSuitableTerrain）：body≠normal → 归 body 类；
  //      body=normal → 归 hand 类；body 与 hand 都是 normal → 归 NORMAL 类。
  //      即 body 优先级高于 hand，hand 仅在 body=normal 时才起作用。
  //      例：scrap/normal、scrap/eerie、scrap/scrap、scrap/insect 都归
  //      SCRAP 类；normal/scrap 也归 SCRAP 类。
  //   ④ 房间级判定（isKamiSuitableForRoom）：房间无 affinity（null 或
  //      空数组）视为不限地形，直接返回 true；有多个 affinity 时任一
  //      匹配即算适合（some 语义）。
  //   归类含义：归为 X 类的 kami 在 X 地块采集收益最优；多账户分工时应
  //   把同类 kami 集中到主营该地块的账户。
  // ▍核心流程（classifyKamisByAffinity）：
  //   1) 取钱包地址（取不到直接抛错，由调用方捕获）；
  //   2) getByOperator 拿账户实时持有列表——用实时列表做基准，天然排除
  //      db 里还有记录但已转走的"幽灵"kami；
  //   3) 把 db 建成 index→记录 的 Map，后续 O(1) 查找；
  //   4) 找出"实时持有但 db 缺失"的 kami（missingInDb），提示用户运行
  //      syncKamiDb()（核心脚本提供）增量补库；
  //   5) 逐只按 body+hand 经 getKamiSuitableTerrain 归入四类（db 缺失的
  //      不计入分类，只进 missingInDb 提示）；
  //   6) majority = 四类中数量最多的那一类（只取最大值，不要求 ≥50%）；
  //   7) minority = majority 之外三类的合集；其中命中杀手清单的 kami 剔除
  //      进 excludedKillers——杀手不列入转移清单、不会被停采。
  // ▍边界与保护：
  //   - 幽灵剔除：分类只遍历实时持有列表，已转走的 db 记录不会混入结果；
  //   - db 缺失容错：缺失的 kami 不计入分类，单独列 missingInDb 提醒补库，
  //     不中断整体分析；
  //   - 杀手保护：window.MY_KILLER_KAMIS 不是 Set（核心脚本未加载）时降级
  //     为空集，分类照常进行，只是不做杀手剔除；
  //   - 脏数据保护：归类结果不在四类之内的 kami 直接跳过；
  //   - 打印路径的异常由 analyzeKamiTerrainFit 统一 try/catch，失败只打
  //     一行错误日志；
  //   - 全程只读：不发 tx、不写存储，可随时安全执行。
  // ▍可调参数（打印展示相关）：
  //   - TERRAIN_COLORS —— 四类专属颜色（与核心脚本可转移清单同色系，转移
  //     操作时一眼区分、不易看混）：normal 灰 #9e9e9e / eerie 紫 #c678dd /
  //     scrap 橙 #e5a13a / insect 绿 #4ec94e；
  //   - PER_LINE = 25 —— 四类分布清单每行列 25 个 index，超长自动分行；
  //   - PER_LINE = 20 —— minority 明细每行 20 个 "#index(状态)" 项（单项约
  //     20 字符，一行约 400 字符，保证控制台可读）；
  //   - missingInDb 提示最多列前 5 只 index，多出部分以 "..." 收尾。
  // ▍相关控制台命令：
  //   - kamiAnalyze() / analyzeKamiTerrainFit() —— 打印四类分布、majority /
  //     minority 清单与转移建议（同一函数的两个别名）；
  //   - __classifyKamisByAffinity() —— 返回原始分类数据（调试用）；
  //   - __getMinorityKamis() —— 核心脚本停采转移用的数据接口；
  //   - getRoomAffinity(i) / getRoomName(i) / getCurrentRoomInfo() —— 房间查询；
  //   - isKamiSuitable(body, hand, terrain) / isKamiSuitableForRoom(body,
  //     hand, affinities) —— 适配判定工具。
  // ============================================================

  // 获取指定房间的 affinity 地形属性（返回小写数组）
  function getRoomAffinity(roomIndex) {
    const allNodes = window.network.explorer.nodes.all();
    const node = allNodes.find(n => n.roomIndex === roomIndex);
    if (node?.affinity && Array.isArray(node.affinity)) {
      return node.affinity.map(a => a.toLowerCase());
    }
    return null;
  }

  /**
   * 获取指定房间的名称
   */
  function getRoomName(roomIndex) {
    const allNodes = window.network.explorer.nodes.all();
    const node = allNodes.find(n => n.roomIndex === roomIndex);
    return node?.name || null;
  }

  /**
   * 获取当前所在房间的完整信息
   */
  function getCurrentRoomInfo() {
    // 钱包地址字段名存在 value_ / value 两种实现，双兜底读取
    const addr = window.network?.network?.connectedAddress?.value_
              || window.network?.network?.connectedAddress?.value;
    const account = window.network.explorer.accounts.getByOperator(addr);
    const roomIndex = account?.roomIndex;

    if (roomIndex === undefined || roomIndex === null) {
      return null;
    }

    return {
      index: roomIndex,
      name: getRoomName(roomIndex) || `Room ${roomIndex}`,
      affinity: getRoomAffinity(roomIndex)
    };
  }

  // ========== Kami适配判断 ==========

  /**
   * 判断kami是否适合某种地块
   */
  function isKamiSuitable(body, hand, terrain) {
    body = (body || '').toLowerCase();
    hand = (hand || '').toLowerCase();
    terrain = terrain.toLowerCase();

    if (terrain === 'normal') {
      // NORMAL 地块要求"纯 normal"：body 与 hand 都必须是 normal
      return body === 'normal' && hand === 'normal';
    } else {
      // 非 NORMAL 地块：body 直接匹配即适合；或 body=normal 时由 hand 匹配
      return body === terrain || (body === 'normal' && hand === terrain);
    }
  }

  /**
   * 判断kami是否适合某个房间（支持多属性）
   */
  function isKamiSuitableForRoom(body, hand, affinities) {
    // 房间没有地形限制（null 或空数组）时，视为任何 kami 都适合
    if (!affinities || affinities.length === 0) return true;
    // 多属性房间：任一地形匹配即算适合
    return affinities.some(terrain => isKamiSuitable(body, hand, terrain));
  }

  /**
   * 获取kami适合的地块类型
   */
  function getKamiSuitableTerrain(body, hand) {
    body = (body || '').toLowerCase();
    hand = (hand || '').toLowerCase();

    if (body === 'normal' && hand === 'normal') {
      return 'normal';
    } else if (body === 'normal') {
      return hand; // body=normal时，适合hand对应的地块
    } else {
      return body; // 否则适合body对应的地块
    }
  }

  // ========== 主分析函数（纯属性分类 + 转移规划）==========

  /**
   * 对账户 kami 做按属性的 4 类分类
   * - 数据源：window.kami_core_db（瞬时，0 API）
   * - 实时持有过滤：accounts.getByOperator（1 API，排除转走的"幽灵"）
   * - majority = 占比最大那类（不强求 ≥50%）
   * - 杀手保护：window.MY_KILLER_KAMIS 默认从 minority 中剔除（不列出、不停采）
   *
   * @returns {Promise<{
   *   total:number,                  // 实时持有数
   *   byType: Record<string, Array>, // 4 类各自的 kami 数据（{index, kamiId, body, hand, name, level, LT}）
   *   majority: string,              // 'normal' | 'eerie' | 'scrap' | 'insect'
   *   majorityCount: number,
   *   minorityKamis: Array,          // 已过滤杀手的 minority 全集（用于核心脚本停采）
   *   excludedKillers: Array,        // 被保护跳过的杀手 kami
   *   missingInDb: Array,            // 实时持有但 db 没有的（提示用户跑 syncKamiDb）
   * }>}
   */
  async function classifyKamisByAffinity() {
    const addr = window.network?.network?.connectedAddress?.value_
              || window.network?.network?.connectedAddress?.value;
    if (!addr) throw new Error('无法获取钱包地址');

    // 1. 取账户实时持有
    const account = await window.network.explorer.accounts.getByOperator(addr);
    const myKamis = account?.kamis || [];
    const ownedIdxSet = new Set(myKamis.map(k => Number(k.index)));

    // 2. 从 db 取详细字段（body/hand/level/LT）
    const db = Array.isArray(window.kami_core_db) ? window.kami_core_db : [];
    const dbByIndex = new Map(db.map(r => [Number(r.index), r]));

    // 3. 找出 db 缺失的（提示用户 syncKamiDb）
    const missingInDb = myKamis.filter(k => !dbByIndex.has(Number(k.index)))
                              .map(k => ({ index: k.index, name: k.name, state: k.state }));

    // 4. 杀手保护：默认从分类待办里剔除
    const killerSet = (window.MY_KILLER_KAMIS instanceof Set) ? window.MY_KILLER_KAMIS : new Set();
    const excludedKillers = [];

    // 5. 按 body+hand 分 4 类
    const byType = { normal: [], eerie: [], scrap: [], insect: [] };
    for (const k of myKamis) {
      const rec = dbByIndex.get(Number(k.index));
      if (!rec) continue; // db 没有的不计入分类（已在 missingInDb 里提示）
      const body = (rec.body || '').toLowerCase();
      const hand = (rec.hand || '').toLowerCase();
      const terrain = getKamiSuitableTerrain(body, hand);
      // 防御脏数据：归类结果不在四类之内时跳过该只
      if (!byType[terrain]) continue;
      const entry = {
        index:    k.index,
        kamiId:   rec.kamiId || k.id,
        name:     rec.name || k.name,
        level:    rec.level,
        body, hand,
        LT:       rec.LT,
        state:    String(k.state || '').toUpperCase(),
        terrain,
      };
      byType[terrain].push(entry);
    }

    // 6. 找 majority（占比最大那类，只取最大值，不要求过半）
    let majority = null, majorityCount = 0;
    for (const t of TERRAIN_TYPES) {
      if (byType[t].length > majorityCount) {
        majorityCount = byType[t].length;
        majority = t;
      }
    }

    // 7. 拼 minority（majority 之外的 3 类合集），过滤杀手
    const minorityKamis = [];
    for (const t of TERRAIN_TYPES) {
      if (t === majority) continue;
      for (const k of byType[t]) {
        if (killerSet.has(Number(k.index))) {
          excludedKillers.push(k);
          continue;
        }
        minorityKamis.push(k);
      }
    }

    return {
      total: ownedIdxSet.size,
      byType,
      majority,
      majorityCount,
      minorityKamis,
      excludedKillers,
      missingInDb,
    };
  }

  /**
   * 纯属性分类分析（打印展示用，挂载为 kamiAnalyze）
   * - 不做任何 tx 操作
   * - 调用 classifyKamisByAffinity 拿数据，做友好输出
   * - 与"当前地块"完全解耦
   */
  async function analyzeKamiTerrainFit() {
    let r;
    try {
      r = await classifyKamisByAffinity();
    } catch (e) {
      log(`❌ [kamiAnalyze] 分析失败: ${e?.message || e}`);
      return;
    }

    log('========== 🗺️ Kami 类型分布（按 body+hand 属性）==========');
    log(`📦 账户实时持有 ${r.total} 只，数据库 ${(window.kami_core_db || []).length} 条`);

    if (r.missingInDb.length > 0) {
      // 最多列出前 5 只缺失的 index，其余用 "..." 收尾，避免刷屏
      const list = r.missingInDb.slice(0, 5).map(k => `#${k.index}`).join(', ');
      log(`%c⚠️ ${r.missingInDb.length} 只账户内的 kami 不在数据库里: ${list}${r.missingInDb.length > 5 ? '...' : ''}`,
          'color: orange; font-weight: bold;');
      log(`%c   建议先运行：syncKamiDb()（增量补全，几秒钟）`, 'color: orange;');
    }

    // 分类规则速览（让用户一眼明白为什么 scrap/scrap 和 normal/scrap 都归 SCRAP 类）
    const ruleLines = [
      '📋 分类规则速览（按 body + hand 属性判定 kami 最适合的地块类型）：',
      '   ① body ≠ normal → 看 body，归到 body 对应的类',
      '       例：scrap/normal、scrap/eerie、scrap/scrap、scrap/insect 都归 SCRAP 类',
      '       例：eerie/?? 都归 EERIE 类，insect/?? 都归 INSECT 类',
      '   ② body = normal → 看 hand，归到 hand 对应的类',
      '       例：normal/scrap → SCRAP 类，normal/eerie → EERIE 类，normal/insect → INSECT 类',
      '   ③ body = normal 且 hand = normal → 归 NORMAL 类',
      '   💡 归位含义：归为 X 类的 kami 最适合在 X 地块采集',
      '       多账户分工时，应把同类 kami 集中到主营该地块的账户',
    ];
    log(ruleLines.join('\n'));

    // 4 类分布（全部 index 都列出，不截断 — 方便用户照清单去游戏内逐个查找/转移）
    // 超过 25 只时按每行 25 个分行展示，保持可读性；用 \n 拼接一次 log，避免时间戳重复
    // 四类各配专属色（与核心脚本可转移清单同色系）：
    //   normal 灰 / eerie 紫 / scrap 橙 / insect 绿 —— 转移 kami 时一眼区分，不易看混
    const TERRAIN_COLORS = { normal: '#9e9e9e', eerie: '#c678dd', scrap: '#e5a13a', insect: '#4ec94e' };
    for (const t of TERRAIN_TYPES) {
      const list = r.byType[t];
      const pct = r.total > 0 ? ((list.length / r.total) * 100).toFixed(1) : '0.0';
      const isMajority = (t === r.majority);
      const tColor = TERRAIN_COLORS[t] || '#9e9e9e';
      // majority 保持原格式（绿色标题+无色列表）——majority 不参与转移，
      // 只有 minority 三类才需要颜色区分，转移时不易看混
      const tagColor = isMajority ? 'color: green; font-weight: bold;' : `color: ${tColor}; font-weight: bold;`;
      const tagText = isMajority ? ' ← MAJORITY' : '';
      log(`%c   🏷️ ${t.toUpperCase()} 类 (${list.length} 只, ${pct}%)${tagText}`, tagColor);
      if (list.length > 0) {
        const allIndices = list.map(k => `#${k.index}`);
        const PER_LINE = 25;
        const indexLines = [];
        for (let i = 0; i < allIndices.length; i += PER_LINE) {
          indexLines.push('        ' + allIndices.slice(i, i + PER_LINE).join(', '));
        }
        if (isMajority) log(indexLines.join('\n'));
        else log(`%c${indexLines.join('\n')}`, `color: ${tColor};`);
      }
    }

    if (!r.majority) {
      log(`%c⚠️ 无法确定 majority（4 类都为空？）`, 'color: red;');
      log('=====================================');
      return;
    }

    // minority 概览
    const minHarvesting = r.minorityKamis.filter(k => k.state === 'HARVESTING');
    const minResting    = r.minorityKamis.filter(k => k.state === 'RESTING');
    const minOther      = r.minorityKamis.filter(k => k.state !== 'HARVESTING' && k.state !== 'RESTING');

    log(`%c✅ 主流类型 (MAJORITY) = ${r.majority.toUpperCase()}（${r.majorityCount} 只）`,
        'color: green; font-weight: bold; font-size: 14px;');
    log(`%c📦 少数派 (MINORITY) 合计 ${r.minorityKamis.length} 只（已排除 ${r.excludedKillers.length} 只杀手保护）：`,
        'color: cyan; font-weight: bold;');
    log(`%c   🟢 RESTING ${minResting.length} 只：可直接转移到其他账户`,
        'color: cyan;');
    log(`%c   🔴 HARVESTING ${minHarvesting.length} 只：需要先停采才能转移 → 调用 stopMinorityForTransfer()`,
        'color: orange;');
    if (minOther.length > 0) {
      log(`%c   ⚪ 其他状态 ${minOther.length} 只（DEAD / 升级中等，跳过）`, 'color: gray;');
    }

    // minority 详细列表（按目标地块分组，方便用户分批转移）
    // 全部 index 都列出（不截断），超过 20 个时分行展示
    if (r.minorityKamis.length > 0) {
      log(`%c📋 少数派明细（按目标地块分组，全部 index 已列出，可直接复制到游戏内查找）：`, 'color: cyan;');
      for (const t of TERRAIN_TYPES) {
        if (t === r.majority) continue;
        // 明细列表同样剔除杀手 kami，与 minorityKamis 的口径保持一致
        const list = r.byType[t].filter(k =>
          !(window.MY_KILLER_KAMIS instanceof Set && window.MY_KILLER_KAMIS.has(Number(k.index)))
        );
        if (list.length === 0) continue;
        const allItems = list.map(k => `#${k.index}(${k.state})`);
        const PER_LINE = 20;  // #XXXXX(HARVESTING) 约 20 字符，20 个/行约 400 字符
        const itemLines = [];
        itemLines.push(`      → ${list.length} 只 → ${t.toUpperCase()} 地块账户：`);
        for (let i = 0; i < allItems.length; i += PER_LINE) {
          itemLines.push('          ' + allItems.slice(i, i + PER_LINE).join(', '));
        }
        log(itemLines.join('\n'));
      }
    }

    if (r.excludedKillers.length > 0) {
      const kk = r.excludedKillers.map(k => `#${k.index}`).join(', ');
      log(`%c🛡️ 已保护跳过 ${r.excludedKillers.length} 只杀手 kami（即使是 minority 也不动）: ${kk}`,
          'color: #d4a017;');
    }

    log('=====================================');
  }

  /**
   * 给核心脚本调用的 minority 数据接口
   * - 核心脚本的 stopMinorityForTransfer() 用它筛 HARVESTING 然后批量停采
   * - 返回 { minorityKamis, majority, ... }，全部由 classifyKamisByAffinity 算
   */
  async function __getMinorityKamis() {
    return await classifyKamisByAffinity();
  }

  // 暴露到全局
  window.analyzeKamiTerrainFit = analyzeKamiTerrainFit;
  window.kamiAnalyze = analyzeKamiTerrainFit;
  window.__getMinorityKamis = __getMinorityKamis;     // 给核心脚本 stopMinorityForTransfer 用
  window.__classifyKamisByAffinity = classifyKamisByAffinity; // 调试用
  window.getRoomAffinity = getRoomAffinity;
  window.getRoomName = getRoomName;
  window.getCurrentRoomInfo = getCurrentRoomInfo;
  window.isKamiSuitable = isKamiSuitable;
  window.isKamiSuitableForRoom = isKamiSuitableForRoom;

  log('✅ Kami 属性分类模块已加载（不依赖地块、从 db 读、瞬时完成）');
  log('   📊 分析当前 4 类分布 + majority / minority → kamiAnalyze()');
  log('   🛑 一键停采 minority 中正在采集的 kami（方便转移）→ stopMinorityForTransfer() [核心脚本提供]');

  // ============================================================
  // 【板块：杀手候选扫描】
  // ------------------------------------------------------------
  // ▍功能：
  //   从当前账户全部 kami 中筛出"疑似杀手 build"——出生原始属性满足
  //   高 violence（攻击）+ 高 harmony（防御/恢复）+ 低 power 的个体，
  //   供用户决策是否培养为杀手并加入杀手清单（避免自动升级巡检把
  //   技能点按采集向重新分配掉）。
  //   为什么用 base（出生原始值）而不用 total：base 永不随等级/技能/
  //   装备变化，是判断 build 潜力的唯一稳定指标；total 含各种加成会
  //   漂移，不适合做筛选依据。vioBase/harmBase/powBase 三个字段已由
  //   精简数据库脚本预存进 kami_core_db，因此筛选可以在内存瞬时完成
  //   （db-first 的性能来源：全量 API 扫描要 N×0.4 秒，内存筛选为 0）。
  // ▍触发时机：
  //   - 脚本启动后自动执行一次（等游戏 API 就绪后再延迟 30 秒错峰）；
  //   - 手动：控制台随时调用 findKillerCandidates()。
  // ▍依赖：
  //   - window.kami_core_db —— 需含 vioBase/harmBase/powBase 字段（由
  //     精简数据库脚本写入；db 缺这三个字段时自动降级 API 全扫）；
  //   - window.network.explorer.accounts.getByOperator —— 账户实时持有列表；
  //   - window.network.explorer.kamis.getByIndex(index, {stats, traits,
  //     progress}) —— 单只动态详情（level/state/total 等，每只约 0.4 秒）；
  //   - window.MY_KILLER_KAMIS —— 核心脚本的杀手清单 Set；核心脚本未加载
  //     时降级用本脚本前文定义的 RESET_WHITELIST；
  //   - delay() / log() —— 本脚本前文定义的工具函数；
  //   - 不读 DOM、不用 localStorage、不发 tx，纯只读扫描。
  // ▍核心流程（db-first 三阶段）：
  //   1) 阶段1：在 kami_core_db 内存里按 base 阈值筛候选（瞬时，0 API）；
  //   2) 阶段2：1 次 API 拿当前账户 kami 列表，候选与之求交集，剔除
  //      已转走的"幽灵"（db 有记录但已不在本账户名下）；
  //   3) 阶段3：仅为存活候选逐只查动态数据（level/state/total），候选
  //      通常 ≤10 只，几秒完成；
  //   4) 输出：按 vioBase 降序、vioBase 相同再按 harmBase 降序排序；
  //      逐只打印 base→total 对照、body/hand、等级、状态、LT（清算线）；
  //      再按 body affinity 分组汇总（杀手 build 与 body affinity 强相关，
  //      分组便于按地块规划杀手部署）；最后统计已在/未在杀手清单的
  //      数量，未在清单的（NEW）红字提示，并给出加入清单的操作指引。
  // ▍边界与保护：
  //   - db 为空：直接终止并提示先运行精简数据库脚本构建；
  //   - db 无 base 字段（旧库）：自动降级 _scanByApiFallback 全量 API
  //     扫描，每只约 0.4 秒，每扫 30 只打印一次进度，单只失败计入
  //     skipped 不中断整体；
  //   - 阶段3 单只查询异常同样计入 skipped，不影响其余候选；
  //   - 钱包地址取不到 / 账户无 kami：打印错误后直接返回；
  //   - 自动扫描：轮询等待游戏 API 就绪，最长 5 分钟超时（超时后提示
  //     手动执行）；就绪后再延迟 30 秒，避开启动期自动升级巡检的 API
  //     高峰；仅执行一次、不设重复定时器（出生属性是静态的，重复扫描
  //     无意义）；扫描抛错只打印提示，不影响脚本其余功能。
  // ▍可调参数（均可用 findKillerCandidates({ vio, harm, pow }) 临时覆盖）：
  //   - T_VIO_MIN = 23 —— base.violence 下限；调低候选变多、误报变多；
  //   - T_HARM_MIN = 15 —— base.harmony 下限；调低候选变多；
  //   - T_POW_MAX = 12 —— base.power 上限；调高候选变多（power 高说明
  //     属性点偏采集向，不符合杀手 build 特征）；
  //   - MAX_WAIT = 5 分钟 —— 自动扫描等待 API 就绪的超时上限；
  //   - POLL_MS = 5000 —— API 就绪轮询间隔（毫秒）；
  //   - 30 秒 —— API 就绪后的错峰延迟；调小会与升级巡检抢 API。
  // ▍相关控制台命令：
  //   - findKillerCandidates() —— 按默认阈值扫描
  //     （base.violence ≥ 23 ∧ base.harmony ≥ 15 ∧ base.power ≤ 12）；
  //   - findKillerCandidates({ vio: 25, harm: 17, pow: 10 }) —— 自定义阈值。
  // ============================================================

  // 内部：API 全量扫描兜底路径（db 无 base 字段时使用，每只 ~0.4 秒）
  async function _scanByApiFallback(myKamis, T_VIO_MIN, T_HARM_MIN, T_POW_MAX, killerSet) {
    log(`%c⚠️ kami_core_db 无 base 字段（vioBase/harmBase/powBase 为空）`,
        'color: red; font-weight: bold;');
    log(`%c   请运行【精简数据库脚本】重建一次 db；本次自动降级用 API 全扫（慢）`,
        'color: red;');
    log(`🔍 [Fallback] 扫描中 ${myKamis.length} 只 kami（每只 ~0.4 秒，预计 ${Math.ceil(myKamis.length * 0.4)} 秒）...`);

    const candidates = [];
    let scanned = 0, skipped = 0;
    for (const k of myKamis) {
      try {
        // 逐只拉全量详情（stats/traits/progress），每只约 0.4 秒
        const detail = await window.network.explorer.kamis.getByIndex(k.index, {
          stats: true, traits: true, progress: true
        });
        const vioBase  = detail.stats?.violence?.base ?? 0;
        const harmBase = detail.stats?.harmony?.base  ?? 0;
        const powBase  = detail.stats?.power?.base    ?? 0;
        if (vioBase >= T_VIO_MIN && harmBase >= T_HARM_MIN && powBase <= T_POW_MAX) {
          // 尽量从 db 补 LT（清算线）字段——API 详情里没有这个衍生值
          const dbRec = (window.kami_core_db || []).find(r => r.index === Number(k.index));
          candidates.push({
            index: Number(k.index),
            vioBase, harmBase, powBase,
            hpBase:  detail.stats?.health?.base ?? 0,
            vioTot:  detail.stats?.violence?.total ?? vioBase,
            harmTot: detail.stats?.harmony?.total  ?? harmBase,
            powTot:  detail.stats?.power?.total    ?? powBase,
            hpTot:   detail.stats?.health?.total   ?? 0,
            body:    String(detail.traits?.body?.affinity || '').toLowerCase(),
            hand:    String(detail.traits?.hand?.affinity || '').toLowerCase(),
            level:   detail.progress?.level ?? 0,
            state:   String(detail?.state || '').toUpperCase(),
            lt:      dbRec?.LT,
            inKiller: killerSet.has(Number(k.index)),
          });
        }
      } catch (e) { skipped++; }
      scanned++;
      // 每扫 30 只打印一次进度，避免长时间无输出让用户误以为卡死
      if (scanned % 30 === 0) {
        log(`  ⏳ 已扫 ${scanned}/${myKamis.length}（候选 ${candidates.length}，跳过 ${skipped}）`);
      }
    }
    return { candidates, scanned, skipped };
  }

  async function findKillerCandidates(opts = {}) {
    // 阈值：未传参数（或传非数字）时使用默认值 vio≥23 ∧ harm≥15 ∧ pow≤12
    const T_VIO_MIN  = Number.isFinite(opts.vio)  ? opts.vio  : 23;
    const T_HARM_MIN = Number.isFinite(opts.harm) ? opts.harm : 15;
    const T_POW_MAX  = Number.isFinite(opts.pow)  ? opts.pow  : 12;

    log(`========== 🗡️ 杀手候选扫描 (db-first) ==========`);
    log(`筛选条件: base.violence ≥ ${T_VIO_MIN} ∧ base.harmony ≥ ${T_HARM_MIN} ∧ base.power ≤ ${T_POW_MAX}`);

    const addr = window.network?.network?.connectedAddress?.value_
              || window.network?.network?.connectedAddress?.value;
    if (!addr) { log('❌ 无法获取钱包地址'); return; }

    // 取核心脚本的杀手清单（如果加载了）；否则降级用辅助脚本本地的 RESET_WHITELIST
    const killerSet = (window.MY_KILLER_KAMIS instanceof Set) ? window.MY_KILLER_KAMIS : RESET_WHITELIST;

    // 【阶段2 第一部分】1 个 API 调用：拿当前账户 kami 列表（用于剔除幽灵）
    const acc = await window.network.explorer.accounts.getByOperator(addr);
    const myKamis = acc?.kamis || [];
    if (myKamis.length === 0) { log('❌ 当前账户没有 kami'); return; }
    const ownedIdxSet = new Set(myKamis.map(k => Number(k.index)));

    // 【阶段1】从 kami_core_db 筛选 base 候选
    const db = window.kami_core_db || [];
    if (db.length === 0) {
      log(`%c❌ kami_core_db 为空，请先运行【精简数据库脚本】构建`, 'color: red; font-weight: bold;');
      return;
    }

    // 检测 db 是否有 base 字段（旧库没有这三个字段，需走 API 全扫兜底）
    const dbHasBase = db.some(r => r.vioBase != null || r.harmBase != null || r.powBase != null);

    let candidates, scanned, skipped;
    if (!dbHasBase) {
      // 兜底：db 没有 base 字段 → 全 API 扫描
      const r = await _scanByApiFallback(myKamis, T_VIO_MIN, T_HARM_MIN, T_POW_MAX, killerSet);
      candidates = r.candidates; scanned = r.scanned; skipped = r.skipped;
    } else {
      // db-first 流程
      const baseFilled = db.filter(r => r.vioBase != null && r.harmBase != null && r.powBase != null).length;
      log(`📦 db 共 ${db.length} 条，base 字段填充 ${baseFilled} 只；当前账户持有 ${myKamis.length} 只`);

      // 阶段1: 内存筛选
      const dbCandidates = db.filter(r =>
        r.vioBase != null && r.harmBase != null && r.powBase != null
        && r.vioBase >= T_VIO_MIN && r.harmBase >= T_HARM_MIN && r.powBase <= T_POW_MAX
      );
      log(`[阶段1] 从 db 筛出 ${dbCandidates.length} 只符合 base 阈值的候选（瞬时，0 API）`);

      // 阶段2: 与当前账户求交集
      const survivors = dbCandidates.filter(r => ownedIdxSet.has(Number(r.index)));
      const ghosts = dbCandidates.filter(r => !ownedIdxSet.has(Number(r.index)));
      if (ghosts.length > 0) {
        log(`[阶段2] 已剔除 ${ghosts.length} 只不在当前账户的"幽灵": ${ghosts.map(g => '#' + g.index).join(', ')}`);
      }
      log(`[阶段2] ${survivors.length} 只候选确认在当前账户名下`);

      // 阶段3: 为存活候选查动态数据（level/state/total）
      log(`[阶段3] 查询 ${survivors.length} 只候选的当前状态（每只 ~0.4 秒）...`);
      candidates = []; scanned = 0; skipped = 0;
      for (const r of survivors) {
        try {
          // 只为动态字段（level/state/total）发 API；静态字段直接用 db 记录
          const detail = await window.network.explorer.kamis.getByIndex(r.index, {
            stats: true, traits: true, progress: true
          });
          // body/hand 优先取 db（静态可信），API 值仅作缺失兜底
          candidates.push({
            index: Number(r.index),
            vioBase: r.vioBase, harmBase: r.harmBase, powBase: r.powBase,
            hpBase:  detail.stats?.health?.base ?? 0,
            vioTot:  detail.stats?.violence?.total ?? r.vioBase,
            harmTot: detail.stats?.harmony?.total  ?? r.harmBase,
            powTot:  detail.stats?.power?.total    ?? r.powBase,
            hpTot:   detail.stats?.health?.total   ?? 0,
            body:    r.body || String(detail.traits?.body?.affinity || '').toLowerCase(),
            hand:    r.hand || String(detail.traits?.hand?.affinity || '').toLowerCase(),
            level:   detail.progress?.level ?? r.level ?? 0,
            state:   String(detail?.state || '').toUpperCase(),
            lt:      r.LT,
            inKiller: killerSet.has(Number(r.index)),
          });
        } catch (e) { skipped++; }
        scanned++;
      }
    }

    if (candidates.length === 0) {
      log(`========== 扫描完成：无符合条件的候选（已查 ${scanned} 只，跳过 ${skipped}）==========`);
      return [];
    }

    // 按 base.violence 降序，再按 base.harmony 降序
    candidates.sort((a, b) => b.vioBase - a.vioBase || b.harmBase - a.harmBase);

    // 红色高亮主标题，便于在大量日志里快速定位
    log(`%c========== ✅ 找到 ${candidates.length} 只杀手候选（动态查询 ${scanned} 只，跳过 ${skipped}）==========`,
        'color: red; font-size: 14px; font-weight: bold;');
    log(`格式说明：base(出生原始值) → total(含等级技能加成)`);
    for (const c of candidates) {
      const tag = c.inKiller ? ' ✅[已在杀手清单]' : '';
      const ltStr = (c.lt != null && Number.isFinite(c.lt)) ? `LT=${c.lt}%` : 'LT=未知';
      const handStr = c.hand ? ` hand=${c.hand}` : '';
      const lineText = `#${c.index}${tag}: vio=${c.vioBase}→${c.vioTot} harm=${c.harmBase}→${c.harmTot} pow=${c.powBase}→${c.powTot} hp=${c.hpBase}→${c.hpTot} | body=${c.body}${handStr} | Lv${c.level} ${c.state} ${ltStr}`;
      // NEW 候选（不在杀手清单）红字提示，因为这些才是用户需要决策的对象
      if (c.inKiller) {
        log(lineText);
      } else {
        log(`%c${lineText}`, 'color: red;');
      }
    }

    // 按 body affinity 分组（杀手 build 与 body affinity 强相关）
    const byBody = {};
    candidates.forEach(c => {
      const key = c.body || '(unknown)';
      if (!byBody[key]) byBody[key] = [];
      byBody[key].push(c.index);
    });
    log(`---`);
    log(`📊 按 body affinity 分组：`);
    for (const [body, list] of Object.entries(byBody)) {
      log(`   ${body.toUpperCase()} (${list.length} 只): ${list.map(i => '#' + i).join(', ')}`);
    }

    // 提示已在 / 未在杀手清单
    const newOnes = candidates.filter(c => !c.inKiller);
    const existingOnes = candidates.filter(c => c.inKiller);
    log(`---`);
    log(`%c💡 候选状态: ${existingOnes.length} 只已在杀手清单 | ${newOnes.length} 只未在（NEW）`,
        newOnes.length > 0 ? 'color: red; font-weight: bold;' : '');
    if (newOnes.length > 0) {
      log(`%c💡 如要将某只转为杀手，请同步更新两份常量（避免下次升级被自动重分配技能）：`,
          'color: red; font-weight: bold;');
      log(`   ① 核心脚本 MY_KILLER_KAMIS（找 "新增 window.MY_KILLER_KAMIS"）`);
      log(`   ② 辅助脚本 RESET_WHITELIST（源码搜索该常量名定位）`);
      log(`   控制台临时验证（重启失效）：window.MY_KILLER_KAMIS.add(<index>)`);
    }
    log(`%c========================================`, 'color: red; font-size: 14px; font-weight: bold;');
    return candidates;
  }

  window.findKillerCandidates = findKillerCandidates;

  // ============================================================
  // 【板块：全网最强杀手扫描（每周自动 + 手动）】
  // ------------------------------------------------------------
  // ▍功能：扫描全网【全部】kami（含 RESTING/DEAD——杀手随时可部署/复活），
  //   按 hand 分四桶找出最强杀手（每桶帕累托前沿：三维不被碾压者全保留），结果存 localStorage 供上方
  //   【精确清算线计算】板块使用；并为每只入围者反查主人玩家名
  //   （与杀手监控脚本同一条链路：entity → OwnsKamiID → 账户名），
  //   方便你决定是否把它加进杀手监控名单。
  // ▍触发时机：
  //   - 自动：启动后游戏 API 就绪 + 延迟 90 秒（错峰启动期高峰）→
  //     无扫描数据（首次）或数据超 7 天 → 自动全网扫描；
  //     数据仍有效时只做一次 refreshPreciseLT()（保证 db 与档案一致）；
  //   - 手动：控制台 scanTopPredators() 随时触发。
  // ▍依赖：window.network.explorer（本地 ECS，零 gas）；扫描 20~60 秒，
  //   每次读取都让出主线程，不阻塞其他模块运行。
  // ▍排序口径：每桶按"对标准猎物（harmony 取你库内中位数、白板防御）的精确清算线"降序（猎物取该
  //   hand 的天然被克 body；NORMAL 手取 NORMAL body）。
  // ▍哨兵：ATS>0.4 的 kami 单独红字报告——超出常见技能上限，意味着威胁
  //   模型需要人工复核。
  // ▍边界与保护：__topScanRunning 防重复；单只读取失败跳过计数；
  //   localStorage 写入失败仅告警（下次启动会重扫）。
  // ▍相关控制台命令：scanTopPredators() / showTopPredators() / refreshPreciseLT()
  // ============================================================
  let __topScanRunning = false;
  async function scanTopPredators() {
    if (__topScanRunning) { log('⚠️ [杀手扫描] 已在进行中'); return; }
    __topScanRunning = true;
    const t0 = Date.now();
    try {
      const ex = window.network?.explorer;
      if (!ex?.kamis?.all || !ex?.entities?.get || !ex?.accounts?.getByID) {
        log('❌ [杀手扫描] 游戏 API 未就绪，稍后重试或手动 scanTopPredators()');
        return;
      }
      const all = await ex.kamis.all();
      log(`🗡️ [杀手扫描] 全网 ${all.length} 只，开始扫描（预计 20~60 秒，本地读取零 gas）…`);

      // 威胁分基准猎物的 harmony：取库内全部 kami harmony 的中位数（固定 24 偏离多数
      // 账户的实际水平；中位数让"最强"排序贴近你的真实鱼群）。库缺失或样本 <10 退回 24。
      // ⚠️ 仅影响威胁分的展示排序——清算线计算用每只 kami 自己的参数、入档由帕累托前沿决定，均不经过威胁分。
      let BENCH_HARM = 24;
      try {
        const hs = (window.kami_core_db || []).map(r => r.harmony).filter(v => v > 0).sort((a, b) => a - b);
        if (hs.length >= 10) BENCH_HARM = Math.round(hs[Math.floor(hs.length / 2)]);
      } catch (e) {}
      const buckets = { EERIE: [], SCRAP: [], INSECT: [], NORMAL: [] };
      const sentinel = [];   // ATS>0.4 哨兵名单
      let done = 0, skipped = 0;
      for (const k of all) {
        try {
          const d = await ex.kamis.getByIndex(Number(k.index), { stats: true, traits: true, bonus: true });
          const vio = d?.stats?.violence?.total ?? 0;
          const ats = d?.bonuses?.attack?.threshold?.shift ?? 0;
          const atr = d?.bonuses?.attack?.threshold?.ratio ?? 0;
          if (vio >= 20 || ats > 0 || atr > 0) {   // 只留有杀手苗头的（vio≥20 或带攻击技能）
            const hand = String(d?.traits?.hand?.affinity || '').toUpperCase();
            const rec = { index: Number(k.index), name: d?.name || '', state: String(k.state || ''),
                          entity: d?.entity, vio, ats: +(+ats).toFixed(3), atr: +(+atr).toFixed(3) };
            if (buckets[hand]) buckets[hand].push(rec);
            if (ats > 0.4) sentinel.push({ index: rec.index, vio, ats: rec.ats });
          }
        } catch (e) { skipped++; }
        done++;
        if (done % 2000 === 0) log(`  ⏳ [杀手扫描] ${done}/${all.length}…`);
      }

      // 每桶先算"威胁分"（完整官方公式对标准猎物的清算线，仅用于排序展示），
      // 再取【帕累托前沿】存档：只剔除 vio/ATS/ATR 三维全部不如某只的"被碾压者"。
      // 公式对三维均单调不减 ⇒ 被碾压者对任何猎物都算不出更高的线，剔除绝不漏真最坏；
      // 前沿成员各自可能是某类猎物的最坏（高 harmony 怕高 ATS、低 harmony 怕高 vio），
      // 最终"对每只 kami 取最坏"在前沿集合上逐个计算，数学上保证不漏。
      const PREY_BODY = { EERIE: 'SCRAP', SCRAP: 'INSECT', INSECT: 'EERIE', NORMAL: 'NORMAL' };
      for (const h of Object.keys(buckets)) {
        for (const e of buckets[h]) {
          e.lt24 = +computePreciseLT({ vio: e.vio, hand: h, ats: e.ats, atr: e.atr },
                                     { harm: BENCH_HARM, body: PREY_BODY[h], dtr: 0, dts: 0 }).toFixed(1);
        }
        buckets[h].sort((a, b) => b.lt24 - a.lt24);   // 威胁分降序（展示序；也保证支配者先入前沿）
        const front = [];
        for (const e of buckets[h]) {
          if (!front.some(f => f.vio >= e.vio && f.ats >= e.ats && f.atr >= e.atr
                            && (f.vio > e.vio || f.ats > e.ats || f.atr > e.atr))) front.push(e);
        }
        // 存储上限保护：前沿异常庞大时保留威胁分最高的 40 只并明示截断（正常前沿约十几只）
        if (front.length > 40) log(`⚠️ [杀手扫描] ${h} 桶帕累托前沿 ${front.length} 只，仅存威胁分最高的 40 只`);
        buckets[h] = front.slice(0, 40);
      }
      // 只为入围者反查主人玩家名（几十次本地读取）
      for (const h of Object.keys(buckets)) {
        for (const e of buckets[h]) {
          try {
            const ent = await ex.entities.get(e.entity);
            const acc = await ex.accounts.getByID(ent.OwnsKamiID);
            e.owner = acc?.name || '';
            e.ownerId = ent.OwnsKamiID || null;    // 主人账户 id：选档时实查活跃度
            e.ownerLast = acc?.time?.last || 0;    // 扫描时的最后链上动作（unix 秒，展示用）
          } catch (err) { e.owner = ''; e.ownerId = null; e.ownerLast = 0; }
          delete e.entity;   // 存储瘦身：entity id 只在反查时需要
        }
      }

      const data = { version: 1, at: Date.now(), scanned: done, skipped, buckets, sentinel, benchHarm: BENCH_HARM };
      try {
        localStorage.setItem(TOP_PREDATORS_KEY, JSON.stringify(data));
      } catch (e) {
        log(`⚠️ [杀手扫描] localStorage 写入失败（结果本次会话仍生效）: ${e?.message || e}`);
      }

      // 单条汇总输出（避免每行带来源链接）
      const out = [];
      out.push(`═══════ 🗡️ 全网最强杀手扫描完成（耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s，扫 ${done} 只，失败跳过 ${skipped}）═══════`);
      out.push(`结果已存 localStorage.${TOP_PREDATORS_KEY}，精确清算线立即按新档案生效；超 7 天后启动时自动重扫`);
      // 与杀手监控名单比对（杀手监控脚本暴露的 __killerWatchList；未加载时无法判断）
      const __watchKnown = Array.isArray(window.__killerWatchList);
      const __watchSet = new Set([
        ...(__watchKnown ? window.__killerWatchList : []),
        ...(Array.isArray(window.__killerSelfOwned) ? window.__killerSelfOwned : []),
      ].map(Number));
      for (const h of ['EERIE', 'SCRAP', 'INSECT', 'NORMAL']) {
        const top = buckets[h][0];
        if (!top) { out.push(`  ${h.padEnd(6)}手最强: （无候选）`); continue; }
        const tag = !__watchKnown ? ' —— 可考虑加入杀手监控名单（监控脚本未加载，无法比对）'
                  : (__watchSet.has(top.index) ? ' —— ✅ 已在杀手监控名单'
                                               : ' —— ⚠️ 未在监控名单，建议加入');
        out.push(`  ${h.padEnd(6)}手最强: #${top.index} 威胁分${top.lt24}%｜vio${top.vio} ATS${top.ats} ATR${top.atr}${top.owner ? '（主人: ' + top.owner + '，' + __fmtAgoDays(top.ownerLast) + '）' : ''}${tag}`);
      }
      out.push(`  （"最强"按威胁分排序＝完整官方公式（含 ATS/ATR 偏移）对标准猎物[harm${BENCH_HARM}＝你库内 harmony 中位数·被克体·无防]的清算线；vio 只是其中一维）`);
      // 活跃度选档提示：主人沉寂超阈值的账面最强会被降级，清算线改按活跃的次强计算
      for (const h of ['EERIE', 'SCRAP', 'INSECT', 'NORMAL']) {
        const top = buckets[h][0];
        if (!top) continue;
        const idle = __ownerInactiveDays(top.ownerId);
        if (idle > PREDATOR_INACTIVE_DAYS) {
          const eff2 = buckets[h].find(e => __ownerInactiveDays(e.ownerId) <= PREDATOR_INACTIVE_DAYS);
          out.push(eff2
            ? `  ⏬ ${h} 手账面最强 #${top.index} 主人已沉寂 ${Math.round(idle)} 天 → 清算线改按活跃次强 #${eff2.index}（vio${eff2.vio}）等计算`
            : `  ⏸️ ${h} 手前沿档案主人全部沉寂 >${PREDATOR_INACTIVE_DAYS} 天 → 保守回退按账面档案计算`);
        }
      }
      out.push(sentinel.length
        ? `  🚨 哨兵：发现 ${sentinel.length} 只 ATS>0.4 的 kami（${sentinel.slice(0, 5).map(s => '#' + s.index).join(', ')}${sentinel.length > 5 ? '…' : ''}），威胁超常，请人工复核档案！`
        : `  ✅ 哨兵：全网无 ATS>0.4 的 kami`);
      log(out.join('\n'));

      __predSelCache = null;   // 让新档案跳过 10 分钟选档缓存立即生效
      // 扫完立即用新档案重算全库精确清算线
      refreshPreciseLT();
      return data;
    } catch (e) {
      log(`❌ [杀手扫描] 失败: ${e?.message || e}（可手动 scanTopPredators() 重试）`);
    } finally { __topScanRunning = false; }
  }

  // 用当前生效档案重算 kami_core_db 全部记录的 LT/LTHP 并写回 localStorage。
  // 覆盖场景：精简数据库/核心脚本自愈写入的旧公式初值、档案更新后的全量刷新。
  function refreshPreciseLT() {
    const db = window.kami_core_db || [];
    if (!db.length) { log('⚠️ [精确LT] kami_core_db 为空，跳过重算（请先运行精简数据库脚本构建）'); return 0; }
    const eff = getEffectivePredators();
    let changed = 0;
    for (const rec of db) {
      const r = computePreciseLTForRecord(rec.harmony, rec.body, rec.ratio, rec.shift, rec.maxhp);
      if (r.LT == null) continue;
      if (rec.LT !== r.LT) { rec.LT = r.LT; rec.LTHP = r.LTHP; changed++; }
    }
    try { localStorage.setItem('kami_core_db', JSON.stringify(db)); } catch (e) {}
    log(`📐 [精确LT] 已按【${eff.source}】档案重算清算线：${db.length} 条记录，更新 ${changed} 条${eff.at ? '（档案扫描于 ' + new Date(eff.at).toLocaleString() + '）' : ''}`);
    return changed;
  }

  // 查看当前生效的威胁档案与扫描状态
  function showTopPredators() {
    const eff = getEffectivePredators();
    const out = [];
    out.push(`═══════ 🗡️ 当前生效的顶尖杀手档案（来源：${eff.source}${eff.at ? '，扫描于 ' + new Date(eff.at).toLocaleString() : ''}${eff.benchHarm ? '，威胁分基准 harm=' + eff.benchHarm : ''}）═══════`);
    for (const p of eff.list) {
      out.push(`  ${String(p.hand).padEnd(6)}手  ${String(p.label).padEnd(16)} ${p.lt24 != null ? '威胁分' + p.lt24 + '%  ' : ''}vio${p.vio} ATS${p.ats} ATR${p.atr}`);
    }
    if (eff.demoted?.length) {
      out.push(`  ⏬ 已降级（主人沉寂 >${PREDATOR_INACTIVE_DAYS} 天，不参与清算线）：` + eff.demoted.map(d => `#${d.index}${d.owner ? '@' + d.owner : ''}(${d.hand},${d.idleDays}天)`).join('｜'));
    }
    out.push(`说明：清算线对"活跃档案"取最坏对位（主人 >${PREDATOR_INACTIVE_DAYS} 天无链上动作的自动降级；整桶沉寂则整桶保守回退）；scanTopPredators() 立即重扫；数据超 7 天自动重扫`);
    console.log(out.join('\n'));
  }

  // ── 清算线对照：兜底线（精确公式 + 内置包络档案 = 数据库建库/重建写入的初值口径）
  //    vs 实战线（精确公式 + 最新扫描档案 + 活跃度选档 = 辅助每小时重算写回 db、核心实际使用的值）。
  //    两侧现场重算；另附旧公式（V41 满配假想杀手，历史口径/核心增量初值）均值作参考。
  //    compareLT() 打印摘要 + 差异最大的 20 只；compareLT(true) 打印全部。
  function compareLT(showAll = false) {
    const db = window.kami_core_db || [];
    if (!db.length) { log('⚠️ [清算线对照] kami_core_db 为空，请先运行精简数据库脚本构建'); return; }
    const eff = getEffectivePredators();
    const rows = [];
    let oldSum = 0;
    for (const rec of db) {
      const a = __worstLTOver(TOP_PREDATORS_DEFAULT, rec.harmony, rec.body, rec.ratio, rec.shift, rec.maxhp);   // 兜底线（与 DB_TOP_PREDATORS 同值）
      const b = __worstLTOver(eff.list, rec.harmony, rec.body, rec.ratio, rec.shift, rec.maxhp);                // 实战线
      const o = computeLiquidationLine(41, rec.harmony, rec.body, rec.ratio, rec.shift, rec.maxhp);             // 旧公式参考
      if (a.LT == null || b.LT == null) continue;
      oldSum += o.LT ?? 0;
      rows.push({ rec, dbv: a.LT, live: b.LT, d: +(b.LT - a.LT).toFixed(2) });
    }
    if (!rows.length) { log('⚠️ [清算线对照] 无可比记录（关键字段为 null），请重建数据库'); return; }
    rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    const ds = rows.map(r => r.d).slice().sort((x, y) => x - y);
    const avg = ds.reduce((s, v) => s + v, 0) / ds.length;
    const med = ds[Math.floor(ds.length / 2)];
    const up = rows.filter(r => r.d > 0.05).length;
    const out = [];
    out.push(`═══════ 📊 [清算线对照] 兜底线(内置包络档案·数据库初值) vs 实战线(【${eff.source}】现役档案+活跃度选档${eff.demoted?.length ? '，已降级 ' + eff.demoted.length + ' 只沉寂杀手' : ''}) ═══════`);
    out.push(`  可比 ${rows.length} 只 ｜ 差值(实战−兜底) 平均 ${avg.toFixed(1)}pp / 中位 ${med.toFixed(1)}pp ｜ 实战高于兜底 ${up} 只${up ? '（⚠️ 内置包络档案已被现役最强突破，请按扫描值同步更新辅助/数据库两处默认档案）' : ''}`);
    out.push(`  参考：旧公式(V41满配假想杀手)均值 ${(oldSum / rows.length).toFixed(1)}%（历史口径，现仅核心增量入库短暂使用、1小时内被精确值覆盖）`);
    const show = showAll ? rows : rows.slice(0, 20);
    for (const r of show) {
      out.push(`  #${String(r.rec.index).padEnd(6)} ${String(r.rec.name || '').padEnd(14)} ${String(r.rec.body || '?').padEnd(7)} 兜底 ${r.dbv.toFixed(1).padStart(5)}% → 实战 ${r.live.toFixed(1).padStart(5)}%（${r.d > 0 ? '+' : ''}${r.d.toFixed(1)}pp）`);
    }
    if (!showAll && rows.length > show.length) out.push(`  …（按差异绝对值降序展示前 ${show.length} 只，共 ${rows.length} 只；compareLT(true) 查看全部）`);
    out.push(`  说明：兜底线=精简数据库建库/重建写入的初值（内置包络档案，恒保守）；实战线=辅助按现役活跃最强每小时重算写回 db、核心实际使用的值。`);
    out.push(`  差值来源=档案新旧差异+活跃度降级；负值=现役威胁低于包络假设（采集窗口更长）。`);
    log(out.join('\n'));
  }

  window.scanTopPredators = scanTopPredators;
  window.refreshPreciseLT = refreshPreciseLT;
  window.showTopPredators = showTopPredators;
  window.compareLT = compareLT;

  // ── 启动调度：API 就绪后延迟 90 秒 → 无档案/超 7 天自动扫，否则只重算；
  //    另每 60 分钟轻量重算一次（覆盖核心脚本 syncKamiDb 自愈新增的旧公式初值）──
  (async function autoTopPredatorScan() {
    const MAX_WAIT = 5 * 60 * 1000, POLL_MS = 5000, start = Date.now();
    while (Date.now() - start < MAX_WAIT) {
      await delay(POLL_MS);
      const ready = !!window.network?.explorer?.kamis?.all && !!window.network?.explorer?.accounts?.getByID;
      if (ready) {
        await delay(90 * 1000);   // 错峰：避开启动期的升级巡检与杀手候选扫描
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(TOP_PREDATORS_KEY) || 'null'); } catch (e) {}
        const age = stored?.at ? Date.now() - stored.at : Infinity;
        if (!stored || age > TOP_PREDATORS_TTL_MS) {
          log(`%c🗡️ [杀手扫描] ${!stored ? '首次运行、尚无威胁档案' : '档案已超 7 天'}，自动全网扫描…`, 'color: red; font-weight: bold;');
          await scanTopPredators();
        } else {
          refreshPreciseLT();
        }
        setInterval(() => { try { refreshPreciseLT(); } catch (e) {} }, 60 * 60 * 1000);
        return;
      }
    }
    log('⚠️ [杀手扫描] 等待游戏 API 超时（5分钟），可手动 scanTopPredators()');
  })();

  // ============================================================
  // 【板块：代码健康看板 v3（回答"该发生的发生了没有、发生得对不对"）】
  // ------------------------------------------------------------
  // ▍定位：日志记录"发生了什么"，静默是它的盲区——部署三小时没日志，
  //   是没活可干（正常）还是模块卡死（故障）？本看板用"期望表"对照
  //   实际运行情况，重点标红有问题的代码。v3 按《代码健康监控指标目录》
  //   实现四层检测（覆盖目录全部 🔴 与关键 🟡，约 140 项）：
  //   ① 心跳层 —— 周期性模块静默超期（该跑没跑）；
  //   ② 事件层 —— 约 45 种"出现即报"特征（跑出坏事：死亡/熔断/警报/断货…）；
  //   ③ 闭环层 —— 10 组"开始→终态"配对（开了头没收尾 = 流程挂死）；
  //   ④ 状态层 —— window/localStorage/DOM 直读（锁僵尸/旗卡死/库损坏/配置漂移…）。
  // ▍数据源（零新增链上查询）：
  //   ① window.__kamiHealthBeats —— 埋点时间戳（核心写 主循环/XP流程/拾荒，
  //      本脚本写 LT显示/升级巡检/自动合成/健康自检）；
  //   ② window.__kamiLogBuffer —— 日志特征反查（杀手监控/精简数据库的日志
  //      自本版本起也写入该缓冲，四脚本可观测性拉齐）；
  //   ③ window / localStorage / DOM 状态直读；
  //   ④ performance.now() 页面运行时长（宽限期基准，防刷新后误报）。
  // ▍判定：🔴 资产/整线级置顶报警；🟡 关注级；⚪ 条件型只报最后活动、永不标红。
  //   刚刷新页面有宽限期（页面运行时长未超期望间隔前不判红）。
  // ▍输出：每 30 分钟自检（自检本身写埋点 + 异常落日志，可被自身监控）——
  //   有问题打红黄看板，全绿只打一行；控制台 showHealth() 随时查看完整看板。
  // ============================================================
  const __HEALTH_REGISTRY = [
    // 硬心跳（周期性模块，静默超期=红）：type 'beat'=读埋点 / 'sig'=日志特征反查
    // v3：beat 型条目补 re —— 让它们的错误日志也计入"执行结果层"统计（修 v2 盲区）
    { name: '核心主循环',   type: 'beat', key: '主循环',   re: /\[部署池\]|\[扫描统计\]|\[stop 分流\]|\[DOM预检\]|Kami 处理异常/, expectMin: 25, hint: '核心 runAutomation 停摆：部署/停采/喂食全部失效' },
    { name: '账户信息轮',   type: 'sig',  re: /🪶 账户信息|获取账户\/地块信息失败/, expectMin: 30, hint: '主循环轮内早退（心跳在跳但没跑完整轮）' },
    { name: '死亡监控',     type: 'sig',  re: /\[死亡监控\]/, expectMin: 12, hint: '死亡无人发现→不会自动复活' },
    { name: '杀手位置轮询', type: 'sig',  re: /⏱️ 下次检测:|🔍 我的位置|\[同房间警报\]|\[邻居预警\]/, expectMin: 10, hint: '杀手逼近无人预警（杀手监控脚本未运行或未升级到≥1.1.7？）' },
    { name: 'LT显示刷新',   type: 'beat', key: 'LT显示',   re: /\[LT兜底\]/, expectMin: 15, hint: '卡片清算线徽标停更（仅显示层）' },
    { name: '升级巡检',     type: 'beat', key: '升级巡检', re: /\[自动升级\]|\[定时升级\]|\[升级|升级tx发送失败|升级完成|技能\d+第\d+笔tx|\[技能重置摘要\]|重置技能|Respec Potion/, expectMin: 45, hint: '30 分钟升级定时器停摆' },
    { name: '自动合成',     type: 'beat', key: '自动合成', re: /\[AutoCraft\]/, expectMin: 45, hint: '30 分钟合成定时器停摆' },
    { name: '精确LT重算',   type: 'sig',  re: /\[精确LT\]/, expectMin: 75, hint: '每小时清算线重算停摆（自愈新增 kami 会留旧公式初值）' },
    { name: '防断连',       type: 'sig',  re: /\[防断连\]/, expectMin: 35, hint: 'idle 模拟点击停摆，长时间挂机断连风险上升' },
    // 条件型（无活可干本就静默，只报最后活动，永不标红；re 兼作"执行结果层"统计口径）
    { name: '批量部署', type: 'cond', re: /\[批量部署/ },
    { name: '停采',     type: 'cond', re: /停采|\[批量停止/ },
    { name: '喂食',     type: 'cond', re: /喂食|饿死救援/ },
    { name: '复活',     type: 'cond', re: /复活/ },
    { name: 'XP药水',   type: 'cond', re: /XP Potion|XP流程|XP 药水|pine_pollen/ },
    { name: '拾荒',     type: 'cond', re: /拾荒|Scavenge/ },
    { name: 'Gas统计',  type: 'cond', re: /\[Gas统计\]|\[余额警告\]/ },
    { name: 'DB增量',   type: 'cond', re: /\[DB增量\]/ },
    { name: '杀手扫描', type: 'cond', re: /\[杀手扫描\]/ },
    { name: '数据库构建', type: 'cond', re: /\[精简数据脚本\]|构建完成 →|\[构建失败\]|\[主流程异常\]/ },
  ];
  // ── v3 事件层：出现即报（60 分钟回看窗口，计数 + 展示最新一条原文）──
  // 与"心跳层"互补：心跳答"该跑没跑"，事件答"跑出了什么坏事"。
  const __HEALTH_EVENTS = [
    { lvl: '🔴', label: '发现 kami 死亡',          re: /个 Kami 死亡|\[复活\] 批量复活|启动窗口批量复活/ },
    { lvl: '🔴', label: '复活 tx 失败/revert',     re: /tx执行失败\(revert\)|\[复活\] #\d+ 发送失败|\[辅助复活\] #\d+ 发送失败|触发复活异常/ },
    { lvl: '🔴', label: '复活丝带断货',            re: /没有复活丝带|丝带.*不足|丝带.*没货|Ribbon.*不足/ },
    { lvl: '🔴', label: '救援食物断供',            re: /所有HP恢复食物库存为0/ },
    { lvl: '🔴', label: '喂食熔断',                re: /\[喂食\/熔断\]/ },
    { lvl: '🔴', label: '合成熔断（可能已扣gas）', re: /可能已上链 revert 扣 gas/ },
    { lvl: '🔴', label: '批量tx上链但整批失败',    re: /交易上链但执行失败/ },
    { lvl: '🔴', label: 'kami 疑似卡链上',         re: /疑似卡链上/ },
    { lvl: '🔴', label: '紧急停采触发',            re: /\[紧急触发\]/ },
    { lvl: '🔴', label: '停采后仍有残留',          re: /个未能停采|两轮重试后仍有/ },
    { lvl: '🔴', label: '杀手同房间警报',          re: /\[同房间警报\]/ },
    { lvl: '🔴', label: '杀手停采联动断裂',        re: /未找到 emergencyStopHarvest/ },
    { lvl: '🔴', label: 'gas 余额告警',            re: /\[余额警告\]/ },
    { lvl: '🔴', label: '白屏保护触发',            re: /\[白屏保护\]/ },
    { lvl: '🔴', label: '连续检测不到 Kami 列表',  re: /连续 10 次未检测到 Kami/ },
    { lvl: '🔴', label: 'DOM 规模严重不足',        re: /\[DOM预检\] 规模严重不足/ },
    { lvl: '🔴', label: 'STARVING 异常爆发',       re: /STARVING数量异常多/ },
    { lvl: '🔴', label: '部署整批预检失败',        re: /全部预检失败/ },
    { lvl: '🔴', label: '辅助/核心跨脚本断链',     re: /辅助脚本未加载或接口不可用/ },
    { lvl: '🔴', label: '技能重置失败',            re: /❌ 重置技能失败/ },
    { lvl: '🔴', label: '进游戏超时自刷',          re: /超时仍未进入 eye-half|分钟仍未成功进入游戏/ },
    { lvl: '🔴', label: '数据库构建失败',          re: /\[构建失败\]|\[主流程异常\]/ },
    { lvl: '🟡', label: '杀手邻居预警',            re: /\[邻居预警\]/ },
    { lvl: '🟡', label: '监控对象活跃击杀',        re: /自上次检查后清算了/ },
    { lvl: '🟡', label: '杀手监控被停止',          re: /API杀手监控已停止/ },
    { lvl: '🟡', label: '监控自身定位失败',        re: /无法获取自己位置，跳过本次检测/ },
    { lvl: '🟡', label: 'Feed 监控被意外启用',     re: /\[Feed监控\]/ },
    { lvl: '🟡', label: 'kami 被拉黑（部署/停采）', re: /加入黑名单|加入停采黑名单/ },
    { lvl: '🟡', label: '地块不匹配跳过',          re: /\[地块不匹配\]/ },
    { lvl: '🟡', label: 'TX锁超时强制释放',        re: /\[TX锁\] ⚠️/ },
    { lvl: '🟡', label: '拿不到普通锁跳轮',        re: /等待60秒后仍无法获取普通锁/ },
    { lvl: '🟡', label: '部署暂停提醒中',          re: /自动部署仍暂停中/ },
    { lvl: '🟡', label: '钱包 deadzone 自愈',      re: /\[异常检测\] 钱包连接异常/ },
    { lvl: '🟡', label: '错误界面自愈',            re: /检测到错误界面/ },
    { lvl: '🟡', label: '页面检测触发刷新',        re: /\[页面检测\] 执行刷新/ },
    { lvl: '🟡', label: 'Party 按钮缺失',          re: /未找到 Party 按钮/ },
    { lvl: '🟡', label: '小账户提示（凑批不适用）', re: /\[小账户提示\]/ },
    { lvl: '🟡', label: '步长 DOM 读取失败',       re: /DOM 步长读取失败|DOM步长读取失败/ },
    { lvl: '🟡', label: 'Respec 药水不足',         re: /Respec Potion 不足/ },
    { lvl: '🟡', label: 'Respec 药水查询失败',     re: /获取 Respec Potion 数量失败/ },
    { lvl: '🟡', label: '升级等锁超时放弃',        re: /等待锁释放超时/ },
    { lvl: '🟡', label: '杀手扫描失败/超时',       re: /\[杀手扫描\] 失败|游戏 API 未就绪|等待游戏 API 超时|\[杀手扫描\] localStorage 写入失败/ },
    { lvl: '🟡', label: '哨兵：发现超强新敌',      re: /🚨 哨兵：发现/ },
    { lvl: '🟡', label: 'XP 喂食失败',             re: /❌ 喂食失败：Kami #/ },
    { lvl: '🟡', label: '持有列表退化不过滤',      re: /获取账户持有列表失败/ },
    { lvl: '🟡', label: 'DB 写回 localStorage 失败', re: /写回 localStorage 失败/ },
    { lvl: '🟡', label: '数据库备份失败',          re: /\[备份失败\]/ },
  ];
  // ── v3 闭环层：开始→终态配对（开了头没收尾 = 流程中途挂死）──
  const __HEALTH_PAIRS = [
    { name: '紧急停采闭环',  lvl: '🔴', winMin: 10, start: /\[紧急停采\] 开始/, end: /\[紧急停采\] 完成|没有需要停采的kami|预检后无需停采/, hint: '开始后无终态——流程中途崩溃' },
    { name: '一键停采闭环',  lvl: '🔴', winMin: 10, start: /\[一键停采\] 开始停采/, end: /\[一键停采\] 完成|没有 HARVESTING 状态|\[一键停采\] 异常|当前地块未知/, hint: '一键停采无终态' },
    { name: '转移停采闭环',  lvl: '🔴', winMin: 10, start: /\[转移停采\] 准备停采/, end: /\[转移停采\] 完成|\[转移停采\] 异常|辅助脚本未加载|无法识别 majority/, hint: '转移停采无终态' },
    { name: '部署计划→成交', lvl: '🔴', winMin: 10, start: /笔\(API\)\] 计划 /, end: /笔\(API\)\] 成功 |\[批量部署\/API失败\]|全部预检失败|紧急锁存在，跳过DOM兜底部署|检测到紧急锁，中断部署|等待紧急锁释放超时/, hint: '部署计划已发但无成交/失败/让路回报——部署链路断' },
    { name: '死亡→复活联动', lvl: '🔴', winMin: 5,  start: /个 Kami 死亡/, end: /立即触发批量复活|批量复活 \d+ 只|触发复活异常/, hint: '发现死亡但复活未被触发' },
    { name: '警报→停采联动', lvl: '🔴', winMin: 5,  start: /\[同房间警报\]|\[邻居预警\]/, end: /⚡ 触发紧急停采|未找到 emergencyStopHarvest|\[紧急停采\] 开始/, hint: '杀手警报后紧急停采未跟上' },
    { name: '杀手扫描闭环',  lvl: '🟡', winMin: 10, start: /自动全网扫描|开始扫描（预计/, end: /全网最强杀手扫描完成|\[杀手扫描\] 失败|游戏 API 未就绪/, hint: '扫描启动后挂死（正常 20~60 秒）' },
    { name: '升级复查轮闭环', lvl: '🟡', winMin: 20, start: /再检查一遍是否有遗漏/, end: /一键升级 \+ 技能分配 全部完成|所有 RESTING Kami 均已/, hint: '升级复查轮悬空' },
    { name: '技能重置闭环',  lvl: '🟡', winMin: 10, start: /正在重置 #/, end: /技能重置成功|❌ 重置技能失败/, hint: '重置 tx 卡死（药水可能已扣）' },
    { name: 'XP合成闭环',    lvl: '🟡', winMin: 10, start: /开始合成 Greater XP Potion/, end: /成功合成 Greater XP Potion|❌ 合成失败/, hint: '合成开始后无结果' },
  ];
  // ── v3 状态层：window/localStorage/DOM 直读检查（每个函数返回问题数组）──
  const __HEALTH_STATES = [
    function lockZombie(ctx) {
      const out = [], e = window.__txEmergencyLock, n = window.__txNormalLock;
      if (e?.since && ctx.now - e.since > 10 * 60000) out.push({ lvl: '🔴', msg: `紧急锁僵尸：已持有 ${((ctx.now - e.since) / 60000).toFixed(0)} 分钟未自愈——全部 tx 被卡` });
      if (n?.since && ctx.now - n.since > 8 * 60000) out.push({ lvl: '🔴', msg: `普通锁僵尸：[${n.script || '?'}/${n.operation || '?'}] 已持锁 ${((ctx.now - n.since) / 60000).toFixed(0)} 分钟` });
      return out;
    },
    function stuckFlags(ctx) {
      const out = [], p = ctx.prev;
      if (p && ctx.now - p.at >= 15 * 60000) {
        if (p.emg && window.__emergencyStopRunning) out.push({ lvl: '🔴', msg: '__emergencyStopRunning 连续两次自检为 true——停采互斥旗卡死，三个停采命令全被锁' });
        if (p.op && window.__kamiOperationInProgress) out.push({ lvl: '🔴', msg: '__kamiOperationInProgress 连续两次自检为 true——操作标志卡死，会拖延 45 分钟强制刷新' });
        if (p.bufLen != null && (window.__kamiLogBuffer || []).length === p.bufLen && typeof window.stopCurrentRoom === 'function')
          out.push({ lvl: '🔴', msg: `日志缓冲 ${((ctx.now - p.at) / 60000).toFixed(0)} 分钟零增长——log 管道停滞或页面被系统挂起` });
      }
      return out;
    },
    function modeAndKillerFlags(ctx) {
      const out = [];
      const ls = localStorage.getItem('kami_mode');
      if (window.__kamiMode && ls && window.__kamiMode !== ls) out.push({ lvl: '🟡', msg: `停采模式内外不一致（内存 ${window.__kamiMode} / localStorage ${ls}）——切换后未刷新页面，新线未生效` });
      if (window.__killerDetected === true && (!window.__lastKillerTime || ctx.now - window.__lastKillerTime > 25 * 60000))
        out.push({ lvl: '🟡', msg: '__killerDetected 残留 true 超 25 分钟——安全期解除逻辑没跑，停采线被长期锁在安全档' });
      return out;
    },
    function killerMonitorChecks(ctx) {
      const out = [];
      if (typeof window.startKillerMonitor !== 'function') return out;   // 监控脚本不在场，不检查
      const list = window.__killerWatchList || [];
      if (!list.length) out.push({ lvl: '🔴', msg: '杀手监控名单为空——监控空转零保护，请往 KILLER_KAMI_INDEXES 填入编号' });
      else if (ctx.pageAgeMin > 6) {
        const mapped = Object.keys(window.__killerPlayerMap || {}).length + (window.__killerSelfOwned || []).length;
        if (!mapped) out.push({ lvl: '🔴', msg: `杀手映射为空（名单 ${list.length} 只全部反查失败）——监控实质失明` });
      }
      for (const i of window.__killerSelfOwned || []) {
        if (!(window.MY_KILLER_KAMIS instanceof Set) || !window.MY_KILLER_KAMIS.has(i)) {
          out.push({ lvl: '🟡', msg: `自家杀手 #${i} 未注册进 MY_KILLER_KAMIS——核心/辅助可能误部署/误洗点作战中的杀手` });
          break;
        }
      }
      if (ctx.pageAgeMin > 5 && typeof window.emergencyStopHarvest !== 'function')
        out.push({ lvl: '🔴', msg: '核心 emergencyStopHarvest 缺失——下次杀手警报只能告警、无法自动停采' });
      try {
        const act = JSON.parse(localStorage.getItem('kami_killer_activity') || 'null');
        const ats = act ? Object.values(act).map(x => x.at).filter(Boolean) : [];
        if (list.length && ats.length && ats.every(a => ctx.now / 1000 - a > 900))
          out.push({ lvl: '🟡', msg: '杀手活跃度快照全部超 15 分钟未刷新——轮询死或查询全败' });
      } catch (e) {}
      return out;
    },
    function dbQuality(ctx) {
      const out = [];
      // 混装提示：数据库脚本在运行（rebuildKamiCoreDb 已挂载）但缓冲里没有它的日志 = 旧版未升级
      if (typeof window.rebuildKamiCoreDb === 'function' && ctx.pageAgeMin > 5
          && !(window.__kamiLogBuffer || []).some(l => l.includes('[精简数据脚本]')))
        out.push({ lvl: '🟡', msg: '精简数据库脚本在运行但日志未入共享缓冲——请升级到 ≥1.1.7/1.1.12，否则构建失败对看板不可见' });
      // 构建失败面包屑（由精简数据库脚本写入，跨刷新存活）——库缺失/未建成时更要报，故放在最前
      try {
        const meta = JSON.parse(localStorage.getItem('kami_core_db_meta') || 'null');
        const fail = JSON.parse(localStorage.getItem('kami_db_last_fail') || 'null');
        if (fail?.at && (!meta?.builtAt || fail.at > meta.builtAt) && Date.now() - fail.at < 7 * 86400000)
          out.push({ lvl: '🟡', msg: `精简数据库上次运行失败（${fail.stage || '未知阶段'}，${((Date.now() - fail.at) / 3600000).toFixed(1)} 小时前）——当前库可能是旧快照` });
      } catch (e) {}
      let db = null;
      try { db = JSON.parse(localStorage.getItem('kami_core_db') || 'null'); }
      catch (e) { out.push({ lvl: '🔴', msg: 'kami_core_db 无法 JSON 解析——数据地基损坏，请重建（rebuildKamiCoreDb）' }); return out; }
      if (!Array.isArray(db)) db = Array.isArray(window.kami_core_db) ? window.kami_core_db : null;   // 内存兜底
      if (!Array.isArray(db) || !db.length) return out;   // 空库已由不变量层报
      const degraded = db.filter(x => x.harmony == null).length;
      if (degraded / db.length > 0.2) out.push({ lvl: '🔴', msg: `db 降级记录 ${degraded}/${db.length}（>20%）——构建期接口大面积故障，建议重建` });
      else if (degraded > 0) out.push({ lvl: '🟡', msg: `db 有 ${degraded} 条降级记录（关键字段为 null）` });
      const noLT = db.filter(x => x.LT == null).length;
      if (noLT > degraded) out.push({ lvl: '🟡', msg: `db 有 ${noLT} 条记录缺 LT——对应 kami 无精确停采线保护` });
      const hi = db.filter(x => typeof x.LT === 'number' && x.LT > 65);
      if (hi.length) out.push({ lvl: '🟡', msg: `清算线 >65% 的 kami 共 ${hi.length} 只（如 ${hi.slice(0, 5).map(x => '#' + x.index + '=' + x.LT.toFixed(0) + '%').join(' ')}）——建议优先升级` });
      return out;
    },
    function predatorArchive(ctx) {
      const out = [];
      try {
        const tp = JSON.parse(localStorage.getItem('kami_top_predators') || 'null');
        if (tp?.buckets) {
          const empty = Object.entries(tp.buckets).filter(([, v]) => !v || !v.length).map(([k]) => k);
          if (empty.length) out.push({ lvl: '🟡', msg: `杀手档案缺桶：${empty.join('/')}——该手型清算线会系统性偏低，建议重扫` });
          if (typeof getEffectivePredators === 'function' && getEffectivePredators()?.source === '内置默认' && ctx.pageAgeMin > 10)
            out.push({ lvl: '🟡', msg: 'localStorage 有杀手档案但生效的是内置默认——档案解析疑似失败' });
        }
      } catch (e) {}
      return out;
    },
    function ltCorrectness(ctx) {
      const out = [];
      if (typeof computePreciseLT !== 'function' || typeof computePreciseLTForRecord !== 'function') return out;
      // ① 公式定点自检：固定输入 → 解析期望值（纯数学常量，与威胁档案无关）。
      //    任一不过 = 公式/亲和表/CDF 代码被改动或损坏 → 全库清算线不可信
      const vec = [
        [{ vio: 41, hand: 'SCRAP',  ats: 0.4, atr: 0.5 }, { harm: 41, body: 'NORMAL', dtr: 0, dts: 0 }, 70],
        [{ vio: 41, hand: 'NORMAL', ats: 0,   atr: 0   }, { harm: 41, body: 'NORMAL', dtr: 0, dts: 0 }, 24],
        [{ vio: 41, hand: 'EERIE',  ats: 0,   atr: 0   }, { harm: 41, body: 'SCRAP',  dtr: 0, dts: 0 }, 30],
        [{ vio: 41, hand: 'EERIE',  ats: 0,   atr: 0   }, { harm: 41, body: 'INSECT', dtr: 0, dts: 0 }, 10],
        [{ vio: 41, hand: 'NORMAL', ats: 1,   atr: 0   }, { harm: 41, body: 'SCRAP',  dtr: 0, dts: 0 }, 100],
      ];
      for (const [atk, def, want] of vec) {
        const got = computePreciseLT(atk, def);
        if (!(Math.abs(got - want) <= 0.05)) {
          out.push({ lvl: '🔴', msg: `清算线公式定点自检未过：${atk.hand}攻/${def.body}体 期望 ${want}% 实得 ${Number(got).toFixed(2)}%——公式代码疑似被改动，全库清算线不可信` });
          break;
        }
      }
      // ②③④ 依赖启动重算已跑过（API 就绪 +90s 内 refreshPreciseLT/扫描完成），给 10 分钟宽限
      if (ctx.pageAgeMin <= 10) return out;
      const db = window.kami_core_db || [];
      let mismatch = 0, range = 0, lthpBad = 0, sample = '';
      for (const rec of db) {
        if (typeof rec.LT !== 'number') continue;
        if (rec.LT < 0 || rec.LT > 100) range++;
        const r = computePreciseLTForRecord(rec.harmony, rec.body, rec.ratio, rec.shift, rec.maxhp);
        if (r.LT != null) {
          if (Math.abs(r.LT - rec.LT) > 0.05) { mismatch++; if (!sample) sample = `#${rec.index} 库存 ${rec.LT}% vs 现算 ${r.LT}%`; }
          if (typeof rec.LTHP === 'number' && typeof rec.maxhp === 'number' && Math.abs(rec.LTHP - rec.LT / 100 * rec.maxhp) > 0.5) lthpBad++;
        }
      }
      const n = db.filter(x => typeof x.LT === 'number').length;
      if (range) out.push({ lvl: '🔴', msg: `db 有 ${range} 条清算线超出 0~100 值域——写库逻辑有问题` });
      if (mismatch) out.push({ lvl: mismatch * 2 > n ? '🔴' : '🟡', msg: `db 存的清算线与现算值不一致 ${mismatch}/${n} 条（如 ${sample}）——少量=新增 kami 待整点重算属正常；大量/过半=refreshPreciseLT 没在跑` });
      if (lthpBad) out.push({ lvl: '🟡', msg: `db 有 ${lthpBad} 条 LTHP 与 LT×maxhp 不自洽——疑似半截写入，可 refreshPreciseLT() 重算` });
      // ④ 保守包络方向：旧公式（满配假想杀手）应是精确值的上界；被突破 = 档案数据超常或计算错了
      if (typeof computeLiquidationLine === 'function' && typeof getEffectivePredators === 'function'
          && !getEffectivePredators().list.some(p => (p.ats || 0) > 0.4)) {
        let above = 0, s2 = '';
        for (const rec of db) {
          if (typeof rec.LT !== 'number') continue;
          const o = computeLiquidationLine(41, rec.harmony, rec.body, rec.ratio, rec.shift, rec.maxhp);
          if (o.LT != null && rec.LT > o.LT + 0.05) { above++; if (!s2) s2 = `#${rec.index} 精确 ${rec.LT}% > 包络 ${o.LT}%`; }
        }
        if (above) out.push({ lvl: '🟡', msg: `有 ${above} 只精确清算线突破旧公式保守包络（如 ${s2}）——正常时旧公式是上界，请核查威胁档案（showTopPredators()/compareLT()）` });
      }
      return out;
    },
    function coreBeaconsPresence(ctx) {
      const out = [], beats = window.__kamiHealthBeats || {};
      if (ctx.pageAgeMin > 20 && !('LT显示' in beats)) out.push({ lvl: '🔴', msg: '__kamiHealthBeats 缺 LT显示 埋点——辅助脚本自身定时器层疑似半死' });
      if (ctx.pageAgeMin > 15 && typeof window.stopCurrentRoom === 'function' && ('主循环' in beats)) {
        if (!('XP流程' in beats)) out.push({ lvl: '🟡', msg: 'XP 药水总控流程本页未启动（启动序列断链？需核心 ≥1.1.7/3.3.13 埋点，若未升级请同步升级）' });
        if (!('拾荒' in beats)) out.push({ lvl: '🟡', msg: '自动拾荒本页未运行（需核心 ≥1.1.7/3.3.13 埋点）' });
      }
      return out;
    },
    function miscStates(ctx) {
      const out = [];
      if ((window.__stopBlockedKamis?.size || 0) + (window.__blockedKamiIds?.size || 0) > 0)
        out.push({ lvl: '🟡', msg: `黑名单中：停采 ${window.__stopBlockedKamis?.size || 0} 只 / 部署 ${window.__blockedKamiIds?.size || 0} 只（30 分钟自动解封；showStopBlockedKamis()/showBlockedKamis() 查详情）` });
      if (window.__reviveSentAt && !(window.__reviveSentAt instanceof Map))
        out.push({ lvl: '🟡', msg: '__reviveSentAt 类型异常（非 Map）——复活三路防重发互认失效' });
      try { JSON.parse(localStorage.getItem('kami_xp_potion_fed') || '[]'); }
      catch (e) { out.push({ lvl: '🟡', msg: 'kami_xp_potion_fed 喂食记录损坏——会重复喂药，可 clearXPPotionFed() 重置' }); }
      if (Number(localStorage.getItem('kami_reload_count') || 0) >= 1 && ctx.pageAgeMin > 10)
        out.push({ lvl: '🔴', msg: `错误重载计数 = ${localStorage.getItem('kami_reload_count')} 持续未复位——启动失败循环中` });
      if ((window.kami_core_db || []).length && !document.getElementById('__aux_lt_style__'))
        out.push({ lvl: '🟡', msg: 'LT 徽标样式节点丢失——清算线徽标全部隐形' });
      try {
        const pend = JSON.parse(localStorage.getItem('kami_gas_pending') || '{}');
        const stale = Object.values(pend).filter(x => x?.startAt && ctx.now - x.startAt > 24 * 3600000).length;
        if (stale) out.push({ lvl: '🟡', msg: `gas 配对表有 ${stale} 条超 24 小时未消费——消耗统计链路断裂` });
      } catch (e) {}
      // 时间戳可解析性：最近 10 行全解析失败 = 全部日志签名指标静默失效
      const tail = (window.__kamiLogBuffer || []).slice(-10);
      if (tail.length >= 5 && tail.every(l => __healthParseTs(l) == null))
        out.push({ lvl: '🟡', msg: '日志时间戳解析失败（时区/格式变更？）——全部日志签名类指标已失明' });
      return out;
    },
  ];
  // 解析日志行首时间戳（四脚本统一 [YYYY-MM-DD HH:mm:ss] 格式，按配置时区写入）
  function __healthParseTs(line) {
    const m = /\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\]/.exec(line);
    if (!m) return null;
    const total = Math.round(Math.abs(__TZ_OFFSET_MS) / 60000), p = n => String(n).padStart(2, '0');
    const suffix = (__TZ_OFFSET_MS >= 0 ? '+' : '-') + p(Math.floor(total / 60)) + ':' + p(total % 60);
    const t = new Date(`${m[1]}T${m[2]}${suffix}`).getTime();
    return Number.isFinite(t) ? t : null;
  }
  // 错误关键词（模块级"带错日志"判定）
  const __HEALTH_ERRWORDS = /❌|失败|超时|revert|异常|不足|mismatch|CALL_EXCEPTION/;
  // v1.1.16: "失败计数=0"统计行白名单——"真失败 0"/"失败0个"/"失败 0"这类纯统计收尾
  // 只是把计数字段命名带了"失败"二字，不是真出错，判定前先剥掉这些片段再复判，
  // 避免"📊 ...真失败 0"、"✅ ...失败0个"被误计入"带错"（真错误行不含这些零计数片段，不受影响）。
  const __HEALTH_ZEROFAIL = /真失败 0(?!\d)|失败0个|失败 0(?!\d)/g;
  // v1.1.19: "条件不满足所以没干"类诊断行白名单——合成/喂食缺材料、体力不够、
  // 步长不足、库存不足等是正常说明（有条件就会继续干），不是真错误，但常带
  // ❌/不足 等词命中 __HEALTH_ERRWORDS，被误计入模块"带错"。剥离 __HEALTH_ZEROFAIL
  // 片段后若整行命中本白名单则不计带错；不影响真错误行（如"Transaction failed"、
  // "真失败 2"）与事件层（__HEALTH_EVENTS，含"复活丝带断货"）判定——两者互不相干。
  // 🔻SYNC→内部版[1.1.20 看板白名单三批]：追加 pendingVerify / gas 不作停成凭据 两模式——
  // 核心 1.1.17 起 gas 判为 full_exec 时打"gas 不作停成凭据 → pendingVerify（本批不计成功/不计失败）"
  // 观察行，含"失败"二字会命中 __HEALTH_ERRWORDS 被误计带错；这是正常观察不是真错误，故并入白名单（不影响真错误行判定）。
  const __HEALTH_COND_SKIP = /需 ≥|缺 \d+|步长不足|库存不足|等恢复或喝体力药|无匹配食物|档位不匹配|pendingVerify|gas 不作停成凭据/;
  let __healthPrev = null;   // 上次自检快照（卡死旗/缓冲增长的两点比较，≥15 分钟才刷新）
  // 汇总健康状态（纯内存计算：日志缓冲近 6000 行 + 埋点 + window/localStorage 直读）
  // v3 四层：心跳层（该跑没跑）→ 事件层（跑出坏事）→ 闭环层（开头没收尾）→ 状态层（数据不对）
  function __healthCollect() {
    const now = Date.now();
    const pageAgeMin = performance.now() / 60000;   // 页面运行分钟数（宽限期基准）
    const lines = (window.__kamiLogBuffer || []).slice(-6000);
    const hourAgo = now - 60 * 60000;
    const lastSeen = {};
    const stats = {};   // 模块名 -> { total, errs, lastErr }（近 60 分钟）
    for (const r of __HEALTH_REGISTRY) if (r.re) stats[r.name] = { total: 0, errs: 0, lastErr: null };
    const evHits = __HEALTH_EVENTS.map(() => ({ count: 0, last: null }));
    const pairSeen = __HEALTH_PAIRS.map(() => ({ start: null, end: null }));
    let deployOk = 0, nonceErr = 0, preciseChanged = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      // 跳过看板自身输出（整块看板含"代码健康看板"表头；全绿行/自检异常带 [健康] 标记）——
      // 否则"最新: 原文"回显会被事件/闭环/心跳正则再次命中，产生自回声误报。
      // 注意不能用裸 🩺 过滤：辅助复活的正常日志也用该 emoji。
      if (line.includes('代码健康看板') || line.includes('[健康]')) continue;
      const ts = __healthParseTs(line);
      for (const r of __HEALTH_REGISTRY) {
        if (r.re && lastSeen[r.name] === undefined && r.re.test(line)) lastSeen[r.name] = ts;
      }
      if (ts == null || ts < hourAgo) continue;   // 以下只统计 60 分钟窗口
      for (const r of __HEALTH_REGISTRY) {
        if (!r.re || !r.re.test(line)) continue;
        const s = stats[r.name]; s.total++;
        // 剥掉"失败计数=0"的统计片段后再复判，避免这类纯统计行被误计入"带错"
        // v1.1.19: 再过一道"条件不满足跳过"白名单——缺材料/缺体力/步长不足/
        // 库存不足是正常诊断说明，不计带错（真错误行不含这些片段，不受影响）
        const __strippedLine = line.replace(__HEALTH_ZEROFAIL, '');
        if (__HEALTH_ERRWORDS.test(__strippedLine) && !__HEALTH_COND_SKIP.test(__strippedLine)) { s.errs++; if (!s.lastErr) s.lastErr = String(line).slice(0, 140); }
      }
      for (let k = 0; k < __HEALTH_EVENTS.length; k++) {
        if (__HEALTH_EVENTS[k].re.test(line)) { evHits[k].count++; if (!evHits[k].last) evHits[k].last = String(line).slice(0, 160); }
      }
      for (let k = 0; k < __HEALTH_PAIRS.length; k++) {
        const p = __HEALTH_PAIRS[k], ps = pairSeen[k];
        if (ps.end == null && p.end.test(line)) ps.end = ts;
        if (ps.start == null && p.start.test(line)) ps.start = ts;
      }
      let m;
      if ((m = /\[批量部署\/第 \d+ 笔\(API\)\] 成功 (\d+) 个/.exec(line))) deployOk += Number(m[1]);
      if (/sequence mismatch|nonce/i.test(line)) nonceErr++;
      if (preciseChanged == null && (m = /\[精确LT\].*更新 (\d+) 条/.exec(line))) preciseChanged = Number(m[1]);
    }
    const beats = window.__kamiHealthBeats || {};
    const red = [], green = [], cond = [];
    for (const r of __HEALTH_REGISTRY) {
      const beatTs = r.type === 'beat' ? beats[r.key] : undefined;
      const ts = beatTs !== undefined ? beatTs : lastSeen[r.name];
      const agoMin = ts ? (now - ts) / 60000 : null;
      if (r.type === 'cond') { cond.push({ r, agoMin }); continue; }
      const silence = agoMin == null ? pageAgeMin : Math.min(agoMin, pageAgeMin);
      (silence > r.expectMin ? red : green).push({ r, agoMin });
    }
    // 事件层汇总
    const events = [];
    for (let k = 0; k < __HEALTH_EVENTS.length; k++) {
      if (evHits[k].count) events.push({ lvl: __HEALTH_EVENTS[k].lvl, msg: `${__HEALTH_EVENTS[k].label} ×${evHits[k].count} —— 最新: ${evHits[k].last}` });
    }
    // 闭环层汇总（最近一次"开始"超窗仍无其后的"终态" = 挂死）
    const pairs = [];
    for (let k = 0; k < __HEALTH_PAIRS.length; k++) {
      const p = __HEALTH_PAIRS[k], ps = pairSeen[k];
      if (ps.start != null && now - ps.start > p.winMin * 60000 && (ps.end == null || ps.end < ps.start))
        pairs.push({ lvl: p.lvl, msg: `${p.name}: ${((now - ps.start) / 60000).toFixed(0)} 分钟前开始、至今无终态 —— ${p.hint}` });
    }
    // 状态层汇总
    const ctx = { now, pageAgeMin, prev: __healthPrev, beats };
    const states = [];
    for (const fn of __HEALTH_STATES) { try { for (const x of fn(ctx) || []) states.push(x); } catch (e) {} }
    if (!__healthPrev || now - __healthPrev.at > 15 * 60000)
      __healthPrev = { at: now, bufLen: (window.__kamiLogBuffer || []).length, emg: !!window.__emergencyStopRunning, op: !!window.__kamiOperationInProgress };
    // 执行正确性规则（"跑了但没干成"）
    const rules = [];
    for (const r of __HEALTH_REGISTRY) {
      if (!r.re) continue;
      const s = stats[r.name];
      if (s.errs >= 3 && s.errs * 2 >= s.total) rules.push({ lvl: '🔴', msg: `${r.name}: 近1小时 ${s.errs}/${s.total} 条日志带错 —— 最新: ${s.lastErr}` });
      else if (s.errs > 0) rules.push({ lvl: '🟡', msg: `${r.name}: 近1小时 ${s.errs} 条带错（共 ${s.total} 条）—— 最新: ${s.lastErr}` });
    }
    if ((stats['批量部署']?.total || 0) > 0 && deployOk === 0) rules.push({ lvl: '🔴', msg: '批量部署: 近1小时有动作但成功 0 只 —— 排查预检/nonce/tile 获取' });
    if (nonceErr >= 3) rules.push({ lvl: '🟡', msg: `nonce 冲突 ${nonceErr} 次 —— 锁纪律被破坏或多开页面抢号？` });
    // 状态不变量（直接校验数据对不对）
    const misc = [];
    try {
      const db = window.kami_core_db || [];
      if (!db.length) misc.push('kami_core_db 为空 —— 请运行精简数据库脚本构建');
      else {
        const lts = db.map(x => x.LT).filter(v => typeof v === 'number').sort((a, b) => a - b);
        const med = lts.length ? lts[Math.floor(lts.length / 2)] : null;
        if (med != null && med > 70) misc.push(`db 清算线中位数 ${med.toFixed(1)}% —— 疑似仍是旧公式刻度，精确化可能未生效（跑 refreshPreciseLT() 核实）`);
      }
    } catch (e) {}
    try {
      const tp = JSON.parse(localStorage.getItem('kami_top_predators') || 'null');
      if (tp?.at && now - tp.at > 8 * 86400000) misc.push(`杀手档案已 ${((now - tp.at) / 86400000).toFixed(1)} 天未更新（周扫调度疑似失效，可手动 scanTopPredators()）`);
    } catch (e) {}
    if (pageAgeMin > 65) misc.push(`页面已连续运行 ${pageAgeMin.toFixed(0)} 分钟未刷新 —— 核心的 45 分钟定时刷新疑似失效`);
    return { red, green, cond, misc, rules, events, pairs, states, stats, deployOk, preciseChanged, pageAgeMin };
  }
  const __healthFmtAgo = m => m == null ? '本次会话内从未' : (m < 1.5 ? '刚刚' : m < 90 ? Math.round(m) + '分钟前' : (m / 60).toFixed(1) + '小时前');
  // 打印健康看板；problemsOnly=true 时全绿只打一行（周期自检用）
  function showHealth(problemsOnly = false) {
    const h = __healthCollect();
    const pick = (arr, lvl) => arr.filter(x => x.lvl === lvl);
    const redAll = [...pick(h.rules, '🔴'), ...pick(h.events, '🔴'), ...pick(h.pairs, '🔴'), ...pick(h.states, '🔴')];
    const yelAll = [...pick(h.rules, '🟡'), ...pick(h.events, '🟡'), ...pick(h.pairs, '🟡'), ...pick(h.states, '🟡')];
    const hasProblem = h.red.length || h.misc.length || redAll.length || yelAll.length;
    if (problemsOnly && !hasProblem) {
      log(`🩺 [健康] ${h.green.length} 个硬心跳正常、近1小时无报错无事件、闭环/状态检查全过（v3，页面运行 ${h.pageAgeMin.toFixed(0)} 分钟）`);
      return;
    }
    const out = [`═══════ 🩺 代码健康看板 v3（页面已运行 ${h.pageAgeMin.toFixed(0)} 分钟）═══════`];
    if (h.red.length || h.misc.length || redAll.length) {
      out.push(`🔴 重点排查（该跑没跑 / 跑了没干成 / 开头没收尾 / 数据不对）：`);
      for (const { r, agoMin } of h.red) out.push(`  ${r.name}: 期望≤${r.expectMin}分钟一次，实际 ${__healthFmtAgo(agoMin)} —— ${r.hint}`);
      for (const x of redAll) out.push(`  ${x.msg}`);
      for (const m of h.misc) out.push(`  ${m}`);
    }
    if (yelAll.length) {
      out.push(`🟡 关注（有错误/告警但未瘫痪）：`);
      for (const x of yelAll) out.push(`  ${x.msg}`);
    }
    // 执行统计（近 60 分钟，逐模块 总数/带错数）
    const active = Object.entries(h.stats).filter(([, s]) => s.total > 0);
    if (active.length) {
      out.push(`📊 近60分钟执行统计：` + active.map(([n, s]) => `${n} ${s.total}条${s.errs ? '(错' + s.errs + ')' : ''}`).join('｜')
        + (h.deployOk ? `｜部署成功 ${h.deployOk} 只` : '')
        + (h.preciseChanged != null ? `｜精确LT上次更新 ${h.preciseChanged} 条` : ''));
    }
    if (h.green.length) out.push(`🟢 正常心跳：` + h.green.map(({ r, agoMin }) => `${r.name} ${__healthFmtAgo(agoMin)}`).join('｜'));
    out.push(`⚪ 条件型模块最后活动（无活动≠故障）：` + h.cond.map(({ r, agoMin }) => `${r.name} ${__healthFmtAgo(agoMin)}`).join('｜'));
    if (!hasProblem) out.push(`✅ 未发现问题`);
    log(out.join('\n'));
  }
  window.showHealth = showHealth;
  // 周期自检：首检延迟 10 分钟（等各模块跑起来），之后每 30 分钟一次。
  // v3：自检本身写埋点 + 异常落日志（修 v2"看板挂了无痕迹"的盲区）
  function __healthTick() {
    (window.__kamiHealthBeats = window.__kamiHealthBeats || {})['健康自检'] = Date.now();
    try { showHealth(true); } catch (e) { try { log(`⚠️ [健康] 自检异常: ${e?.message || e}`); } catch (e2) {} }
  }
  setTimeout(() => {
    __healthTick();
    setInterval(__healthTick, 30 * 60000);
  }, 10 * 60000);


  // ============================================================
  // === 启动后自动执行一次杀手候选扫描（默认参数）===
  // ============================================================
  // ─ 在游戏 API 就绪后延迟 30 秒触发，避开自动升级巡检的 API 高峰
  // ─ 仅启动时跑一次（不重复设定时器，因为出生属性是静态的）
  // ─ 红字横幅提示，避免被淹没
  // ============================================================
  (async function autoScanKillerCandidates() {
    const MAX_WAIT = 5 * 60 * 1000;  // 最多等5分钟
    // 每 5 秒轮询一次游戏 API 是否就绪
    const POLL_MS = 5000;
    const start = Date.now();

    while (Date.now() - start < MAX_WAIT) {
      await delay(POLL_MS);
      // 就绪判定：钱包地址 + kami 查询接口 + 账户查询接口，三者齐备才算就绪
      const hasAddr = !!window.network?.network?.connectedAddress?.value_
                   || !!window.network?.network?.connectedAddress?.value;
      const hasExplorer = !!window.network?.explorer?.kamis?.getByIndex;
      const hasAccounts = !!window.network?.explorer?.accounts?.getByOperator;
      if (hasAddr && hasExplorer && hasAccounts) {
        // 延迟 30 秒，避开自动升级巡检的 API 高峰
        await delay(30 * 1000);
        log(`%c🗡️ ═══════ 自动杀手候选扫描启动（db-first）═══════`,
            'color: red; font-size: 14px; font-weight: bold;');
        log(`%c   按默认阈值 (vio≥23 ∧ harm≥15 ∧ pow≤12) 从 kami_core_db 内存筛选`,
            'color: red;');
        log(`%c   通常几秒完成；db 无 base 字段时会自动降级 API 全扫`,
            'color: red;');
        try {
          await findKillerCandidates();
        } catch (e) {
          log(`%c❌ [自动扫描] 失败: ${e?.message || e}（可手动 findKillerCandidates() 重试）`,
              'color: red; font-weight: bold;');
        }
        return;
      }
    }
    log(`⚠️ [自动扫描] 等待游戏 API 超时（5分钟），可手动运行 findKillerCandidates()`);
  })();

  // ============================================================
  // 【板块：全局命令挂载（自动合成模块）】
  // ------------------------------------------------------------
  // ▍功能：把前文"自动合成"板块的接口与配置对象挂到 window，供控制台
  //   直接调用；并在脚本加载末尾自动启动合成模块。
  // ▍触发时机：脚本加载时执行一次；startAutoCraft() 随挂载自动调用。
  // ▍依赖：autoCraftItems / startAutoCraft / stopAutoCraft /
  //   getStaminaFromDOM / AUTO_CRAFT_CONFIG / CRAFT_PRIORITY
  //   （均定义于前文自动合成板块）。
  // ▍相关控制台命令：
  //   - autoCraft() —— 手动执行一轮合成（即 autoCraftItems）；
  //   - startAutoCraft() / stopAutoCraft() —— 启动 / 停止自动合成；
  //   - getStaminaFromDOM() —— 从页面 DOM 读取当前体力值；
  //   - AUTO_CRAFT_CONFIG / CRAFT_PRIORITY —— 运行时可直接修改的合成
  //     配置对象与优先级清单。
  // ============================================================

  // 暴露接口到全局
  window.autoCraft = autoCraftItems;
  window.startAutoCraft = startAutoCraft;
  window.stopAutoCraft = stopAutoCraft;
  window.getStaminaFromDOM = getStaminaFromDOM;
  window.AUTO_CRAFT_CONFIG = AUTO_CRAFT_CONFIG;
  window.CRAFT_PRIORITY = CRAFT_PRIORITY;

  // 页面加载后自动启动合成模块
  startAutoCraft();

  // ============================================================

})();
