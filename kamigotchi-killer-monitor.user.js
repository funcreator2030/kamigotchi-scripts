
/* eslint-disable no-multi-spaces */
// ==UserScript==
// @name         Kamigotchi轻量杀手监控-公开版 (killer monitor)
// @namespace    http://tampermonkey.net/
// @version      1.2.2
// @downloadURL  https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-killer-monitor.user.js
// @updateURL    https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-killer-monitor.meta.js
// @homepageURL  https://github.com/funcreator2030/kamigotchi-scripts
// @x-release-date 2026/7/12 00:28:49
// @description  Kamigotchi杀手监控公开版：纯API轮询监控指定杀手kami位置，逼近时告警并联动核心脚本紧急停采
// @author       hongfei and claude
// @match        https://*.kamigotchi.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                 Kamigotchi 轻量杀手监控 · 公开版 v1.2.2                        ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  本脚本持续监控一份你自己维护的"杀手 kami 名单"（KILLER_KAMI_INDEXES），        ║
// ║  纯 API 轮询、不依赖 DOM，开销极小。当杀手出现在你的采集地块（房间）或          ║
// ║  邻居地块（地图上与你所在房间相邻的房间）时发出告警，并自动联动核心脚本        ║
// ║  触发紧急停采，保护你的 kami 不被清算。清算（liquidated）＝采集中血量降得      ║
// ║  过低的 kami 被敌对杀手 kami 击杀、产出被对方掠夺，是本游戏的核心 PvP 风险。   ║
// ║                                                                              ║
// ║  ▍核心机制：                                                                  ║
// ║   1. 名单 → 玩家映射：启动时把每只杀手 kami 反查到其主人账户，                 ║
// ║      之后按"玩家账户位置"轮询（N 只杀手只需查几个玩家，API 调用大幅减少）。    ║
// ║   2. 自家杀手单独追踪：名单里属于你自己的 kami 不告警（自己的杀手               ║
// ║      不会攻击自家 kami），改用 harvest.roomIndex（kami 当前采集任务            ║
// ║      所在的房间号字段）跟踪实际部署位置，仅记录日志便于观察；                  ║
// ║      同时自动注册进 window.MY_KILLER_KAMIS 全局集合，让核心脚本                ║
// ║      （部署/XP 喂食）和辅助脚本（升级/技能重置）自动跳过它们。                 ║
// ║   3. Feed 监控（⚠️ 已停用的历史功能）：曾通过监听游戏聊天窗（Chat）             ║
// ║      Feed 频道的 liquidated（清算）消息感知全图击杀风向，并经                  ║
// ║      window.__killerDetected 等全局标记通知核心脚本切换安全停采线。            ║
// ║      现已不再监控 Feed：默认关闭、不建议启用，代码仅作保留。                   ║
// ║      当前的杀手保护完全由第 1 条的位置轮询直接触发紧急停采承担。               ║
// ║   4. 名字防撞脸（v1.1.10 起）：所有显示杀手账户名的日志统一附 accountId        ║
// ║      短标。起因：2026-07-08 #1129 命案根因之一是名字撞脸——真凶 T0nin          ║
// ║      （0xa2335…）与整晚监控的挂机杀手 Ton1n（0x649e…）名字仅数字 1/0 之差，     ║
// ║      肉眼看错导致审计误判、连补录都补错账户。教训：名字不是可靠标识，          ║
// ║      一切以 accountId 为准。                                                  ║
// ║   5. 沉寂杀手活跃度门槛（v1.1.11 起）：清算需杀手主人本人在场操作，            ║
// ║      移动/部署/清算都会刷新链上 time.last。数据显示真不玩的杀手都是几十天      ║
// ║      没动作（0xasimov 37天/Kanku 95天/humblehenry 102天），在玩的几分钟~2      ║
// ║      小时前刚动过（KCI 2分钟前/boom 1.6小时前），中间是巨大鸿沟。故同房间/     ║
// ║      邻居两分支在触发紧急停采前都先查主人 time.last：超过 24 小时无链上        ║
// ║      动作即判定"不玩了"，跳过本次停采（不告警不停采，继续查完名单）；          ║
// ║      查不到 time.last 时按"活跃"保守处理，照常停采，绝不因数据缺失漏防。       ║
// ║      本条替代 v1.1.9~1.1.10 的"沉寂降频仍停采"方案（原方案沉寂 10 天以上       ║
// ║      只降低警报频率，仍会触发停采；本版改为直接跳过，语义更准确）。            ║
// ║                                                                              ║
// ║  ▍使用前必读：                                                                ║
// ║   - v1.1.8 起 KILLER_KAMI_INDEXES 已预填默认名单（长期敌情观察 + 全网          ║
// ║     四手型最强杀手），开箱即有基础保护；请按需增删（来源：游戏中观察           ║
// ║     谁在清算别人、杀手排行榜、scanTopPredators() 扫描提示等）。                ║
// ║     注意：辅助脚本的 findKillerCandidates() 是在你【自己】的 kami 里找          ║
// ║     适合转型做杀手的候选（选秀工具），与本名单（敌方监控对象）无关。           ║
// ║     名单为空时脚本不报错、监控照常空转，但不会产生任何告警与保护。             ║
// ║   - 本脚本可独立运行（无核心脚本时仅告警、无法触发紧急停采），                 ║
// ║     配合核心脚本使用才有自动保护。                                             ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ============================================================
// 【常用控制台命令速查】
// ------------------------------------------------------------
// startKillerMonitor()     - 启动 API 杀手监控（脚本加载后会自动启动）
// stopKillerMonitor()      - 停止杀手监控
// checkKillerPositions()   - 立即执行一次位置检查
// rebuildKillerMap()       - 重建"杀手 kami → 玩家账户"映射（改名单后调用）
// addKiller(index)         - 临时添加一只杀手到监控名单（刷新后失效，
//                            长期生效需改源码里的 KILLER_KAMI_INDEXES）
// removeKiller(index)      - 临时移除一只杀手
// listKillers()            - 查看当前监控名单与玩家映射
// startFeedMonitor()       - 启动 Feed 监控（⚠️ 已停用的历史功能，不建议使用）
// stopFeedMonitor()        - 停止 Feed 监控
// ============================================================

