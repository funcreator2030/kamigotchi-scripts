/* eslint-disable no-multi-spaces */
// ==UserScript==
// @name         Kamigotchi精简数据库-公开版 (database)
// @namespace    http://tampermonkey.net/
// @version      1.1.13
// @downloadURL  https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-database.user.js
// @updateURL    https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-database.meta.js
// @homepageURL  https://github.com/funcreator2030/kamigotchi-scripts
// @x-release-date 2026/7/10 12:22:48
// @description  Kamigotchi精简数据库公开版：扫描账户全部kami构建17字段本地数据库(含清算线LT)，构建前自动备份
// @match        https://*.kamigotchi.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                  Kamigotchi 精简数据库脚本 · 公开版 v1.1.13                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  本脚本为整个脚本套件构建"精简数据库"——扫描当前账户的全部 kami，               ║
// ║  把每只 kami 的关键数据压缩成 17 个字段，存入 localStorage.kami_core_db        ║
// ║  并挂到 window.kami_core_db，供其他脚本零 API 成本读取：                       ║
// ║                                                                              ║
// ║   - 核心脚本：部署决策、停采线计算、XP 药水喂食目标筛选                        ║
// ║   - 辅助脚本：升级/技能管理、kamiAnalyze 地块适配分析、杀手候选扫描            ║
// ║                                                                              ║
// ║  ▍17 个字段包括：kami 编号(index)、链上 ID(kamiId)、清算线(LT，即采集中的      ║
// ║    kami 一旦 HP 占比跌破就可能被其他玩家的 kami 清算击杀的那条线)、体型/手型   ║
// ║    亲和属性(body/hand)、harmony/maxhp 等 total 当前总值(随等级/技能变化)，     ║
// ║    以及三个 base 出生原始属性 vioBase/harmBase/powBase(出生即固定、终生不变，  ║
// ║    供辅助脚本 findKillerCandidates() 直接在本地筛选杀手候选)。                 ║
// ║    各字段的确切含义见下方 buildCoreDb 板块说明。                               ║
// ║                                                                              ║
// ║  ▍使用方式：                                                                  ║
// ║   1. 首次安装脚本套件时启用本脚本，打开游戏页面后自动构建一次；                ║
// ║   2. 构建完成后（控制台出现"🎉 构建完成"）建议停用本脚本，避免每次刷新         ║
// ║      都全量重扫；日常的新 kami 增补由核心脚本的 syncKamiDb() 增量自愈完成；    ║
// ║   3. 需要全量重建时（如数据明显异常、更换登录账户后），启用本脚本刷新页面，    ║
// ║      或在控制台调用 rebuildKamiCoreDb()。                                     ║
// ║   4. 每次构建前会把旧库备份到 window.kami_core_db_old，误建可回退。            ║
// ║                                                                              ║
// ║  ▍新手提示（构建过程与故障处理）：                                             ║
// ║   - 一次完整构建约 1~2 分钟：先固定等待 40 秒（最后 10 秒有橙色倒计时），      ║
// ║     然后自动展开 Party（游戏内的 Kami 队伍面板）并切换眼睛图标，最后           ║
// ║     控制台打印"🎉 构建完成"并以表格列出全库；网络慢时耗时更长；                ║
// ║   - 构建失败（控制台出现"❌ [构建失败]"或"[主流程异常]"）时先刷新页面          ║
// ║     重试；仍不行可等页面加载完，在控制台执行 rebuildKamiCoreDb() 重建。        ║
// ║                                                                              ║
// ║  ▍控制台命令：                                                                ║
// ║   rebuildKamiCoreDb()   - 手动全量重建精简数据库                              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// 说明（v1.1.8 起）：本脚本写入的 LT/LTHP 已按"官方精确公式 + 内置默认
// 最强杀手档案"计算；辅助脚本启动后仍会按每周全网扫描的最新档案重算覆盖
// （refreshPreciseLT）——口径相同，构建值与最终生效值随档案新旧略有差异。