(function () {
    'use strict';

    // 说明：控制台里日志的来源链接（source link）是 Tampermonkey 注入机制
    //   生成的虚拟 URL，无法从脚本内部修改，属正常现象。

    // ============================================================
    // 【板块：杀手名单配置】
    // ------------------------------------------------------------
    // ▍功能：维护需要监控的杀手 kami 名单，只需填入 kami index
    //   （即 kami 的全局编号，游戏内显示在 kami 名字旁的 # 数字）。
    //   这是本脚本唯一必填的配置：名单上有谁，脚本就盯谁。
    // ▍触发时机：脚本加载即读取；监控启动时据此逐只反查其主人
    //   玩家账户（见下方"杀手 kami → 玩家映射"板块）。
    // ▍依赖：无。纯数组常量。
    // ▍核心流程：1) 把观察到的杀手 kami index 填进数组并保存脚本；
    //   2) 运行期也可用 addKiller()/removeKiller() 临时增删（只改
    //      内存，刷新页面后失效）；3) 运行期改动后需执行
    //      rebuildKillerMap() 重建映射，改动才会进入监控。
    // ▍边界与保护：名单中属于自己账户的 kami 会在建映射时被自动
    //   识别并转入"自家杀手"单独追踪（只记日志、不告警、不停采），
    //   无需手动剔除。
    // ▍相关控制台命令：addKiller(index) — 临时添加；
    //   removeKiller(index) — 临时移除；listKillers() — 查看名单与映射。
    // ============================================================
    const KILLER_KAMI_INDEXES = [
        // ▍名单构成：长期敌情观察 + 全网扫描四手型最强（scanTopPredators 实测）。
        // ▍维护：扫描输出出现"⚠️ 未在监控名单"提示时，把该 index 追加进来；
        //   每行/每项一个 index + 英文逗号，保存脚本并刷新页面生效；
        //   临时验证可用控制台 addKiller(index)（刷新后失效）。
        // —— 长期观察名单 ——
        12649, 14118, 2759, 11224, 8315, 9809, 46, 327, 1299, 11937,
        10937, 7031, 6262, 7695, 10943, 12818, 2071, 13340, 10360, 3188,
        2405, 9406, 6245, 9611, 13287, 9939, 3070, 1437, 3094, 7088,
        9094, 15822, 14377, 6184,
        // —— 曾是自家杀手、已送人（对方可能用于攻击）——
        14430, 4332, 3072,
        // —— 全网四手型最强（2026-07-08 scanTopPredators 实测）——
        4277,   // EERIE  手最强 @sakalaka（vio31/ATS0.29/ATR0.35）
        4711,   // SCRAP  手最强 @Shell（vio41/ATS0.3/ATR0.5）
        11664,  // INSECT 手最强 @lookinrare（vio36/ATS0.26/ATR0.5）
        8470,   // NORMAL 手最强 @Spinneum（vio34/ATS0.3/ATR0.5）
        1232,   // ⚠️T0nin(0xa2335…) 名下——"T0nin(数字0)" ≠ "Ton1n(数字1,0x649e,房88挂机那只)"，两个不同账户！#1232 于 2026-07-08 03:05 清算我方 #1129 实锤（当晚因不在名单而漏防→死亡，补录后映射自动反查正确归 T0nin，现已跟踪）
    ];
    // 暴露名单活引用（addKiller/removeKiller 同步生效），
    // 供辅助脚本 scanTopPredators 的输出比对"最强杀手是否已在监控名单"
    window.__killerWatchList = KILLER_KAMI_INDEXES;


    // ============================================================
    // 【板块：API 杀手位置监控配置】
    // ------------------------------------------------------------
    // ▍功能：控制位置轮询的节奏与告警范围。
    // ▍触发时机：常量在脚本加载时定值；每轮检测结束后按
    //   "基础间隔 + 随机抖动"排定下一轮（见 scheduleNextCheck）。
    // ▍依赖：无外部依赖。间隔加随机抖动是刻意设计：避免形成
    //   固定节奏的请求指纹，也让多开页面的请求错峰。
    // ▍核心流程：1) 每轮间隔 = KILLER_CHECK_BASE + [0, KILLER_CHECK_RANDOM)
    //   毫秒的随机数（见 getRandomInterval）；2) NEIGHBOR_WARNING 决定
    //   是否把"杀手到达相邻地块"也视为威胁；3) INITIAL_DELAY 决定
    //   页面加载后多久自动启动监控。
    // ▍边界与保护：启动延迟给游戏页面与核心脚本留出初始化时间，
    //   避免链上接口尚未就绪时首轮建映射失败。
    // ▍可调参数：
    //   KILLER_CHECK_BASE = 2 分钟 — 轮询基础间隔。调小发现杀手
    //     更快但 API 调用更频繁；调大更省请求，但从杀手进场到
    //     被发现的空窗期变长。
    //   KILLER_CHECK_RANDOM = 60 秒 — 随机抖动上限。调大节奏更散、
    //     平均间隔也随之变长；调为 0 则每轮间隔恒定（不建议）。
    //   NEIGHBOR_WARNING = true — 邻居预警开关。开启时杀手到达
    //     相邻地块即告警并触发停采（提前一格反应，赶在其进场前
    //     收 kami）；关闭则只在同地块才告警。
    //   INITIAL_DELAY = 150 秒 — 页面加载后自动启动的延迟；调太小
    //     可能在游戏接口就绪前启动导致首轮查询失败。
    // ▍相关控制台命令：startKillerMonitor() — 启动；
    //   stopKillerMonitor() — 停止。
    // ============================================================
    const KILLER_CHECK_BASE = 2 * 60 * 1000;      // 轮询基础间隔：2 分钟
    const KILLER_CHECK_RANDOM = 60 * 1000;        // 随机抖动上限：每轮额外加 0-60 秒
    const NEIGHBOR_WARNING = true;                 // 邻居预警开关：杀手在相邻地块也告警并停采
    const INITIAL_DELAY = 150 * 1000;             // 页面加载后自动启动的延迟：150 秒（与核心脚本启动节奏配合）
    // v1.1.11 起：沉寂杀手活跃度门槛（同房间/邻居两分支共用，触发停采前先查）——
    // 清算需杀手主人本人在场操作，移动/部署/清算都会刷新链上 time.last；正在扑来的
    // 杀手必然是近期活跃（KCI 2分钟前/boom 1.6小时前），真不玩的杀手都是几十天没
    // 动作（0xasimov 37天/Kanku 95天/humblehenry 102天），中间是巨大鸿沟。故主人超
    // 过此时长无链上动作 → 判定"不玩了"，跳过本次停采（不告警不停采，continue 继续
    // 查完名单，不影响其余玩家的位置/活跃度情报）。
    // 🔻SYNC→内部版[1.1.11 沉寂杀手24h活跃度门槛]
    // 本条替代 v1.1.9~1.1.10 的 DORMANT_KILLER_DAYS(10天)/DORMANT_ALERT_INTERVAL_MS
    // "沉寂降频仍停采"方案——旧方案沉寂超 10 天仅降低警报横幅频率，停采检查不受影响
    // 照常触发；本版改为沉寂超阈值直接跳过停采，语义更准确，降频用的 __dormantAlertLast
    // 状态随之移除。
    const KILLER_INACTIVE_HOURS = 24;              // 主人超此时长无链上动作视为"不玩了"，不触发停采（可配置）

    // ============================================================
    // 【板块：Feed 监控配置】（⚠️ 已停用的历史功能：现已不再监控 Feed，参数仅作保留）
    // ------------------------------------------------------------
    // ▍功能：为文件后半部分的"Feed 监控模块"提供节奏与阈值。
    //   Feed 监控通过读取游戏内 Chat→Feed 频道的 liquidated（清算）
    //   消息感知"全图正在发生击杀"，与按名单的定点位置监控互补。
    // ▍触发时机：仅在手动执行 startFeedMonitor() 后这些参数才生效。
    // ▍依赖：游戏页面的 #chat / #feed DOM 结构。
    // ▍核心流程：1) 每条 liquidated 消息记一个时间戳；2) 滑动窗口
    //   内条数达到阈值 → 置全局标记 __killerDetected（安全模式）；
    //   3) 冷却期内无新击杀 → 自动清除标记恢复常态。
    // ▍可调参数：
    //   FEED_CHECK_INTERVAL = 3 分钟 — 状态巡检 + Chat 窗口保活 +
    //     启动失败重试的统一周期；调小恢复判断更及时但 DOM 操作
    //     更频繁。
    //   LIQUIDATE_WINDOW_MS = 5 分钟 — 击杀计数的滑动窗口长度；
    //     调大更容易累计触发（更敏感），调小只对密集击杀反应。
    //   LIQUIDATE_COUNT_TRIGGER = 2 — 窗口内达到几条清算消息触发
    //     安全模式；调为 1 则任何一条清算都立即触发。
    //   SAFE_COOLDOWN_MS = 15 分钟 — 最后一次击杀后需安静多久才
    //     退出安全模式；调大更保守（安全模式停留更久）。
    // ▍相关控制台命令：startFeedMonitor() / stopFeedMonitor()。
    // ============================================================
    const FEED_CHECK_INTERVAL = 3 * 60 * 1000;    // Feed 巡检/保活/重试周期：3 分钟
    const LIQUIDATE_WINDOW_MS = 5 * 60 * 1000;    // 击杀计数滑动窗口：5 分钟
    const LIQUIDATE_COUNT_TRIGGER = 2;            // 窗口内达到 2 条清算消息 → 进入安全模式
    const SAFE_COOLDOWN_MS = 15 * 60 * 1000;      // 冷却：15 分钟无新击杀才退出安全模式

    // ------------------------------------------------------------
    // 跨脚本全局标记（挂在 window 上，供套件内其他脚本读取；
    // 用 `|| 默认值` 初始化，避免脚本重载时把已有状态清零）
    // ------------------------------------------------------------
    window.__killerDetected = window.__killerDetected || false;            // 是否处于"检测到杀手活动"的安全模式
    window.__lastKillerTime = window.__lastKillerTime || 0;                // 最近一次杀手活动（清算消息）的时间戳
    window.__liquidatedTimestamps = window.__liquidatedTimestamps || [];   // 滑动窗口内的清算消息时间戳列表

    // 生成一次随机轮询间隔：基础间隔 + [0, 随机上限) 毫秒
    // ============================================================
    // 【板块：杀手活跃度追踪】（v1.1.4 起）
    // ------------------------------------------------------------
    // ▍功能：在位置监控之上标注每个杀手 owner 的"活跃度"——
    //   最近一次链上动作是多久前、累计击杀数、是否刚移动过房间。
    //   区分"在场但长期挂机"与"在场且正在活跃"两种威胁形态。
    // ▍数据来源（零新增查询，复用位置轮询已拿到的账户对象）：
    //   - acc.time.last —— 账户（含旗下 kami 的操作）最后一次链上动作
    //     的 unix 秒时间戳；
    //   - acc.stats.kills —— 累计清算数：两次轮询之间增量 > 0 = 期间
    //     杀过人，是最可靠的活跃信号（不管人操作还是脚本操作）。
    // ▍行为：只做标注与广播，不改变任何停采响应（告警/紧急停采逻辑
    //   与之前完全一致）。杀人增量会打深红横幅提醒人工关注。
    // ▍存储：localStorage「kami_killer_activity」（独立键），页面自动
    //   刷新后杀人计数基线不丢失。
    // ▍相关控制台命令：listKillers() 现在会附带活跃度一览。
    // ============================================================
    const KILLER_ACTIVITY_KEY = 'kami_killer_activity';   // 独立 localStorage 键，不与其他数据冲突
    function __loadKillerActivity() {
        try { return JSON.parse(localStorage.getItem(KILLER_ACTIVITY_KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function __saveKillerActivity(m) {
        try { localStorage.setItem(KILLER_ACTIVITY_KEY, JSON.stringify(m)); } catch (e) {}
    }
    // 秒数 → 人话（25秒前 / 31分钟前 / 5.1小时前 / 82.1天前）
    function __fmtAgo(sec) {
        if (!(sec >= 0)) return '未知';
        if (sec < 90) return Math.round(sec) + '秒前';
        if (sec < 5400) return Math.round(sec / 60) + '分钟前';
        if (sec < 172800) return (sec / 3600).toFixed(1) + '小时前';
        return (sec / 86400).toFixed(1) + '天前';
    }
    // 对每个 owner 生成活跃度标注 + 检测杀人增量/移动（位置轮询里逐个调用）
    function __trackKillerActivity(playerId, playerName, acc) {
        const nowSec = Math.floor(Date.now() / 1000);
        const last = acc?.time?.last;
        const kills = acc?.stats?.kills;
        const store = __loadKillerActivity();
        const prev = store[playerId] || {};
        let note = (typeof last === 'number') ? `最近动作: ${__fmtAgo(nowSec - last)}` : '最近动作: 未知';
        if (typeof kills === 'number') note += `｜累计击杀: ${kills}`;
        // 杀人增量：不管人在哪，深红横幅广播（只广播，不改停采响应）
        if (typeof kills === 'number' && typeof prev.kills === 'number' && kills > prev.kills) {
            log(`%c🩸🩸 [杀手活跃] ${_killerLabel(playerName, playerId)} 自上次检查后清算了 ${kills - prev.kills} 只 kami！（累计 ${kills}）`,
                'color: white; background: darkred; font-size: 14px; font-weight: bold; padding: 2px;');
        }
        // 房间变化标注（move 痕迹；两次轮询间往返移动可由 time.last 变新暴露）
        if (typeof prev.room === 'number' && typeof acc?.roomIndex === 'number' && prev.room !== acc.roomIndex) {
            note += `｜刚移动: 房间${prev.room}→${acc.roomIndex}`;
        }
        store[playerId] = { name: playerName, room: acc?.roomIndex, last, kills, at: nowSec };
        __saveKillerActivity(store);
        return note;
    }

    function getRandomInterval() {
        return KILLER_CHECK_BASE + Math.floor(Math.random() * KILLER_CHECK_RANDOM);
    }

    // ============================================================
    // 【板块：日志函数】
    // ------------------------------------------------------------
    // ▍功能：统一日志出口，为每条日志加 [杀手监控][时间] 前缀（按配置时区），
    //   便于在控制台区分套件内多个脚本的混合输出。
    // ▍触发时机：脚本内所有输出均经由 log()（文件末尾的启动横幅
    //   直接用 console.log 除外）。
    // ▍依赖：仅 console.log，无外部依赖。
    // ▍核心流程：1) 当前时间按配置时区偏移后格式化为时间字符串；
    //   2) 若首参以 %c 开头（带 CSS 样式的输出），把前缀插到 %c
    //      之后，保证样式仍作用于整行；3) 否则前缀作为普通参数输出。
    // ▍边界与保护：%c 分支要求至少 2 个参数且首参为字符串，
    //   不满足则走普通输出分支，不会因样式参数缺失而报错。
    // ============================================================
    // 【时区设置】（v1.1.3 起）'auto'=自动跟随浏览器本地时区；也可写死数字（小时）：8=UTC+8、-5=UTC-5、5.5=UTC+5:30
    const TZ_OFFSET_HOURS = 'auto';
    const __TZ_OFFSET_MS = (TZ_OFFSET_HOURS === 'auto')
        ? -new Date().getTimezoneOffset() * 60 * 1000
        : Number(TZ_OFFSET_HOURS) * 60 * 60 * 1000;

    function log(...args) {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
            .toISOString()
            .replace('T', ' ')
            .substring(0, 19);

        const prefix = `[杀手监控][${beijingTime}]`;

        // 写入跨脚本共享日志缓冲（供核心 saveKamiLogs 导出、辅助健康看板特征反查）
        try {
            if (!Array.isArray(window.__kamiLogBuffer)) window.__kamiLogBuffer = [];
            const plainText = args.map(a => (typeof a === 'string' && a.startsWith('%c')) ? a.substring(2) : a).join(' ');
            window.__kamiLogBuffer.push(`${prefix} ${plainText}`);
        } catch (e) {}

        // 检查第一个参数是否以 %c 开头（用于样式化输出）
        if (args.length >= 2 && typeof args[0] === 'string' && args[0].startsWith('%c')) {
            // 把前缀插入到 %c 之后，这样样式才能生效
            const newText = '%c' + prefix + ' ' + args[0].substring(2);
            console.log(newText, ...args.slice(1));
        } else {
            console.log(prefix, ...args);
        }
    }

    log('%c✅ 轻量杀手监控-公开版 v1.2.2 已加载，等待启动...', 'font-size:16px;font-weight:bold;color:#fff;background:#2e7d32;padding:3px 10px;border-radius:4px');   // 🔻SYNC→内部版[1.1.14 启动横幅醒目化]

    // ============ [版本检查] 启动时对比 GitHub 最新版本，提示用户是否已更新 ============
    // 🔻SYNC→内部版[1.1.13 版本检查]（内部版无 GitHub 分发，同步时可整块跳过）
    (function versionCheck() {
        const SELF_NAME = '轻量杀手监控';
        const SELF_VERSION = '1.2.2';   // ⚠️ 版本仪式第6处：升版时必须同步改这里
        const META_URL = 'https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-killer-monitor.meta.js';
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
                // 🔻SYNC→内部版[1.1.15 版本检查降噪]（游戏 SPA 运行时注入 CSP meta 的 connect-src 白名单，raw 外联在游戏页永久失败）
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
    // 【板块：杀手名字显示防撞脸】（v1.1.10 起）
    // ------------------------------------------------------------
    // ▍功能：统一给所有"显示杀手账户名"的日志输出附加 accountId 短标，
    //   让日志/警报一眼可分同名或形近名的不同账户。
    // ▍起因：2026-07-08 #1129 命案根因之一是名字撞脸——真凶 T0nin
    //   （accountId 0xa2335…，数字 0）与整晚监控的挂机杀手 Ton1n
    //   （accountId 0x649e…，数字 1）名字极像，肉眼看错导致审计误判，
    //   连补录都补错账户。教训：名字不是可靠标识，一切以 accountId 为准。
    // ▍边界与保护：只改"显示"，不改变任何判定/轮询/告警触发逻辑——
    //   名字标签只影响 log 文本本身。
    // ============================================================
    // 🔻SYNC→内部版[1.1.10 名字防撞脸id标注]
    // 名字可撞脸（如 Ton1n 0x649e… vs T0nin 0xa2335…，数字1/0 之差），显示一律附 id 短标
    function _killerLabel(name, accountId) {
        const idShort = (typeof accountId === 'string' && accountId.length >= 7) ? accountId.slice(0, 7) + '…' : '(无id)';
        return `${name ?? '?'}(${idShort})`;
    }

    // ============================================================
    // 【板块：杀手 kami → 玩家映射】
    // ------------------------------------------------------------
    // ▍功能：启动时把名单里的每只杀手 kami 反查到其主人玩家账户，
    //   建立 playerId → { playerName, kamis[] } 的映射缓存。
    //   这是本脚本最核心的省 API 设计：kami 走到哪由玩家带着走，
    //   之后每轮只查"玩家在哪"（一个玩家往往带多只杀手），而不必
    //   逐只查 kami——单轮 API 调用从"名单长度 × 3 次"降到
    //   "玩家数 + 自家杀手数"次。
    // ▍触发时机：startKillerMonitor() 启动时执行一次；
    //   checkKillerPositions() 发现映射缺失时兜底重建；
    //   运行期改名单后手动 rebuildKillerMap() 重建。
    // ▍依赖：window.network.explorer 的查询接口
    //   （kamis.getByIndex / entities.get / accounts.getByID /
    //   accounts.getByOperator）、window.network.network.connectedAddress
    //   （当前钱包地址，用于识别自己的账户）。
    // ▍核心流程：1) 由钱包地址查出自己的 accountId 与账户名，供
    //   后续 owner 自检；2) 逐只查询名单里的 kami：
    //   kami → entity → OwnsKamiID → 主人账户；3) 若主人是自己
    //   （id 或 name 任一匹配即算，双重比对防某一字段缺失），该
    //   kami 移入 __selfOwnedKillerList 单独追踪——自家杀手部署在
    //   外面作战时，账户位置（人站在哪）不代表 kami 位置，必须用
    //   harvest.roomIndex 才准；4) 其余 kami 按主人归组进
    //   __killerPlayerMap；5) 自家杀手同步注册进全局集合
    //   window.MY_KILLER_KAMIS——核心脚本（部署/XP 喂食）与辅助
    //   脚本（升级/技能重置）会检查该集合并自动跳过这些 kami，
    //   避免把作战中的杀手当普通采集 kami 处理。
    // ▍边界与保护：
    //   - 拿不到自己账户信息时仅跳过自检（全部按外部杀手处理），
    //     不中断建映射；
    //   - 单只 kami 查询失败只计入 failCount 并继续，不影响其余；
    //   - MY_KILLER_KAMIS 若已被其他脚本创建则复用（仅在其不是
    //     Set 时才新建），注册前先查重，避免重复添加；
    //   - 映射结果同时挂到 window.__killerPlayerMap /
    //     window.__killerSelfOwned，方便在控制台直接查看。
    // ▍相关控制台命令：rebuildKillerMap() — 重建映射；
    //   listKillers() — 查看名单与当前映射。
    // ============================================================
    let __killerPlayerMap = {};  // playerId → { playerName, kamis: [] }
    let __selfOwnedKillerList = [];  // 当前账户名下的杀手 kami 索引列表（与 __killerPlayerMap 互斥）
    let __mappingBuilt = false;  // 映射是否已建立（防止检测在映射就绪前空跑）
    // （v1.1.9~1.1.10 曾在此维护 __dormantAlertLast 做"沉寂杀手警报降频"；v1.1.11 起
    //  沉寂杀手直接跳过停采，不再需要降频状态，随之移除——见上方 KILLER_INACTIVE_HOURS 处说明）

    /**
     * 建立 kami → player 映射（核心优化）
     * 启动时执行一次，后续检测只查 player 位置
     *
     * 自检 + 跨脚本注册：
     *   - 拿自己的 accountId + name 对比每只 kami 的 owner
     *   - 自家 kami → 移入单独的 __selfOwnedKillerList（不进 player map，
     *     因为自家账户的位置不代表已部署 kami 的位置）
     *     稍后 checkKillerPositions 用 harvest.roomIndex 单独跟踪它们的实际部署位置
     *   - 同时注册到 window.MY_KILLER_KAMIS：核心+辅助脚本据此跳过部署/升级/reset/XP喂食
     */
    async function buildKillerPlayerMap() {
        log('═══════════════════════════════════════════════════');
        log('%c🔧  正在建立杀手 kami → player 映射...', 'color: orange; font-weight: bold;');
        log('═══════════════════════════════════════════════════');

        // 先拿自己的 accountId + name，用于后面对比每只 kami 的 owner
        let myAccId = null, myAccName = null;
        try {
            const addr = window.network?.network?.connectedAddress?.value_
                      || window.network?.network?.connectedAddress?.value;
            if (addr) {
                const myAcc = await window.network.explorer.accounts.getByOperator(addr);
                myAccId = myAcc?.id ?? null;
                myAccName = myAcc?.name ?? null;
                log(`👤 当前账户: ${myAccName || '(unknown)'} (id=${myAccId || '?'})`);
            }
        } catch (e) {
            log(`⚠️ 无法获取自己 accountId，自检跳过：${e?.message || e}`);
        }

        __killerPlayerMap = {};
        __selfOwnedKillerList = [];     // 自家杀手的索引列表（单独跟踪，重建时清空重算）
        let successCount = 0;
        let failCount = 0;

        for (const kamiIndex of KILLER_KAMI_INDEXES) {
            try {
                const kamiInfo = await window.network.explorer.kamis.getByIndex(kamiIndex, { harvest: true });
                const entityRes = await window.network.explorer.entities.get(kamiInfo.entity);
                const ownerAccount = await window.network.explorer.accounts.getByID(entityRes.OwnsKamiID);

                const playerId = entityRes.OwnsKamiID;
                const playerName = ownerAccount.name;

                // 自检：owner 是不是自己？双重比对（id + name 任一匹配即算，防某一字段缺失漏判）
                const isSelfById   = myAccId   != null && playerId   === myAccId;
                const isSelfByName = myAccName != null && playerName === myAccName;
                if (isSelfById || isSelfByName) {
                    __selfOwnedKillerList.push(kamiIndex);
                    log(`  🛡️ Kami ${kamiIndex} 是自己(${_killerLabel(playerName, playerId)})名下 → 移入"自家杀手"单独追踪（用 harvest.roomIndex 而非账户位置）`);
                    continue;
                }

                if (!__killerPlayerMap[playerId]) {
                    __killerPlayerMap[playerId] = {
                        playerName: playerName,
                        kamis: []
                    };
                }
                __killerPlayerMap[playerId].kamis.push(kamiIndex);
                successCount++;

                log(`  ✓ Kami ${kamiIndex} → ${_killerLabel(playerName, playerId)}`);

            } catch (e) {
                failCount++;
                log(`  ✗ Kami ${kamiIndex} 查询失败: ${e?.message || e}`);
            }
        }

        const playerCount = Object.keys(__killerPlayerMap).length;
        __mappingBuilt = true;
        window.__killerMonitorState.mappingBuilt = true;

        // 自家杀手 → 同步到 window.MY_KILLER_KAMIS，让核心/辅助脚本自动跳过这些 kami
        let registered = 0;
        if (__selfOwnedKillerList.length > 0) {
            if (!(window.MY_KILLER_KAMIS instanceof Set)) {
                window.MY_KILLER_KAMIS = new Set();
            }
            for (const idx of __selfOwnedKillerList) {
                if (!window.MY_KILLER_KAMIS.has(idx)) {
                    window.MY_KILLER_KAMIS.add(idx);
                    registered++;
                }
            }
        }

        log('═══════════════════════════════════════════════════');
        log(`%c✅  映射建立完成！`, 'color: green; font-weight: bold;');
        log(`   ${successCount} 个外部杀手 kami → ${playerCount} 个 player`);
        if (failCount > 0) {
            log(`   ⚠️ ${failCount} 个查询失败`);
        }
        // 自家杀手汇总
        if (__selfOwnedKillerList.length > 0) {
            log(`%c   🛡️ ${__selfOwnedKillerList.length} 只自家杀手单独追踪：${__selfOwnedKillerList.map(i => '#' + i).join(', ')}`,
                'color: cyan; font-weight: bold;');
            if (registered > 0) {
                log(`%c   📌 同步 ${registered} 只到 window.MY_KILLER_KAMIS（让核心+辅助脚本跳过部署/升级/reset/XP喂食）`,
                    'color: cyan;');
            }
        }
        log(`   📈 优化效果: 每次检测 ${KILLER_KAMI_INDEXES.length * 3} 次API → ${playerCount + __selfOwnedKillerList.length} 次API`);
        log('═══════════════════════════════════════════════════');

        // 保存到 window 供调试
        window.__killerPlayerMap = __killerPlayerMap;
        window.__killerSelfOwned = __selfOwnedKillerList;  // 暴露自家杀手清单，方便控制台查看

        return __killerPlayerMap;
    }

    // ============================================================
    // 【板块：房间信息缓存】
    // ------------------------------------------------------------
    // ▍功能：按 roomIndex 缓存房间名与坐标。房间是静态数据，
    //   同一房间只查一次 API，之后直接读缓存，进一步省请求。
    // ▍触发时机：位置检测与邻居判断中每次需要房间信息时调用。
    // ▍依赖：window.network.explorer.rooms.getByIndex。
    // ▍核心流程：1) 命中缓存直接返回；2) 未命中则查询并缓存
    //   { index, name, location } 三个字段。
    // ▍边界与保护：查询失败时返回兜底对象（name 用 "Room N"
    //   占位、location 为 null），保证调用方不因异常中断；
    //   location 为 null 时邻居判断会自动按"非邻居"处理。
    // ============================================================
    const __roomCache = {};

    async function getRoomInfo(roomIndex) {
        if (__roomCache[roomIndex]) {
            return __roomCache[roomIndex];
        }
        try {
            const room = await window.network.explorer.rooms.getByIndex(roomIndex);
            __roomCache[roomIndex] = {
                index: roomIndex,
                name: room.name,
                location: room.location
            };
            return __roomCache[roomIndex];
        } catch (e) {
            return { index: roomIndex, name: `Room ${roomIndex}`, location: null };
        }
    }

    // ============================================================
    // 【板块：邻居地块判断】
    // ------------------------------------------------------------
    // ▍功能：判断两个房间在地图上是否相邻，供邻居预警使用。
    // ▍触发时机：NEIGHBOR_WARNING 开启时，每轮检测中对每个杀手
    //   玩家（以及自家杀手）所在房间调用一次。
    // ▍依赖：getRoomInfo 提供的 location 坐标（x/y/z）。
    // ▍核心流程：1) 同一房间直接返回 false——"同房间"由更高级别
    //   的同房警报分支处理，不算邻居；2) 任一房间缺坐标返回 false
    //   （宁可漏判邻居，也不用不完整数据误报）；3) 曼哈顿距离
    //   dx+dy === 1 且 dz === 0 判为相邻——只认同层的上下左右
    //   四邻，斜角、跨层都不算。
    // ============================================================
    async function isNeighborRoom(room1, room2) {
        if (room1 === room2) return false;
        const info1 = await getRoomInfo(room1);
        const info2 = await getRoomInfo(room2);
        if (!info1.location || !info2.location) return false;
        const dx = Math.abs(info1.location.x - info2.location.x);
        const dy = Math.abs(info1.location.y - info2.location.y);
        const dz = Math.abs(info1.location.z - info2.location.z);
        return (dx + dy === 1) && (dz === 0);
    }

    // ============================================================
    // 【板块：获取自己的位置】
    // ------------------------------------------------------------
    // ▍功能：读取当前登录账户所在的房间号（玩家本体位置），
    //   作为每轮检测的比对基准。
    // ▍触发时机：checkKillerPositions 每轮开头调用一次。
    // ▍依赖：window.network.network.connectedAddress（当前钱包
    //   地址）、accounts.getByOperator（地址 → 账户）。
    // ▍边界与保护：任一环节异常返回 null；调用方看到 null 会
    //   直接跳过本轮检测，而不是带着错误位置去误判。
    // ============================================================
    function getMyRoomIndex() {
        try {
            const addr = window.network.network.connectedAddress.value_;
            const acc = window.network.explorer.accounts.getByOperator(addr);
            return acc.roomIndex;
        } catch (e) {
            return null;
        }
    }

    // ============================================================
    // 【板块：触发紧急停采（联动核心脚本）】
    // ------------------------------------------------------------
    // ▍功能：检测到威胁时调用核心脚本暴露的
    //   window.emergencyStopHarvest()，触发一轮紧急停采扫描（只停
    //   触及停采线/危险线的 kami，并非全量收回）。
    // ▍触发时机：checkKillerPositions 命中"同房间警报"或
    //   "邻居预警"分支时调用。
    // ▍依赖：核心脚本已加载并挂出 window.emergencyStopHarvest；
    //   window.__kamiCallSource 是套件内的"调用者自报身份"约定。
    // ▍核心流程：1) 确认 emergencyStopHarvest 存在；2) 先把
    //   __kamiCallSource 置为 'killer_monitor'，让核心脚本知道这次
    //   停采是杀手监控自动触发的（区别于用户手动操作），按自动化
    //   调用的路径处理；3) 执行停采并返回 true。
    // ▍边界与保护：核心脚本未加载时仅记日志并返回 false——本脚本
    //   支持独立运行，此时只有告警能力、没有自动停采能力（降级）。
    // ============================================================
    function triggerEmergencyStop(reason) {
        if (typeof window.emergencyStopHarvest === 'function') {
            log(`⚡ 触发紧急停采！原因: ${reason}`);
            window.__kamiCallSource = 'killer_monitor';  // 向核心脚本 wrapManual 自报身份
            window.emergencyStopHarvest();
            return true;
        } else {
            log(`❌ 未找到 emergencyStopHarvest 函数，核心脚本可能未加载`);
            return false;
        }
    }

    // ============================================================
    // 【板块：杀手位置检测（轮询主函数）】
    // ------------------------------------------------------------
    // ▍功能：执行一轮位置检测。外部杀手按"主人玩家的位置"判断
    //   威胁；自家杀手按 harvest.roomIndex（实际部署地块）只做
    //   动向记录，不告警。
    // ▍触发时机：startKillerMonitor 启动后立即执行一次，之后由
    //   scheduleNextCheck 按随机间隔循环调用；也可在控制台手动
    //   执行 checkKillerPositions() 立即查一轮。
    // ▍依赖：__killerPlayerMap / __selfOwnedKillerList（建映射的
    //   产物）、accounts.getByID（查玩家位置）、kamis.getByIndex
    //   （查自家杀手部署状态）、getRoomInfo / isNeighborRoom、
    //   triggerEmergencyStop（联动核心脚本）。
    // ▍核心流程：
    //   1) 映射未建立或为空 → 先兜底建映射再继续；
    //   2) 取自己位置；取不到则整轮跳过（不带错误基准硬判）；
    //   3) 遍历每个杀手玩家，查其账户 roomIndex：
    //      - 同房间/相邻地块（NEIGHBOR_WARNING 开启时）→ 先查活跃度门槛
    //        （v1.1.11 起）：主人超过 KILLER_INACTIVE_HOURS（默认 24 小时）
    //        无链上动作 → 判定"不玩了"，只打一行低调提示，不告警不停采，
    //        continue 继续查完名单；否则视为活跃威胁，同房间打红色大横幅、
    //        邻居打橙色预警，并触发一次停采（每轮至多一次）后继续查完全
    //        名单，保证全员位置/活跃度情报完整——保护力度不打折扣；
    //        提前一格反应，赶在杀手进场前收 kami；
    //      - 其他位置 → 记一条"安全"日志，继续查下一个玩家；
    //   4) 遍历自家杀手，逐只查 kami 本体：
    //      - 状态非 HARVESTING 或无 harvest.roomIndex → 视为未部署，
    //        仅记录状态；
    //      - 与我同地块 → 只提示"无威胁"：游戏机制上自己的杀手
    //        不会攻击自家 kami（没有 friendly fire／友军误伤机制），所以不告警、
    //        不触发停采；
    //      - 在其他地块（含邻居）→ 记"远程作战中"，纯信息性日志；
    //   5) 输出本轮实际 API 调用次数，便于核对省请求效果。
    // ▍边界与保护：单个玩家/单只 kami 查询失败只记日志并继续，
    //   不影响其余目标；自家杀手分支永不触发停采；命中威胁后用
    //   stopTriggeredThisRound 标记保证同一轮至多触发一次停采，
    //   后续命中只告警不重复触发（早年命中即 return 会让名单里
    //   排在命中者之后的玩家整轮零监控，活跃度快照也不更新）。
    // ▍相关控制台命令：checkKillerPositions() — 手动执行一轮检测。
    // ============================================================
    async function checkKillerPositions() {
        window.__killerMonitorState.lastRoundAt = Date.now();   // 每轮轮询起点（健康看板判活）
        // 检查映射是否已建立
        if (!__mappingBuilt || Object.keys(__killerPlayerMap).length === 0) {
            log('⚠️ 杀手映射尚未建立，先建立映射...');
            await buildKillerPlayerMap();
        }

        const myRoom = getMyRoomIndex();
        if (myRoom === null) {
            log('⚠️ 无法获取自己位置，跳过本次检测');
            return;
        }

        const myRoomInfo = await getRoomInfo(myRoom);
        const playerCount = Object.keys(__killerPlayerMap).length;
        log(`🔍 我的位置:【${myRoomInfo.name}】(房间${myRoom})，检测 ${playerCount} 个杀手玩家...`);

        let apiCallCount = 0;

        // 核心优化：只遍历 player，不遍历每个 kami（一个玩家往往带多只杀手，查一次玩家位置即覆盖其名下全部杀手）
        let stopTriggeredThisRound = false;   // 本轮是否已触发过紧急停采（每轮至多一次；命中后继续查完全名单，不再提前 return）
        // 🔻SYNC→内部版[1.1.10 名字防撞脸id标注]：以下循环内所有杀手名字显示改用 _killerLabel(name, playerId)
        for (const [playerId, playerInfo] of Object.entries(__killerPlayerMap)) {
            try {
                const acc = await window.network.explorer.accounts.getByID(playerId);
                apiCallCount++;
                // 活跃度标注（复用本次已取的 acc，零额外查询）
                const activityNote = __trackKillerActivity(playerId, playerInfo.playerName, acc);

                const playerRoom = acc.roomIndex;
                const killerRoomInfo = await getRoomInfo(playerRoom);
                const inSameRoom = playerRoom === myRoom;
                const inNeighbor = NEIGHBOR_WARNING && await isNeighborRoom(myRoom, playerRoom);

                const kamiListStr = playerInfo.kamis.map(k => `Kami ${k}`).join(', ');

                // 活跃度门槛（v1.1.11 起，同房间/邻居两分支共用，见上方 KILLER_INACTIVE_HOURS 处说明）：
                // 主人多久没有链上动作了（acc.time.last 是位置轮询已拿到的账户对象自带字段，零额外查询）。
                // 🔻SYNC→内部版[1.1.11 沉寂杀手24h活跃度门槛]
                // 读不到/非正数时按 0（=活跃）处理，保守：拿不准就照常停采，绝不因数据缺失而漏防。
                const inactiveHours = (acc?.time?.last > 0) ? (Date.now() / 1000 - acc.time.last) / 3600 : 0;

                if (inSameRoom) {
                    if (inactiveHours > KILLER_INACTIVE_HOURS) {
                        // 沉寂杀手：主人判定"不玩了"，不告警不停采，continue 继续查名单其余玩家
                        // （沿用 1.1.9 起的教训：命中即 return 会让排在后面的玩家整轮零监控）
                        log(`⚪ [沉寂杀手/跳过] ${_killerLabel(playerInfo.playerName, playerId)} 在【${killerRoomInfo.name}】(你房间)，但主人 ${inactiveHours.toFixed(1)}h 未动作 → 判不玩，跳过停采`);
                        continue;
                    }

                    // 活跃杀手（<= 24h）：行为与 v1.1.10 之前完全一致
                    log(`%c🚨🚨🚨 [同房间警报] 杀手 ${_killerLabel(playerInfo.playerName, playerId)} 在【${killerRoomInfo.name}】！`,
                        'color: white; background: red; font-size: 16px; font-weight: bold; padding: 4px;');
                    log(`   杀手位置: 【${killerRoomInfo.name}】(房间${playerRoom})`);
                    log(`   我的位置: 【${myRoomInfo.name}】(房间${myRoom})`);
                    log(`   监控中的 ${_killerLabel(playerInfo.playerName, playerId)} 名下杀手: ${kamiListStr}`);
                    log(`   活跃度: ${activityNote}`);

                    // 每轮至多触发一次停采，然后 continue 查完名单剩余玩家（保证全员位置/活跃度
                    // 情报完整，也让循环后的"自家杀手位置追踪"必然可达）
                    if (!stopTriggeredThisRound) {
                        triggerEmergencyStop(`杀手 ${_killerLabel(playerInfo.playerName, playerId)} 在【${killerRoomInfo.name}】(房间${playerRoom})`);
                        stopTriggeredThisRound = true;
                    } else {
                        log(`   （本轮已触发过紧急停采，不重复触发）`);
                    }
                    continue;

                } else if (inNeighbor) {
                    if (inactiveHours > KILLER_INACTIVE_HOURS) {
                        // 沉寂杀手：与同房间分支同一门槛、同一判定，跳过停采
                        log(`⚪ [沉寂杀手/跳过] ${_killerLabel(playerInfo.playerName, playerId)} 在隔壁【${killerRoomInfo.name}】，但主人 ${inactiveHours.toFixed(1)}h 未动作 → 判不玩，跳过停采`);
                        continue;
                    }

                    log(`%c⚠️⚠️ [邻居预警] 杀手 ${_killerLabel(playerInfo.playerName, playerId)} 在隔壁【${killerRoomInfo.name}】！`,
                        'color: white; background: orange; font-size: 14px; font-weight: bold; padding: 2px;');
                    log(`   杀手位置: 【${killerRoomInfo.name}】(房间${playerRoom})`);
                    log(`   我的位置: 【${myRoomInfo.name}】(房间${myRoom})`);
                    log(`   监控中的 ${_killerLabel(playerInfo.playerName, playerId)} 名下杀手: ${kamiListStr}`);
                    log(`   活跃度: ${activityNote}`);
                    // 邻居预警同样停采：提前一格反应，赶在杀手进场前收回 kami；
                    // 同样每轮至多触发一次，然后继续查完名单剩余玩家
                    if (!stopTriggeredThisRound) {
                        triggerEmergencyStop(`杀手 ${_killerLabel(playerInfo.playerName, playerId)} 在隔壁【${killerRoomInfo.name}】(房间${playerRoom})`);
                        stopTriggeredThisRound = true;
                    } else {
                        log(`   （本轮已触发过紧急停采，不重复触发）`);
                    }
                    continue;

                } else {
                    log(`✅ ${_killerLabel(playerInfo.playerName, playerId)} 在【${killerRoomInfo.name}】(房间${playerRoom})，安全（${activityNote}）`);
                }

            } catch (e) {
                log(`⚠️ 查询玩家 ${_killerLabel(playerInfo.playerName, playerId)} 失败: ${e?.message || e}`);
            }
        }

        // 自家杀手位置追踪：用 kami.harvest.roomIndex（实际部署地块）而非账户位置——
        // 杀手部署在外面作战时人未必跟着，账户位置不可靠
        // 注意：自己的杀手不会攻击自家 kami（无 friendly fire），所以仅记录位置不告警/不触发停采
        if (__selfOwnedKillerList.length > 0) {
            log(`🛡️ 检测 ${__selfOwnedKillerList.length} 只自家杀手的实际部署位置...`);
            for (const idx of __selfOwnedKillerList) {
                try {
                    const info = await window.network.explorer.kamis.getByIndex(idx, { harvest: true });
                    apiCallCount++;
                    const state = String(info?.state || '').toUpperCase();   // kami 当前状态（HARVESTING = 部署采集/作战中）
                    const kamiRoom = info?.harvest?.roomIndex ?? null;       // 实际部署地块（未部署则为 null）

                    if (state !== 'HARVESTING' || kamiRoom == null) {
                        log(`  自家杀手 #${idx}: ${state || '未知状态'}（未部署）`);
                        continue;
                    }

                    const kamiRoomInfo = await getRoomInfo(kamiRoom);
                    if (kamiRoom === myRoom) {
                        log(`%c  ℹ️ 自家杀手 #${idx} 与我同地块【${kamiRoomInfo.name}】(房间${kamiRoom})（不攻击自家 kami，无威胁）`,
                            'color: #00aa66;');
                    } else {
                        const inNeighbor = NEIGHBOR_WARNING && await isNeighborRoom(myRoom, kamiRoom);
                        if (inNeighbor) {
                            log(`%c  🗡️ 自家杀手 #${idx} 部署在隔壁【${kamiRoomInfo.name}】(房间${kamiRoom})，远程作战中`,
                                'color: #888;');
                        } else {
                            log(`%c  🗡️ 自家杀手 #${idx} 部署在【${kamiRoomInfo.name}】(房间${kamiRoom})，远程作战中`,
                                'color: #888;');
                        }
                    }
                } catch (e) {
                    log(`  ⚠️ 自家杀手 #${idx} 查询失败: ${e?.message || e}`);
                }
            }
        }

        // 命中威胁的轮次不再提前 return，所以收尾语按本轮是否触发过停采分流（避免"暂时安全"误导）
        if (stopTriggeredThisRound) {
            log(`✅ 检测完成，本轮已触发紧急停采 (本次API请求: ${apiCallCount})`);
        } else {
            log(`✅ 检测完成，暂时安全 (本次API请求: ${apiCallCount})`);
        }
    }

    // ============================================================
    // 【板块：API 杀手监控 — 启动/停止与调度】
    // ------------------------------------------------------------
    // ▍功能：监控的生命周期管理。startKillerMonitor 负责建映射 +
    //   立即首检 + 排定循环；stopKillerMonitor 清定时器并停机。
    // ▍触发时机：页面加载 INITIAL_DELAY 后自动启动（见文件末尾
    //   "延迟自动启动"板块）；也可在控制台随时手动启停。
    // ▍依赖：buildKillerPlayerMap / checkKillerPositions /
    //   getRandomInterval。
    // ▍核心流程：1) startKillerMonitor 先查 __monitorRunning，已在
    //   运行则只提示不重入；2) 置运行标记后依次执行：建映射 →
    //   立即检测一轮 → scheduleNextCheck 排下一轮；3) 调度用
    //   setTimeout 链式自调度而非固定 setInterval——每轮间隔独立
    //   随机，且上一轮检测完才排下一轮，慢速网络下不会堆积并发；
    //   4) 定时器回调触发前后都复查 __monitorRunning，停机后残留
    //   的回调会直接退出；5) stopKillerMonitor 清标记 + 清定时器。
    // ▍边界与保护：重复启动防重入；停止后定时器句柄置 null 防
    //   悬挂引用；运行标记与定时器双重把关，停止指令在任意时点
    //   都能生效。
    // ▍相关控制台命令：startKillerMonitor() — 启动；
    //   stopKillerMonitor() — 停止。
    // ============================================================
    let __killerMonitorTimer = null;   // 当前待执行的 setTimeout 句柄
    let __monitorRunning = false;      // 监控运行标记（启停总开关）
    // 运行态快照（挂 window 供辅助健康看板直读；上面的闭包变量外部读不到）
    window.__killerMonitorState = { running: false, mappingBuilt: false, lastRoundAt: 0 };

    function scheduleNextCheck() {
        if (!__monitorRunning) return;

        const interval = getRandomInterval();
        log(`⏱️ 下次检测: ${(interval / 1000).toFixed(0)} 秒后 (${(interval / 60000).toFixed(1)} 分钟)`);

        __killerMonitorTimer = setTimeout(async () => {
            if (!__monitorRunning) return;
            await checkKillerPositions();
            scheduleNextCheck();
        }, interval);
    }

    async function startKillerMonitor() {
        if (__monitorRunning) {
            log('⚠️ API杀手监控已在运行中');
            return;
        }

        __monitorRunning = true;
        window.__killerMonitorState.running = true;

        log('%c🛡️ 启动 API 杀手位置监控 ', 'color: green; font-weight: bold; font-size: 14px;');
        log(`   基础间隔: ${KILLER_CHECK_BASE / 60000} 分钟`);
        log(`   随机范围: 0-${KILLER_CHECK_RANDOM / 1000} 秒`);
        log(`   杀手 kami 数量: ${KILLER_KAMI_INDEXES.length}`);
        log(`   邻居预警: ${NEIGHBOR_WARNING ? '开启' : '关闭'}`);

        // 先建立映射，再开始监控
        await buildKillerPlayerMap();

        // 立即执行一次检测
        await checkKillerPositions();

        // 开始定时检测
        scheduleNextCheck();
    }

    function stopKillerMonitor() {
        __monitorRunning = false;
        window.__killerMonitorState.running = false;
        if (__killerMonitorTimer) {
            clearTimeout(__killerMonitorTimer);
            __killerMonitorTimer = null;
        }
        log('🛑 API杀手监控已停止');
    }

    // ============================================================
    // 【板块：Feed 监控模块】（⚠️ 已停用的历史功能）
    // ------------------------------------------------------------
    // ▍状态：现已不再监控 Feed。本模块代码仅作保留，默认不启动，
    //   不建议手动启用；杀手保护由前面的位置轮询模块承担。
    //   注意：核心脚本"检测到杀手自动切安全停采线"依赖本模块写入的
    //   __killerDetected 标记——本模块停用后该路径默认不生效。
    // ▍功能：监听游戏内 Chat→Feed 频道的 liquidated（清算）消息，
    //   感知"全图正在发生击杀"的整体风向。与上面按名单监控已知
    //   杀手不同，Feed 监控不需要预先知道杀手是谁——任何清算行为
    //   都会计数。检测结果只体现为全局标记 window.__killerDetected
    //   （安全模式），供套件内其他脚本决定是否收紧策略；本模块
    //   自身不直接触发紧急停采。
    // ▍触发时机：默认不启动，需手动执行 startFeedMonitor()。
    // ▍依赖：游戏页面 DOM（#chat-button / #chat / #feed）、
    //   MutationObserver；不依赖链上 API。
    // ▍核心流程：1) 打开 Chat 窗口并切到 Feed 标签页；2) 先扫描
    //   已有的历史消息补记时间戳；3) 挂 MutationObserver 实时捕捉
    //   新增的 liquidated 消息；4) 每 FEED_CHECK_INTERVAL 巡检一次
    //   计数与冷却状态，并保活 Chat 窗口（被关掉则自动重开）。
    // ▍边界与保护：打不开 Chat / 找不到 #feed 时不放弃，
    //   FEED_CHECK_INTERVAL 后自动重试；重复启动只提示不重入；
    //   刻意不做 hover 取名（hover 会在页面上残留 tooltip，
    //   干扰界面），只统计消息条数。
    // ▍可调参数：见文件前部【Feed 监控配置】板块。
    // ▍相关控制台命令：startFeedMonitor() — 启动；
    //   stopFeedMonitor() — 停止。
    // ============================================================

    let __feedMonitorRunning = false;  // Feed 监控运行标记（防重复启动）
    let __feedObserver = null;         // 监听 Feed 新消息的 MutationObserver
    let __feedCheckTimer = null;       // 定期巡检杀手状态的 setInterval 句柄
    let __feedWindowTimer = null;      // 定期保活 Chat 窗口的 setInterval 句柄

    // 延迟函数（Promise 版 sleep，供 DOM 操作之间等待渲染）
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 获取自己的房间索引（Feed 监控用的容错版；当前主流程未调用，保留备用）
    function __getFeedMyRoomIndex() {
        try {
            const addr = window.network?.network?.connectedAddress?.value_;
            if (!addr) return null;
            const acc = window.network.explorer.accounts.getByOperator(addr);
            return acc?.roomIndex ?? null;
        } catch (e) {
            return null;
        }
    }

    // 周期巡检：清理过期击杀记录，判断进入/退出安全模式（冷却恢复靠这里驱动）
    function checkFeedKillerStatus() {
        const now = Date.now();

        // 清理滑出窗口的过期 liquidated 记录
        window.__liquidatedTimestamps = window.__liquidatedTimestamps.filter(
            ts => now - ts < LIQUIDATE_WINDOW_MS
        );

        // 窗口内击杀条数达到阈值 → 进入安全模式（置全局标记）
        if (window.__liquidatedTimestamps.length >= LIQUIDATE_COUNT_TRIGGER) {
            if (!window.__killerDetected) {
                log('%c🚨 [Feed监控] 检测到杀手活动！切换到安全模式', 'color: red; font-weight: bold;');
                window.__killerDetected = true;
                window.__lastKillerTime = now;
            }
        }

        // 冷却恢复：距最后一次击杀满 SAFE_COOLDOWN_MS 才退出安全模式
        if (window.__killerDetected) {
            const cooldownRemain = SAFE_COOLDOWN_MS - (now - window.__lastKillerTime);
            if (cooldownRemain <= 0) {
                log('%c✅ [Feed监控] 安全冷却结束，恢复贪婪模式', 'color: green; font-weight: bold;'); // 🔻SYNC→内部版[1.1.12 饥饿模式改名贪婪模式]：文案改名，已停用模块不影响行为
                window.__killerDetected = false;
            } else {
                log(`⏱️ [Feed监控] 安全模式中，${Math.ceil(cooldownRemain / 60000)} 分钟后恢复`);
            }
        }
    }

    // 检测到 liquidated（清算）消息时的处理：记时间戳并按窗口计数判断是否触发安全模式
    async function onLiquidatedDetected(text, element) {
        const now = Date.now();

        // 记录时间戳（同时刷新"最近一次杀手活动"时间，冷却从这里重新计时）
        window.__liquidatedTimestamps.push(now);
        window.__lastKillerTime = now;

        // 清理滑出窗口的过期记录
        window.__liquidatedTimestamps = window.__liquidatedTimestamps.filter(
            ts => now - ts < LIQUIDATE_WINDOW_MS
        );

        const count = window.__liquidatedTimestamps.length;
        log(`🔪 [Feed监控] 检测到击杀消息 (5分钟内第 ${count} 条)`);

        // 窗口内计数达到阈值且尚未进入安全模式 → 立即置全局标记
        if (count >= LIQUIDATE_COUNT_TRIGGER && !window.__killerDetected) {
            log('%c🚨 [Feed监控] 5分钟内 ≥2 条击杀！切换到安全模式', 'color: red; font-weight: bold;');
            window.__killerDetected = true;
        }

        // 刻意不解析击杀者/受害者名字：hover 取名会在页面上残留 tooltip，干扰界面
    }

    // 打开 Chat 窗口并切换到 Feed 标签页（返回是否成功；每步操作后等待 DOM 渲染）
    async function openChatAndSwitchToFeed() {
        log('📱 [Feed监控] 检查 Chat/Feed 窗口...');

        let chatWindow = document.querySelector('#chat');
        let isVisible = chatWindow && window.getComputedStyle(chatWindow).display !== 'none';

        if (!isVisible) {
            const chatBtnContainer = document.querySelector('#chat-button');
            const chatBtn = chatBtnContainer?.querySelector('button');

            if (chatBtn) {
                log('🖱️ [Feed监控] 点击 #chat-button 打开 Chat 窗口...');
                chatBtn.click();
                await delay(1500);
                chatWindow = document.querySelector('#chat');
                isVisible = chatWindow && window.getComputedStyle(chatWindow).display !== 'none';
            } else {
                log('❌ [Feed监控] 未找到 #chat-button');
                return false;
            }
        }

        if (!isVisible) {
            log('❌ [Feed监控] Chat 窗口未能打开');
            return false;
        }
        log('✅ [Feed监控] Chat 窗口已打开');

        const feedArea = document.querySelector('#feed');
        if (!feedArea) {
            log('❌ [Feed监控] 未找到 #feed 区域');
            return false;
        }

        const buttons = feedArea.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.trim() === 'Feed') {
                if (btn.disabled) {
                    log('✅ [Feed监控] 已经在 Feed 标签页');
                } else {
                    log('🖱️ [Feed监控] 点击 Feed 按钮...');
                    btn.click();
                    await delay(800);
                    log('✅ [Feed监控] 已切换到 Feed 标签页');
                }
                break;
            }
        }

        return true;
    }

    // 启动 Feed 监控
    async function startFeedMonitor() {
        if (__feedMonitorRunning) {
            log('⚠️ [Feed监控] 已在运行中');
            return;
        }

        log('═══════════════════════════════════════════════════');
        log('%c🔍 [Feed监控] 启动 Feed 杀手监控器...', 'color: orange; font-weight: bold;');
        log('═══════════════════════════════════════════════════');

        const opened = await openChatAndSwitchToFeed();
        if (!opened) {
            log('⚠️ [Feed监控] 无法打开 Feed，3分钟后重试');
            setTimeout(() => startFeedMonitor(), FEED_CHECK_INTERVAL);
            return;
        }

        const feedArea = document.querySelector('#feed');
        if (!feedArea) {
            log('❌ [Feed监控] #feed 不存在，3分钟后重试');
            setTimeout(() => startFeedMonitor(), FEED_CHECK_INTERVAL);
            return;
        }

        const contentArea = feedArea.children[1];
        if (!contentArea) {
            log('❌ [Feed监控] 未找到 #feed 内容区，3分钟后重试');
            setTimeout(() => startFeedMonitor(), FEED_CHECK_INTERVAL);
            return;
        }

        // 扫描已有的历史 liquidated 消息（含 img 的 span 才是击杀消息本体，避免把纯文本误计）
        const allSpans = contentArea.querySelectorAll('span');
        const liquidatedMsgs = Array.from(allSpans).filter(span =>
            span.textContent.toLowerCase().includes('liquidat') &&
            span.querySelector('img')
        );

        if (liquidatedMsgs.length > 0) {
            log(`📊 [Feed监控] 扫描到 ${liquidatedMsgs.length} 条历史击杀消息`);
            for (const msg of liquidatedMsgs) {
                await onLiquidatedDetected(msg.textContent, msg);
            }
        }

        // 设置 MutationObserver：实时捕捉 Feed 区新增节点里的 liquidated 消息
        __feedObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;  // 只处理元素节点，跳过文本/注释节点
                    const text = node.textContent || '';
                    if (text.toLowerCase().includes('liquidat')) {
                        log(`🆕 [Feed监控] 检测到新的 liquidated 消息`);
                        onLiquidatedDetected(text, node);
                    }
                }
            }
        });

        __feedObserver.observe(contentArea, { childList: true, subtree: true });
        __feedMonitorRunning = true;
        log('%c✅ [Feed监控] MutationObserver 已启动，实时监控中...', 'color: green; font-weight: bold;');

        // 定期巡检杀手状态（FEED_CHECK_INTERVAL；冷却恢复由这条定时器驱动）
        __feedCheckTimer = setInterval(() => {
            checkFeedKillerStatus();
        }, FEED_CHECK_INTERVAL);

        // 定期保活：Chat 窗口被关掉时自动重开（MutationObserver 依赖窗口存在才能收到新消息）
        __feedWindowTimer = setInterval(async () => {
            const chat = document.querySelector('#chat');
            const isVisible = chat && window.getComputedStyle(chat).display !== 'none';
            if (!isVisible) {
                log('🔄 [Feed监控] Chat 窗口已关闭，重新打开...');
                await openChatAndSwitchToFeed();
            }
        }, FEED_CHECK_INTERVAL);
    }

    // 停止 Feed 监控：断开 observer、清掉两条定时器、复位运行标记
    function stopFeedMonitor() {
        if (__feedObserver) {
            __feedObserver.disconnect();
            __feedObserver = null;
        }
        if (__feedCheckTimer) {
            clearInterval(__feedCheckTimer);
            __feedCheckTimer = null;
        }
        if (__feedWindowTimer) {
            clearInterval(__feedWindowTimer);
            __feedWindowTimer = null;
        }
        __feedMonitorRunning = false;
        log('🛑 [Feed监控] 已停止');
    }

    // ============================================================
    // 【板块：控制台命令挂载】
    // ------------------------------------------------------------
    // ▍功能：把监控启停、手动检测、映射重建与名单管理挂到
    //   window，供用户在浏览器控制台（F12）直接调用。
    // ▍触发时机：脚本加载即挂载，之后随时可用。
    // ▍依赖：无额外依赖；名单管理只操作内存中的数组。
    // ▍边界与保护：addKiller 先查重、removeKiller 先确认存在，
    //   避免误操作；两者都会提示需要执行 rebuildKillerMap() 改动
    //   才会进入监控；运行期增删只影响当前页面会话，刷新页面后
    //   恢复为脚本内写死的名单。
    // ▍相关控制台命令：
    //   startKillerMonitor()   — 启动 API 位置监控
    //   stopKillerMonitor()    — 停止 API 位置监控
    //   checkKillerPositions() — 立即手动检测一轮
    //   rebuildKillerMap()     — 重建杀手→玩家映射（改名单后必做）
    //   startFeedMonitor()     — 启动 Feed 清算消息监控
    //   stopFeedMonitor()      — 停止 Feed 监控
    //   addKiller(index)       — 临时添加杀手（不写回脚本文件）
    //   removeKiller(index)    — 临时移除杀手（不写回脚本文件）
    //   listKillers()          — 查看名单与玩家映射
    // ============================================================

    // API 杀手监控
    window.startKillerMonitor = startKillerMonitor;
    window.stopKillerMonitor = stopKillerMonitor;
    window.checkKillerPositions = checkKillerPositions;

    // 重建映射
    window.rebuildKillerMap = buildKillerPlayerMap;

    // Feed 监控
    window.startFeedMonitor = startFeedMonitor;
    window.stopFeedMonitor = stopFeedMonitor;

    // 杀手列表管理
    window.addKiller = (index) => {
        if (KILLER_KAMI_INDEXES.includes(index)) {
            log(`⚠️ Kami ${index} 已在杀手列表中`);
            return;
        }
        KILLER_KAMI_INDEXES.push(index);
        log(`✅ 已添加杀手 Kami ${index}`);
        log('💡 提示: 运行 rebuildKillerMap() 更新映射');
        log('当前列表:', KILLER_KAMI_INDEXES);
    };

    window.removeKiller = (index) => {
        const idx = KILLER_KAMI_INDEXES.indexOf(index);
        if (idx === -1) {
            log(`⚠️ Kami ${index} 不在杀手列表中`);
            return;
        }
        KILLER_KAMI_INDEXES.splice(idx, 1);
        log(`✅ 已移除杀手 Kami ${index}`);
        log('💡 提示: 运行 rebuildKillerMap() 更新映射');
        log('当前列表:', KILLER_KAMI_INDEXES);
    };

    window.listKillers = () => {
        log('=== 杀手 Kami 列表 ===');
        log(KILLER_KAMI_INDEXES);
        if (__mappingBuilt) {
            log('=== Player 映射 ===');
            for (const [playerId, info] of Object.entries(__killerPlayerMap)) {
                log(`  ${_killerLabel(info.playerName, playerId)}: Kami ${info.kamis.join(', ')}`);
            }
        }
        // 活跃度一览（读上次轮询的快照，零查询）
        const __act = __loadKillerActivity();
        if (Object.keys(__act).length) {
            log('=== 活跃度（上次轮询快照）===');
            const __nowSec = Math.floor(Date.now() / 1000);
            for (const [__aid, a] of Object.entries(__act)) {
                log(`  ${_killerLabel(a.name, __aid)}: 最近动作 ${typeof a.last === 'number' ? __fmtAgo(__nowSec - a.last) : '未知'}｜累计击杀 ${a.kills ?? '?'}｜房间 ${a.room ?? '?'}`);
            }
        }
    };

    // ============================================================
    // 【板块：延迟自动启动（仅 API 位置监控）】
    // ------------------------------------------------------------
    // ▍功能：页面加载 INITIAL_DELAY（150 秒）后自动启动 API 杀手
    //   位置监控；Feed 监控不自动启动，需手动开启。
    // ▍触发时机：脚本加载即排定一次性 setTimeout。
    // ▍依赖：核心脚本的 window.emergencyStopHarvest（可选依赖）。
    // ▍核心流程：1) 到点先探测 emergencyStopHarvest 是否存在——
    //   不存在说明核心脚本未加载，提示"仍会运行但无法触发紧急
    //   停采"（独立运行降级：只告警、不停采）；2) 无论核心脚本
    //   是否在场，随后都照常启动 startKillerMonitor。
    // ▍边界与保护：150 秒延迟给游戏页面、链上接口与核心脚本留足
    //   初始化时间，避免启动即建映射失败。
    // ============================================================
    log(`⏳ 等待 ${INITIAL_DELAY / 1000} 秒后自动启动 API 杀手监控...`);
    log(`ℹ️ Feed 监控为已停用的历史功能，默认关闭`);

    setTimeout(() => {
        // 探测核心脚本是否在场：不在也照常运行，只是降级为"仅告警"
        if (typeof window.emergencyStopHarvest !== 'function') {
            log('⚠️ 核心脚本未检测到，杀手监控仍会运行但无法触发紧急停采');
        }
        startKillerMonitor();
    }, INITIAL_DELAY);

    // ============================================================
    // 【板块：启动横幅（控制台使用说明）】
    // ------------------------------------------------------------
    // ▍功能：脚本加载时在控制台打印一次命令清单与要点速览，
    //   内容与上面"控制台命令挂载"板块一致。
    // ▍触发时机：脚本加载立即输出（早于 150 秒的延迟自动启动）。
    // ============================================================
    console.log('═══════════════════════════════');
    console.log('%c🛡️ Kamigotchi轻量杀手监控-公开版 v1.2.2 已加载', 'color: green; font-weight: bold;');
    console.log('');
    console.log('【杀手监控优化】');
    console.log('  启动时建立 kami→player 映射，每次检测只查 player 位置');
    console.log('  API请求按玩家聚合查询，大幅减少（实际次数见运行日志）');
    console.log('%c  自家 kami 用 harvest.roomIndex 单独追踪 + 同步到 MY_KILLER_KAMIS', 'color: cyan;');
    console.log('%c    需配合核心脚本与辅助脚本使用，才能完整跳过部署/升级/reset', 'color: cyan;');
    console.log('');
    console.log('【API 杀手位置监控】（自动启动）');
    console.log('  startKillerMonitor()   - 启动');
    console.log('  stopKillerMonitor()    - 停止');
    console.log('  checkKillerPositions() - 手动检测');
    console.log('  rebuildKillerMap()     - 重建映射');
    console.log('');
    console.log('【Feed 监控】（已停用的历史功能）');
    console.log('  startFeedMonitor()     - 启动');
    console.log('  stopFeedMonitor()      - 停止');
    console.log('');
    console.log('【杀手列表】');
    console.log('  addKiller(12345)       - 添加');
    console.log('  removeKiller(12345)    - 移除');
    console.log('  listKillers()          - 查看');
    console.log('══════════════════════════════');

})();