(function () {
    'use strict';

    // ============================================================
    // 【板块：日志工具（配置时区时间前缀）】
    // ------------------------------------------------------------
    // ▍功能：提供统一日志函数 log()。每条日志分两行输出：第一行是
    //   「[精简数据脚本][时间]」前缀（按下方时区设置），第二行原样透传日志内容；
    //   分两行打印可以让对象/数组在控制台保持可展开状态，不被模板
    //   字符串串行化。时间戳按配置时区换算（默认浏览器本地），多设备、
    //   跨时区核对运行记录时不会混乱。
    // ▍触发时机：脚本全程使用；IIFE 一进入就先打一条启动提示。
    // ▍依赖：仅浏览器原生 console.log 与 Date，无 DOM / API 依赖。
    // ▍核心流程：1) 取当前时间并加 8 小时偏移；2) 转 ISO 字符串并
    //   截取为 "YYYY-MM-DD HH:mm:ss"；3) 先打前缀行，再打正文。
    // ▍边界与保护：本脚本不包装/劫持 console —— Tampermonkey 注入
    //   脚本在控制台显示的 source link 是注入机制生成的虚拟 URL，
    //   从脚本内部无法改写，包装 console 无收益反而有兼容风险。
    // ▍可调参数：无。
    // ▍相关控制台命令：无（log 为内部函数，不挂载到 window）。
    // ============================================================

    // 【时区设置】（v1.1.3 起）'auto'=自动跟随浏览器本地时区；也可写死数字（小时）：8=UTC+8、-5=UTC-5、5.5=UTC+5:30
    const TZ_OFFSET_HOURS = 'auto';
    const __TZ_OFFSET_MS = (TZ_OFFSET_HOURS === 'auto')
        ? -new Date().getTimezoneOffset() * 60 * 1000
        : Number(TZ_OFFSET_HOURS) * 60 * 60 * 1000;

    // 日志函数：统一「[精简数据脚本][时间]」前缀（按配置时区）
    function log(...args) {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
        .toISOString().replace('T', ' ').substring(0, 19);
        // 写入跨脚本共享日志缓冲（单行 = 前缀+正文，供辅助健康看板特征反查；控制台输出维持两行不变）
        try {
            if (!Array.isArray(window.__kamiLogBuffer)) window.__kamiLogBuffer = [];
            window.__kamiLogBuffer.push(`[精简数据脚本][${beijingTime}] ` + args.join(' '));
        } catch (e) {}
        console.log(`[精简数据脚本][${beijingTime}]`);
        console.log(...args);
    }

    // 脚本启动提示。⚠️ 顺序约束：log() 引用上方的 __TZ_OFFSET_MS（const 不提升，存在
    //   暂时性死区），首次调用必须晚于时区常量定义——曾因放在其前导致脚本启动即崩（v1.1.9 修复）。
    log('%c✅ Kamigotchi精简数据库-公开版 v1.1.13 已经成功启动，等待网页加载完成…', 'font-size:16px;font-weight:bold;color:#fff;background:#2e7d32;padding:3px 10px;border-radius:4px');   // 🔻SYNC→内部版[1.1.12 启动横幅醒目化]

    // ============ [版本检查] 启动时对比 GitHub 最新版本，提示用户是否已更新 ============
    // 🔻SYNC→内部版[1.1.11 版本检查]（内部版无 GitHub 分发，同步时可整块跳过）
    (function versionCheck() {
        const SELF_NAME = '精简数据库';
        const SELF_VERSION = '1.1.13';   // ⚠️ 版本仪式第6处：升版时必须同步改这里
        const META_URL = 'https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-database.meta.js';
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
                // 🔻SYNC→内部版[1.1.13 版本检查降噪]（游戏 SPA 运行时注入 CSP meta 的 connect-src 白名单，raw 外联在游戏页永久失败）
                // fetch 失败绝大多数是游戏页 CSP 拒绝外联 GitHub（属正常，不影响篡改猴自动更新），旧版每次页面加载都打一行=刷屏。
                // 改为 24h 内只提示一次：命中节流窗口则静默；否则打一条并刷新时间戳。
                try {
                    const noteKey = 'kami_vercheck_csp_note_' + SELF_NAME;
                    const last = Number(localStorage.getItem(noteKey) || 0);
                    if (Date.now() - last >= 86400000) {
                        localStorage.setItem(noteKey, String(Date.now()));
                        log(`ℹ️ [版本检查] 游戏页 CSP 限制外联 GitHub，无法在线比对版本（属正常，不影响篡改猴自动更新；手动检查：篡改猴图标→实用工具→检查用户脚本的更新）`);
                    }
                } catch (e2) {
                    log(`ℹ️ [版本检查] 游戏页 CSP 限制外联 GitHub，无法在线比对版本（属正常，不影响篡改猴自动更新；手动检查：篡改猴图标→实用工具→检查用户脚本的更新）`);
                }
            }
        }, 8000);   // 延迟 8s，避开启动拥挤；raw 带 CORS *，页面上下文可直接 fetch
    })();

    // ============================================================
    // 【板块：全局常量与存储 Key】
    // ------------------------------------------------------------
    // ▍功能：集中定义本脚本读写 localStorage 用的 key 与清算线公式
    //   常数，全脚本只此一处，避免魔法字符串散落。
    // ▍触发时机：IIFE 载入时求值一次，全程只读。
    // ▍依赖：localStorage（key 名与套件内核心/辅助脚本约定一致）。
    // ▍核心流程：无（纯常量声明）。
    // ▍边界与保护：CORE_DB_KEY / CORE_DB_OLD_KEY 是整个脚本套件读库
    //   的约定入口，改名会导致核心/辅助脚本全部读不到数据库。
    // ▍可调参数：
    //   - CORE_DB_KEY = 'kami_core_db' — 精简数据库主 key；
    //   - CORE_DB_OLD_KEY = 'kami_core_db_old' — 构建前旧库的备份 key；
    //   - DB_TOP_PREDATORS — 内置"全网最强杀手"默认威胁档案（四手型），
    //     清算线 = 对全部档案取最坏对位（见清算线计算板块）。
    //     与辅助脚本 TOP_PREDATORS_DEFAULT 同值：改动必须两处同步。
    // ▍相关控制台命令：无。
    // ============================================================
    const CORE_DB_KEY = 'kami_core_db';         // 数据库主 key（套件约定，勿改名）
    const CORE_DB_OLD_KEY = 'kami_core_db_old'; // 构建前旧库备份 key
    // 内置默认威胁档案（与辅助脚本 TOP_PREDATORS_DEFAULT 同值同序，改动必须两处同步）。
    // 取历史实测最强、方向故意保守：个别杀手事后易主/消失只会让线偏高、不会偏低。
    const DB_TOP_PREDATORS = [
        { hand: 'EERIE',  vio: 36, ats: 0.29, atr: 0.50 },   // 维度包络：vio/atr 取 0707 #11224、ats 取 0708 #4277（非真实个体，对已知现实恒保守）
        { hand: 'SCRAP',  vio: 41, ats: 0.30, atr: 0.50 },
        { hand: 'INSECT', vio: 36, ats: 0.26, atr: 0.50 },
        { hand: 'NORMAL', vio: 34, ats: 0.30, atr: 0.50 },
    ];

    // ============================================================
    // 【板块：通用工具（sleep / jitter / 启动固定等待）】
    // ------------------------------------------------------------
    // ▍功能：异步等待、随机抖动取值，以及脚本启动后的固定等待 +
    //   倒计时提示。
    // ▍触发时机：sleep / jitter 全程复用；fixedWaitWithCountdown 仅在
    //   main() 开头调用一次，等待游戏前端完成首屏加载。
    // ▍依赖：无 DOM / API 依赖，纯定时器。
    // ▍核心流程（fixedWaitWithCountdown）：
    //   1) 总时长折算成整秒，逐秒 sleep 循环；
    //   2) 最后 10 秒每秒打印一条橙色倒计时（方便肉眼确认脚本存活）；
    //   3) 等待结束打印提示，交回主流程去展开 Party 列表。
    // ▍边界与保护：
    //   - 等待期间完全不触碰 DOM，避免页面半加载状态下误操作；
    //   - jitter 给各类等待/请求加随机偏移，多账户/多标签页不会在
    //     同一时刻集中发请求（错峰，降低被限流的概率）。
    // ▍可调参数：
    //   - totalMs = 40000（默认）— 固定等待时长；main() 实际传入
    //     40000 + jitter(0, 2000)。调小启动更快，但页面没加载完就
    //     开扫会找不到按钮/接口；网速慢的环境建议调大；
    //   - countdownSec = 10 — 倒计时提示时长，仅影响日志观感。
    // ▍相关控制台命令：无。
    // ============================================================
    const sleep = (ms) => new Promise(r => setTimeout(r, ms)); // 异步等待 ms 毫秒
    const jitter = (minMs, maxMs) => Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs; // [min,max] 随机整数，错峰用

    // 固定等待 + 最后10秒倒计时
    async function fixedWaitWithCountdown(totalMs = 40000) {
        const totalSec = Math.floor(totalMs / 1000);
        const countdownSec = 10; // 最后 10 秒逐秒打印倒计时
        log(`⏳ 启动后固定等待 ${totalSec} 秒以确保页面加载...`);
        for (let i = 0; i < totalSec; i++) {
            if (totalSec - i <= countdownSec) { // 进入最后倒计时区间才刷屏提示
                const remain = totalSec - i;
                console.log('%c[精简数据库脚本] 页面加载中... 剩余 ' + remain + ' 秒', 'color: orange; font-weight: bold;');
            }
            await sleep(1000);
        }
        log('✅ 固定等待结束，准备尝试打开 Party 列表...');
    }

    // ============================================================
    // 【板块：模拟鼠标点击】
    // ------------------------------------------------------------
    // ▍功能：向目标元素按真实用户的时序依次派发 mouseover →
    //   mousedown → mouseup → click → mouseout 五个鼠标事件。
    // ▍触发时机：点击 Party 加载按钮、点击眼睛按钮时调用。
    // ▍依赖：目标 DOM 元素（由调用方查询后传入）。
    // ▍核心流程：以 delayMs 为基准错开时间片：
    //   1) +50ms  mouseover（悬停，先触发 hover 态）；
    //   2) +150ms mousedown（按下）；
    //   3) +200ms mouseup（抬起）；
    //   4) +300ms click + mouseout（点完把"鼠标"移回 body）。
    // ▍边界与保护：
    //   - element 为空直接返回，不抛错；
    //   - 游戏前端（React 类框架）校验的是完整事件序列，只派发单个
    //     click 往往不生效，因此必须模拟全套时序；
    //   - 所有事件均设 bubbles: true，保证框架挂在上层容器的事件
    //     委托监听也能收到。
    // ▍可调参数：delayMs = 0（默认）— 整体延迟基准；50/150/200/300ms
    //   的间隔模拟人手节奏，间隔改得太小可能被前端忽略。
    // ▍相关控制台命令：无。
    // ============================================================
    function simulateClick(element, delayMs = 0) {
        if (!element) return; // 目标不存在直接放弃，不抛错
        setTimeout(() => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), delayMs + 50);  // +50ms 悬停
        setTimeout(() => element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })), delayMs + 150); // +150ms 按下
        setTimeout(() => element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })), delayMs + 200);   // +200ms 抬起
        setTimeout(() => { // +300ms 点击 + 把"鼠标"移出到 body
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }));
        }, delayMs + 300);
    }

    // ============================================================
    // 【板块：Party 眼睛状态检测与切换（eye-half）】
    // ------------------------------------------------------------
    // ▍功能：读取并把 Party 面板上的"眼睛"按钮切换到 eye-half 状态。
    //   眼睛控制 Party 列表的展示密度：eye-half 下每只 Kami 以完整
    //   卡片渲染，DOM 里才有全部卡片可供检测；其他状态下列表折叠或
    //   精简，DOM 扫不全，无法据此确认页面渲染完整。
    // ▍触发时机：startSequence() 点击加载按钮 3 秒后调用。
    // ▍依赖：
    //   - DOM：#party button img[src*="eye-"] —— 眼睛图标，src 含
    //     eye-open / eye-half / eye-closed 三种状态之一；
    //   - 查询严格限定在 #party 容器内，避免误抓页面其他眼睛图标。
    // ▍核心流程：
    //   1) getEyeState() 按图标 src 判定当前状态（open/half/closed，
    //      找不到图标返回 null）；
    //   2) waitForEyeHalf() 轮询：状态已是 half → 成功返回 true；
    //   3) 否则从图标反查所属按钮并模拟点击（每次点击后等 1 秒让
    //      状态落定）；眼睛状态按固定顺序循环，多点几次必经 half；
    //   4) 状态每次变化都打日志，便于回看切换轨迹。
    // ▍边界与保护：
    //   - 找不到眼睛按钮时不点击、只等待（按钮可能尚未渲染出来）；
    //   - 超过 3 分钟仍未切到 half → location.reload() 刷新页面自救，
    //     防止页面卡死后脚本空转挂机。
    // ▍可调参数：
    //   - baseWaitTime = 3 * 60 * 1000 — 切换总超时（3 分钟）；调小
    //     刷新更激进，调大更能容忍慢网络；
    //   - checkInterval = 2000 — 轮询间隔 2 秒；调小切换更快但点击更密；
    //   - stateDelay = 1000 — 每次点击后等 1 秒再查，给前端反应时间。
    // ▍相关控制台命令：无。
    // ============================================================

    // 读取眼睛图标当前状态：open / half / closed；找不到图标返回 null
    function getEyeState() {
        const eyeImg = document.querySelector('#party button img[src*="eye-"]');
        if (!eyeImg) return null;
        const src = eyeImg.src || '';
        if (src.includes('eye-open'))   return 'open';
        if (src.includes('eye-half'))   return 'half';
        if (src.includes('eye-closed')) return 'closed';
        return null;
    }

    async function waitForEyeHalf() {
        const baseWaitTime = 3 * 60 * 1000;  // 最多 3 分钟
        const maxWaitTime  = baseWaitTime;   // 总超时直接取基准值
        const checkInterval = 2000;          // 轮询间隔 2 秒
        const stateDelay    = 1000;          // 每次点击后等 1 秒让状态落定
        const startTime = Date.now();
        let lastState = null;

        console.log('🕒 等待眼睛状态变为 eye-half（最多 3 分钟）...');

        while (true) {
            const elapsed = Date.now() - startTime;
            const state   = getEyeState();

            if (state !== lastState) {
                console.log('👁️ 状态变更:', (lastState ?? '初始'), '→', state);
                lastState = state;
            }

            if (state === 'half') {
                console.log('✅ 成功切换到 eye-half 状态，开始执行自动逻辑...');
                log('✅ [启动序列] 眼睛已切到 eye-half，进入构建流程');   // 落缓冲（裸 console 不进缓冲）
                return true;
            }

            const eyeBtn = document.querySelector('#party button img[src*="eye-"]')?.closest('button'); // 从图标反查所属按钮
            if (eyeBtn) {
                console.log('🔄 尝试点击眼睛按钮切换状态...');
                simulateClick(eyeBtn, 300);
                await sleep(stateDelay);
            } else {
                console.log('⚠️ 找不到眼睛按钮，等待中...');
            }

            if (elapsed >= maxWaitTime) { // 3 分钟兜底：刷新页面自救
                console.log('🧨 超时仍未进入 eye-half 状态，触发刷新防止挂机异常...');
                try { localStorage.setItem('kami_db_last_fail', JSON.stringify({ at: Date.now(), stage: '眼睛切换超时(已刷新自救)' })); } catch (e2) {}   // 面包屑跨刷新存活
                location.reload();
                return false;
            }

            await sleep(checkInterval);
        }
    }

    // ============================================================
    // 【板块：启动序列（点开 Party → 切眼睛到 half）】
    // ------------------------------------------------------------
    // ▍功能：等待并点击 Party 加载按钮（把 Party 面板与 Kami 列表
    //   加载出来），随后调用 waitForEyeHalf() 把列表切到完整渲染态。
    // ▍触发时机：main() 中固定等待结束后调用。
    // ▍依赖：DOM：#party_button button —— Party 加载按钮。
    // ▍核心流程：
    //   1) 每 2 秒查询一次加载按钮是否出现；
    //   2) 出现 → 模拟点击（延迟基准 500ms）→ 固定等 3 秒让眼睛
    //      按钮渲染出来 → 进入 waitForEyeHalf()；
    //   3) 眼睛切换成功返回 true；失败（内部已触发刷新）返回 false。
    // ▍边界与保护：
    //   - 超过 5 分钟仍无加载按钮 → location.reload() 刷新自救；
    //   - waitForEyeHalf 失败时本函数直接返回 false，由上层决定是否
    //     继续（main 中该失败不阻塞后续 API 构建）。
    // ▍可调参数：
    //   - maxWaitTime = 5 * 60 * 1000 — 找加载按钮的总超时（5 分钟）；
    //   - clickInterval = 2000 — 查询按钮的轮询间隔 2 秒；
    //   - sleep(3000) — 点击后等眼睛按钮渲染的固定 3 秒，网慢可调大。
    // ▍相关控制台命令：无。
    // ============================================================
    async function startSequence() {
        const maxWaitTime   = 5 * 60 * 1000;  // 最多等待 5 分钟找加载按钮
        const clickInterval = 2000;           // 轮询间隔 2 秒
        const startTime = Date.now();

        console.log('🕒 开始等待加载按钮出现（最多等待 5 分钟）...');

        while (true) {
            const loadBtn = document.querySelector('#party_button button');

            if (loadBtn) {
                console.log('📦 检测到加载按钮，点击...');
                log('📦 [启动序列] 已点击 Party 加载按钮');   // 落缓冲（裸 console 不进缓冲）
                simulateClick(loadBtn, 500);
                await sleep(3000); // 等 3 秒让眼睛按钮渲染
                const success = await waitForEyeHalf();
                if (success) {
                    console.log('✅ Party/眼睛流程完成，即将构建精简数据库…');
                    return true;
                } else {
                    console.log('⚠️ waitForEyeHalf 失败，已触发刷新，终止当前流程。');
                    return false;
                }
            } else {
                const elapsed = Date.now() - startTime;
                if (elapsed >= maxWaitTime) {
                    console.log('🧨 超过 5 分钟仍未检测到加载按钮，尝试刷新。');
                    try { localStorage.setItem('kami_db_last_fail', JSON.stringify({ at: Date.now(), stage: '加载按钮超时(已刷新自救)' })); } catch (e2) {}   // 面包屑跨刷新存活
                    location.reload();
                    return false;
                }
                await sleep(clickInterval);
            }
        }
    }

    // ============================================================
    // 【板块：Kami 卡片渲染检测（非致命）】
    // ------------------------------------------------------------
    // ▍功能：轮询 Party 列表的固定 DOM 路径，确认页面至少渲染出一张
    //   Kami 卡片，作为"前端已把数据画到页面上"的就绪信号。
    // ▍触发时机：startSequence() 之后、等待链上 API 之前。
    // ▍依赖：DOM 选择器（严格按 Party 面板层级定位卡片图片）：
    //   #party > div > div:nth-of-type(3) > div:nth-of-type(2)
    //     > div:nth-of-type(2) img[src*="/kami/"]
    //   选择器写死层级是为了只统计 Party 列表内的卡片，避免把页面
    //   其他位置出现的 kami 图片误计入。
    // ▍核心流程：1) 每 1~1.5 秒（含随机抖动）查询一次；2) 数到 ≥1
    //   张即返回 true 并打日志；3) 超时返回 false 并告警。
    // ▍边界与保护：
    //   - 本步骤"非致命"：返回 false 不会终止流程，后续构建完全以
    //     链上 API 返回为准，DOM 只用于等渲染与数量对照提示；
    //   - 轮询间隔加 0~500ms 随机抖动，避免固定节奏查询。
    // ▍可调参数：maxWaitMs = 60000 — 渲染等待上限 60 秒；若页面改版
    //   导致选择器失配，会白等这一分钟后照常走 API，可按需调小。
    // ▍相关控制台命令：无。
    // ============================================================
    async function waitForKamiList(maxWaitMs = 60000) {
        const start = Date.now();
        // 严格限定 Party 列表层级，防止误计页面其他位置的 kami 图片
        const selector = '#party > div > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) img[src*="/kami/"]';
        while (Date.now() - start < maxWaitMs) {
            const imgs = document.querySelectorAll(selector);
            if (imgs.length > 0) {
                log(`✅ 页面已渲染 Kami 卡片（DOM 检测到 ${imgs.length} 张）`);
                return true;
            }
            await sleep(1000 + Math.random() * 500); // 1~1.5 秒随机轮询
        }
        console.warn('[提示] 等待超时：DOM 未检测到 Kami 列表，将直接走 API 构建。');
        return false;
    }

    // ============================================================
    // 【板块：链上 API 就绪检测】
    // ------------------------------------------------------------
    // ▍功能：等待游戏前端暴露的 window.network 对象及其 explorer
    //   查询接口全部就绪。explorer 是游戏前端内置的链上数据查询
    //   接口，读取的是前端已同步到本地的链上数据副本，查询本身
    //   不发交易、不耗 gas。后续构建的所有数据都从这里读，因此
    //   必须四项齐备才放行。
    // ▍触发时机：DOM 渲染检测之后、buildCoreDb() 之前。
    // ▍依赖（缺一不可，全部挂在 window.network 上）：
    //   - network.network.connectedAddress.value_ — 当前 operator
    //     地址（浏览器内代表当前登录账户执行操作的钱包地址）；
    //   - network.explorer.accounts.getByOperator — 按地址查账户及
    //     名下 kami 概要列表；
    //   - network.explorer.kamis.getByIndex — 按 index 查单只 kami 详情。
    // ▍核心流程：每 150ms 检查一次上述条件，全部就绪立即返回。
    // ▍边界与保护：超过 30 秒仍未就绪 → 抛出 'network/explorer
    //   未就绪'，由 main() 捕获并打印，本轮构建终止（可刷新页面或
    //   等就绪后手动 rebuildKamiCoreDb() 重试）。
    // ▍可调参数：maxWaitMs = 30000 — 就绪等待上限 30 秒；轮询间隔
    //   150ms 较密，保证接口一就绪立刻进入构建。
    // ▍相关控制台命令：无。
    // ============================================================
    async function waitForReady(maxWaitMs = 30000) {
        const start = Date.now();
        while (
            !(window.network
              && window.network.network?.connectedAddress?.value_
              && window.network.explorer?.accounts?.getByOperator
              && window.network.explorer?.kamis?.getByIndex)
            && Date.now() - start < maxWaitMs
        ) {
            await sleep(150); // 150ms 密集轮询，就绪即走
        }
        if (!(window.network && window.network.explorer)) { // 超时兜底：仍未就绪则抛错终止
            throw new Error('network/explorer 未就绪');
        }
    }

    // ============================================================
    // 【板块：清算线计算（精确公式 + 内置最强杀手档案）】
    // ------------------------------------------------------------
    // ▍功能：按游戏合约的官方精确公式计算一只 Kami 的清算线：
    //     清算线% = Φ(ln(攻Vio/守Harm)) × 0.4 × (1 + 亲和 + 攻ATR − 守DTR)
    //               + (攻ATS − 守DTS)      （截断到 [0,1]）
    //   威胁参数来自常量板块的 DB_TOP_PREDATORS 内置默认档案（按手型
    //   四桶的全网最强杀手实测值），对全部档案逐一计算、取最坏对位。
    //   输出 LT（百分比 0-100）与 LTHP（HP 绝对值）两种口径。
    // ▍触发时机：buildCoreDb() 为每只 Kami 调用一次。
    // ▍依赖：纯计算，无 DOM / API 依赖；守方入参来自链上详情：
    //   - harmony — stats.harmony.total；maxhp — stats.health.total；
    //   - bodyAffinity — body 亲和属性（决定与各手型杀手的克制关系）；
    //   - ratio / shift — bonuses.defense.threshold 的防御加成，
    //     直接进入公式抵扣攻方 ATR / ATS。
    // ▍亲和规则（与合约一致）：EERIE克SCRAP克INSECT克EERIE，克制 +0.5、
    //   被克 −0.5；special +0.2 仅攻守双方都是 NORMAL 时生效。
    // ▍边界与保护：harmony/maxhp 缺失或非正 → {LT:null, LTHP:null}；
    //   ratio/shift 为空按 0 计；结果截断 [0,1]。
    // ▍与辅助脚本的关系：⚠️ 本实现与辅助脚本的 computePreciseLT /
    //   computePreciseLTForRecord 是同一公式的两份副本，公式或默认
    //   档案改动必须两处同步。运行期辅助脚本仍会按"每周全网扫描"的
    //   最新档案，在启动/扫描后/每小时重算覆盖本脚本写入的初值
    //   （口径相同，数值随档案新旧略有差异）。
    // ▍相关控制台命令：无。
    // ============================================================
    // 标准正态 CDF（Abramowitz–Stegun 多项式近似 erf，误差 ~1e-7）
    function normCdf(x) {
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1 / (1 + 0.3275911 * x);
        const a1 = 0.254829592, a2 = -0.284496736,
              a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
        const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
        return sign === 1 ? 0.5 * (1 + y) : 0.5 * (1 - y);
    }
    // 亲和 shift（合约规则：EERIE克SCRAP克INSECT克EERIE ±0.5；special +0.2 仅双方都是 NORMAL）
    const LT_BEATS = { EERIE: 'SCRAP', SCRAP: 'INSECT', INSECT: 'EERIE' };
    function ltAffinity(attHand, defBody) {
        if (attHand === 'NORMAL' && defBody === 'NORMAL') return 0.2;
        if (attHand === 'NORMAL' || defBody === 'NORMAL') return 0;
        if (LT_BEATS[attHand] === defBody) return 0.5;
        if (LT_BEATS[defBody] === attHand) return -0.5;
        return 0;
    }
    // 单对精确清算线：atk={vio,hand,ats,atr}，def={harm,body,dtr,dts} → %（0~100）
    // ⚠️ 与辅助脚本 computePreciseLT 是同一公式的两份副本，改动必须两处同步
    function computePreciseLT(atk, def) {
        if (!(atk.vio > 0) || !(def.harm > 0)) return 0;
        const animosity = normCdf(Math.log(atk.vio / def.harm)) * 0.4;
        const efficacy  = 1 + ltAffinity(String(atk.hand || '').toUpperCase(), String(def.body || '').toUpperCase())
                            + (atk.atr || 0) - (def.dtr || 0);
        const shift     = (atk.ats || 0) - (def.dts || 0);
        return Math.max(0, Math.min(1, animosity * efficacy + shift)) * 100;
    }
    // 按守方参数对内置默认档案取最坏对位（返回形状与旧接口一致：{LT, LTHP}）
    function computeLiquidationLine(harmony, bodyAffinity, ratio, shift, maxhp) {
        if (!(harmony > 0) || !(maxhp > 0)) {
            return { LT: null, LTHP: null };
        }
        const def = { harm: harmony, body: bodyAffinity, dtr: ratio ?? 0, dts: shift ?? 0 };
        let worst = 0;
        for (const p of DB_TOP_PREDATORS) {
            const lt = computePreciseLT(p, def);
            if (lt > worst) worst = lt;
        }
        return { LT: +worst.toFixed(2), LTHP: +((worst / 100) * maxhp).toFixed(2) };
    }

    // ============================================================
    // 【板块：构建前备份（覆盖式）】
    // ------------------------------------------------------------
    // ▍功能：重建开始前，把当前 localStorage.kami_core_db 原样复制
    //   一份到备份位（localStorage.kami_core_db_old + 解析后挂到
    //   window.kami_core_db_old），再进入重建。
    // ▍触发时机：buildCoreDb() 的第一步。
    // ▍依赖：localStorage：kami_core_db（读）、kami_core_db_old（写）；
    //   window.kami_core_db_old（写，供控制台直接对照新旧库）。
    // ▍核心流程：1) 读旧库原始字符串；2) 存在则原样写入备份 key，
    //   并尝试 JSON 解析后挂 window；3) 不存在则跳过并打提示。
    // ▍边界与保护：
    //   - 备份的意义：重建过程若因断网/接口异常产出残缺库，旧库仍
    //     可从 kami_core_db_old 找回（手动复制回主 key 即可恢复）；
    //   - "覆盖式"：只保留最近一份备份、不做多版本堆积，避免
    //     localStorage 无限膨胀；
    //   - JSON.parse 失败只影响 window 挂载，localStorage 备份已落盘；
    //   - 整体 try/catch，备份失败只告警，不阻断后续构建。
    // ▍可调参数：无。
    // ▍相关控制台命令：window.kami_core_db_old — 控制台直接查看旧库。
    // ============================================================
    function backupCoreDb() {
        try {
            const cur = localStorage.getItem(CORE_DB_KEY);
            if (cur !== null) {
                localStorage.setItem(CORE_DB_OLD_KEY, cur);
                try { window.kami_core_db_old = JSON.parse(cur); } catch {} // 解析失败不影响已落盘的备份
                log('🗂️ [备份] 已覆盖写入 kami_core_db_old');
            } else {
                log('ℹ️ [备份] 未发现现有数据库，跳过覆盖');
            }
        } catch (e) { console.warn('❌ [备份失败]', e); log('❌ [备份失败] ' + (e?.message || e)); }
    }

    // ============================================================
    // 【板块：并发池（runPool）】
    // ------------------------------------------------------------
    // ▍功能：以固定并发数执行一批异步任务，结果按输入顺序回填。
    // ▍触发时机：buildCoreDb() 并发拉取每只 Kami 详情时使用。
    // ▍依赖：无。
    // ▍核心流程：
    //   1) 启动 concurrency 个 workerLoop 协程；
    //   2) 各协程通过共享游标 nextIndex 逐个"领取"任务下标，直到取尽
    //      （单线程事件循环下自增取号天然无竞争）；
    //   3) 结果写回 results[myIndex]，保证输出顺序与输入一致。
    // ▍边界与保护：单个任务抛错时，该位置写入 { error: 错误信息 }
    //   占位对象，不影响其余任务；池本身永不 reject。
    // ▍可调参数：concurrency 由调用方传入（构建时为 CONC = 10）。
    // ▍相关控制台命令：无。
    // ============================================================
    async function runPool(items, worker, concurrency) {
        const results = new Array(items.length);
        let nextIndex = 0;
        async function workerLoop() {
            while (true) {
                const myIndex = nextIndex; nextIndex += 1; // 领取下一个任务下标
                if (myIndex >= items.length) break;        // 任务取尽，协程退出
                try {
                    const value = await worker(items[myIndex], myIndex);
                    results[myIndex] = value;
                } catch (e) {
                    results[myIndex] = { error: e?.message || String(e) }; // 失败写占位，不中断其他任务
                }
            }
        }
        const workers = [];
        for (let i = 0; i < concurrency; i++) workers.push(workerLoop());
        await Promise.all(workers);
        return results;
    }

    // ============================================================
    // 【板块：核心库构建（buildCoreDb）】
    // ------------------------------------------------------------
    // ▍功能：扫描当前账户名下全部 Kami，把每只压缩成 17 个字段，
    //   写入 localStorage.kami_core_db 与 window.kami_core_db，供
    //   套件内核心脚本（部署/停采/XP 药水）与辅助脚本（升级/杀手
    //   扫描/地块分析）零 API 成本直接读取。
    // ▍触发时机：main() 流程末尾自动执行一次；也可随时在控制台
    //   手动调用 rebuildKamiCoreDb()。
    // ▍依赖：
    //   - window.network.network.connectedAddress.value_ — operator 地址；
    //   - window.network.explorer.accounts.getByOperator(addr) — 账户
    //     及名下 kami 概要列表（index/id/name/image/harvest/progress）；
    //   - window.network.explorer.kamis.getByIndex(index, opts) — 单只
    //     详情，opts 全开：stats/traits/bonus/harvest/progress/time；
    //   - localStorage：kami_core_db（写）、kami_core_db_old（备份写）。
    // ▍核心流程：
    //   1) 读 operator 地址并打日志；
    //   2) backupCoreDb() 覆盖式备份旧库；
    //   3) 拉账户 kami 列表：最多 3 次重试，间隔 300 + 300×次数 +
    //      0~400ms 抖动（线性退避）；列表数量以 API 为准；
    //   4) 顺带统计 DOM 卡片数，与 API 数量不一致时仅告警提示
    //      （DOM 可能未渲染全，不影响构建结果）；
    //   5) runPool 以并发 10 拉每只详情：请求前先随机等 20~150ms
    //      错峰；失败按 250ms × 2^(重试次数-1) + 0~250ms 指数退避，
    //      最多 3 次尝试；
    //   6) 逐只组装 17 字段记录并计算清算线；
    //   7) JSON 序列化落盘 localStorage、同步挂 window，打印 base
    //      字段填充率，并 console.table 输出全库供人工核对。
    // ▍17 个字段逐一说明（★=核心脚本主用；☆=辅助脚本主用）：
    //   1)  index     ★☆ Kami 的链上全局序号，API 查询与增量同步
    //                     的主键，套件内定位一只 Kami 都靠它；
    //   2)  imgNumber ★  立绘编号，从 image URL 的 kami/(\d+).gif
    //                     提取；核心脚本靠它把数据库记录与页面上的
    //                     卡片图片对上号；提取失败为 null；
    //   3)  kamiId    ★  链上实体 ID，发交易（部署/停采/喂药等）时
    //                     指定目标用；
    //   4)  harvestId ★  当前采集（harvest）实体 ID，停采/收获交易
    //                     的必要参数；未在采集时为 null；
    //   5)  name      ★☆ 名称，日志展示与人工核对用；
    //   6)  level     ★☆ 当前等级（progress.level），辅助脚本判断
    //                     升级条件、核心脚本筛选 XP 药水喂食对象；
    //   7)  harmony   ★  harmony 总值（出生值+等级成长+技能/加成），
    //                     清算线公式的核心入参；
    //   8)  maxhp     ★  最大生命值总值（stats.health.total），
    //                     LT 百分比与 HP 绝对值互换的换算基数；
    //   9)  body      ★☆ body 部件亲和属性（统一转小写），决定与各手型
    //                     杀手的克制关系（清算公式的亲和项）；地块分析用；
    //   10) hand      ☆  hand 部件亲和属性（统一转小写），地块分析
    //                     /克制关系用；
    //   11) ratio     ★  防御阈值比例加成（bonuses.defense.threshold
    //                     .ratio），清算公式中直接抵扣攻方 ATR；
    //   12) shift     ★  防御阈值平移加成（同路径 .shift），清算
    //                     公式中直接抵扣攻方 ATS；
    //   13) LT        ★  清算线百分比（0-100，两位小数），核心脚本
    //                     据此设定安全停采线；null = 无法计算；
    //   14) LTHP      ★  清算线对应的 HP 绝对值，便于与当前 HP
    //                     直接比较；null = 无法计算；
    //   15) vioBase   ☆  violence 出生基础值（终生不变），辅助脚本
    //                     findKillerCandidates() 筛选高攻候选的依据；
    //   16) harmBase  ☆  harmony 出生基础值（终生不变），评估个体
    //                     的抗清算潜力；
    //   17) powBase   ☆  power 出生基础值（终生不变），评估采集
    //                     效率潜力/选育参考。
    //   存 base 三项的原因：出生属性永不变化，入库一次即可长期复用，
    //   辅助脚本无须再发任何 API 请求就能做全库筛选。
    // ▍边界与保护：
    //   - 账户列表 3 次重试仍失败 → 按空列表继续（此时会构建出
    //     空库，旧库仍在 kami_core_db_old 可手动找回）；
    //   - 单只详情 3 次尝试仍失败 → 写入"降级记录"：index/imgNumber/
    //     kamiId/harvestId/name/level 取自账户列表概要，其余统计类
    //     字段（含 base 三项）全部置 null，消费方需识别 null 跳过；
    //   - harmony / maxhp / body 任一缺失 → 不计算清算线（LT/LTHP
    //     保持 null），绝不用残缺参数硬算；
    //   - 整体 try/catch，构建失败只打印错误，不影响页面运行。
    // ▍可调参数：
    //   - CONC = 10 — 详情拉取并发数。调大更快但请求更集中、易触发
    //     限流；调小更温和但整体耗时线性变长；
    //   - 两处重试次数（均为 3）与退避基数（300ms / 250ms）写死在
    //     循环内，一般无需调整。
    // ▍相关控制台命令：
    //   - rebuildKamiCoreDb() — 手动全量重建本库；
    //   - window.kami_core_db — 查看当前库，console.table(kami_core_db)
    //     可表格化浏览；
    //   - window.kami_core_db_old — 查看构建前的备份库。
    // ============================================================
    async function buildCoreDb() {
        try {
            const addr = String(window.network.network.connectedAddress.value_ || '');
            log('📡 准备构建精简数据库，账户的operator address是：' + addr);

            // 覆盖式备份
            backupCoreDb();

            // 账户列表（带重试 + 抖动）
            let account, tries = 0;
            while (tries < 3) {
                try {
                    account = await window.network.explorer.accounts.getByOperator(addr);
                    if (account?.kamis) break;
                } catch {}
                tries += 1;
                await sleep(300 + tries * 300 + jitter(0, 400)); // 线性退避 + 随机抖动
            }
            const list = account?.kamis || [];
            log(`🧾 API 返回 ${list.length} 只 Kami（以 API 为准）`);

            // （可选）对比 DOM 数量，仅提示
            try {
                const domCount = document.querySelectorAll(
                    '#party > div > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) img[src*="/kami/"]'
                ).length;
                if (domCount && domCount !== list.length) {
                    console.warn(`[提示] DOM 是 ${domCount} 张，但 API 是 ${list.length} 只。以 API 为准，DOM 仅用于等渲染。`);
                }
            } catch {}

            // kamis详细数据增富 + 计算清算线（并发 + 指数退避 + 抖动）
            const CONC = 10; // 详情拉取并发数
            const db = await runPool(list, async (k) => {
                await sleep(jitter(20, 150)); // 请求前随机错峰 20~150ms
                let res, t = 0;
                while (t < 3) {
                    try {
                        res = await window.network.explorer.kamis.getByIndex(k.index, {
                            stats: true, traits: true, bonus: true, harvest: true, progress: true, time: true // 详情全开：属性/部件/加成/采集/进度/时间
                        });
                        if (res) break;
                    } catch {}
                    t += 1;
                    await sleep(250 * (2 ** (t - 1)) + jitter(0, 250)); // 指数退避：250/500ms… + 抖动
                }
                if (!res) { // 3 次尝试仍失败 → 写"降级记录"，统计字段全 null
                    return {
                        index: k.index,
                        imgNumber: k.image?.match(/kami\/(\d+)\.gif/)?.[1] || null,
                        kamiId: k.id,
                        harvestId: k.harvest?.id || null,
                        name: k.name,
                        level: k.progress?.level ?? null,
                        harmony: null, maxhp: null, body: null, hand: null,
                        ratio: null, shift: null, LT: null, LTHP: null,
                        // 拿不到详情时 base 三项同样置 null（消费方需识别 null 并跳过）
                        vioBase: null, harmBase: null, powBase: null
                    };
                }

                const imgNumber = res.image?.match(/kami\/(\d+)\.gif/)?.[1] || null; // 立绘编号，用于与 DOM 卡片对号
                const harmony = res.stats?.harmony?.total ?? null;
                const maxhp   = res.stats?.health?.total ?? null;
                const body    = res.traits?.body?.affinity ? String(res.traits.body.affinity).toLowerCase() : null;
                const hand    = res.traits?.hand?.affinity ? String(res.traits.hand.affinity).toLowerCase() : null;

                // 防御阈值加成直接取 API 返回值；缺省按 0（无加成）处理
                const ratio = res.bonuses?.defense?.threshold?.ratio ?? 0;
                const shift = res.bonuses?.defense?.threshold?.shift ?? 0;

                // 出生原始属性（终生不变），辅助脚本用其做杀手候选等全库筛选
                const vioBase  = res.stats?.violence?.base ?? null;
                const harmBase = res.stats?.harmony?.base  ?? null;
                const powBase  = res.stats?.power?.base    ?? null;

                // harmony / maxhp / body 齐备才计算清算线，否则保持 null
                let LT = null, LTHP = null;
                if (harmony != null && maxhp != null && body) {
                    const r = computeLiquidationLine(harmony, body, ratio, shift, maxhp);
                    LT = r.LT; LTHP = r.LTHP;
                }

                // —— 17 个核心字段（逐项含义见本板块说明）—— //
                return {
                    index:     res.index,
                    imgNumber,
                    kamiId:    res.id,
                    harvestId: res.harvest?.id || null,
                    name:      res.name,
                    level:     res.progress?.level ?? null,
                    harmony,                  // total（含等级技能加成）
                    maxhp,                    // total
                    body,
                    hand,
                    ratio,                    // 防御阈值比例加成（defense.threshold.ratio）
                    shift,                    // 防御阈值平移加成（defense.threshold.shift）
                    LT,
                    LTHP,
                    vioBase,                  // stats.violence.base（出生值，终生不变）
                    harmBase,                 // stats.harmony.base（出生值，终生不变）
                    powBase                   // stats.power.base（出生值，终生不变）
                };
            }, CONC);

            // 落盘 localStorage + 挂 window + 打印全库
            localStorage.setItem(CORE_DB_KEY, JSON.stringify(db));
            window.kami_core_db = db;
            // 构建元信息（库龄/规模/降级数，供辅助健康看板判断快照新旧；成功即清除失败面包屑）
            try {
                localStorage.setItem('kami_core_db_meta', JSON.stringify({ builtAt: Date.now(), count: db.length, degraded: db.filter(r => r.harmony == null).length }));
                localStorage.removeItem('kami_db_last_fail');
            } catch (e2) {}
            log('🎉 构建完成 → localStorage.kami_core_db & window.kami_core_db（17 字段，含 vioBase/harmBase/powBase）');
            // 统计 base 字段填充率，提醒用户
            const withBase = db.filter(r => r.vioBase != null && r.harmBase != null && r.powBase != null).length;
            log(`📊 base 字段填充: ${withBase}/${db.length} 只（用于 findKillerCandidates 杀手候选筛选）`);
            console.table(db);
            // ▍新手提示：控制台出现"🎉 构建完成"即构建成功。首次构建成功后，
            //   建议到 Tampermonkey 面板停用本脚本，避免每次刷新都全量重扫；
            //   日常的新 kami 增补由核心脚本的 syncKamiDb() 增量自愈完成，
            //   需要再次全量重建时重新启用本脚本或调用 rebuildKamiCoreDb()。
        } catch (e) {
            console.error('❌ [构建失败]', e);
            log('❌ [构建失败] ' + (e?.message || e));   // 同步落缓冲（console.error 不进缓冲）
            try { localStorage.setItem('kami_db_last_fail', JSON.stringify({ at: Date.now(), stage: '构建失败: ' + String(e?.message || e).slice(0, 80) })); } catch (e2) {}
        }
    }

    // ============================================================
    // 【板块：主流程（main）】
    // ------------------------------------------------------------
    // ▍功能：把各板块按序串起来：固定等待 → 展开 Party / 切眼睛 →
    //   等 DOM 渲染（非致命）→ 等链上 API（致命）→ 构建数据库。
    // ▍触发时机：脚本载入后自动执行一次（见文件末尾入口板块）。
    // ▍依赖：前述全部板块。
    // ▍核心流程：
    //   1) fixedWaitWithCountdown(40000 + 0~2000ms 抖动) — 等页面加载；
    //   2) startSequence() — 尽力展开 Party 并切到 eye-half；失败
    //      （内部已触发刷新）也不阻塞后续步骤；
    //   3) waitForKamiList(60000) — 等卡片渲染，超时仅告警继续；
    //   4) waitForReady(30000) — 等链上 API，失败抛错终止本轮；
    //   5) 随机再等 300~1800ms 错峰，进入 buildCoreDb()。
    // ▍边界与保护：
    //   - 整体 try/catch，任何异常只打印"[主流程异常]"，不影响页面；
    //   - finally 中无论成败都清掉 __KAMI_CORE_DB_BUILDING__ 标记，
    //     保证下次载入 / 手动重建不会被残留标记卡住。
    // ▍可调参数：各阶段等待时长见对应板块说明。
    // ▍相关控制台命令：rebuildKamiCoreDb() — 跳过等待与 DOM 流程，
    //   直接重建（要求 window.network 已就绪）。
    // ============================================================
    async function main() {
        try {
            await fixedWaitWithCountdown(40000 + jitter(0, 2000)); // 固定 40 秒 + 0~2 秒抖动
            // 先尽力把 Party/眼睛切好；失败也不阻塞
            await startSequence();
            await waitForKamiList(60000); // 非致命：超时也继续走 API
            log('🛰️ 检查 window.network 是否加载完毕...');
            await waitForReady(30000); // 致命：30 秒未就绪抛错终止本轮
            await sleep(jitter(300, 1800)); // 再错峰一丢丢
            await buildCoreDb();
        } catch (e) {
            console.error('❌ [主流程异常]', e);
            log('❌ [主流程异常] ' + (e?.message || e));   // 同步落缓冲（console.error 不进缓冲）
            try { localStorage.setItem('kami_db_last_fail', JSON.stringify({ at: Date.now(), stage: '主流程异常: ' + String(e?.message || e).slice(0, 80) })); } catch (e2) {}
        } finally {
            window.__KAMI_CORE_DB_BUILDING__ = false; // 无论成败都清掉"构建中"标记
        }
    }

    // ============================================================
    // 【板块：防重复执行 & 启动入口】
    // ------------------------------------------------------------
    // ▍功能：用全局标记 window.__KAMI_CORE_DB_BUILDING__ 保证同一
    //   页面同一时刻只有一份构建流程在跑；然后自动启动 main()，并把
    //   手动重建接口挂到 window。
    // ▍触发时机：IIFE 末尾，脚本载入即执行。
    // ▍依赖：window.__KAMI_CORE_DB_BUILDING__ ——"构建中"标记，套件
    //   内其他脚本也可读取它判断数据库是否正在重建、避免同时写库。
    // ▍核心流程：
    //   1) 标记已为 true → 直接 return，本份脚本静默退出（防止重复
    //      注入/重复触发时两份流程并发写库互相覆盖）；
    //   2) 否则置 true 并启动 main()；
    //   3) main() 的 finally 负责在结束时清掉标记。
    // ▍边界与保护：标记挂在 window 上，页面刷新自动清零，不会因
    //   异常残留而永久锁死。
    // ▍可调参数：无。
    // ▍相关控制台命令：
    //   - rebuildKamiCoreDb() — 手动全量重建精简数据库（直接进入
    //     构建，不含页面等待/Party 展开流程，需 window.network 就绪）；
    //   - 使用建议：首次安装启用并成功构建一次后即可停用本脚本，
    //     日常的新 kami 增补交给核心脚本的 syncKamiDb() 增量自愈。
    // ============================================================
    if (window.__KAMI_CORE_DB_BUILDING__) return; // 已有构建在跑：静默退出
    window.__KAMI_CORE_DB_BUILDING__ = true;      // 占位：标记构建开始

    // 自动运行一次 + 暴露手动重建接口
    main();
    window.rebuildKamiCoreDb = buildCoreDb; // 如需手动重建，控制台调用即可
})();
