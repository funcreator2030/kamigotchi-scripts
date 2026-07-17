/* eslint-disable no-multi-spaces */
/* globals BigInt */
// ==UserScript==
// @name         Kamigotchi核心脚本-公开版 (core)
// @namespace    http://tampermonkey.net/
// @version      1.2.10
// @downloadURL  https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-core.user.js
// @updateURL    https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-core.meta.js
// @homepageURL  https://github.com/funcreator2030/kamigotchi-scripts
// @x-release-date 2026/7/17 23:40:21
// @description  Kamigotchi自动化脚本公开版：自动部署/停采/喂食/复活/craft/scavenge/冷却公式预筛 + 前端卡死传感器(v1.1.25 Bug B) + 可观测性日志批次(1.1.17) + 停采退避复读+假卡链门禁(1.1.22) + 停摆检测器+醒来急救(1.2.9) + gas全口径统计mETH(1.2.10)
// @author       hongfei and allon
// @match        https://*.kamigotchi.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// 🔻SYNC→内部版[1.1.17 可观测性批次]：版本仪式（@name/@version/banner/启动log/命令清单banner 同步升 v1.1.17）
// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    Kamigotchi 核心自动化脚本 · 公开版 v1.2.10                  ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  本脚本是 Kamigotchi（kamigotchi.io 链上宠物采集游戏）的自动化管理工具。         ║
// ║  安装在 Tampermonkey 中，打开游戏页面后自动运行。主要功能：                      ║
// ║                                                                              ║
// ║  1. 自动部署    —— 把休息（RESTING）状态的 kami 批量部署到采集点，              ║
// ║                    凑批发送以摊薄单只 gas 成本                                 ║
// ║  2. 自动停采    —— HP 逼近停采线时自动停止采集（普通停采 + 紧急停采两级），     ║
// ║                    防止 kami 被杀手清算                                        ║
// ║  3. 自动喂食    —— 低血量 RESTING kami 按 HP 缺口智能选择食物，                 ║
// ║                    分批喂食 + 失败熔断                                         ║
// ║  4. 死亡复活    —— 监控到 kami 死亡后自动批量复活（需背包有复活丝带）           ║
// ║  5. XP 药水喂食 —— 高清算线（LT>70%）的 kami 轮流喂食                     ║
// ║                    Fortified/Greater XP Potion 加速升级                        ║
// ║  6. 自动合成    —— Greater XP Potion 等物品的自动合成（步长充足时）             ║
// ║  7. 自动拾荒    —— 拾荒点数（rolls）攒够后自动执行 scavenge                     ║
// ║  8. 杀手检测    —— 监听清算消息，检测到杀手活动自动切换到安全停采线             ║
// ║  9. Gas 统计    —— 记录每笔操作的 mETH 消耗，提供消耗历史/统计报告/耗尽预估     ║
// ║                                                                              ║
// ║  设计哲学：减少 TX 次数 + 节省 gas + 让 kami 在单个周期内采集尽可能久。          ║
// ║  所有批量化决策都在 gas 成本曲线的甜区内取最大采集时间。                        ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                              运行前提与依赖                                    ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  1. 浏览器安装 Tampermonkey 扩展，本脚本与"辅助脚本"需同时启用。                ║
// ║     核心脚本负责部署/停采/喂食/复活等主流程；辅助脚本提供 DOM 步长读取、        ║
// ║     地块 minority 分析、升级等能力，两者通过 window.xxx 接口互相调用。          ║
// ║     缺少辅助脚本时：合成会因读不到实时步长而跳过，转移停采等命令不可用。        ║
// ║  2. 脚本在本地维护一个"精简数据库"（window.kami_core_db，存 localStorage），    ║
// ║     记录每只 kami 的编号、ID、清算线（LT）等关键数据；启动时自动恢复、          ║
// ║     发现账户有新 kami 时增量自愈补全；首次全量构建需运行「精简数据库脚本」。   ║
// ║  3. 本脚本面向 kami 数量 > 7 的大账户设计：批量操作要凑批（≥6）才发送，         ║
// ║     小账户可能长时间凑不满一批，建议手动操作或自行调低凑批门槛。               ║
// ║  4. 脚本会代替你发送真实链上交易并消耗 gas（mETH）。首次使用建议先小规模        ║
// ║     观察几个循环，确认行为符合预期后再长期挂机。                               ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ============================================================
// 【新手必读：术语速查】
// ------------------------------------------------------------
// · 清算线（LT，Liquidation Threshold）—— kami 的 HP 百分比阈值：HP 跌破
//   此线后，任何玩家都可以清算（击杀）这只 kami 获利。LT 由 kami 自身
//   属性决定，升级可降低；本套件的停采决策全部围绕它展开。
// · 停采线 —— 脚本自定的"停止采集"阈值：HP 跌到该线即自动停采。
//   normal 模式 = LT+3%（封顶 80%；v1.1.1 起 LT 为精确清算线，由辅助脚本
//   按官方公式+全网最强杀手档案自动维护，3% 安全垫承担停采反应时间），
//   greedy 模式（旧名 starving）= 5%。
// · delta（Δ）—— 实时 HP% 减去停采线的差值；delta 越小（越负）越危险。
// · RESTING / HARVESTING / STARVING / DEAD —— kami 的四种状态：休息中 /
//   采集中 / 饿死（HP 归零但未被清算，可喂食救回）/ 已死亡（需复活丝带）。
// · mETH —— milli-ETH（0.001 ETH），本套件统计 gas 消耗的计量单位。
// · musu —— 游戏内基础货币，采集获得，游戏商店购物用。
// · Operator —— 游戏为每个账户生成的操作钱包（热钱包），脚本发出的所有
//   TX 都由它签名并支付 gas，需保证其 mETH 余额充足。
// · nonce —— 链上账户的交易序号；同一账户并发发 TX 会争用 nonce 而报错，
//   这正是"TX 双锁"机制存在的原因（见下方板块）。
// · 凑批 —— 把多只 kami 的同类操作合并成一笔批量 TX（一般凑够 ≥6 只
//   才发送），摊薄单只 gas 成本。
// · 步长（stamina，体力）—— 账户级资源，上限 100，合成/拾荒等动作消耗，
//   随时间恢复。
// · 幽灵 kami —— 本地数据库中残留的、实际已转走/卖出的 kami 记录；
//   对它们发 TX 必失败，脚本各处都做了"幽灵过滤"。
// · majority / minority —— 多账户分工策略下的分类：与本账户主攻地块
//   类型匹配的 kami 为 majority（主流），其余为 minority（少数派，
//   应转移给对口账户集中采集）。
// · eye-half —— Party 面板"眼睛"按钮的半开显示模式；本脚本的 DOM 状态
//   检测都基于该模式下的卡片结构，启动时会自动切换到位。
// ============================================================

// ============================================================
// 【核心机制：TX 双锁 —— 防止 nonce 冲突】
// ------------------------------------------------------------
// ▍为什么需要 TX 锁？
//   - 所有链上操作（部署/停采/喂食/升级/合成/复活）共用同一个 Operator 账户
//   - 每个账户只有一个 nonce 序列，每发一笔 tx，nonce+1
//   - 多个操作同时发 tx 会争用 nonce，报 "account sequence mismatch" 错误
//   - 最危险的场景：紧急停采被其他操作抢走 nonce → 停采失败 → kami 被杀手清算
//
// ▍双锁设计：
//   1. 紧急锁（Emergency Lock）—— 紧急停采专用
//      - 触发时机：检测到需要紧急停采
//      - 作用：阻止所有其他操作发送 tx，紧急停采独占通道
//      - 超时：10 分钟自动释放（防止异常时锁死）
//   2. 普通锁（Normal Lock）—— 普通操作使用
//      - 触发时机：部署/停采/喂食/升级/合成开始发 tx 时
//      - 作用：同一时间只有一个操作能发 tx
//      - 超时：5 分钟自动释放
//
// ▍工作流程：
//   普通操作：检查紧急锁 → 获取普通锁 → 执行 → 释放普通锁
//   紧急停采：设置紧急锁 → 等待普通锁释放（最多 30 秒）→ 独占执行 → 释放紧急锁
//
// ▍锁纪律（先查后锁）：
//   所有模块都遵循"先确认有活干（候选>0 且库存>0），才去拿锁"的纪律，
//   锁内只保留发 tx 的代码段。避免空转占锁、挡住其他模块。
//
// ▍锁检查点分布：
//   - 批量停采：开始时、每批发送前
//   - 批量部署：开始时、每批发送前
//   - 喂食：开始时、每批前、每只 kami 前
//   - 升级（辅助脚本）：开始时、每只 kami 前
//   - 合成（辅助脚本）：开始时、每次合成前
// ============================================================

// ============================================================
// 【核心机制：贪婪模式 Greedy Mode（双模式停采线）】
// 🔻SYNC→内部版[1.1.13 饥饿模式改名贪婪模式]
// ------------------------------------------------------------
// ▍模式对比：
//   - normal 模式：停采线 = 清算线(LT) + 3%，上限 80%。安全但单周期采集时间短
//   - greedy 模式：停采线 = 5%，榨干每个采集周期，收益最高，
//     但必须依赖杀手检测保护，检测到杀手立即回退安全线
//     （旧名 starving 模式，v1.1.13 起改名为 greedy，含义不变；
//     'starving' 仍可作为 setKamiMode 的别名输入，会自动归一化为 'greedy'）
//
// ▍杀手检测机制：
//   - 主路径（当前生效）：【轻量杀手监控脚本】按名单轮询杀手位置，
//     杀手到达本地块/邻居地块时直接触发本脚本的紧急停采；
//   - 辅路径（已停用）：基于 liquidated 清算消息计数的检测
//     （5 分钟 2 条→切安全线，15 分钟无新击杀恢复）依赖杀手监控
//     脚本的 Feed 监控写入 __killerDetected 标记；Feed 监控现已
//     停用，该标记默认恒为 false，安全线自动切换路径不再生效。
//     因此 greedy 模式的安全性更依赖杀手名单配置的完整性。
//
// ▍紧急停采触发条件（任一满足）：
//   - 杀手监控脚本发现名单内杀手逼近（位置告警，直接调用紧急停采）
//   - 任意 kami 的 HP 低于清算线 + 2%
//
// ▍切换命令：setKamiMode('greedy') / setKamiMode('normal')，
//   getKamiMode() 查看当前模式。（旧命令 setKamiMode('starving') 仍兼容，
//   自动归一化为 'greedy'）
//
// ▍新手提示：
//   - 首次运行默认就是 greedy 模式（本地无记录时的缺省值）；
//   - 杀手检测依赖独立的【轻量杀手监控脚本】常驻运行（其监控名单
//     公开版默认为空，需要你自行填写）；
//   - 若暂未配置好杀手监控，建议先 setKamiMode('normal') 用安全线运行。
// ============================================================

// ============================================================
// 【Gas 消耗规则 —— 判断一笔操作有没有花钱】
// ------------------------------------------------------------
// ✅ 不消耗 Gas（链下/预检阶段拦截）：
//    - estimateGas 失败：预检模拟执行，交易未上链
//    - RPC 连接错误：交易没发出去
//    - 签名失败、参数错误：API 层面直接拒绝
//    - 预检过滤掉已死/已停的 kami：仅 API 查询，不上链
//
// ❌ 消耗 Gas（交易已上链）：
//    - 交易 revert：上链后执行失败，gas 照扣
//    - 超时但其实成功：交易已上链，只是等确认超时
//    - Nonce 冲突重试：两笔都上链就双倍消耗
//    - 重复操作：kami 已停采还发 stop，会 revert 扣 gas
//
// 脚本的预检体系（estimateGas 预检、状态过滤、防重复标记）都是为了
// 把失败拦在"不花钱"的阶段。
// ============================================================

// ============================================================
// 【常用控制台命令速查】（完整清单以启动时控制台打印的 banner 为准）
// ------------------------------------------------------------
// ── 模式与状态 ──
// setKamiMode('greedy')    - 切换到贪婪模式（极限停采线5%，检测到杀手自动切安全线；旧名 'starving' 仍兼容）
// setKamiMode('normal')    - 切换到正常模式（安全停采线，清算线+3%）
// getKamiMode()            - 查看当前模式状态
// getTxLockStatus()        - 查看当前TX锁状态
//
// ── 停采与部署 ──
// stopCurrentRoom()        - 一键批量停采当前地块所有HARVESTING的kami（按HP危险优先）
// stopMinorityForTransfer()- 停采本账户在少数派地块的kami，方便转移（需辅助脚本）
// resumeDeploy()           - 提前结束"全量停采后的10分钟部署暂停"，立即恢复自动部署
//
// ── 黑名单与冷却 ──
// clearBlockedKamis()      - 清除所有黑名单（部署+停采）
// showBlockedKamis()       - 查看部署黑名单
// clearStopBlockedKamis()  - 清除停采黑名单
// showStopBlockedKamis()   - 查看停采黑名单
// clearFeedFails()         - 清除喂食失败冷却记录
// clearStarvingStuck()     - 清除STARVING喂食卡住黑名单（允许重试）
//
// ── XP 药水 ──
// feedXPPotionNow()        - 立即触发一次XP药水喂食（只喂不合成）
// clearXPPotionFed()       - 清除XP药水喂食记录（允许重新喂食）
// showMyKillers()          - 查看杀手kami清单（喂食时自动跳过的kami）
//
// ── 数据库与日志 ──
// syncKamiDb()             - 手动触发精简数据库增量自愈（补全账户新kami）
// saveKamiLogs()           - 手动保存日志到文件
//
// ── Gas 统计 ──
// showGasRules()           - 查看Gas消耗规则
// showGasReport()          - 链上真值 gas 账本报告（按动作分类 + 24h/3d/7d/30d + 日均 + revert白烧 + 余额续航）
// ============================================================
(async function () {
    'use strict';

    // ============================================================
    // 【板块：日志基础设施】
    // ------------------------------------------------------------
    // ▍功能：为整个脚本提供统一的日志输出与留档能力：
    //   1) log() —— 全脚本业务日志的唯一出口，自动加 [核心脚本] 前缀 +
    //      配置时区的时间戳（默认浏览器本地），并把纯文本副本写入内存日志缓冲区；
    //   2) window.__kamiLogBuffer —— 全局日志缓冲区（字符串数组），供
    //      saveKamiLogs()（本脚本后文定义）一键导出完整日志文件；
    //   3) wrapManual() —— 包装暴露到 window 的控制台命令，调用时自动打一条
    //      入口标记，区分"用户控制台手敲"与"外部脚本调用"；
    //   4) _fmtMinSec() —— 毫秒数格式化为 "X分X.X秒"，用于日志中标注耗时。
    // ▍触发时机：脚本注入后立即定义；log() 被全脚本各处调用；
    //   wrapManual() 只在把命令挂到 window.xxx 时包装一次。
    // ▍依赖：
    //   - window.__kamiLogBuffer：跨脚本共享的缓冲区（若辅助脚本已创建则复用）；
    //   - window.__kamiCallSource：约定接口——外部脚本（如轻量杀手监控脚本）
    //     调用本脚本 window.xxx 命令前先写入来源名，wrapManual 读取后据此打标。
    // ▍核心流程（log）：
    //   1) 当前时间按配置时区偏移（__TZ_OFFSET_MS）拼出时间字符串；
    //   2) 若首参以 %c 开头（样式化输出），把前缀插到 %c 之后保证样式生效，
    //      否则直接前置输出；
    //   3) console.log 打到控制台；
    //   4) 全部参数序列化为纯文本（剥掉 %c、对象 JSON 化）追加进缓冲区留档。
    // ▍核心流程（wrapManual）：
    //   1) 读取并立即 delete window.__kamiCallSource（一次性消费）；
    //   2) 参数序列化成可读串（字符串加引号、函数记作 fn）；
    //   3) 有来源名 → 打 🤖 [脚本调用@来源]，无 → 打 🖐️ [手动调用]；
    //   4) 原样透传调用被包装函数并返回其结果。
    // ▍边界与保护：
    //   - 缓冲区用 `window.x = window.x || []` 初始化，脚本重载/多脚本共存时
    //     不会清空已有日志；
    //   - 对象序列化 JSON.stringify 全部包 try/catch，循环引用等异常回退
    //     String(a)，保证 log() 自身永不抛错；
    //   - __kamiCallSource 读后立即删除，防止外部调用崩溃后残留、把下一次
    //     手动调用误判成脚本调用；
    //   - wrapManual 只影响 window.xxx 入口，脚本内部以裸函数名调用的路径
    //     不经过包装、不产生入口标记（有意设计，避免内部调用刷屏）。
    // ▍可调参数：TZ_OFFSET_HOURS（见上方【时区设置】板块，默认 'auto' 跟随浏览器本地），
    //   如需其他时区改此偏移即可。
    // ▍相关控制台命令：saveKamiLogs() —— 导出下载 __kamiLogBuffer 全量日志
    //   （定义在脚本后文）。
    // ============================================================

    // 说明：Tampermonkey 注入脚本的控制台输出自带 userscript.html?name…:NNN
    // 长串 source link。实测在 kamigotchi.io 的 CSP + Chrome V8 stack trace
    // 规则下，new Function / iframe console wrapper 等改写 console 的方案均
    // 无法缩短它——source link 本质是 Tampermonkey 注入机制生成的虚拟 URL，
    // 从脚本内部改不了。如需清爽日志请用 saveKamiLogs() 下载文件查看。

    // ============================================================
    // 【时区设置】（v1.1.3 起）所有日志/时间显示使用的时区
    //   'auto' = 自动跟随浏览器本地时区（推荐，装上即是你的当地时间）；
    //   也可写死数字（单位小时，可带小数）：8=UTC+8、-5=UTC-5、5.5=UTC+5:30
    //   注意：本设置只影响日志/时间显示；gas 账本按 epoch 毫秒时间戳存储，
    //   与时区无关，中途更改时区不影响 gas 账本统计
    // ============================================================
    const TZ_OFFSET_HOURS = 'auto';
    const __TZ_OFFSET_MS = (TZ_OFFSET_HOURS === 'auto')
        ? -new Date().getTimezoneOffset() * 60 * 1000
        : Number(TZ_OFFSET_HOURS) * 60 * 60 * 1000;
    // 显示标签，如 "UTC+8" / "UTC-5" / "UTC+5.5"
    const __TZ_LABEL = 'UTC' + (__TZ_OFFSET_MS >= 0 ? '+' : '') + (__TZ_OFFSET_MS / 3600000);

    // 🔻SYNC→内部版[1.2.7 gas真值账本] B1修(grok审):Epoch结束提醒被误随余额差统计删除,此处恢复(仅提醒,不含旧gas报告 showEpochGasStats)。
    const __EPOCH_30_START_UTC_MS = Date.UTC(2026, 5, 4, 8, 0, 0);  // 月份 0-indexed: 5=Jun
    const __EPOCH_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;
    function _epochAt(utcMs) { return 30 + Math.floor((utcMs - __EPOCH_30_START_UTC_MS) / __EPOCH_LENGTH_MS); }
    function _epochRange(n) {
        return {
            start: __EPOCH_30_START_UTC_MS + (n - 30) * __EPOCH_LENGTH_MS,
            end:   __EPOCH_30_START_UTC_MS + (n - 29) * __EPOCH_LENGTH_MS
        };
    }
    function _fmtBJFromUtcMs(utcMs) {
        const d = new Date(utcMs + __TZ_OFFSET_MS);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }
    const __EPOCH_REMIND_DAYS = 3;
    function _epochEndReminder() {
        try {
            const now = Date.now();
            const n = _epochAt(now);
            const { end } = _epochRange(n);
            const msLeft = end - now;
            if (msLeft <= 0) return;
            const daysLeft = Math.ceil(msLeft / (24 * 3600 * 1000));
            if (daysLeft > __EPOCH_REMIND_DAYS) return;
            const hoursLeft = Math.floor(msLeft / 3600000);
            log(`%c⏰ ═══════ Epoch ${n} 即将结束（已是最后 ${daysLeft} 天）═══════\n` +
                `   结束时间：${__TZ_LABEL} ${_fmtBJFromUtcMs(end)}（剩余约 ${hoursLeft} 小时）\n` +
                `   请及时：① 销毁 VIP 点数（vipp）；② 如需投票，投给 kamigotchi\n` +
                `   投票入口：https://app.initia.xyz/vip/gauge-vote`,
                'color: red; font-weight: bold; font-size: 13px;');
        } catch (e) {}
    }
    setTimeout(_epochEndReminder, 30 * 1000);
    setInterval(_epochEndReminder, 6 * 60 * 60 * 1000);
    // ISO 偏移后缀，如 "+08:00" / "-05:00"（gas 时间戳解析用，与写入互逆）
    const __TZ_ISO_SUFFIX = (() => {
        const total = Math.round(Math.abs(__TZ_OFFSET_MS) / 60000);
        const p = n => String(n).padStart(2, '0');
        return (__TZ_OFFSET_MS >= 0 ? '+' : '-') + p(Math.floor(total / 60)) + ':' + p(total % 60);
    })();

    // BEFORE(Bug B前): 核心脚本没有前端冻结信号入口；后续传感器模块接线前默认 false，保持旧行为。
    function _isFrontendFrozen() {
        return (typeof window.__frontendFrozen === 'boolean') ? window.__frontendFrozen : false;
    }

    // ============ [② 前端卡死传感器 v1.1.25] MUD 同步心跳 —— 纯日志 + 维护 window.__frontendFrozen ============
    // 背景：网页/MUD 同步流卡死(WebSocket 断 / 后台标签被浏览器节流) → window.network.explorer 读冻在旧值 →
    //   停采发不出、喂食库存读 0、gas 谎报成功 → 误拉黑 / 放弃喂食 → kami 饿死（见《更新记录与经验》v1.1.25 根因）。
    // 主信号：window.network.network.blockNumber$ 区块号(Initia 出块快)≥90s 不前进 = 同步冻死。
    // 本模块只写日志 + 设 window.__frontendFrozen（供上方 _isFrontendFrozen() 门闩读），不发 tx、不刷新、不改任何业务决策。
    // 判定要求 ≥2 独立信号(blockStalled 为锚)以压误报；读失败一律降级为不判冻死、不抛错中断主循环。
    (function initFrontendFrozenSensor() {
        const BLOCK_STALL_MS = 90000;          // 区块号 ≥90s 不前进 → blockStalled（主信号）
        const TIMER_DRIFT_RATIO = 3;           // 实际/预期间隔 ≥3 → 疑似后台节流
        const TIMER_DRIFT_SUSTAIN_MS = 60000;  // 且持续 ≥60s
        let _subscribed = false;
        let _lastBlock = null;
        let _lastBlockAdvanceAt = 0;           // 0 = 尚未建立基线（不判 stalled，避免启动即误判）
        let _lastTickAt = 0, _driftSinceAt = 0;
        let _prevFrozen = false;
        // 🔻SYNC→内部版[1.2.5 渲染循环观测] rAF 监视器：测"前端渲染/计算循环"是否被节流冻结——
        //   与 blockNumber$(WS/链同步)正交:关显示器/切后台/长时间无交互时,浏览器节流 requestAnimationFrame,
        //   游戏据此推算的实时 HP/采集量会停更(用户0712实测:晃鼠标后HP突然跳一次=节流恢复的补偿跳变)。
        //   纯观测:空 rAF 回调只计数、不阻止节流(正好如实测量);全 try/catch。
        let _rafCount = 0, _rafLastAt = 0, _rafMaxGapMs = 0, _rafStarted = false;
        function _startRafMonitor() {
            if (_rafStarted) return; _rafStarted = true;
            try {
                _rafLastAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                const _tick = () => {
                    try {
                        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                        const gap = t - _rafLastAt; if (gap > _rafMaxGapMs) _rafMaxGapMs = gap;
                        _rafLastAt = t; _rafCount++;
                        requestAnimationFrame(_tick);
                    } catch (_) {}
                };
                requestAnimationFrame(_tick);
            } catch (_) {}
        }
        try { _startRafMonitor(); } catch (_) {}
        // 读并重置 rAF 窗口统计,返回 {fps,maxGapMs,frozen}(帧率极低=渲染冻结,读DOM要当心是旧值)
        function _readRafWindow(windowMs) {
            let fps = 'NA', maxGap = Math.round(_rafMaxGapMs), rf = false;
            try {
                if (windowMs > 0) fps = +(_rafCount / (windowMs / 1000)).toFixed(1);
                rf = (typeof fps === 'number' && fps < 1) || maxGap > 5000;   // <1fps 或 单帧间隔>5s = 渲染疑似冻结
            } catch (_) {}
            _rafCount = 0; _rafMaxGapMs = 0;
            return { fps, maxGapMs: maxGap, renderFrozen: rf };
        }
        let _lastRafReadAt = 0;
        function _wsConnectedDesc() {
            try {
                const c = window.network && window.network.network && window.network.network.connected;
                if (typeof c === 'boolean') return String(c);
                if (c && typeof c.getValue === 'function') return String(c.getValue());
                if (c && typeof c === 'object' && 'value' in c) return String(c.value);
                return c == null ? 'NA' : ('type=' + typeof c);
            } catch (_) { return 'NA'; }
        }
        // 🔻SYNC→内部版[1.2.6 RPC网速诊断] 到链上 RPC 的往返延迟/失败率——tx 快慢的真因是这条链路,不是本机宽带。
        //   纯诊断(用户0712定案):只打日志,不据此自动调行为(等标定)。每小时心跳踢一次(发射后不管,存结果供下次心跳打印)。
        //   测法:连做 RPC_PROBE_N 次 getBlockNumber 计时,取 p50/p90+失败数。全 try/catch,零 tx 零 gas。
        const RPC_PROBE_N = 4;
        let _rpcProbe = { p50: 'NA', p90: 'NA', fails: 0, n: 0, at: 0 };
        let _rpcProbeRunning = false;
        async function _probeRpcLatency() {
            if (_rpcProbeRunning) return;
            _rpcProbeRunning = true;
            try {
                const prov = (window.network && window.network.network &&
                    (window.network.network.provider || (window.network.network.signer && window.network.network.signer.provider)));
                if (!prov || typeof prov.getBlockNumber !== 'function') { _rpcProbe = { p50:'NA', p90:'NA', fails:0, n:0, at:Date.now(), note:'无provider' }; return; }
                const lat = []; let fails = 0;
                for (let i = 0; i < RPC_PROBE_N; i++) {
                    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                    try { await prov.getBlockNumber(); lat.push(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)); }
                    catch (_) { fails++; }
                    await new Promise(r => setTimeout(r, 300));   // 间隔 300ms 避免连打
                }
                lat.sort((a, b) => a - b);
                const pct = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.ceil(arr.length * q) - 1)] : 'NA';
                _rpcProbe = { p50: pct(lat, 0.5), p90: pct(lat, 0.9), fails, n: lat.length, at: Date.now() };
            } catch (_) { /* 探测异常不影响任何业务 */ }
            finally { _rpcProbeRunning = false; }
        }
        try { setTimeout(() => { try { _probeRpcLatency(); } catch (_) {} }, 30000); } catch (_) {}   // 启动 30s 后先测一次,让首个心跳有数
        let _fallbackAnnounced = false;   // 🔻SYNC→内部版[1.1.17 可观测性批次] C1：fallback 首次成功读值只播报一次（防刷屏）
        let _lastHeartbeatAt = 0;         // 🔻SYNC→内部版[1.1.17 可观测性批次] C2：0=启动后首个 eval 即允许打首条心跳
        window.__frontendFrozen = window.__frontendFrozen || false;

        function _ingestBlock(bn) {
            try {
                const n = Number(bn);
                if (Number.isFinite(n) && n !== _lastBlock) { _lastBlock = n; _lastBlockAdvanceAt = Date.now(); }
            } catch (e) {}
        }
        function _ensureSubscribed() {
            if (_subscribed) return;
            try {
                const bn$ = window.network && window.network.network && window.network.network.blockNumber$;
                if (!bn$ || typeof bn$.subscribe !== 'function') return;
                bn$.subscribe(_ingestBlock);
                _subscribed = true;
                _lastBlockAdvanceAt = Date.now();   // 订阅成功才建立基线
                if (typeof bn$.getValue === 'function') _ingestBlock(bn$.getValue());
                else if (typeof bn$ === 'object' && 'value' in bn$) _ingestBlock(bn$.value);
                // 🔻SYNC→内部版[1.1.17 可观测性批次] C1：首次订阅成功播报（纯日志，仅一次；_subscribed 门天然去重）
                log(`%c🧊 [前端传感器] 已订阅 blockNumber$，传感器启动（当前块=${_lastBlock ?? '待首个块'}）`, 'color:#2980b9');
            } catch (e) {}
        }
        function _readBlockFallback() {
            // blockNumber$ 不是可订阅 observable 时的退路：每轮直接读值比较
            if (_subscribed) return;
            try {
                const bn$ = window.network && window.network.network && window.network.network.blockNumber$;
                if (!bn$) return;
                let v = null;
                if (typeof bn$.getValue === 'function') v = bn$.getValue();
                else if (typeof bn$ === 'object' && 'value' in bn$) v = bn$.value;
                else if (typeof bn$ !== 'object') v = bn$;
                if (v != null) {
                    if (_lastBlockAdvanceAt === 0) _lastBlockAdvanceAt = Date.now(); _ingestBlock(v);
                    // 🔻SYNC→内部版[1.1.17 可观测性批次] C1：走 fallback（bn$ 不可订阅）时首次成功读值只播报一次（_fallbackAnnounced 门防刷屏）
                    if (!_fallbackAnnounced) {
                        _fallbackAnnounced = true;
                        log(`%c🧊 [前端传感器] blockNumber$ 不可订阅，退化为轮询读值模式（当前块=${_lastBlock ?? v}）`, 'color:#e67e22');
                    }
                }
            } catch (e) {}
        }
        function _connectionDown() {
            try {
                const c = window.network && window.network.network && window.network.network.connected;
                if (c == null) return false;
                if (typeof c === 'boolean') return !c;
                if (typeof c.getValue === 'function') return c.getValue() === false;
                if (typeof c === 'object' && 'value' in c) return c.value === false;
                return false;
            } catch (e) { return false; }
        }

        // 每轮评估：由 runAutomation / emergencyStopHarvest 入口调用；返回并设 window.__frontendFrozen
        window.__evalFrontendFrozen = function (expectedIntervalMs) {
            try {
                _ensureSubscribed();
                _readBlockFallback();
                const now = Date.now();

                let timerDrift = false;
                if (_lastTickAt > 0) {
                    const gap = now - _lastTickAt;
                    const exp = Number(expectedIntervalMs) || 600000;
                    if (gap >= exp * TIMER_DRIFT_RATIO) { if (!_driftSinceAt) _driftSinceAt = now; }
                    else _driftSinceAt = 0;
                    timerDrift = _driftSinceAt > 0 && (now - _driftSinceAt) >= TIMER_DRIFT_SUSTAIN_MS;
                }
                _lastTickAt = now;

                const haveBaseline = _lastBlockAdvanceAt > 0 && _lastBlock !== null;
                const blockStalled = haveBaseline && (now - _lastBlockAdvanceAt) >= BLOCK_STALL_MS;
                const connectionDown = _connectionDown();
                const canaryNull = (window.__frontendCanaryNull === true);  // 外部可喂入固定id突然读null；默认无样本=false
                const hidden = (typeof document !== 'undefined' && document.hidden === true);
                const gated = (typeof window.__emergencyLockHeld === 'boolean' && window.__emergencyLockHeld);

                // ≥2 独立信号(blockStalled 为锚)才判冻死；hidden 只旁证不进 OR
                const frozen = !gated && (
                       (blockStalled && connectionDown)
                    || (blockStalled && timerDrift)
                    || (blockStalled && canaryNull)
                    || (connectionDown && canaryNull)
                );
                window.__frontendFrozen = frozen;

                if (frozen !== _prevFrozen) {
                    log(`%c🧊 [前端传感器] 冻死判定翻转 → frozen=${frozen} | blockStalled=${blockStalled}(块=${_lastBlock},停滞${haveBaseline ? Math.round((now - _lastBlockAdvanceAt) / 1000) : 'NA'}s,已订阅=${_subscribed}) connDown=${connectionDown} timerDrift=${timerDrift} canaryNull=${canaryNull} hidden=${hidden}`,
                        frozen ? 'color:#c0392b;font-weight:bold' : 'color:#27ae60;font-weight:bold');
                    // 🔻SYNC→内部版[1.2.1 停采空转闭环] C3：进入冻结瞬间 dump 深快照——抓 CZ 根因（区块流正常但组件仓单独滞后=已知盲区；connected翻false=WS问题）。纯观测全 try/catch。
                    if (frozen) {
                        try {
                            const _nn = (window.network && window.network.network) || {};
                            let _conn = 'NA';
                            try { const _c = _nn.connected; _conn = (_c && typeof _c.getValue === 'function') ? _c.getValue() : (_c && typeof _c === 'object' && 'value' in _c ? _c.value : _c); } catch (_) { _conn = 'NA'; }
                            let _pv = 'NA'; try { _pv = __stopPendingVerify.size; } catch (_) {}
                            log(`%c🧊 [前端传感器/冻结快照] blockNumber$当前=${_lastBlock} 停滞${haveBaseline ? Math.round((now - _lastBlockAdvanceAt) / 1000) : 'NA'}s | connected=${_conn} | explorer.kamis就绪=${!!(window.network && window.network.explorer && window.network.explorer.kamis)} txQueue就绪=${!!(window.network && window.network.txQueue)} | 退避队列=${_pv}只 | document.hidden=${document.hidden} visibilityState=${document.visibilityState} | rAF近窗最大帧隔=${Math.round(_rafMaxGapMs)}ms WS=${_wsConnectedDesc()}`, 'color:#c0392b');
                        } catch (_) {}
                    }
                    _prevFrozen = frozen;
                }

                // 🔻SYNC→内部版[1.1.17 可观测性批次] C2：传感器每小时心跳（纯日志；_lastHeartbeatAt=0 → 启动后首个 eval 即打首条，之后≥1h 一条防刷屏）
                if (now - _lastHeartbeatAt >= 3600000) {
                    _lastHeartbeatAt = now;
                    const _hbStall = haveBaseline ? Math.round((now - _lastBlockAdvanceAt) / 1000) : 'NA';
                    // 🔻SYNC→内部版[1.1.22 退避复读] C5：组件滞后信号（补盲，纯观测，不进 frozen 判定/不影响门闩）。
                    //   判据：退避复读队列中存在 attempts≥4(≥90s 档)仍未确认已停的条目 → componentLag=疑似。
                    //   意图：CZ 类"病态组件滞后可达数十分钟(blockNumber$ 仍正常前进=blockStalled 盲区)"的补盲信号，供下一步标定。
                    let _componentLag = '正常';
                    try {
                        for (const e of __stopPendingVerify.values()) { if (e.attempts >= 4) { _componentLag = '疑似'; break; } }
                    } catch (_) {}
                    // 🔻SYNC→内部版[1.2.5 渲染循环观测] 心跳加 rAF渲染帧率/WS连接/可见性(正交于区块同步的第二条健康线)
                    const _rafWin = _readRafWindow(now - (_lastRafReadAt || (now - 3600000))); _lastRafReadAt = now;
                    try { _probeRpcLatency(); } catch (_) {}   // 踢一次RPC探测(发射后不管,结果供下次心跳)
                    const _rpcAge = _rpcProbe.at ? Math.round((now - _rpcProbe.at) / 60000) + 'min前' : '未测';
                    log(`%c🧊 [前端传感器/心跳] frozen=${frozen} | 已订阅=${_subscribed} 当前块=${_lastBlock} 停滞${_hbStall}s connDown=${connectionDown} timerDrift=${timerDrift} hidden=${hidden} componentLag=${_componentLag}(退避未确认${(() => { try { return __stopPendingVerify.size; } catch (_) { return '?'; } })()}只) | rAF渲染=${_rafWin.fps}fps(最大帧隔${_rafWin.maxGapMs}ms,冻结=${_rafWin.renderFrozen}) WS=${_wsConnectedDesc()} visibility=${(typeof document!=='undefined'?document.visibilityState:'NA')} | RPC延迟p50=${_rpcProbe.p50}ms/p90=${_rpcProbe.p90}ms 失败${_rpcProbe.fails}/${_rpcProbe.n}(${_rpcAge})`, 'color:#7f8c8d');
                }
                return frozen;
            } catch (e) {
                return false;   // I2：读失败不判冻死、不中断主循环
            }
        };

        window.showFrontendSensor = function () {
            const now = Date.now();
            console.log('[前端传感器]', {
                已订阅: _subscribed, 当前块: _lastBlock,
                区块停滞秒: _lastBlockAdvanceAt > 0 ? Math.round((now - _lastBlockAdvanceAt) / 1000) : null,
                frozen: window.__frontendFrozen
            });
        };
    })();

    //=====定义日志格式，自动加配置时区的时间前缀=====
    // 日志缓冲区 - 存储所有日志用于后续保存（页面刷新即清空，持久化靠导出）
    window.__kamiLogBuffer = window.__kamiLogBuffer || [];

    function log(...args) {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
            .toISOString()
            .replace('T', ' ')
            .substring(0, 19);

        const prefix = `[核心脚本][${beijingTime}]`;

        // 检查第一个参数是否以 %c 开头（用于样式化输出）
        if (args.length >= 2 && typeof args[0] === 'string' && args[0].startsWith('%c')) {
            // 把前缀插入到 %c 之后，这样样式才能生效
            const newText = '%c' + prefix + ' ' + args[0].substring(2);
            console.log(newText, ...args.slice(1));
        } else {
            console.log(prefix, ...args);
        }

        // 存储日志到内存缓冲区：剥掉 %c 样式标记，对象 JSON 化（失败回退 String）
        const plainText = args.map(a => {
            if (typeof a === 'string') return a.replace(/%c/g, '');
            try { return JSON.stringify(a); } catch { return String(a); }
        }).join(' ');
        window.__kamiLogBuffer.push(`${prefix} ${plainText}`);
    }

    // ============================================================
    // 手动调用标记：区分"脚本自动触发"vs"用户控制台手敲"
    // 实现：调用前 log 一条入口标记；外部脚本若在调用前设置 window.__kamiCallSource='<源名>'
    //      则本函数读取后改打 🤖 [脚本调用@<源名>]，读完立即 delete（一次性消费防残留）
    // 约定：杀手监控等外部脚本调用 window.xxx 前赋值 __kamiCallSource；
    //      控制台手敲不会赋值 → 默认归为 🖐️ [手动调用]
    // 限制：只包装 window.xxx 暴露给用户的入口，脚本内部以裸函数名调用的路径不受影响
    // ============================================================
    function wrapManual(name, fn) {
        return function (...args) {
            const source = window.__kamiCallSource;
            delete window.__kamiCallSource;  // 一次性消费，防止崩溃残留误判下一次手动调用

            let argStr = '';
            try {
                argStr = args.map(a => {
                    if (typeof a === 'string') return JSON.stringify(a);
                    if (typeof a === 'function') return 'fn';
                    try { return JSON.stringify(a); } catch { return String(a); }
                }).join(', ');
            } catch { argStr = '…'; }

            if (source) {
                log(`%c🤖 [脚本调用@${source}] ${name}(${argStr})`, 'color: #1e90ff; font-weight: bold;');
            } else {
                log(`%c🖐️ [手动调用] ${name}(${argStr})`, 'color: #8a2be2; font-weight: bold;');
            }
            return fn.apply(this, args);
        };
    }

    // 时长格式化：ms → "X分X.X秒"，用于日志里耗时的二次说明
    function _fmtMinSec(ms) {
        const m = Math.floor(ms / 60000);
        const s = ((ms % 60000) / 1000).toFixed(1);
        return `${m}分${s}秒`;
    }

    // ============================================================
    // 【板块：低余额告警】   🔻SYNC[1.2.7 gas真值账本]
    // ------------------------------------------------------------
    // ▍功能：会话启动时与页面刷新前各读一次账户当前余额，低于警戒线时
    //   高亮提醒充值。
    // ▍历史：原"mETH 余额差 gas 统计"（recordGasStart/recordGasEnd/
    //   showGasUsage/clearGasUsage/showGasStats/showEpochGasStats，靠
    //   刷新前后余额求差）因混入充值/买道具/充能而不准，已于 1.2.7 整体
    //   删除，改用链上真值 gas 账本（showGasReport，见后续板块）。本板块
    //   仅保留独立于余额差、仍有价值的"低余额告警"。
    // ▍触发时机：
    //   - checkLowBalanceOnce(账户名,'start')：主循环 printAccountAndRooms
    //     每会话触发一次（__lowBalanceChecked 去重）；
    //   - checkLowBalanceOnce(账户名,'end')：页面刷新前触发一次。
    // ▍依赖：DOM #tx-logs 同父容器的余额文本（getAccountBalance）；log()。
    // ▍边界与保护：全部 try/catch；抓不到余额/解析失败静默跳过，不抛错。
    // ▍可调参数：__LOW_BALANCE_THRESHOLD_METH = 10（mETH 警戒线）。
    // ============================================================

    // 抓取账户余额文本（mETH/ETH/µETH 等单位）
    // 锚点：#tx-logs（id 稳定，不依赖 sc-* hash class）
    // 思路：余额元素与 #tx-logs 同父容器，文本是叶子节点且匹配 "数字+单位+ETH"
    function getAccountBalance() {
        const txLogs = document.getElementById('tx-logs');
        if (!txLogs) return null;
        const root = txLogs.parentElement;
        if (!root) return null;
        const ethRegex = /^[\d.]+\s*[a-zµμ]?ETH$/i;  // 匹配 "12.34 mETH" 之类的余额文本
        for (const el of root.querySelectorAll('div, span')) {
            if (el.children.length > 0) continue;  // 只看叶子节点，跳过容器
            const text = (el.textContent || '').trim();
            if (ethRegex.test(text)) return text;
        }
        return null;
    }

    const __LOW_BALANCE_THRESHOLD_METH = 10;         // 余额低警戒线（mETH），低于此值高亮提醒充值

    // 余额文本 → mETH 数值（如 "1.2 ETH" → 1200，"500 µETH" → 0.5），解析失败返回 null
    function _parseEthToMeth(text) {
        if (!text) return null;
        const m = text.match(/^([\d.]+)\s*([a-zµμ]?)ETH$/i);
        if (!m) return null;
        const v = parseFloat(m[1]);
        const u = m[2].toLowerCase();
        // 各单位 → mETH 换算系数
        const toMeth = { '': 1000, m: 1, 'µ': 1e-3, 'μ': 1e-3, u: 1e-3, n: 1e-6, p: 1e-9 };
        return v * (toMeth[u] ?? 1);
    }

    // 余额低于警戒线时打印高亮充值提醒（红底白字加粗大号）
    function _warnLowBalanceIfNeeded(meth, raw, acc, stage) {
        if (typeof meth !== 'number' || meth >= __LOW_BALANCE_THRESHOLD_METH) return;
        const banner = `⚠️ 账户 ${acc} 余额仅剩 ${raw}，低于 ${__LOW_BALANCE_THRESHOLD_METH} mETH 警戒线，请尽快充值！⚠️`;
        // 控制台高亮（带样式）：红底 + 白字 + 加粗 + 16px
        console.log(
            `%c${banner}`,
            'background:#c0392b;color:#fff;font-weight:bold;font-size:16px;padding:4px 10px;border-radius:4px;'
        );
        console.log(
            `%c💸 充值提醒：${stage === 'start' ? '脚本启动时' : '刷新前'}检测到余额不足，可能很快用尽，请立即给账户 ${acc} 充值 mETH！`,
            'color:#c0392b;font-weight:bold;font-size:14px;'
        );
        // 同步进 buffer，方便事后查日志
        log(`🚨 [余额警告] ${banner}`);
    }

    // 低余额告警统一入口（独立于已删除的余额差统计）：'start' 每会话一次，'end' 刷新前一次
    let __lowBalanceChecked = false;
    function checkLowBalanceOnce(accountName, stage) {
        try {
            if (stage === 'start') {
                if (__lowBalanceChecked) return;
                __lowBalanceChecked = true;
            }
            const raw = getAccountBalance();
            if (!raw) return;
            const meth = _parseEthToMeth(raw);
            if (meth == null) return;
            _warnLowBalanceIfNeeded(meth, raw, accountName || '(unknown)', stage);
        } catch (_) {}
    }

    // ============================================================
    // 【板块：gas 真值账本（按动作分类自记账）+ showGasReport】   🔻SYNC[1.2.7 gas真值账本]
    // ------------------------------------------------------------
    // ▍功能：脚本每次发 tx 时按动作（deploy/stop/feed/revive/scavenge/
    //   xp_potion）记一条"待补账本"（localStorage 'kami_gas_ledger'），
    //   后台 reconciler 异步用 receipt.gasUsed × gasPrice 回填真实 gas
    //   （BigInt 存 string，不丢精度）。showGasReport() 汇总各时间窗 / 动作
    //   分类 / 日均 / revert 白烧 / 余额续航。取代旧"余额差"统计（那套混入
    //   充值/买道具，不准）。
    // ▍非侵入红线（I1）：各发 tx 点只调 _gasLedgerRecord(...) 一行，全程
    //   try/catch，绝不改 tx 发送逻辑/返回值/时序；记账失败绝不影响业务。
    // ▍零新增 tx（I2）：reconciler 只读 receipt，不发任何 tx。
    // ▍数据源（0713 实测）：ethers v6 单笔字段是 gasPrice（兼容
    //   effectiveGasPrice）；status===0 是 revert 但照样烧 gas，计入总额且单列。
    // ▍地址：acc = window.network.explorer.accounts.getByOperator(signerAddr)；
    //   acc.operatorAddress = 签名地址（发 tx / 查余额）；acc.id = owner。
    // ▍触发时机：_gasLedgerRecord 由各发 tx 点同步调用；_gasLedgerReconcile
    //   由启动时注册的独立定时器每 GAS_LEDGER_RECONCILE_MS 触发；showGasReport
    //   由用户控制台手敲。
    // ▍依赖：localStorage；provider = window.network.network.signer.provider
    //   || window.network.network.provider（补 receipt / 读余额）。
    // ▍相关控制台命令：showGasReport()。
    // ============================================================

    const GAS_LEDGER_KEY = 'kami_gas_ledger';          // 账本 localStorage key
    const GAS_LEDGER_MAX = 5000;                        // 条数硬上限（滚动删旧）
    const GAS_LEDGER_RETAIN_DAYS = 35;                  // 时间上限：保留 35 天（够 30 天报告）
    const GAS_LEDGER_RECONCILE_MS = 3 * 60 * 1000;      // reconciler 扫描间隔（3 分钟）
    const GAS_LEDGER_RECONCILE_BATCH = 20;              // 单轮补 gas 上限（背压）
    // action 枚举：'deploy' | 'stop' | 'feed' | 'revive' | 'scavenge' | 'xp_potion'
    //   （核心动作；辅助脚本的 'upgrade' / 'craft' 下批加，本批留位）

    // 读账本（损坏/缺失回退空数组）
    function _gasLedgerRead() {
        try {
            const arr = JSON.parse(localStorage.getItem(GAS_LEDGER_KEY) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }
    // 写账本（配额超限等静默）
    function _gasLedgerWrite(arr) {
        try { localStorage.setItem(GAS_LEDGER_KEY, JSON.stringify(arr)); } catch (_) {}
    }
    // 有界裁剪：先按时间（35 天），再按条数（5000，截最旧）
    function _gasLedgerPrune(arr) {
        const cutoff = Date.now() - GAS_LEDGER_RETAIN_DAYS * 24 * 60 * 60 * 1000;
        let out = arr.filter(e => e && typeof e.ts === 'number' && e.ts >= cutoff);
        if (out.length > GAS_LEDGER_MAX) out = out.slice(out.length - GAS_LEDGER_MAX);
        return out;
    }
    // 从 tx 对象 / hash 字符串 / promise 抓 hash（fire-and-forget 也立刻有 .hash）
    //   传 promise（如紧急停采 mud 分支）：不 await，.then 里回填 hash 并落盘；抓不到保持 null。
    //   reconciler 只处理"有 hash 且 gasWei===null"的条目，null-hash 条目（如拾荒 UI 点击）永不补 gas。
    function _gasLedgerExtractHash(txOrHash, entry) {
        try {
            if (!txOrHash) return null;
            if (typeof txOrHash === 'string') return txOrHash;
            if (typeof txOrHash.hash === 'string') return txOrHash.hash;
            if (typeof txOrHash.then === 'function') {
                // promise：异步回填 hash（不阻塞、不影响调用方）
                txOrHash.then(t => {
                    try {
                        const h = t && (typeof t === 'string' ? t : (t.hash || t.transactionHash));
                        if (!h || !entry) return;
                        const arr = _gasLedgerRead();
                        const found = arr.find(x => x && x.ts === entry.ts && x.action === entry.action && x.hash == null);
                        if (found) { found.hash = h; _gasLedgerWrite(arr); }
                    } catch (_) {}
                }).catch(() => {});
                return null;
            }
        } catch (_) {}
        return null;
    }
    // 【记账 hook】各发 tx 点唯一入口。绝对非侵入：全 try/catch，任何异常静默，绝不影响调用方。
    //   action=动作枚举；kamiIds=本 tx 涉及的 kami（可空数组）；txOrHash=tx 对象/hash 字符串/promise。
    function _gasLedgerRecord(action, kamiIds, txOrHash) {
        try {
            const ids = Array.isArray(kamiIds)
                ? kamiIds.map(x => String(x))
                : (kamiIds != null ? [String(kamiIds)] : []);
            const entry = { ts: Date.now(), action, kamiIds: ids, n: ids.length, hash: null, gasWei: null, status: null };
            entry.hash = _gasLedgerExtractHash(txOrHash, entry);
            const arr = _gasLedgerPrune(_gasLedgerRead());
            arr.push(entry);
            _gasLedgerWrite(arr);
        } catch (_) { /* 记账失败绝不影响业务 */ }
    }
    // 🔻SYNC→内部版[1.2.10 gas全口径] 暴露记账钩子供辅助脚本挂钩（辅助有 typeof 守卫；核心旧版无此接口时辅助静默跳过）
    window.__kamiGasRecord = _gasLedgerRecord;

    // provider（只读 receipt / 余额，绝不发 tx）
    function _gasLedgerProvider() {
        try {
            const net = window.network && window.network.network;
            if (!net) return null;
            return (net.signer && net.signer.provider) || net.provider || null;
        } catch (_) { return null; }
    }
    // 【reconciler】扫账本里 gasWei===null 且有 hash 的条目，补 receipt → gasWei / status。
    //   查不到（未上链/异常）保持 null 下次再补；单轮限 GAS_LEDGER_RECONCILE_BATCH 条背压；全 try/catch；零新增 tx。
    let __gasReconcileRunning = false;
    async function _gasLedgerReconcile() {
        if (__gasReconcileRunning) return;
        __gasReconcileRunning = true;
        try {
            const provider = _gasLedgerProvider();
            if (!provider || typeof provider.getTransactionReceipt !== 'function') return;
            const arr = _gasLedgerRead();
            const targets = [];
            for (const e of arr) {
                if (e && e.gasWei == null && e.hash) targets.push(e);
                if (targets.length >= GAS_LEDGER_RECONCILE_BATCH) break;
            }
            if (targets.length === 0) return;
            const patch = new Map();   // hash → { gasWei, status }
            for (const e of targets) {
                try {
                    const rcpt = await provider.getTransactionReceipt(e.hash);
                    if (!rcpt) continue;   // 未上链/查不到：保持 null，下轮再补
                    const gasUsed = rcpt.gasUsed;
                    const price = (rcpt.gasPrice != null) ? rcpt.gasPrice : rcpt.effectiveGasPrice;   // ethers v6 单笔=gasPrice，兼容 effectiveGasPrice
                    if (gasUsed == null || price == null) continue;   // 缺字段：下轮再补
                    const gasWei = (BigInt(gasUsed.toString()) * BigInt(price.toString())).toString();   // 精确 BigInt，存 string 不丢精度
                    patch.set(e.hash, { gasWei, status: (rcpt.status == null) ? null : Number(rcpt.status) });   // status===0=revert（照样烧 gas，计入总额且单列）
                } catch (_) { /* 单条异常：跳过，下轮再补 */ }
            }
            if (patch.size === 0) return;
            // 合并回写：重新读当前账本（reconcile 期间可能有新记账 push），按 hash 回填仍为 null 的条目，避免覆盖新条目
            const cur = _gasLedgerRead();
            let dirty = false;
            for (const c of cur) {
                if (c && c.gasWei == null && c.hash && patch.has(c.hash)) {
                    const p = patch.get(c.hash);
                    c.gasWei = p.gasWei;
                    c.status = p.status;
                    dirty = true;
                }
            }
            if (dirty) _gasLedgerWrite(_gasLedgerPrune(cur));
        } catch (_) {
        } finally {
            __gasReconcileRunning = false;
        }
    }

    // 【helper】_fetchOwnerGas：查 owner（手动 tx 主身份地址，脚本发不了的充值/转 kami 等）链上 gas。   🔻SYNC[1.2.8 owner手动tx核算]
    //   数据源：Yominet 官方索引器 Rollytics（游戏页 CORS 放行，实测 fetch 成功；仍全 try/catch 防偶发失败）。
    //   端点：/indexer/tx/v1/evm-txs/by_account/{owner}?is_signer=true（每笔 hex gasUsed + effectiveGasPrice + blockNumber）。
    //   owner tx 稀少（实测 ~0.7 笔/天，30 天约 21 笔=1 页），翻页上限 5 页；缓存 localStorage TTL 1h（owner 变化慢）。
    //   分窗：响应无 timestamp，只有 blockNumber → 用当前区块 - 窗口秒数/每块秒数 得块号阈值切窗（±几小时误差，量小可忽略）。
    //   ⚠️ 纯只读（fetch Rollytics + provider.getBlockNumber），零新增 tx；不碰账本/reconciler/发 tx 路径。
    const OWNER_GAS_CACHE_KEY = 'kami_owner_gas_cache';
    const OWNER_GAS_TTL_MS = 60 * 60 * 1000;   // 1 小时
    const OWNER_GAS_MAX_PAGES = 5;             // owner tx 稀少，5 页(500 笔)兜底防异常
    const ROLLYTICS_HOST = 'https://rollytics-api-yominet-1.anvil.asia-southeast.initia.xyz';
    const OWNER_SEC_PER_BLOCK = 2.29;          // Yominet 出块 ~2.29s（复用 gas 调研实测值），owner tx 按块号估时间分窗
    async function _fetchOwnerGas(ownerAddr, windows) {
        // 返回 { ok:true, windows:{ '24h':{wei:'..',txN:n}, ... }, fetchedN, pages, fromCache, blockBased } 或 { ok:false, error }
        if (!ownerAddr) return { ok: false, error: '无 owner 地址' };
        const addr = String(ownerAddr).toLowerCase();
        // 1) 缓存命中（同地址 + 未过期）
        try {
            const raw = localStorage.getItem(OWNER_GAS_CACHE_KEY);
            if (raw) {
                const c = JSON.parse(raw);
                if (c && c.ownerAddr === addr && c.windows && (Date.now() - c.ts) < OWNER_GAS_TTL_MS) {
                    return { ok: true, windows: c.windows, fetchedN: c.fetchedN || 0, pages: c.pages || 0, fromCache: true, blockBased: !!c.blockBased };
                }
            }
        } catch (_) {}
        // 2) 当前区块（分窗基准）；拿不到则不分窗（owner tx 稀少，全部计入各窗口，报告注明）
        let curBlock = null;
        try {
            const provider = _gasLedgerProvider();
            if (provider && typeof provider.getBlockNumber === 'function') {
                curBlock = Number(await provider.getBlockNumber());
                if (!isFinite(curBlock)) curBlock = null;
            }
        } catch (_) { curBlock = null; }
        // 3) 翻页拉取 Rollytics（上限 OWNER_GAS_MAX_PAGES 页）
        const txs = [];
        let pages = 0;
        try {
            let nextKey = null;
            for (let p = 0; p < OWNER_GAS_MAX_PAGES; p++) {
                let url = ROLLYTICS_HOST + '/indexer/tx/v1/evm-txs/by_account/' + addr + '?is_signer=true&pagination.limit=100';
                if (nextKey) url += '&pagination.key=' + encodeURIComponent(nextKey);
                const resp = await fetch(url, { method: 'GET' });
                if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
                const data = await resp.json();
                const arr = (data && data.txs) || [];
                for (const t of arr) txs.push(t);
                pages++;
                nextKey = data && data.pagination && data.pagination.next_key;
                if (!nextKey || arr.length === 0) break;
            }
        } catch (e) {
            return { ok: false, error: (e && e.message) || String(e) };
        }
        // 4) 按块号阈值分窗累加 Σ gasUsed×effectiveGasPrice（两者 hex，BigInt 直接解析 0x 前缀）
        const out = {};
        for (const w of windows) out[w.label] = 0n;
        const cnt = {};
        for (const w of windows) cnt[w.label] = 0;
        for (const t of txs) {
            let g = 0n;
            try { g = BigInt(t.gasUsed) * BigInt(t.effectiveGasPrice); } catch (_) { continue; }
            let blk = null;
            try { blk = Number(BigInt(t.blockNumber)); } catch (_) { blk = null; }
            for (const w of windows) {
                let inWin;
                if (curBlock != null && blk != null) {
                    const blocksBack = (w.days * 86400) / OWNER_SEC_PER_BLOCK;
                    inWin = blk >= (curBlock - blocksBack);
                } else {
                    inWin = true;   // 无基准块：owner tx 稀少，宁多勿漏全计入（报告注明未分窗）
                }
                if (inWin) { out[w.label] += g; cnt[w.label]++; }
            }
        }
        // 5) BigInt→string 存缓存（单条，TTL 1h）
        const winStr = {};
        for (const w of windows) winStr[w.label] = { wei: out[w.label].toString(), txN: cnt[w.label] };
        try {
            localStorage.setItem(OWNER_GAS_CACHE_KEY, JSON.stringify({
                ownerAddr: addr, ts: Date.now(), windows: winStr, fetchedN: txs.length, pages, blockBased: (curBlock != null)
            }));
        } catch (_) {}
        return { ok: true, windows: winStr, fetchedN: txs.length, pages, fromCache: false, blockBased: (curBlock != null) };
    }

    // 【helper】_fetchAddrGas24h：任意地址最近 24h 链上 gas 总账（operator 自审计对照用）。   🔻SYNC→内部版[1.2.10 gas全口径]
    //   复用 Rollytics 端点与解析；只统计 24h、翻页上限 15、独立缓存 TTL 1h；
    //   翻满 15 页仍未越过 24h 边界 → truncated:true（报告必须标注「仅下限」，不许当全量）。
    //   ⚠️ 纯只读 GET，零新增 tx；失败由调用方 try/catch 静默降级。
    const ADDR_GAS_24H_CACHE_KEY = 'kami_addr_gas_24h_cache';
    const ADDR_GAS_24H_TTL_MS = 60 * 60 * 1000;   // 1 小时
    const ADDR_GAS_24H_MAX_PAGES = 15;
    async function _fetchAddrGas24h(addr) {
        // 返回 { ok:true, wei:'..', txN, pages, fromCache, truncated } 或 { ok:false, error }
        if (!addr) return { ok: false, error: '无地址' };
        const a = String(addr).toLowerCase();
        try {
            const raw = localStorage.getItem(ADDR_GAS_24H_CACHE_KEY);
            if (raw) {
                const c = JSON.parse(raw);
                if (c && c.addr === a && c.wei != null && (Date.now() - c.ts) < ADDR_GAS_24H_TTL_MS) {
                    return { ok: true, wei: c.wei, txN: c.txN || 0, pages: c.pages || 0, fromCache: true, truncated: !!c.truncated };
                }
            }
        } catch (_) {}
        let curBlock = null;
        try {
            const provider = _gasLedgerProvider();
            if (provider && typeof provider.getBlockNumber === 'function') {
                curBlock = Number(await provider.getBlockNumber());
                if (!isFinite(curBlock)) curBlock = null;
            }
        } catch (_) { curBlock = null; }
        if (curBlock == null) return { ok: false, error: '无当前区块' };
        const minBlk = curBlock - (86400 / OWNER_SEC_PER_BLOCK);
        let totalWei = 0n, txN = 0, pages = 0, sawOutside = false;
        try {
            let nextKey = null;
            for (let p = 0; p < ADDR_GAS_24H_MAX_PAGES; p++) {
                let url = ROLLYTICS_HOST + '/indexer/tx/v1/evm-txs/by_account/' + a + '?is_signer=true&pagination.limit=100';
                if (nextKey) url += '&pagination.key=' + encodeURIComponent(nextKey);
                const resp = await fetch(url, { method: 'GET' });
                if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
                const data = await resp.json();
                const arr = (data && data.txs) || [];
                pages++;
                for (const t of arr) {
                    let blk = null;
                    try { blk = Number(BigInt(t.blockNumber)); } catch (_) { blk = null; }
                    if (blk == null) continue;
                    if (blk < minBlk) { sawOutside = true; continue; }
                    let g = 0n;
                    try { g = BigInt(t.gasUsed) * BigInt(t.effectiveGasPrice); } catch (_) { continue; }
                    totalWei += g;
                    txN++;
                }
                nextKey = data && data.pagination && data.pagination.next_key;
                if (!nextKey || arr.length === 0) break;
                // 索引通常新→旧；已越过 24h 边界则后续更旧，可停
                if (sawOutside) break;
            }
        } catch (e) {
            return { ok: false, error: (e && e.message) || String(e) };
        }
        // 翻满 15 页仍未见到 24h 外 tx → 样本截断，仅下限
        const truncated = (pages >= ADDR_GAS_24H_MAX_PAGES && !sawOutside);
        const weiStr = totalWei.toString();
        try {
            localStorage.setItem(ADDR_GAS_24H_CACHE_KEY, JSON.stringify({
                addr: a, ts: Date.now(), wei: weiStr, txN, pages, truncated
            }));
        } catch (_) {}
        return { ok: true, wei: weiStr, txN, pages, fromCache: false, truncated };
    }

    // 【控制台命令】showGasReport()：链上真值 gas 报告（攒字符串数组，最后一次 console.log 避 userscript 前缀刷屏）
    // 🔻SYNC→内部版[1.2.10 gas全口径] mETH 单位 + 分类笔数/均价 + 辅助动作类型 + operator 链上总账对照
    window.showGasReport = async function () {
        const L = [];
        const WEI_PER_METH = 1e15;   // 1 mETH = 0.001 ETH = 1e15 wei
        const fmtMeth = (wei) => { try { return (Number(wei) / WEI_PER_METH).toFixed(3); } catch (_) { return '0.000'; } };
        try {
            const arr = _gasLedgerRead();
            const now = Date.now();
            const DAY = 24 * 60 * 60 * 1000;
            const windows = [
                { label: '24h', ms: 1 * DAY, days: 1 },
                { label: '3d',  ms: 3 * DAY, days: 3 },
                { label: '7d',  ms: 7 * DAY, days: 7 },
                { label: '30d', ms: 30 * DAY, days: 30 },
            ];
            const ACTIONS = ['deploy', 'stop', 'feed', 'revive', 'scavenge', 'xp_potion', 'craft', 'upgrade', 'skill', 'respec'];
            const ACT_LABEL = { deploy: '部署', stop: '停采', feed: '喂食', revive: '复活', scavenge: '拾荒', xp_potion: 'XP药水', craft: '合成', upgrade: '升级', skill: '加点', respec: '重置技能' };

            L.push('═══════════ ⛽ Gas 真值账本报告（链上 receipt 逐笔核算） ═══════════');
            L.push(`账本条目: ${arr.length} 条（上限 ${GAS_LEDGER_MAX}，保留 ${GAS_LEDGER_RETAIN_DAYS} 天）`);
            const pending = arr.filter(e => e && e.hash && e.gasWei == null).length;
            const noHash  = arr.filter(e => e && !e.hash && e.gasWei == null).length;
            L.push(`未补 gas: ${pending} 条（有 hash，reconciler 待补）｜无 hash 无法补: ${noHash} 条（拾荒等 UI 点击 tx，无 tx 对象/hash，仅计动作次数）`);
            L.push('');

            // 解析地址：operator（脚本发 tx 地址）+ owner（手动 tx 主身份地址）——一次解析，下方 owner 段/余额续航复用
            let operatorAddr = null, ownerAddr = null, accName = '';
            try {
                const addr = window.network && window.network.network && window.network.network.connectedAddress && window.network.network.connectedAddress.value_;
                if (addr) {
                    const acc = window.network.explorer.accounts.getByOperator(addr);
                    operatorAddr = (acc && acc.operatorAddress) || addr;   // operator=脚本发 tx/燃烧地址
                    ownerAddr = (acc && acc.id) || null;                    // owner=主身份地址（手动 tx）
                    accName = (acc && acc.name) || '';
                }
            } catch (_) {}

            // ═══ operator（脚本自动化，链上 receipt 逐笔核算，来自账本）═══
            L.push('═══════════【operator（脚本自动化）· 按动作分类】═══════════');
            if (operatorAddr) L.push(`   operator 地址: ${operatorAddr}${accName ? ' (' + accName + ')' : ''}`);
            let avg7dGasWei = 0n;   // operator 7 天日均（供余额续航）
            const opWinWei = {};    // label -> BigInt（供合计段）
            for (const w of windows) {
                const since = now - w.ms;
                const inWin = arr.filter(e => e && e.ts >= since && e.gasWei != null);
                let total = 0n, revertWei = 0n, revertN = 0, txN = 0;
                const byAct = {};   // action -> { wei: BigInt, n: number }
                for (const e of inWin) {
                    let g = 0n;
                    try { g = BigInt(e.gasWei); } catch (_) { g = 0n; }
                    total += g;
                    txN++;
                    if (e.status === 0) { revertWei += g; revertN++; }
                    if (!byAct[e.action]) byAct[e.action] = { wei: 0n, n: 0 };
                    byAct[e.action].wei += g;
                    byAct[e.action].n++;
                }
                opWinWei[w.label] = total;
                if (w.label === '7d') avg7dGasWei = (w.days > 0) ? (total / BigInt(w.days)) : 0n;
                const perDay = (w.days > 0) ? (Number(total) / w.days / WEI_PER_METH) : 0;
                L.push(`──────── 最近 ${w.label} ────────`);
                L.push(`   总 gas: ${fmtMeth(total)} mETH  |  tx ${txN} 笔  |  日均 ${perDay.toFixed(3)} mETH/day`);
                L.push(`   revert 白烧: ${fmtMeth(revertWei)} mETH（${revertN} 笔，已计入上面总额）`);
                for (const a of ACTIONS) {
                    if (!(a in byAct)) continue;
                    const slot = byAct[a];
                    const g = slot.wei;
                    const n = slot.n;
                    const pct = (total > 0n) ? (Number(g) / Number(total) * 100).toFixed(1) : '0.0';
                    const avgWei = (n > 0) ? (g / BigInt(n)) : 0n;
                    L.push(`      ${ACT_LABEL[a] || a}: ${fmtMeth(g)} mETH (${pct}%) | ${n} 笔 | 均 ${fmtMeth(avgWei)} mETH/笔`);
                }
                L.push('');
            }

            // operator 链上总账对照（Rollytics 24h，防再漏挂）——失败静默降级，绝不影响主报告
            if (operatorAddr) {
                try {
                    let chainRes = null;
                    try { chainRes = await _fetchAddrGas24h(operatorAddr); } catch (e) { chainRes = { ok: false, error: (e && e.message) || String(e) }; }
                    if (chainRes && chainRes.ok) {
                        let chainWei = 0n;
                        try { chainWei = BigInt(chainRes.wei || '0'); } catch (_) { chainWei = 0n; }
                        const truncTag = chainRes.truncated ? '  ⚠️样本截断,仅下限' : '';
                        L.push(`   链上总账(Rollytics 24h): ${fmtMeth(chainWei)} mETH / ${chainRes.txN || 0} 笔${truncTag}`);
                        const ledger24 = opWinWei['24h'] || 0n;
                        const gap = chainWei - ledger24;
                        L.push(`   账本外缺口: ${fmtMeth(gap)} mETH(≈未挂钩tx+未补receipt;持续>10%需排查漏挂)`);
                    } else {
                        L.push('   链上总账对照不可用');
                    }
                } catch (_) {
                    L.push('   链上总账对照不可用');
                }
                L.push('');
            }

            // ═══ owner（手动 tx：充值/转 kami 等，脚本发不了，链上 Rollytics 索引器）═══   🔻SYNC[1.2.8 owner手动tx核算]
            L.push('═══════════【owner（手动 tx：充值/转 kami 等）· Rollytics 索引器】═══════════');
            const ownerWinWei = {};   // label -> BigInt（供合计段）
            for (const w of windows) ownerWinWei[w.label] = 0n;
            if (ownerAddr) {
                try { console.log('⏳ 拉取 owner 手动 tx gas（Rollytics 索引器，可能几秒）…'); } catch (_) {}
                let ownerRes = null;
                try { ownerRes = await _fetchOwnerGas(ownerAddr, windows); } catch (e) { ownerRes = { ok: false, error: (e && e.message) || String(e) }; }
                if (ownerRes && ownerRes.ok) {
                    L.push(`   owner 地址: ${ownerAddr}  ${ownerRes.fromCache ? '（缓存命中，TTL 1h）' : `（实拉 ${ownerRes.fetchedN} 笔 / ${ownerRes.pages} 页）`}`);
                    if (ownerRes.blockBased === false) {
                        // 🔻SYNC→内部版[1.2.8 owner手动tx核算] grok审non-blocking:拿不到区块时不假分窗——owner不掺各窗、不掺合计,
                        //   只报"全部拉到的总额";否则会把全历史算进24h并污染合计(显示误导数字)。
                        let gAll = 0n, nAll = 0;
                        try { gAll = BigInt((ownerRes.windows['30d'] && ownerRes.windows['30d'].wei) || '0'); nAll = (ownerRes.windows['30d'] && ownerRes.windows['30d'].txN) || 0; } catch (_) {}
                        L.push('   ⚠️ 拿不到当前区块,无法按时间窗切分。owner tx 稀少、gas 极小。');
                        L.push(`   owner 全部拉到: ${fmtMeth(gAll)} mETH / ${nAll} 笔（未分窗,不计入下方各窗与合计）`);
                        // ownerWinWei 保持全 0 → 合计段只按 operator 计,不被污染
                    } else {
                        for (const w of windows) {
                            let g = 0n;
                            try { g = BigInt((ownerRes.windows[w.label] && ownerRes.windows[w.label].wei) || '0'); } catch (_) { g = 0n; }
                            const n = (ownerRes.windows[w.label] && ownerRes.windows[w.label].txN) || 0;
                            ownerWinWei[w.label] = g;
                            L.push(`   最近 ${w.label}: ${fmtMeth(g)} mETH  |  tx ${n} 笔`);
                        }
                    }
                } else {
                    L.push(`   ⚠️ owner 手动 tx 查询失败/跳过：${(ownerRes && ownerRes.error) || '未知'}`);
                    L.push('   （不影响上方 operator 报告；owner gas 也可命令行 bash 查gas.sh 兜底。合计段将只按 operator 计）');
                }
            } else {
                L.push('   （未解析到 owner 地址，跳过 owner 段；operator 报告不受影响）');
            }
            L.push('');

            // ═══ 合计（operator + owner）═══
            L.push('═══════════【合计（operator + owner）】═══════════');
            let sum7dGasWei = 0n;   // 合计 7 天日均（供余额续航参考）
            for (const w of windows) {
                const op = opWinWei[w.label] || 0n;
                const ow = ownerWinWei[w.label] || 0n;
                const tot = op + ow;
                if (w.label === '7d') sum7dGasWei = (w.days > 0) ? (tot / BigInt(w.days)) : 0n;
                const perDay = (w.days > 0) ? (Number(tot) / w.days / WEI_PER_METH) : 0;
                L.push(`   最近 ${w.label}: ${fmtMeth(tot)} mETH（operator ${fmtMeth(op)} + owner ${fmtMeth(ow)}）  |  合计日均 ${perDay.toFixed(3)} mETH/day`);
            }
            L.push('');

            // 余额续航：operator 链上余额 ÷ operator 7 天日均（脚本消耗=你能控的）；另注合计日均供参考
            try {
                const provider = _gasLedgerProvider();
                if (provider && typeof provider.getBalance === 'function' && operatorAddr) {
                    const bal = await provider.getBalance(operatorAddr);
                    const balWei = BigInt(bal.toString());
                    L.push('═══════════【余额续航】═══════════');
                    L.push(`   Operator ${operatorAddr}${accName ? ' (' + accName + ')' : ''}`);
                    L.push(`   当前余额: ${fmtMeth(balWei)} mETH`);
                    if (avg7dGasWei > 0n) {
                        const daysLeft = Number(balWei) / Number(avg7dGasWei);
                        L.push(`   按 operator 7 天日均 ${fmtMeth(avg7dGasWei)} mETH/day 估算，还能用 ≈ ${daysLeft.toFixed(1)} 天（仅算脚本自动化消耗，你能控的部分）`);
                    } else {
                        L.push('   （7 天内暂无已补 gas 记录，无法估算续航；等 reconciler 补齐后再看）');
                    }
                    if (sum7dGasWei > 0n) L.push(`   参考：operator+owner 合计 7 天日均 ${fmtMeth(sum7dGasWei)} mETH/day（owner 手动 tx 你控不了，续航仍以 operator 为准）`);
                    L.push('');
                }
            } catch (_) {}

            L.push('说明：拾荒（UI 点击）无 tx 对象、hash 抓不到，gas 无法入账，仅计动作次数；其余动作均由链上 receipt 逐笔核算，单价逐笔用 receipt 的 gasPrice。合成/升级/加点/重置由辅助脚本挂钩记账(需辅助≥1.2.4)。');
            L.push('═══════════════════════════════════════════════════════');
        } catch (e) {
            L.push('❌ [showGasReport] 生成报告异常: ' + ((e && e.message) || e));
        }
        console.log(L.join('\n'));
    };

    // ============================================================
    // 【板块：console 拦截与全局异常捕获】
    // ------------------------------------------------------------
    // ▍功能：让导出的日志文件包含完整错误现场——
    //   1) 拦截 console.error / console.warn，把内容抄送进
    //      window.__kamiLogBuffer（控制台原始输出完全不受影响）；
    //   2) 监听全局未捕获异常（window 'error'）与未处理 Promise rejection
    //      （'unhandledrejection'），一并写入 buffer；
    //   3) 对游戏自身高频刷屏、无诊断价值的 WARN 做噪声过滤——只挡"写入
    //      buffer"，不挡控制台显示。
    // ▍触发时机：脚本注入时替换 console.error/console.warn 并注册两个
    //   window 级监听器，此后全部被动触发。
    // ▍依赖：window.__kamiLogBuffer（日志基础设施板块创建）。
    // ▍核心流程：
    //   1) 先保存原始实现 _origError/_origWarn；
    //   2) 替换后的函数第一步原样转发给原始实现（控制台显示不变）；
    //   3) 参数序列化：Error 对象展开为 name/message/stack，其余 JSON 化
    //      （失败回退 String）；
    //   4) warn 先过噪声名单再入档，error 直接入档；四类条目分别带
    //      [ERROR]/[WARN]/[UNCAUGHT]/[REJECTION] 标签 + 配置时区时间戳。
    // ▍边界与保护：
    //   - 噪声名单 __WARN_NOISE_PATTERNS：游戏自身对 entity 0 / 未知实体的
    //     getter 告警（getSourceID/getAccountIndex/getOperatorAddress/
    //     getOwnerAddress/getRoomIndex 的 "undefined" 系列，以及 "no onyx
    //     item found"），每 5 秒重复一轮，不过滤时单份日志 30-40% 是此类
    //     噪声；正则全部锚定行首精确匹配，[TXQueue]/[queue] 等有价值 WARN
    //     全部保留；
    //   - 过滤只作用于日志 buffer，控制台照常输出，不影响实时排查；
    //   - 序列化 JSON.stringify 全部 try/catch 回退 String()，拦截器自身
    //     永不抛错、不打断原有调用。
    // ▍可调参数：__WARN_NOISE_PATTERNS —— 噪声正则数组，可按需增删；加得
    //   过宽有吞掉有价值 WARN 的风险，新增条目前先确认该告警确无诊断价值。
    // ▍相关控制台命令：无（配合 saveKamiLogs() 导出后查看效果）。
    // ============================================================

    // 拦截console.error和console.warn - 捕获错误信息到日志（先保存原始实现，拦截后仍原样转发）
    const _origError = console.error;
    const _origWarn = console.warn;

    console.error = function(...args) {
        _origError.apply(console, args);
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
            .toISOString().replace('T', ' ').substring(0, 19);
        const text = args.map(a => {
            if (typeof a === 'string') return a;
            if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
            try { return JSON.stringify(a); } catch { return String(a); }
        }).join(' ');
        window.__kamiLogBuffer.push(`[ERROR][${beijingTime}] ${text}`);
    };

    // 游戏内部噪声 WARN 不写入日志 buffer（控制台输出不受影响）
    // 这些是游戏自身对 entity 0 / 未知实体的 getter 告警，每 5 秒重复一轮，
    // 单份日志 30-40% 是此类噪声；[TXQueue]/[queue] 等有价值 WARN 全部保留
    const __WARN_NOISE_PATTERNS = [
        /^getSourceID\(\): undefined/,
        /^getAccountIndex\(\): undefined/,
        /^getOperatorAddress\(\): undefined/,
        /^getOwnerAddress\(\): undefined/,
        /^getRoomIndex\(\): undefined/,
        /^no onyx item found/,
    ];
    console.warn = function(...args) {
        _origWarn.apply(console, args);
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
            .toISOString().replace('T', ' ').substring(0, 19);
        const text = args.map(a => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch { return String(a); }
        }).join(' ');
        if (__WARN_NOISE_PATTERNS.some(p => p.test(text))) return;  // 命中噪声名单：不写入 buffer（控制台已正常输出）
        window.__kamiLogBuffer.push(`[WARN][${beijingTime}] ${text}`);
    };

    // 捕获全局未处理错误 - 记录未捕获的异常
    window.addEventListener('error', (event) => {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
            .toISOString().replace('T', ' ').substring(0, 19);
        const msg = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
        window.__kamiLogBuffer.push(`[UNCAUGHT][${beijingTime}] ${msg}`);
    });

    // 捕获Promise未处理rejection - 记录未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS)
            .toISOString().replace('T', ' ').substring(0, 19);
        const reason = event.reason;
        const msg = reason instanceof Error
            ? `${reason.name}: ${reason.message}`
            : String(reason);
        window.__kamiLogBuffer.push(`[REJECTION][${beijingTime}] ${msg}`);
    });

    // ============================================================
    // 【板块：启动提示与防睡眠提醒】
    // ------------------------------------------------------------
    // ▍功能：脚本注入成功后立即在控制台打印启动确认，并提醒用户关闭
    //   电脑自动睡眠。脚本运行在浏览器页面里，电脑一旦睡眠，页面 JS
    //   定时器全部暂停，采集中的 kami 得不到监控，HP 跌破清算线就可能
    //   被其他玩家的杀手 kami 清算，因此长时间挂机前必须关掉自动睡眠。
    // ▍触发时机：脚本注入后立即同步执行（本脚本最早的控制台输出）。
    // ▍依赖：log()（本脚本统一日志函数，定义在前文）。
    // ▍核心流程：1) 打印启动成功提示 2) 分别打印 Mac / Windows 两个
    //   平台的防睡眠设置路径，方便用户照着操作。
    // ▍边界与保护：纯提示输出，无任何副作用。
    // ▍可调参数：无。
    // ============================================================
    log('%c✅ Kamigotchi核心脚本-公开版 v1.2.10 已成功启动，等待网页加载完成…', 'font-size:16px;font-weight:bold;color:#fff;background:#2e7d32;padding:3px 10px;border-radius:4px');   // 🔻SYNC→内部版[1.1.20 启动横幅醒目化]   // 🔻SYNC→内部版[1.1.17 可观测性批次]
    log(`📡 [停采通道] 当前=${_getStopTxChannel()}（v1.1.21 默认raw原始签名器/保守：mud队列回执形状未实盘验证前不作默认；实盘一次干净紧急停采后下版切回mud）｜切换命令 setStopTxChannel('mud'|'raw')`);   // 🔻SYNC→内部版[1.1.19 停采通道统一]   // 🔻SYNC→内部版[1.1.21 默认通道保守回raw]
    log(`%c💤 [挂机提示] 晚上长时间挂机请先关闭电脑自动睡眠，否则脚本会暂停导致 kami 被杀`,
        'color: #d4a017; font-size: 14px;');
    log(`%c   Mac: 系统设置 → 能耗 → 「显示器关闭时防止自动进入睡眠」打开`,
        'color: #d4a017;');
    log(`%c   Windows: 设置 → 系统 → 电源 → 「使设备保持唤醒状态」选「永不」`,
        'color: #d4a017;');
    // 🔻SYNC→内部版[1.2.9 停摆检测器] D：启动时中断回溯（只读 localStorage，不触发急救，避免与死亡监控双跑）
    try {
        const __hbRaw = localStorage.getItem('kami_last_heartbeat');
        if (__hbRaw) {
            const __hbTs = Number(__hbRaw);
            const __hbGap = Date.now() - __hbTs;
            if (Number.isFinite(__hbTs) && __hbGap > 5 * 60 * 1000) {
                const __hbMin = Math.floor(__hbGap / 60000);
                const __hbH = Math.floor(__hbMin / 60);
                const __hbM = __hbMin % 60;
                const __hbDur = __hbH > 0 ? `${__hbH}小时${__hbM}分` : `${__hbM}分`;
                log(`%c📴 距上次运行中断 ${__hbDur}（推测:睡眠/关机/浏览器关闭）。中断期间无人值守，即将进行死亡扫描`,
                    'color: white; background: #c0392b; font-size: 14px; font-weight: bold; padding: 4px;');
            }
        }
    } catch (_) { /* 隐私模式等读不到 localStorage 时静默 */ }

    // ============ [版本检查] 启动时对比 GitHub 最新版本，提示用户是否已更新 ============
    // 🔻SYNC→内部版[1.1.18 版本检查]（内部版无 GitHub 分发，同步时可整块跳过）
    (function versionCheck() {
        const SELF_NAME = '核心脚本';
        const SELF_VERSION = '1.2.10';   // ⚠️ 版本仪式第6处：升版时必须同步改这里
        const META_URL = 'https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-core.meta.js';
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
                // 🔻SYNC→内部版[1.1.21 版本检查降噪]（游戏 SPA 运行时注入 CSP meta 的 connect-src 白名单，raw 外联在游戏页永久失败）
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

    // ============ [环境指纹 v1.1.21] 启动后自动 dump 一次诊断快照 ============
    // 🔻SYNC→内部版[1.1.21 环境指纹]
    // 目的：用户只需提供日志、无需再手贴控制台探针——把历次排障要问的
    //   环境事实（MUD 运行时形状/停采合约入口/CSP 注入/传感器/通道配置）
    //   开机自动写进日志。纯只读纯日志，全 try/catch，任何异常不影响业务。
    (function envFingerprint() {
        let tries = 0;
        function run() {
            tries++;
            const n = window.network;
            if (!n || !n.explorer || !n.txQueue) {
                if (tries < 4) { setTimeout(run, 30000); return; }
                try { log('🧬 [环境指纹] window.network 多次重试仍未就绪，本次跳过'); } catch (e) {}
                return;
            }
            try {
                const nn = n.network || {};
                let bnDesc = '缺失';
                try {
                    const bn$ = nn.blockNumber$;
                    if (bn$ && typeof bn$.subscribe === 'function') {
                        const v = (typeof bn$.getValue === 'function') ? bn$.getValue() : bn$.value;
                        bnDesc = `可订阅(当前块=${v != null ? v : '?'})`;
                    } else if (bn$ != null) bnDesc = `不可订阅(type=${typeof bn$})`;
                } catch (e) { bnDesc = '读取异常'; }
                let connDesc = '缺失';
                try {
                    const c = nn.connected;
                    if (typeof c === 'boolean') connDesc = `boolean=${c}`;
                    else if (c && typeof c.getValue === 'function') connDesc = `subject=${c.getValue()}`;
                    else if (c && typeof c === 'object' && 'value' in c) connDesc = `obj.value=${c.value}`;
                    else if (c != null) connDesc = `type=${typeof c}`;
                } catch (e) { connDesc = '读取异常'; }
                let sys = null, apiStopSrc = '';
                try { sys = n.txQueue && n.txQueue.systems && n.txQueue.systems['system.harvest.stop']; } catch (e) {}
                try { apiStopSrc = String((n.api && n.api.player && n.api.player.pet && n.api.player.pet.harvest && n.api.player.pet.harvest.stop) || '').slice(0, 80); } catch (e) {}
                let cspDesc = '无';
                try {
                    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
                    if (m) cspDesc = '有(动态注入): ' + String(m.content || '').slice(0, 120).replace(/\n/g, ' ');
                } catch (e) {}
                let chan = '?'; try { chan = _getStopTxChannel(); } catch (e) {}
                let mode = '?'; try { mode = localStorage.getItem('kami_mode') || 'greedy'; } catch (e) {}
                log(`🧬 [环境指纹] 通道=${chan} 模式=${mode} | explorer=${!!n.explorer} txQueue=${!!n.txQueue} api=${!!n.api} clock=${!!nn.clock} LoadingState=${!!(n.components && n.components.LoadingState)}`);
                log(`🧬 [环境指纹] blockNumber$=${bnDesc} | connected=${connDesc} | frozen=${window.__frontendFrozen === true}`);
                log(`🧬 [环境指纹] 停采system: batched=${typeof (sys && sys.executeBatched)} allowFailure=${typeof (sys && sys.executeBatchedAllowFailure)} | api.stop封装=${apiStopSrc}`);
                log(`🧬 [环境指纹] CSP(meta)=${cspDesc}`);
            } catch (e) { try { log(`🧬 [环境指纹] 生成异常(${e && e.message})，跳过`); } catch (e2) {} }
        }
        setTimeout(run, 60000);   // 60s 后跑（等 MUD 就绪），未就绪再重试 3 次×30s
    })();

    // ============================================================
    // 【板块：账户规模检查（小账户警告）】
    // ------------------------------------------------------------
    // ▍功能：启动后检查当前账户的 kami 总数并给出适用性提示。本脚本
    //   的紧急停采采用"凑批"策略——积累 ≥ 6 只 urgent（触及停采线）的
    //   kami 才批量停采，用一次批量 TX 摊薄 gas。kami 总数 ≤ 7 的小
    //   账户可能永远凑不满一批，紧急停采会反复"跳过本轮"，kami 在
    //   清算边缘等死，所以启动时就用红色大字警告小账户用户。
    // ▍触发时机：启动后延迟 60 秒执行一次（等钱包连接 / 网络层就绪）。
    // ▍依赖：
    //   - window.network.network.connectedAddress —— 游戏前端暴露的
    //     当前钱包地址（value_ 与 value 两种字段名做兼容取值）；
    //   - window.network.explorer.accounts.getByOperator(addr) —— 链上
    //     数据接口，按 operator 地址查账户对象（含 kamis 数组）。
    // ▍核心流程：
    //   1) 取钱包地址，取不到说明页面还没就绪，直接 return；
    //   2) 调 getByOperator 拿账户对象，统计 kamis.length；
    //   3) 总数在 1~7 之间 → 红色警告：凑批策略不适用，建议把账户
    //      养到 > 7 只再用，或改为手动调用 emergencyStopHarvest()；
    //   4) 总数 > 7 → 绿色确认：凑批策略正常生效；
    //   5) kamis 不是数组时记为 -1，两个分支都不命中，静默跳过。
    // ▍边界与保护：整体 try/catch 包裹，网络 / API 未就绪时静默失败，
    //   不影响主流程；地址为空时提前返回。
    // ▍可调参数：
    //   60 * 1000 —— 检查延迟毫秒数。网络慢、钱包连接慢可调大；
    //   阈值 7 —— 与凑批下限 6 只对应（≤ 7 只时余量不足），不建议单独改。
    // ============================================================
    setTimeout(async () => {
        try {
            const _addr = window.network?.network?.connectedAddress?.value_
                       || window.network?.network?.connectedAddress?.value;
            if (!_addr) return;
            const _acc = await window.network?.explorer?.accounts?.getByOperator(_addr);
            const _total = Array.isArray(_acc?.kamis) ? _acc.kamis.length : -1;
            if (_total > 0 && _total <= 7) {
                log(`%c⚠️ [小账户提示] 当前账户 kami 数 = ${_total}（≤ 7）`,
                    'color: red; font-size: 14px; font-weight: bold;');
                log(`%c   本脚本面向大账户（kami > 7）设计，凑批策略要求积累 ≥ 6 只 urgent 才批量停采`,
                    'color: red;');
                log(`%c   你的账户可能等不到 6 只 → 紧急停采可能反复"跳过本轮"导致 kami 在边缘等死`,
                    'color: red;');
                log(`%c   建议：账户养到 > 7 只后再用，或手动操作（emergencyStopHarvest 仍可手动调用）`,
                    'color: red;');
            } else if (_total > 7) {
                log(`%c✅ [账户检查] kami 数 = ${_total}（> 7），凑批策略正常生效`,
                    'color: green;');
            }
        } catch (e) {
            // 网络/API 还没好就算了，不影响主流程
        }
    }, 60 * 1000);

    // ============================================================
    // 【板块：控制台命令清单 banner】
    // ------------------------------------------------------------
    // ▍功能：启动 3 秒后在控制台打印一份完整的可用命令清单，按
    //   紧急控制 / 模式切换 / 黑名单管理 / 喂食重置 / Gas·TX 状态 /
    //   mETH 消耗追踪 / 数据库 / 日志调试 分组展示；每条命令独占一行，
    //   可直接复制粘贴到控制台运行；高危或高频命令用 %c 红色高亮。
    // ▍触发时机：启动后 setTimeout 3000 毫秒执行一次。
    // ▍依赖：仅 console.log；清单中列出的函数由本脚本各板块定义并
    //   挂到 window 上（kamiAnalyze() 例外，由配套的辅助脚本提供）。
    // ▍核心流程：纯打印，无逻辑分支、无副作用。
    // ▍边界与保护：注意——下方 console.log 里的所有文案（包括以 //
    //   开头的"命令说明"行）都是代码字符串，是打印给用户看的内容，
    //   不是注释，修改脚本时不要当成注释处理。
    // ▍可调参数：3000 —— banner 延迟打印毫秒数，只影响打印时机。
    // ▍相关控制台命令：清单本身就是全脚本的命令索引，各命令的详细
    //   行为见其所属板块的说明块。
    // ============================================================
    setTimeout(() => {
        console.log('');
        console.log('══════════════════════════════════════════════════════════════');
        console.log('%c🎮 Kamigotchi核心脚本-公开版 v1.2.10 可用命令（每条命令独占一行，直接复制粘贴）', 'color: #1e90ff; font-weight: bold;');   // 🔻SYNC→内部版[1.1.17 可观测性批次]
        console.log('══════════════════════════════════════════════════════════════');
        console.log('');
        console.log('───────── 🛑 紧急控制 ─────────');
        console.log('// 紧急停采 HP 触及停采线（≤ 停采线+1%）+ 所有 STARVING 的 kami；健康的不动');
        console.log('%cemergencyStopHarvest()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('// 一键批量停采当前地块所有 HARVESTING 的 kami（按 HP 危险优先，方便切换地块）');
        console.log('%cstopCurrentRoom()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('// 一键批量停采所有 minority 中 HARVESTING 的 kami（方便手动转移到其他账户）');
        console.log('// 依赖辅助脚本；杀手 kami 自动跳过；先调 kamiAnalyze() 看分布再决定要不要停');
        console.log('%cstopMinorityForTransfer()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('// 上面两个停采命令完成后会自动暂停自动部署 10 分钟（转移窗口）；提前恢复用这个');
        console.log('%cresumeDeploy()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('───────── 🔀 模式切换 ─────────');
        console.log('// 切换到贪婪模式（极限停采线 5%；检测到杀手会自动切回安全线；旧名 \'starving\' 仍兼容）');
        console.log("setKamiMode('greedy')");
        console.log('');
        console.log('// 切换到正常模式（安全停采线，清算线 + 3%）');
        console.log("setKamiMode('normal')");
        console.log('');
        console.log('// 查看当前模式状态');
        console.log('getKamiMode()');
        console.log('');
        console.log('───────── 📋 黑名单管理 ─────────');
        console.log('// 查看部署黑名单（被排除不部署的 kami）');
        console.log('showBlockedKamis()');
        console.log('');
        console.log('// 查看停采黑名单（停采失败被冷却的 kami）');
        console.log('showStopBlockedKamis()');
        console.log('');
        console.log('// 清除所有黑名单（部署 + 停采）');
        console.log('clearBlockedKamis()');
        console.log('');
        console.log('// 仅清除停采黑名单');
        console.log('clearStopBlockedKamis()');
        console.log('');
        console.log('───────── 🍽️ 喂食重置 ─────────');
        console.log('// 清除喂食失败冷却记录（失败 kami 立即可重喂）');
        console.log('clearFeedFails()');
        console.log('');
        console.log('// 清除 STARVING 喂食卡住黑名单（链上卡住的 kami 允许重试）');
        console.log('clearStarvingStuck()');
        console.log('');
        console.log('// 清除 XP Potion 喂食记录（允许重新喂食 XP Potion）');
        console.log('clearXPPotionFed()');
        console.log('');
        console.log('// 清除 Fortified 喂食记录（允许重新喂食 Fortified）');
        console.log('clearFortifiedFed()');
        console.log('');
        console.log('// 立即触发一次 XP Potion 喂食（只喂不合成；LT>70% + RESTING 的 kami）');
        console.log('%cfeedXPPotionNow()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('// 查看我的杀手 kami 清单（XP Potion 喂食时自动跳过这些 kami）');
        console.log('showMyKillers()');
        console.log('');
        console.log('───────── ⛽ Gas / TX 状态 ─────────');
        console.log('// 查看 Gas 消耗规则（各动作的 gas 单价配置）');
        console.log('showGasRules()');
        console.log('');
        console.log('// 查看当前 TX 锁状态（紧急锁 / 普通锁）');
        console.log('getTxLockStatus()');
        console.log('');
        console.log('// 切换停采发送通道：mud=MUD队列(默认,统一nonce) / raw=原始签名器(回退)；不填参数查当前');
        console.log("setStopTxChannel('mud'|'raw')");
        console.log('');
        console.log('// 人化活动保活开关(75s合成mousemove+5min全程扫掠;仅点HP文本/状态图标(白名单锚定,非随机);真人操作自动让路)；默认on');
        console.log("setKeepAlive('on'|'off')");
        console.log('');
        console.log('───────── 💰 Gas 真值账本 ─────────');
        console.log('// 链上真值 gas 报告：按动作分类(部署/停采/喂食/复活/拾荒/XP) + 24h/3d/7d/30d + 日均 + revert白烧 + 余额续航（最强大）⭐');
        console.log('%cshowGasReport()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('───────── 📦 数据库 ─────────');
        console.log('// 手动增量同步精简数据库（diff 账户当前 kami list，只补不删，自动持久化）');
        console.log('%csyncKamiDb()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('// 查看当前数据库（17 字段，含 LT/level/harmony 等）');
        console.log('window.kami_core_db');
        console.log('');
        console.log('───────── 💾 日志 / 调试 ─────────');
        console.log('// 手动保存当前日志到文件（不刷新页面）');
        console.log('%csaveKamiLogs()', 'color: red; font-size: 14px;');
        console.log('');
        console.log('// 开启调试日志（会刷新页面，flags 可选 parse/start/stop/api/dom/feed）');
        console.log('kamiDebugOn({ parse: true })');
        console.log('');
        console.log('// 关闭调试日志（会刷新页面）');
        console.log('kamiDebugOff()');
        console.log('');
        console.log('══════════════════════════════════════════════════════════════');
        console.log('💡 切换地块前批量停采 → stopCurrentRoom()');
        console.log('🗺️ 多账户分工策略 → 先 kamiAnalyze()【辅助】看分类，再 stopMinorityForTransfer() 停采 → 手动转移到对应账户');
        console.log('📦 账户新增 kami → syncKamiDb()（启动时自动跑一次，新增 kami 自动入库）');
        console.log('💰 查看账户 gas 消耗速率(链上真值,按动作分类) → showGasReport()');
        console.log('══════════════════════════════════════════════════════════════');
        console.log('');
    }, 3000);


    // ============================================================
    // 【板块：调试总开关（localStorage 持久化）】
    // ------------------------------------------------------------
    // ▍功能：提供按标签分类的调试日志开关。平时调试日志全部静默，
    //   排查问题时可以只打开某几类，避免控制台刷屏。开关状态写入
    //   localStorage，刷新页面后依然生效。
    // ▍触发时机：脚本注入时同步初始化一次；dlog() 被各板块随时调用。
    // ▍依赖：localStorage key：
    //   - 'kami_debug' —— 总开关，值为 '1' 时开启，其他值一律视为关闭；
    //   - 'kami_debug_flags' —— JSON 字符串，记录各分类标签的布尔开关。
    // ▍核心流程：
    //   1) __DBG_DEFAULT 定义 6 个分类标签的默认值（全 false）：
    //      parse=数据解析、start=部署/开采、stop=停采、api=链上 API、
    //      dom=DOM 读取、feed=喂食；
    //   2) __DBG 从 localStorage 读取 flags，解析失败（含 key 不存在时
    //      读到空字符串）则回退到默认值；
    //   3) dlog(tag, ...) 两级判断：总开关未开直接返回；该标签被显式
    //      设为 false 也返回（未定义的新标签默认放行），否则输出日志；
    //   4) kamiDebugOn(flags) / kamiDebugOff() 写入 localStorage 后
    //      location.reload() 刷新页面——开关只在脚本初始化时读取一次，
    //      必须重载页面才能生效，这也是命令说明里标注"会刷新页面"的原因。
    // ▍边界与保护：JSON.parse 用 try/catch 包裹，localStorage 内容损坏
    //   时自动回退默认值；总开关关闭时 dlog 第一行即 return，零开销。
    // ▍可调参数：__DBG_DEFAULT —— 各标签的默认开关；新增日志分类时在
    //   此对象里加标签即可。
    // ▍相关控制台命令：
    //   kamiDebugOn({ parse: true }) —— 开启调试日志并指定标签（会刷新页面）；
    //   kamiDebugOff() —— 关闭全部调试日志（会刷新页面）。
    // ============================================================
    const __DBG_DEFAULT = { parse:false, start:false, stop:false, api:false, dom:false, feed:false };
    const __DBG = (() => {
        try { return JSON.parse(localStorage.getItem('kami_debug_flags')||'') || __DBG_DEFAULT; }
        catch { return __DBG_DEFAULT; }
    })();
    const __DBG_ON = localStorage.getItem('kami_debug') === '1';

    window.kamiDebugOn  = (flags={}) => { localStorage.setItem('kami_debug','1'); localStorage.setItem('kami_debug_flags', JSON.stringify({...__DBG, ...flags})); location.reload(); };
    window.kamiDebugOff = ()           => { localStorage.setItem('kami_debug','0'); location.reload(); };

    function dlog(tag, ...args){
        if (!__DBG_ON) return;
        if (tag && __DBG[tag] === false) return;
        console.log(...args);
    }

    //=====简易等待工具：delay(ms) 返回 ms 毫秒后 resolve 的 Promise，供全脚本 await 使用=====
    const delay = ms => new Promise(r => setTimeout(r, ms));

    // ============================================================
    // 【板块：TX 双锁机制（紧急锁 + 普通锁）】
    // ------------------------------------------------------------
    // ▍功能：同一钱包的链上 TX 必须串行发送，并发会造成 nonce 冲突，
    //   导致交易被替换或丢弃。本板块用两把挂在 window 上的内存锁，把
    //   核心脚本与辅助脚本的所有 TX 排成一条队：
    //   - 紧急锁（window.__txEmergencyLock）：紧急停采专用，优先级最高，
    //     持有期间任何普通 TX 都不允许启动（保命操作先行）；
    //   - 普通锁（window.__txNormalLock）：部署/喂食/合成/升级等常规 TX
    //     共用，同一时刻只允许一个操作持有，锁对象记录 operation（操作名）、
    //     script（哪个脚本）、since（上锁时间戳）便于诊断。
    // ▍触发时机：所有发 TX 的入口在发送前调用；hasEmergencyLock() 是
    //   一切操作的前置检查。
    // ▍依赖：window.__txEmergencyLock / window.__txNormalLock ——
    //   两个脚本共享同一份全局锁状态，任何一方上锁对方都能看到。
    // ▍核心流程：
    //   1) 紧急停采：waitForNormalLockRelease() 等普通锁让路（最多 30 秒）
    //      → setEmergencyLock() 上锁 → 发批量停采 TX → releaseEmergencyLock()；
    //   2) 常规 TX：waitForEmergencyRelease() 排队等紧急锁（默认最多 300 秒）
    //      → tryAcquireNormalLock() 抢普通锁 → 发 TX → releaseNormalLock()；
    //   3) 抢锁失败的操作不硬等，由调用方按 TX_RETRY_DELAY 延后重试。
    // ▍边界与保护：
    //   - 超时自愈：锁对象带 since 时间戳，普通锁超 5 分钟、紧急锁超
    //     10 分钟视为持有方异常（页面卡死、流程中断），检查时强制释放，
    //     避免一把僵尸锁卡死整个自动化；
    //   - 防重复初始化：用 typeof === 'undefined' 判断后才置 null，
    //     脚本热重载时不会清掉另一个脚本正持有的锁；
    //   - 释放校验：releaseNormalLock() 必须 operation 和 script 都匹配
    //     才释放，防止 A 操作误释放 B 操作持有的锁；
    //   - 排队让路：常规 TX 遇到紧急锁不是直接失败，而是每 500ms 轮询
    //     等待，紧急停采完成后自动继续，尽量不丢弃本次操作。
    // ▍可调参数：
    //   TX_LOCK_TIMEOUT = 300000 —— 普通锁超时（5 分钟）。调小则死锁
    //     恢复更快，但可能误杀执行中的慢 TX；调大更保守。
    //   TX_EMERGENCY_TIMEOUT = 600000 —— 紧急锁超时（10 分钟）。紧急
    //     停采是多只 kami 的批量操作，耗时更长，故设为普通锁的 2 倍。
    //   TX_RETRY_DELAY = 180000 —— 抢锁失败后的建议重试间隔（3 分钟），
    //     供各调用方引用。
    // ▍相关控制台命令：getTxLockStatus() —— 查看两把锁的当前持有者与
    //   已持有秒数。
    // ============================================================
    const TX_LOCK_TIMEOUT = 300000;        // 普通锁超时：5 分钟未释放视为异常，强制解锁
    const TX_EMERGENCY_TIMEOUT = 600000;   // 紧急锁超时：10 分钟（批量停采耗时更长，取普通锁 2 倍）
    const TX_RETRY_DELAY = 180000;         // 抢锁失败后延后重试的建议间隔：3 分钟

    // 初始化锁（typeof 判断防止脚本重载时清掉已持有的锁）
    if (typeof window.__txEmergencyLock === 'undefined') window.__txEmergencyLock = null;
    if (typeof window.__txNormalLock === 'undefined') window.__txNormalLock = null;

    /**
     * 检查紧急锁是否存在（所有发 TX 的操作都要先过这一关）
     * 顺带做超时自愈：持有超过 TX_EMERGENCY_TIMEOUT 视为持有方异常，强制释放
     */
    function hasEmergencyLock() {
        if (!window.__txEmergencyLock) return false;
        // 超时自愈：紧急停采流程异常中断时防止僵尸锁永久卡死其他 TX
        if (Date.now() - window.__txEmergencyLock.since > TX_EMERGENCY_TIMEOUT) {
            log(`[TX锁] ⚠️ 紧急锁超时(${Math.round((Date.now() - window.__txEmergencyLock.since)/1000)}秒)，强制释放`);
            window.__txEmergencyLock = null;
            return false;
        }
        return true;
    }

    /**
     * 设置紧急锁（紧急停采专用）
     */
    function setEmergencyLock() {
        window.__txEmergencyLock = {
            operation: 'emergency_stop',
            since: Date.now()
        };
        log(`[TX锁] 🚨 设置紧急锁`);
    }

    /**
     * 释放紧急锁
     */
    function releaseEmergencyLock() {
        if (window.__txEmergencyLock) {
            // 🔻SYNC→内部版[1.1.17 可观测性批次] C3：锁持有时长诊断（since 为取锁时刻，纯日志；>120s 才打防刷屏）
            const __heldMs = Date.now() - window.__txEmergencyLock.since;
            if (__heldMs > 120000) log(`⏱️ [锁诊断] 紧急锁[emergency_stop] 持有 ${Math.round(__heldMs / 1000)}s（>120s，长持锁）`);
            log(`[TX锁] 🚨 释放紧急锁`);
            window.__txEmergencyLock = null;
        }
    }

    /**
     * 尝试获取普通锁（非阻塞：抢不到立即返回 false，由调用方延后重试）
     * @param {string} operation - 操作名（如部署/喂食），用于日志与释放校验
     * @param {string} script - 发起脚本标识（核心/辅助），用于日志与释放校验
     * @returns {boolean} 是否成功
     */
    function tryAcquireNormalLock(operation, script) {
        // 1. 紧急锁存在 → 不允许获取（紧急停采优先，常规 TX 一律让路）
        if (hasEmergencyLock()) {
            log(`[TX锁] ⏸️ 紧急锁存在，[${script}/${operation}] 无法获取普通锁`);
            return false;
        }

        // 2. 普通锁已被占用
        if (window.__txNormalLock) {
            // 超时自愈：持有方超过 TX_LOCK_TIMEOUT 未释放，视为异常，强制释放后本次直接接管
            if (Date.now() - window.__txNormalLock.since > TX_LOCK_TIMEOUT) {
                log(`[TX锁] ⚠️ 普通锁 [${window.__txNormalLock.script}/${window.__txNormalLock.operation}] 超时，强制释放`);
                window.__txNormalLock = null;
            } else {
                log(`[TX锁] ⏸️ 普通锁被 [${window.__txNormalLock.script}/${window.__txNormalLock.operation}] 占用`);
                return false;
            }
        }

        // 3. 获取成功
        window.__txNormalLock = {
            operation,
            script,
            since: Date.now()
        };
        log(`[TX锁] 🔒 获取普通锁 [${script}/${operation}]`);
        return true;
    }

    /**
     * 释放普通锁
     * 校验 operation + script 都匹配才释放，防止 A 操作误释放 B 操作持有的锁
     */
    function releaseNormalLock(operation, script) {
        if (window.__txNormalLock?.operation === operation &&
            window.__txNormalLock?.script === script) {
            // 🔻SYNC→内部版[1.1.17 可观测性批次] C3：锁持有时长诊断（since 为取锁时刻，纯日志；>120s 才打防刷屏）
            const __heldMs = Date.now() - window.__txNormalLock.since;
            if (__heldMs > 120000) log(`⏱️ [锁诊断] 普通锁[${script}/${operation}] 持有 ${Math.round(__heldMs / 1000)}s（>120s，长持锁）`);
            log(`[TX锁] 🔓 释放普通锁 [${script}/${operation}]`);
            window.__txNormalLock = null;
        }
    }

    /**
     * 等待普通锁释放（紧急停采专用：上紧急锁前先礼貌地等在途 TX 收尾）
     * @param {number} maxWaitMs - 最长等待毫秒数（默认 30 秒，紧急场景不能久等）
     * @returns {Promise<boolean>} true=普通锁已清空
     */
    async function waitForNormalLockRelease(maxWaitMs = 30000) {
        const start = Date.now();
        while (window.__txNormalLock && Date.now() - start < maxWaitMs) {
            // 等待期间同样做超时自愈：持有方异常时强制释放，立刻结束等待
            if (Date.now() - window.__txNormalLock.since > TX_LOCK_TIMEOUT) {
                log(`[TX锁] ⚠️ 普通锁超时，强制释放`);
                window.__txNormalLock = null;
                break;
            }
            await delay(1000);
        }
        return window.__txNormalLock === null;
    }

    /**
     * 等待紧急锁释放（常规 tx 入口排队式让路）
     * 用于 部署/升级/合成/喂食 等常规 tx 入口：若紧急锁存在，不直接失败，
     * 而是每 500ms 轮询一次排队等待，紧急停采完成释放锁后自动继续发送，
     * 尽量不丢弃本次操作
     * @param {string} tag - 日志标识（tx 名称）
     * @param {number} maxWaitMs - 最大等待时间（默认 300 秒，与 runAutomation 主流程等待时长对齐）
     * @returns {Promise<boolean>} true=已释放可继续, false=超时放弃
     */
    async function waitForEmergencyRelease(tag = '未知tx', maxWaitMs = 300000) {
        if (!hasEmergencyLock()) return true;
        log(`[TX锁] ⏸️ [${tag}] 紧急锁存在，排队等待（最多${Math.round(maxWaitMs / 1000)}秒）...`);
        const start = Date.now();
        while (hasEmergencyLock()) {
            if (Date.now() - start >= maxWaitMs) {
                log(`[TX锁] ⚠️ [${tag}] 等待${Math.round(maxWaitMs / 1000)}秒后紧急锁仍未释放，放弃本次`);
                return false;
            }
            await delay(500);
        }
        const waited = Math.round((Date.now() - start) / 1000);
        log(`[TX锁] ✅ [${tag}] 紧急锁已释放（等待${waited}秒），继续tx`);
        return true;
    }

    /**
     * 获取锁状态（调试用）：返回如「紧急锁(12秒) + 普通锁[脚本/操作](3秒)」的描述串
     */
    function getTxLockStatus() {
        const parts = [];
        if (window.__txEmergencyLock) {
            const elapsed = Math.round((Date.now() - window.__txEmergencyLock.since) / 1000);
            parts.push(`紧急锁(${elapsed}秒)`);
        }
        if (window.__txNormalLock) {
            const elapsed = Math.round((Date.now() - window.__txNormalLock.since) / 1000);
            parts.push(`普通锁[${window.__txNormalLock.script}/${window.__txNormalLock.operation}](${elapsed}秒)`);
        }
        return parts.length ? parts.join(' + ') : '无锁';
    }

    // 暴露到全局（供辅助脚本调用，两个脚本共享同一套锁）
    window.hasEmergencyLock = hasEmergencyLock;
    window.setEmergencyLock = setEmergencyLock;
    window.releaseEmergencyLock = releaseEmergencyLock;
    window.tryAcquireNormalLock = tryAcquireNormalLock;
    window.releaseNormalLock = releaseNormalLock;
    window.waitForNormalLockRelease = waitForNormalLockRelease;
    window.waitForEmergencyRelease = waitForEmergencyRelease;  // 辅助脚本的 tx 入口同样要排队让路
    window.getTxLockStatus = getTxLockStatus;

    // ============================================================
    // 【板块：随机延迟生成】
    // ------------------------------------------------------------
    // ▍功能：生成 0 ~ maxMinutes 分钟之间的随机毫秒数，给周期性动作
    //   加抖动，避免每轮间隔完全固定（错峰执行、降低行为规律性）。
    // ▍触发时机：被检测间隔设置等需要抖动的位置调用。
    // ▍依赖：无。
    // ▍核心流程：Math.random() 取 [0, 1) 乘以分钟上限，换算成毫秒并
    //   向下取整。
    // ▍边界与保护：无副作用的纯函数；maxMinutes 不传时默认 1 分钟。
    // ▍可调参数：maxMinutes —— 随机上限（分钟），由调用方按需传入。
    // ============================================================
    function getRandomDelayMs(maxMinutes = 1) {
        const randomMinutes = Math.random() * maxMinutes;  // [0, maxMinutes) 分钟
        const delayMs = Math.floor(randomMinutes * 60 * 1000);  // 换算为整数毫秒
        return delayMs;
    }

    // ============================================================
    // 【板块：监测时间间隔与状态历史容器】
    // ------------------------------------------------------------
    // ▍功能：确定主监控循环的轮询间隔，并初始化 kami 状态历史容器。
    // ▍触发时机：脚本注入时计算一次，整个页面会话固定使用该间隔
    //   （刷新页面才会重新随机）。
    // ▍依赖：getRandomDelayMs()（上方板块）。
    // ▍核心流程：基础 10 分钟 + 0~3 分钟随机抖动 = 本轮实际间隔
    //   10~13 分钟；计算完成后立即打印实际值，方便确认。
    // ▍边界与保护：间隔偏长是有意设计——监控检查本身不发 TX，拉长
    //   间隔可减少无谓的链上 / DOM 读取开销；HP 危险另有紧急停采线
    //   兜底，不依赖这里的轮询密度。
    // ▍可调参数：
    //   10 * 60 * 1000 —— 基础间隔 10 分钟。调小监控更密但开销更大，
    //     调大更省资源但发现异常更慢；
    //   getRandomDelayMs(3) 的 3 —— 抖动上限 3 分钟，调大则每轮间隔
    //     的波动范围更宽。
    //   kamiHistory —— Map，按 kami 记录上一轮观测到的状态，供主循环
    //     做跨轮次的状态变化对比。
    // ============================================================
    const checkInterval = 10 * 60 * 1000  +  getRandomDelayMs(3);
    log(`⏱️ 本轮检测间隔为：10 分钟 + 随机 ${((checkInterval - 10 * 60 * 1000) / 60000).toFixed(1)} 分钟，共 ${(checkInterval / 60000).toFixed(1)} 分钟`);
    const kamiHistory = new Map();


    // ============================================================
    // ============================================================
    // 【板块：贪婪模式配置与模式切换（Greedy Mode）】
    // 🔻SYNC→内部版[1.1.13 饥饿模式改名贪婪模式]
    // ------------------------------------------------------------
    // ▍功能：
    //   定义脚本的两种停采策略模式，并提供控制台切换/查看命令：
    //   - normal（安全模式）：停采线 = 精确清算线 LT + 3%（LT_STOP_MARGIN，封顶 80%），
    //     取不到精确 LT 时用默认值 65% / 76%；
    //   - greedy（贪婪模式，旧名 starving）：地图上没有杀手时用 5% 极限停采线，
    //     让 kami 尽量采到接近极限才停，最大化单周期采集时长；
    //     一旦检测到杀手，自动退回安全线，杀手消失后再自动恢复。
    // ▍触发时机：
    //   脚本加载时立即执行（模式与常量在加载时固化）；
    //   setKamiMode / getKamiMode 由用户在控制台手动调用。
    // ▍依赖：
    //   - localStorage key「kami_mode」：持久化模式，取值 'normal' 或
    //     'greedy'，未设置时默认 'greedy'；若读到旧版 'starving'，
    //     启动时自动迁移为 'greedy' 并写回 localStorage（一次性，含义不变，仅改名）；
    //   - window.__kamiMode / window.__killerDetected /
    //     window.__lastKillerTime / window.__liquidatedTimestamps：
    //     全局杀手检测状态。这些变量原由杀手监控脚本的 Feed 监控
    //     （监听 liquidated 消息）写入；Feed 监控已停用，默认无人
    //     写入、__killerDetected 恒为 false，本脚本读到的始终是
    //     "无杀手"——安全线自动切换路径默认不生效（变量保留为兼容，
    //     实际杀手保护是杀手监控脚本的位置告警直接触发紧急停采）；
    //   - window.GREEDY_THRESHOLD（原 window.STARVING_THRESHOLD，
    //     v1.1.13 起保留为兼容别名指向同一个值）/ DEFAULT_THRESHOLD_NORMAL /
    //     DEFAULT_THRESHOLD_OTHER / MAX_THRESHOLD：常量挂到 window，
    //     供停采线计算模块与辅助脚本读取。
    // ▍核心流程：
    //   1) 从 localStorage 读取模式（旧值 'starving' 自动迁移为 'greedy'），
    //      杀手状态初始化为"无杀手"；
    //   2) 定义各阈值常量并挂到 window；
    //   3) 输出启动 banner，提示当前模式与生效的停采线规则。
    // ▍边界与保护：
    //   - setKamiMode 接受 'normal' / 'greedy'，以及向后兼容别名 'starving'
    //     （自动归一化为 'greedy' 再写入），其他值直接打印用法说明并返回；
    //   - 模式常量在加载时固化，运行中直接改 localStorage 不会生效，
    //     因此切换后 1.5 秒自动刷新页面，让所有模块按新模式重建；
    //   - 杀手判定规则：LIQUIDATE_WINDOW_MS（5 分钟）滑动窗口内累计
    //     LIQUIDATE_COUNT_TRIGGER（2）条 liquidated 消息 → 判定当前
    //     有活跃杀手，贪婪模式自动改用安全线；之后需要
    //     SAFE_COOLDOWN_MS（15 分钟）内无新击杀才恢复极限线，
    //     避免杀手只是短暂停手就贸然切回激进线。
    //     ⚠️ 该判定的数据源（杀手监控脚本的 Feed 监控）现已停用，
    //     此规则默认不会触发，相关常量保留为兼容；实际杀手保护
    //     见杀手监控脚本的位置轮询（直接触发紧急停采）。
    // ▍可调参数：
    //   - GREEDY_THRESHOLD = 5 — 贪婪模式极限停采线（HP%）。原名
    //     STARVING_THRESHOLD，v1.1.13 起改名，window.STARVING_THRESHOLD
    //     仍保留为兼容别名。调小：采集更久，但饿死/被清算风险上升；
    //     调大：更安全，但牺牲采集时长。
    //   - LIQUIDATE_WINDOW_MS = 5*60*1000 — 杀手判定滑动窗口宽度。
    //     调大更容易凑够条数、更早进入安全模式（更保守）。
    //   - LIQUIDATE_COUNT_TRIGGER = 2 — 窗口内 liquidated 条数阈值。
    //     调成 1 则单次击杀立即避险，灵敏但误报也更多。
    //   - SAFE_COOLDOWN_MS = 15*60*1000 — 发现杀手后恢复贪婪线的
    //     冷却时长。调大更保守，调小恢复激进线更快。
    //   - DEFAULT_THRESHOLD_NORMAL = 65 — normal body 取不到精确 LT
    //     时的默认停采线（%）。
    //   - DEFAULT_THRESHOLD_OTHER = 76 — 非 normal body 的默认停采线
    //     （%）。非 normal body 受亲和度克制、被清算风险更高，
    //     所以默认线定得更高。
    //   - MAX_THRESHOLD = 80 — 停采线封顶，有意设计：目标是"单周期
    //     采集时长最大化"，LT 再高的 kami 也最多 80% 就停，保证每个
    //     周期至少能采 20 个百分点的血量区间；LT 过高的 kami 应优先
    //     升级属性，而不是抬高停采线。
    // ▍相关控制台命令：
    //   - setKamiMode('greedy' | 'normal') — 切换模式（自动刷新页面；
    //     'starving' 仍可作为 'greedy' 的别名输入）
    //   - getKamiMode() — 查看当前模式、杀手状态与恢复倒计时
    // ============================================================

    // 模式: 'normal' (安全模式) 或 'greedy' (贪婪模式，旧名 starving)
    // 默认使用贪婪模式；若检测到旧版 'starving' 值，自动迁移为 'greedy'
    let __kamiMode = localStorage.getItem('kami_mode') || 'greedy';
    if (__kamiMode === 'starving') {
        __kamiMode = 'greedy';
        localStorage.setItem('kami_mode', 'greedy');
        console.log(`ℹ️ [模式迁移] 检测到旧版模式设置 'starving'，已自动迁移为 'greedy'（含义不变，仅改名，无杀手时贪婪采集）`);
    }
    window.__kamiMode = __kamiMode;
    window.__killerDetected = false;      // 杀手检测标记（由轻量杀手监控脚本写入）
    window.__lastKillerTime = 0;          // 上次检测到杀手的时间戳（ms，恢复冷却计时用）
    window.__liquidatedTimestamps = [];   // liquidated 消息时间戳记录（滑动窗口计数用）

    // 贪婪模式参数配置（原"饥饿模式"，v1.1.13 起改名，含义不变）
    const GREEDY_THRESHOLD = 5;           // 贪婪模式极限停采线: 5%（无杀手时生效）
    const LIQUIDATE_WINDOW_MS = 5 * 60 * 1000;    // 杀手判定滑动窗口: 5分钟
    const LIQUIDATE_COUNT_TRIGGER = 2;    // 窗口内2条 liquidated 消息即判定有杀手
    const SAFE_COOLDOWN_MS = 15 * 60 * 1000;      // 15分钟无新击杀才恢复贪婪模式

    // 默认停采线（取不到精确清算线 LT 时的兜底值）
    const DEFAULT_THRESHOLD_NORMAL = 65;  // normal body 默认 65%
    const DEFAULT_THRESHOLD_OTHER = 76;   // 非normal body 默认 76%（受亲和度克制更易被清算，默认线更高）
    const MAX_THRESHOLD = 80;             // 停采线封顶 80%（保证每周期至少能采 20 个百分点的血量区间）
    const LT_STOP_MARGIN = 3;             // 停采线安全垫：停采线 = 精确清算线LT + 3%（v1.1.8 起回归原始垫值——精确线经官网/单测/实盘三重验证后收窄；此前 v1.1.1~1.1.7 过渡期为 15。配套：凑批等待与单停危险线收紧至 -1。调大更保命但采集更短）

    // 挂载到 window，供停采线计算模块与辅助脚本读取
    window.GREEDY_THRESHOLD = GREEDY_THRESHOLD;
    window.STARVING_THRESHOLD = GREEDY_THRESHOLD; // 向后兼容别名(v1.1.13 改名前的旧引用方式)
    window.DEFAULT_THRESHOLD_NORMAL = DEFAULT_THRESHOLD_NORMAL;
    window.DEFAULT_THRESHOLD_OTHER = DEFAULT_THRESHOLD_OTHER;
    window.MAX_THRESHOLD = MAX_THRESHOLD;

    // 控制台命令：切换模式（写 localStorage 后自动刷新页面生效）
    // 接受 'normal' / 'greedy'，以及向后兼容别名 'starving'（自动归一化为 'greedy'）
    window.setKamiMode = (mode) => {
        if (mode !== 'normal' && mode !== 'greedy' && mode !== 'starving') {
            console.log('❌ 无效模式，请使用 "normal" 或 "greedy"（旧版 "starving" 仍可用作别名）');
            console.log('   normal:   安全模式，使用清算线+3%停采（上限80%）');
            console.log('   greedy:   贪婪模式，无杀手时用5%停采，有杀手自动切安全线');
            return;
        }
        const normalizedMode = (mode === 'starving') ? 'greedy' : mode;
        localStorage.setItem('kami_mode', normalizedMode);
        console.log(`%c✅ 模式已切换为: ${normalizedMode.toUpperCase()}`, 'color: green; font-weight: bold; font-size: 14px;');
        if (mode === 'starving') {
            console.log(`ℹ️ 'starving' 是 'greedy' 的向后兼容别名，已按 'greedy' 写入`);
        }
        console.log('⚡ 刷新页面后生效...');
        // 模式常量在脚本加载时固化，必须刷新页面才能全量生效
        setTimeout(() => location.reload(), 1500);
    };

    // 控制台命令：查看当前模式、杀手状态与恢复倒计时
    window.getKamiMode = () => {
        const mode = window.__kamiMode;
        const killer = window.__killerDetected;
        const lastKill = window.__lastKillerTime;
        // 恢复倒计时：距上次发现杀手满 SAFE_COOLDOWN_MS 后归零，归零即恢复贪婪极限线
        const cooldownRemain = killer ? Math.max(0, SAFE_COOLDOWN_MS - (Date.now() - lastKill)) : 0;

        console.log('═══════════════════════════════════════════════════');
        console.log(`🎮 当前模式: ${mode.toUpperCase()} ${mode === 'greedy' ? '🍖' : '🛡️'}`);
        if (mode === 'greedy') {
            console.log(`🔪 杀手状态: ${killer ? '⚠️ 已发现杀手！使用安全线' : '✅ 安全，使用极限线'}`);
            if (killer) {
                console.log(`⏱️ 恢复倒计时: ${Math.ceil(cooldownRemain / 60000)} 分钟后自动恢复贪婪模式`);
            }
            console.log(`📊 当前停采线: ${killer ? `安全线(LT+${LT_STOP_MARGIN}%，上限80%)` : '极限线(5%)'}`);
        } else {
            console.log(`📊 停采线: 安全线(LT+${LT_STOP_MARGIN}%，上限80%)`);
        }
        console.log(`📋 默认值: normal body=${DEFAULT_THRESHOLD_NORMAL}%, 非normal=${DEFAULT_THRESHOLD_OTHER}%`);
        console.log('═══════════════════════════════════════════════════');
        console.log('💡 切换模式: setKamiMode("greedy") 或 setKamiMode("normal")（旧名 "starving" 仍兼容）');
        return { mode, killerDetected: killer, cooldownRemain };
    };

    // 启动 banner：打印当前模式与生效的停采线规则
    if (__kamiMode === 'greedy') {
        log(`%c🍖 [贪婪模式] 已启用！`, 'color: orange; font-weight: bold; font-size: 14px;');
        log(`   无杀手时使用 ${GREEDY_THRESHOLD}% 极限停采线`);
        log(`   杀手监控由独立的【轻量杀手监控脚本】负责`);
    } else {
        log(`%c🛡️ [安全模式] 使用标准停采线`, 'color: green; font-weight: bold;');
        log(`   停采线 = LT+${LT_STOP_MARGIN}%（上限${MAX_THRESHOLD}%）或默认 ${DEFAULT_THRESHOLD_NORMAL}%/${DEFAULT_THRESHOLD_OTHER}%`);
    }

    // ============================================================
    // 【板块：房间名映射表与当前房间检测】
    // ------------------------------------------------------------
    // ▍功能：
    //   维护"房间名 → 房间号(roomIndex)"的静态映射表，并提供两个
    //   查询函数：__getMyRoomIndex()（当前账户所在房间号）、
    //   __getRoomNameByIndex()（房间号反查房间名，主要用于日志显示）。
    // ▍触发时机：
    //   被部署、停采、救援等模块按需调用；本板块自身不主动运行。
    // ▍依赖：
    //   - window.network.network.connectedAddress.value_ — 当前连接
    //     的操作钱包地址；
    //   - window.network.explorer.accounts.getByOperator(addr) —
    //     本地 ECS 数据层按操作地址查账户实体，返回对象含 roomIndex。
    // ▍核心流程：
    //   1) 取当前钱包地址；2) 按地址查账户实体；3) 读 roomIndex。
    // ▍边界与保护：
    //   - __getMyRoomIndex 全程 try/catch：network 未就绪、未登录等
    //     任何异常都返回 null，调用方必须自行处理 null；
    //   - __getRoomNameByIndex 查不到返回 'Unknown'，不抛异常；
    //   - 映射表为手工维护的静态表：编号存在跳号（如 7、8、14、17
    //     等）是游戏本身的房间编号缺口，不是遗漏；游戏更新新增房间
    //     后需手动补充此表，否则新房间会显示为 'Unknown'。
    // ▍可调参数：
    //   - ROOM_NAME_TO_INDEX — 映射表本身，新增房间时按
    //     "房间名": 编号 的格式追加即可。
    // ▍相关控制台命令：无（内部工具函数）。
    // ============================================================
    const ROOM_NAME_TO_INDEX = {
        "deadzone": 0, "Misty Riverside": 1, "Tunnel of Trees": 2, "Torii Gate": 3,
        "Vending Machine": 4, "Restricted Area": 5, "Labs Entrance": 6,
        "Forest: Old Growth": 9, "Forest: Insect Node": 10, "Temple by the Waterfall": 11,
        "Scrap Confluence": 12, "Convenience Store": 13, "Temple Cave": 15,
        "Techno Temple": 16, "Cave Crossroads": 18, "Temple of the Wheel": 19,
        "Lost Skeleton": 25, "Trash-Strewn Graves": 26, "Misty Forest Path": 29,
        "Scrapyard Entrance": 30, "Scrapyard Exit": 31, "Road To Labs": 32,
        "Forest Entrance": 33, "Deeper Into Scrap": 34, "Elder Path": 35,
        "Parting Path": 36, "Hollow Path": 37, "Scrap Paths": 47,
        "Murky Forest Path": 48, "Clearing": 49, "Ancient Forest Entrance": 50,
        "Scrap-Littered Undergrowth": 51, "Airplane Crash": 52, "Blooming Tree": 53,
        "Plane Interior": 54, "Shady Path": 55, "Butterfly Forest": 56,
        "River Crossing": 57, "Mouth of Scrap": 58, "Black Pool": 59,
        "Scrap Trees": 60, "Musty Forest Path": 61, "Centipedes": 62,
        "Deeper Forest Path": 63, "Burning Room": 64, "Forest Hut": 65,
        "Marketplace": 66, "Boulder Tunnel": 67, "Slippery Pit": 68,
        "Lotus Pool": 69, "Still Stream": 70, "Shabby Deck": 71,
        "Hatch to Nowhere": 72, "Broken Tube": 73, "Engraved Door": 74,
        "Flood Mural": 75, "Fungus Garden": 76, "Thriving Mushrooms": 77,
        "Toadstool Platforms": 78, "Abandoned Campsite": 79, "Radiant Crystal": 80,
        "Flower Mural": 81, "Geometric Cliffs": 82, "Canyon Bridge": 83,
        "Reinforced Tunnel": 84, "Giant's Palm": 85, "Guardian Skull": 86,
        "Sacrarium": 87, "Treasure Hoard": 88, "Trophies of the Hunt": 89,
        "Scenic View": 90
    };

    // 获取当前账户所在房间号（任何异常返回 null，调用方需自行处理）
    function __getMyRoomIndex() {
        try {
            // 当前连接的操作钱包地址
            const addr = window.network.network.connectedAddress.value_;
            // 按操作地址查账户实体（本地 ECS 数据层，无网络请求）
            const acc = window.network.explorer.accounts.getByOperator(addr);
            return acc.roomIndex;
        } catch (e) {
            return null;
        }
    }

    // Feed 流 / hover 监控不在本脚本内：杀手监控由独立的【轻量杀手监控脚本】
    // 负责（其中 Feed 监控已停用，实际生效的是位置轮询直接触发紧急停采；
    // 详见"贪婪模式"板块的杀手检测机制说明）

    // 通过地块号反查地块名（被日志输出等其他模块使用，查不到返回 'Unknown'）
    function __getRoomNameByIndex(roomIndex) {
        for (const [name, idx] of Object.entries(ROOM_NAME_TO_INDEX)) {
            if (idx === roomIndex) return name;
        }
        return 'Unknown';
    }

    // 复活操作统一通过链上 API 完成，不走 DOM 点击（DOM 复活路径不可靠）


    // ============================================================
    // 【板块：紧急停采参数与部署/停采黑名单】
    // ------------------------------------------------------------
    // ▍功能：
    //   紧急停采模块的全部可调参数，以及两套黑名单（部署失败黑名单、
    //   停采失败黑名单），防止对"卡在链上"的 kami 反复发无效 tx
    //   白烧 gas。紧急停采的核心设计要点：
    //   1. 每批随机 6-10 个（chunkRandom(remaining, 6, 10)）：gas
    //      飙升时大批量容易整批 revert，随机批量错峰可提高成功率
    //      （批量本身省 gas，实测数据见 showGasRules()）；
    //   2. 并行发送所有批次，不等待 tx.wait()，先抢救援时间窗口；
    //   3. 用链上 API 查询确认停采结果（比 DOM 渲染更准确、更及时）；
    //   4. 无 harvestId 的 kami 先补查 harvestId 再走 API；
    //   5. 失败数量 >= 10 时走 API 整批重试，少量失败走 DOM 兜底；
    //   6. RPC 超时不直接重试：先查询链上状态确认 tx 是否已生效，
    //      再决定是否重发——盲目重试可能让两笔 tx 都上链，双倍 gas
    //      甚至 nonce 冲突（部署与喂食采用同样策略；喂食另有 API
    //      预检，避免反复失败）。
    // ▍触发时机：
    //   常量在脚本加载时定义；黑名单由部署/停采流程在失败时写入。
    // ▍依赖：
    //   纯内存 Set/Map，无 DOM、无 localStorage——页面刷新即全部
    //   清空，黑名单不跨会话保留。
    // ▍核心流程（风险分级）：
    //   紧急停采按 delta =（实时HP% - 停采线）对 kami 分级排序处理：
    //   delta <= CRITICAL_DELTA(-20) 极度危险（HP 已低于停采线 20 个
    //   点以上，最优先）→ HIGH_RISK_DELTA(-10) 高危 →
    //   DANGER_DELTA(0) 刚触线。确认等待时间 = _adaptiveStopWaitMs()
    //   （滚动p90自适应基础，D4v2）+ 批次数 × PER_BATCH_WAIT_MS，随
    //   批次数与实测时延动态放宽，避免固定短超时误判失败而重发（重发是双倍 gas）。
    // ▍边界与保护：
    //   - 重试熔断：最多 MAX_ROUNDS(3) 轮，轮间隔 ROUND_INTERVAL_MS(3s)；
    //   - 批间隔 BATCH_INTERVAL_MS(500ms)：让钱包 nonce 排队稳定；
    //   - 部署黑名单：同一 kami 连续部署失败 FAIL_THRESHOLD(2) 次
    //     拉黑，AUTO_CLEAR_MS(30 分钟) 后自动解除；
    //   - 停采黑名单：连续 STOP_BLOCK_THRESHOLD(3) 次 AllowFailure
    //     模式都停不下来才拉黑（说明该 kami 状态卡在链上，继续发 tx
    //     只是烧 gas），STOP_BLOCK_COOLDOWN_MS(30 分钟) 后自动解除。
    // ▍可调参数：
    //   - CRITICAL_DELTA = -20 — 极度危险阈值（HP 低于停采线 20 个
    //     点）。调大（如 -15）会把更多 kami 划入最高优先级。
    //   - HIGH_RISK_DELTA = -10 — 高危阈值。
    //   - DANGER_DELTA = 0 — 危险阈值（HP 刚触及停采线）。
    //   - CONFIRM_CONCURRENCY = 8 — 预检/状态查询并发数。调大查询
    //     更快，但 RPC 压力增大、可能被限流。
    //   - BASE_WAIT_MS = 9000 / PER_BATCH_WAIT_MS = 1500 — 确认等待。
    //     v1.2.4 D4v2：基础等待改由 _adaptiveStopWaitMs() 按最近30笔停采
    //     tx确认耗时的滚动 p90 自适应（+3s索引余量，clamp 8~30s），
    //     BASE_WAIT_MS 仅作样本<5笔冷启动/异常回退默认；总等待 =
    //     自适应基础 + 批次数 × 1.5 秒。
    //   - MAX_ROUNDS = 3 — 最大重试轮数（熔断）。
    //   - ROUND_INTERVAL_MS = 3000 — 重试轮次之间的间隔。
    //   - BATCH_INTERVAL_MS = 500 — 批次之间的发送间隔。
    //   - FAIL_THRESHOLD = 2 / AUTO_CLEAR_MS = 30 分钟 — 部署黑名单
    //     的触发次数与自动解除时长。
    //   - STOP_BLOCK_THRESHOLD = 3 / STOP_BLOCK_COOLDOWN_MS = 30 分钟
    //     — 停采黑名单的触发次数与自动解除时长。
    // ▍相关控制台命令：
    //   - showBlockedKamis() / clearBlockedKamis() — 查看/清空黑名单
    //   - showStopBlockedKamis() / clearStopBlockedKamis() — 查看/
    //     清空停采黑名单（定义见"黑名单与失败记录管理命令"板块）
    // ============================================================

    // 紧急停采配置
    const EMERGENCY_CONFIG = {
        CRITICAL_DELTA: -20,         // 极度危险阈值（HP 已低于停采线 20 个点以上，最优先处理）
        HIGH_RISK_DELTA: -10,        // 高危阈值（HP 低于停采线 10 个点以上）
        DANGER_DELTA: 0,             // 危险阈值（HP 刚触及停采线）
        CONFIRM_CONCURRENCY: 8,      // 预检/状态查询并发数（调大更快但 RPC 压力大）

        // 动态等待配置 — 确认等待 = 基础等待 + 批次数 × 每批增量，随批次数放宽避免误判重发
        BASE_WAIT_MS: 9000,          // 冷启动默认等待9秒（🔻SYNC→内部版[1.2.4 部署防重发门禁] D4v2：基础等待已改由 _adaptiveStopWaitMs() 按最近30笔停采tx确认耗时的滚动p90自适应，本常量仅在样本<5笔冷启动或计算异常回退时用；9秒=0712实测tx确认p50≈5.8s+索引≈3.1s。PER_BATCH_WAIT_MS 1500不动）
        PER_BATCH_WAIT_MS: 1500,     // 每批额外1.5秒

        MAX_ROUNDS: 3,               // 最大重试轮数（熔断，防止无限重试烧 gas）
        ROUND_INTERVAL_MS: 3000,     // 轮次之间的间隔
        BATCH_INTERVAL_MS: 500,      // 批次间隔500ms（让钱包 nonce 排队稳定）

        // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
        // 0709 夜 42-agent 审计定案：紧急停采出现 47 批"成功0/真失败N"满批
        // 误判 + 140 次误拉黑 + ~87M gas 空烧，根因是 tx 实际已成功
        // （单只 gas≈1.54M=完整执行）但发送方仅 delay(2000) 就用本地
        // 索引器复核，索引器滞后（实测确认 17~99s）导致读到旧状态误判。
        // 下面这组阈值把"这批到底执行了没有"的判据从"本地索引器读数"
        // 换成"链上回执 gas 特征"（gas 是唯一不受索引器滞后影响的真值）：
        // 单只完整执行≈1.54M，revert 级（打在已停/不可停 kami 上）≈261k，
        // 两者相差>10倍，用"每只均摊 gas"即可可靠分辨。
        // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
        // ▍改动A · 阈值收紧（0709 grok+Claude 交叉review定案·发现1）：
        // AllowFailure 允许同一批里"部分成员真执行、部分真revert"混合，
        // 旧阈值 800000 在这种混合批均摊后会被误判成"全执行"。举例：3只
        // 真执行(约1.54M/只)+3只真revert(约261k/只)，均摊=(3×1.54M+3×0.261M)/6
        // 约等于0.9005M，超过旧阈值800000 → 被误判 full_exec，整批（含3只
        // 真失败）直接记成功，真失败既不进 estimateGas 复核也不会重试，
        // 被彻底漏掉。收紧到 1_200_000 后，同样这批 0.9005M<1.2M，正确落
        // 进"mixed"档改走逐只 estimateGas 裁决，真失败能被抓出来。1.2M
        // 留了安全边际：真·全执行批均摊约1.54M 仍稳稳超过1.2M，不会被
        // 误伤打回 mixed（无非多打一轮逐只 estimateGas，不影响正确性，
        // 只是稍慢）。_allowFailureStop（约6002行）判"真停vs revert"用的
        // 是同一个 EMERGENCY_CONFIG.GAS_FULL_EXEC_PER_KAMI 常量，本次收紧
        // 单点生效、两处同步，无需另改数值。
        GAS_FULL_EXEC_PER_KAMI: 1200000,  // 每只均摊 ≥ 此值 → 判"像全执行"，仅观测并交由下轮 state 复读确认（v1.1.14 从800000收紧，理由见上）
        // 单只调用（_allowFailureStop 常见 harvestIds.length===1 场景，含
        // _emergencyRetryBatchGated 裁完只剩1只时）实测固定revert成本≈261k——
        // 比批量场景的"每只均摊revert成本"高得多，因为单笔 tx 的固定开销
        // （base 21000 + calldata/选择器）全摊在这一只身上，不像大批量那样
        // 被多只分摊。阈值必须留出安全边际盖住这个 261k 单只场景，否则单只
        // 重试的真revert会被误判成"混合"（仍安全，只是多打一次冗余
        // estimateGas，但会让诊断日志的"revert级"标签失真）。
        GAS_FULL_REVERT_PER_KAMI: 300000, // 每只均摊 ≤ 此值 → 判"全revert"，转 estimateGas 逐只裁决
        GAS_PER_KAMI_ESTIMATE: 1500000,   // 混合批估算"实际执行只数"用的单只 gas 基准（仅用于日志展示）
        GAS_REVERT_BASE: 100000,          // 混合批估算基线：(gasUsed − 该值) / 单只基准 ≈ 执行只数
        SEND_STAGGER_MIN_MS: 800,         // 同轮各批背靠背发送时的随机间隔下限（防 RPC 限流）
        SEND_STAGGER_MAX_MS: 1500,
        INVOCATION_HARD_CAP_MS: 180000,   // 单次 emergencyStopHarvest 调用硬上限：到点强制收尾释放锁，未完成交下一轮
        CIRCUIT_BREAK_STREAK: 2,          // 连续 N 批"全revert/estimateGas全部不可停" → 本次调用熔断，不再发新tx
        INDEX_LAG_POLL_MS: [3000, 6000, 12000, 24000, 45000],  // 索引器滞后诊断的自适应轮询间隔（纯观测，不改判）
        INDEX_LAG_POLL_CAP_MS: 90000,     // 索引器滞后诊断轮询上限，超时只警告不改判
    };

    // 【v1.1.10 冷却公式预筛】操作冷却剩余秒数计算
    // 实测定案（2026-07-08 冷却判定探针 v1.1/v1.2）：kami 任意一次操作
    // （停采/喂食/部署等）后进入约3分钟操作冷却，冷却期内对该 kami
    // 发起的停采/喂食/部署 TX 必败（含"胶水"攻击导致的冷却场景）；
    // 冷却状态与链上 harvest.time.last 字段完美对应——冷却截止 =
    // time.last + T，T 实测夹逼区间 (157,189]，取游戏3分钟常量180秒
    // （269只样本混淆矩阵零错配，见冷却判定探针命令_v1.2.txt）。
    // time.last 经 window.network.explorer.kamis.getByIndex(idx,{harvest:true})
    // 本地ECS读取，零gas；RESTING状态该字段同样存在且有效。
    const KAMI_ACTION_COOLDOWN_SEC = 180;  // 操作冷却时长(秒)，游戏常量
    function _cooldownRemainSec(timeLastSec) {
        // 读不到 time.last（null/undefined/0/非正数）按无冷却处理——
        // 保持 v1.1.10 之前的旧行为，交给下游失败分类兜底
        if (!(timeLastSec > 0)) return 0;
        const age = Date.now() / 1000 - timeLastSec;
        return Math.max(0, Math.ceil(KAMI_ACTION_COOLDOWN_SEC - age));
    }

    // 部署失败防护配置
    const DEPLOY_BLOCK_CONFIG = {
        // 同一 kami 连续部署失败达到该次数 → 拉黑，暂停对其部署
        FAIL_THRESHOLD: 2,
        // 拉黑后经过该时长自动解除（30 分钟）
        AUTO_CLEAR_MS: 30 * 60 * 1000,
    };

    // 部署黑名单三件套：
    //   __blockedKamiIds       — 被拉黑的 kamiId 集合
    //   __kamiDeployFailCount  — kamiId -> 连续失败次数
    //   __kamiBlockedTime      — kamiId -> 拉黑时间戳（自动解除计时用）
    const __blockedKamiIds = new Set();
    window.__blockedKamiIds = __blockedKamiIds;         // 只读引用：健康看板/控制台可直读黑名单规模
    const __kamiDeployFailCount = new Map();
    const __kamiBlockedTime = new Map();

    // 停采黑名单 — 连续3次 AllowFailure 模式都停不下来才拉黑30分钟
    // （判定为卡在链上的 kami，继续发停采 tx 只会白烧 gas）
    const __stopBlockedKamis = new Set();      // kamiId
    window.__stopBlockedKamis = __stopBlockedKamis;     // 只读引用：健康看板/控制台可直读黑名单规模
    const __stopBlockedTime = new Map();       // kamiId -> timestamp
    const __stopFailCount = new Map();         // kamiId -> 连续失败次数
    const STOP_BLOCK_COOLDOWN_MS = 30 * 60 * 1000;  // 30分钟自动解除
    const STOP_BLOCK_THRESHOLD = 3;            // 连续失败3次才拉黑

    // ============================================================
    // 【板块：紧急停采 · 调用级去重记账 + 熔断状态（v1.1.12）】
    // ------------------------------------------------------------
    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
    // ▍背景：0709 审计发现同一只 kami 在同一次 emergencyStopHarvest()
    //   调用内会被多条路径重复判失败（主批→首批强化批量重试→首批强化
    //   单独重试→...），__stopFailCount 一轮内被 3→4→5 连加，配合误判
    //   极易穿透 STOP_BLOCK_THRESHOLD 造成误拉黑。
    // ▍拉黑机制的存在理由（务必保留，不可一刀切取消）：部分 kami 会
    //   卡在链上（需游戏团队处理，可能持续数天），对它的任何停采操作
    //   都必然 revert——不能放任无限重试白烧 gas，必须能拉黑。0709 的
    //   问题只是"抓错人"：把已经停成、只是本地索引器读数滞后的健康
    //   kami 误当成卡链拉黑了 140 次。修复目标是让拉黑只命中真正卡链
    //   的少数，而不是取消拉黑本身。
    // ▍失败处置两分类（区分"索引滞后"与"疑似卡链"）：
    //   - estimateGas revert 但链上 state 已不是 HARVESTING → 判定
    //     "已停实锤，索引器滞后"：清计数、绝不拉黑；
    //   - estimateGas revert 且链上 state 仍是 HARVESTING → 判定
    //     "疑似卡链"：计入 __stopFailCount（复用同一套计数/拉黑机制，
    //     天然满足"跨 ≥2 次独立调用持续复现才拉黑"——因为每次调用
    //     内同一 kami 最多记 1 次，需连续 STOP_BLOCK_THRESHOLD=3 次
    //     独立调用都判定卡链才会拉黑）。
    // ▍变量：
    //   - __stopInvocationId：每次 emergencyStopHarvest() 调用自增，
    //     用于下面的"每次调用最多记账一次"去重；
    //   - __stopFailCreditedInvocation：kamiId -> 已记过失败的
    //     invocationId，同一 invocationId 内重复失败不重复计数；
    //   - __stopConsecutiveRevertBatches / __stopCircuitBroken：连续
    //     出现"全revert/estimateGas 全部不可停"的批数与熔断标记，
    //     供本次调用内后续发送短路（Change D）；
    //   - __stopStuckThisInvocation：本次调用内已判定"疑似卡链"的
    //     kamiId 集合——命中后本次调用内不再对其发起任何 estimateGas
    //     探测之外的操作，尤其不再发送任何真实 tx。
    // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
    // ▍改动B新增变量：
    //   - __stopConfirmedThisInvocation：本次调用内已经用"链上直接读到
    //     非HARVESTING"或"estimateGas blocked 后复读 state≠HARVESTING"
    //     确认停成的 kamiId 集合。写入点见 _stopCreditSuccess（所有能
    //     走到该函数的路径，证据强度都足够）。主循环每轮查完
    //     _emergencyQueryStatus 后用它把 stillHarvesting 里"索引器还没
    //     追上、其实已经停成"的 kami 剔除，避免下一轮对着已停 kami 再发
    //     一次 tx（0709 事故的直接根因：索引器滞后 17~99s）。
    // ▍改动D新增变量：
    //   - __stopCooldownDeferredThisInvocation：classify
    //     （_emergencyClassifyEstimateBlocked/_emergencyCreditBlocked）
    //     是独立于 emergencyStopHarvest() 主循环作用域的顶层函数，够不到
    //     主循环局部变量 cooldownDeferred；复用同一套"模块级+每次调用
    //     清空"模式共享该队列，供 classify 发现的"estimateGas revert 但
    //     仍在180s操作冷却期内"的 kami 归入，emergencyStopHarvest() 内的
    //     局部变量 cooldownDeferred 直接引用同一个 Map（见该函数内注释）。
    // ============================================================
    let __stopInvocationId = 0;
    const __stopFailCreditedInvocation = new Map();
    let __stopConsecutiveRevertBatches = 0;
    let __stopCircuitBroken = false;
    const __stopStuckThisInvocation = new Set();
    const __stopConfirmedThisInvocation = new Set();          // Change B：本次调用内已强证据确认停成的 kamiId
    const __stopCooldownDeferredThisInvocation = new Map();   // Change D：dbIndex -> item，classify 发现的冷却项汇入
    let __pendingVerifyBatchCount = 0;                        // 🔻SYNC→内部版[1.1.17 可观测性批次] C4：本次调用内产生 pendingVerify 的批数（纯统计，invocation 开头清零）
    let __stopChanFallbackCount = 0;                          // 🔻SYNC→内部版[1.1.19 停采通道统一] D3：本次调用内 mud→raw 跌落次数（纯统计，invocation 开头清零）

    // ============================================================
    // 🔻SYNC→内部版[1.1.22 退避复读] 停采反馈查询重构：数据驱动退避复读 + 假卡链四件套
    // ------------------------------------------------------------
    // 病灶（0710 下午 CZ 实测）：tx 确认 p50=5.3s/p90=11s/p95=16s/max=376s(拥堵长尾)，
    //   索引器翻面 p50=3.1s/p95=3.9s/max=21s；但"疑似卡链"3 笔可在几分钟内凑满，
    //   快于长尾确认 → 41 只已停成的 kami 被误判卡链拉黑。
    // 修复核心：estimateGas revert + 仍 HARVESTING 的"疑似卡链"不再当场记失败，
    //   而是入 __stopPendingVerify 退避复读队列（相对 sentAt 的 7/20/45/90/180/300s 表），
    //   由 15s 轻量调度器零 gas 复读 state；仅当走完全表(≥6 档/跨度≥300s)仍 HARVESTING
    //   且 estimateGas 仍 revert 才真正记失败——等效"拉黑需 ≥15 分钟持续证据"(I2 保留)。
    // I3 红线：pendingVerify→成功 的唯一出口仍是 state≠HARVESTING，gas 永不作凭据。
    // ============================================================
    const STOP_BACKOFF_TABLE_MS = [7000, 20000, 45000, 90000, 180000, 300000];  // 相对 sentAt 的复读时刻表（实测 tx 确认长尾 max=376s → 300s 兜到绝大多数）
    const STOP_BACKOFF_FULL_MS = 300000;          // C3：走完全表的最小跨度（≥5min ≫ 索引翻面 max=21s；真卡链最早此后 + ≥3 次调用 ≈ 15min 才拉黑）
    const STOP_BACKOFF_SCAN_MAX = 20;             // C2：单轮扫描最多复读只数（读数极限背压，其余下轮）
    const STOP_BACKOFF_GASLIKELY_FULL_MS = 30 * 60 * 1000;  // B1b：gasLikely(gas像执行过)的count证据窗=30min——CZ组件滞后达数十分钟，300s表按索引21s滞后标定差一个数量级(grok审查关键洞)
    const STOP_BACKOFF_MASSLAG_MIN = 3;           // B1a：≥3只卡在90s+档未确认=群体组件滞后(CZ特征；真卡链是孤例不会成群)→冻结全体count
    let __stopMassLagLogged = false;              // 群体滞后冻结日志节流(每invocation一条)
    const STOP_BACKOFF_STALE_MS = 30 * 60 * 1000; // I4：兜底——30 分钟仍未确认的条目移除并告警（防 Map 泄漏）
    const STOP_BACKOFF_SCAN_INTERVAL_MS = 15000;  // C2：调度器扫描周期（全表过点后按此周期持续复读）
    // kamiId -> { item, sentAt, attempts, nextAt, gasLikely, enrolledAt }
    //   跨调用存续（invocation 结束不清）；终态（确认停成/拉黑/复活死亡/兜底超时）时删除。
    const __stopPendingVerify = new Map();
    let __stopBackoffTickRunning = false;         // C2：调度器重入保护（getByIndex 慢于扫描周期时防并发迭代 Map）
    let __stopTxConfirmMsList = [];               // C4：本 invocation 各批 tx 确认耗时(ms)，完成小结算中位/最慢（invocation 开头清空）
    let __stopIndexLagMsList = [];                // C4：本 invocation 各 kami 索引器滞后(ms)，完成小结算中位（invocation 开头清空）
    const __stopRevertReasonSeen = new Set();     // C6：本 invocation 已打过的 revert 原因串（去重防刷屏，invocation 开头清空）

    // 🔻SYNC→内部版[1.2.4 部署防重发门禁] D4v2：停采确认等待改为「最近30笔停采tx确认耗时」的滚动 p90 自适应。
    //   __txConfirmHist 跨会话/刷新持久化到 localStorage('kami_tx_confirm_hist')；数据源=停采确认耗时收集点（本文件 ~5314 处，
    //   在 push __stopTxConfirmMsList 的同时调 _recordTxConfirmMs(confirmMs)）。目的：用真实确认时延 p90 动态设定紧急停采基础等待，
    //   替代静态 BASE_WAIT_MS，避免「确认慢→误判失败→重发白烧gas」。**纯等待时长调整，不改任何判定/重发逻辑**。全 try/catch，异常回退 9000。
    const __TX_CONFIRM_HIST_KEY = 'kami_tx_confirm_hist';
    const __TX_CONFIRM_HIST_MAX = 30;
    let __txConfirmHist = (() => {
        try {
            const raw = localStorage.getItem(__TX_CONFIRM_HIST_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.filter(n => Number.isFinite(n) && n > 0).slice(-__TX_CONFIRM_HIST_MAX) : [];
        } catch (_) { return []; }   // 读取失败（无localStorage/坏JSON）→ 空数组冷启动
    })();
    // 记录一笔停采 tx 确认耗时：入窗、截尾保留最近30、持久化。任何异常静默吞掉，绝不影响停采主流程。
    function _recordTxConfirmMs(ms) {
        try {
            if (!Number.isFinite(ms) || ms <= 0) return;
            __txConfirmHist.push(ms);
            if (__txConfirmHist.length > __TX_CONFIRM_HIST_MAX) __txConfirmHist = __txConfirmHist.slice(-__TX_CONFIRM_HIST_MAX);
            try { localStorage.setItem(__TX_CONFIRM_HIST_KEY, JSON.stringify(__txConfirmHist)); } catch (_) {}   // 持久化失败不致命，内存窗口仍生效
        } catch (_) {}
    }
    // 自适应停采基础等待(ms)：样本<5笔 → 冷启动默认 BASE_WAIT_MS(9000)；否则 p90（升序 idx=ceil(n*0.9)-1）+3000ms 索引余量，
    //   clamp 到 [8000,30000]。上限30s封顶防极端长尾（如376s）拖垮等待——长尾交给多轮重试+退避复读机器，不靠单次等待硬扛。
    function _adaptiveStopWaitMs() {
        try {
            const hist = __txConfirmHist;
            if (!Array.isArray(hist) || hist.length < 5) return EMERGENCY_CONFIG.BASE_WAIT_MS;
            const sorted = hist.slice().sort((a, b) => a - b);
            const idx = Math.max(0, Math.min(Math.ceil(sorted.length * 0.9) - 1, sorted.length - 1));
            const p90 = sorted[idx];
            return Math.max(8000, Math.min(30000, p90 + 3000));
        } catch (_) {
            return EMERGENCY_CONFIG.BASE_WAIT_MS;   // 计算异常一律回退冷启动默认
        }
    }
    // 纯观测：返回当前自适应读数 { ms, n, secs } 供日志验证自适应在工作。
    function _adaptiveStopWaitInfo() {
        try {
            const n = Array.isArray(__txConfirmHist) ? __txConfirmHist.length : 0;
            const ms = _adaptiveStopWaitMs();
            return { ms, n, secs: (ms / 1000).toFixed(1) };
        } catch (_) { return { ms: EMERGENCY_CONFIG.BASE_WAIT_MS, n: 0, secs: '9.0' }; }
    }

    /**
     * 🔻SYNC→内部版[1.1.22 退避复读] C2：把一只 kami 纳入退避复读队列。
     * gasLikely：本批 gas 曾达"真执行水平"(full_exec 双条件)——只影响 defer 日志措辞(C1)，不改判定。
     * 已在队列则只刷新 item(取最新 harvestId/timeLast)、gasLikely 只升不降；不覆盖 sentAt(退避时钟不重置)。
     * 全 try/catch：任何异常静默跳过，绝不影响调用它的业务路径。
     */
    function _stopBackoffEnroll(item, gasLikely) {
        try {
            const kamiId = item?.kamiId;
            if (!kamiId) return;
            const now = Date.now();
            const cur = __stopPendingVerify.get(kamiId);
            if (cur) {
                if (item) cur.item = item;
                if (gasLikely) cur.gasLikely = true;
                return;
            }
            __stopPendingVerify.set(kamiId, {
                item, sentAt: now, attempts: 0,
                nextAt: now + STOP_BACKOFF_TABLE_MS[0],
                gasLikely: !!gasLikely, enrolledAt: now
            });
        } catch (e) {}
    }

    /** 🔻SYNC→内部版[1.1.22 退避复读] 从退避队列移除（终态清理，供成功/拉黑/兜底调用）。全 try/catch。 */
    function _stopBackoffRemove(kamiId) {
        try { if (kamiId) __stopPendingVerify.delete(kamiId); } catch (e) {}
    }

    /**
     * 🔻SYNC→内部版[1.1.22 退避复读] C3 卡链计数门禁：判定一只"疑似卡链"的 kami 现在是否够格真记失败。
     * 返回 'count'（退避表已走完仍坏 → 真 _stopCreditFail，I2 保留拉黑通路）
     *   或 'defer'（未够退避时长/证据 → 入队退避复读，本次不计失败）。
     * 判据：该 kami 在 __stopPendingVerify 中 attempts≥全表长(6) 且 (now-sentAt)≥300s。
     *   两条件同时满足才 count——前者要求调度器确实做过 ≥6 次复读(读数证据)，后者要求跨度足够(时间证据)，
     *   任一不足（如页面被节流导致复读不足）都保守 defer，绝不凭单一维度提前拉黑。
     * 注意：gasLikely 只影响措辞不豁免 count——gas 曾像执行但走完 5min(≫索引 max21s)仍 HARVESTING
     *   说明 gas 谎报(v1.1.25 教训"gas≠真值")，此时必须允许最终记失败，否则 I2 被 gasLikely 永久架空。
     */
    function _componentMassLagSuspect() {
        // B1a：退避队列里 ≥3 只卡在 90s+ 档(attempts≥4)仍未确认 → 判"群体组件同步滞后"。
        //   用"规模"区分病灶：CZ 滞后是群体现象(0710实测41只)，真卡链是孤例(1~2只)不会触发冻结。
        try {
            let n = 0;
            for (const [, e] of __stopPendingVerify) {
                if (e.attempts >= 4) { n++; if (n >= STOP_BACKOFF_MASSLAG_MIN) return true; }
            }
        } catch (e) {}
        return false;
    }

    async function _stopBackoffGate(item) {
        try {
            const kamiId = item?.kamiId;
            if (!kamiId) return 'defer';
            const now = Date.now();
            const e = __stopPendingVerify.get(kamiId);
            if (!e) { _stopBackoffEnroll(item, false); return 'defer'; }   // 首次遇见：入队起退避时钟，本次 defer
            // B1a 群体滞后冻结：组件同步群体性落后时，任何 count 都不可信 → 全体 defer 等索引追平
            if (_componentMassLagSuspect()) {
                if (!__stopMassLagLogged) {
                    __stopMassLagLogged = true;
                    try { log(`   🧊 [停采诊断/退避] 群体组件滞后(≥${STOP_BACKOFF_MASSLAG_MIN}只卡90s+档未确认)→本轮冻结全部卡链计数，只defer`); } catch (_) {}
                }
                return 'defer';
            }
            // B1b gasLikely 长证据窗：gas 曾达真执行水平的，count 需跨度≥30min；其余维持300s(真卡链主路不受影响)
            const fullMs = e.gasLikely ? STOP_BACKOFF_GASLIKELY_FULL_MS : STOP_BACKOFF_FULL_MS;
            if (!(e.attempts >= STOP_BACKOFF_TABLE_MS.length && (now - e.sentAt) >= fullMs)) return 'defer';
            // N1 终审：落笔前最后一次新鲜复读——关 count/success TOCTOU 竞态，也是最后一道滞后保险
            try {
                const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                const st = (res?.state || '').toUpperCase();
                if (st && st !== 'HARVESTING') {
                    __stopPendingVerify.delete(kamiId);
                    if (st !== 'DEAD') { try { _stopCreditSuccess(item, '终审复读确认已停'); } catch (_) {} }
                    return 'defer';
                }
                if (!st) return 'defer';
            } catch (err) { return 'defer'; }
            return 'count';
        } catch (e) { return 'defer'; }   // 出错保守 defer（漏停代价 > 少拉黑一次）
    }

    /**
     * 🔻SYNC→内部版[1.1.22 退避复读] C2 退避复读调度器：15s 轻量扫描 __stopPendingVerify（含 90s 后 estimateGas 真没停→释放重发裁决），
     * 到 nextAt 的条目做一次零 gas 的链上 state 复读（getByIndex harvest:true）。
     *   - state≠HARVESTING → I3 唯一成功出口：_stopCreditSuccess 并移除（dead 只移除不记成功）；
     *   - 仍 HARVESTING → attempts++ 并按表推进 nextAt（相对 sentAt，已过点取下一档，全过则按扫描周期续读）；
     *   - 查询失败 → 不推进 attempts（保守），稍后重试；
     *   - I4 兜底：enrolledAt 起 ≥30min 仍未确认 → 移除 + 告警（防泄漏）。
     * 背压：单轮最多复读 STOP_BACKOFF_SCAN_MAX(20) 只，其余下轮。
     * 全函数 try/catch：调度器任何异常都不得影响主循环（本函数由独立 setInterval 触发，只做零 gas 读 + 90s后一次 estimateGas 重发裁决）。
     */
    async function _stopBackoffSchedulerTick() {
        if (__stopBackoffTickRunning) return;   // 重入保护：若上一轮 getByIndex 慢于扫描周期，跳过本轮防并发迭代
        __stopBackoffTickRunning = true;
        try {
            if (__stopPendingVerify.size === 0) return;
            const now = Date.now();
            // B2 调度公平(grok审查)：先收集全部到期条目，按 nextAt 升序取最早的 SCAN_MAX 只——
            //   处理过的条目 nextAt 后移、自然轮转，290 只风暴下队尾不再被队头垄断饿死。
            const __due = [];
            for (const [kamiId, e] of __stopPendingVerify) {
                if (now - e.enrolledAt >= STOP_BACKOFF_STALE_MS) {
                    __stopPendingVerify.delete(kamiId);
                    try { log(`   ⚠️ [停采诊断/退避] #${e.item?.dbIndex} 退避复读 ${Math.round((now - e.enrolledAt) / 60000)} 分钟仍未确认已停，兜底移除(防Map泄漏)，交下轮常规流程重新对账`); } catch (_) {}
                    continue;
                }
                if (now >= e.nextAt) __due.push([kamiId, e]);
            }
            __due.sort((a, b) => a[1].nextAt - b[1].nextAt);
            for (const [kamiId, e] of __due.slice(0, STOP_BACKOFF_SCAN_MAX)) {
                try {
                    const res = await window.network.explorer.kamis.getByIndex(e.item.dbIndex, { harvest: true });
                    const state = (res?.state || '').toUpperCase();
                    if (!state) {
                        // 读到空 state：查询无效，不推进 attempts（保守），稍后重试
                        e.nextAt = now + STOP_BACKOFF_SCAN_INTERVAL_MS;
                        continue;
                    }
                    if (state !== 'HARVESTING') {
                        const elapsedS = Math.round((now - e.sentAt) / 1000);
                        __stopPendingVerify.delete(kamiId);
                        if (state === 'DEAD') {
                            try { log(`   ⚰️ [停采诊断/退避] #${e.item.dbIndex} 复读到已死亡(state=${state})，移出退避队列（不记成功）`); } catch (_) {}
                        } else {
                            try { _stopCreditSuccess(e.item, '退避复读确认已停'); } catch (_) {}
                            // C4：让日志能画出确认时间分布
                            try { log(`   📈 [停采诊断/退避] #${e.item.dbIndex} 第${e.attempts + 1}档(t+${elapsedS}s)确认已停(state=${state})`); } catch (_) {}
                        }
                        continue;
                    }
                    // 🔻SYNC→内部版[1.2.1 停采空转闭环] C2：仍 HARVESTING 且已过 90s（首停 tx 已上链，p95=16s，90s 覆盖绝大多数拥堵长尾）
                    //   → 加一道 estimateGas 链上真值裁决。**只信一个方向**：estimateGas 成功=无歧义"还能停=真没停"。
                    //   （异源审查铁律：estimateGas revert 有已停/冷却/卡链/网络毛刺四种成因，不能反推"已停"——那半边已砍，宁可让已停的
                    //    kami 在 Map 里安静等组件同步/30min兜底：C1 保证它不被重发，零 gas 浪费、零死亡风险，不拿保命赌 30min 优化。）
                    if ((now - e.sentAt) >= 90000 && e.item && e.item.harvestId) {
                        let _chk = null;
                        try { _chk = await _preCheckStop([e.item.harvestId]); } catch (_) { _chk = null; }
                        if (_chk && _chk.ok === true) {
                            // estimateGas 成功（确实可停，且必不在冷却期——冷却会 revert）= 首停 tx 真没生效 → 释放回候选，下轮重新发送（配合 C1）。
                            __stopPendingVerify.delete(kamiId);
                            try { log(`   🔁 [停采诊断/重发] #${e.item.dbIndex} estimateGas可停 + 仍HARVESTING(≥90s) ⇒ 首停未生效，释放回候选待下轮重发`); } catch (_) {}
                            continue;
                        }
                        // estimateGas revert/异常 → 不作任何判定（可能已停滞后/冷却/卡链/毛刺），继续走退避档位等待，交 state 复读或 30min 兜底
                    }
                    // 仍 HARVESTING：推进退避档位
                    e.attempts++;
                    let nx = 0;
                    for (let i = 0; i < STOP_BACKOFF_TABLE_MS.length; i++) {
                        const t = e.sentAt + STOP_BACKOFF_TABLE_MS[i];
                        if (t > now) { nx = t; break; }
                    }
                    e.nextAt = nx > 0 ? nx : (now + STOP_BACKOFF_SCAN_INTERVAL_MS);   // 全表过点后按扫描周期持续复读，直到确认或兜底移除
                } catch (err) {
                    // 单只查询失败：不推进 attempts（保守），稍后重试；不影响其余条目
                    try { e.nextAt = Date.now() + STOP_BACKOFF_SCAN_INTERVAL_MS; } catch (_) {}
                }
            }
        } catch (e) {
            // 调度器整体异常：静默吞掉，绝不影响主循环
        } finally {
            __stopBackoffTickRunning = false;
        }
    }

    /**
     * 停采失败记账：同一次 emergencyStopHarvest 调用内，同一 kamiId 最多 +1。
     * reasonTag 仅影响日志措辞，不影响计数/拉黑逻辑（沿用 STOP_BLOCK_THRESHOLD）。
     */
    function _stopCreditFail(item, reasonTag = '停采失败') {
        const kamiId = item?.kamiId;
        if (!kamiId) return;
        // BEFORE(Bug B前): 前端冻结时仍会累计疑似卡链失败，达到阈值后加入停采黑名单。
        if (_isFrontendFrozen()) {
            log(`   🧊 [停采诊断] 前端疑似失真，#${item.dbIndex} 本次${reasonTag}不计数、不拉黑，记 defer`);
            return;
        }
        if (__stopFailCreditedInvocation.get(kamiId) === __stopInvocationId) {
            log(`   ⏭️ [停采诊断] #${item.dbIndex} 本次调用内已记过失败(${reasonTag})，跳过重复计数`);
            return;
        }
        __stopFailCreditedInvocation.set(kamiId, __stopInvocationId);
        const count = (__stopFailCount.get(kamiId) || 0) + 1;
        __stopFailCount.set(kamiId, count);
        if (count >= STOP_BLOCK_THRESHOLD) {
            __stopBlockedKamis.add(kamiId);
            __stopBlockedTime.set(kamiId, Date.now());
            _stopBackoffRemove(kamiId);   // 🔻SYNC→内部版[1.1.22 退避复读] I4：已拉黑属终态（黑名单有自己的30min到期复查），移出退避复读队列
            log(`   🚫 [停采诊断] #${item.dbIndex} 连续 ${count} 次${reasonTag}，加入停采黑名单`);
        } else {
            log(`   ⚠️ [停采诊断] #${item.dbIndex} ${reasonTag}(${count}/${STOP_BLOCK_THRESHOLD})，暂不拉黑（本次调用记账1次）`);
        }
    }

    /**
     * 停采成功记账：立即清零失败计数、移出黑名单（30分钟自动解除是兜底，
     * 这里主动移出避免已恢复的 kami 白等）。
     * 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
     * 改动B：本函数是全部"确认停成"路径的唯一记账出口（classify已停实锤 /
     * 链上直接读到非HARVESTING / 调用点显式状态复读确认），把它们统一写入 __stopConfirmedThisInvocation 供主循环
     * 剔除 remaining 用，比在3个调用点分别插入更不容易漏改、也不会漏掉
     * 其它同等强度证据的路径。reasonTag 仅影响诊断日志，不影响记账逻辑。
     */
    function _stopCreditSuccess(item, reasonTag = '停采成功') {
        const kamiId = item?.kamiId;
        if (!kamiId) return;
        _stopBackoffRemove(kamiId);   // 🔻SYNC→内部版[1.1.22 退避复读] I4：确认停成属终态，移出退避复读队列（防泄漏）
        __stopFailCount.delete(kamiId);
        __stopFailCreditedInvocation.delete(kamiId);
        if (__stopBlockedKamis.has(kamiId)) {
            __stopBlockedKamis.delete(kamiId);
            __stopBlockedTime.delete(kamiId);
            log(`   ✅ [停采诊断] #${item.dbIndex} 停采成功，移出停采黑名单`);
        }
        if (!__stopConfirmedThisInvocation.has(kamiId)) {
            __stopConfirmedThisInvocation.add(kamiId);
            log(`   ✅ [停采诊断/内存成功集] #${item.dbIndex} 写入已确认停成(${reasonTag})，下轮 remaining 剔除该id，不再重发tx`);
        }
    }

    /**
     * 改动B：从 stillHarvesting/remaining 里剔除本次调用内已通过强证据
     * （链上直接读到非HARVESTING 或 estimateGas blocked 后状态复读确认）确认停成的 kami——
     * 本地索引器滞后（0709实测 17~99s）会让这些 kami 在 _emergencyQueryStatus
     * 里仍报 HARVESTING，若不剔除会被误当"还没停"重新组批发tx，对已经
     * 停成的 kami 空烧一次 gas（这正是让"假 full_exec"和"索引器滞后"两个
     * bug 互相掩盖的旧行为——改动A收紧阈值后必须配合本函数，否则改动A
     * 单独生效会让被误判 full_exec 里的真失败因为不再被索引器滞后"兜住
     * 重试"而真正漏停，见文件头改动说明的"顺序陷阱"）。
     */
    function _stopFilterConfirmed(items, tag) {
        if (!items?.length || __stopConfirmedThisInvocation.size === 0) return items;
        const kept = [];
        const removedLogs = [];
        for (const item of items) {
            if (item.kamiId && __stopConfirmedThisInvocation.has(item.kamiId)) {
                removedLogs.push(`#${item.dbIndex}`);
            } else {
                kept.push(item);
            }
        }
        if (removedLogs.length > 0) {
            const fmt = removedLogs.length > 8
                ? `${removedLogs.length}只(样例: ${removedLogs.slice(0, 5).join(', ')}...)`
                : removedLogs.join(', ');
            log(`   🧹 [停采诊断/${tag}] 索引器仍报${items.length}只HARVESTING，其中${removedLogs.length}只已被gas/estimateGas实锤停成→剔除: ${fmt}，实际remaining=${kept.length}`);
        }
        return kept;
    }

    // ============================================================
    // 【板块：饿死救援（STARVING 喂食公共函数）】
    // ------------------------------------------------------------
    // ▍功能：
    //   kami 的 HP 归零后进入 STARVING（饿死）状态：既没有采集产出，
    //   停采 tx 也会 revert，必须先喂 HP 恢复食物把它"救活"才能停采。
    //   本板块提供紧急停采与普通停采共用的救援函数 _starvingFeedKamis，
    //   按"单次库存查询 + 并发预查 + fire-and-forget 喂食"三段式执行，
    //   目标是少 RPC、少 gas、快速批量救援。
    // ▍触发时机：
    //   停采流程发现 STARVING 候选（DOM 显示 0% HP，或停采预检失败）
    //   时调用；紧急/普通两条路径共用，靠 logPrefix 参数区分日志来源。
    // ▍依赖：
    //   - window.network.explorer.accounts.getByOperator — 查账户库存
    //     （inventories 数组，含每种道具的余额）；
    //   - window.kami_core_db — 本地 kami 数据库，按 imgNumber 或
    //     index 补查 kamiId；
    //   - window.network.explorer.kamis.getByIndex — 链上按编号查
    //     kami（补 kamiId；带 { harvest: true } 取 harvest.time.last；
    //     另有每次调用至多 1 次的 { stats: true } 观测查询，见 S2 纯观测）；
    //   - _preCheckStop — 停采预检函数（其他板块定义），能通过说明
    //     该 kami 实时 HP > 0；
    //   - window.network.api.player.pet.item.use / .cast — 喂食 tx 入口；
    //   - log() / delay() — 公共工具函数。
    // ▍核心流程：
    //   1) 【Step 1】单次库存查询：一次取回全部 inventories，建
    //      balMap（食物index → 余额），全程本地记账，不逐只重复查询；
    //   2) 【Step 2】8 路并发预查（CONC=8，worker 抢号模式）每只 kami：
    //      a. 补 kamiId：先查本地 kami_core_db（按 imgNumber 或
    //         index），查不到再走链上 getByIndex，仍拿不到则跳过；
    //      b. 卡链检测（保护1）：harvest.time.last（链上最后一次 tx
    //         时间）距今超过 24 小时，说明该 kami 链上长期无 tx、
    //         已经卡死，喂食也救不回来，跳过以免浪费食物和 gas；
    //      c. S2 纯观测（无拦截）：每次调用至多 1 次独立查询 dump
    //         stats.health.sync/total 供标定。⚠️ sync=上次链上 tx 时刻
    //         的检查点值、非实时（KB §18.12 同族铁律）——真饿死的 kami
    //         sync 系统性偏高(≈部署时血量)，任何"链上HP>阈值⇒DOM误判"
    //         闸门都会精准误拦最需要喂的（发布前已砍除该闸门，勿复活）；
    //      d. 重复喂食兜底（保护2）：查 __starvingFedRecord，喂过
    //         2 次仍 STARVING 且在 30 分钟冷却期内的跳过；
    //      e. 停采预检：有 harvestId 的先试 _preCheckStop，能停说明
    //         实时 HP > 0（DOM 显示的 0% 只是取整误差），无需喂食；
    //   3) 【Step 3】按顺序 fire-and-forget 喂食：每只从库存里按 HP
    //      降序取第一个有库存的食物（优先最大、一次到位省 gas；
    //      小食物为兜底；表本身顺序不动，选食时 sort 降序）；
    //      await apiFn() 只等钱包分配 nonce 就发下一只，不等 tx.wait()
    //      上链确认；每笔间隔 300ms 让 nonce 排队稳定。
    // ▍边界与保护：
    //   - 库存查询失败：直接返回 0，本轮放弃救援（不抛异常）；
    //   - 全部食物余额为 0：红色告警列出所有候选编号，要求手动处理；
    //   - S2 纯观测（无任何拦截）：dump 链上检查点 HP 供标定；DOM 误标
    //     的真解=喂食时新鲜 DOM 重解析（下轮实现），链上 sync 不可作判据；
    //   - 保护1（卡链跳过）：STARVING_STUCK_TIME_MS = 24 小时；
    //   - 保护2（重复喂食熔断）：喂满 STARVING_STUCK_THRESHOLD(2) 次
    //     仍 STARVING → 判定卡链跳过；STARVING_STUCK_COOLDOWN_MS
    //     (30 分钟) 后自动清除记录、允许重试；
    //   - 预查容错：单只 kami 的任何查询异常只影响它自己（记入
    //     skipReason 跳过），其中 24h 卡链查询失败不阻断后续检查；
    //   - 喂食中途食物耗尽：列出剩余未喂的编号要求手动处理并中止；
    //   - API 入口分流：11305 Paeon Spell Card 是法术卡道具，链上
    //     入口为 api.player.pet.item.cast；其余普通食物走 .use；
    //     对应入口不存在时跳过该只并提示；
    //   - fire-and-forget 语义：返回值 fedCount 只表示 tx 已成功发出
    //     （拿到 nonce），不保证链上执行成功；单只发送失败记日志
    //     不中断整批。
    // ▍可调参数：
    //   - STARVING_FOOD_LIST — 救援食物表，每项 { index: 链上物品
    //     编号, name: 名称, hp: 恢复量 }。表内可按 hp 升序存放
    //     （便于阅读）；选食时按 hp 降序取第一个有库存的（优先
    //     最大、一次到位省 gas，小食物兜底）。全部为非复活类 HP
    //     恢复食物，复活类道具留给死亡复活模块使用。增删条目即可
    //     调整可用食物范围。
    //   - STARVING_STUCK_TIME_MS = 24*60*60*1000 — 卡链判定时长。
    //     调小会更激进地放弃疑似卡死的 kami。
    //   - STARVING_STUCK_THRESHOLD = 2 — 重复喂食熔断次数。
    //   - STARVING_STUCK_COOLDOWN_MS = 30*60*1000 — 熔断自动解除
    //     时长，到期允许重新尝试喂食。
    //   - CONC = 8（函数内）— 预查并发数。调大预查更快，但 RPC
    //     压力更大、可能触发限流。
    //   - delay(300)（函数内）— 每笔喂食 tx 的发送间隔（ms）。
    //     调小发送更快，但 nonce 排队冲突风险升高。
    // ▍相关控制台命令：
    //   - clearStarvingStuck() — 清除重复喂食熔断记录（定义见
    //     "黑名单与失败记录管理命令"板块）
    // ============================================================

    // 饿死救援食物列表（表内按 HP 升序便于阅读；选食时降序优先最大一次到位省gas，小食物兜底；全部为非复活类HP恢复食物）
    // 🔻SYNC[1.2.2 救援喂大食物]
    const STARVING_FOOD_LIST = [
        { index: 11314, name: 'Blue Pansy',        hp: 25 },
        { index: 11301, name: 'Ghost Gum',         hp: 25 },
        { index: 11233, name: 'Gingerbread Cookie', hp: 25 },
        { index: 11227, name: 'Fetid Egg',         hp: 35 },
        { index: 11311, name: 'Resin',             hp: 35 },
        { index: 11302, name: 'Cheeseburger',      hp: 50 },
        { index: 11303, name: 'Pom-Pom Candy',     hp: 50 },
        { index: 11312, name: 'Honeydew Scale',    hp: 75 },
        { index: 11304, name: 'Gakki Cookie',      hp: 100 },
        { index: 11305, name: 'Paeon Spell Card',  hp: 100 },
        { index: 11313, name: 'Golden Apple',      hp: 150 },
    ];

    // STARVING 卡住保护（两层，防止对救不回来的 kami 反复浪费食物和 gas）
    // 保护1: harvest.time.last超过24小时 → 链上长期无tx，判定卡住，直接跳过不浪费食物和gas
    const STARVING_STUCK_TIME_MS = 24 * 60 * 60 * 1000;  // 24小时
    // 保护2: 兜底 — 喂过还是STARVING的kami，累计次数达阈值则跳过
    const __starvingFedRecord = new Map();       // kamiId -> { count, lastFeedTime }
    const STARVING_STUCK_THRESHOLD = 2;          // 喂过2次还是STARVING → 判定卡住
    const STARVING_STUCK_COOLDOWN_MS = 30 * 60 * 1000;  // 30分钟后自动解除，允许重试

    /**
     * 饿死救援公共函数：应用层并发（并发预查 + 单次库存 + fire-and-forget tx）
     * 设计要点：
     *   1. 并发预查 kamiId / harvest.time.last / 停采预检（8路并发，避免逐个串行等待）
     *   2. 库存只查一次，之后全程用内存 balMap 记账扣减
     *   3. 喂食 tx 采用 fire-and-forget：await apiFn() 仅等 nonce 分配，不等 tx.wait()
     *   4. 11305 Paeon Spell Card 走 api.player.pet.item.cast；其余走 .use
     * @param {Array} kamiList - 需喂食的kami列表，每项含 { dbIndex, kamiId, imgNumber }
     * @param {string} logPrefix - 日志前缀（区分紧急/普通）
     * @returns {number} 成功发送 tx 的数量（fire-and-forget，不保证链上成功）
     */
    async function _starvingFeedKamis(kamiList, logPrefix) {
        if (!kamiList.length) return 0;

        // 【Step 1】单次库存查询：一次取回账户全部道具余额，避免逐只 kami 重复查询
        const addr = window.network?.network?.connectedAddress?.value_;
        let inv = [];
        let invReadSuspicious = false;
        try {
            const acc = window.network.explorer.accounts.getByOperator(addr);
            invReadSuspicious = !Array.isArray(acc?.inventories) || acc.inventories.length === 0;
            inv = Array.isArray(acc?.inventories) ? acc.inventories : [];
        } catch (e) {
            // BEFORE(Bug B前): 库存查询异常直接 return 0，实盘上会把前端失真当成无库存放弃。
            log(`⚠️ [${logPrefix}] 查询库存失败: ${e?.message || e}`);
            log(`🧊 [喂食/守护] 库存读取疑似前端失真，本轮不放弃 starving，defer 到下轮重试`);
            return 0;
        }

        // 建立 食物index → 库存余额 的映射，只收录余额 > 0 的食物
        const balMap = new Map();
        for (const food of STARVING_FOOD_LIST) {
            const bal = Number(inv.find(it => Number(it?.item?.index) === food.index)?.balance || 0);
            if (bal > 0) balMap.set(food.index, bal);
        }

        // 一种可用食物都没有 → 整批放弃，红色告警要求手动处理
        const available = STARVING_FOOD_LIST.filter(f => balMap.has(f.index));
        if (available.length === 0) {
            // BEFORE(Bug B前): inventories 为空/缺失时也走红字"库存为0"放弃；冻结或空数组读数改为 defer。
            if (_isFrontendFrozen() || invReadSuspicious) {
                log(`🧊 [喂食/守护] 库存读取疑似前端失真，本轮不放弃 starving，defer 到下轮重试`);
                return 0;
            }
            const ids = kamiList.map(k => `#${k.dbIndex}`).join(', ');
            log(`%c⚠️ [${logPrefix}] 所有HP恢复食物库存为0！无法喂食STARVING的kami！请手动处理: ${ids}`,
                'color: red; font-weight: bold; font-size: 13px;');
            return 0;
        }

        const foodSummary = available.map(f => `${f.name}(+${f.hp})×${balMap.get(f.index)}`).join(', ');
        log(`🍔 [${logPrefix}] 可用食物: ${foodSummary}`);

        // 【Step 2】并发预查每个 kami：kamiId / harvest.time.last 24h 卡链 / S2纯观测dump / 停采预检
        // CONC 路 worker 共享 nextI 指针"抢号"处理，结果按原顺序写入 enriched
        const CONC = 8;
        const enriched = new Array(kamiList.length);
        let nextI = 0;
        let hpKeysDumped = false;  // S2：stats.health keys dump 去重防刷屏
        async function workerLoop() {
            while (true) {
                const i = nextI++;
                if (i >= kamiList.length) break;
                const kami = kamiList[i];
                const out = { kami, kamiId: kami.kamiId, skipReason: null, stopOk: false, stuckHours: null };
                try {
                    // 补 kamiId：候选可能只带 dbIndex/imgNumber，先查本地 kami_core_db
                    if (!out.kamiId) {
                        const rec = window.kami_core_db?.find(k =>
                            k.imgNumber === kami.imgNumber || String(k.index) === String(kami.dbIndex));
                        out.kamiId = rec?.kamiId;
                    }
                    // 本地库查不到 → 按编号走链上查询兜底
                    if (!out.kamiId && Number.isFinite(+kami.dbIndex)) {
                        const info = await window.network.explorer.kamis.getByIndex(kami.dbIndex, {});
                        out.kamiId = info?.id;
                    }
                    if (!out.kamiId) {
                        out.skipReason = `无法获取kamiId`;
                        enriched[i] = out;
                        continue;
                    }

                    // 保护1: harvest.time.last（链上最后一次tx时间）超过 24h 判定卡链，跳过
                    try {
                        const chainInfo = await window.network.explorer.kamis.getByIndex(kami.dbIndex, { harvest: true });
                        const timeLast = chainInfo?.harvest?.time?.last;
                        // 【v1.1.11】把本次已查到的 time.last 顺手存到 out 上，供 Step 3 发喂食
                        // tx 前做冷却预筛用（避免为冷却检查再多查一次链，SYNC 锚点见 Step 3）
                        out.timeLast = timeLast;
                        if (timeLast) {
                            const stuckDuration = Date.now() - timeLast * 1000;
                            if (stuckDuration > STARVING_STUCK_TIME_MS) {
                                out.stuckHours = Math.floor(stuckDuration / (60 * 60 * 1000));
                                out.stuckTimeLastStr = new Date(timeLast * 1000).toLocaleString();
                                out.skipReason = `stuck24h`;
                                enriched[i] = out;
                                continue;
                            }
                        }

                    } catch (_) {}  // 查询失败不阻断，继续后续检查

                    // 🔻SYNC→内部版[1.2.2 救援喂前S2·纯观测] ⚠️ 链上HP闸门已在发布前砍除（异源审REJECT，B1致死级）：
                    //   stats.health.sync = **上次链上tx时刻的检查点值，非实时**（同 KB §18.12 stamina.sync 铁律）——
                    //   采集期间 HP 流失不产生 tx，链上不更新：部署时100→流干到0，sync 仍读100。
                    //   真饿死的 kami sync 系统性偏高 → 任何"链上HP>阈值⇒DOM误判"闸门都会精准误拦最需要喂的，静默致死。
                    //   本轮仅留纯观测 dump 标定（勿把 sync 当实时 HP 判据）；DOM 误标的真解=喂食时新鲜 DOM 重解析（下轮）。
                    //   N1：观测独立 try，stats 水合异常不拖累主链路 timeLast。
                    try {
                        if (!hpKeysDumped) {
                            hpKeysDumped = true;   // N1v2：尝试即置位——stats 不可用时不得每只每轮空发 RPC 且静默
                            const chainStats = await window.network.explorer.kamis.getByIndex(kami.dbIndex, { stats: true });
                            const hs = chainStats?.stats?.health;
                            if (hs && typeof hs === 'object') {
                                log(`🔎 [${logPrefix}] S2观测(标定用,非判据): #${kami.dbIndex} 链上检查点HP sync=${hs.sync ?? 'NA'} total=${hs.total ?? 'NA'} keys=[${Object.keys(hs).join(',')}] time.last=${out.timeLast ?? 'NA'}（DOM判STARVING;链上值为上次tx快照,预期偏高属正常）`);
                            } else {
                                log(`🔎 [${logPrefix}] S2观测: #${kami.dbIndex} stats.health 不可读 statsKeys=[${chainStats?.stats && typeof chainStats.stats === 'object' ? Object.keys(chainStats.stats).join(',') : '(无stats)'}]（仅标定，不拦截）`);
                            }
                        }
                    } catch (_) {}

                    // BEFORE(Bug B前): 已确认喂食路径未读取停采黑名单；保持解耦，喂食只受自身熔断与冷却保护影响。
                    // 保护2: 喂过仍 STARVING 的兜底熔断（次数达阈值且在冷却期内则跳过）
                    if (__starvingFedRecord.has(out.kamiId)) {
                        const rec = __starvingFedRecord.get(out.kamiId);
                        const elapsed = Date.now() - rec.lastFeedTime;
                        if (rec.count >= STARVING_STUCK_THRESHOLD && elapsed < STARVING_STUCK_COOLDOWN_MS) {
                            out.skipReason = `alreadyFed${rec.count}Stuck${Math.ceil((STARVING_STUCK_COOLDOWN_MS - elapsed) / 60000)}m`;
                            enriched[i] = out;
                            continue;
                        }
                        // 冷却期已过：清除记录，允许重新尝试喂食
                        if (elapsed >= STARVING_STUCK_COOLDOWN_MS) __starvingFedRecord.delete(out.kamiId);
                    }

                    // 停采预检：能停采则跳过喂食（DOM 的 0% 可能是取整误差）
                    if (kami.harvestId) {
                        try {
                            const stopCheck = await _preCheckStop([kami.harvestId]);
                            if (stopCheck.ok) {
                                out.stopOk = true;
                                out.skipReason = `stopPrecheckOK`;
                            }
                        } catch (_) {}
                    }
                } catch (e) {
                    out.skipReason = `preQueryError:${e?.message || e}`;
                }
                enriched[i] = out;
            }
        }
        // 启动 CONC 个 worker 并等待全部预查完成
        await Promise.all(Array.from({ length: CONC }, workerLoop));

        // 【Step 3】按顺序 fire-and-forget 喂食
        let fedCount = 0;
        let skippedCount = 0;
        let skippedCooldown = 0;  // 【v1.1.11 冷却公式预筛】冷却期跳过计数，单独统计不计入失败
        for (let idx = 0; idx < enriched.length; idx++) {
            const info = enriched[idx];
            const kami = info.kami;
            if (info.skipReason) {
                if (info.stopOk) {
                    skippedCount++;
                    log(`ℹ️ [${logPrefix}] #${kami.dbIndex} 停采预检通过（实时HP>0），无需喂食`);
                } else if (info.skipReason === 'stuck24h') {
                    log(`%c⛔ [${logPrefix}] #${kami.dbIndex} 链上最后tx时间为 ${info.stuckTimeLastStr}（${info.stuckHours}小时前），超过24小时，判定卡链上，跳过喂食。请手动处理`,
                        'color: red; font-weight: bold;');
                } else if (info.skipReason.startsWith('alreadyFed')) {
                    log(`⛔ [${logPrefix}] #${kami.dbIndex} ${info.skipReason}，跳过。请手动处理`);
                } else {
                    log(`⚠️ [${logPrefix}] #${kami.dbIndex} ${info.skipReason}，跳过`);
                }
                continue;
            }

            // 🔻SYNC→内部版[1.1.11 冷却预筛推广]：发喂食 tx 前查一次冷却剩余（复用 Step 1
            // 已查到的 harvest.time.last，零额外链上查询）。冷却期内该 kami 的喂食 tx 必败，
            // 跳过本次不计入失败（不进 __starvingFedRecord 计数），下一轮饿死救援自动重试
            const remain = _cooldownRemainSec(info.timeLast);
            if (remain > 0) {
                skippedCooldown++;
                const age = info.timeLast ? Math.round(Date.now() / 1000 - info.timeLast) : 'N/A';
                log(`⏳ [饿死救援/冷却预筛] #${kami.dbIndex} 冷却剩余 ${remain}s（time.last age=${age}s），跳过本次喂食（tx必败），解除后重试`);
                continue;
            }

            // 选食物：按 HP 降序取第一个有库存（优先最大、一次到位省 gas；小食物兜底）
            // 🔻SYNC[1.2.2 救援喂大食物]：表本身与 balMap 不动，仅此处 sort 降序
            let chosen = null;
            for (const food of [...STARVING_FOOD_LIST].sort((a, b) => b.hp - a.hp)) {
                const bal = balMap.get(food.index) || 0;
                if (bal > 0) { chosen = food; break; }
            }
            if (!chosen) {
                const restIds = enriched.slice(idx).map(x => `#${x.kami.dbIndex}`).join(', ');
                log(`%c⚠️ [${logPrefix}] 食物已用完，剩余 ${enriched.length - idx} 个无法喂食，请手动处理: ${restIds}`,
                    'color: red; font-weight: bold;');
                break;
            }

            try {
                // 11305 Paeon Spell Card 是法术卡道具，链上入口为 cast；普通食物走 use
                const isPaeonSpell = chosen.index === 11305;
                const apiFn = isPaeonSpell
                    ? window.network?.api?.player?.pet?.item?.cast
                    : window.network?.api?.player?.pet?.item?.use;
                const apiName = isPaeonSpell ? 'cast' : 'use';
                if (typeof apiFn !== 'function') {
                    log(`❌ [${logPrefix}] #${kami.dbIndex} api.player.pet.item.${apiName} 不可用，跳过`);
                    continue;
                }

                log(`🍔 [${logPrefix}] 喂食 #${kami.dbIndex} → ${chosen.name}(+${chosen.hp}HP) [${apiName}] (fire-and-forget)`);
                // fire-and-forget：await apiFn() 只等钱包分配 nonce 就发下一只，不等 tx.wait() 上链确认
                const __feedTx = await apiFn(info.kamiId, chosen.index);   // 🔻SYNC[1.2.7 gas真值账本] 捕获 fire-and-forget 返回抓 hash（不改发送/时序/返回语义，原返回值本就丢弃）
                _gasLedgerRecord('feed', [info.kamiId], __feedTx);

                fedCount++;

                // 记录喂食次数（供保护2熔断判定；达阈值即提示后续将跳过）
                const prev = __starvingFedRecord.get(info.kamiId) || { count: 0, lastFeedTime: 0 };
                __starvingFedRecord.set(info.kamiId, { count: prev.count + 1, lastFeedTime: Date.now() });
                if (prev.count + 1 >= STARVING_STUCK_THRESHOLD) {
                    log(`%c⛔ [${logPrefix}] #${kami.dbIndex} 已累计喂食${prev.count + 1}次仍是STARVING，疑似卡链上，后续将跳过（冷却${STARVING_STUCK_COOLDOWN_MS / 60000}分钟），请手动处理`,
                        'color: red; font-weight: bold;');
                }

                // 本地扣减库存记账（不再重复查询链上库存）
                const newBal = (balMap.get(chosen.index) || 1) - 1;
                if (newBal <= 0) balMap.delete(chosen.index);
                else balMap.set(chosen.index, newBal);

                // 小间隔让 nonce 排队稳定
                await delay(300);
            } catch (e) {
                log(`❌ [${logPrefix}] #${kami.dbIndex} 喂食tx发送失败: ${e?.message || e}`);
            }
        }

        // 【v1.1.11 冷却公式预筛】汇总里补一段冷却跳过统计，方便和 API 验证跳过区分开复盘
        const cooldownPart = skippedCooldown > 0 ? `，冷却预筛跳过${skippedCooldown}个（下轮重试）` : '';
        if (skippedCount > 0) {
            log(`📊 [${logPrefix}] 汇总：${kamiList.length}个候选 → fire-and-forget发送${fedCount}个，API验证HP>0跳过${skippedCount}个${cooldownPart}`);
        } else {
            log(`📊 [${logPrefix}] 汇总：${kamiList.length}个候选 → fire-and-forget发送${fedCount}个${cooldownPart}`);
        }
        return fedCount;
    }

    // ============================================================
    // 【板块：黑名单与失败记录管理命令】
    // ------------------------------------------------------------
    // ▍功能：
    //   喂食失败记录（供喂食模块做失败冷却），以及一组控制台命令，
    //   用于查看/清空部署黑名单、停采黑名单、喂食失败记录、
    //   STARVING 重复喂食熔断记录。
    // ▍触发时机：
    //   记录由各业务模块在失败时写入；命令由用户在控制台手动调用
    //   （典型场景：手动处理完卡住的 kami 后，用 clear 系列命令立即
    //   解封，不必等自动冷却到期）。
    // ▍依赖：
    //   - 内存 Set/Map（__blockedKamiIds / __stopBlockedKamis /
    //     __feedFailedKamis / __starvingFedRecord 等），页面刷新即
    //     全部清空，不跨会话保留；
    //   - window.kami_core_db — 展示时把 kamiId 反查回编号（#index）
    //     便于人工对照，查不到显示 '?'。
    // ▍核心流程：
    //   - clear 系列：统计当前数量 → 清空对应 Set/Map → 打印结果并
    //     返回清除数量；
    //   - show 系列：遍历黑名单 → 反查编号 → 计算已拉黑时长与剩余
    //     自动解封时间 → 打印并返回列表。
    // ▍边界与保护：
    //   - 黑名单为空时 show 系列直接提示为空并返回 []；
    //   - kamiId 展示时截断为前 10 位 + '...'，避免长 ID 刷屏；
    //   - clearBlockedKamis 会同时清空部署黑名单的三个结构（名单、
    //     失败计数、拉黑时间）以及停采黑名单三件套，保证状态一致；
    //   - clearStopBlockedKamis 只清停采黑名单（含失败计数重置）。
    // ▍可调参数：
    //   - FEED_FAIL_COOLDOWN_MS = 5*60*1000 — 喂食失败后的冷却时长
    //     （5 分钟），冷却期内不再尝试喂同一只。调大更省 gas，
    //     但失败 kami 的恢复更慢。
    //   - FEED_MAX_FAILS = 2 — 连续失败达 2 次进入冷却。
    // ▍相关控制台命令：
    //   - clearBlockedKamis() — 清空部署黑名单 + 停采黑名单
    //   - clearStopBlockedKamis() — 只清空停采黑名单
    //   - showStopBlockedKamis() — 查看停采黑名单（含剩余解封分钟数）
    //   - showBlockedKamis() — 查看部署黑名单（console.table 展示）
    //   - clearFeedFails() — 清空喂食失败记录
    //   - clearStarvingStuck() — 清空 STARVING 重复喂食熔断记录
    // ============================================================

    // 喂食失败记录 — 冷却期内不再反复尝试喂同一只失败的 kami，避免白烧 gas
    const __feedFailedKamis = new Map();  // kamiId -> { count, lastFailTime }
    const FEED_FAIL_COOLDOWN_MS = 5 * 60 * 1000;  // 失败后冷却 5 分钟
    const FEED_MAX_FAILS = 2;  // 连续失败 2 次进入冷却

    window.clearBlockedKamis = function() {
        const deployCount = __blockedKamiIds.size;
        const stopCount = __stopBlockedKamis.size;
        __blockedKamiIds.clear();
        __kamiDeployFailCount.clear();
        __kamiBlockedTime.clear();
        __stopBlockedKamis.clear();
        __stopBlockedTime.clear();
        __stopFailCount.clear();
        __stopPendingVerify.clear();   // 🔻SYNC→内部版[1.1.22 退避复读] I4：清黑名单时一并清退避复读队列（给这些 kami 干净重来）
        log(`✅ 已清除黑名单: 部署${deployCount}个, 停采${stopCount}个`);
        return { deploy: deployCount, stop: stopCount };
    };

    // 单独清除停采黑名单
    window.clearStopBlockedKamis = function() {
        const count = __stopBlockedKamis.size;
        __stopBlockedKamis.clear();
        __stopBlockedTime.clear();
        __stopFailCount.clear();
        __stopPendingVerify.clear();   // 🔻SYNC→内部版[1.1.22 退避复读] I4：清停采黑名单时一并清退避复读队列
        log(`✅ 已清除停采黑名单 ${count} 个（失败计数已重置）`);
        return count;
    };

    // 显示停采黑名单
    window.showStopBlockedKamis = function() {
        if (__stopBlockedKamis.size === 0) {
            log('✅ 停采黑名单为空');
            return [];
        }
        const list = [];
        for (const kamiId of __stopBlockedKamis) {
            const record = window.kami_core_db?.find(k => k.kamiId === kamiId);
            const blockedAt = __stopBlockedTime.get(kamiId);
            const elapsed = blockedAt ? Math.floor((Date.now() - blockedAt) / 60000) : 0;
            // 30 = STOP_BLOCK_COOLDOWN_MS 对应的分钟数，计算剩余自动解封分钟
            const remain = Math.max(0, 30 - elapsed);
            list.push({
                index: record?.index || '?',
                kamiId: kamiId.slice(0, 10) + '...',
                blockedMin: elapsed,
                remainMin: remain
            });
            log(`   🚫 #${record?.index || '?'} 已拉黑${elapsed}分钟，剩余${remain}分钟`);
        }
        log(`📊 停采黑名单共 ${list.length} 个`);
        return list;
    };

    window.showBlockedKamis = function() {
        if (__blockedKamiIds.size === 0) {
            log('✅ 没有blocked的kami');
            return [];
        }
        const list = [];
        for (const kamiId of __blockedKamiIds) {
            const record = window.kami_core_db?.find(k => k.kamiId === kamiId);
            const blockedAt = __kamiBlockedTime.get(kamiId);
            const elapsed = blockedAt ? Math.round((Date.now() - blockedAt) / 1000 / 60) : '?';
            list.push({ index: record?.index || '?', kamiId: kamiId.slice(0, 10) + '...', blockedMinutesAgo: elapsed });
        }
        console.table(list);
        return list;
    };

    // 清除喂食失败记录
    window.clearFeedFails = function() {
        const count = __feedFailedKamis.size;
        __feedFailedKamis.clear();
        log(`✅ 已清除 ${count} 个喂食失败记录`);
        return count;
    };

    // 清除 STARVING 重复喂食熔断记录（手动处理完卡住的 kami 后调用，立即允许重新喂食）
    window.clearStarvingStuck = function() {
        const count = __starvingFedRecord.size;
        __starvingFedRecord.clear();
        log(`✅ 已清除 ${count} 个STARVING喂食卡住记录`);
        return count;
    };

    // ============================================================
    // 【板块：Gas 消耗规则说明（showGasRules）】
    // ------------------------------------------------------------
    // ▍功能：
    //   纯信息输出命令：向用户解释哪些错误会消耗 gas、哪些不会，
    //   附部署（deploy）/ 停采（stop）两类操作在不同批量 N 下的
    //   实测 gasUsed 数据表、由此推导的省 gas 优先级结论，以及本
    //   脚本已实现的省 gas 策略。不读任何状态、不发任何 tx，
    //   随时可安全调用。
    // ▍触发时机：用户在控制台手动调用 showGasRules()。
    // ▍依赖：无（函数体全部为静态 console.log 文本）。
    // ▍核心流程：按"不耗 gas 项 → 耗 gas 项 → 部署实测表 →
    //   停采实测表 → 关键结论与省 gas 优先级 → 脚本已做的优化 →
    //   注意事项"的顺序打印。
    // ▍边界与保护：
    //   输出中的 gasUsed 数据为单账户单次实测值，不同账户/时段会有
    //   偏差，但"批量节省比例（省比）"相对稳定，参考结论时以省比
    //   为准；cooldown、失败 revert、nonce 冲突都会显著拉高真实成本。
    // ▍可调参数：无（如需更新数据表，直接修改下方文案字符串）。
    // ▍相关控制台命令：showGasRules() — 打印本说明。
    // ============================================================

    // 显示Gas消耗规则（静态说明文本，不发 tx）
    window.showGasRules = function() {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('%c⚡ Gas消耗规则 - 哪些错误消耗Gas？', 'color: #00aaff; font-weight: bold; font-size: 16px;');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
        console.log('%c✅ 不消耗Gas（链下/预检阶段）：', 'color: #00ff00; font-weight: bold;');
        console.log('   • estimateGas失败 - 预检，模拟执行不上链');
        console.log('   • RPC连接错误 - 交易没发出去');
        console.log('   • 签名失败 - 钱包拒绝');
        console.log('   • 参数错误 - API层面拒绝');
        console.log('   • 预检CALL_EXCEPTION - 预检机制捕获');
        console.log('');
        console.log('%c❌ 消耗Gas（交易已上链）：', 'color: #ff0000; font-weight: bold;');
        console.log('   • 交易revert - 上链后执行失败，已扣gas');
        console.log('   • 超时但成功 - 交易上链了，只是等确认超时');
        console.log('   • Nonce冲突 - 超时后重试，两笔都上链');
        console.log('   • 重复操作 - kami已停采/已部署还重复操作');
        console.log('');
        console.log('%c💡 省Gas秘诀（批量打包同类操作）：', 'color: #ffaa00; font-weight: bold;');
        console.log('');
        console.log('   测试方法：同一账户连续 N=1..12 实测，间隔 1.5s，cooldown 3min');
        console.log('');
        console.log('%c📊 [部署 deploy] — 实测 gasUsed (M = 百万 gas)：', 'color: #ffaa00; font-weight: bold;');
        console.log('   N     单 tx 总 gas    每只摊销      省比 vs N=1');
        console.log('   ───   ───────────     ──────────    ───────────');
        console.log('   1     1.35M           1.35M         0%');
        console.log('   2     2.03M           1.01M         25%');
        console.log('   3     2.74M           0.91M         33%');
        console.log('   4     3.43M           0.86M         37%');
        console.log('   5     4.15M           0.83M         39%');
        console.log('   6     4.81M           0.80M         41%');
        console.log('   7     5.51M           0.79M         42%');
        console.log('   8     6.22M           0.78M         43%');
        console.log('   9     6.89M           0.77M         44%');
        console.log('   10    7.58M           0.76M         44%');
        console.log('   11    8.26M           0.75M         45%');
        console.log('   12    8.97M           0.75M         45%');
        console.log('');
        console.log('   👉 部署：N=1→2 跳变最大（省 25%），到 N=10 后基本稳定（~45%）');
        console.log('   👉 边际成本 ≈ 0.69M / 个；固定开销 ≈ 0.66M / tx');
        console.log('');
        console.log('%c📊 [停采 stop] — 实测 gasUsed：', 'color: #ffaa00; font-weight: bold;');
        console.log('   N     单 tx 总 gas    每只摊销      省比 vs N=1');
        console.log('   ───   ───────────     ──────────    ───────────');
        console.log('   1     2.43M           2.43M         0%');
        console.log('   2     3.82M           1.91M         21%');
        console.log('   3     5.16M           1.72M         29%');
        console.log('   4     6.53M           1.63M         33%');
        console.log('   5     7.93M           1.59M         35%');
        console.log('   6     9.25M           1.54M         37%');
        console.log('   7     10.59M          1.51M         38%');
        console.log('   8     12.15M          1.52M         38%');
        console.log('   9     13.43M          1.49M         39%');
        console.log('   10    14.70M          1.47M         40%');
        console.log('   11    16.15M          1.47M         40%');
        console.log('   12    17.40M          1.45M         40%');
        console.log('');
        console.log('   👉 停采：N=1→2 省 21%，N=1→12 省 40%，节省曲线比部署平缓');
        console.log('   👉 边际成本 ≈ 1.36M / 个；固定开销 ≈ 1.07M / tx');
        console.log('');
        console.log('%c💰 关键结论（与直觉相反！）：', 'color: #ff6600; font-weight: bold;');
        console.log('   ⚠️ 停采反而比部署贵：');
        console.log('      • 同 N=1：停采 2.43M vs 部署 1.35M（停采贵 80%）');
        console.log('      • 同 N=10：停采 1.47M vs 部署 0.76M（停采贵 94%）');
        console.log('   原因推测：停采涉及收益结算 + 状态清理 + 事件 emit，写操作更多。');
        console.log('   省 gas 优先级：');
        console.log('      ① 减少不必要的停采（精挑 HP 危险线，别停健康 kami）');
        console.log('      ② 停采时尽量批量（N=10 比 N=1 省 40%）');
        console.log('      ③ 部署批量（N=10 比 N=1 省 44%；但部署本身便宜，权重低于①②）');
        console.log('');
        console.log('%c🔧 当前脚本的省Gas优化：', 'color: #aa00ff; font-weight: bold;');
        console.log('   • 紧急停采：每批随机 6-10 个（大批量在 gas 飙升时失败率更高）');
        console.log('   • 紧急停采：预检过滤已死/已停 kami，避免无效交易');
        console.log('   • 紧急停采：动态等待时间，避免重复发送（重发会双倍 gas）');
        console.log('   • 一键停采：每批 6-10 随机（同上策略）');
        console.log('   • 喂食：每批 3 个（喂食合约稍贵，批小一点更稳）');
        console.log('   • 喂食：4 层预检 + 失败冷却，避免反复失败消耗 gas');
        console.log('   • 部署：estimateGas 预检，失败不上链；优先批量发送');
        console.log('   • 默认 API 批量，避免 DOM 逐个');
        console.log('');
        console.log('%c⚠️ 注意：', 'color: #ff0000; font-weight: bold;');
        console.log('   • 上面 gasUsed 数据为单账户单次实测，不同账户/时段会有偏差，');
        console.log('     但批量节省比例（省比）相对稳定。');
        console.log('   • cooldown / 失败 revert / nonce 冲突会显著拉高真实成本。');
        console.log('═══════════════════════════════════════════════════════════════');
    };

    // ============================================================
    // 【板块：全量停采后的部署暂停窗口】
    // ------------------------------------------------------------
    // ▍功能：stopCurrentRoom / stopMinorityForTransfer 两个"全量停采"命令完成后，
    //   自动暂停自动部署 10 分钟。用户全量停采通常是为了转移地块或把 kami 转给
    //   其他账户；若不暂停，主循环下一轮就会把刚变成 RESTING 的 kami 重新部署回
    //   原地块，等于白停一次并浪费两笔 gas（停采 + 重新部署）。
    // ▍触发时机：两个停采命令在收尾阶段自动调用 _pauseDeployAfterStopAll(tag)；
    //   自动部署入口在每轮部署前检查 window.__deployPausedUntil，未到期则跳过部署。
    // ▍依赖：仅全局标志 window.__deployPausedUntil（到期时间戳，ms）；
    //   不依赖 DOM、localStorage 或链上 API。挂在 window 上是为了让部署入口与
    //   本板块跨作用域共享，且脚本重复加载时不清零已生效的暂停。
    // ▍核心流程：
    //   1) 停采命令完成 → __deployPausedUntil = now + DEPLOY_PAUSE_AFTER_STOPALL_MS；
    //   2) 打印到期时刻（配置时区 HH:MM）提示用户；
    //   3) 部署入口发现 Date.now() < __deployPausedUntil 时本轮跳过部署；
    //   4) 到期自动恢复，或用户随时调用 resumeDeploy() 立即恢复。
    // ▍边界与保护：
    //   - 用"绝对到期时间戳 + 主循环轮询判断"实现，不挂定时器，无需清理；
    //   - `|| 0` 幂等初始化：重复加载脚本不会覆盖已生效的暂停时间；
    //   - resumeDeploy() 是手动逃生口：误触停采命令后可立即恢复自动部署。
    // ▍可调参数：
    //   DEPLOY_PAUSE_AFTER_STOPALL_MS = 10 * 60 * 1000（10 分钟）— 暂停窗口时长。
    //   调大：手动转移操作时间更充裕，但自动化空转更久、总采集时间减少；
    //   调小：可能还没来得及转移，kami 就被重新部署回原地块。
    // ▍相关控制台命令：resumeDeploy() — 立即清零暂停标志，下一轮恢复自动部署。
    // ============================================================
    const DEPLOY_PAUSE_AFTER_STOPALL_MS = 10 * 60 * 1000;   // 停采后的转移窗口时长：10 分钟
    window.__deployPausedUntil = window.__deployPausedUntil || 0;   // 幂等初始化：重复加载不覆盖已生效的暂停
    window.resumeDeploy = function () {
        window.__deployPausedUntil = 0;
        log('▶️ [部署] 暂停已手动解除，下一轮恢复自动部署');
    };
    function _pauseDeployAfterStopAll(tag) {
        window.__deployPausedUntil = Date.now() + DEPLOY_PAUSE_AFTER_STOPALL_MS;
        const until = new Date(window.__deployPausedUntil + __TZ_OFFSET_MS).toISOString().substring(11,16);   // 换算为配置时区，截取 HH:MM
        log(`%c⏸️ [${tag}] 已自动暂停部署 ${DEPLOY_PAUSE_AFTER_STOPALL_MS/60000} 分钟（至 ${__TZ_LABEL} ${until}），防止刚停采又被自动部署回去；立即恢复 → resumeDeploy()`,
            'color: orange; font-weight: bold;');
    }

    // ============================================================
    // 【板块：一键停采当前地块（stopCurrentRoom）】
    // ------------------------------------------------------------
    // ▍功能：把本账户在"当前所在地块"上所有 HARVESTING 状态的 kami 一次性批量
    //   停采，按 HP% 从低到高（危险优先）的顺序发送，方便随后切换到其他地块采集。
    // ▍触发时机：纯手动命令，控制台调用 window.stopCurrentRoom()；不会被自动触发。
    // ▍依赖：
    //   - 链上 API：window.network.network.connectedAddress.value_（操作员地址）、
    //     window.network.explorer.accounts.getByOperator（账户所在地块 + kami 列表）、
    //     window.network.explorer.kamis.getByIndex(..., { harvest: true })
    //     （单只详情：harvestId / 采集地块 / 图片编号）；
    //   - DOM 元素：div#party 下的 kami 卡片列表（选择器
    //     div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div），
    //     用于读取 UI 实时 HP%；
    //   - 内部函数：__getRoomNameByIndex（地块名）、setEmergencyLock /
    //     releaseEmergencyLock（TX 紧急锁）、_allowFailureStop（AllowFailure 批量停采）、
    //     chunkRandom（随机大小分批）、_fmtMinSec（耗时格式化）、delay；
    //   - 全局标志：window.__emergencyStopRunning（与紧急停采互斥的运行标志）；
    //   - 不读写 localStorage。
    // ▍核心流程：
    //   1) 查账户信息，取当前地块 roomIndex 与 kami 列表；
    //   2) 筛出 state === 'HARVESTING' 的 kami；
    //   3) 构建 DOM 中 imgNumber→卡片 的映射，从 UI 读取实时 HP%
    //      （API 的 stats.health.sync 是链上同步值、滞后；UI 是客户端实时计算值）；
    //   4) 10 路并发查询每只的 harvestId / 采集地块 / 图片编号；
    //   5) 按地块分流：只停当前地块的；在其他地块的仅提示不处理；
    //      查不到 harvestId 的跳过并列出；
    //   6) 按 HP% 升序排序，血量最低（最接近被杀）的最先停；
    //   7) 设置紧急锁，让 runAutomation 主循环让路后再发 tx；
    //   8) 按每批 6-10 只随机分批发送 AllowFailure 停采，批间隔 6.5 秒；
    //      整批失败 → 等 5 秒 → 逐只核查链上状态 → 只对仍 HARVESTING 的重试一次；
    //   9) 汇报成功/失败数与耗时，并调用 _pauseDeployAfterStopAll
    //      打开 10 分钟部署暂停窗口（见上一板块）。
    // ▍边界与保护：
    //   - 防重入：window.__emergencyStopRunning 为真时直接拒绝
    //     （紧急停采与一键停采共用该标志，互斥运行，防 nonce 冲突）；
    //   - 紧急锁：发 tx 前 setEmergencyLock()，主循环检测到会暂停让路（最长等 300 秒）；
    //     emergencyLockSet 标志保证 finally 里只释放自己设过的锁；
    //   - HP 容错：DOM 读不到 HP% 时保守视为 100%（排到最后停，不挤占危险 kami 的优先级）；
    //   - 重试节流：整批失败先核查链上真实状态，只重发仍 HARVESTING 的，
    //     避免对第一次 tx 已部分成功的 kami 重复发 tx 浪费 gas；
    //   - 查询容错：核查阶段查询异常的 kami 保守保留进重试名单（宁可多试不可漏停）；
    //   - 失败兜底：重试仍失败的不再死磕，留给下一轮 runAutomation 常规流程自动处理；
    //   - finally 兜底：无论成功还是异常，都释放紧急锁并清运行标志。
    // ▍可调参数：
    //   CONC = 10 — 详情查询并发数；调大查得快但对节点压力大，调小更温和但更慢；
    //   chunkRandom(..., 6, 10) — 每批 6-10 只随机；调大单批 gas 更高且整批失败代价更大，
    //     调小则 tx 次数变多、总 gas 上升；
    //   delay(6500) — 批间隔 6.5 秒；调小可能连续 tx 撞 nonce/触发限流，调大总耗时变长；
    //   delay(5000) — 整批失败后核查前的等待，给链上状态同步留时间。
    // ▍相关控制台命令：
    //   stopCurrentRoom() — 执行本板块；
    //   resumeDeploy() — 提前结束停采后的 10 分钟部署暂停。
    // ============================================================
    window.stopCurrentRoom = async function() {
        if (window.__emergencyStopRunning) {   // 防重入：与紧急停采/其他一键停采互斥
            log('⚠️ [一键停采] 紧急停采/一键停采正在运行中，稍后再试');
            return;
        }
        window.__emergencyStopRunning = true;
        const startTime = Date.now();
        let emergencyLockSet = false;   // 记录锁是否由本次调用设置，finally 只释放自己设的锁
        try {
            log(`%c🛑 [一键停采] 开始停采当前地块所有 kami...`, 'color: red; font-weight: bold; font-size: 14px;');

            // Step 1: 获取当前地块 + 账户 kami 列表
            let myRoom, myKamis;
            try {
                const addr = window.network.network.connectedAddress.value_;   // 当前连接的操作员钱包地址
                const acc = window.network.explorer.accounts.getByOperator(addr);
                myRoom = acc?.roomIndex;
                myKamis = Array.isArray(acc?.kamis) ? acc.kamis : [];
            } catch (e) {
                log(`❌ [一键停采] 获取账户信息失败: ${e?.message || e}`);
                return;
            }
            if (myRoom == null) {
                log(`❌ [一键停采] 当前地块未知，放弃`);
                return;
            }
            const roomName = __getRoomNameByIndex(myRoom) || `#${myRoom}`;
            log(`🏠 [一键停采] 当前地块: ${roomName} (#${myRoom})`);

            // Step 2: 筛 HARVESTING 状态的 kami
            const harvesting = myKamis.filter(k => String(k.state || '').toUpperCase() === 'HARVESTING');
            if (harvesting.length === 0) {
                log(`✅ [一键停采] 账户中没有 HARVESTING 状态的 kami，无需停采`);
                return;
            }
            log(`🔍 [一键停采] 账户 HARVESTING kami: ${harvesting.length} 只，并发查询详情...`);

            // 预先构建 DOM 里 imgNumber→card 的映射，后面按 imgNumber 读 UI 实时 HP%
            // （API stats.health.sync 是链上同步值，滞后；UI DOM 的 HP% 是客户端动态计算的实时值）
            const domCards = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
            const cardByImg = new Map();
            for (const card of domCards) {
                const imgEl = card.querySelector('img[src*="/kami/"]');
                const m = imgEl?.src?.match(/kami\/(\d+)\.gif/);
                if (m) cardByImg.set(m[1], card);
            }
            function _readHpPctFromDom(imgNumber) {
                if (!imgNumber) return null;
                const card = cardByImg.get(String(imgNumber));
                if (!card) return null;
                const stateImg = card.querySelector('img[src*="/assets/kami_"]');   // 状态小图标，其后紧跟 HP 文本节点
                const hpDiv = stateImg?.nextElementSibling;
                const hpText = hpDiv?.textContent?.trim() || '';
                const m = hpText.match(/\((\d+)%\)/);   // HP 文本形如 "123/456 (78%)"，取括号内百分比
                return m ? parseInt(m[1], 10) : null;
            }

            // Step 3: 并发查详情（harvestId + 采集地块 + imgNumber），HP% 从 DOM 读
            const CONC = 10;   // 详情查询并发数
            const details = new Array(harvesting.length);
            let nextI = 0;
            async function workerLoop() {
                while (true) {
                    const i = nextI++;
                    if (i >= harvesting.length) break;
                    const k = harvesting[i];
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(k.index, { harvest: true });
                        const nodeIdx = res?.harvest?.node?.index ?? null;
                        const harvestId = res?.harvest?.id || null;
                        const imgNumber = res?.image?.match(/kami\/(\d+)\.gif/)?.[1] || null;
                        const hpPct = _readHpPctFromDom(imgNumber) ?? 100;  // DOM读不到时保守视为满血（排最后）
                        // 【v1.1.11】同一次 getByIndex 已带 harvest.time.last，顺手算出冷却剩余，
                        // 供 Step 4 分流时把仍在 180s 操作冷却内的 kami 从本批剔除（SYNC 锚点见 Step 4）
                        // （读不到 time.last 时 _cooldownRemainSec 按无冷却处理，回落旧行为）
                        const timeLast = res?.harvest?.time?.last;
                        const cooldownRemain = _cooldownRemainSec(timeLast);
                        details[i] = { index: k.index, harvestId, nodeIdx, hpPct, timeLast, cooldownRemain };
                    } catch {
                        details[i] = { index: k.index, harvestId: null, nodeIdx: null, hpPct: 100, timeLast: null, cooldownRemain: 0 };
                    }
                }
            }
            await Promise.all(Array.from({ length: CONC }, workerLoop));   // 启动 CONC 个 worker 并发消费队列

            // Step 4: 按地块分流
            let inThisRoom = details.filter(d => d.nodeIdx === myRoom && d.harvestId);
            const otherRoom = details.filter(d => d.nodeIdx != null && d.nodeIdx !== myRoom);
            const missingId = details.filter(d => d.nodeIdx === myRoom && !d.harvestId);
            if (otherRoom.length > 0) {
                const list = otherRoom.slice(0, 10).map(d => `#${d.index}(地块${d.nodeIdx})`).join(', ');
                log(`ℹ️ [一键停采] ${otherRoom.length} 只 HARVESTING 在其他地块，本命令不处理: ${list}${otherRoom.length > 10 ? '...' : ''}`);
            }
            if (missingId.length > 0) {
                log(`⚠️ [一键停采] ${missingId.length} 只 kami 查不到 harvestId，跳过: ${missingId.map(d => `#${d.index}`).join(', ')}`);
            }

            // 🔻SYNC→内部版[1.1.11 冷却预筛推广]：把仍在 180s 操作冷却内的 kami 从本批停采候选
            // 里剔除——此刻发停采 tx 必败。跳过只是省一次必败 tx，不是拉黑：这些 kami 仍在账户
            // kami 列表里，冷却解除后下次手动调用 stopCurrentRoom() 或自动化主流程（<10min 一次
            // 扫描）会自然重新捕获停采，不存在"永久漏停"风险。
            const cooling = inThisRoom.filter(d => d.cooldownRemain > 0);
            const readyToStop = inThisRoom.filter(d => d.cooldownRemain <= 0);
            if (cooling.length > 0) {
                const showN = cooling.length > 8 ? 5 : cooling.length;   // 超过8只只逐条打印前5只样例，防刷屏
                for (const d of cooling.slice(0, showN)) {
                    const age = d.timeLast ? Math.round(Date.now() / 1000 - d.timeLast) : 'N/A';
                    log(`⏳ [一键停采/冷却预筛] #${d.index} 冷却剩余 ${d.cooldownRemain}s（time.last age=${age}s），跳过本次停采（此刻停采tx必败，冷却解除后下次调用会重新捕获停采）`);
                }
                if (cooling.length > showN) {
                    log(`⏳ [一键停采/冷却预筛] 另有 ${cooling.length - showN} 只同样在冷却中（样例）: ${cooling.slice(showN).map(d => `#${d.index}(剩${d.cooldownRemain}s)`).join(', ')}`);
                }
                log(`📊 [一键停采/冷却预筛] 本批 ${inThisRoom.length} 只候选，${cooling.length} 只在冷却中已跳过（不拉黑，下次调用/下轮自动化重新捕获停采）`);
            }
            inThisRoom = readyToStop;

            if (inThisRoom.length === 0) {
                log(`✅ [一键停采] 当前地块 ${roomName} 没有需要停采的 kami${cooling.length > 0 ? '（扣除冷却中的以外）' : ''}`);
                return;
            }

            // Step 5: 按 HP% 升序排（越低越危险，优先停）
            inThisRoom.sort((a, b) => a.hpPct - b.hpPct);
            log(`🎯 [一键停采] 当前地块 ${roomName} 共 ${inThisRoom.length} 只待停采，HP ${inThisRoom[0].hpPct}%-${inThisRoom[inThisRoom.length-1].hpPct}%，按危险优先排序`);

            // Step 6: 设置紧急锁，让 runAutomation 主流程让路（主流程检测到紧急锁会等待，最长 300 秒）
            setEmergencyLock();
            emergencyLockSet = true;

            // Step 7: 分批 AllowFailure 停采（整批失败先核查链上状态，只对仍 HARVESTING 的重试）
            // 批量大小取 6-10 随机，避免固定节奏的批量 tx 被识别为机器人行为
            const batches = chunkRandom(inThisRoom, 6, 10);
            let totalOk = 0;
            let totalFail = 0;
            for (let bi = 0; bi < batches.length; bi++) {
                const batch = batches[bi];
                const harvestIds = batch.map(d => d.harvestId);
                const fmt = batch.map(d => `#${d.index}(HP${d.hpPct}%)`).join(',');
                log(`📤 [一键停采/批 ${bi+1}/${batches.length}] 发送 ${batch.length} 个: ${fmt}`);
                const ok = await _allowFailureStop(harvestIds, fmt);
                if (ok) {
                    totalOk += batch.length;
                } else {
                    log(`%c🔄 [一键停采/批 ${bi+1}] 整批失败，等 5 秒后核查状态并重试...`, 'color: orange; font-weight: bold;');
                    await delay(5000);
                    // 核查：只保留仍 HARVESTING 的（第一次 tx 可能部分成功，不重发已停的避免浪费 gas）
                    const stillNeed = [];
                    for (const d of batch) {
                        try {
                            const res = await window.network.explorer.kamis.getByIndex(d.index, { harvest: true });
                            if (String(res?.state || '').toUpperCase() === 'HARVESTING') {
                                const freshHid = res?.harvest?.id || d.harvestId;
                                if (freshHid) stillNeed.push({ ...d, harvestId: freshHid });
                            }
                        } catch {
                            stillNeed.push(d);  // 查询失败保守保留
                        }
                    }
                    if (stillNeed.length === 0) {
                        log(`✅ [一键停采/批 ${bi+1}] 核查后全部已停采（第一次tx部分成功），无需重试`);
                        totalOk += batch.length;
                    } else {
                        if (stillNeed.length < batch.length) {
                            log(`ℹ️ [一键停采/批 ${bi+1}] 核查后 ${batch.length - stillNeed.length} 只已停，剩 ${stillNeed.length} 只重试`);
                            totalOk += (batch.length - stillNeed.length);
                        }
                        const retryIds = stillNeed.map(d => d.harvestId);
                        const retryFmt = stillNeed.map(d => `#${d.index}`).join(',');
                        const retryOk = await _allowFailureStop(retryIds, retryFmt + '(retry)');
                        if (retryOk) {
                            log(`✅ [一键停采/批 ${bi+1}] 重试成功 ${stillNeed.length} 只`);
                            totalOk += stillNeed.length;
                        } else {
                            log(`❌ [一键停采/批 ${bi+1}] 重试仍失败，${stillNeed.length} 只留待下一轮 runAutomation 自动处理`);
                            totalFail += stillNeed.length;
                        }
                    }
                }
                if (bi < batches.length - 1) {
                    await delay(6500);   // 批间隔 6.5 秒，避免连续 tx 撞 nonce/触发限流
                }
            }

            // Step 8: 汇报
            const elapsedMs = Date.now() - startTime;
            log(`%c✅ [一键停采] 完成！成功 ${totalOk}/${inThisRoom.length}${totalFail > 0 ? `，失败 ${totalFail}` : ''}，耗时 ${elapsedMs}ms 即 ${_fmtMinSec(elapsedMs)}`,
                'color: green; font-weight: bold; font-size: 14px;');
            _pauseDeployAfterStopAll('一键停采');   // 转移窗口：10分钟内不自动部署，防止刚停的 kami 被重新部署回去
            if (totalOk > 0) {
                log(`%c🚶 [一键停采] 当前地块 ${roomName} 的 kami 已停采，可以去其他地块采集了！`,
                    'color: cyan; font-weight: bold; font-size: 14px;');
            }
        } catch (e) {
            log(`❌ [一键停采] 异常: ${e?.message || e}`);
        } finally {
            if (emergencyLockSet) releaseEmergencyLock();
            window.__emergencyStopRunning = false;
        }
    };

    // ============================================================
    // 【板块：转移停采（stopMinorityForTransfer）】
    // ------------------------------------------------------------
    // ▍功能：多账户分工策略的配套命令。分工策略下每个账户长期只专注一种地块类型
    //   （majority，主流类型），其余类型的 kami（minority，少数派）应转移给对应
    //   类型的主流账户集中采集。本命令把本账户所有"正在采集的 minority kami"
    //   批量停采，并打印按目标地块类型分组、带颜色区分的可转移清单，
    //   供用户照单用游戏内转移功能批量发送。
    //   与 stopCurrentRoom 的区别：
    //   - stopCurrentRoom：按"当前地块"筛 HARVESTING（切换地块前用）；
    //   - stopMinorityForTransfer：按"非主流类型"筛 HARVESTING（转移给其他账户前用）。
    // ▍触发时机：纯手动命令，控制台调用 window.stopMinorityForTransfer()；不会被自动触发。
    // ▍依赖：
    //   - 辅助脚本接口：window.__getMinorityKamis() — 返回 { majority（主流类型名）,
    //     majorityCount, minorityKamis（含 index/state/terrain）, excludedKillers }；
    //     接口不存在（辅助脚本未加载或过旧）则直接拒绝执行；
    //   - 链上 API：window.network.explorer.kamis.getByIndex(..., { harvest: true })；
    //   - DOM 元素：div#party 卡片列表读实时 HP%（与 stopCurrentRoom 同款逻辑）；
    //   - 内部函数：setEmergencyLock / releaseEmergencyLock、_allowFailureStop、
    //     chunkRandom、_fmtMinSec、delay；全局标志 window.__emergencyStopRunning；
    //   - 数据前提：本地精简数据库（kami_core_db）需已同步，否则识别不出 majority
    //     （此时会提示先运行 syncKamiDb()）；
    //   - 不读写 localStorage。
    // ▍核心流程：
    //   1) 调 __getMinorityKamis() 拿分类结果；识别不出 majority 则放弃；
    //   2) minority 按状态分流：HARVESTING 的需要停采；RESTING 的已可直接转移
    //      （若无 HARVESTING，直接打印 RESTING 转移清单后结束，不发任何 tx）；
    //   3) 构建 DOM imgNumber→卡片 映射，准备读实时 HP%；
    //   4) 10 路并发查每只的 harvestId + HP%；
    //   5) 过滤查不到 harvestId 的（列出并跳过），其余按 HP% 升序（危险优先）；
    //   6) 设置紧急锁，让 runAutomation 主循环让路；
    //   7) 第一轮：全部按每批 6-10 只随机分批发 AllowFailure 停采 tx，批间隔 6.5 秒；
    //      发完不假设成功——AllowFailure 模式下部分 kami 可能因链上 cooldown 没停成；
    //   8) 等 60 秒让链上 cooldown 自然解除，然后逐只核查链上真实状态；
    //   9) 第二轮：只对仍 HARVESTING 的批量重试一次，再等 8 秒做最终核查；
    //   10) 基于链上真实状态汇报两轮战果；调用 _pauseDeployAfterStopAll 打开
    //       10 分钟部署暂停窗口；打印失败名单（建议 2-3 分钟后重跑本命令）
    //       和最终可转移清单（原本 RESTING 的 + 本次真正停成的）。
    // ▍边界与保护：
    //   - 防重入：window.__emergencyStopRunning 为真时拒绝执行（与紧急停采互斥）；
    //   - 接口探测：window.__getMinorityKamis 不是函数则报错退出，不做半吊子降级；
    //   - 杀手保护：担任杀手职责的 kami 已在 __getMinorityKamis 内部过滤，
    //     不会被本命令停采转走；
    //   - 不写 stopBlocked 黑名单：转移停采的失败是临时性的（cooldown/链上拥堵），
    //     不应像常规停采失败那样把 kami 拉黑；
    //   - 成功判定以链上为准：每轮发完都用 getByIndex 逐只核查真实 state，
    //     不信任 tx 的表面结果，避免多报/漏报；
    //   - 查询容错：一轮核查查询失败的保守保留进二轮重试；二轮核查查询失败的
    //     保守计为失败（宁可让用户多跑一次，不可把没停的当成可转移）；
    //   - 紧急锁 + finally 兜底：与 stopCurrentRoom 同款，只释放自己设的锁；
    //   - 清单打印全量 index，超过每行上限自动分行，方便用户完整复制不遗漏。
    // ▍可调参数：
    //   CONC = 10 — harvestId/HP 查询并发数；
    //   chunkRandom(..., 6, 10) — 每批 6-10 只随机，避免固定节奏被识别；
    //   delay(6500) — 批间隔 6.5 秒，防 nonce 冲突/限流；
    //   COOLDOWN_WAIT_MS = 60 * 1000 — 第一轮后的等待时长。【v1.1.11 更正】链上操作
    //     冷却实测 180 秒（0708 定案，见 _cooldownRemainSec 注释），非旧估计的"最长
    //     约3分钟/60秒覆盖大部分"——60 秒 < 180 秒，第二轮核查时仍可能撞上未解除的
    //     冷却；已在 Step 6.5 对首轮候选做冷却预筛先行剔除（SYNC 锚点见 Step 6.5），
    //     未被预筛剔除但二轮仍失败的，靠日志提示用户下次手动调用兜底；
    //   delay(8000) — 第二轮后最终核查前的链上状态同步等待；
    //   PER_LINE = 25 — 转移清单每行最多列 25 个 index；
    //   TERRAIN_COLORS — 各地块类型的打印颜色（normal 灰 / eerie 紫 / scrap 橙 / insect 绿）。
    // ▍相关控制台命令：
    //   stopMinorityForTransfer() — 执行本板块；失败后可重复调用，只会处理仍在采集的；
    //   syncKamiDb() — 增量同步本地精简数据库（majority 识别的数据来源）；
    //   resumeDeploy() — 提前结束停采后的 10 分钟部署暂停。
    // ============================================================
    window.stopMinorityForTransfer = async function () {
        if (window.__emergencyStopRunning) {   // 防重入：与紧急停采/其他一键停采互斥
            log('⚠️ [转移停采] 紧急停采/一键停采正在运行中，稍后再试');
            return;
        }
        if (typeof window.__getMinorityKamis !== 'function') {
            log(`%c❌ [转移停采] 辅助脚本未加载或接口不可用，无法获取 minority 数据`,
                'color: red; font-weight: bold;');
            log(`%c   请确认【辅助脚本】已开启并加载完成，然后重试`, 'color: red;');
            return;
        }

        // 闭包工具：按目标地块分组打印（全部 index 都列出、超过 25 个分行展示，方便用户复制照搬）
        const _printByTarget = (kamis, prefix) => {
            const grouped = {};
            for (const k of kamis) {
                if (!grouped[k.terrain]) grouped[k.terrain] = [];
                grouped[k.terrain].push(k.index);
            }
            const PER_LINE = 25;   // 每行最多列 25 个 index，过长的单行不便复制
            // 按地块类型着色（与辅助脚本 kamiAnalyze 同色系），转移时不易看混
            const TERRAIN_COLORS = { normal: '#9e9e9e', eerie: '#c678dd', scrap: '#e5a13a', insect: '#4ec94e' };
            for (const [terrain, indices] of Object.entries(grouped)) {
                const tColor = `color: ${TERRAIN_COLORS[terrain] || '#9e9e9e'}; font-weight: bold;`;
                const head = `   ${prefix} ${indices.length} 只 → 转给 ${terrain.toUpperCase()} 主流账户：`;
                if (indices.length <= PER_LINE) {
                    log(`%c${head}${indices.map(i => `#${i}`).join(', ')}`, tColor);
                } else {
                    const out = [head];
                    for (let i = 0; i < indices.length; i += PER_LINE) {
                        out.push('       ' + indices.slice(i, i + PER_LINE).map(x => `#${x}`).join(', '));
                    }
                    log(`%c${out.join('\n')}`, tColor);
                }
            }
        };

        window.__emergencyStopRunning = true;
        const startTime = Date.now();
        let emergencyLockSet = false;   // 记录锁是否由本次调用设置，finally 只释放自己设的锁
        try {
            log(`%c🛑 [转移停采] 准备停采所有 minority 中正在采集的 kami...`,
                'color: red; font-weight: bold; font-size: 14px;');

            // Step 1: 调辅助脚本拿分类结果
            let r;
            try {
                r = await window.__getMinorityKamis();
            } catch (e) {
                log(`❌ [转移停采] 获取 minority 数据失败: ${e?.message || e}`);
                return;
            }
            if (!r.majority) {
                log(`❌ [转移停采] 无法识别 majority（db 可能为空，先运行 syncKamiDb()）`);
                return;
            }

            log(`%c📊 [转移停采] 主流类型 = ${r.majority.toUpperCase()}（${r.majorityCount} 只），少数派 ${r.minorityKamis.length} 只`,
                'color: cyan; font-weight: bold;');
            if (r.excludedKillers.length > 0) {
                log(`🛡️ [转移停采] 杀手保护：${r.excludedKillers.length} 只杀手已自动排除`);
            }

            // Step 2: 按状态分流
            const minHarvesting = r.minorityKamis.filter(k => k.state === 'HARVESTING');
            const minResting    = r.minorityKamis.filter(k => k.state === 'RESTING');

            if (minHarvesting.length === 0) {
                log(`✅ [转移停采] 少数派中无 HARVESTING 状态，无需停采`);
                if (minResting.length > 0) {
                    log(`%c🟢 [转移清单] 已可立即转移 ${minResting.length} 只 RESTING 的 minority：`,
                        'color: green; font-weight: bold;');
                    _printByTarget(minResting, '→');
                } else {
                    log(`ℹ️ [转移停采] 少数派全部处于非 RESTING/HARVESTING 状态（DEAD/升级中等），无可操作`);
                }
                return;
            }

            log(`🔍 [转移停采] 少数派 HARVESTING ${minHarvesting.length} 只，并发查 harvestId + HP%...`);

            // Step 3: 准备 DOM HP% 读取（复用 stopCurrentRoom 同款逻辑）
            const domCards = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
            const cardByImg = new Map();
            for (const card of domCards) {
                const imgEl = card.querySelector('img[src*="/kami/"]');
                const m = imgEl?.src?.match(/kami\/(\d+)\.gif/);
                if (m) cardByImg.set(m[1], card);
            }
            const _readHpPctFromDom = (imgNumber) => {
                if (!imgNumber) return null;
                const card = cardByImg.get(String(imgNumber));
                if (!card) return null;
                const stateImg = card.querySelector('img[src*="/assets/kami_"]');   // 状态小图标，其后紧跟 HP 文本节点
                const hpDiv = stateImg?.nextElementSibling;
                const hpText = hpDiv?.textContent?.trim() || '';
                const m = hpText.match(/\((\d+)%\)/);   // HP 文本形如 "123/456 (78%)"，取括号内百分比
                return m ? parseInt(m[1], 10) : null;
            };

            // Step 4: 并发查 harvestId
            const CONC = 10;   // 详情查询并发数
            const details = new Array(minHarvesting.length);
            let nextI = 0;
            const workerLoop = async () => {
                while (true) {
                    const i = nextI++;
                    if (i >= minHarvesting.length) break;
                    const k = minHarvesting[i];
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(k.index, { harvest: true });
                        const harvestId = res?.harvest?.id || null;
                        const imgNumber = res?.image?.match(/kami\/(\d+)\.gif/)?.[1] || null;
                        const hpPct = _readHpPctFromDom(imgNumber) ?? 100;
                        details[i] = { index: k.index, harvestId, hpPct, terrain: k.terrain };
                    } catch {
                        details[i] = { index: k.index, harvestId: null, hpPct: 100, terrain: k.terrain };
                    }
                }
            };
            await Promise.all(Array.from({ length: CONC }, workerLoop));   // 启动 CONC 个 worker 并发消费队列

            // Step 5: 过滤 + 排序
            const stoppable = details.filter(d => d.harvestId);
            const missingId = details.filter(d => !d.harvestId);
            if (missingId.length > 0) {
                log(`⚠️ [转移停采] ${missingId.length} 只 kami 查不到 harvestId，跳过: ${missingId.map(d => `#${d.index}`).join(', ')}`);
            }
            if (stoppable.length === 0) {
                log(`❌ [转移停采] 全部 HARVESTING kami 都查不到 harvestId，放弃`);
                return;
            }
            stoppable.sort((a, b) => a.hpPct - b.hpPct); // HP 低的先停（与 stopCurrentRoom 一致的危险优先顺序）
            log(`🎯 [转移停采] 共 ${stoppable.length} 只 minority 待停采，HP ${stoppable[0].hpPct}%-${stoppable[stoppable.length-1].hpPct}%`);

            // Step 6: 设紧急锁
            setEmergencyLock();
            emergencyLockSet = true;

            // Step 6.5: 冷却预筛 —— 🔻SYNC→内部版[1.1.11 冷却预筛推广]：首轮发送前新查一次
            // harvest.time.last（Step 4 到这里之间可能已过去数秒~十几秒，独立重查保证判断新鲜），
            // 把仍在 180 秒操作冷却内的 kami 从首轮候选中剔除——此刻发停采 tx 必败。跳过只是
            // 省一次必败 tx，不是永久拉黑：这些 kami 仍是 minority 里 HARVESTING 状态，冷却
            // 解除后用户下次手动调用 stopMinorityForTransfer()（该命令本就设计为"失败后可
            // 重复调用，只处理仍在采集的"）会重新捕获停采。
            const cdCheck = new Array(stoppable.length);
            {
                const CONC2 = 10;
                let nextJ = 0;
                const cdWorker = async () => {
                    while (true) {
                        const j = nextJ++;
                        if (j >= stoppable.length) break;
                        const d = stoppable[j];
                        try {
                            const res = await window.network.explorer.kamis.getByIndex(d.index, { harvest: true });
                            const timeLast = res?.harvest?.time?.last;
                            cdCheck[j] = { ...d, timeLast, remain: _cooldownRemainSec(timeLast) };
                        } catch (_) {
                            cdCheck[j] = { ...d, timeLast: null, remain: 0 };  // 查询失败按无冷却处理，回落旧行为
                        }
                    }
                };
                await Promise.all(Array.from({ length: CONC2 }, cdWorker));
            }
            const coolingNow = cdCheck.filter(d => d.remain > 0);
            const readyNow = cdCheck.filter(d => d.remain <= 0);
            if (coolingNow.length > 0) {
                // 逐只日志用于少量场景；本轮冷却剔除 >8 只时改为"汇总 + 前5只样例"防刷屏
                const showN = coolingNow.length > 8 ? 5 : coolingNow.length;
                for (const d of coolingNow.slice(0, showN)) {
                    const age = d.timeLast ? Math.round(Date.now() / 1000 - d.timeLast) : 'N/A';
                    const clearAt = new Date(Date.now() + d.remain * 1000).toLocaleTimeString();  // 记录首轮预测解除时刻，供事后核对
                    log(`⏳ [转移停采/冷却预筛] #${d.index} 冷却剩余 ${d.remain}s（time.last age=${age}s，预计 ${clearAt} 解除），本轮跳过`);
                }
                if (coolingNow.length > showN) {
                    log(`⏳ [转移停采/冷却预筛] 另有 ${coolingNow.length - showN} 只同样在冷却中（样例）: ${coolingNow.slice(showN).map(d => `#${d.index}(剩${d.remain}s)`).join(', ')}`);
                }
                log(`📊 [转移停采/冷却预筛] 首轮 ${cdCheck.length} 只候选，${coolingNow.length} 只在冷却中已剔除（本轮不发tx，不拉黑，需再次手动调用 stopMinorityForTransfer() 重试）`);
            }
            if (readyNow.length === 0) {
                log(`⭐️ [转移停采] 全部候选当前都在冷却中，本次无可停采，请稍后重新调用 stopMinorityForTransfer()`);
                return;
            }

            // Step 7: 第一轮 — 全部发 tx，不假设成功（链上核查后才算）
            // 简化：批内不再做"发完立即等5秒重试"，统一在 Step 8 等 cooldown 自然解除后再处理
            const firstBatches = chunkRandom(readyNow, 6, 10);
            log(`%c🚀 [转移停采/第一轮] 共 ${readyNow.length} 只待停采，分 ${firstBatches.length} 批发送...`,
                'color: cyan; font-weight: bold;');
            for (let bi = 0; bi < firstBatches.length; bi++) {
                const batch = firstBatches[bi];
                const harvestIds = batch.map(d => d.harvestId);
                const fmt = batch.map(d => `#${d.index}(→${d.terrain.toUpperCase()})`).join(',');
                log(`📤 [转移停采/一轮 批 ${bi+1}/${firstBatches.length}] 发送 ${batch.length} 个: ${fmt}`);
                await _allowFailureStop(harvestIds, fmt);
                if (bi < firstBatches.length - 1) await delay(6500);   // 批间隔 6.5 秒，防 nonce 冲突/限流
            }

            // Step 8: 等 60 秒让链上 cooldown 自然解除 + 核查真实状态
            // 【v1.1.11 更正】链上操作冷却实测 180 秒（0708 定案），非旧估计的"最长约3分钟"；
            // 60 秒 < 180 秒，第二轮等待若首轮 tx 距今不足 180 秒，冷却仍可能未解除——已在
            // Step 6.5 预筛剔除已知冷却中的候选降低本轮再撞冷却的概率，未覆盖到的残余失败
            // 靠 Step 10 的失败提示引导用户下次手动调用兜底
            const COOLDOWN_WAIT_MS = 60 * 1000;   // 第一轮 tx 后等 60 秒再核查
            log(`%c⏳ [转移停采] 第一轮 tx 发完，等 60 秒让链上 cooldown 解除后核查真实状态...`,
                'color: orange;');
            await delay(COOLDOWN_WAIT_MS);

            const stillH = [];
            for (const d of readyNow) {
                try {
                    const res = await window.network.explorer.kamis.getByIndex(d.index, { harvest: true });
                    if (String(res?.state || '').toUpperCase() === 'HARVESTING') {
                        const freshHid = res?.harvest?.id || d.harvestId;
                        if (freshHid) stillH.push({ ...d, harvestId: freshHid });
                    }
                } catch (_) {
                    stillH.push(d);  // 查询失败保守保留进二轮
                }
            }
            const firstRoundOk = readyNow.length - stillH.length;
            log(`%c📊 [转移停采/一轮核查] 已停采 ${firstRoundOk}/${readyNow.length}${stillH.length > 0 ? `，剩 ${stillH.length} 只需二轮重试` : ''}`,
                'color: cyan; font-weight: bold;');

            // Step 9: 第二轮 — 仅对仍 HARVESTING 的批量重试一次
            const finalFailed = [];
            if (stillH.length > 0) {
                log(`%c🔄 [转移停采/第二轮] 重试 ${stillH.length} 只（链上 cooldown 应已解除）...`,
                    'color: orange; font-weight: bold;');
                const secondBatches = chunkRandom(stillH, 6, 10);
                for (let bi = 0; bi < secondBatches.length; bi++) {
                    const batch = secondBatches[bi];
                    const ids = batch.map(d => d.harvestId);
                    const fmt = batch.map(d => `#${d.index}`).join(',');
                    log(`📤 [转移停采/二轮 批 ${bi+1}/${secondBatches.length}] 重试 ${batch.length} 只: ${fmt}`);
                    await _allowFailureStop(ids, fmt);
                    if (bi < secondBatches.length - 1) await delay(6500);   // 批间隔 6.5 秒，防 nonce 冲突/限流
                }

                // 等 8 秒让链上状态同步，再做最终核查
                log(`%c⏳ [转移停采] 第二轮 tx 发完，等 8 秒后最终核查...`, 'color: orange;');
                await delay(8000);
                for (const d of stillH) {
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(d.index, { harvest: true });
                        if (String(res?.state || '').toUpperCase() === 'HARVESTING') {
                            finalFailed.push(d);
                        }
                    } catch (_) {
                        finalFailed.push(d);  // 查询失败保守计为失败
                    }
                }
            }

            // Step 10: 最终汇报（基于链上真实状态）+ 失败提示 + 可转移清单
            const secondRoundOk = stillH.length - finalFailed.length;
            const totalOk = firstRoundOk + secondRoundOk;
            const totalFail = finalFailed.length;
            const elapsedMs = Date.now() - startTime;

            const okSummary = stillH.length > 0
                ? `第一轮 ${firstRoundOk} + 第二轮 ${secondRoundOk} = ${totalOk}/${readyNow.length}`
                : `一轮全部成功 ${totalOk}/${readyNow.length}`;
            log(`%c✅ [转移停采] 完成！${okSummary}${totalFail > 0 ? `，失败 ${totalFail}` : ''}，耗时 ${_fmtMinSec(elapsedMs)}`,
                'color: green; font-weight: bold; font-size: 14px;');
            _pauseDeployAfterStopAll('转移停采');   // 转移窗口：10分钟内不自动部署，防止刚停的 kami 被重新部署回去

            if (totalFail > 0) {
                // 【v1.1.11 更正】措辞同步改为实测的180秒冷却常量，不再用旧估计的"cooldown > 3 分钟"
                log(`%c⚠️ [转移停采/失败提示] 两轮重试后仍有 ${totalFail} 只未停采（可能仍在180秒操作冷却内、链上拥堵或其他问题）：`,
                    'color: red; font-weight: bold; font-size: 14px;');
                const failedFmt = finalFailed.map(d => `#${d.index}(→${d.terrain.toUpperCase()})`);
                const PER_LINE = 25;
                const failLines = [];
                for (let i = 0; i < failedFmt.length; i += PER_LINE) {
                    failLines.push('        ' + failedFmt.slice(i, i + PER_LINE).join(', '));
                }
                log(failLines.join('\n'));
                log(`%c   💡 建议：等 2-3 分钟后再次手动调用 stopMinorityForTransfer()，未停的会被自动重试`,
                    'color: red;');
            }

            // 可转移清单：本来 RESTING 的 + 真正停采成功的（基于链上核查，不含失败的）
            // 【v1.1.11】这里必须用 readyNow（本轮实际发过 tx 的）而不是原始 stoppable——
            // 冷却预筛剔除的 coolingNow 从未发过 tx，仍在 HARVESTING，若误用 stoppable 会把
            // 这些其实还在采集的 kami 也当"停采成功"列进可转移清单（SYNC 锚点见 Step 6.5）
            const successfullyStopped = readyNow.filter(d => !finalFailed.some(f => f.index === d.index));
            const justStopped = successfullyStopped
                .map(d => r.minorityKamis.find(k => k.index === d.index))
                .filter(Boolean);
            const transferable = [...minResting, ...justStopped];
            if (transferable.length > 0) {
                log(`%c📦 [转移清单] 共 ${transferable.length} 只 minority 现可手动转移到对应账户：`,
                    'color: cyan; font-weight: bold; font-size: 14px;');
                _printByTarget(transferable, '→');
                log(`%c💡 提示：等 ~30 秒让链上状态同步，然后用游戏内转移功能批量发送给目标账户`,
                    'color: cyan;');
            }
        } catch (e) {
            log(`❌ [转移停采] 异常: ${e?.message || e}`);
        } finally {
            if (emergencyLockSet) releaseEmergencyLock();
            window.__emergencyStopRunning = false;
        }
    };

    // ============================================================
    // 【板块：紧急停采主流程 emergencyStopHarvest】
    // ------------------------------------------------------------
    // ▍功能：扫描页面上所有采集中的 kami，找出 HP 已跌破/逼近停采线的个体
    //   （delta = 当前 HP% 与停采线的差值，负值表示已跌破，越负越危险），
    //   按"凑批省 gas"策略批量发送停采交易；对 STARVING（HP 归零饿死态）
    //   的 kami 先喂食恢复 HP 再停采，防止被杀手清算。
    // ▍触发时机：由脚本内部的危险监控逻辑在发现 urgent kami 时调用；
    //   同一时刻只允许一个实例运行（防重入标记见"边界与保护"）。
    // ▍依赖：
    //   - DOM：_emergencyScanKamis() 从页面 kami 卡片解析 HP/状态文本，
    //     产出 stopList（含 dbIndex / kamiId / harvestId / delta / isStarving）
    //   - 链上 API：window.network.explorer.kamis.getByIndex(dbIndex,
    //     {harvest:true}) —— 链上真值查询（state、harvest.id、harvest.node.index）
    //   - TX 双锁接口：setEmergencyLock() / releaseEmergencyLock() /
    //     waitForNormalLockRelease() / window.__txNormalLock
    //   - 全局标记：window.__emergencyStopRunning（防重入）、
    //     window.__kamiOperationInProgress（供其他模块避让）
    //   - 内部函数：_emergencyPreCheck（链上预检）、_emergencySendBatch（批量
    //     AllowFailure 停采）、_emergencyQueryStatus（轮后状态确认）、
    //     _allowFailureStop（单只停采）、_starvingFeedKamis（饿死喂食）、
    //     recordAction（操作记账）、chunkRandom（随机分批）、delay、_fmtMinSec
    //   - 配置：EMERGENCY_CONFIG（各危险阈值与等待时长常量）
    //   - localStorage：本板块不直接读写
    // ▍核心流程：
    //   1) DOM 扫描得 stopList，空则直接返回
    //   2) 防误判熔断：首扫 STARVING 数 > SUSPICIOUS_STARVING 时等 5 秒重扫
    //   3) 凑批决策：有危险 kami 立即发；数量 ≥ TARGET_BATCH_MIN 立即发；
    //      否则跳过本轮等积累（此时不加锁、不发任何 tx）
    //   4) 统计并打印危险分级（极危/高危/危险/一般，仅日志用途）
    //   5) 链上预检 _emergencyPreCheck：剔除已死/已停/黑名单/异地块 kami
    //   6) 确认确有停采目标后才设置紧急锁，并等普通锁释放（上限 30 秒）
    //   7) STARVING 的 kami 先批量喂食（喂完即可停采，无需等待冷却）
    //   8) 喂食后二次预检（期间链上状态可能已变化/用户已手动处理）
    //   9) 按 delta 升序排序（最危险的进第一批），随机 6–10 只/批；v1.1.12 起
    //      本轮内所有批背靠背只发送不等确认（_emergencySendOnly），发送完
    //      再并行确认（Promise.allSettled(_emergencyConfirmBatch)）——发送
    //      与确认解耦，不再"发一批等一批"；确认阶段按每只均摊 gas 分三级
    //      裁决（全执行/全revert/混合，见 EMERGENCY_CONFIG.GAS_*），全执行
    //      直接采信 gas 回执不等索引器，revert/混合才逐只 estimateGas 裁决；
    //      第一批失败/有失败时走"首批强化"重试（_emergencyRetryBatchGated
    //      批量重试 → 仍未停 _emergencySingleRetryGated 逐只单发），重试/
    //      单发前一律先过 estimateGas 闸门，不通过的按链上 state 区分
    //      "已停(索引滞后)"与"疑似卡链"分别记账（见 Change C 拉黑机制说明）
    //   10) 每轮动态等待后查链上真实状态，未停的进下一轮，至多 MAX_ROUNDS 轮；
    //       v1.1.12 起每轮开始前还会检查 180s 调用硬上限与熔断标记
    //       （__stopCircuitBroken，连续 CIRCUIT_BREAK_STREAK 批全revert 触发），
    //       命中任一条件立即收尾，剩余交下一次调用
    //   11) 轮次结束后统一处理因操作冷却（cooldown）推迟的 kami：
    //       批量重试 → 仍失败逐只降级单发；数量少且全部低危则推迟到下轮合批
    //   12) finally 中释放紧急锁、清运行标记（无论成功失败）
    // ▍边界与保护：
    //   - 防重入：window.__emergencyStopRunning 为 true 时直接跳过本次调用
    //   - 延迟加锁：扫描与预检阶段全程只读、不加锁，确认有停采目标后才
    //     setEmergencyLock()，把紧急锁的占用时间压到最短
    //   - 锁协作：加锁后若普通锁仍被占用，等待其完成当前 tx（上限 30 秒），
    //     普通操作检测到紧急锁会主动让路，避免 nonce 冲突
    //   - 误判熔断：大量 STARVING 通常是页面未加载完（HP 文本解析成 0%），
    //     等 5 秒重扫再定，避免误停一大批健康 kami
    //   - 凑批门槛：无危险且不够 TARGET_BATCH_MIN 只时跳过本轮——小批量
    //     停采的固定 gas 摊不薄，等积累后合批更省，且让现有 urgent 多采几分钟
    //   - 首批强化：第一批部分失败 → 刷新链上 harvestId 后批量重试 → 仍未停
    //     逐只单发；整批失败（未上链）→ 只重试高危（delta ≤ HIGH_RISK_DELTA）
    //   - cooldown 收容：因冷却失败的 kami 按 dbIndex 去重收集，轮后先刷新
    //     链上状态剔除已自然停采的，再批量重试、降级单发；高危/STARVING 绝不推迟
    //   - 轮次熔断：MAX_ROUNDS 限制总轮数，防止无限循环
    //   - finally 兜底：仅当本次确实设置过紧急锁（emergencyLockSet 为 true）
    //     才释放，避免误释放其他流程持有的锁；运行标记无条件清除
    // ▍可调参数：
    //   - SUSPICIOUS_STARVING = 10 — 首扫 STARVING 超过此数触发 5 秒重扫；
    //     调小更容易触发重扫（更保守），调大在真实大规模饿死时响应更快但误判风险升高
    //   - TARGET_BATCH_MIN = 6 — 凑批门槛；调小停得更早更安全但 tx 更碎、
    //     gas 浪费大；调大更省 gas 但 kami 在停采线附近停留更久
    //   - EMERGENCY_DANGER_DELTA = -1 — 危险判定线：任一 kami delta ≤ 此值
    //     立即发批不等凑批；数值向 0 调更激进（更容易立即触发批量停采）
    //   - COOLDOWN_DEFER_MIN = 3 — cooldown 重试队列小于此数且全部低危时推迟
    //     到下一轮合批；调大更省 gas 但推迟范围更宽
    //   - chunkRandom(remaining, 6, 10) — 每批随机 6–10 只；批越大单只摊到的
    //     gas 越低，但 gas 波动时整批失败的连带损失也越大
    //   - EMERGENCY_CONFIG.CRITICAL_DELTA / HIGH_RISK_DELTA / DANGER_DELTA —
    //     危险分级阈值（依次更接近安全线）；HIGH_RISK_DELTA 还决定"整批失败
    //     只重试高危"与"cooldown 可否推迟"两处行为
    //   - EMERGENCY_CONFIG.MAX_ROUNDS / BATCH_INTERVAL_MS / BASE_WAIT_MS /
    //     PER_BATCH_WAIT_MS / ROUND_INTERVAL_MS — 轮数上限 / 批间隔 /
    //     动态等待基础值 / 每批追加等待 / 轮间隔
    //   - 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决] 新增：
    //     EMERGENCY_CONFIG.GAS_FULL_EXEC_PER_KAMI / GAS_FULL_REVERT_PER_KAMI —
    //     gas 判级两条阈值线；SEND_STAGGER_MIN_MS/MAX_MS — 同轮批间发送随机
    //     间隔；INVOCATION_HARD_CAP_MS = 180000 — 单次调用硬上限；
    //     CIRCUIT_BREAK_STREAK = 2 — 连续全revert批熔断阈值；
    //     STOP_BLOCK_THRESHOLD（沿用既有拉黑阈值）— 现同时服务于"疑似卡链"
    //     跨调用累计拉黑
    // ▍相关控制台命令：无独立命令（由脚本内部危险监控自动调用）
    // ============================================================
    /**
     * 紧急停采主函数 - 预检过滤 + 凑批决策 + 多轮批量停采 + 动态等待
     * @param {{trimTo?: number}} [opts] 可选；仅硬触发路径传 {trimTo:25} 在 stopList 构建后修剪到目标数。
     *   其它调用方（杀手监控/危险HP/手动）不传参 → 行为逐字节不变（无修剪）。
     */
    async function emergencyStopHarvest(opts) {
        if (window.__emergencyStopRunning) {
            log('⚠️ [紧急停采] 已在运行中，跳过');
            return;
        }
        window.__emergencyStopRunning = true;
        try { if (window.__evalFrontendFrozen) window.__evalFrontendFrozen(); } catch (e) {}   // [②v1.1.25] 刷新前端冻结信号，供 frozen 门闩读
        window.__kamiOperationInProgress = true;

        // 可选修剪目标：仅 STOP_TRIGGER 硬触发路径传入；默认 null = 不修剪
        const trimTo = (opts && typeof opts.trimTo === 'number') ? opts.trimTo : null;

        const startTime = Date.now();
        log(`%c🚨 [紧急停采] 开始...`, 'color: red; font-weight: bold; font-size: 14px;');

        // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
        // 每次调用重置调用级去重/熔断状态（见状态声明处的板块说明）：
        // __stopInvocationId 自增让本次调用的失败记账与上次调用区分开，
        // 熔断计数/标记、疑似卡链名单也只在单次调用范围内生效
        __stopInvocationId++;
        __stopConsecutiveRevertBatches = 0;
        __stopCircuitBroken = false;
        __stopStuckThisInvocation.clear();
        // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
        // 改动B/D新增状态同样只在单次调用范围内生效，一并清空
        __stopConfirmedThisInvocation.clear();
        __stopCooldownDeferredThisInvocation.clear();
        __pendingVerifyBatchCount = 0;   // 🔻SYNC→内部版[1.1.17 可观测性批次] C4：本次调用 pendingVerify 批数清零
        __stopChanFallbackCount = 0;     // 🔻SYNC→内部版[1.1.19 停采通道统一] D3：本次调用 mud→raw 跌落计数清零
        __stopTxConfirmMsList = [];      // 🔻SYNC→内部版[1.1.22 退避复读] C4：本次调用 tx 确认耗时样本清空（__stopPendingVerify 跨调用存续，此处不清）
        __stopIndexLagMsList = [];       // 🔻SYNC→内部版[1.1.22 退避复读] C4：本次调用索引器滞后样本清空
        __stopRevertReasonSeen.clear(); __stopMassLagLogged = false;  // 🔻SYNC→内部版[1.1.22 revert原因观测] C6：本次调用 revert 原因去重集清空

        // 标记是否设置了紧急锁（用于finally中判断是否需要释放）
        let emergencyLockSet = false;

        try {
            // Step 1: DOM扫描（先扫描，不设置锁）
            let stopList = _emergencyScanKamis();
            if (stopList.length === 0) {
                log('✅ [紧急停采] 没有需要停采的kami');
                return;
            }

            // 大量 STARVING 通常是网页没加载好（HP 文本解析异常为 0%），等待 5 秒重扫避免误停大批健康 kami
            const SUSPICIOUS_STARVING = 10;
            const firstStarving = stopList.filter(x => x.isStarving).length;
            if (firstStarving > SUSPICIOUS_STARVING) {
                log(`%c⚠️ [紧急停采] 首次扫描发现 ${firstStarving} 个 STARVING，疑似网页未加载完整，等待 5 秒后重扫...`,
                    'color: orange; font-weight: bold;');
                await delay(5000);
                const stopList2 = _emergencyScanKamis();
                const secondStarving = stopList2.filter(x => x.isStarving).length;
                if (secondStarving < firstStarving) {
                    log(`%c✅ [紧急停采] 重扫后 STARVING 从 ${firstStarving} 降到 ${secondStarving}，以最新结果为准`,
                        'color: green; font-weight: bold;');
                } else {
                    log(`⚠️ [紧急停采] 重扫后 STARVING 仍为 ${secondStarving}，可能确实发生大规模饿死，继续处理`);
                }
                stopList = stopList2;
                if (stopList.length === 0) {
                    log('✅ [紧急停采] 重扫后没有需要停采的kami');
                    return;
                }
            }

            // 🔻SYNC→内部版[1.2.1 停采空转闭环] C1：剔除已在退避确认队列的成员——它们已发过停采、正在等索引追平，
            //   重发必然对已停 kami revert 白烧 gas（0711 实测 24 批浪费全源于此）。真没停的会被 C2 estimateGas 裁决快速释放回候选。
            try {
                const _skipIdx = [];
                stopList = stopList.filter(x => {
                    const inPV = x.kamiId && __stopPendingVerify.has(x.kamiId);
                    if (inPV) _skipIdx.push('#' + x.dbIndex);
                    return !inPV;
                });
                if (_skipIdx.length > 0) {
                    log(`   ⏭️ [停采诊断] ${_skipIdx.length} 只已在退避确认队列(发过停采待索引追平)，本轮跳过不重发：${_skipIdx.slice(0, 12).join(',')}${_skipIdx.length > 12 ? '…' : ''}（省重发gas）`);
                }
                if (stopList.length === 0) { log('✅ [紧急停采] 候选全部在退避确认队列中，本轮无需重发'); return; }
            } catch (_) {}

            // 凑批门槛 / 危险判定线（凑批与cooldown补停用；1.1.24起修剪不再用危险线）
            const TARGET_BATCH_MIN = 6;
            const EMERGENCY_DANGER_DELTA = -1;

            // 🔻SYNC→内部版[1.1.24 修剪语义修正] 可选修剪（仅硬触发路径 opts.trimTo）：扫描完成后、凑批决策前。
            // ▍语义（用户 0710 定案）：本触发器**没有杀手威胁**，纯粹是数量管理——贪婪模式下 Δ≤-1 本来
            //   就可以继续采（那正是贪婪的意义），不做"危险级必停"的紧急处理（杀手/紧急路径不走此分支，不受影响）。
            //   规则=严格修剪：只停超额数（nCand−trimTo），停到剩 trimTo 只继续采。
            //   挑选顺序：① STARVING（0HP 已不产出，停下喂食救援，且优先占用超额名额）② 其余按 delta 升序（最接近线的先停）。
            //   仅当 STARVING 数量 > 超额时才会停超过超额数（救援优先），此时保留数 < trimTo 属预期。
            if (trimTo != null && stopList.length > trimTo) {
                const nCand = stopList.length;
                const excess = nCand - trimTo;                       // 严格停数（修剪到 trimTo）
                const starving = stopList.filter(x => x.isStarving); // 救援组：必停（不占健康 kami 的采集时长）
                const normals = stopList.filter(x => !x.isStarving);
                normals.sort((a, b) => a.delta - b.delta);           // 离停采线最近（越负越低血）先停
                const stopTarget = Math.max(excess, starving.length);
                const normalStop = normals.slice(0, Math.max(0, stopTarget - starving.length));
                stopList = starving.concat(normalStop);
                const kept = nCand - stopList.length;
                log(`✂️ [批量修剪] 候选${nCand}只→停${stopList.length}只(STARVING=${starving.length} urgent=${normalStop.length})，实际保留${kept}只继续采(目标${trimTo})`);
            }

            // 凑批决策："等"模式——不够凑批门槛且无危险就跳过本轮。
            // 不拓宽 delta 把中危 kami 拉下水凑数：那样会过度停采，
            // 让本可继续采集的健康 kami 白白损失采集时长。
            //
            // 适用范围：本脚本面向账户 kami 数 > 7 的"大账户"场景设计；
            //          少于 7 只的小账户可能等不到 ≥6 凑批 → 启动时会红字提示
            //
            // 为什么用"等"模式：批量停采的固定 gas 只有摊到足够多的 kami 上
            // 才划算，小批量白付固定开销；不危险时跳过本轮，让 urgent 自然
            // 积累到门槛再一次性发，既省 gas 又让现有 urgent 多采几分钟。
            //
            // 决策树：
            //   1. hasDangerous = 任一 isStarving 或 delta ≤ -1（EMERGENCY_DANGER_DELTA，当前 -1）
            //   2. if (hasDangerous || stopList.length ≥ TARGET_BATCH_MIN) → 进 batch 流程
            //      else → 跳过本轮等下一轮积累（N=1~5 统一走此"等"逻辑）

            if (stopList.length > 0) {
                const hasDangerous = stopList.some(x => x.isStarving || x.delta <= EMERGENCY_DANGER_DELTA);
                const enoughForBatch = stopList.length >= TARGET_BATCH_MIN;

                if (hasDangerous) {
                    // 危险护栏：有任何危险 kami → 立刻批量（不等）
                    const dangerCount = stopList.filter(x => x.isStarving || x.delta <= EMERGENCY_DANGER_DELTA).length;
                    log(`%c🚨 [紧急停采/凑批] ${stopList.length} 只 urgent 中含 ${dangerCount} 只危险（starving 或 delta ≤ ${EMERGENCY_DANGER_DELTA}），立刻批量停采（不等凑批）`,
                        'color: red; font-weight: bold;');
                    // stopList 保持原样（urgent only，不再拉中危）
                } else if (enoughForBatch) {
                    // 够批量凑批门槛 → 立刻批量
                    log(`%c💡 [紧急停采/凑批] ${stopList.length} 只 urgent ≥ 凑批门槛 ${TARGET_BATCH_MIN}，批量停采（每只 ~1.5M gas）`,
                        'color: cyan;');
                } else {
                    // 没危险 + 不够凑批门槛 → 跳过本轮等积累
                    // 浮点除法可能产生 -0.8100000000000023 这类长小数，统一 toFixed(2) 显示
                    const fmt = n => Number.isFinite(n) ? n.toFixed(2) : 'N/A';
                    const minDelta = fmt(stopList[0]?.delta);
                    const maxDelta = fmt(stopList[stopList.length - 1]?.delta);
                    log(`%c⏸️ [紧急停采/凑批] 仅 ${stopList.length} 只 urgent (Δ=${minDelta}%~${maxDelta}%) < 凑批门槛 ${TARGET_BATCH_MIN}，且无危险 kami`,
                        'color: cyan;');
                    log(`%c   跳过本轮停采 → 等下一轮积累到 ${TARGET_BATCH_MIN} 只再批量发，省 gas + 让现有 urgent 多采几分钟`,
                        'color: cyan;');
                    log(`%c   （若你账户 kami ≤ 7，此策略可能等不到 6 只 → 启动 banner 已提示，请考虑切回手动模式）`,
                        'color: #888;');
                    return;  // 不设置紧急锁，不停采，等下一轮
                }
            }

            log(`📊 [紧急停采] DOM扫描发现 ${stopList.length} 个需要停采`);

            // Step 2: 统计危险等级（按 delta 落入的区间分四级，仅影响日志展示，不影响停采行为）
            const critical = stopList.filter(x => x.delta <= EMERGENCY_CONFIG.CRITICAL_DELTA).length;
            const highRisk = stopList.filter(x => x.delta > EMERGENCY_CONFIG.CRITICAL_DELTA && x.delta <= EMERGENCY_CONFIG.HIGH_RISK_DELTA).length;
            const danger = stopList.filter(x => x.delta > EMERGENCY_CONFIG.HIGH_RISK_DELTA && x.delta <= EMERGENCY_CONFIG.DANGER_DELTA).length;
            const normal = stopList.filter(x => x.delta > EMERGENCY_CONFIG.DANGER_DELTA).length;
            log(`   🔴极危:${critical} 🟠高危:${highRisk} 🟡危险:${danger} ⚪一般:${normal}`);

            // Step 3: 预检过滤 - 查链上状态，排除已死/已停（不设置锁）
            log(`🔍 [紧急停采] 预检链上状态...`);
            const { validList, filteredCount } = await _emergencyPreCheck(stopList);

            if (filteredCount > 0) {
                log(`✅ [紧急停采] 预检过滤 ${filteredCount} 个（已死/已停），剩余 ${validList.length} 个`);
            }

            if (validList.length === 0) {
                log('✅ [紧急停采] 预检后无需停采');
                return;
            }

            // 走到这里说明前面的凑批决策已放行（有危险 kami 或数量达标）：
            //   - N=1 且不危险的情况在凑批决策处已 return，不会到达此处
            //   - 罕见竞态（扫描时 6 只、预检后仅剩 1 只）→ 允许单只停采，
            //     单只 ~2.43M gas 的浪费在此场景下可接受（保命优先）

            // Step 4: 确认有需要停采的kami，才设置紧急锁
            setEmergencyLock();
            emergencyLockSet = true;

            // 等待普通锁释放（普通操作会检测到紧急锁后主动停止）
            if (window.__txNormalLock) {
                log(`[TX锁] ⏳ 等待普通操作 [${window.__txNormalLock.script}/${window.__txNormalLock.operation}] 完成当前tx...`);
                await waitForNormalLockRelease(30000);
            }

            // Step 4.5: 处理STARVING饿死的kami——先喂食，喂完直接进入停采（无需等待冷却）
            const starvingList = validList.filter(x => x.isStarving);
            if (starvingList.length > 0) {
                log(`%c🍖 [紧急停采/饿死救援] 发现 ${starvingList.length} 个STARVING的kami，需先喂食！`,
                    'color: orange; font-weight: bold;');

                // 使用公共喂食函数，支持11种HP恢复食物（按库存自动选择）
                const fedCount = await _starvingFeedKamis(starvingList, '紧急/饿死救援');

                if (fedCount > 0) {
                    log(`✅ [饿死救援] 已喂食 ${fedCount} 个kami，直接进入停采流程`);
                }
            }

            // Step 4.6: 喂食后重新预检链上状态，确认哪些kami仍需停采（用户可能已手动停采）
            log(`🔍 [紧急停采] 重新预检链上状态（喂食后/停采前）...`);
            const recheck = await _emergencyPreCheck(validList);
            if (recheck.filteredCount > 0) {
                log(`✅ [紧急停采] 重新预检过滤 ${recheck.filteredCount} 个（已停/已死/用户手动处理），剩余 ${recheck.validList.length} 个`);
            }
            if (recheck.validList.length === 0) {
                log('✅ [紧急停采] 重新预检后无需停采');
                const totalTime = Date.now() - startTime;
                log(`📊 [紧急停采] 完成，总耗时 ${totalTime}ms 即 ${_fmtMinSec(totalTime)}`);
                return;
            }

            // Step 5: 基于状态的多轮重试 + 动态等待
            // 按 delta 升序排序：最危险的排最前，进第一批优先处理
            recheck.validList.sort((a, b) => a.delta - b.delta);

            // 收集因操作冷却（cooldown）暂时无法停采的 kami，在所有轮次结束后统一重试
            // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
            // 改动D：直接引用模块级 __stopCooldownDeferredThisInvocation（而非
            // 新建局部 Map），使 classify 阶段(_emergencyClassifyEstimateBlocked/
            // _emergencyCreditBlocked，定义在本函数作用域之外)发现的"estimateGas
            // revert但仍在冷却期"的 kami 能汇入同一个队列，被下方 cooldown 收尾
            // 统一处理；已在函数开头 clear() 过，等价于每次调用一个新 Map。
            const cooldownDeferred = __stopCooldownDeferredThisInvocation; // dbIndex -> item，去重用

            // 【v1.1.10 冷却公式预筛】借用 _emergencyPreCheck 已读到的 harvest.time.last，
            // 组批前先把仍在180s操作冷却内的kami挑出来直接归入cooldownDeferred（不进发送批，
            // 发了也必败，省一次注定失败的tx）；timeLast读不到时remain=0，回落原有行为
            let remaining = [];
            for (const item of recheck.validList) {
                const remain = _cooldownRemainSec(item.timeLast);
                if (remain > 0) {
                    log(`⏳ [紧急停采/冷却预筛] #${item.dbIndex} 冷却中(剩余${remain}s)，本批不发（tx必败省gas）`);
                    cooldownDeferred.set(item.dbIndex, item);
                } else {
                    remaining.push(item);
                }
            }
            let round = 1;

            while (remaining.length > 0 && round <= EMERGENCY_CONFIG.MAX_ROUNDS) {
                // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                // 整次调用硬上限（Change D）：到点强制收尾，让 finally 释放紧急锁，
                // 未完成的剩余交下一次 runAutomation 触发的新一轮 emergencyStopHarvest
                const elapsedSoFar = Date.now() - startTime;
                if (elapsedSoFar > EMERGENCY_CONFIG.INVOCATION_HARD_CAP_MS) {
                    log(`%c⏰ [停采诊断] 本次调用已耗时 ${elapsedSoFar}ms，达到硬上限 ${EMERGENCY_CONFIG.INVOCATION_HARD_CAP_MS}ms，强制收尾（剩余 ${remaining.length} 个交下一轮）`,
                        'color: red; font-weight: bold;');
                    break;
                }
                // 熔断生效：本次调用不再发新一轮（Change D）
                if (__stopCircuitBroken) {
                    log(`%c🛑 [停采诊断] 熔断生效中，本次调用不再发新一轮，剩余 ${remaining.length} 个交下一轮`,
                        'color: red; font-weight: bold;');
                    break;
                }
                // 疑似卡链过滤：本次调用内已判定卡链的 kami 不再进入任何一批发送（拉黑机制修正 Change C 附带要求）
                if (__stopStuckThisInvocation.size > 0) {
                    const beforeLen = remaining.length;
                    remaining = remaining.filter(x => !__stopStuckThisInvocation.has(x.kamiId));
                    const filteredStuck = beforeLen - remaining.length;
                    if (filteredStuck > 0) {
                        log(`   ⏭️ [停采诊断] ${filteredStuck} 个本次调用内已判定疑似卡链，跳过不再发tx（交黑名单机制处理）`);
                    }
                    if (remaining.length === 0) break;
                }

                // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
                // 改动B · 下轮发送前门禁：round>1 时，remaining 里除了"确实还在
                // 采集需要重发"的，还可能混入本轮内某批(i>0，未走首批强化/整批
                // 失败重试的估算门禁)已经 revert 但当时没被单独裁决的 kami——
                // 旧代码这里直接拿 remaining 重新组批盲发，等于对着"其实已停/
                // 已在冷却/真卡链"的 kami 再发一次 tx。这里先过一遍 estimateGas
                // 闸门，通过的才进入本轮真实发送批次，不通过的交
                // _emergencyCreditBlocked 按"已停/冷却/卡链"三分类记账，不盲发。
                // round===1 的 remaining 刚出自 recheck+冷却预筛（Step 5之前），
                // 链上状态足够新鲜，跳过省一轮 RPC。
                if (round > 1 && remaining.length > 0) {
                    const { passItems: gatedRemaining, blockedItems: gateBlockedRemaining } =
                        await _emergencyGateByEstimate(remaining, `第${round}轮门禁`);
                    if (gateBlockedRemaining.length > 0) {
                        log(`   🚧 [停采诊断/第${round}轮门禁] remaining ${remaining.length}只中 ${gateBlockedRemaining.length}只 estimateGas 不通过，不发tx转分类，实际发送 ${gatedRemaining.length}只`);
                        await _emergencyCreditBlocked(gateBlockedRemaining, `第${round}轮门禁`);
                    }
                    remaining = gatedRemaining;
                    if (remaining.length === 0) {
                        log(`   ✅ [停采诊断/第${round}轮门禁] 全部已在门禁阶段判定完成，本轮无需发送`);
                        break;
                    }
                }

                log(`📦 [紧急停采] 第${round}轮: ${remaining.length} 个待处理`);

                // 每批随机 6-10 只：gas 飙升时大批量交易整体失败率更高，
                // 小批 + 随机批量能降低整批被拒的连带损失
                const batches = chunkRandom(remaining, 6, 10);

                // ---- 发送阶段（Change A）：本轮所有批背靠背连续发出，只广播不等确认，
                //      批间留 800~1500ms 随机间隔防 RPC 限流；熔断中途触发则提前停止发送 ----
                const sentBatches = [];
                for (let i = 0; i < batches.length; i++) {
                    if (__stopCircuitBroken) {
                        log(`   ⏭️ [停采诊断] 熔断中，跳过批${i + 1}/${batches.length}发送`);
                        break;
                    }
                    const batch = batches[i];
                    const minDelta = Math.min(...batch.map(x => x.delta));
                    let icon = minDelta <= EMERGENCY_CONFIG.CRITICAL_DELTA ? '🔴' :
                               minDelta <= EMERGENCY_CONFIG.HIGH_RISK_DELTA ? '🟠' :
                               minDelta <= EMERGENCY_CONFIG.DANGER_DELTA ? '🟡' : '⚪';
                    const batchIndexes = batch.map(x => `#${x.dbIndex}`).join(', ');
                    log(`${icon} 批${i + 1}/${batches.length} (${batch.length}个)[发送]: ${batchIndexes}`);
                    const sent = await _emergencySendOnly(batch);
                    sentBatches.push(sent);
                    if (i < batches.length - 1) {
                        const stagger = EMERGENCY_CONFIG.SEND_STAGGER_MIN_MS +
                            Math.floor(Math.random() * (EMERGENCY_CONFIG.SEND_STAGGER_MAX_MS - EMERGENCY_CONFIG.SEND_STAGGER_MIN_MS));
                        await delay(stagger);
                    }
                }

                // ---- 确认阶段（Change A）：所有已发送批并行等待上链确认+gas判级+estimateGas裁决 ----
                log(`⏳ [停采诊断] 本轮 ${sentBatches.length} 批已发送完毕，并行等待确认...`);
                const settled = await Promise.allSettled(sentBatches.map(s => _emergencyConfirmBatch(s)));
                const results = settled.map((r, idx) => r.status === 'fulfilled'
                    ? r.value
                    : { success: false, error: r.reason?.message || String(r.reason), items: sentBatches[idx].items });

                // ---- 逐批处理确认结果：沿用原有"首批强化/整批失败重试"逻辑，
                //      仅数据源从"逐批 live await"改为"并行结果数组"；重试/单发前一律加
                //      estimateGas 门禁（Change A/C），接住 _allowFailureStop 返回值记账（Change D） ----
                for (let i = 0; i < results.length; i++) {
                    const batch = batches[i];
                    const result = results[i];

                    // 收集本批因操作冷却未能停采的 kami，留待轮次结束后统一重试
                    if (Array.isArray(result?.cooldownList) && result.cooldownList.length > 0) {
                        for (const cd of result.cooldownList) {
                            cooldownDeferred.set(cd.dbIndex, cd);
                        }
                    }

                    // 第一批装的是最危险的kami（已按 delta 升序排列），有失败的立刻重试
                    if (i === 0 && result.success && result.failCount > 0) {
                        const { retryItems } = await _emergencyRetryBatchGated(batch, '首批强化');
                        if (retryItems.length > 0) {
                            await _emergencySingleRetryGated(retryItems, '首批强化单发');
                        }
                    }

                    // 整批发送失败（交易未上链）时，第一批走批量重试（只重试高危：整批未上链多为 gas 问题，
                    // 低危 kami 留给下一轮合批处理更省）
                    if (i === 0 && !result.success) {
                        const highRiskBatch = batch.filter(x => x.delta <= EMERGENCY_CONFIG.HIGH_RISK_DELTA);
                        const { retryItems, retryResult } = await _emergencyRetryBatchGated(highRiskBatch, '整批失败重试');
                        if (retryItems.length > 0 && (!retryResult?.success || (retryResult.failCount && retryResult.failCount > 0))) {
                            await _emergencySingleRetryGated(retryItems, '整批失败单发');
                        }
                    }
                }

                // 动态等待时间 = 自适应基础(D4v2 滚动p90) + 批次数 × 每批时间
                // 🔻SYNC→内部版[1.2.4 部署防重发门禁] D4v2：基础等待由 _adaptiveStopWaitMs()（最近30笔停采tx确认耗时的滚动p90+3s索引余量,clamp 8~30s）
                //   替代静态 EMERGENCY_CONFIG.BASE_WAIT_MS；样本<5笔或异常回退到常量(9000)。纯等待时长调整，不改任何判定/重发逻辑。
                const _adaptInfo = _adaptiveStopWaitInfo();
                const dynamicWait = _adaptInfo.ms + batches.length * EMERGENCY_CONFIG.PER_BATCH_WAIT_MS;
                log(`⏳ [紧急停采] 动态等待 ${dynamicWait}ms (${batches.length}批, 自适应p90=${_adaptInfo.secs}s,样本n=${_adaptInfo.n})...`);
                await delay(dynamicWait);

                // 查询真实状态
                const { stillHarvesting, alreadyStopped } = await _emergencyQueryStatus(remaining);

                // 已确认停采的记入操作账（供统计/展示使用）
                for (const item of alreadyStopped) {
                    recordAction(item.imgNumber, 'stopHarvest');
                    // 🔻SYNC→内部版[1.1.21 轮末已停实锤记账]（grok P0.5）state 复读确认非HARVESTING 的成功也清失败计数/入成功集，
                    //   避免真已停的 kami 因残留失败计数被误拉黑；_resolvedState==='unknown'（查询抛错）不算确认，绝不据此清计数。
                    if (item._resolvedState && item._resolvedState !== 'unknown') _stopCreditSuccess(item, 'state复读已停');
                }

                log(`📊 [紧急停采] 第${round}轮结果: 已停=${alreadyStopped.length}, 仍在采(索引器读数)=${stillHarvesting.length}`);

                // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
                // 改动B：本地索引器读数可能滞后于本轮 gas/estimateGas 已实锤停成
                // 的 kami，用内存成功集剔除后才是下一轮真正需要重发 tx 的清单
                const stillHarvestingFiltered = _stopFilterConfirmed(stillHarvesting, `第${round}轮结果`);

                // 列出仍在采的kami编号（方便排查）
                if (stillHarvestingFiltered.length > 0 && stillHarvestingFiltered.length <= 20) {
                    const stillIndexes = stillHarvestingFiltered.map(x => `#${x.dbIndex}`).join(', ');
                    log(`   ⏳ 仍在采(剔除已实锤停成后): ${stillIndexes}`);
                }

                remaining = stillHarvestingFiltered;
                round++;

                if (remaining.length > 0 && round <= EMERGENCY_CONFIG.MAX_ROUNDS) {
                    log(`⏳ [紧急停采] 等待 ${EMERGENCY_CONFIG.ROUND_INTERVAL_MS}ms 后进入下一轮...`);
                    await delay(EMERGENCY_CONFIG.ROUND_INTERVAL_MS);
                }
            }

            // 所有轮次结束后，处理推迟的 cooldown kami
            // 策略：一次批量 AllowFailure 重试 → 仍失败降级为单个 api.stop
            // cooldown 最长 3 分钟，前面多轮的等待中可能已自然恢复
            // 队列 < 3 且无高危/STARVING 时推迟到下一轮 runAutomation，避免单只重试浪费 gas（单只 ~2.43M）
            // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
            // 180s 硬上限在这里也补一道：cooldown 定时补停最长可等 93s，叠加前面
            // 多轮耗时有可能整体超时，超时则放弃 cooldown 收尾、直接进 finally 释放锁
            if (cooldownDeferred.size > 0 && (Date.now() - startTime) > EMERGENCY_CONFIG.INVOCATION_HARD_CAP_MS) {
                log(`%c⏰ [停采诊断] 本次调用已耗时 ${Date.now() - startTime}ms，达到硬上限，跳过 cooldown 收尾（${cooldownDeferred.size} 个交下一轮）`,
                    'color: red; font-weight: bold;');
            } else if (cooldownDeferred.size > 0) {
                // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
                // 改动C · cooldown收尾与remaining解耦（发现4）：原第二层 filter 要求
                // dbIndex 命中 remaining 或 remaining 已整体清空才处理——但
                // cooldownDeferred 里相当一部分成员从组批前的冷却预筛（本函数
                // 靠前处的"remain>0 直接归入 cooldownDeferred"）起就从未进过
                // remaining，天然不可能命中这个条件；一旦本轮结束时 remaining
                // 还残留其它非 cooldown 的真失败/卡链 kami（非空），这些危险
                // 冷却 kami 的 90s 定时补停（下方 cdWaitDanger 分支）就会被整批
                // 跳过——保命补停不该被"别的 kami 没停"挡住。是否仍需处理交给
                // 下面循环里对每只做的实时链上状态复核（state!==HARVESTING 则
                // continue）去重，不需要靠 remaining 耦合，故这里始终处理
                // cooldownDeferred 全量（只保留 harvestId 存在这个必要条件）。
                // 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集]
                // 修复3：先剔本次调用内已被gas判级/estimateGas实锤确认停成的
                // kamiId（__stopConfirmedThisInvocation），再进入下面逐只
                // getByIndex 复核——纯过滤，不改补停/单发判定语义，只是省掉对
                // 已确认成功的 kami 再查一次链上状态的无谓 RPC。
                const cdListRaw = [...cooldownDeferred.values()]
                    .filter(it => it.harvestId);
                const cdList = _stopFilterConfirmed(cdListRaw, 'cooldown收尾扫描前');
                // 先刷新链上状态，剔除已自然停采的
                // 【v1.1.10 冷却公式预筛】同一次 getByIndex 顺手取 harvest.time.last 重算
                // remain，三路分流：remain==0 照旧重试；remain>0 且危险（starving 或
                // delta≤EMERGENCY_DANGER_DELTA）且 remain≤90s → 定时等到期后立即补停；
                // 其余 remain>0 → 留到下一轮（不在本次紧急停采内白等）
                const cdToRetry = [];      // remain==0，走原有立即重试流程
                const cdWaitDanger = [];   // remain>0 且危险且≤90s，定时等待后补停
                const cdDeferNext = [];    // remain>0 且不危险/>90s，留到下一轮
                for (const item of cdList) {
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                        if (String(res?.state || '').toUpperCase() !== 'HARVESTING') continue;
                        const freshHid = res?.harvest?.id || item.harvestId;
                        if (!freshHid) continue;
                        const freshItem = { ...item, harvestId: freshHid };
                        const remain = _cooldownRemainSec(res?.harvest?.time?.last);
                        if (remain <= 0) {
                            cdToRetry.push(freshItem);
                        } else if ((freshItem.isStarving || freshItem.delta <= EMERGENCY_DANGER_DELTA) && remain <= 90) {
                            cdWaitDanger.push({ item: freshItem, remain });
                        } else {
                            cdDeferNext.push({ item: freshItem, remain });
                        }
                    } catch (_) {
                        if (item.harvestId) cdToRetry.push(item); // 读失败按无冷却处理，回落旧行为
                    }
                }

                if (cdDeferNext.length > 0) {
                    const cdFmt = cdDeferNext.map(x => `#${x.item.dbIndex}(剩${x.remain}s)`).join(', ');
                    log(`⏳ [紧急停采/cooldown下轮] ${cdDeferNext.length} 个仍在冷却且非紧急，留到下一轮：${cdFmt}`);
                }

                if (cdWaitDanger.length > 0) {
                    // 紧急锁持有期间的定时等待：批内取最大 remain 统一等待后一次性补停；
                    // 上限写死93秒（90s危险线+1~3s随机缓冲）防呆，避免任何计算异常导致长时间占锁
                    const maxRemain = Math.max(...cdWaitDanger.map(x => x.remain));
                    const jitterMs = 1000 + Math.floor(Math.random() * 2000);   // 1~3s 随机缓冲：防卡在冷却结束边界(180s)又失败一次 + 错开多只同时解除
                    const waitMs = Math.min(maxRemain * 1000 + jitterMs, 93000);  // 封顶随缓冲上限同步 92000→93000
                    const cdFmt = cdWaitDanger.map(x => `#${x.item.dbIndex}(剩${x.remain}s)`).join(', ');
                    log(`%c⏱️ [紧急停采/cooldown定时补停] ${cdWaitDanger.length} 只危险kami冷却剩余≤90s：${cdFmt}，等待${waitMs}ms后立即补停`,
                        'color: orange; font-weight: bold;');
                    await delay(waitMs);
                    const waitBatchResult = await _emergencySendBatch(cdWaitDanger.map(x => x.item));
                    const waitStillFail = [];
                    if (waitBatchResult?.success) {
                        await delay(2500);
                        // 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集]
                        // 修复3：批量发送后扫战果前，先剔本次调用内已被gas判级实锤
                        // 确认停成的kamiId，避免对已确认成功的kami再发一次无谓
                        // getByIndex（纯过滤，不改判定语义）
                        const cdWaitDangerScanIds = new Set(
                            _stopFilterConfirmed(cdWaitDanger.map(x => x.item), 'cooldown定时补停战果复核前')
                                .map(x => x.kamiId)
                        );
                        for (const { item } of cdWaitDanger) {
                            if (item.kamiId && !cdWaitDangerScanIds.has(item.kamiId)) continue; // 已实锤确认停成，跳过复核RPC
                            try {
                                const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                                if (String(res?.state || '').toUpperCase() === 'HARVESTING') waitStillFail.push(item);
                            } catch (_) { waitStillFail.push(item); }
                        }
                    } else {
                        waitStillFail.push(...cdWaitDanger.map(x => x.item));
                    }
                    if (waitStillFail.length > 0 && __stopCircuitBroken) {
                        log(`   ⏭️ [停采诊断] 熔断生效中，跳过cooldown定时补停单发 (${waitStillFail.length} 个)`);
                    } else if (waitStillFail.length > 0) {
                        log(`🕓 [紧急停采/cooldown定时补停] 批量未停 ${waitStillFail.length} 个，降级为单独 api.stop...`);
                        for (const item of waitStillFail) {
                            if (!item.harvestId) continue;
                            // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                            // 单发前过 estimateGas 闸门：通过才发；不通过按链上state区分
                            // "已停(索引滞后)"vs"疑似卡链"分类记账，不盲发tx（Change A/C）
                            if (item.kamiId && __stopStuckThisInvocation.has(item.kamiId)) {
                                log(`   ⏭️ [停采诊断] #${item.dbIndex} 本次调用内已判定疑似卡链，跳过cooldown定时补停单发`);
                                continue;
                            }
                            const gateCheck = await _preCheckStop([item.harvestId]);
                            if (!gateCheck.ok) {
                                await _emergencyCreditBlocked([item], 'cooldown定时补停单停');
                                continue;
                            }
                            try {
                                log(`   🕓 #${item.dbIndex} 单独 api.stop 重试...`);
                                const ok = await _allowFailureStop([item.harvestId], `#${item.dbIndex}(cooldown定时补停单停)`);
                                // BEFORE(Bug B前): _allowFailureStop 的 gas full_exec true 会直接 _stopCreditSuccess；false 会记失败。
                                if (ok === true) _stopCreditSuccess(item, 'cooldown定时补停state复读确认'); else if (ok === false) _stopCreditFail(item); else _stopBackoffEnroll(item, true);   // 🔻SYNC→内部版[1.1.22 退避复读] C1/C2：null=pendingVerify(单只gas曾观察)，入退避复读队列交调度器复读定夺
                            } catch (e) {
                                log(`   ❌ #${item.dbIndex} 单独 api.stop 异常: ${e?.message || e}`);
                            }
                            await delay(800);
                        }
                    }
                    // 补停后立即回写 remaining，避免下方 canDefer 提前 return 时漏更新
                    const waitFinalCheck = await _emergencyQueryStatus(remaining);
                    // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
                    // 改动B：同一套剔除逻辑，避免最终汇总统计把已实锤停成的 kami 算作"未能停采"
                    remaining = _stopFilterConfirmed(waitFinalCheck.stillHarvesting, 'cooldown定时补停后复核');
                    for (const item of waitFinalCheck.alreadyStopped) {
                        recordAction(item.imgNumber, 'stopHarvest');
                        // 🔻SYNC→内部版[1.1.21 轮末已停实锤记账]（grok P0.5）同上：state 复读确认已停清失败计数，unknown 不算确认
                        if (item._resolvedState && item._resolvedState !== 'unknown') _stopCreditSuccess(item, 'state复读已停(cooldown定时补停后)');
                    }
                }

                // < 3 只且全部"非高危"时推迟（保命优先原则：高危绝不推迟）
                // 推迟条件（必须全部满足）：
                //   ① 队列 < 3
                //   ② 无 STARVING（hp=0%）
                //   ③ 全部 kami delta > HIGH_RISK_DELTA(-10) — 即都是浅黄/接近线
                // 高危/极危 kami（delta ≤ -10）即使只有 1 只也立即发，避免 30 分钟后已 STARVING 被杀
                const COOLDOWN_DEFER_MIN = 3;
                const hasStarving = cdToRetry.some(x => x.isStarving);
                const hasHighRisk = cdToRetry.some(x => x.delta <= EMERGENCY_CONFIG.HIGH_RISK_DELTA);
                const canDefer = cdToRetry.length > 0
                              && cdToRetry.length < COOLDOWN_DEFER_MIN
                              && !hasStarving
                              && !hasHighRisk;
                if (canDefer) {
                    const cdFmt = cdToRetry.map(x => `#${x.dbIndex}(Δ${x.delta})`).join(', ');
                    log(`%c⏭️ [紧急停采/cooldown推迟] 仅 ${cdToRetry.length} 只 cooldown，全部非高危（Δ>${EMERGENCY_CONFIG.HIGH_RISK_DELTA}）且无STARVING：${cdFmt}，推迟到下轮合批省 gas`,
                        'color: cyan; font-weight: bold;');
                    return;
                }
                if (cdToRetry.length > 0 && cdToRetry.length < COOLDOWN_DEFER_MIN && (hasStarving || hasHighRisk)) {
                    const cdFmt = cdToRetry.map(x => `#${x.dbIndex}(Δ${x.delta}${x.isStarving?',STARVING':''})`).join(', ');
                    log(`%c⚠️ [紧急停采/cooldown立即处理] ${cdToRetry.length} 只 cooldown 含高危/STARVING：${cdFmt}，保命优先不推迟`,
                        'color: orange; font-weight: bold;');
                }

                if (cdToRetry.length > 0) {
                    const cdFmt = cdToRetry.map(x => `#${x.dbIndex}`).join(', ');
                    log(`%c🕓 [紧急停采/cooldown重试] ${cdToRetry.length} 个推迟的 cooldown kami 尝试批量停采: ${cdFmt}`,
                        'color: orange; font-weight: bold;');
                    const batchResult = await _emergencySendBatch(cdToRetry);
                    const stillFail = [];
                    // 批量已上链 → 等 2.5 秒让链上状态更新，再逐只核对找出仍未停的
                    if (batchResult?.success) {
                        await delay(2500);
                        // 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集]
                        // 修复3：扫战果前先剔本次调用内已被gas判级实锤确认停成的，
                        // 避免对已确认成功的kami再发一次无谓getByIndex（纯过滤，
                        // 不改判定语义）
                        const cdToRetryToScan = _stopFilterConfirmed(cdToRetry, 'cooldown重试战果复核前');
                        for (const item of cdToRetryToScan) {
                            try {
                                const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                                if (String(res?.state || '').toUpperCase() === 'HARVESTING') {
                                    // 【v1.1.10】顺手取 time.last：本次 getByIndex 已带 {harvest:true}，
                                    // 零新增查询即可供下方单停降级前再查一次 remain
                                    stillFail.push({ ...item, timeLast: res?.harvest?.time?.last ?? null });
                                }
                            } catch (_) { stillFail.push(item); }
                        }
                    } else {
                        // 批量整体失败 → 全部转入逐只单发降级
                        stillFail.push(...cdToRetry);
                    }

                    if (stillFail.length > 0 && __stopCircuitBroken) {
                        log(`   ⏭️ [停采诊断] 熔断生效中，跳过cooldown重试单发 (${stillFail.length} 个)`);
                    } else if (stillFail.length > 0) {
                        log(`🕓 [紧急停采/cooldown重试] 批量未停 ${stillFail.length} 个，降级为单独 api.stop...`);
                        for (const item of stillFail) {
                            if (!item.harvestId) continue;
                            // 【v1.1.10 单停降级路径预筛】单发前再查一次 remain：批量 tx 与这次单发
                            // 之间有 2.5s+ 间隔，理论上可能被别的操作重新打入冷却；读不到
                            // timeLast（未走上面刷新分支）时 remain=0，回落旧行为直接尝试
                            const remainNow = _cooldownRemainSec(item.timeLast);
                            if (remainNow > 0) {
                                log(`   ⏳ #${item.dbIndex} 单停前复检仍在冷却(剩余${remainNow}s)，跳过本次单发`);
                                continue;
                            }
                            // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                            // 单发前过 estimateGas 闸门：通过才发；不通过按链上state区分
                            // "已停(索引滞后)"vs"疑似卡链"分类记账，不盲发tx（Change A/C）
                            if (item.kamiId && __stopStuckThisInvocation.has(item.kamiId)) {
                                log(`   ⏭️ [停采诊断] #${item.dbIndex} 本次调用内已判定疑似卡链，跳过cooldown重试单发`);
                                continue;
                            }
                            const gateCheck = await _preCheckStop([item.harvestId]);
                            if (!gateCheck.ok) {
                                await _emergencyCreditBlocked([item], 'cooldown重试单停');
                                continue;
                            }
                            try {
                                log(`   🕓 #${item.dbIndex} 单独 api.stop 重试...`);
                                const ok = await _allowFailureStop([item.harvestId], `#${item.dbIndex}(cooldown单停)`);
                                // BEFORE(Bug B前): _allowFailureStop 的 gas full_exec true 会直接 _stopCreditSuccess；false 会记失败。
                                if (ok === true) _stopCreditSuccess(item, 'cooldown重试state复读确认'); else if (ok === false) _stopCreditFail(item); else _stopBackoffEnroll(item, true);   // 🔻SYNC→内部版[1.1.22 退避复读] C1/C2：null=pendingVerify，入退避复读队列
                            } catch (e) {
                                log(`   ❌ #${item.dbIndex} 单独 api.stop 异常: ${e?.message || e}`);
                            }
                            // 单发之间留 0.8 秒间隔，避免连续 tx 造成 nonce/节点压力
                            await delay(800);
                        }
                    }

                    // 重新查询 remaining，剔除 cooldown 已停的
                    const finalCheck = await _emergencyQueryStatus(remaining);
                    // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
                    // 改动B：同一套剔除逻辑，避免最终汇总统计把已实锤停成的 kami 算作"未能停采"
                    remaining = _stopFilterConfirmed(finalCheck.stillHarvesting, 'cooldown重试后复核');
                    for (const item of finalCheck.alreadyStopped) {
                        recordAction(item.imgNumber, 'stopHarvest');
                        // 🔻SYNC→内部版[1.1.21 轮末已停实锤记账]（grok P0.5）同上：state 复读确认已停清失败计数，unknown 不算确认
                        if (item._resolvedState && item._resolvedState !== 'unknown') _stopCreditSuccess(item, 'state复读已停(cooldown重试后)');
                    }
                }
            }

            // 汇总：以首次预检后的 validList 为分母统计本次停采成功数
            const totalTime = Date.now() - startTime;
            const stopped = validList.length - remaining.length;

            if (remaining.length > 0) {
                const failedIndexes = remaining.map(x => `#${x.dbIndex}`).join(', ');
                log(`⚠️ [紧急停采] ${remaining.length} 个未能停采: ${failedIndexes}`);
            }

            if (stopped < validList.length) {
                log(`%c⚠️ [紧急停采] 完成（${validList.length - stopped} 只未停成） 停采 ${stopped}/${validList.length}, 耗时 ${totalTime}ms 即 ${Math.floor(totalTime/60000)}分${((totalTime%60000)/1000).toFixed(1)}秒`,
                    'color: orange; font-weight: bold;');
            } else {
                log(`%c✅ [紧急停采] 完成! 停采 ${stopped}/${validList.length}, 耗时 ${totalTime}ms 即 ${Math.floor(totalTime/60000)}分${((totalTime%60000)/1000).toFixed(1)}秒`,
                    'color: green; font-weight: bold;');
            }

            // 🔻SYNC→内部版[1.1.17 可观测性批次] C4：停采收敛小结（纯日志/统计；简化版=只报本次 pendingVerify 批数，
            // tx确认耗时中位/索引器确认只数因现场无累计变量暂不取，保守不为凑指标改流程；已确认停成只数取自本次调用去重集）
            // 🔻SYNC→内部版[1.1.19 停采通道统一] D3：小结追加当前通道与本次 mud→raw 跌落次数（纯统计）
            log(`📊 [停采诊断/收敛小结] 本次 pendingVerify批=${__pendingVerifyBatchCount} 已确认停成=${__stopConfirmedThisInvocation.size}只 通道=${_getStopTxChannel()} 跌落raw=${__stopChanFallbackCount}次（gas 不作停成凭据，成功以下轮 state≠HARVESTING 复读为准）`);

            // 🔻SYNC→内部版[1.1.22 退避复读] C4：时延小结——tx确认/索引反映的中位与最慢，供日后画确认时间分布、标定退避表。纯日志。
            try {
                const _median = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
                const _s = (ms) => ms == null ? 'NA' : (ms / 1000).toFixed(1) + 's';
                const _txMed = _median(__stopTxConfirmMsList);
                const _txMax = __stopTxConfirmMsList.length ? Math.max(...__stopTxConfirmMsList) : null;
                const _lagMed = _median(__stopIndexLagMsList);
                log(`📊 [停采诊断/时延] tx确认中位=${_s(_txMed)}(最慢${_s(_txMax)}) 索引反映中位=${_s(_lagMed)} 残留进退避=${__stopPendingVerify.size}只`);
            } catch (_) {}

        } finally {
            // 只有设置了紧急锁才需要释放
            if (emergencyLockSet) {
                releaseEmergencyLock();
            }
            window.__kamiOperationInProgress = false;
            window.__emergencyStopRunning = false;
        }
    }

    // ============================================================
    // 【板块：紧急停采链上预检 _emergencyPreCheck】
    // ------------------------------------------------------------
    // ▍功能：对候选停采清单做链上真值预检——剔除已死/已停/不在采集中的
    //   kami，处理停采黑名单（冷却期满解除 / 预检通过回流主批 / 仍失败
    //   跳过），过滤不在当前地块的 kami，最终产出可安全批量停采的
    //   validList。核心目的是防"连坐"：把注定失败的成员混进批量交易，
    //   会白付 gas 并拖累整批的成功率。
    // ▍触发时机：仅由 emergencyStopHarvest 调用，共两处——Step 3 首次
    //   预检、Step 4.6 喂食后二次预检（期间链上状态可能已变化）。
    // ▍依赖：
    //   - __stopBlockedKamis(Set) / __stopBlockedTime(Map) —— 停采黑名单：
    //     屡次停采失败的 kamiId 及其加入时间戳（由停采失败路径写入；
    //     停采成功后由 _emergencySendBatch 的 okList 处理移出）
    //   - STOP_BLOCK_COOLDOWN_MS —— 黑名单冷却时长，期满自动解除
    //   - _preCheckStop([harvestId]) —— 用 estimateGas 逐个预检停采调用
    //     是否会成功（不上链、不花 gas）
    //   - __getMyRoomIndex() / __getRoomNameByIndex() —— 当前地块号/名称
    //   - 链上 API：window.network.explorer.kamis.getByIndex(dbIndex,
    //     {harvest:true}) —— 查询 state、harvest.id、harvest.node.index
    //   - _emergencyRunPool + EMERGENCY_CONFIG.CONFIRM_CONCURRENCY —— 限流并发
    //   - _emergencyGetState(res) —— 把链上返回归一化为 harvesting /
    //     resting / dead / unknown 等状态串
    //   - localStorage：本板块不直接读写
    // ▍核心流程：
    //   1) 遍历入参，命中黑名单的 kami 分三路：冷却期满 → 解除并回主流程；
    //      未满且有 harvestId → _preCheckStop 探测，通过 → 记入
    //      blacklistToRetry，失败 → 跳过并计数；无 harvestId → 直接跳过
    //   2) blacklistToRetry 合并回主清单（黑名单回流，随主批一起停采）
    //   3) 读取当前地块号 myRoom
    //   4) 限流并发查询每只 kami 的链上状态，顺带刷新 harvestId/harvestRoom
    //   5) 分类：harvesting 且有 harvestId → 地块匹配才进 validList，
    //      异地块跳过并提示手动处理；unknown → 有 harvestId 保守放行；
    //      dead / resting / 无 harvestId → 过滤并计数
    //   6) 返回 { validList, filteredCount }
    // ▍边界与保护：
    //   - 锁纪律：本函数运行在紧急锁设置之前（延迟加锁设计），全程只读、
    //     绝不发写 tx；黑名单预检通过的 kami 不在此单独发停采，而是并入
    //     主批、加锁后随大批一起发——避免无锁写 tx 与普通操作之间的
    //     nonce 冲突窗口，同时省下一笔单独 tx 的固定 gas（约 1.07M）
    //   - 黑名单冷却：冷却期内默认跳过，防止对停不掉的 kami 反复浪费
    //     gas；但每次预检仍用 estimateGas 探测一次，恢复即回流主批，
    //     不必干等冷却到期
    //   - 查询容错：getByIndex 抛异常按 unknown 处理，有 harvestId 则
    //     放行——宁可多发一次停采，也不漏掉真正危险的 kami
    //   - 地块过滤：在其他地块采集的 kami 无法由当前页面批量处理，
    //     跳过并以醒目日志列出，交由用户手动处理
    // ▍可调参数：
    //   - STOP_BLOCK_COOLDOWN_MS —— 黑名单冷却时长；调短恢复重试更快但
    //     可能反复撞同一失败，调长更省 gas 但问题 kami 的风险期更久
    //   - EMERGENCY_CONFIG.CONFIRM_CONCURRENCY —— 状态查询并发数；调大
    //     预检更快，但对链上查询接口压力更大
    // ▍相关控制台命令：无（内部函数，不对外暴露）
    // ============================================================
    /**
     * 预检过滤 - 查链上状态，排除已死/已停/非采集中的kami
     * 含黑名单处理：冷却期满自动解除；未满的先预检，通过的并入主批一起停采
     */
    async function _emergencyPreCheck(items) {
        // 处理黑名单中的kami：冷却期满自动解除；未满则先预检，通过的并入主批
        const now = Date.now();
        const itemsAfterBlacklist = [];
        const blacklistToRetry = [];  // 黑名单中预检通过的 → 并入主批（不在无锁阶段独立发 tx）
        let blacklistSkipped = 0;

        for (const item of items) {
            const kamiId = item.kamiId;
            if (kamiId && __stopBlockedKamis.has(kamiId)) {
                const blockedAt = __stopBlockedTime.get(kamiId) || 0;
                const elapsed = now - blockedAt;

                if (elapsed >= STOP_BLOCK_COOLDOWN_MS) {
                    // 超时自动解除
                    __stopBlockedKamis.delete(kamiId);
                    __stopBlockedTime.delete(kamiId);
                    log(`   ⏰ #${item.dbIndex} 黑名单已过期，自动解除`);
                    itemsAfterBlacklist.push(item);
                } else {
                    // 仍在黑名单中，先预检看看是否恢复
                    const remainMin = Math.ceil((STOP_BLOCK_COOLDOWN_MS - elapsed) / 60000);

                    if (item.harvestId) {
                        const check = await _preCheckStop([item.harvestId]);
                        if (check.ok) {
                            // 不在此处直接发停采 tx：预检阶段位于紧急锁设置之前（延迟
                            // 加锁设计），无锁发写 tx 存在与普通操作的 nonce 冲突窗口。
                            // 因此并入主停采清单，加锁后随大批一起发
                            // —— 守锁纪律 + 省一笔单独 tx 的固定 gas（~1.07M）
                            log(`   🔄 #${item.dbIndex} 黑名单中但预检通过，并入主批一起停采`);
                            blacklistToRetry.push(item);
                        } else {
                            log(`   🚫 #${item.dbIndex} 在停采黑名单中且预检仍失败（剩${remainMin}分钟），跳过`);
                            blacklistSkipped++;
                        }
                    } else {
                        log(`   🚫 #${item.dbIndex} 在停采黑名单中（剩${remainMin}分钟），跳过`);
                        blacklistSkipped++;
                    }
                }
            } else {
                itemsAfterBlacklist.push(item);
            }
        }

        // 黑名单中预检通过的 kami 回到主流程（停采成功后由
        // _emergencySendBatch 的 okList 处理移出黑名单）
        if (blacklistToRetry.length > 0) {
            const retryFmt = blacklistToRetry.map(x => `#${x.dbIndex}`).join(', ');
            log(`🔄 [紧急停采/黑名单回流] ${blacklistToRetry.length} 个预检通过的黑名单kami并入主批: ${retryFmt}`);
            itemsAfterBlacklist.push(...blacklistToRetry);
        }

        if (blacklistSkipped > 0) {
            log(`📊 [紧急停采/预检] 黑名单跳过 ${blacklistSkipped} 个`);
        }

        if (itemsAfterBlacklist.length === 0) {
            return { validList: [], filteredCount: blacklistSkipped };
        }

        // 获取当前地块号，用于过滤不在当前地块的kami
        const myRoom = __getMyRoomIndex();

        // 并发查询链上状态（并发数受 CONFIRM_CONCURRENCY 限制，防止压垮查询接口）
        const results = await _emergencyRunPool(itemsAfterBlacklist, async (item) => {
            try {
                const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                const state = _emergencyGetState(res);
                const harvestId = res?.harvest?.id || item.harvestId;
                const harvestRoom = res?.harvest?.node?.index ?? null;
                // 【v1.1.10】顺手取 harvest.time.last：本次 getByIndex 已带 {harvest:true}，
                // 零新增查询即可拿到冷却公式所需数据，供组批前的 remain 预筛使用
                const timeLast = res?.harvest?.time?.last ?? null;
                return { item: { ...item, harvestId, harvestRoom, timeLast }, state };
            } catch (e) {
                return { item, state: 'unknown' };
            }
        }, EMERGENCY_CONFIG.CONFIRM_CONCURRENCY);

        const validList = [];
        const otherRoomItems = [];  // 不在当前地块的kami
        let filteredCount = blacklistSkipped;

        for (const r of results) {
            if (r.state === 'harvesting' && r.item.harvestId) {
                // 地块检查：不在当前地块的kami跳过，提示用户手动处理
                if (myRoom != null && r.item.harvestRoom != null && r.item.harvestRoom !== myRoom) {
                    otherRoomItems.push(r.item);
                    filteredCount++;
                    continue;
                }
                validList.push(r.item);
            } else if (r.state === 'unknown') {
                // 查询异常：有 harvestId 就保守放行（宁可多发一次停采，不漏掉危险 kami）
                if (r.item.harvestId) {
                    validList.push(r.item);
                } else {
                    filteredCount++;
                }
            } else {
                // 已死/已停/无harvestId，过滤
                filteredCount++;
                if (r.state === 'dead') {
                    log(`   ☠️ #${r.item.dbIndex} 已死亡，跳过`);
                } else if (r.state === 'resting') {
                    log(`   💤 #${r.item.dbIndex} 已停采，跳过`);
                }
            }
        }

        // 提示用户不在当前地块的kami需手动处理
        if (otherRoomItems.length > 0) {
            const roomName = __getRoomNameByIndex(myRoom) || `#${myRoom}`;
            const otherIndexes = otherRoomItems.map(x => `#${x.dbIndex}(地块${x.harvestRoom})`).join(', ');
            log(`%c⚠️ [地块不匹配] 当前地块: ${roomName}，以下 ${otherRoomItems.length} 个kami在其他地块采集，已跳过，请手动处理: ${otherIndexes}`,
                'color: orange; font-weight: bold;');
        }

        return { validList, filteredCount };
    }

    // ============================================================
    // 【板块：紧急停采 · 发送/确认解耦 + gas判级 + estimateGas裁决（v1.1.12）】
    // ------------------------------------------------------------
    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
    // ▍0709 夜 42-agent 审计定案的根因链（详见文件头部改动说明）：
    //   ① tx 实际成功（单只 gas≈1.54M=完整执行），但旧版 _emergencySendBatch
    //      在 tx.wait() 后只 delay(2000) 就用本地索引器复核——索引器滞后
    //      （实测 17~99s）导致整批被误判"真失败"；
    //   ② 误判后触发重试风暴，单只重试固定 ~261k gas（revert级=打在已停
    //      kami上）白烧；
    //   ③ 失败分类只看 DOM 按钮（_isKamiInCooldown），实盘恒为 false 已失效；
    //   ④ 失败计数只增不清，一次调用内被多条路径重复计数，穿透拉黑阈值。
    // ▍本次重构把原来"发送+等确认+delay(2000)+索引器复核"一条龙的
    //   _emergencySendBatch 拆成两段：
    //   - _emergencySendOnly：只管把 tx 广播出去，不等确认；
    //   - _emergencyConfirmBatch：等回执，按"每只均摊 gas"分三级裁决
    //     （全执行/全revert/混合），只在 revert/混合 时才逐只 estimateGas
    //     裁决，全执行直接采信 gas 回执、不再靠索引器二次确认。
    //   emergencyStopHarvest 的主循环用这两段实现"本轮所有批背靠背发送，
    //   确认阶段并行"（Change A）；其余零散调用点（首批强化/cooldown
    //   重试等）继续用 _emergencySendBatch 这个厚包装（内部即 send+confirm
    //   背靠背执行一次），对外行为/返回值形状与旧版兼容，无需改动调用方。
    // ▍失败计数/黑名单：全部通过 _stopCreditFail / _stopCreditSuccess
    //   记账，天然满足"同一次调用内每只 kami 最多 +1"（Change D）。
    // ============================================================

    /** 尽力读一次当前 nonce，仅用于诊断日志；两种 ethers 版本 API 都试，读不到返回 null。 */
    async function _tryReadNonce(signer) {
        try {
            if (typeof signer?.getNonce === 'function') return await signer.getNonce();
            if (typeof signer?.getTransactionCount === 'function') return await signer.getTransactionCount();
        } catch (_) { /* 读不到不影响主流程，静默忽略 */ }
        return null;
    }

    // ============ [停采发送通道 v1.1.19] MUD 队列(默认) / 原始签名器(回退) ============
    // 🔻SYNC→内部版[1.1.19 停采通道统一]
    // 背景：0710 取证——停采原走 signer.sendTransaction 原始签名器，与 MUD TXQueue 双 nonce 账本分叉，
    //   每夜 ~46 次 sequence mismatch（自愈但浪费）。队列包装对象上 executeBatchedAllowFailure 直接可调
    //  （与 api 同通道，nonce 统一，容错语义不变），1.1.19 曾默认切 MUD 通道。
    // 🔻SYNC→内部版[1.1.21 默认通道保守回raw]
    //   会诊共识（0710 停采事故）：MUD 队列 resolve 出的对象形状（tx 带 wait / 直接 receipt）未经实盘验证，
    //   在确认适配 shim（v1.1.21 新增 _awaitStopReceipt）没跑过一夜前，默认值保守回退到经过验证的 raw 原始签名器；
    //   待 v1.1.21 实盘验证 mud 通道一次干净的紧急停采（回执形状确认无误）后，下版默认再切回 mud。
    //   显式 localStorage 设 'mud' 仍尊重（供实盘验证用），不影响一键切换。
    function _getStopTxChannel() {
        try { return localStorage.getItem('kami_stop_tx_channel') === 'mud' ? 'mud' : 'raw'; } catch (e) { return 'raw'; }
    }
    window.setStopTxChannel = function (ch) {
        if (ch !== 'mud' && ch !== 'raw') { console.log("用法: setStopTxChannel('mud'|'raw')  当前=" + _getStopTxChannel()); return; }
        try { localStorage.setItem('kami_stop_tx_channel', ch); } catch (e) {}
        console.log(`✅ 停采发送通道已切为 ${ch}（mud=MUD队列统一nonce/raw=原始签名器旧路），即刻生效`);
    };

    // ============ [停采回执适配 v1.1.21] MUD 队列 resolve 的可能是 tx(带wait) 也可能直接是 receipt ============
    // 🔻SYNC→内部版[1.1.21 停采回执适配]
    // 背景：0710 停采事故——MUD 队列 promise 等上链才 resolve（实测 9528ms），resolve 出的对象没有 .wait
    //   （大概率直接是 receipt 形，确切字段未 dump 过）。旧确认码写死 tx.wait()，形状假设错→假失败。
    //   本 helper 把两种形状归一：带 wait 的 tx 走 wait()（raw 分支行为逐字节等价）；已是 receipt 的直接用。
    let __stopShapeDumped = false;   // 未知形状只 dump 一次
    async function _awaitStopReceipt(x) {
        // 返回 { receipt, hash, shape }：shape='tx'|'receipt'|'unknown'|'null'
        if (!x) return { receipt: null, hash: null, shape: 'null' };
        try {
            if (typeof x.wait === 'function') {
                const r = await x.wait();
                return { receipt: r, hash: x.hash || (r && (r.transactionHash || r.hash)) || null, shape: 'tx' };
            }
            if (x.gasUsed !== undefined || x.status !== undefined || x.transactionHash !== undefined) {
                return { receipt: x, hash: x.transactionHash || x.hash || null, shape: 'receipt' };
            }
        } catch (e) { throw e; }   // wait() 真实失败(revert等)按原语义抛给调用方 catch
        if (!__stopShapeDumped) {
            __stopShapeDumped = true;
            try { log(`🔬 [停采诊断/形状观测] 队列 resolve 未知形状 keys=${JSON.stringify(Object.keys(x)).slice(0,200)}`); } catch (e) {}
        }
        return { receipt: null, hash: (x && x.hash) || null, shape: 'unknown' };
    }

    /**
     * estimateGas 门禁：重试/单发前先探一次会不会成功，通过才放行。
     * 命中本次调用内已判定"疑似卡链"的 kamiId（__stopStuckThisInvocation）
     * 直接短路进 blockedItems，不再消耗一次 RPC、更不会再发送任何 tx。
     * 返回 { passItems, blockedItems }：blockedItems 仍需调用方用
     * _emergencyClassifyEstimateBlocked 区分"已停/索引滞后"与"疑似卡链"。
     */
    async function _emergencyGateByEstimate(items, tag) {
        const passItems = [];
        const blockedItems = [];
        const passLogs = [];
        const blockLogs = [];
        for (const item of items) {
            if (!item.harvestId) continue;
            if (item.kamiId && __stopStuckThisInvocation.has(item.kamiId)) {
                blockedItems.push(item);
                blockLogs.push(`#${item.dbIndex}(已知卡链)`);
                continue;
            }
            const check = await _preCheckStop([item.harvestId]);
            if (check.ok) {
                passItems.push(item);
                passLogs.push(`#${item.dbIndex}`);
            } else {
                blockedItems.push(item);
                blockLogs.push(`#${item.dbIndex}(${check.reason || 'revert'})`);
                // 🔻SYNC→内部版[1.1.22 revert原因观测] C6：提取并打一次本 kami 的 estimateGas revert 原因串（纯观测，不改判定）。
                //   意图：下一夜日志确认"已停导致的 revert"是否带可辨识原因（参考部署 revert 带明文"kami not RESTING"）——
                //   若有，下版可升级为"已停实锤"的链上实时判据，完全绕开索引器滞后。同 invocation 相同原因串只打一次防刷屏。
                try {
                    const _rd = check.detail || check.reason || '';
                    if (_rd && !__stopRevertReasonSeen.has(_rd)) {
                        __stopRevertReasonSeen.add(_rd);
                        log(`   🔬 [停采诊断/revert原因] #${item.dbIndex}: ${_rd}`);
                    }
                } catch (_) {}
            }
        }
        const fmt = (arr) => arr.length > 8 ? `${arr.length}只(样例: ${arr.slice(0, 5).join(', ')}...)` : arr.join(', ');
        if (passLogs.length > 0) log(`   🔎 [停采诊断/estimateGas裁决/${tag}] 通过(仍可停) ${fmt(passLogs)}`);
        if (blockLogs.length > 0) log(`   🔎 [停采诊断/estimateGas裁决/${tag}] 未通过(待区分已停/卡链) ${fmt(blockLogs)}`);
        return { passItems, blockedItems };
    }

    /**
     * 【拉黑机制修正 · 务必保留】拉黑存在的理由：部分 kami 会卡在链上
     * （需游戏团队处理，可能持续数天），对它的任何停采操作都必然 revert，
     * 不能放任无限重试白烧 gas。0709 事故不是"拉黑该取消"，而是"抓错人"
     * ——把索引器滞后、其实已经停成的健康 kami 误判成卡链拉黑了 140 次。
     * 本函数把 estimateGas revert 的 kami 精确分三类：
     *   - stopped：链上 state 已不是 HARVESTING → 已停实锤，索引器只是
     *     还没追上，清计数、绝不拉黑；
     *   - cooldown（🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动
     *     remaining+cooldown解耦+classify冷却分支] 改动D新增）：链上 state
     *     仍是 HARVESTING，但仍在180s操作冷却期内（remain>0）——estimateGas
     *     revert 只是因为冷却没到期，不代表卡链，旧版二分会把这类连带
     *     误判成"疑似卡链"记失败/可能拉黑；改为归入 cooldown，不计失败不
     *     拉黑，转入 __stopCooldownDeferredThisInvocation 待冷却期满后
     *     统一补停；
     *   - stuck：链上 state 仍是 HARVESTING 且冷却已过期（remain===0）仍
     *     revert → 真正疑似卡链，记一次失败（复用 __stopFailCount/
     *     STOP_BLOCK_THRESHOLD，同一 kami 每次调用最多记 1 次，天然要求
     *     连续 ≥ STOP_BLOCK_THRESHOLD 次独立调用都判定卡链才会真正拉黑），
     *     并加入 __stopStuckThisInvocation——本次调用内不再对它做任何
     *     进一步操作。
     * 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集]
     * 修复2：新增第4类 unknown——estimateGas 已经失败，紧接着这里的
     * getByIndex 状态查询又失败（双重抖动）。旧版 catch 分支直接当"已停/
     * 索引器滞后"push 进 stopped，会经 _emergencyCreditBlocked →
     * _stopCreditSuccess 写入本次调用的内存成功集，之后 _stopFilterConfirmed
     * 会把它从 remaining 里剔掉——本次调用不再重试一个其实可能仍在
     * HARVESTING 的 kami（漏停偏向死亡，紧急停采场景"漏停"代价远大于
     * "多几次 RPC"）。改为不归入 stopped/stuck/cooldown 任何一类，单独放进
     * unknown 只做日志、不记账——不写成功集、不拉黑、不转 cooldown 队列，
     * 该 item 保持"未被确认"，若仍是真 HARVESTING 会在后续
     * _emergencyQueryStatus 里自然重新出现在 remaining，交下一轮/下次调用
     * 重试。
     */
    async function _emergencyClassifyEstimateBlocked(items, tag) {
        const stopped = [];
        const stuck = [];
        const cooldown = [];
        const unknown = []; // 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集] 修复2新增：查询失败保守保留，不归入任何credit类
        const deferBackoff = []; // 🔻SYNC→内部版[1.1.22 退避复读] C1+C3：疑似卡链但退避表未走完 → 入退避复读队列，本次不计失败（gasLikely 只改措辞）
        const stoppedLogs = [];
        const stuckLogs = [];
        const cooldownLogs = [];
        const unknownLogs = [];
        const deferLogs = [];
        for (const item of items) {
            if (item.kamiId && __stopStuckThisInvocation.has(item.kamiId)) {
                stuck.push(item);
                stuckLogs.push(`#${item.dbIndex}(已知)`);
                continue;
            }
            try {
                const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                const state = (res?.state || '').toUpperCase();
                if (state !== 'HARVESTING') {
                    stopped.push(item);
                    stoppedLogs.push(`#${item.dbIndex}`);
                    continue;
                }
                // 改动D：同一次 getByIndex（已带 {harvest:true}）顺手拿
                // harvest.time.last 判冷却，零新增查询。item.timeLast 可能是
                // 更早轮次缓存的旧值，优先用这次刚读到的新值，读不到才兜底
                // 用 item.timeLast（对应用户要求的"timeLast 缺失则补一次
                // getByIndex"——这里同一次查询已经带出该字段，无需再多发一次）。
                const timeLast = res?.harvest?.time?.last ?? item.timeLast;
                const remain = _cooldownRemainSec(timeLast);
                if (remain > 0) {
                    cooldown.push(item);
                    cooldownLogs.push(`#${item.dbIndex}(剩${remain}s)`);
                } else {
                    // BEFORE(Bug B前): frozen 时仍把 estimateGas revert + HARVESTING 判为疑似卡链，后续可能计数/拉黑。
                    if (_isFrontendFrozen()) {
                        unknown.push(item);
                        unknownLogs.push(`#${item.dbIndex}(frontendFrozen)`);
                        continue;
                    }
                    // 🔻SYNC→内部版[1.1.22 退避复读] C1+C3：estimateGas revert + 仍HARVESTING + 冷却已过期 = "疑似卡链"，
                    //   但不再当场记失败。先过退避门禁：走完全表且过证据窗(普通300s/gasLikely 30min)、群体滞后未冻结、终审复读仍HARVESTING 才真判 stuck；
                    //   否则入退避复读队列 defer，本次不计失败（真卡链最早 ~15min 后经拉黑通路落网，I2 保留）。
                    const decision = await _stopBackoffGate(item);
                    if (decision === 'count') {
                        stuck.push(item);
                        if (item.kamiId) __stopStuckThisInvocation.add(item.kamiId);
                        stuckLogs.push(`#${item.dbIndex}`);
                    } else {
                        // C1：gas 曾达真执行水平的（gasLikely）判"疑似已停(索引滞后)"，反转措辞；其余为"退避表未走完"
                        const _e = item.kamiId ? __stopPendingVerify.get(item.kamiId) : null;
                        deferBackoff.push(item);
                        if (_e && _e.gasLikely) {
                            deferLogs.push(`#${item.dbIndex}(本批gas曾达真执行水平→疑似已停/索引滞后)`);
                        } else {
                            deferLogs.push(`#${item.dbIndex}(退避表未走完t+${_e ? Math.round((Date.now() - _e.sentAt) / 1000) : 0}s/第${_e ? _e.attempts : 0}档)`);
                        }
                    }
                }
            } catch (_) {
                // 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集]
                // 修复2：查询失败改保守保留——不再当"已停"push进stopped（那样会
                // 经 _emergencyCreditBlocked 写入本次调用成功集，剔出 remaining，
                // 本次调用不再重试）。estimateGas 已经失败 + 这里的状态查询又失败
                // 是双重抖动，不代表该 kami 已停；也不当stuck/cooldown，单独归入
                // unknown，不credit任何一类——让它保持"未确认"状态，仍是真
                // HARVESTING 的话会在后续 _emergencyQueryStatus 里自然重新出现，
                // 交下一轮/下次调用重试（紧急停采场景"漏停"代价远大于"多查一次RPC"）。
                unknown.push(item);
                unknownLogs.push(`#${item.dbIndex}`);
            }
        }
        const fmt = (arr) => arr.length > 8 ? `${arr.length}只(样例: ${arr.slice(0, 5).join(', ')}...)` : arr.join(', ');
        if (stoppedLogs.length > 0) log(`   ✅ [停采诊断/${tag}] 已停实锤(estimateGas revert + 链上非HARVESTING，索引器滞后) → 清计数不拉黑: ${fmt(stoppedLogs)}`);
        if (cooldownLogs.length > 0) log(`   🧊 [停采诊断/${tag}/classify冷却分支] estimateGas revert + 仍HARVESTING + 仍在180s操作冷却(remain>0) → 不计失败不拉黑，转入cooldown待补停: ${fmt(cooldownLogs)}`);
        if (stuckLogs.length > 0) log(`   ⚠️ [停采诊断/${tag}] 疑似卡链(退避表走完走完全表+证据窗(300s/gasLikely 30min)+终审仍HARVESTING+estimateGas revert) → 记一次可疑计数，本次调用内不再对其发tx: ${fmt(stuckLogs)}`);
        if (deferLogs.length > 0) log(`   ⏸️ [停采诊断/${tag}] estimateGas revert 但退避复读未走完/本批gas曾达真执行水平 → 判"疑似已停(索引滞后)"，defer 交退避复读(不计失败): ${fmt(deferLogs)}`);
        if (unknownLogs.length > 0) log(`   ⚠️ [停采诊断/${tag}] estimateGas+状态查询双失败或前端疑似失真 → 保守保留(不入成功集/不拉黑/不判卡链)，交下轮重试: ${fmt(unknownLogs)}`);
        return { stopped, stuck, cooldown, unknown, deferBackoff };
    }

    /** 把 estimateGas 判定为"未通过"的 blockedItems 分类记账（stopped→成功清计数，stuck→失败计数，cooldown→汇入待补停队列不计失败/不拉黑，unknown→查询双失败不记账不剔remaining交下轮重试，deferBackoff→已入退避复读队列由15s调度器复读定夺不当场记失败）的便捷封装。 */
    async function _emergencyCreditBlocked(blockedItems, tag) {
        if (!blockedItems || blockedItems.length === 0) return;
        const { stopped, stuck, cooldown } = await _emergencyClassifyEstimateBlocked(blockedItems, tag);
        // 注：deferBackoff 已在 classify 内 _stopBackoffGate → _stopBackoffEnroll 入队，此处无需再记账（不计失败=交退避复读）。
        for (const item of stopped) _stopCreditSuccess(item, `estimateGas裁决已停实锤/${tag}`);
        for (const item of stuck) _stopCreditFail(item, '疑似卡链(estimateGas revert+state仍HARVESTING)');
        if (cooldown.length > 0) {
            // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
            // 改动D：汇入模块级冷却队列（emergencyStopHarvest() 内的局部变量
            // cooldownDeferred 直接引用同一个 Map，见该函数内注释），交本轮
            // 结束后的 cooldown 收尾统一处理，不计入失败/不拉黑
            for (const item of cooldown) __stopCooldownDeferredThisInvocation.set(item.dbIndex, item);
            log(`   🧊 [停采诊断/${tag}] ${cooldown.length}只转入cooldown待补停队列(不计失败/不拉黑)`);
        }
    }

    // 后台索引器滞后诊断：纯观测，不阻塞主流程；gas 不再作为停成凭据。
    // 自适应轮询直到本地索引器翻成非 HARVESTING 或达到轮询上限（仍 HARVESTING 表示未权威确认，下轮保留重试）。
    function _emergencyDiagIndexLag(items, tag) {
        if (!items || items.length === 0) return;
        const start = Date.now();
        (async () => {
            let remaining = items.slice();
            let idx = 0;
            while (remaining.length > 0 && (Date.now() - start) < EMERGENCY_CONFIG.INDEX_LAG_POLL_CAP_MS) {
                const waitMs = EMERGENCY_CONFIG.INDEX_LAG_POLL_MS[Math.min(idx, EMERGENCY_CONFIG.INDEX_LAG_POLL_MS.length - 1)];
                await delay(waitMs);
                idx++;
                const stillLagging = [];
                for (const item of remaining) {
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                        const state = (res?.state || '').toUpperCase();
                        if (state === 'HARVESTING') {
                            stillLagging.push(item);
                        } else {
                            const lagMs = Date.now() - start;
                            try { __stopIndexLagMsList.push(lagMs); } catch (_) {}   // 🔻SYNC→内部版[1.1.22 退避复读] C4：收集索引器滞后供完成小结算中位
                            log(`   📈 [停采诊断] ${tag} #${item.dbIndex} 索引器滞后 ${(lagMs / 1000).toFixed(1)}s 才反映停采`);
                        }
                    } catch (_) {
                        stillLagging.push(item);
                    }
                }
                remaining = stillLagging;
            }
            if (remaining.length > 0) {
                const idxFmt = remaining.length > 8
                    ? `${remaining.length}只(样例: ${remaining.slice(0, 5).map(x => '#' + x.dbIndex).join(', ')}...)`
                    : remaining.map(x => `#${x.dbIndex}`).join(', ');
                // BEFORE(Bug B前): 这里使用 gas 成功免责语义，会让仍 HARVESTING 被 gas 覆盖。
                log(`   ⏰ [停采诊断] ${tag} 索引器对账超时(${EMERGENCY_CONFIG.INDEX_LAG_POLL_CAP_MS / 1000}s)仍为HARVESTING: ${idxFmt}（未被state复读确认停成，保留到下轮重试）`);
            }
        })().catch(e => { try { log(`   ⚠️ [停采诊断] 索引器对账异常: ${e?.message || e}`); } catch (_) {} });
    }

    // 回退通道：底层合约句柄/签名器不可用时，改走游戏自带的 api.stop 批量停采
    // （整批同成同败，无"坏的自动跳过"能力，仅在 AllowFailure 依赖缺失时使用）
    async function _apiStopBatchFallback(items) {
        log(`⚠️ [紧急停采] AllowFailure不可用，回退到api.stop`);
        const api = window.network?.api?.player?.pet?.harvest;
        const ids = items.map(x => x.harvestId).filter(Boolean);
        if (!api?.stop) return { success: false, error: 'API不可用', items };
        const batchStart = Date.now();
        try {
            log(`📤 [紧急停采/api.stop fallback] ${ids.length}个`);
            const tx = await api.stop(ids);
            const elapsed = Date.now() - batchStart;
            if (tx) {
                const hash = tx.hash || '';
                log(`✅ [紧急停采/api.stop fallback] 成功 ${elapsed}ms tx:${hash ? hash.slice(0, 10) + '...' : 'ok'}`);
                return { success: true, txHash: hash, elapsed, items };
            }
            return { success: false, error: 'API返回空', items };
        } catch (e) {
            const elapsed = Date.now() - batchStart;
            log(`❌ [紧急停采/api.stop fallback] 失败 ${elapsed}ms: ${(e?.message || e).slice(0, 50)}`);
            return { success: false, error: e?.message || String(e), items };
        }
    }

    /**
     * 发送阶段：只广播 tx，不等确认。发送阶段本身的失败（nonce冲突/网络
     * 错误/无harvestId/依赖缺失）在这里同步捕获，供确认阶段直接读取，
     * 不需要真的去 await 一个不存在的 tx.wait()。
     */
    async function _emergencySendOnly(items) {
        const system = window.network?.txQueue?.systems?.["system.harvest.stop"];
        const signer = window.network?.network?.signer;
        const ids = items.map(x => x.harvestId).filter(Boolean);
        const sentAt = Date.now();

        if (ids.length === 0) {
            return { items, sentAt, error: '无harvestId', useFallback: false };
        }
        if (!system?.interface || !signer) {
            return { items, sentAt, error: null, useFallback: true };
        }

        try {
            // 🔻SYNC→内部版[1.1.19 停采通道统一]
            // 发送通道：默认走 MUD txQueue（system 即 txQueue.systems["system.harvest.stop"]，
            //   与 api 同一 nonce 账本，消除 signer.sendTransaction 造成的双账本 sequence mismatch）；
            //   队列入口缺失时打 ⚠️ 并自动跌落到下方原始签名器路径（逐字节保留）。返回对象形状
            //   与原路完全一致（含可 .wait() 的 tx），下游 _emergencyConfirmBatch 零改动消费。
            if (_getStopTxChannel() === 'mud') {
                if (typeof system.executeBatchedAllowFailure !== 'function') {
                    __stopChanFallbackCount++;   // 🔻SYNC→内部版[1.1.19 停采通道统一] D3：跌落 raw 计数
                    log(`⚠️ [停采诊断/通道] MUD 队列停采入口不可用，本批自动回退原始签名器`);
                    /* 跌落到下方原始签名器分支 */
                } else {
                    log(`📤 [停采诊断/发送] ${ids.length} 个（MUD队列/nonce统一）...`);
                    // 🔻SYNC→内部版[1.1.19 停采通道统一·背靠背修正]
                    // 不 await：MUD 队列 promise 可能要等上链才 resolve（链上 RPC 为
                    // eth_sendRawTransactionSync），await 会把多批"背靠背广播"退化成
                    // "串行等上链"（每批+2~6s）。这里只入队拿 promise，正确性不再依赖
                    // resolve 语义；立即附 noop catch 防悬空期 unhandled rejection（真正的
                    // 错误处理在确认阶段 await txPromise 时做）。raw 分支照旧返回 tx。
                    const txPromise = system.executeBatchedAllowFailure(ids);
                    txPromise.catch(() => {});
                    _gasLedgerRecord('stop', ids, txPromise);   // 🔻SYNC[1.2.7 gas真值账本] 记账 hook（紧急停采 mud 分支，fire-and-forget promise 抓 hash）
                    // 🔻SYNC→内部版[1.1.19 停采通道统一] D1：发送段耗时（sentAt 即入口 t0，证明发送段快、背靠背成立）
                    log(`📡 [停采诊断/通道] 本批经 MUD 队列已入队(nonce统一，tx 交确认阶段解析) 耗时${Date.now()-sentAt}ms`);
                    return { items, sentAt, tx: null, txPromise, error: null, useFallback: false, nonce: null };
                }
            }
            // ---- 原始签名器通道（回退，逐字节保留）----
            const nonceInfo = await _tryReadNonce(signer);
            log(`📤 [停采诊断/发送] ${ids.length} 个${nonceInfo != null ? ` nonce=${nonceInfo}` : ''}...`);
            const bigIntIds = ids.map(id => BigInt(id));
            const data = system.interface.encodeFunctionData('executeBatchedAllowFailure', [bigIntIds]);
            const tx = await signer.sendTransaction({ to: system.target, data });
            if (!tx) {
                return { items, sentAt, error: '返回空Tx', useFallback: false };
            }
            _gasLedgerRecord('stop', ids, tx);   // 🔻SYNC[1.2.7 gas真值账本] 记账 hook（紧急停采 raw 分支）
            return { items, sentAt, tx, error: null, useFallback: false, nonce: nonceInfo };
        } catch (e) {
            return { items, sentAt, error: e?.message || String(e), useFallback: false };
        }
    }

    /**
     * 确认阶段：等这一批 tx 的回执，按"每只均摊 gas"分三级裁决。
     * ≥GAS_FULL_EXEC_PER_KAMI → 像全执行：gas 仅观测，后台起一个不
     *   阻塞的索引器滞后诊断，本批 pendingVerify，不计成功/失败；
     * ≤GAS_FULL_REVERT_PER_KAMI → 全revert：逐只 estimateGas 裁决；
     * 其余 → 混合：估算实际执行只数（仅日志），仍逐只 estimateGas 裁决。
     * 熔断计数：本批整体呈"全revert/estimateGas 判定全部仍可停但没停成"
     * 时累加 __stopConsecutiveRevertBatches，达到 CIRCUIT_BREAK_STREAK
     * 即置位 __stopCircuitBroken（Change D）。
     */
    async function _emergencyConfirmBatch(sent) {
        const items = sent.items;

        if (sent.error === '无harvestId') {
            return { success: false, error: '无harvestId', items };
        }
        if (sent.useFallback) {
            return _apiStopBatchFallback(items);
        }
        if (!sent.tx && !sent.txPromise) {
            // 发送阶段就出错了（未上链）：按错误特征分类打日志，语义与旧版一致
            // （mud 分支成功入队时 tx 为 null 但带 txPromise，不落此路，交下方 try 内解析）
            const errMsg = sent.error || '未知错误';
            const isTimeout = errMsg.includes('timeout') || errMsg.includes('not mined');
            const isNonceError = errMsg.toLowerCase().includes('nonce') || errMsg.includes('sequence mismatch');
            const isRpcError = errMsg.includes('RPC') || errMsg.includes('network');
            const batchIndexes = items.map(x => `#${x.dbIndex}`).join(', ');
            if (isTimeout) {
                log(`⏱️ [紧急停采/AllowFailure] 超时，交易可能已发出 (本批 ${items.length} 个: ${batchIndexes})`);
            } else if (isNonceError) {
                log(`⚠️ [紧急停采/AllowFailure] Nonce冲突，交易未发出，全部 ${items.length} 个未停采 (${batchIndexes})`);
            } else if (isRpcError) {
                log(`❌ [紧急停采/AllowFailure] 网络错误，交易未发出，全部 ${items.length} 个未停采 (${batchIndexes})`);
            } else {
                log(`❌ [紧急停采/AllowFailure] 发送失败，全部 ${items.length} 个未停采 (${batchIndexes}): ${errMsg.slice(0, 80)}`);
            }
            return { success: false, error: errMsg, isTimeout, items };
        }

        try {
            // 🔻SYNC→内部版[1.1.19 停采通道统一·背靠背修正]
            // mud 分支发送阶段只入队拿 txPromise（未 await），在此解析成 tx；await
            // 抛错则落入下方 catch，与 raw 分支 tx 发送失败的错误路径语义对齐，对 items
            // 的记账不变。raw 分支 sent.tx 已就绪，此行短路跳过。
            // 🔻SYNC→内部版[1.1.19 停采通道统一] D2：关键计时器——队列 promise resolve 于"拿hash"还是"等上链"，用首夜实盘标定（await 本身不变，仅两侧计时）
            if (!sent.tx && sent.txPromise) {
                const __ptStart = Date.now();
                sent.tx = await sent.txPromise;
                const __ptMs = Date.now() - __ptStart;
                log(`📡 [停采诊断/mud队列] txPromise解析耗时=${__ptMs}ms（参考:≤300ms≈拿hash即返;≥2000ms≈等上链后返）`);
            }
            const waitStart = Date.now();
            // 🔻SYNC→内部版[1.1.21 停采回执适配] 队列 resolve 出的可能是 tx(带wait) 也可能直接是 receipt，
            //   统一经 _awaitStopReceipt 归一；raw 分支 sent.tx 带 wait，走 wait() 语义/行为逐字节等价。
            const { receipt, hash: rawHash, shape } = await _awaitStopReceipt(sent.tx);
            const confirmMs = Date.now() - waitStart;
            try { __stopTxConfirmMsList.push(confirmMs); } catch (_) {}   // 🔻SYNC→内部版[1.1.22 退避复读] C4：收集本批 tx 确认耗时供完成小结算中位/最慢
            try { _recordTxConfirmMs(confirmMs); } catch (_) {}           // 🔻SYNC→内部版[1.2.4 部署防重发门禁] D4v2：同一确认耗时入滚动p90自适应窗口（跨会话持久化，供 _adaptiveStopWaitMs 用）
            const hash = rawHash ? String(rawHash).slice(0, 10) + '...' : 'N/A';

            // 🔻SYNC→内部版[1.1.21 停采回执适配] I2 最高红线：形状未知，或回执缺 gasUsed（gasUsed==null，
            //   拿不到 gas 就无法做 gas 判级）——一律收敛到 pendingVerify+state 复读：本批不计成功/不计失败、
            //   不重发、绝不当 full_revert。旧码 `gasUsed != null ? Number(...) : 0` 的 :0 分支会把缺 gas
            //   误判成全 revert（0≤阈值），是事故式假失败根因之一，此处彻底消灭。
            if (shape === 'unknown' || !receipt || receipt.gasUsed == null) {
                __stopConsecutiveRevertBatches = 0;
                __pendingVerifyBatchCount++;
                log(`⚠️ [停采诊断/确认适配] 回执形状未知/缺gas，转 state 复读裁决（本批不计成功/不计失败，成功交由下轮复读 state≠HARVESTING 判定）tx:${hash} shape=${shape}`);
                for (const it of items) _stopBackoffEnroll(it, false);   // 🔻SYNC→内部版[1.1.22 退避复读] C2：pendingVerify(缺gas)批入退避复读队列，由15s调度器复读确认（gasLikely=false，无gas凭据）
                _emergencyDiagIndexLag(items, `tx:${hash}`);
                return {
                    success: true, txHash: rawHash || '', elapsed: confirmMs,
                    okCount: 0, failCount: 0,
                    cooldownList: [], realFailList: [],
                    gasLevel: 'unknown', pendingVerify: true, items
                };
            }

            const gasUsedNum = Number(receipt.gasUsed.toString());
            const perKami = items.length > 0 ? gasUsedNum / items.length : 0;

            log(`⏱️ [停采诊断] tx确认耗时=${confirmMs}ms tx:${hash} gasUsed=${gasUsedNum} 每只均摊=${Math.round(perKami)}`);

            // status 缺失（== null）不当失败：只有明确读到非 1 才判交易执行失败（raw 回执 status 恒为 0/1，行为等价）
            if (receipt.status != null && Number(receipt.status) !== 1) {
                log(`❌ [紧急停采/AllowFailure] 交易上链但执行失败 tx:${hash} (全部 ${items.length} 个未停采)`);
                return { success: false, error: '交易执行失败', elapsed: confirmMs, items };
            }

            // 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集]
            // 修复1：full_exec 改真双条件——单看"每只均摊 gas"会被"少败多成"的
            // 混合批骗过（如9成执行1只revert，均摊≈1.41M仍>1.2M阈值），误判
            // 全执行导致真失败被漏判。estimatedExecuted（混合批估算实际执行只数）
            // 原来只在 mixed 分支算、仅供日志展示，这里提到判级之前，让 full_exec
            // 额外要求"估算执行只数≥全员"才成立；GAS_FULL_EXEC_PER_KAMI 阈值本身
            // 不变，不靠抬阈值堵漏，靠第二维。
            const estimatedExecuted = Math.max(0, Math.round((gasUsedNum - EMERGENCY_CONFIG.GAS_REVERT_BASE) / EMERGENCY_CONFIG.GAS_PER_KAMI_ESTIMATE));
            let level;
            if (perKami >= EMERGENCY_CONFIG.GAS_FULL_EXEC_PER_KAMI && estimatedExecuted >= items.length) level = 'full_exec';
            else if (perKami <= EMERGENCY_CONFIG.GAS_FULL_REVERT_PER_KAMI) level = 'full_revert';
            else level = 'mixed';

            if (level === 'full_exec') {
                // BEFORE(Bug B前): full_exec 直接 for(item) _stopCreditSuccess(...) 并 return success，gas 单独驱动 remaining 剔除。
                __stopConsecutiveRevertBatches = 0;
                __pendingVerifyBatchCount++;   // 🔻SYNC→内部版[1.1.17 可观测性批次] C4：pendingVerify 批数 +1（纯统计）
                log(`🟡 [停采诊断/gas] 每只≈${Math.round(perKami)} 像执行了，但 gas 不作停成凭据 → pendingVerify（本批不计成功/不计失败，成功交由下轮复读 state≠HARVESTING 判定）`);
                // 🔻SYNC→内部版[1.1.22 退避复读] C1+C2：full_exec 批入退避复读队列并打 gasLikely（gas 曾达真执行水平）。
                //   下次调用若该 kami 因索引器滞后 estimateGas revert，classify 会据此 defer 判"疑似已停(索引滞后)"而非当场记失败。
                for (const it of items) { try { it._gasLikelyExecuted = true; } catch (_) {} _stopBackoffEnroll(it, true); }
                _emergencyDiagIndexLag(items, `tx:${hash}`);
                return {
                    success: true, txHash: rawHash || '', elapsed: confirmMs,
                    okCount: 0, failCount: 0,
                    cooldownList: [], realFailList: [],
                    gasLevel: 'full_exec', pendingVerify: true, items
                };
            } else if (level === 'mixed') {
                log(`🟡 [停采诊断/gas判级] 混合(每只${Math.round(perKami)}，估算执行≈${estimatedExecuted}只<全员${items.length}) → 逐只estimateGas裁决`);
            } else {
                log(`🔴 [停采诊断/gas判级] 全revert(每只${Math.round(perKami)}≤${EMERGENCY_CONFIG.GAS_FULL_REVERT_PER_KAMI}) → 逐只estimateGas裁决`);
            }

            const { passItems: stillStoppable, blockedItems: probablyStopped } = await _emergencyGateByEstimate(items, `tx:${hash}`);
            await _emergencyCreditBlocked(probablyStopped, `tx:${hash}`);

            // 熔断判据：本批 gas 判"全revert"，或 estimateGas 裁决后发现全体
            // 都仍是"可停但没停成"（这批 tx 对它们完全没生效）→ 计一次疑似空转
            if (level === 'full_revert' || (items.length > 0 && stillStoppable.length === items.length)) {
                __stopConsecutiveRevertBatches++;
                if (__stopConsecutiveRevertBatches >= EMERGENCY_CONFIG.CIRCUIT_BREAK_STREAK) {
                    __stopCircuitBroken = true;
                    log(`%c🛑 [停采诊断] 熔断：连续 ${__stopConsecutiveRevertBatches} 批疑似全revert/未生效，本次调用不再发新tx，交下一轮对账`,
                        'color: red; font-weight: bold;');
                }
            } else {
                __stopConsecutiveRevertBatches = 0;
            }

            // stillStoppable 分流：cooldown（time.last 公式为主，DOM 按钮降级为 || 兜底——
            // 0708 实测定案：胶水/自身操作均刷新 time.last，DOM 判据实盘已失效恒 false）
            const cooldownList = [];
            const realFailList = [];
            for (const item of stillStoppable) {
                const remain = _cooldownRemainSec(item.timeLast);
                const inCooldown = remain > 0 || _isKamiInCooldown(item);
                if (inCooldown) {
                    cooldownList.push(item);
                } else {
                    realFailList.push(item);
                }
            }

            const failIndexes = realFailList.map(x => `#${x.dbIndex}`).join(', ');
            const cdIndexes = cooldownList.map(x => `#${x.dbIndex}`).join(', ');
            log(`📊 [紧急停采/AllowFailure] 本批 ${items.length} 个: 成功 ${items.length - stillStoppable.length}, cooldown推迟 ${cooldownList.length}${cooldownList.length > 0 ? ' → ' + cdIndexes : ''}, 真失败 ${realFailList.length}${realFailList.length > 0 ? ' → ' + failIndexes : ''}`);

            if (realFailList.length > 0) {
                for (const item of realFailList) _stopCreditFail(item);
            }

            return {
                success: true, txHash: rawHash || '', elapsed: confirmMs,
                okCount: items.length - stillStoppable.length, failCount: realFailList.length,
                cooldownList, realFailList, gasLevel: level, items
            };
        } catch (e) {
            const errMsg = e?.message || String(e);
            const isTimeout = errMsg.includes('timeout') || errMsg.includes('not mined');
            const batchIndexes = items.map(x => `#${x.dbIndex}`).join(', ');
            // 🔻SYNC→内部版[1.1.21 确认异常文案区分]（codex Q5#5）
            //   本 catch 位于确认阶段——send 错误已在上方 `if (!sent.tx && !sent.txPromise)` 提前返回，
            //   落到这里的一律是"tx 已入队但确认(txPromise 解析/回执归一)阶段抛错"，不得再写"发送失败/未发出/未停采"
            //   （tx 其实已入队），改为交 state 复读裁决的中性文案；本批不 _stopCreditFail，成员留待轮末 state 复读定夺。
            log(`❌ [紧急停采/确认异常] tx 已入队但确认阶段出错(${errMsg.slice(0, 80)})，成员状态交 state 复读裁决 (本批 ${items.length} 个: ${batchIndexes})`);
            return { success: false, error: errMsg, isTimeout, items };
        }
    }

    /**
     * 单批厚包装：背靠背执行"发送 → 确认"，对外返回值形状与 v1.1.11
     * 保持一致（success/okCount/failCount/cooldownList/realFailList/
     * txHash/elapsed），供未走并行改造的零散调用点（首批强化/cooldown
     * 重试等）直接沿用，无需改动调用方代码。熔断生效时直接短路，不发送。
     */
    async function _emergencySendBatch(items) {
        if (__stopCircuitBroken) {
            log(`   ⏭️ [停采诊断] 熔断生效中，跳过本批发送 (${items.length} 个)，交下一轮对账`);
            return { success: false, error: '熔断', circuitBroken: true, items };
        }
        const sent = await _emergencySendOnly(items);
        return _emergencyConfirmBatch(sent);
    }

    // 重试候选刷新：查一次链上最新状态；非HARVESTING的直接判"已停"记成功
    // 清零计数，仍在采的换上最新harvestId纳入候选，供后续estimateGas门禁筛选。
    async function _emergencyRefreshCandidates(items) {
        const candidates = [];
        for (const item of items) {
            try {
                const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                if (res?.state !== 'HARVESTING') { _stopCreditSuccess(item, '候选刷新链上直读非HARVESTING'); continue; }
                const freshHid = res?.harvest?.id || item.harvestId;
                if (freshHid) candidates.push({ ...item, harvestId: freshHid, timeLast: res?.harvest?.time?.last ?? item.timeLast });
            } catch (_) {
                if (item.harvestId) candidates.push(item);
            }
        }
        return candidates;
    }

    // 重试候选 → estimateGas 门禁 → 通过的批量重发一次并确认；未通过的分类记账（已停/疑似卡链）
    async function _emergencyRetryBatchGated(items, tag) {
        // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
        // 熔断检查：本函数直接调用 _emergencySendOnly（不经过带熔断短路的
        // _emergencySendBatch 厚包装），必须在这里显式补一道，否则熔断可能
        // 在本轮confirm阶段刚触发，紧接着的首批强化/整批失败重试仍会漏网发送
        if (__stopCircuitBroken) {
            log(`   ⏭️ [停采诊断] 熔断生效中，跳过${tag}批量重试`);
            return { retryItems: [], retryResult: null };
        }
        const candidates = await _emergencyRefreshCandidates(items);
        const { passItems: retryItems, blockedItems: gateBlocked } = await _emergencyGateByEstimate(candidates, tag);
        await _emergencyCreditBlocked(gateBlocked, tag);
        if (retryItems.length === 0) return { retryItems, retryResult: null };
        const retryFmt = retryItems.map(x => `#${x.dbIndex}`).join(', ');
        log(`🔴 [紧急停采/${tag}] ${retryItems.length} 个未停采(estimateGas已过闸)，批量重试: ${retryFmt}`);
        const retrySent = await _emergencySendOnly(retryItems);
        const retryResult = await _emergencyConfirmBatch(retrySent);
        return { retryItems, retryResult };
    }

    // 批量重试后仍失败的，逐只单发（同样先过 estimateGas 闸门），接住 _allowFailureStop 的返回值记账
    async function _emergencySingleRetryGated(items, tag) {
        // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
        // 熔断检查：单只降级路径直接调用 _allowFailureStop 发真实 tx，必须
        // 在发送前挡住，否则熔断生效期间仍可能逐只漏网发送
        if (__stopCircuitBroken) {
            log(`   ⏭️ [停采诊断] 熔断生效中，跳过${tag}单独重试 (${items.length} 个)`);
            return;
        }
        const candidates = await _emergencyRefreshCandidates(items);
        const { passItems: singleRetryItems, blockedItems: singleBlocked } = await _emergencyGateByEstimate(candidates, tag);
        await _emergencyCreditBlocked(singleBlocked, tag);
        for (const item of singleRetryItems) {
            const deltaFmt = typeof item.delta === 'number' ? item.delta.toFixed(2) : item.delta;
            log(`   🔴 #${item.dbIndex} (Δ=${deltaFmt}%) 单独重试...`);
            const ok = await _allowFailureStop([item.harvestId], `#${item.dbIndex}`);
            // BEFORE(Bug B前): _allowFailureStop 的 gas full_exec true 会直接 _stopCreditSuccess；false 会记失败。
            if (ok === true) _stopCreditSuccess(item, '单独重试state复读确认'); else if (ok === false) _stopCreditFail(item); else _stopBackoffEnroll(item, true);   // 🔻SYNC→内部版[1.1.22 退避复读] C1/C2：null=pendingVerify，入退避复读队列
            await delay(300);
        }
    }

    // ============================================================
    // 【板块：紧急停采 · 链上状态批量查询 _emergencyQueryStatus】
    // ------------------------------------------------------------
    // ▍功能：并发查询一批 kami 的链上真实状态，分成两组返回：
    //   stillHarvesting（仍在采集，需要停）/ alreadyStopped（已停止，
    //   无需再发 TX）；同时用链上返回的 harvest.id 刷新 item.harvestId
    //   —— 本地库/DOM 缓存的 harvestId 可能已过期，以链上为准。
    // ▍触发时机：紧急停采主流程在发送前确认名单、或发送后复核战果时调用。
    // ▍依赖：
    //   - window.network.explorer.kamis.getByIndex(dbIndex, {harvest:true})
    //     —— 本地索引器接口，读状态零 gas；
    //   - _emergencyRunPool —— 并发池；
    //   - EMERGENCY_CONFIG.CONFIRM_CONCURRENCY —— 查询并发数（配置区定义）；
    //   - _emergencyGetState —— 把原始返回归一化为三态。
    // ▍核心流程：1) 空清单直接返回两空数组；2) 并发池逐个查询并解析
    //   state；3) 'harvesting' 归入 stillHarvesting，其余（resting/dead/
    //   unknown）归入 alreadyStopped。
    // ▍边界与保护：单个查询抛错时该 kami 记为 state:'unknown'，不中断
    //   整批；unknown 归入 alreadyStopped 一侧——本函数服务于「决定还
    //   要不要发停采 TX」，状态不明时宁可不发，避免因 RPC 抖动对同一
    //   kami 重复烧 gas（与发送后复核「查不到保守算未停」方向相反，
    //   两处各自服务于省 gas 与保命）。
    // ▍可调参数：EMERGENCY_CONFIG.CONFIRM_CONCURRENCY —— 并发数；
    //   调大查询更快但更容易压垮 RPC/索引器，调小更稳但拖慢紧急响应。
    // ============================================================
    async function _emergencyQueryStatus(items) {
        if (!items?.length) return { stillHarvesting: [], alreadyStopped: [] };

        const results = await _emergencyRunPool(items, async (item) => {
            try {
                const res = await window.network.explorer.kamis.getByIndex(item.dbIndex, { harvest: true });
                return {
                    item: { ...item, harvestId: res?.harvest?.id || item.harvestId },
                    state: _emergencyGetState(res)
                };
            } catch (e) {
                return { item, state: 'unknown' };
            }
        }, EMERGENCY_CONFIG.CONFIRM_CONCURRENCY);

        const stillHarvesting = [], alreadyStopped = [];
        for (const r of results) {
            if (r.state === 'harvesting') {
                stillHarvesting.push(r.item);
            } else {
                // 🔻SYNC→内部版[1.1.21 轮末已停实锤记账] 把归一后的链上态挂到 item 上，供调用方区分"确实读到非HARVESTING(resting/dead/stopped)"
                //   与"查询抛错的 unknown"——只有前者才可据以 _stopCreditSuccess 清失败计数，绝不据 unknown（读取失败）假记成功。
                alreadyStopped.push({ ...r.item, _resolvedState: r.state });
            }
        }
        return { stillHarvesting, alreadyStopped };
    }

    // ============================================================
    // 【板块：紧急停采 · 链上状态解析 _emergencyGetState】
    // ------------------------------------------------------------
    // ▍功能：把索引器返回的原始对象归一化为三态字符串：
    //   'harvesting' / 'resting' / 'dead'。
    // ▍触发时机：仅被 _emergencyQueryStatus 调用（纯函数，无副作用）。
    // ▍依赖：无外部依赖。
    // ▍核心流程：1) 优先看 res.state 字段（转大写比较）：HARVESTING /
    //   RESTING / DEAD 直接映射；2) state 缺失或为其他值时回退看
    //   harvest 子对象：存在且 isEnded 为假 → 仍在采集；isEnded 为真
    //   → 采集已结束按 resting 处理；3) 完全判不出时默认 'resting'
    //   —— 上层据此不会再发停采，避免对状态不明的 kami 空烧 gas。
    // ▍边界与保护：res 为 null/undefined 时全程可选链兜底，不抛错。
    // ▍可调参数：无。
    // ============================================================
    function _emergencyGetState(res) {
        const s = (res?.state || '').toUpperCase();
        if (s === 'HARVESTING') return 'harvesting';
        if (s === 'RESTING') return 'resting';
        if (s === 'DEAD') return 'dead';
        // state 字段缺失/异常时，回退看 harvest 子对象判断采集是否结束
        const h = res?.harvest;
        if (h && !h.isEnded) return 'harvesting';
        if (h?.isEnded) return 'resting';
        // 完全判不出时默认已停，避免对状态不明的 kami 重复发停采
        return 'resting';
    }

    // ============================================================
    // 【板块：紧急停采 · DOM 扫描危险 kami _emergencyScanKamis】
    // ------------------------------------------------------------
    // ▍功能：扫描 party 面板 DOM，找出 HP 已逼近/跌破各自停采线的
    //   「采集中」kami（含 HP=0% 的 STARVING 饿死态），生成待停采
    //   清单并按危险程度排序（delta 升序，最危险在前）返回。
    //   纯 DOM 读取，零 gas、零 RPC。
    // ▍触发时机：紧急停采主流程每轮开始时调用，决定本轮要停谁。
    // ▍依赖：
    //   - DOM 卡片容器 selector：
    //     div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div
    //     —— party 面板中每只 kami 的卡片（结构随游戏前端更新可能变化，
    //     若扫描数为 0 需优先排查此 selector）；
    //   - 卡片内 img[src*="/assets/kami_"] —— 状态图标，src 含
    //     kami_harvesting 即为采集中；其相邻兄弟节点文本含 "(NN%)"
    //     即 HP 百分比；
    //   - getEyeState() —— 页面「眼睛」开关状态，仅用于诊断日志；
    //   - getimgNumber(div) —— 从卡片形象图 URL 提取 kami 编号；
    //   - window.kami_core_db —— 精简数据库脚本构建的本地 kami 数据库，
    //     按 imgNumber 匹配出 index / kamiId / harvestId / LT / body 等字段；
    //   - MAX_THRESHOLD / DEFAULT_THRESHOLD_NORMAL / DEFAULT_THRESHOLD_OTHER
    //     —— 停采线常量（配置区定义）。
    // ▍核心流程：
    //   1) 选出全部卡片 div 逐个处理：状态图非 kami_harvesting 的直接
    //      跳过（只有采集中的 kami 才存在停采需求）；
    //   2) 从状态图相邻节点解析 HP 文本 "(NN%)"，解析失败记日志后跳过；
    //   3) hp === 0 判为 STARVING（采集中但 HP 归零＝正在饿死，最高优先级）；
    //   4) 按 imgNumber 查 kami_core_db，查无记录跳过（无法定位链上 id）；
    //   5) 计算个体停采线 thr：有有效清算线 LT 时取 min(LT+LT_STOP_MARGIN, MAX_THRESHOLD)
    //      —— 在精确清算线上方留 LT_STOP_MARGIN（当前 3）个百分点安全垫，同时被全局上限封顶；
    //      无 LT 时按体型回退（body==='normal' 用 DEFAULT_THRESHOLD_NORMAL，
    //      其余用 DEFAULT_THRESHOLD_OTHER）；
    //   6) delta = hp - thr；delta <= maxDelta 或 STARVING 即入选；
    //   7) 打汇总日志，按 delta 升序排序返回。
    // ▍边界与保护：
    //   - 单卡片解析异常被 try/catch 吞掉并记日志，不影响其余卡片；
    //   - HP 解析失败（NaN）跳过并记录原始文本，便于排查 DOM 变更；
    //   - STARVING 数量 > 10 时打红色告警——大面积 STARVING 更可能是
    //     DOM 渲染异常导致的集体误判，提示先核对日志里的 hpRaw 原始
    //     文本，而不是对着假数据狂发停采；
    //   - 全程统计 scanIdx / harvestingCount / starvingDetected，
    //     日志可完整还原每只 kami 的判定过程。
    // ▍可调参数：
    //   - maxDelta（形参，默认 1）—— 入选宽容度：默认只收「HP 距停采线
    //     1% 以内」的临界 kami；调用方可放宽到 5/8，把近临界 kami 一并
    //     凑进同一批，摊薄单笔 TX 的 gas（批量化甜区策略）；放得太宽
    //     等于提前停采，会缩短单周期采集时长；
    //   - LT_STOP_MARGIN = 3 —— 停采线相对精确清算线的安全垫（百分点，
    //     定义在头部常量区）；调大更保命但采集时间变短，调小反之、贴线更凶险；
    //   - STARVING 告警阈值 10 —— 触发红色异常提示的数量线，只影响告警
    //     不影响停采行为。
    // ============================================================
    function _emergencyScanKamis(maxDelta = 1) {
        const list = [];
        const kamis = document.querySelectorAll(
            'div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div'
        );

        // 诊断日志：记录扫描时的DOM原始数据，便于排查误判
        const eyeState = getEyeState();
        log(`🔍 [DOM扫描] 开始扫描, 眼睛=${eyeState}, 匹配div数=${kamis.length}, maxDelta=${maxDelta}`);
        let scanIdx = 0;
        let harvestingCount = 0;
        let starvingDetected = 0;

        for (const div of kamis) {
            try {
                // DOM状态检测：kami_harvesting + HP=0% → STARVING
                const img = div.querySelector('img[src*="/assets/kami_"]');
                if (!img?.src?.includes('kami_harvesting')) { scanIdx++; continue; } // 只关注采集中（含STARVING）
                harvestingCount++;

                const hpDiv = img?.nextElementSibling;
                const hpTag = hpDiv?.tagName || 'null';
                const hpText = hpDiv?.textContent?.trim() || '';
                const match = hpText.match(/\((\d+)%\)/);
                const hp = match ? parseInt(match[1], 10) : NaN;

                // 详细诊断：HP解析失败（NaN）时记录原始文本并跳过该卡片，便于排查DOM变更
                if (isNaN(hp)) {
                    log(`  [扫描#${scanIdx}] harvesting但HP解析失败: <${hpTag}> "${hpText.slice(0, 60)}", 跳过`);
                    scanIdx++;
                    continue;
                }
                const isStarving = (hp === 0); // HP=0%即为STARVING
                if (isStarving) starvingDetected++;

                const imgNum = getimgNumber(div);
                const rec = window.kami_core_db?.find(k => String(k.imgNumber) === String(imgNum));
                if (!rec) { scanIdx++; continue; }

                // 个体停采线：有清算线 LT 时取 LT+LT_STOP_MARGIN（安全垫见头部常量）并被 MAX_THRESHOLD 封顶；
                // 无 LT 时按体型回退默认停采线
                let thr;
                const lt = rec.LT;
                if (lt !== null && lt !== undefined && !isNaN(lt)) {
                    thr = Math.min(lt + LT_STOP_MARGIN, MAX_THRESHOLD);
                } else {
                    thr = rec.body === 'normal' ? DEFAULT_THRESHOLD_NORMAL : DEFAULT_THRESHOLD_OTHER;
                }

                // delta = 当前HP与停采线的距离：≤ maxDelta 入选；STARVING 无条件入选
                const delta = hp - thr;
                if (delta <= maxDelta || isStarving) {
                    // STARVING 单独记录原始HP文本，便于核对是否为DOM渲染异常导致的误判
                    if (isStarving) {
                        log(`  [扫描#${scanIdx}] #${rec.index} STARVING! hpRaw="${hpText.slice(0, 40)}" hp=${hp}% thr=${thr}%`);
                    }
                    list.push({
                        imgNumber: imgNum,
                        dbIndex: rec.index,
                        kamiId: rec.kamiId,
                        harvestId: rec.harvestId,
                        hpPercent: hp,
                        threshold: thr,
                        delta,
                        kamiDiv: div,
                        isStarving: !!isStarving  // 标记饿死状态，供上层优先处理
                    });
                }
            } catch (e) {
                log(`  [扫描#${scanIdx}] 异常: ${e?.message || e}`);
            }
            scanIdx++;
        }

        // 扫描汇总；STARVING 占比异常高通常意味着DOM渲染异常，而非真的集体饿死
        const starvingPct = harvestingCount > 0 ? ((starvingDetected / harvestingCount) * 100).toFixed(1) : 0;
        log(`📊 [DOM扫描] 汇总: harvesting=${harvestingCount}, STARVING=${starvingDetected}(${starvingPct}%), 需停采=${list.length}`);
        if (starvingDetected > 10) {
            log(`%c⚠️ [DOM扫描] STARVING数量异常多(${starvingDetected}个)！请检查日志中每个STARVING的hpRaw确认DOM是否正常`,
                'color: red; font-weight: bold;');
        }

        // 按 delta 升序：最危险（最贴近/跌破停采线）的排最前，优先进批
        list.sort((a, b) => a.delta - b.delta);
        return list;
    }

    // ============================================================
    // 【板块：紧急停采 · DOM 卡片重定位 _findKamiCardByImg】
    // ------------------------------------------------------------
    // ▍功能：按 kami 形象编号 imgNumber，在「当前最新」的 DOM 中重新
    //   找到对应的卡片元素。
    // ▍触发时机：_isKamiInCooldown 等需要读实时 DOM 的场合。紧急停采
    //   可能跨多轮、持续较久，扫描时缓存的 item.kamiDiv 引用会因前端
    //   重渲染而失效（元素被替换），按 imgNumber 重新定位比复用旧引用更稳。
    // ▍依赖：
    //   - DOM 卡片容器 selector（与扫描板块相同）：
    //     div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div；
    //   - 卡片内形象图 img[src*="/kami/"]，src 形如 .../kami/1234.gif，
    //     其中的数字即 imgNumber。
    // ▍核心流程：1) imgNumber 为空直接返回 null；2) 遍历全部卡片，用
    //   正则 /\/kami\/(\d+)\.gif/ 从形象图 URL 提取编号；3) 双方都
    //   String() 化后比对（避免数字/字符串类型不一致漏匹配），命中即
    //   返回该卡片 div。
    // ▍边界与保护：找不到返回 null，由调用方自行兜底（如 cooldown
    //   判定会回退到旧的 item.kamiDiv）。
    // ▍可调参数：无。
    // ============================================================
    function _findKamiCardByImg(imgNumber) {
        if (!imgNumber) return null;
        const cards = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
        for (const card of cards) {
            const imgEl = card.querySelector('img[src*="/kami/"]');
            const m = imgEl?.src?.match(/\/kami\/(\d+)\.gif/);
            if (m?.[1] === String(imgNumber)) return card;
        }
        return null;
    }

    // ============================================================
    // 【板块：紧急停采 · 胶水冷却判定 _isKamiInCooldown】
    // ------------------------------------------------------------
    // ▍功能：判断某只 kami 是否处于「被胶水（其他玩家的攻击道具）打中
    //   后的 3 分钟冷却期」。冷却期内该 kami 无法停采/喂食，相关交易
    //   必然失败，只能等冷却结束再操作。
    // ▍触发时机：批量停采后复核失败清单时调用，用于把「暂时停不了
    //   （冷却）」与「真失败」分开——前者推迟到紧急停采末尾重试且不计
    //   失败次数，后者才累计拉黑。
    // ▍依赖：
    //   - _findKamiCardByImg —— 优先按 imgNumber 拿最新 DOM 卡片，
    //     拿不到时回退扫描时缓存的 item.kamiDiv；
    //   - 卡片内状态图 img[src*="/assets/kami_"]；
    //   - 卡片主操作按钮：img[src*="/assets/harvest-"] 或
    //     img[src*="/assets/stop-"] 最近的 button 祖先。
    // ▍核心流程：1) 定位卡片，两路都拿不到按非冷却返回 false；
    //   2) 状态图必须是 kami_harvesting——非采集中谈不上停采冷却；
    //   3) 主按钮 disabled === true 即判为冷却中：游戏前端在冷却期会
    //      禁用该按钮，这是无需链上查询的最廉价判据。
    // ▍边界与保护：全程可选链，DOM 结构缺失一律返回 false——宁可把
    //   冷却误判成真失败多计一次，也不把真失败误判成冷却导致该 kami
    //   永远不进黑名单、反复白烧 gas。
    // ▍可调参数：无（3 分钟冷却时长由游戏机制决定，脚本只做被动判定）。
    // ▍v1.1.10 起：主判据已改为链上 time.last 公式（见 _cooldownRemainSec，
    //   组批前直接预筛剔除冷却中候选），本函数降级为失败归因旁证——仅用于
    //   _emergencySendBatch 复核失败清单时，把「冷却中」与「真失败」分开。
    // ============================================================
    function _isKamiInCooldown(item) {
        // 优先按 imgNumber 重新定位最新卡片，失败再回退扫描时缓存的旧引用
        const div = _findKamiCardByImg(item?.imgNumber) || item?.kamiDiv;
        if (!div) return false;
        const stateImg = div.querySelector('img[src*="/assets/kami_"]');
        // 非采集中状态谈不上停采冷却
        if (!stateImg?.src?.includes('kami_harvesting')) return false;
        // 卡片主操作按钮（采集/停采图标所在的 button）；冷却期内前端会将其禁用
        const btn = div.querySelector('img[src*="/assets/harvest-"], img[src*="/assets/stop-"]')?.closest('button');
        return btn?.disabled === true;
    }

    // ============================================================
    // 【板块：紧急停采 · 通用并发池 _emergencyRunPool】
    // ------------------------------------------------------------
    // ▍功能：以固定并发上限执行一批异步任务，结果严格按输入顺序落位
    //   返回（results[i] 与 items[i] 一一对应）。
    // ▍触发时机：_emergencyQueryStatus 等需要批量 RPC 查询的场合。
    // ▍依赖：无（纯工具函数）。
    // ▍核心流程：1) 预建与 items 等长的结果数组；2) 用共享游标 next
    //   实现「抢活」：每个 worker 协程循环领取下一个下标处理，直到
    //   取尽；3) 启动 min(concurrency, items.length) 个协程并用
    //   Promise.all 等待全部完成。
    // ▍边界与保护：单个任务抛错被 catch 住，写入 { error } 占位，
    //   不会让 Promise.all 整体 reject，一个坏任务不影响其余任务。
    // ▍可调参数：concurrency（形参，默认 6）—— 并发上限；调大提速但
    //   加重 RPC/索引器压力，调小更温和但拖慢整轮；实际调用处通常由
    //   EMERGENCY_CONFIG.CONFIRM_CONCURRENCY 显式传入覆盖默认值。
    // ============================================================
    async function _emergencyRunPool(items, worker, concurrency = 6) {
        const results = new Array(items.length);
        let next = 0;
        async function loop() {
            while (true) {
                const i = next++;
                if (i >= items.length) break;
                try { results[i] = await worker(items[i], i); }
                catch (e) { results[i] = { error: e }; }
            }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
        return results;
    }


    // ============================================================
    // 【板块：控制台命令挂载】
    // ------------------------------------------------------------
    // ▍功能：把紧急停采入口挂到 window，供用户在浏览器控制台手动触发。
    // ▍相关控制台命令：emergencyStopHarvest() —— 立即执行一轮完整的
    //   紧急停采（DOM 扫描 → 凑批 → 批量发送 → 链上复核 → cooldown 重试）。
    // ============================================================
    // 挂载到window，方便控制台调用测试
    window.emergencyStopHarvest = emergencyStopHarvest;


    /**
     * 说明：Feed 监控（openChatAndSwitchToFeed / startFeedMonitor）不在
     * 本脚本内，由配套的轻量杀手监控脚本独立提供，需与本脚本配合运行。
     */

    // ============================================================
    // 【板块：自己 Kami 死亡监控】
    // 🔻SYNC→内部版[1.1.13 饥饿模式改名贪婪模式]
    // ------------------------------------------------------------
    // ▍功能：
    //   定时通过链上 API 全量检查本账户所有 Kami 的存活状态。一旦发现
    //   有 Kami 处于 DEAD 状态，立即做三件事：
    //   ① 置起"杀手警戒"标记（贪婪模式下自动切换到安全停采线）；
    //   ② 立即触发批量复活，不等主循环兜底（主循环周期约 10 分钟，
    //      等它会让死亡 Kami 白白闲置）；
    //   ③ 触发紧急停采，保护其余仍在采集的 Kami。
    //   无死亡时，负责在警戒冷却期满后自动解除杀手警戒、恢复贪婪模式。
    // ▍触发时机：
    //   startMyKamiDeathMonitor() 启动后立即执行一次 checkMyKamiDeath()，
    //   之后每 MY_KAMI_DEATH_CHECK_INTERVAL（3 分钟）定时执行一轮。
    // ▍依赖：
    //   - window.network.network.connectedAddress.value_ — 当前连接的钱包地址
    //   - window.network.explorer.accounts.getByOperator(addr) — 链上 API，
    //     返回账户全量 Kami 列表（含 state 字段）。刻意不用 DOM：DOM 渲染
    //     不保证完整，可能漏掉部分 Kami，因此以 API 全量查询为准
    //   - _reviveDeadBatch(list) — 批量复活（定义于复活板块）
    //   - emergencyStopHarvest() — 紧急停采（定义于停采板块）
    //   - 全局标记：window.__killerDetected（杀手警戒中）、
    //     window.__lastKillerTime（最近一次发现死亡的时间戳）、
    //     window.__kamiMode（'greedy' = 贪婪模式，旧名 'starving'）
    //   - 常量：SAFE_COOLDOWN_MS（警戒冷却时长）、GREEDY_THRESHOLD
    //    （贪婪模式极限停采线百分比，原 STARVING_THRESHOLD），均定义于其他板块
    // ▍核心流程：
    //   1) 读连接地址，取不到直接返回（页面未就绪）
    //   2) API 拉账户全量 Kami 列表，空列表直接返回
    //   3) 遍历统计 state === 'DEAD' 的 Kami（state 统一转大写后比较）
    //   4) 有死亡：置 __killerDetected / __lastKillerTime →
    //      fire-and-forget 调 _reviveDeadBatch([]) 立即批量复活 →
    //      调 emergencyStopHarvest() 紧急停采
    //   5) 无死亡：若警戒中且距上次发现死亡已超 SAFE_COOLDOWN_MS，
    //      解除警戒（贪婪模式恢复极限停采线）；未到期则打印剩余分钟数
    // ▍边界与保护：
    //   - 防重复复活：本监控、主循环兜底复活、辅助脚本启动窗口复活是
    //     三条独立触发路径，互不重发的并发安全由 _reviveDeadBatch 内部
    //     保障（revive 锁 + __reviveSentAt 15 分钟防重发窗口），因此
    //     这里可以放心 fire-and-forget
    //   - _reviveDeadBatch 传空数组 [] 表示"死亡名单由其内部走 API
    //     全量查询"，不复用本函数手里的列表（两次查询间状态可能变化）
    //   - fire-and-forget 的 Promise 挂了 .catch，防止未处理 rejection
    //   - startMyKamiDeathMonitor() 判重：定时器已存在则拒绝二次启动
    //   - 整个检测体 try/catch，单轮出错不影响后续轮次
    // ▍可调参数：
    //   MY_KAMI_DEATH_CHECK_INTERVAL = 3 * 60 * 1000 — 检测周期（毫秒）。
    //     调小 → 发现死亡更快（复活/紧急停采的最大延迟即此周期），但
    //     API 调用更频繁；调大 → 省请求，但死亡后 Kami 闲置时间变长
    // ▍相关控制台命令：
    //   startMyKamiDeathMonitor() — 启动监控（先立即检测一次再定时）
    //   stopMyKamiDeathMonitor()  — 停止监控
    //   checkMyKamiDeath()        — 手动立即检测一轮
    // ============================================================
    const MY_KAMI_DEATH_CHECK_INTERVAL = 3 * 60 * 1000;  // 3分钟检测一次
    let __myKamiDeathMonitorTimer = null;  // 定时器句柄，非 null 表示监控运行中

    async function checkMyKamiDeath() {
        try {
            const addr = window.network?.network?.connectedAddress?.value_;
            if (!addr) {
                log('⚠️ [死亡监控] 无法获取账户地址');
                return;
            }

            const acc = window.network.explorer.accounts.getByOperator(addr);
            const kamis = acc?.kamis || [];

            if (kamis.length === 0) {
                log('⚠️ [死亡监控] 未找到 Kami 列表');
                return;
            }

            // 检查每个 kami 的状态
            let deadCount = 0;
            const deadKamis = [];

            for (const k of kamis) {
                const state = (k.state || '').toUpperCase();
                if (state === 'DEAD') {
                    deadCount++;
                    deadKamis.push(k.index);
                }
            }

            if (deadCount > 0) {
                log(`%c💀💀💀 [死亡监控] 发现 ${deadCount} 个 Kami 死亡！`,
                    'color: white; background: red; font-size: 16px; font-weight: bold; padding: 4px;');
                log(`   死亡 Kami: ${deadKamis.join(', ')}`);

                // 设置杀手检测标记，切换到安全模式
                const wasKillerDetected = window.__killerDetected;
                window.__killerDetected = true;
                window.__lastKillerTime = Date.now();

                // 首次进入警戒且处于贪婪模式：提示已切换到安全停采线
                if (!wasKillerDetected && window.__kamiMode === 'greedy') {
                    log(`%c🛡️ [死亡监控] 检测到我方 Kami 被杀！自动切换到安全停采线`,
                        'color: white; background: orange; font-weight: bold; font-size: 14px; padding: 4px;');
                    log(`   🕐 ${SAFE_COOLDOWN_MS / 60000} 分钟后自动恢复贪婪模式`);
                } else if (window.__kamiMode === 'greedy') {
                    log(`   ⚠️ 已处于安全模式中（杀手警戒状态）`);
                }

                // 发现死亡 → 立即触发批量复活，不等主循环（主循环周期约 10 分钟）。
                // fire-and-forget：传空数组，_reviveDeadBatch 内部走 API 全量查询死亡名单；
                // 并发安全由其内部保障（revive 锁 + __reviveSentAt 15分钟防重发），
                // 与主循环兜底复活、辅助脚本启动窗口复活三路触发互不重发。
                log(`⚡ [死亡监控] 立即触发批量复活（不等主循环）...`);
                _reviveDeadBatch([]).catch(e => log(`⚠️ [死亡监控] 触发复活异常: ${e?.message || e}`));

                log(`   ⚡ 触发紧急停采！`);

                if (typeof emergencyStopHarvest === 'function') {
                    emergencyStopHarvest();
                }
            } else {
                log(`✅ [死亡监控] 检测 ${kamis.length} 个 Kami，无死亡`);

                // 检查是否已过冷却期，恢复贪婪模式
                if (window.__killerDetected) {
                    const now = Date.now();
                    const timeSinceLastKiller = now - window.__lastKillerTime;

                    if (timeSinceLastKiller >= SAFE_COOLDOWN_MS) {
                        window.__killerDetected = false;
                        log(`%c✅ [死亡监控] 已过 ${SAFE_COOLDOWN_MS / 60000} 分钟安全期，杀手警戒解除！`,
                            'color: green; font-weight: bold; font-size: 14px;');
                        if (window.__kamiMode === 'greedy') {
                            log(`   🍖 恢复贪婪模式极限停采线 (${GREEDY_THRESHOLD}%)`);
                        }
                    } else {
                        const remainMin = Math.ceil((SAFE_COOLDOWN_MS - timeSinceLastKiller) / 60000);
                        log(`   ⏳ 安全模式中，${remainMin} 分钟后恢复贪婪模式`);
                    }
                }
            }

        } catch (e) {
            log(`⚠️ [死亡监控] 检测出错:`, e?.message || e);
        }
    }


    function startMyKamiDeathMonitor() {
        if (__myKamiDeathMonitorTimer) {
            log('⚠️ [死亡监控] 已在运行中');
            return;
        }

        log('%c🛡️ [死亡监控] 启动自己 Kami 死亡监控', 'color: green; font-weight: bold;');
        log(`   检测间隔: ${MY_KAMI_DEATH_CHECK_INTERVAL / 60000} 分钟`);

        // 立即执行一次
        checkMyKamiDeath();

        // 定时执行
        __myKamiDeathMonitorTimer = setInterval(checkMyKamiDeath, MY_KAMI_DEATH_CHECK_INTERVAL);
    }

    function stopMyKamiDeathMonitor() {
        if (__myKamiDeathMonitorTimer) {
            clearInterval(__myKamiDeathMonitorTimer);
            __myKamiDeathMonitorTimer = null;
            log('🛑 [死亡监控] 已停止');
        }
    }

    // 挂载到 window
    window.startMyKamiDeathMonitor = startMyKamiDeathMonitor;
    window.stopMyKamiDeathMonitor = stopMyKamiDeathMonitor;
    window.checkMyKamiDeath = checkMyKamiDeath;

    // ============================================================
    // 【板块：停摆检测器（心跳 + 跳变检测 + 人话诊断 + 醒来急救）】
    // ------------------------------------------------------------
    // ▍功能：
    //   用 30s 心跳检测 JS 事件循环是否被系统睡眠/浏览器挂起打断。
    //   醒来后根据 gap 分级：短停摆仅黄字计数；睡眠级停摆打大红横幅、
    //   人话诊断原因，并触发死亡扫描急救（立即 + 90s 复检，应对索引滞后）。
    // ▍触发时机：
    //   脚本注入后模块级立即挂 setInterval；启动阶段另有一次只读
    //   localStorage.kami_last_heartbeat 的中断回溯（见启动提示板块，不触发急救）。
    // ▍依赖：
    //   - checkMyKamiDeath()：现有死亡扫描（内部锁保护，发现死亡会批量复活）
    //   - hasEmergencyLock / waitForEmergencyRelease：急救必须尊重紧急锁
    //   - localStorage key：'kami_last_heartbeat'（本板块唯一新增写入）
    //   - navigator.onLine：人话诊断网络断开（零新增请求）
    // ▍核心流程：
    //   1) 每 30s tick：gap = now - __stallLastTick；更新 lastTick；写 heartbeat
    //   2) gap≥120s 记入 __stallEvents（只留近 2 小时），短停摆打黄日志
    //   3) gap≥5min：大红横幅 + 决策树人话 + 醒来急救
    //   4) 急救：等紧急锁释放 → checkMyKamiDeath()；90s 后再复检一次
    //   5) runAutomation 经查证无重入保护 → 不调用，只提示等主循环下轮
    // ▍边界与保护：
    //   - window.__stallDetectorOn 幂等：重复加载不双挂 interval
    //   - 检测器与急救全程 try/catch，自身异常绝不影响主流程
    //   - 不新增任何直接发 tx 路径（只调现有 checkMyKamiDeath）
    //   - 启动回溯只日志、不急救，避免与 startMyKamiDeathMonitor 双跑
    // ▍可调参数：
    //   STALL_TICK_MS=30s / STALL_SHORT_MS=120s / STALL_SLEEP_MS=5min /
    //   STALL_RECHECK_MS=90s / STALL_EVENTS_KEEP_MS=2h
    // ▍相关控制台命令：无（自动常驻；手动死亡扫描仍用 checkMyKamiDeath()）
    // 🔻SYNC→内部版[1.2.9 停摆检测器]
    // ============================================================
    (function initStallDetector() {
        try {
            // I3：重复加载早退，防双挂 setInterval（参考 __deployPausedUntil 幂等风格）
            if (window.__stallDetectorOn) return;
            window.__stallDetectorOn = true;

            const STALL_TICK_MS = 30 * 1000;
            const STALL_SHORT_MS = 120 * 1000;          // ≥2min 且 <5min：短停摆
            const STALL_SLEEP_MS = 5 * 60 * 1000;       // ≥5min：睡眠级停摆
            const STALL_RECHECK_MS = 90 * 1000;         // 醒后 90s 复检（索引滞后）
            const STALL_EVENTS_KEEP_MS = 2 * 60 * 60 * 1000; // 事件窗 2 小时

            let __stallLastTick = Date.now();
            let __stallEvents = [];   // { at, gapMs }，只留近 2 小时
            let __stallRescueInFlight = false;

            function __stallFmtHHMM(ts) {
                return new Date(ts + __TZ_OFFSET_MS).toISOString().substring(11, 16);
            }
            function __stallFmtDur(ms) {
                const totalMin = Math.max(0, Math.round(ms / 60000));
                if (totalMin < 60) return `${totalMin} 分钟`;
                const h = Math.floor(totalMin / 60);
                const m = totalMin % 60;
                return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
            }
            function __stallPruneEvents(now) {
                const cut = now - STALL_EVENTS_KEEP_MS;
                __stallEvents = __stallEvents.filter(e => e.at >= cut);
            }
            function __stallDiagnose(recentCount) {
                // 决策树：网络断开 → 碎片化睡眠(≥3次) → 单次长停摆
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    return '网络当前断开';
                }
                if (recentCount >= 3) {
                    return `碎片化睡眠形态(近2小时第${recentCount}次停摆)=笔记本未插电源，系统在电池模式下反复自动睡眠(Mac的防睡眠设置只在插电时生效!)`;
                }
                return '电脑睡眠/待机或浏览器被挂起';
            }
            async function __stallWakeRescue(tag) {
                if (__stallRescueInFlight) {
                    log(`ℹ️ [停摆检测] 急救已在进行中，跳过重复触发（${tag}）`);
                    return;
                }
                __stallRescueInFlight = true;
                try {
                    // 尊重紧急锁：有锁则排队等待，别硬闯（与常规 tx 入口一致）
                    if (typeof hasEmergencyLock === 'function' && hasEmergencyLock()) {
                        if (typeof waitForEmergencyRelease === 'function') {
                            const ok = await waitForEmergencyRelease('停摆急救', 300000);
                            if (!ok) {
                                log(`%c⚠️ [停摆检测] 紧急锁等待超时，跳过本次急救死亡扫描`,
                                    'color: orange; font-weight: bold;');
                                return;
                            }
                        } else {
                            log(`%c⚠️ [停摆检测] 紧急锁存在且无等待接口，跳过本次急救`,
                                'color: orange; font-weight: bold;');
                            return;
                        }
                    }
                    if (typeof checkMyKamiDeath === 'function') {
                        log(`⚡ [停摆检测] 醒来急救：立即死亡扫描（${tag}）...`);
                        await checkMyKamiDeath();
                    } else {
                        log(`⚠️ [停摆检测] checkMyKamiDeath 不可用，跳过急救扫描`);
                    }
                    // 0716 实测：短醒扫描可能读到滞后索引报「无死亡」→ 90s 后复检
                    log(`%c⏳ [停摆检测] 醒后索引可能滞后，90s后复检`,
                        'color: #d4a017; font-weight: bold;');
                    setTimeout(() => {
                        (async () => {
                            try {
                                if (typeof hasEmergencyLock === 'function' && hasEmergencyLock()
                                    && typeof waitForEmergencyRelease === 'function') {
                                    const ok2 = await waitForEmergencyRelease('停摆复检', 300000);
                                    if (!ok2) {
                                        log(`⚠️ [停摆检测] 90s复检时紧急锁等待超时，放弃复检`);
                                        return;
                                    }
                                }
                                if (typeof checkMyKamiDeath === 'function') {
                                    log(`⚡ [停摆检测] 90s 复检：再次死亡扫描...`);
                                    await checkMyKamiDeath();
                                }
                            } catch (e2) {
                                log(`⚠️ [停摆检测] 90s复检异常: ${e2?.message || e2}`);
                            }
                        })();
                    }, STALL_RECHECK_MS);
                    // 查证结论：runAutomation 开头无 running 标志/重入锁 → 不调用，避免与周期主循环并发
                    log(`ℹ️ [停摆检测] 建议等主循环下轮(≤10分钟)（runAutomation 无重入保护，醒来不强制抢跑）`);
                } catch (e) {
                    log(`⚠️ [停摆检测] 醒来急救异常: ${e?.message || e}`);
                } finally {
                    __stallRescueInFlight = false;
                }
            }
            function __stallTick() {
                try {
                    const now = Date.now();
                    const gap = now - __stallLastTick;
                    __stallLastTick = now;
                    try {
                        localStorage.setItem('kami_last_heartbeat', String(now));
                    } catch (_) { /* I4：仅此 key；写失败静默 */ }

                    if (gap < STALL_SHORT_MS) return; // 正常 tick 抖动，忽略

                    // 记录事件（短停摆 + 睡眠级均计数，供碎片化判定）
                    __stallEvents.push({ at: now, gapMs: gap });
                    __stallPruneEvents(now);
                    const recentCount = __stallEvents.length;
                    const wokeFrom = now - gap;

                    if (gap < STALL_SLEEP_MS) {
                        // 短停摆：黄日志（计数用）
                        log(`%c⏱️ [停摆检测] 短停摆 ${__stallFmtDur(gap)}（${__stallFmtHHMM(wokeFrom)} → ${__stallFmtHHMM(now)}），近2小时第 ${recentCount} 次`,
                            'color: #d4a017; font-weight: bold;');
                        return;
                    }

                    // 睡眠级停摆：大红横幅 + 人话诊断 + 急救
                    const reason = __stallDiagnose(recentCount);
                    log(`%c⏰ [停摆检测] 脚本停摆 ${__stallFmtDur(gap)}（${__stallFmtHHMM(wokeFrom)} → ${__stallFmtHHMM(now)}）!推测原因:${reason}`,
                        'color: white; background: red; font-size: 16px; font-weight: bold; padding: 4px;');
                    log(`%c   停摆期间脚本完全暂停，kami的HP仍在流失且无人停采——请立即插上电源/关闭自动睡眠；正在自动急救(死亡扫描+90秒后复检)`,
                        'color: white; background: #c0392b; font-size: 13px; font-weight: bold; padding: 3px 6px;');
                    // fire-and-forget：不阻塞 interval 回调
                    __stallWakeRescue('睡眠级停摆').catch(e => {
                        try { log(`⚠️ [停摆检测] 急救 Promise 异常: ${e?.message || e}`); } catch (_) {}
                    });
                } catch (e) {
                    try { log(`⚠️ [停摆检测] tick 异常: ${e?.message || e}`); } catch (_) {}
                }
            }

            // 启动即写一次心跳，便于下次会话 D 回溯
            try { localStorage.setItem('kami_last_heartbeat', String(Date.now())); } catch (_) {}
            setInterval(__stallTick, STALL_TICK_MS);
            log(`%c⏰ [停摆检测] 已启动（每 ${STALL_TICK_MS / 1000}s 心跳；≥${STALL_SHORT_MS / 1000}s 记短停摆；≥${STALL_SLEEP_MS / 60000}min 睡眠级急救）`,
                'color: green; font-weight: bold;');
        } catch (e) {
            try { log(`⚠️ [停摆检测] 初始化失败（不影响主流程）: ${e?.message || e}`); } catch (_) {}
        }
    })();

    // ============================================================
    // 【板块：从 localStorage 恢复精简数据库 kami_core_db】
    // ------------------------------------------------------------
    // ▍功能：
    //   脚本注入时把本地精简数据库恢复到内存（window.kami_core_db）。
    //   该数据库是全脚本的决策基础：部署、停采、喂食、XP 药水等板块
    //   都靠它按 index / imgNumber 反查每只 Kami 的 kamiId、清算线 LT
    //   等关键数据。
    // ▍触发时机：
    //   脚本加载时执行一次（顶层代码，非函数，无定时器）。
    // ▍依赖：
    //   - localStorage key：'kami_core_db' — JSON 数组，由精简数据库
    //     脚本全量生成、由本脚本的 syncKamiDb()（见下一板块）增量维护
    //   - 每条记录字段（共 17 个）：index（图鉴编号，数值）、imgNumber
    //    （立绘图片编号，string 类型）、kamiId（链上实体 ID）、harvestId
    //    （当前采集实体 ID，未部署为 null）、name（名字）、level（等级）、
    //     harmony / maxhp（和谐值 / 最大 HP）、body / hand（体质 / 手部
    //     亲和，小写字符串）、ratio / shift（防御 threshold 加成）、
    //     LT（清算线，占最大 HP 百分比）、LTHP（清算线对应 HP 绝对值）、
    //     vioBase / harmBase / powBase（violence / harmony / power 基础值）
    // ▍核心流程：
    //   1) window.kami_core_db 已存在且是数组 → 直接沿用，不覆盖
    //      （避免覆盖同页其他脚本刚构建好的内存版）
    //   2) 否则从 localStorage 读 'kami_core_db'，缺失时回退空数组 '[]'
    //   3) 解析成功后挂到 window.kami_core_db 供全脚本使用
    // ▍边界与保护：
    //   - JSON.parse 包在 try/catch 内，本地数据损坏时只报错不中断脚本
    //   - 注意：库中 imgNumber 字段为 string 类型，用它匹配时需 String() 转换
    // ▍新手提示：
    //   首次使用请先启用【精简数据库脚本】完成一次全量构建（控制台出现
    //   "🎉 构建完成"后即可停用它）。若跳过这一步，本地数据库为空，
    //   部署/停采/喂食都会因查不到 kamiId / LT 而大量跳过。构建完成后，
    //   新入手的 kami 由 syncKamiDb() 自动增量补全，无需重跑全量构建。
    // ▍可调参数：无
    // ▍相关控制台命令：
    //   window.kami_core_db — 直接查看数据库内容
    //   syncKamiDb() — 增量补全数据库（见下一板块）
    // ============================================================
    if (window.kami_core_db && Array.isArray(window.kami_core_db)) {
        log(`📦 已检测到已加载的精简数据库，共 ${window.kami_core_db.length} 条 Kami`);
        log('🔍 如需查询数据库，请在控制台输入：window.kami_core_db');
    } else {
        let coreDb = [];
        try {
            coreDb = JSON.parse(localStorage.getItem('kami_core_db') || '[]');
            window.kami_core_db = coreDb;
            log(`📦 精简数据库已恢复到内存，共 ${coreDb.length} 条 Kami（window.kami_core_db）`);
        } catch (e) {
            log('❌ 读取 kami_core_db 失败：', e);
        }
    }

    // ============================================================
    // 【板块：DB 增量自愈 syncKamiDb —— 补全账户新 Kami】
    // ------------------------------------------------------------
    // ▍功能：
    //   把账户当前 Kami 列表与本地精简数据库做 diff，只补不删：账户里
    //   有而 DB 缺失的 Kami（例如新买入、新合成的），自动拉取详情并
    //   入库。数据库缺条目会引发一连串下游漏判：部署时找不到记录被
    //   跳过、停采时查不到清算线漏判、XP 药水找不到喂食目标。本板块
    //   保证 DB 与账户实际持仓始终对齐。
    // ▍触发时机：
    //   由脚本启动/主循环流程在需要时调用；控制台也可随时手动执行
    //   syncKamiDb()。
    // ▍依赖：
    //   - window.network.network.connectedAddress.value_ — 钱包地址
    //   - window.network.explorer.accounts.getByOperator(addr) — 账户
    //     全量 Kami 列表（1 次 API）
    //   - window.network.explorer.kamis.getByIndex(index, opts) — 单只
    //     详情（stats / traits / bonus / harvest / progress / time 全开）
    //   - localStorage key：'kami_core_db' — 补全后写回持久化
    //   - window.kami_core_db — 内存数据库（就地 push，同步更新）
    // ▍核心流程：
    //   1) 轮询等待 network/explorer 接口就绪：每 200ms 探测一次，
    //      最多等 10 秒（通常已就绪，直接通过）
    //   2) getByOperator 拉账户 Kami 列表：最多重试 3 次，间隔递增
    //      300 / 600 / 900 ms
    //   3) 按 index（数值化、Set 去重）diff 出 DB 缺失的 Kami；
    //      无缺失直接返回
    //   4) 逐只串行调 getByIndex 拉详情（缺失量通常很小，串行即可，
    //      省去并发控制的复杂度）：每只最多重试 3 次，指数退避
    //      250 / 500 / 1000 ms
    //   5) 成功 → 解析字段并用 __computeLT 计算清算线后入库；
    //      失败 → 写占位记录（17 字段齐全、相关数值全 null）
    //   6) 全部处理完写回 localStorage 持久化
    // ▍边界与保护：
    //   - 只补不删：已有记录即使数据陈旧也保留，全量刷新交给手动
    //     rebuildKamiCoreDb()，自动流程绝不删改旧数据
    //   - 失败占位：详情拉不到也写入占位记录，保证下游 find 至少能按
    //     index 命中，避免每一轮都重复 miss、无限循环补拉
    //   - localStorage 写回失败：内存版已更新（本次会话可用），但页面
    //     刷新后会丢失，打印明确提示
    //   - 整体 try/catch，异常时返回 {added:0, total:0, skippedFail:0}，
    //     调用方无需额外容错
    // ▍可调参数：
    //   V_CONST = 41 — 清算线公式常数。必须与数据库构建脚本使用同一
    //     公式、同一常数：否则新补 Kami 的 LT 与旧数据口径不一致，
    //     下游停采决策会错乱。除非构建脚本同步改动，否则不要单独修改
    //   就绪等待上限 10000ms / 探测间隔 200ms — 对页面慢加载的容忍度
    //   列表重试 3 次、详情重试 3 次 — 调大更抗网络抖动，但失败场景
    //     下整体耗时更长
    // ▍相关控制台命令：
    //   syncKamiDb() — 手动执行一次增量补全，返回 {added, total, skippedFail}
    //   rebuildKamiCoreDb() — 全量重建数据库（由数据库构建脚本提供）
    // ============================================================
    // 清算线公式必须与数据库构建脚本完全一致（同公式、同 V_CONST）——
    // 否则新补 kami 的 LT 与旧数据不一致会导致下游决策错乱
    const V_CONST = 41;

    /**
     * 清算线计算（与数据库构建脚本共用同一公式，勿单独改动）
     * @param {number} V        - 清算线常数（默认 41）
     * @param {number} harmony  - Kami 的 harmony.total
     * @param {string} bodyAff  - body affinity（'normal' or 其他）
     * @param {number} ratio    - bonuses.defense.threshold.ratio
     * @param {number} shift    - bonuses.defense.threshold.shift
     * @param {number} maxhp    - health.total
     * @returns {{LT:number|null, LTHP:number|null}}
     */
    function __computeLT(V, harmony, bodyAff, ratio, shift, maxhp) {
        if (!(harmony > 0) || !(maxhp > 0)) return { LT: null, LTHP: null };  // 缺关键数据不硬算
        const body = String(bodyAff || '').toLowerCase();
        const E = (body === 'normal') ? 0.2 : 0.5;  // 体质亲和系数：normal 0.2，其余 0.5
        const deltaR = Math.max(0, 0.5 - (ratio ?? 0));  // 防御 ratio 加成缺口（满值 0.5，缺口抬高清算线）
        const deltaS = Math.max(0, 0.4 - (shift ?? 0));  // 防御 shift 加成缺口（满值 0.4，同上）
        // 标准正态分布 CDF 的多项式近似（Abramowitz-Stegun 误差函数展开）
        const normCdf = x => {
            const sign = x < 0 ? -1 : 1;
            x = Math.abs(x) / Math.SQRT2;
            const t = 1 / (1 + 0.3275911 * x);
            const a1 = 0.254829592, a2 = -0.284496736,
                  a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
            const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
            return sign === 1 ? 0.5 * (1 + y) : 0.5 * (1 - y);
        };
        const phi  = Math.max(0, Math.min(1, normCdf(Math.log(V / harmony))));  // harmony 越高 phi 越小 → 清算线越低
        const frac = Math.max(0, Math.min(1, phi * 0.4 * (1 + E + deltaR) + deltaS));  // 清算线占最大 HP 的比例，夹取 [0,1]
        return {
            LT:   +(frac * 100).toFixed(2),
            LTHP: +(frac * maxhp).toFixed(2)
        };
    }

    /**
     * 增量补全数据库：diff 账户当前 kami list 与 db，只补不删
     * - 不会重建已有 kami（即使数据陈旧也保留，等手动 rebuildKamiCoreDb 全量刷新）
     * - 失败的 kami 仍占位写入（17 字段，相关数值置 null），下游 find 至少能命中
     * @returns {Promise<{added:number, total:number, skippedFail:number}>}
     */
    async function syncKamiDb() {
        try {
            // 1. 等 network/explorer 就绪（最多 10 秒；通常已就绪）
            const t0 = Date.now();
            while (!(window.network?.explorer?.accounts?.getByOperator &&
                     window.network?.explorer?.kamis?.getByIndex &&
                     window.network?.network?.connectedAddress?.value_) &&
                   Date.now() - t0 < 10000) {
                await new Promise(r => setTimeout(r, 200));
            }
            const addr = window.network?.network?.connectedAddress?.value_;
            if (!addr) {
                log('⚠️ [DB增量] network/explorer 未就绪，跳过增量补全');
                return { added: 0, total: 0, skippedFail: 0 };
            }

            // 2. 取账户当前 kami list（1 个 API）
            let acc = null, tries = 0;
            while (tries < 3) {
                try {
                    acc = await window.network.explorer.accounts.getByOperator(addr);
                    if (acc?.kamis) break;
                } catch {}
                tries += 1;
                await new Promise(r => setTimeout(r, 300 + tries * 300));  // 重试间隔递增：600/900ms
            }
            const list = acc?.kamis || [];
            const db = Array.isArray(window.kami_core_db) ? window.kami_core_db : [];

            // 3. diff：db 没有的 kami（按 index 唯一）
            const dbIndexSet = new Set(db.map(r => Number(r.index)).filter(n => Number.isFinite(n)));
            const missing = list.filter(k => Number.isFinite(Number(k.index)) && !dbIndexSet.has(Number(k.index)));

            if (missing.length === 0) {
                log(`✅ [DB增量] 账户 ${list.length} 只 vs DB ${db.length} 条，无新增 kami 需要补全`);
                return { added: 0, total: list.length, skippedFail: 0 };
            }

            log(`%c🔍 [DB增量] 发现 ${missing.length} 只账户内有但 DB 没有的 kami，开始拉取详情...`,
                'color: orange; font-weight: bold;');

            // 4. 串行调 kamis.getByIndex 增富（量小不需要并发，省去复杂度）
            let added = 0, skippedFail = 0;
            for (const k of missing) {
                let res = null, t = 0;
                while (t < 3) {
                    try {
                        res = await window.network.explorer.kamis.getByIndex(k.index, {
                            stats: true, traits: true, bonus: true, harvest: true, progress: true, time: true
                        });
                        if (res) break;
                    } catch {}
                    t += 1;
                    await new Promise(r => setTimeout(r, 250 * (2 ** (t - 1))));  // 指数退避：250/500ms
                }

                if (!res) {
                    // 占位记录：保证下游 find 至少能命中，避免无限循环 miss
                    db.push({
                        index: k.index,
                        imgNumber: k.image?.match(/kami\/(\d+)\.gif/)?.[1] || null,
                        kamiId: k.id,
                        harvestId: k.harvest?.id || null,
                        name: k.name,
                        level: k.progress?.level ?? null,
                        harmony: null, maxhp: null, body: null, hand: null,
                        ratio: null, shift: null, LT: null, LTHP: null,
                        vioBase: null, harmBase: null, powBase: null
                    });
                    skippedFail++;
                    log(`⚠️ [DB增量] #${k.index} (${k.name || '?'}) 拉详情失败，已写入占位记录`);
                    continue;
                }

                const imgNumber = res.image?.match(/kami\/(\d+)\.gif/)?.[1] || null;  // 从立绘 URL 提取图片编号（string）
                const harmony = res.stats?.harmony?.total ?? null;
                const maxhp   = res.stats?.health?.total ?? null;
                const body    = res.traits?.body?.affinity ? String(res.traits.body.affinity).toLowerCase() : null;
                const hand    = res.traits?.hand?.affinity ? String(res.traits.hand.affinity).toLowerCase() : null;
                const ratio   = res.bonuses?.defense?.threshold?.ratio ?? 0;
                const shift   = res.bonuses?.defense?.threshold?.shift ?? 0;
                const vioBase = res.stats?.violence?.base ?? null;
                const harmBase= res.stats?.harmony?.base  ?? null;
                const powBase = res.stats?.power?.base    ?? null;

                let LT = null, LTHP = null;
                if (harmony != null && maxhp != null && body) {
                    const r = __computeLT(V_CONST, harmony, body, ratio, shift, maxhp);
                    LT = r.LT; LTHP = r.LTHP;
                }

                db.push({
                    index: res.index,
                    imgNumber,
                    kamiId: res.id,
                    harvestId: res.harvest?.id || null,
                    name: res.name,
                    level: res.progress?.level ?? null,
                    harmony, maxhp, body, hand,
                    ratio, shift, LT, LTHP,
                    vioBase, harmBase, powBase
                });
                added++;
                log(`%c➕ [DB增量] #${k.index} (${res.name || '?'}) Lv.${res.progress?.level} LT=${LT}% 已入库`,
                    'color: green;');
            }

            // 5. 写回 localStorage（持久化，刷新后保留）
            window.kami_core_db = db;
            try {
                localStorage.setItem('kami_core_db', JSON.stringify(db));
                log(`%c💾 [DB增量] 完成：新增 ${added} 条（失败占位 ${skippedFail} 条），DB 现有 ${db.length} 条`,
                    'color: green; font-weight: bold;');
            } catch (e) {
                log(`❌ [DB增量] 写回 localStorage 失败（内存已更新但下次刷新会丢失）: ${e?.message || e}`);
            }

            return { added, total: list.length, skippedFail };
        } catch (e) {
            log(`❌ [DB增量] syncKamiDb 异常: ${e?.message || e}`);
            return { added: 0, total: 0, skippedFail: 0 };
        }
    }

    // 暴露手动接口：控制台可直接调用 syncKamiDb()
    window.syncKamiDb = syncKamiDb;

    // ============================================================
    // 【板块：模拟鼠标点击 simulateClick】
    // ------------------------------------------------------------
    // ▍功能：
    //   对指定 DOM 元素按真实用户交互的时序派发完整鼠标事件序列：
    //   mouseover → mousedown → mouseup → click（最后补 mouseout 复位）。
    //   游戏前端使用 React 合成事件，部分按钮不响应孤立的 click 事件，
    //   必须有 hover / 按下 / 抬起的完整链路才会触发业务逻辑。
    // ▍触发时机：
    //   各 UI 操作板块需要"点"页面按钮时调用（纯工具函数，无定时器）。
    // ▍依赖：
    //   仅浏览器 DOM 事件（MouseEvent），不依赖 window 接口 / localStorage
    //   / 链上 API。
    // ▍核心流程：
    //   1) delayMs+50ms  派发 mouseover（进入悬停态）
    //   2) delayMs+150ms 派发 mousedown
    //   3) delayMs+200ms 派发 mouseup
    //   4) delayMs+300ms 派发 click，并紧跟 mouseout（relatedTarget 指向
    //      document.body，让按钮的悬停样式正确复位，避免 UI 卡在 hover 态）
    // ▍边界与保护：
    //   - element 为空直接返回，不抛错
    //   - 所有事件 bubbles:true，保证上层事件委托监听也能收到
    // ▍可调参数：
    //   delayMs（形参，默认 0）— 整体时序偏移。需要连续点击多个元素时
    //     传不同 delayMs 错开，避免事件序列互相交叠
    //   50/150/200/300 — 四步的相对间隔（毫秒），模拟人手操作节奏；
    //     间隔调得太小可能被前端忽略
    // ▍相关控制台命令：无（内部工具函数）
    // ============================================================
    function simulateClick(element, delayMs = 0) {
        if (!element) return;
        setTimeout(() => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), delayMs + 50);
        setTimeout(() => element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })), delayMs + 150);
        setTimeout(() => element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })), delayMs + 200);
        setTimeout(() => {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('mouseout', {
                bubbles: true,
                cancelable: true,
                relatedTarget: document.body
            }));
        }, delayMs + 300);
    }

    // ============================================================
    // 【板块：批量操作配置与均匀分批 chunkRandom】
    // ------------------------------------------------------------
    // ▍功能：
    //   定义批量 TX（部署 / 普通停采 / 紧急停采）的公共配置常量，以及
    //   核心分批算法 chunkRandom：把任意长度的 Kami 列表切成大小均匀、
    //   带随机扰动的批次。设计目标与全脚本一致：减少 TX 次数 + 省 gas。
    // ▍触发时机：
    //   常量在脚本加载时定义；chunkRandom 由部署、普通停采、紧急停采
    //   三个板块在组批时调用。
    // ▍依赖：纯计算，无 DOM / window 接口 / localStorage / 链上 API。
    // ▍核心流程（chunkRandom，设 L = arr.length）：
    //   1) 空数组返回 []；L ≤ maxSize 整体一批（即使 < minSize 也接受，
    //      单独一小批也比再拆成更小的零头好）
    //   2) 计算最少批数 numBatches：从 ceil(L/maxSize) 起往下调，直到
    //      每批基础大小 floor(L/numBatches) ≥ minSize
    //   3) 若调到 numBatches === 1：说明 L 落在 (maxSize, 2*minSize-1]
    //      区间（minSize=6 / maxSize=10 时即 L=11），整体一批装下——
    //      虽略超 maxSize 但 gas 仍在安全区（N=11 停采约 16.15M gas，
    //      低于 N=12 的约 17.40M）
    //   4) 均匀分配：基础大小 baseSize = floor(L/numBatches)，零头
    //      remainder 通过 Fisher-Yates 洗牌随机指派给 remainder 个批次
    //      各 +1，保留批量大小的随机错峰效果
    // ▍边界与保护：
    //   - 每批大小保证 ≥ minSize（除非 L 本身 < minSize），避免特定
    //     长度（如 L=13/14/15/23/25）出现 3-5 只的小残批单独发 TX——
    //     小批次 gas 单价高，违背省 gas 原则
    //   - 批大小随机化：固定的大批量在链上 gas 飙升时段失败率偏高，
    //     每批 6-10 随机错峰可降低整批失败概率
    //   - 批量上限由算法本身保证（最大 11 只/批），无需额外硬上限常量
    // ▍可调参数：
    //   MIN_DEPLOY_BATCH = 6 — 部署凑批门槛：候选 Kami < 6 只时跳过
    //     本轮部署，等下一轮凑够再发。依据 gas 曲线：单只部署约 1.35M
    //     gas，6 只批量约 0.80M/只，散发要多花约 70%。调小 → 部署更
    //     及时但 gas 单价上升；调大 → 更省 gas 但 Kami 闲置等待更久
    //   UI_SETTLE_MS = 25000 — 批量操作后等待游戏前端界面/状态刷新
    //     稳定的时长（毫秒）。调小 → 流程更快但可能读到未刷新的旧
    //     状态；调大 → 更稳但整轮耗时增加
    //   chunkRandom 形参 minSize=6 / maxSize=10 — 每批的下限/上限。
    //     整体调大则批次更大更省 gas，但单批失败的损失也更大
    // ▍相关控制台命令：无（内部配置与工具函数）
    // ============================================================
    const MIN_DEPLOY_BATCH = 6;   // 部署凑批门槛：候选 < 6 只跳过本轮（gas 依据见上方板块说明）
    const UI_SETTLE_MS = 25000;   // 批量操作后等待前端状态刷新稳定（毫秒）
    const _isHash64 = v => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);  // 校验 0x+64 位十六进制的合法 TX 哈希

    // 均匀分批 + 随机错峰：保证每批 ≥ minSize（除非 arr 总数 < minSize，整体一批装下）
    // 算法：先算最少批数 numBatches 使 floor(L/n) ≥ minSize；再均匀分配 + 随机 +1 散零头
    // 覆盖：普通停采 + 紧急停采 + 部署
    function chunkRandom(arr, minSize = 6, maxSize = 10) {
        if (!arr || arr.length === 0) return [];
        // arr 总数 ≤ maxSize：一批装下（如果 < minSize 也接受，比拆成更小的零头好）
        if (arr.length <= maxSize) return [arr.slice()];

        // 计算最少批数：尽量多分，但每批 baseSize 必须 ≥ minSize
        let numBatches = Math.ceil(arr.length / maxSize);
        while (numBatches > 1 && Math.floor(arr.length / numBatches) < minSize) {
            numBatches--;
        }
        if (numBatches === 1) {
            // L 在 (maxSize, 2*minSize-1] 区间（minSize=6/maxSize=10 时 L=11），
            // 一批装下虽略超 maxSize 但 ≤ 11，gas 仍在安全区（N=11 停采约 16.15M，低于 N=12 的约 17.40M）
            return [arr.slice()];
        }

        const baseSize  = Math.floor(arr.length / numBatches);
        const remainder = arr.length % numBatches;  // 这些批 baseSize+1，散在哪批由随机决定

        // Fisher-Yates 抽 remainder 个批位让其 +1（保留随机错峰效果）
        const indices = Array.from({ length: numBatches }, (_, k) => k);
        for (let k = indices.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [indices[k], indices[j]] = [indices[j], indices[k]];
        }
        const plusOneSet = new Set(indices.slice(0, remainder));

        const out = [];
        let i = 0;
        for (let b = 0; b < numBatches; b++) {
            const size = baseSize + (plusOneSet.has(b) ? 1 : 0);
            out.push(arr.slice(i, i + size));
            i += size;
        }
        return out;
    }

    // ============================================================
    // 【板块：链上基础信息查询工具】
    // ------------------------------------------------------------
    // ▍功能：
    //   两个轻量查询工具：
    //   - _getTileNumber()：查当前账户所在地块（房间）编号 roomIndex，
    //     部署流程用它确认 Kami 要部署到哪个采集点
    //   - _fetchKamiAndHarvestIds(index)：按图鉴编号实时查单只 Kami 的
    //     链上实体 ID（kamiId）与当前采集实体 ID（harvestId）。当本地
    //     DB 缺记录、或 harvestId 已因重新部署而变化时，作为实时数据
    //     的回退来源
    // ▍触发时机：
    //   部署 / 停采流程按需调用（纯工具函数，无定时器）。
    // ▍依赖：
    //   - window.network.network.connectedAddress.value_ — 钱包地址
    //   - window.network.explorer.accounts.getByOperator — 取 roomIndex
    //   - window.network.explorer.kamis.getByIndex(index, {harvest:true})
    //     — 只开 harvest 选项，最小化查询开销
    // ▍核心流程：
    //   _getTileNumber：取地址 → getByOperator → Number(roomIndex) 并
    //     校验为有限数值
    //   _fetchKamiAndHarvestIds：接口存在性检查 → getByIndex → 解构出
    //     id 与 harvest.id
    // ▍边界与保护：
    //   - _getTileNumber 失败返回 NaN，调用方用 Number.isFinite 判断，
    //     不抛异常中断流程
    //   - _fetchKamiAndHarvestIds 失败返回 {kamiId:null, harvestId:null}，
    //     调用方按 null 走跳过/重试逻辑，不中断批量流程
    // ▍可调参数：无
    // ▍相关控制台命令：无（内部工具函数）
    // ============================================================
    async function _getTileNumber() {
        try {
            const net = window.network;
            const addr = net?.network?.connectedAddress?.value_;
            const acct = await net?.explorer?.accounts?.getByOperator(addr);
            const tile = Number(acct?.roomIndex);
            if (!Number.isFinite(tile)) throw new Error('roomIndex 不可用');
            return tile;
        } catch (e) {
            log('⚠️ 获取地块编号失败：', e?.message || e);
            return NaN;
        }
    }

    async function _fetchKamiAndHarvestIds(index) {
        try {
            const ex = window.network?.explorer?.kamis;
            if (!ex?.getByIndex) return { kamiId: null, harvestId: null };
            const res = await ex.getByIndex(Number(index), { harvest: true });
            const kamiId = res?.id || null;
            const harvestId = res?.harvest?.id || null;
            return { kamiId, harvestId };
        } catch (e) {
            log(`⚠️ [explorer] index=${index} 取 Kami/Harvest ID 失败：`, e?.message || e);
            return { kamiId: null, harvestId: null };
        }
    }

    // ============================================================
    // 【板块：Kami 状态检测工具】
    // ------------------------------------------------------------
    // ▍功能：将链上返回的 Kami 状态字符串归一化为小写状态码，并提供
    //   isHarvesting / isResting / isDead 三个便捷判断函数，供停采、
    //   喂食、复活等所有决策逻辑统一调用，避免各处散落大小写比较。
    // ▍触发时机：被动工具函数，任何需要判断 Kami 链上状态的地方调用。
    // ▍依赖：入参 res 为 window.network.explorer.kamis.getByIndex()
    //   的返回对象，仅读取其 state 字段；无 DOM、无 localStorage、
    //   无额外链上请求。
    // ▍核心流程：1) 取 res.state 并转大写；2) switch 映射：
    //   HARVESTING → 'harvesting'（采集中）、RESTING → 'resting'
    //   （休息中）、DEAD → 'dead'（已死亡）、721_EXTERNAL →
    //   'external'（已作为 ERC-721 转出到外部钱包，不归本账户管辖）；
    //   3) 其余任何值统一返回 'unknown'。
    // ▍边界与保护：res 为空 / 无 state 字段时经 ?. 与 || '' 兜底，
    //   落入 default 分支返回 'unknown'，绝不抛异常。
    // ▍可调参数：无。
    // ▍相关控制台命令：无（纯内部工具）。
    // ============================================================
    function getKamiState(res) {
        const s = (res?.state || '').toUpperCase();
        switch (s) {
            case 'HARVESTING': return 'harvesting';
            case 'RESTING': return 'resting';
            case 'DEAD': return 'dead';
            case '721_EXTERNAL': return 'external';
            default: return 'unknown';
        }
    }

    function isHarvesting(res) { return getKamiState(res) === 'harvesting'; }
    function isResting(res) { return getKamiState(res) === 'resting'; }
    function isDead(res) { return getKamiState(res) === 'dead'; }

    // ============================================================
    // 【板块：账户信息与地块分布打印（含高清算线预警）】
    // ------------------------------------------------------------
    // ▍功能：在控制台打印账户总览 banner：账户名 / Owner / Operator /
    //   Kami 总数 / 当前地块（含亲和属性 affinity）/ 采集中地块分布；
    //   并顺带完成五件事：① 以账户名为 key 启动本会话 gas 消耗统计；
    //   ② 钱包异常（deadzone/死地址）自检，异常则自动刷新；③ 调用
    //   辅助脚本的地块适配分析（如已加载）；④ 高清算线预警
    //   （LT > 65%）；⑤ 本地精简数据库缺录检查与提示。
    // ▍触发时机：启动流程中游戏加载成功后执行一次。
    // ▍依赖：
    //   · 链上 API：window.network.explorer.accounts.getByOperator
    //     （按 Operator 地址取账户对象）、window.network.network
    //     .connectedAddress.value_（当前连接的钱包地址）、
    //     window.network.explorer.kamis.getByIndex（带 harvest 选项，
    //     查每只采集中 Kami 所在节点）、window.network.explorer
    //     .nodes.all()（全部采集节点，用于取当前地块 affinity）。
    //   · window 接口：window.kamiAnalyze —— 辅助脚本注入的地块适配
    //     分析函数（可选，不存在则跳过）；window.kami_core_db ——
    //     精简数据库（数组，每项含 index / LT / body 等字段，由
    //     配套的精简数据库脚本预先生成）。
    //   · 全局工具：__getRoomNameByIndex（地块编号 → 名称）、
    //     checkLowBalanceOnce（低余额告警）、delay、smartReload、log。
    //   · DOM / localStorage：本板块不直接依赖。
    // ▍核心流程：1) 拉取账户对象，解析名称、地址、kami 列表、所在
    //   房间号；2) 过滤出 state=HARVESTING 的 kami，用内置并发池
    //   runPool（并发度 6）逐只查询 harvest 节点，按地块聚合计数并
    //   降序排列；3) 打印 banner 与地块分布；4) deadzone 自检：
    //   roomIndex 为 0，或 Owner/Operator 含 0x...dead 占位地址 →
    //   判定钱包连接异常，等 10 秒后 smartReload 刷新重连；5) 若辅助
    //   脚本可用则调用 window.kamiAnalyze()；6) 高清算线预警：以 API
    //   实时 kamiList 为基准去 join 本地数据库，LT > 65 的按 LT 降序
    //   逐只红字列出并给出维护建议；7) 数据库缺录的 Kami 黄字提示，
    //   引导重跑精简数据库脚本。
    // ▍边界与保护：整个函数被 try/catch 包裹，任何失败只打一行错误
    //   日志、不影响启动流程；affinity 获取失败静默忽略；
    //   checkLowBalanceOnce 失败静默忽略；runPool 单项查询异常写入
    //   { error } 占位，不中断整批；预警以实时 kamiList 为准，已转出
    //   账户的 Kami 不会产生幽灵警告。
    // ▍可调参数：runPool 并发度 concurrency = 6 —— 调大统计更快但对
    //   链上 API 压力更大；LT 预警阈值 65（写死在 rec.LT > 65 中）——
    //   属于提示性阈值（清算线过高的 kami 应优先升级降线）；deadzone 刷新前等待
    //   10000ms（写死在 delay(10000) 中）。
    // ▍相关控制台命令：无（启动时自动执行）。
    // ============================================================
    async function printAccountAndRooms() {
        try {
            const acc = await window.network.explorer.accounts.getByOperator(
                window.network.network.connectedAddress.value_
            );

            const name      = acc.name || '(未命名)';
            const owner     = acc.ownerAddress || '(无)';
            const operator  = acc.operatorAddress || '(无)';
            const kamiList  = Array.isArray(acc.kamis) ? acc.kamis : [];
            const kamiCount = kamiList.length;
            const accountRm = acc.roomIndex ?? '(未知)';

            const harvesting = kamiList.filter(
                k => String(k.state || '').toUpperCase() === 'HARVESTING'
            );

            // 小型并发池：以固定并发度跑完一批异步任务；单项异常写入 { error } 占位，不中断整批
            async function runPool(items, worker, concurrency = 6) {
                const out = new Array(items.length);
                let next = 0;
                async function loop() {
                    while (true) {
                        const i = next; next += 1;
                        if (i >= items.length) break;
                        try { out[i] = await worker(items[i], i); }
                        catch (e) { out[i] = { error: e?.message || String(e) }; }
                    }
                }
                await Promise.all(Array.from({ length: concurrency }, loop));
                return out;
            }

            // 6 路并发逐只查询采集中 Kami 的 harvest 节点，避免一次性对链上 API 发起几十个请求
            const roomInfos = await runPool(harvesting, async k => {
                const res = await window.network.explorer.kamis.getByIndex(k.index, { harvest: true });
                const node = res?.harvest?.node;
                return node ? { index: node.index, name: node.name } : null;
            });

            // 按地块聚合计数，随后按采集中数量降序排列
            const roomMap = new Map();
            for (const info of roomInfos) {
                if (!info) continue;
                const key = String(info.index);
                const cur = roomMap.get(key) || { index: info.index, name: info.name, count: 0 };
                cur.count += 1;
                roomMap.set(key, cur);
            }
            const rooms = [...roomMap.values()].sort((a,b)=>b.count - a.count);

            // 获取当前地块的affinity（亲和属性），仅用于 banner 展示；取不到时不显示
            let roomAffinity = null;
            try {
                const allNodes = window.network.explorer.nodes.all();
                const node = allNodes.find(n => n.roomIndex === accountRm);
                if (node?.affinity && Array.isArray(node.affinity)) {
                    roomAffinity = node.affinity.map(a => a.toUpperCase()).join('+');
                }
            } catch (e) { /* 忽略 */ }

            log('========== 🪶 账户信息 ==========');
            console.log(
                `%c👤 账户名: %c${name}`,
                'color:white;font-weight:bold;background:#444;padding:2px 6px;border-radius:4px;',
                'color:#ff4d4f;font-weight:bold;'
            );
            log(`🪪 Owner: ${owner}`);
            log(`🧠 Operator: ${operator}`);
            // 会话启动时检查一次账户余额是否低于警戒线（失败静默忽略，不影响主流程；旧余额差 gas 统计已于 1.2.7 删除，改用 showGasReport 链上真值账本）
            try { checkLowBalanceOnce(name || '(unknown)', 'start'); } catch {}
            console.log(
                `%c📦 Kami 总数: %c${kamiCount}`,
                'color:white;font-weight:bold;background:#444;padding:2px 6px;border-radius:4px;',
                'color:#ff4d4f;font-weight:bold;'
            );
            // 获取当前地块名称和属性
            const accountRoomName = __getRoomNameByIndex(accountRm) || '未知';
            const affinityStr = roomAffinity ? ` [${roomAffinity}]` : '';
            log(`🏠 当前地块: ${accountRoomName} (#${accountRm})${affinityStr}`);

            if (rooms.length) {
                log('🌾 正在采集的地块分布:');
                for (const r of rooms) {
                    log(`   - ${r.name} (#${r.index}) | 采集中 ${r.count} 个 Kami`);
                }
            } else {
                log('🌾 正在采集的地块分布: (无采集中 Kami)');
            }

            // deadzone/死地址检测：钱包连接异常时，账户会表现为 0 号房间，
            // 或 Owner/Operator 变成 0x...dead 占位地址——此状态下继续挂机没有意义，等 10 秒后自动刷新重连
            const isDead = accountRm === 0
                        || owner?.toLowerCase()?.includes('0x000000000000000000000000000000000000dead')
                        || operator?.toLowerCase()?.includes('0x000000000000000000000000000000000000dead');
            if (isDead) {
                log(`%c🧨 [异常检测] 钱包连接异常（deadzone/死地址），10秒后自动刷新页面`,
                    'color: red; font-weight: bold; font-size: 14px;');
                await delay(10000);
                smartReload('钱包连接异常：deadzone/死地址');
                return;
            }

            // 调用辅助脚本的地块适配分析（如果可用）
            if (typeof window.kamiAnalyze === 'function') {
                await window.kamiAnalyze();
            }

            // ========= 🚨 高清算线预警（LT > 65%，停采线顶到封顶）=========
            // 以 API 实时 kamiList 为基准查数据库（而非反向遍历数据库），已转出账户的 Kami 不会产生幽灵警告
            // 阈值 80% 与停采线上限 80% 对应：LT 超过它意味着停采线已保不住这只 Kami，缓冲空间极小
            // （此 80% 仅为预警提示阈值，与其他功能使用的阈值互不相干）
            const coreDb = window.kami_core_db || [];
            if (kamiList.length > 0) {
                const dbMap = new Map(coreDb.map(k => [Number(k.index), k]));
                const missing = [];
                const highLT = [];

                for (const k of kamiList) {
                    const rec = dbMap.get(Number(k.index));
                    if (!rec) {
                        missing.push(k);
                    } else if (rec.LT != null && !isNaN(rec.LT) && rec.LT > 65) {
                        highLT.push({ ...rec, state: String(k.state || '?').toUpperCase() });
                    }
                }

                highLT.sort((a, b) => b.LT - a.LT);

                if (highLT.length > 0) {
                    console.log(
                        `%c🚨 警告：${highLT.length} 个 Kami 清算线超过 65%，请优先维护升级！`,
                        'color:red; font-size:16px; font-weight:bold; background:#fff0f0; padding:4px;'
                    );
                    console.log(
                        `%c   停采线上限仅 80%，这些 Kami 缓冲空间极小，极易被清算！`,
                        'color:red; font-weight:bold;'
                    );
                    console.log(
                        `%c   建议：优先升级 harmony / 重置技能加 defense，从清算线最高的开始处理`,
                        'color:red; font-weight:bold;'
                    );
                    highLT.forEach((k, i) => {
                        console.log(
                            `%c   ${i + 1}. #${k.index}（LT=${k.LT}%） body=${k.body || '?'} state=${k.state}`,
                            'color:red; font-weight:bold; font-size:13px;'
                        );
                    });
                } else if (coreDb.length > 0) {
                    console.log(
                        `%c✅ 账户内所有已收录 Kami 清算线均 ≤ 80%，状态良好`,
                        'color:green; font-size:14px; font-weight:bold;'
                    );
                }

                if (missing.length > 0) {
                    const idList = missing.map(k => `#${k.index}`).join(', ');
                    console.log(
                        `%c⚠️ 数据库未收录 ${missing.length} 只 Kami（${idList}），建议刷新页面重新运行精简数据库脚本以更新`,
                        'color:orange; font-size:14px; font-weight:bold; background:#fffbe6; padding:4px;'
                    );
                }
            }

            log('================================');
        } catch (err) {
            log('❌ 获取账户/地块信息失败:', err);
        }
    }

    // ============================================================
    // 【板块：批量清单日志格式化】
    // ------------------------------------------------------------
    // ▍功能：把待部署 / 待停采的 Kami 清单压缩成一行可读日志，格式为
    //   "#数据库编号/img图片编号/id前6位…"；停采清单额外附带 Δ
    //   （delta，清单构造方传入的数值指标，仅原样展示），便于在控制台
    //   快速对照每只 Kami。
    // ▍触发时机：批量部署与批量停采各日志输出处调用。
    // ▍依赖：无外部依赖，纯字符串处理。
    //   _fmtStartList 读取字段：dbIndex（数据库编号）、imgNumber
    //   （DOM 图片编号）、kamiId（链上 Kami 实体 id）；
    //   _fmtStopList 读取字段：dbIndex、imgNumber、harvestId
    //   （链上采集实体 id）、delta（可选数值）。
    // ▍核心流程：1) 截取 id 前 6 位加省略号；2) id 缺失时显示
    //   kid:N/A / hid:N/A；3) delta 为数字时追加 "/Δ=值"；4) 逗号
    //   拼接整份清单。
    // ▍边界与保护：任何字段缺失都不会抛错，只影响展示内容。
    // ▍可调参数：无（截断长度 6 写死在 slice(0,6) 中）。
    // ▍相关控制台命令：无。
    // ============================================================
    function _fmtStartList(list) {
        return list.map(x => {
            const kid = x.kamiId ? String(x.kamiId) : '';
            const short = kid ? `kid:${kid.slice(0,6)}…` : 'kid:N/A';
            return `#${x.dbIndex}/img${x.imgNumber}/${short}`;
        }).join(', ');
    }

    function _fmtStopList(list) {
        return list.map(x => {
            const hid = x.harvestId ? String(x.harvestId) : '';
            const short = hid ? `hid:${hid.slice(0,6)}…` : 'hid:N/A';
            const d = (typeof x.delta === 'number') ? `Δ=${x.delta.toFixed(2)}` : '';
            return `#${x.dbIndex}/img${x.imgNumber}/${short}${d ? `/${d}` : ''}`;
        }).join(', ');
    }

    // ============================================================
    // 【板块：imgNumber 提取与动作去重记录】
    // ------------------------------------------------------------
    // ▍功能：imgNumber 是 Kami 头像 gif 的编号，是「DOM 卡片 ↔ 链上
    //   Kami」互相对应的唯一桥梁。本板块提供：从任意 DOM 节点提取
    //   imgNumber（getimgNumber）；以及基于 imgNumber 的最近动作
    //   记录 / 查询（recordAction / alreadyActed），防止同一 Kami 在
    //   一个检查周期内被重复执行同类操作。
    // ▍触发时机：所有需要把 DOM 卡片与链上数据对应起来的逻辑调用
    //   getimgNumber；对 Kami 执行动作前查 alreadyActed，执行成功后
    //   调 recordAction 登记。
    // ▍依赖：DOM —— 传入节点自身是 <img>，或其内部含
    //   img[src*="/kami/"]，src 形如 .../kami/<数字>.gif；全局 Map
    //   kamiHistory（内存态动作历史，页面刷新即清空）；全局常量
    //   checkInterval（主循环周期，同时充当去重时间窗口）。
    // ▍核心流程：1) getimgNumber 用正则 /\/kami\/(\d+)\.gif/ 从
    //   img.src 提取编号，取不到返回 null；2) recordAction 以
    //   imgNumber 为 key 记录 { lastAction, timestamp }；
    //   3) alreadyActed 判断「同类动作 且 距上次不足一个
    //   checkInterval」即视为已处理，调用方据此跳过。
    // ▍边界与保护：img 缺失 / src 不匹配时返回 null 而非抛错；去重
    //   窗口到期自动失效，无需手动清理历史。
    // ▍可调参数：去重窗口复用主循环周期 checkInterval —— 调大可进一步
    //   压制重复动作，但也会延迟对状态变化的响应。
    // ▍相关控制台命令：无。
    // ============================================================
    function getimgNumber(node) {
        const img = node.tagName === 'IMG'
        ? node
        : node.querySelector('img[src*="/kami/"]');
        const m = img?.src?.match(/\/kami\/(\d+)\.gif/);
        return m ? m[1] : null;
    }

    function alreadyActed(imgNumber, actionType) {
        const history = kamiHistory.get(imgNumber);
        return history && history.lastAction === actionType && Date.now() - history.timestamp < checkInterval;
    }

    function recordAction(imgNumber, actionType) {
        kamiHistory.set(imgNumber, { lastAction: actionType, timestamp: Date.now() });
    }

    // ============================================================
    // 【板块：普通停采工具（AllowFailure 批量停采 + 退避重试）】
    // ------------------------------------------------------------
    // ▍功能：把一批达到停采条件的 Kami 从采集点批量停下。共四层：
    //   ① _isCardHarvestingByImg —— 用 DOM 卡片状态图标判断某只是否
    //      仍显示"采集中"；
    //   ② _allowFailureStop —— 底层合约通道，一笔 TX 批量停采，单只
    //      失败不连坐；
    //   ③ _apiStopOnceFallback —— 旧版游戏 API 停采，仅作回退通道；
    //   ④ stopWithBackoff —— 调度主函数：预检、重试、二分拆包、
    //      黑名单、紧急锁让路，一站式收敛。
    // ▍触发时机：主循环判定有 Kami 达到普通停采条件后，携清单调用
    //   stopWithBackoff。本链路与"紧急停采"是两条独立链路，普通停采
    //   全程主动给紧急停采让路（TX 双锁机制的一环）。
    // ▍依赖：
    //   · DOM：div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>
    //     div:nth-of-type(2)>div —— Party 面板（eye-half 显示模式）
    //     下的 Kami 卡片列表；卡片内 img[src*="/assets/kami_"] 为
    //     状态小图标，src 含 kami_harvesting 即采集中。
    //   · 链上：window.network.txQueue.systems["system.harvest.stop"]
    //     —— 停采 System 合约句柄（.interface 用于编码入参，.target
    //     为合约地址）；window.network.network.signer —— 签名器，
    //     直接 sendTransaction；window.network.explorer.kamis
    //     .getByIndex —— 实时状态 / harvestId 查询；
    //     window.network.api.player.pet.harvest.stop —— 旧版批量
    //     停采 API（仅回退用）。
    //   · 全局状态与工具：hasEmergencyLock()（紧急锁探测）、
    //     _preCheckStop()（对 harvestId 做模拟调用预检，返回
    //     { ok, reason }）、__stopBlockedKamis / __stopBlockedTime
    //     （停采黑名单 Set / Map，记录 kamiId 与拉黑时刻，由外部
    //     逻辑按时限解封）、__getMyRoomIndex / __getRoomNameByIndex
    //     （当前地块）、UI_SETTLE_MS（TX 确认后等 UI 收敛的时长）、
    //     recordAction（动作去重登记）、dlog / log / delay。
    // ▍核心流程（stopWithBackoff）：
    //   1) 入场先等 STATE_CHECK_DELAY_MS，让链上/UI 状态沉淀并拉开
    //      TX 间隔；整份清单作为一个"包"入队，每包携带 failStreak
    //      （连续未收敛计数，触发二分的依据）；
    //   2) 逐包处理：先查紧急锁（命中则整体中断让路）；再用 DOM
    //      粗筛出仍显示采集中的；
    //   3) 发送前逐只链上预检：已死亡 / 已休息的跳过；不在当前地块
    //      的跳过并汇总警告；顺手用最新 res.harvest.id 刷新
    //      harvestId（重新部署后会变化）；查询失败的保守保留；
    //   4) 提取 harvestId 调 _allowFailureStop 一笔上链；tx 发出后
    //      立即再查紧急锁，命中则不等确认直接让路；
    //   5) 上链成功：等 UI_SETTLE_MS 后链上 + DOM 双重复核；已停的
    //      recordAction('stopHarvest') 登记防重复；仍在采集的
    //      failStreak+1 回队，连续失败 ≥2 且包内多于 1 只时二分
    //      拆包，把坏个体隔离到更小的包里；
    //   6) 上链失败：逐只查真实状态剔除 dead/resting 后按同样策略
    //      回队 / 二分，等 RETRY_DELAY_MS 再试；
    //   7) 尝试轮数耗尽后，对残留个体逐只 _preCheckStop：预检失败的
    //      kamiId 写入黑名单（防止无限重试）；预检通过的作为返回值
    //      交给上层走 DOM 点击兜底。
    // ▍边界与保护：
    //   · 紧急锁双检查点（每轮开头 + tx 发出后），保证紧急停采永远
    //     优先占用 TX 通道；
    //   · AllowFailure 由合约自动跳过失败个体，不整批回滚，根治
    //     "一只坏、全批连坐"；
    //   · 二分拆包（failStreak ≥ 2 触发）逐步缩小问题包、定位坏个体；
    //   · 黑名单防死循环：预检失败的 kamiId 拉黑并记录时间戳；
    //   · 地块检查防止误停其他地块的 harvest；
    //   · 回退链：合约句柄 / 签名器不可用 → api.stop；tx 无 wait
    //     方法 → 固定延时 15 秒兜底；
    //   · maxAttempts 熔断总上链轮数；各分支均 try/catch，DOM 查询
    //     异常一律按"不在采集"处理。
    // ▍可调参数：
    //   · maxAttempts = 5 —— 最大上链尝试轮数；调大更执着，但失败
    //     场景下会多耗 gas；
    //   · STATE_CHECK_DELAY_MS = 5000 —— 入场静默期；
    //   · RETRY_DELAY_MS = 5000 —— 失败重试间隔；二者调小会提高
    //     nonce 冲突概率，调大则整体停采变慢；
    //   · 二分触发条件：failStreak >= 2 且包内 > 1 只（写死在分支中）；
    //   · API 回退中 tx 无 wait 方法时固定等待 15000ms。
    // ▍相关控制台命令：无（由主循环调度）。
    // ============================================================
    function _isCardHarvestingByImg(imgNumber) {
        try {
            const card = Array.from(document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div'))
            .find(div => getimgNumber(div) === String(imgNumber));
            if (!card) return false;
            // 从卡片内查找状态小图标：src 含 kami_harvesting 即视为采集中
            const stateImg = card.querySelector('img[src*="/assets/kami_"]');
            return stateImg?.src?.includes('kami_harvesting') ?? false;
        } catch (_) { return false; }
    }

    // AllowFailure 底层停采：绕过游戏封装，直接调用停采 System 合约的 executeBatchedAllowFailure
    // 普通批量调用只要有一只失败就会整批回滚（连坐）；AllowFailure 让合约自动跳过失败个体，其余照常停采
    async function _allowFailureStop(harvestIds, fmtListForLog) {
        const system = window.network?.txQueue?.systems?.["system.harvest.stop"];
        const signer = window.network?.network?.signer;
        if (!system?.interface || !signer) {
            log(`⚠️ [AllowFailure停采] system或signer不可用，回退到api.stop`);
            return _apiStopOnceFallback(harvestIds, fmtListForLog);
        }
        log(`🧾 [AllowFailure停采] ${harvestIds.length} 个 → ${fmtListForLog}`);
        dlog('api', '[AllowFailure STOP ids]', harvestIds);
        let reachedConfirm = false;   // 🔻SYNC→内部版[1.1.21 确认异常文案区分] tx 已入队进入确认段后置 true，供 catch 区分"发送失败" vs "确认异常"
        try {
            // 🔻SYNC→内部版[1.1.19 停采通道统一]
            // 发送通道：默认走 MUD txQueue（system 即 txQueue.systems["system.harvest.stop"]，
            //   与 api 同一 nonce 账本，消除 signer.sendTransaction 造成的双账本 sequence mismatch）；
            //   队列入口缺失时打 ⚠️ 并自动跌落到原始签名器路径（逐字节保留）。tx 由本函数内部
            //   照旧 .wait()+按 gas 判级消费，返回值(true/false/null)语义与形状不变，下游零改动。
            let tx;
            if (_getStopTxChannel() === 'mud' && typeof system.executeBatchedAllowFailure === 'function') {
                // MUD 队列通道：同一 executeBatchedAllowFailure 入口、同一 harvestIds 实参（不重新编码 calldata），容错语义一致
                // 🔻SYNC→内部版[1.1.19 停采通道统一] D4：mud enqueue+resolve 计时（与 D2 同一队列 resolve 语义问题，此路单批 await）
                const __afStart = Date.now();
                tx = await system.executeBatchedAllowFailure(harvestIds);
                const __afMs = Date.now() - __afStart;
                if (tx) log(`📡 [AllowFailure停采/通道] 本批经 MUD 队列发送(nonce统一) tx=${(tx?.hash || '').slice(0, 10)}… mud enqueue+resolve=${__afMs}ms`);
            } else {
                if (_getStopTxChannel() === 'mud') {
                    __stopChanFallbackCount++;   // 🔻SYNC→内部版[1.1.19 停采通道统一] D3：跌落 raw 计数
                    log(`⚠️ [AllowFailure停采/通道] MUD 队列停采入口不可用，本批自动回退原始签名器`);
                }
                // ---- 原始签名器通道（回退，逐字节保留）----
                // 合约入参为 uint256[]，先把 harvestId 统一转成 BigInt 再做 ABI 编码
                const bigIntIds = harvestIds.map(id => BigInt(id));
                const data = system.interface.encodeFunctionData('executeBatchedAllowFailure', [bigIntIds]);
                tx = await signer.sendTransaction({ to: system.target, data });
            }
            if (!tx) {
                log(`⚠️ [AllowFailure停采/返回空Tx] → ${fmtListForLog}`);
                return false;
            }
            _gasLedgerRecord('stop', harvestIds, tx);   // 🔻SYNC[1.2.7 gas真值账本] 记账 hook（覆盖 mud+raw 两分支，tx 已非空）
            reachedConfirm = true;   // tx 已入队，往后任何抛错都属"确认阶段"，非"发送失败"
            // 🔻SYNC→内部版[1.1.21 停采回执适配] 队列 resolve 出的可能是 tx(带wait) 也可能直接是 receipt，
            //   统一经 _awaitStopReceipt 归一；raw 分支 tx 带 wait，走 wait() 语义/行为逐字节等价。
            const { receipt, hash: rawHash, shape } = await _awaitStopReceipt(tx);
            const hash = rawHash ? String(rawHash).slice(0, 10) + '…' : 'N/A';
            // I2 最高红线：形状未知 / 回执缺 gasUsed（gasUsed==null）→ 无法做 gas 判级，一律转 state 复读裁决
            //   （return null=pendingVerify，本批不计成功/不计失败），绝不当 revert（return false 会记失败）。
            //   旧码 `gasUsed != null ? Number(...) : 0` 的 :0 分支会把缺 gas 误判成 revert 级 → 记失败，此处消灭。
            if (shape === 'unknown' || !receipt || receipt.gasUsed == null) {
                __pendingVerifyBatchCount++;
                log(`⚠️ [AllowFailure停采/确认适配] 回执形状未知/缺gas，转 state 复读裁决（本批不计成功/不计失败，成功交由下轮复读 state≠HARVESTING 判定）tx:${hash} shape=${shape} → ${fmtListForLog}`);
                return null;
            }
            // 交易本身是否 revert：status 缺失（== null）不当失败，只有明确读到非 1 才判执行失败（raw 回执 status 恒 0/1，行为等价）
            const txOk = receipt.status == null || Number(receipt.status) === 1;
            if (!txOk) {
                log(`❌ [AllowFailure停采/交易上链但执行失败] tx:${hash} → 全部 ${harvestIds.length} 个未停采`);
                return false;
            }
            // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
            // 0709 审计定案：receipt.status===1 只代表交易本身没有整体 revert，
            // 不代表 AllowFailure 批内每个成员都真的执行了停采——单只打在
            // 已停/不可停 kami 上的调用同样 status===1（合约层面吞掉了失败），
            // 旧版看到 status===1 就直接报"🛑交易成功"是误报的根因之一。
            // 改为按每只均摊 gas 判级：真停实测≈1.5M/只，revert级(已停/不可停)
            // 实测≈261k/只，用 EMERGENCY_CONFIG 里同一套阈值判定，口径统一。
            // 🔻SYNC→内部版[1.1.14 停采闭环ABCD:阈值收紧+成功集驱动remaining+cooldown解耦+classify冷却分支]
            // 改动A 收紧 GAS_FULL_EXEC_PER_KAMI（800000→1200000）直接读同一个
            // EMERGENCY_CONFIG 常量，此处无需单独改数值，自动同步生效。
            // 🔻SYNC→内部版[1.1.14 停采闭环边角:full_exec双条件+classify查询失败保守+cooldown收尾剔成功集]
            // 修复1同款：与 _emergencyConfirmBatch 用同一套 full_exec 双条件判据，
            // 两处必须同款逻辑，避免分叉。harvestIds.length 对单只场景=1：
            // 单只真停(实测≈1.54M/只)估算执行1≥1→full_exec 正确；单只revert
            // (实测≈261k/只)估算执行0<1，天然落不到 full_exec，走下面 revert
            // 分支，结果不变。
            const gasUsedNum = Number(receipt.gasUsed.toString());   // 上方门闩已保证 gasUsed 非空（缺 gas 已在 pendingVerify 分支 return null），不再有 :0 假 revert 分支
            const perKami = harvestIds.length > 0 ? gasUsedNum / harvestIds.length : 0;
            const estimatedExecuted = Math.max(0, Math.round((gasUsedNum - EMERGENCY_CONFIG.GAS_REVERT_BASE) / EMERGENCY_CONFIG.GAS_PER_KAMI_ESTIMATE));
            if (perKami >= EMERGENCY_CONFIG.GAS_FULL_EXEC_PER_KAMI && estimatedExecuted >= harvestIds.length) {
                // BEFORE(Bug B前): gas full_exec 直接 return true，调用点据此 _stopCreditSuccess。
                __pendingVerifyBatchCount++;   // 🔻SYNC→内部版[1.1.17 可观测性批次] C4：pendingVerify 批数 +1（纯统计）
                log(`🟡 [AllowFailure停采/gas观察] gas=${gasUsedNum} 每只均摊=${Math.round(perKami)} 估算执行${estimatedExecuted}≥全员${harvestIds.length} tx:${hash} → gas 不作停成凭据，pendingVerify: ${fmtListForLog}`);
                return null;
            }
            if (perKami <= EMERGENCY_CONFIG.GAS_FULL_REVERT_PER_KAMI) {
                log(`⚠️ [AllowFailure停采/上链但未生效(revert级gas=${Math.round(perKami)}/只)] 多半该kami已停，待索引器确认 tx:${hash} → ${fmtListForLog}`);
                return false;
            }
            log(`🟡 [AllowFailure停采/混合gas(每只均摊=${Math.round(perKami)}，估算执行≈${estimatedExecuted}只)] 多id合发时无法单独从gas确认每个成员是否都生效，按未完全确认处理，交调用方复核 tx:${hash} → ${fmtListForLog}`);
            return false;
        } catch (e) {
            const errMsg = e?.message || String(e);
            // 🔻SYNC→内部版[1.1.21 确认异常文案区分]（codex Q5#5）
            //   reachedConfirm=true 表示 tx 已入队、错误发生在确认(回执归一)阶段：不得写"发送失败/未停采"（tx 已入队），
            //   改为交 state 复读裁决，且 return null（pendingVerify，不记失败）——与 I2 一致，避免确认期偶发抛错被误记失败拉黑。
            //   reachedConfirm=false 才是真正发送阶段失败，保留原文案并 return false（记失败，语义不变）。
            if (reachedConfirm) {
                log(`❌ [紧急停采/确认异常] tx 已入队但确认阶段出错(${errMsg.slice(0, 80)})，成员状态交 state 复读裁决 → ${fmtListForLog}`);
                return null;
            }
            log(`❌ [AllowFailure停采/发送失败] 全部 ${harvestIds.length} 个未停采: ${errMsg.slice(0, 80)}`);
            return false;
        }
    }

    // 回退通道：底层合约句柄不可用时，改走游戏自带的 api.stop 批量停采
    async function _apiStopOnceFallback(ids, fmtListForLog) {
        const api = window.network?.api?.player?.pet?.harvest;
        if (!api?.stop) throw new Error('api.stop 不可用');
        log(`🧾 [批量停止/准备(API fallback)] ${ids.length} 个 → ${fmtListForLog}`);
        dlog('api', '[STOP ids]', ids);
        try {
            const tx = await api.stop(ids);
            if (!tx) {
                log(`⚠️ [批量停止/API返回空Tx] → ${fmtListForLog}`);
                return false;
            }
            if (typeof tx.wait === 'function') {
                await tx.wait();
            } else {
                log(`⚠️ [批量停止/Tx无wait方法，使用延时代替]`);
                await delay(15000);
            }
            log(`🛑 [批量停止/完成(API fallback)] tx:${(tx?.hash ? String(tx.hash).slice(0,10)+'…' : 'N/A')} → ${fmtListForLog}`);
            return true;
        } catch (e) {
            log(`❌ [批量停止/API fallback失败] ${e?.message || e}`);
            return false;
        }
    }

    async function stopWithBackoff(apiItems, maxAttempts = 5) {
        // 两个节流延时：保持足够的 TX 间隔，避免与其他交易抢 nonce
        const STATE_CHECK_DELAY_MS = 5000;  // 入场静默期：等链上/UI 状态沉淀后再动手
        const RETRY_DELAY_MS = 5000;        // 失败重试间隔：调小会提高 nonce 冲突概率
        await delay(STATE_CHECK_DELAY_MS);
        if (!apiItems?.length) return [];

        // 待处理队列：每个元素是一个"包"，failStreak 记录该包连续未收敛的次数（触发二分拆包的依据）
        const queue = [{ items: apiItems.slice(), failStreak: 0 }];
        let attempts = 0;

        while (queue.length && attempts < maxAttempts) {
            // 每轮开头先查紧急锁：紧急停采优先级最高，普通停采立即中断让路
            if (hasEmergencyLock()) {
                log(`[TX锁] ⏸️ 检测到紧急锁，中断stopWithBackoff`);
                break;
            }
            const node = queue.shift();
            const chunkItems = node.items;

            // DOM 粗筛：只处理界面上仍显示"采集中"的
            const live = chunkItems.filter(x => _isCardHarvestingByImg(x.imgNumber));
            if (live.length === 0) {
                log(`⭐️ [批量停止/跳过] 本包已无 HARVESTING`);
                continue;
            }

            // 发送前预检：查询链上状态，过滤已死/已停/不在当前地块
            const apiValidList = [];
            const normalStopMyRoom = __getMyRoomIndex();
            const normalStopOtherRoom = [];
            const cooldownSkipped = [];  // 【v1.1.11】本包因冷却跳过的清单，批末统一汇总打印（SYNC 锚点见下方 remain 判断处）
            for (const x of live) {
                try {
                    const res = await window.network.explorer.kamis.getByIndex(x.dbIndex, { harvest: true });
                    if (isDead(res)) {
                        log(`   ☠️ #${x.dbIndex} 链上已死亡，跳过`);
                        continue;
                    }
                    if (isResting(res) || res.state !== 'HARVESTING') {
                        log(`   💤 #${x.dbIndex} 链上已停采，跳过`);
                        continue;
                    }
                    // 地块检查：只停当前地块上的 harvest，跨地块的跳过并汇总警告（防误停其他地块的采集）
                    const harvestRoom = res?.harvest?.node?.index ?? null;
                    if (normalStopMyRoom != null && harvestRoom != null && harvestRoom !== normalStopMyRoom) {
                        normalStopOtherRoom.push({ dbIndex: x.dbIndex, harvestRoom });
                        continue;
                    }
                    // 🔻SYNC→内部版[1.1.11 冷却预筛推广]：复用本次已查到的 harvest.time.last 算冷却
                    // 剩余，remain>0 说明此刻发停采 tx 必败。跳过只是省一次必败 tx，不是永久拉黑——
                    // 该 kami 本身仍是 HARVESTING 状态、仍在账户 kami 列表里，runAutomation 主循环
                    // 间隔 <10min，冷却（180s）解除前主循环最多再跑一两轮就会把它重新捞进下一次
                    // stopWithBackoff 候选清单，不存在漏停风险。
                    const remain = _cooldownRemainSec(res?.harvest?.time?.last);
                    if (remain > 0) {
                        const age = res?.harvest?.time?.last ? Math.round(Date.now() / 1000 - res.harvest.time.last) : 'N/A';
                        cooldownSkipped.push({ dbIndex: x.dbIndex, remain, age });
                        continue;
                    }
                    // 更新harvestId（可能变了）
                    if (res.harvest?.id) x.harvestId = res.harvest.id;
                    apiValidList.push(x);
                } catch (err) {
                    // 查询失败，保守保留
                    apiValidList.push(x);
                }
            }
            if (normalStopOtherRoom.length > 0) {
                const roomName = __getRoomNameByIndex(normalStopMyRoom) || `#${normalStopMyRoom}`;
                const otherList = normalStopOtherRoom.map(x => `#${x.dbIndex}(地块${x.harvestRoom})`).join(', ');
                log(`%c⚠️ [地块不匹配] 当前地块: ${roomName}，${normalStopOtherRoom.length} 个kami在其他地块，已跳过: ${otherList}`,
                    'color: orange; font-weight: bold;');
            }
            if (cooldownSkipped.length > 0) {
                // 逐只日志用于少量场景；单批冷却跳过 >8 只时改为"汇总 + 前5只样例"防刷屏
                const showN = cooldownSkipped.length > 8 ? 5 : cooldownSkipped.length;
                for (const s of cooldownSkipped.slice(0, showN)) {
                    log(`⏳ [停采/冷却预筛] #${s.dbIndex} 冷却剩余 ${s.remain}s（time.last age=${s.age}s），跳过本次停采（此刻停采 tx 必败，解除后下轮自动重停）`);
                }
                if (cooldownSkipped.length > showN) {
                    log(`⏳ [停采/冷却预筛] 另有 ${cooldownSkipped.length - showN} 只同样在冷却中（样例）: ${cooldownSkipped.slice(showN).map(s => `#${s.dbIndex}(剩${s.remain}s)`).join(', ')}`);
                }
                log(`📊 [停采/冷却预筛] 本批 ${live.length} 只候选，${cooldownSkipped.length} 只在冷却中已跳过（下轮重停）`);
            }

            if (apiValidList.length === 0) {
                log(`⭐️ [批量停止/预检] 本包链上已无HARVESTING`);
                continue;
            }

            if (apiValidList.length < live.length) {
                log(`📋 [批量停止/预检] 链上状态过滤: ${live.length} → ${apiValidList.length}`);
            }

            // 走 AllowFailure 通道时无需逐个预检，坏个体会被合约自动跳过
            const ids = apiValidList.map(x => x.harvestId).filter(Boolean);
            if (ids.length === 0) {
                log(`⭐️ [批量停止/预检] 无有效harvestId，跳过本批`);
                continue;
            }
            const fmt = _fmtStopList(apiValidList);

            attempts++;
            const ok = await _allowFailureStop(ids, fmt);

            // tx 发送后立即再查一次紧急锁：如已触发紧急停采，跳过确认环节直接让路
            if (hasEmergencyLock()) {
                log(`[TX锁] ⚡ 停采Tx已发送，检测到紧急锁，跳过确认让路紧急停采`);
                break;
            }

            if (ok) {
                log(`✅ [批量停止/API链上确认成功] 共 ${ids.length} 个 → ${fmt}`);
                await delay(UI_SETTLE_MS);
                // 交易确认后复核：链上 + DOM 双重确认哪些还没真正停下
                const stillHarvesting = [];
                for (const x of chunkItems) {
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(x.dbIndex, { harvest: true });
                        if (!isResting(res) && !isDead(res)) {
                            if (_isCardHarvestingByImg(x.imgNumber)) {
                                stillHarvesting.push(x);
                            }
                        }
                    } catch (err) {
                        console.warn(`⚠️ 检查 Kami ${x.dbIndex} 状态失败：`, err);
                        stillHarvesting.push(x);
                    }
                }

                // DOM 已不显示"采集中"的视为停采成功，登记动作记录，防止本周期内被重复处理
                const stoppedByApi = chunkItems.filter(x => !_isCardHarvestingByImg(x.imgNumber));
                for (const it of stoppedByApi) {
                    try {
                        recordAction(it.imgNumber, 'stopHarvest');
                        log(`🛑 停采成功(API)：Kami ${it.dbIndex}（img:${it.imgNumber}） Δ=${typeof it.delta === 'number' ? it.delta.toFixed(2) : ''}`);
                    } catch(_) {}
                }

                if (stillHarvesting.length > 0) {
                    const fmtStill = _fmtStopList(stillHarvesting);
                    node.failStreak = (node.failStreak || 0) + 1;
                    log(`⚠️ [批量停止/UI未收敛] 仍在采集 ${stillHarvesting.length}/${chunkItems.length} → ${fmtStill}`);

                    // 连续两轮未收敛且包内多于 1 只：二分拆包，把可能的坏个体隔离到更小的包里
                    if (node.failStreak >= 2 && stillHarvesting.length > 1) {
                        const mid = Math.floor(stillHarvesting.length / 2);
                        queue.push({ items: stillHarvesting.slice(0, mid), failStreak: 0 });
                        queue.push({ items: stillHarvesting.slice(mid),     failStreak: 0 });
                        log(`🪓 [二分拆包] ${stillHarvesting.length} → ${stillHarvesting.slice(0, mid).length} + ${stillHarvesting.slice(mid).length}`);
                    } else {
                        queue.push({ items: stillHarvesting, failStreak: node.failStreak });
                        log(`🔁 [重试排队] 回队 ${stillHarvesting.length} 个`);
                    }
                } else {
                    log(`🎉 [批量停止/最终确认成功] 共 ${ids.length} 个 → ${fmt}`);
                }
            } else {
                // 上链失败时先逐只查真实状态，剔除 dead/resting，避免二分拆包时"假采集中"的问题 kami 反复污染重试队列
                log(`⚠️ [批量停止/API失败] 正在查询真实状态...`);
                const retryBase = [];
                for (const x of chunkItems) {
                    // 先检查DOM
                    if (!_isCardHarvestingByImg(x.imgNumber)) continue;
                    // 再查API确认
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(x.dbIndex, { harvest: true });
                        if (!isResting(res) && !isDead(res) && res.state === 'HARVESTING') {
                            // 更新harvestId（可能变了）
                            if (res.harvest?.id) x.harvestId = res.harvest.id;
                            retryBase.push(x);
                        } else {
                            log(`   ℹ️ #${x.dbIndex} 实际状态: ${res.state}，跳过重试`);
                        }
                    } catch (err) {
                        // 查询失败，保守加入重试
                        retryBase.push(x);
                    }
                }

                if (retryBase.length === 0) {
                    log(`⭐️ [重试放弃] 本包已无真正HARVESTING；不再回队`);
                    continue;
                }

                log(`📋 [重试筛选] 原${chunkItems.length}个 → 真正需重试${retryBase.length}个`);
                node.failStreak = (node.failStreak || 0) + 1;

                // 与成功分支同样的二分策略：连续两轮失败且包内多于 1 只时对半拆
                if (node.failStreak >= 2 && retryBase.length > 1) {
                    const mid = Math.floor(retryBase.length / 2);
                    queue.push({ items: retryBase.slice(0, mid), failStreak: 0 });
                    queue.push({ items: retryBase.slice(mid),     failStreak: 0 });
                    log(`🪓 [二分拆包] ${retryBase.length} → ${retryBase.slice(0, mid).length} + ${retryBase.slice(mid).length}`);
                } else {
                    queue.push({ items: retryBase, failStreak: node.failStreak });
                    log(`🔁 [重试排队] 回队 ${retryBase.length} 个（failStreak=${node.failStreak}）`);
                }
                await delay(RETRY_DELAY_MS);
            }
        }

        // 收集所有仍在采集的kami
        const allPending = [];
        for (const node of queue) {
            for (const x of node.items) {
                if (_isCardHarvestingByImg(x.imgNumber)) allPending.push(x);
            }
        }

        // 如果有未能停采的，逐个预检找出真正卡住的
        if (allPending.length > 0) {
            log(`🔍 [批量停止/预检排查] 对 ${allPending.length} 个未停采的kami逐个预检...`);

            const okList = [];      // 预检通过的，交给DOM兜底
            const failList = [];    // 预检失败的，加入黑名单

            for (const x of allPending) {
                if (!x.harvestId) {
                    okList.push(x);  // 没有harvestId，交给DOM
                    continue;
                }

                const check = await _preCheckStop([x.harvestId]);
                if (check.ok) {
                    okList.push(x);
                    dlog('api', `[预检排查] #${x.dbIndex} ✅ 通过`);
                } else {
                    failList.push(x);
                    // 加入停采黑名单
                    if (x.kamiId) {
                        // BEFORE(Bug B前): 预检失败直接写停采黑名单；frozen 时改为 defer，不新增黑名单。
                        if (_isFrontendFrozen()) {
                            log(`🧊 [批量停止/预检排查] #${x.dbIndex} ❌ 失败: ${check.reason}；前端疑似失真，不加入停采黑名单，defer 到下轮`);
                        } else {
                            log(`⚠️ [预检排查] #${x.dbIndex} ❌ 失败: ${check.reason} → 加入黑名单`);
                            __stopBlockedKamis.add(x.kamiId);
                            __stopBlockedTime.set(x.kamiId, Date.now());
                        }
                    } else {
                        log(`⚠️ [预检排查] #${x.dbIndex} ❌ 失败: ${check.reason} → 无kamiId，无法加入黑名单`);
                    }
                }
            }

            if (failList.length > 0) {
                log(`📊 [批量停止/预检结果] 通过: ${okList.length}个(交DOM), 失败: ${failList.length}个(已拉黑)`);
            }

            // 只返回预检通过的，交给DOM兜底
            return okList;
        }

        return [];
    }

    // ============================================================
    // 【板块：眼睛状态检测与 eye-half 等待】
    // ------------------------------------------------------------
    // ▍功能：读取 Party 面板"眼睛"按钮的当前显示模式，并把它切换到
    //   eye-half。脚本的 DOM 状态检测（卡片状态图标等）都建立在
    //   eye-half 模式下的卡片结构上，所以启动自动化前必须先切到位。
    // ▍触发时机：启动序列在游戏加载成功、Party 列表展开后调用
    //   waitForEyeHalf；getEyeState 亦可在任何时刻单独调用。
    // ▍依赖：DOM —— #party button img[src*="eye-"]（眼睛按钮图标，
    //   src 含 eye-open / eye-half / eye-closed 三态之一）；全局工具
    //   simulateClick、delay、getRandomDelayMs、smartReload、log。
    // ▍核心流程：1) getEyeState 按图标 src 关键字返回
    //   'open' / 'half' / 'closed'，找不到按钮或无法识别返回 null；
    //   2) waitForEyeHalf 轮询：状态已是 half 则成功返回 true；否则
    //   点击眼睛按钮（三态循环切换）后等 1 秒再看；状态每次变化都
    //   打日志便于回溯；3) 超时则 smartReload 刷新页面并返回 false。
    // ▍边界与保护：等待上限 = 3 分钟基础 + 随机余量（随机化多账户
    //   行为，避免同一时刻集体超时刷新）；找不到眼睛按钮时不点击、
    //   只继续等待；超时兜底刷新防止挂机卡死在异常界面。
    // ▍可调参数：baseWaitTime = 3 * 60 * 1000 —— 基础等待上限；
    //   getRandomDelayMs(3) —— 追加的随机余量；checkIntervalMs =
    //   2000 —— 轮询间隔；stateDelay = 1000 —— 点击后等 UI 反应的
    //   时长；simulateClick 第二参数 300 —— 模拟点击的时序参数(ms)。
    // ▍相关控制台命令：无。
    // ============================================================
    function getEyeState() {
        const eyeImg = document.querySelector('#party button img[src*="eye-"]');
        if (!eyeImg) return null;
        if (eyeImg.src.includes('eye-open')) return 'open';
        if (eyeImg.src.includes('eye-half')) return 'half';
        if (eyeImg.src.includes('eye-closed')) return 'closed';
        return null;
    }

    async function waitForEyeHalf() {
        // 等待上限 = 3 分钟基础 + 随机余量；随机化可避免多账户在同一时刻集体超时刷新
        const baseWaitTime = 3 * 60 * 1000;
        const maxWaitTime = baseWaitTime + getRandomDelayMs(3);
        const checkIntervalMs = 2000;
        const stateDelay = 1000;
        const startTime = Date.now();
        let lastState = null;

        log(`🕒 等待眼睛状态变为 eye-half（最多 ${(maxWaitTime / 60000).toFixed(1)} 分钟）...`);

        while (true) {
            const elapsed = Date.now() - startTime;
            const state = getEyeState();

            if (state !== lastState) {
                log(`👁️ 状态变更: ${lastState ?? '初始'} → ${state}`);
                lastState = state;
            }

            if (state === 'half') {
                log('✅ 成功切换到 eye-half 状态，开始执行自动逻辑...');
                return true;
            }

            const eyeBtn = document.querySelector('#party button img[src*="eye-"]')?.closest('button');
            if (eyeBtn) {
                log('🔄 尝试点击眼睛按钮切换状态...');
                simulateClick(eyeBtn, 300);
                await delay(stateDelay);
            } else {
                log('⚠️ 找不到眼睛按钮，等待中...');
            }

            if (elapsed >= maxWaitTime) {
                log('🧨 超时仍未进入 eye-half 状态，触发刷新防止挂机异常...');
                smartReload('眼睛按钮状态异常，未能切换到 eye-half');
                return false;
            }

            await delay(checkIntervalMs);
        }
    }

    // ============================================================
    // 【板块：启动序列（等待游戏加载 → 启动主循环）】
    // ------------------------------------------------------------
    // ▍功能：脚本入口的启动编排。轮询等待游戏真正可用（钱包已连接、
    //   玩家 API 就绪），处理错误界面与加载超时的自动刷新；就绪后
    //   展开 Party 列表、切换 eye-half 显示模式，最后启动主自动化
    //   循环 runAutomation 并按 checkInterval 周期定时执行。
    // ▍触发时机：页面加载后由脚本入口调用一次。
    // ▍依赖：
    //   · 全局检测：checkGameLoaded() —— 返回 { success, error,
    //     details }，details 含 connectedAddress（钱包连接状态）与
    //     playerApiExists（玩家 API 是否就绪）；
    //   · DOM：#party_button button —— 展开 Party 列表的按钮（加载
    //     阶段亦兼作"加载按钮"顺手点击，加速进入游戏）；
    //   · localStorage：kami_reload_count —— 智能重载的连续错误刷新
    //     计数，决定下一次错误刷新是否顺带清 ECSCache 做全量重同步；
    //   · 全局工具：smartReload、simulateClick、delay、
    //     getRandomDelayMs、waitForEyeHalf、getEyeState、
    //     runAutomation、checkInterval、log。
    // ▍核心流程：1) 每 5 秒调用一次 checkGameLoaded；
    //   2) 检测到错误界面（如 Wallet Connector / Unknown error）→
    //      随机等 1~20 秒后 smartReload（随机化避免多账户同刻齐刷）；
    //   3) 加载成功 → 把 kami_reload_count 复位为 0 → 点击 Party
    //      按钮展开 Kami 列表（等 2 秒让列表渲染）→ waitForEyeHalf
    //      切显示模式 → 再等 3.5 秒 → 立即执行一次 runAutomation，
    //      并用 setInterval 按 checkInterval 周期化，启动完成；
    //   4) 超时（3 分钟 + 随机余量）仍未加载成功 → 打印检测详情后
    //      smartReload；
    //   5) 等待期间：每逢剩余秒数为 30 的倍数（或最后 10 秒）输出
    //      一次进度日志，避免刷屏。
    // ▍边界与保护：错误界面与超时两条路都走 smartReload（附带刷新
    //   原因），不会无限等待；waitForEyeHalf 失败时其内部已触发刷新，
    //   此处直接终止启动流程，避免双重刷新；localStorage 读写全部
    //   try/catch 包裹，异常环境（如隐私模式）不影响启动；复位
    //   kami_reload_count 是为了防止残留计数让下一次错误刷新直接清
    //   ECSCache（全量重同步会让启动明显变慢）。
    // ▍可调参数：maxWaitTime = 3 * 60 * 1000 + getRandomDelayMs(3)
    //   —— 加载等待上限；checkIntervalMs = 5000 —— 轮询间隔；错误
    //   界面刷新前随机延时 = Math.random()*19000 + 1000（即 1~20
    //   秒）；Party 按钮点击后固定等待 2000ms；启动主循环前固定等待
    //   3500ms；日志节流：剩余秒数 % 30 === 0 或 ≤ 10 秒时才输出。
    // ▍相关控制台命令：无（自动执行）。
    // ============================================================
    async function startSequenceAfterDelay() {
        const maxWaitTime = 3 * 60 * 1000 + getRandomDelayMs(3);  // 最多等3分钟
        const checkIntervalMs = 5000;  // 每5秒检测一次
        const startTime = Date.now();

        log(`🕒 等待游戏加载（最多等待 ${(maxWaitTime / 60000).toFixed(1)} 分钟）...`);

        while (true) {
            const elapsed = Date.now() - startTime;

            // 【核心检测】检查游戏状态
            const { success, error, details } = checkGameLoaded();

            // 1. 检测到错误界面（Wallet Connector / Unknown error）→ 快速刷新
            if (error) {
                const randomDelay = Math.floor(Math.random() * 19000) + 1000;  // 1-20秒随机
                log(`%c🚨 检测到错误界面: ${error}`, 'color: red; font-weight: bold; font-size: 14px;');
                log(`%c⏳ 将在 ${(randomDelay / 1000).toFixed(1)} 秒后刷新页面...`, 'color: orange;');
                await delay(randomDelay);
                smartReload(error);
                break;
            }

            // 2. 成功进入游戏
            if (success) {
                log(`%c✅ 游戏加载成功！(已连接钱包, API可用)`,
                    'color: green; font-weight: bold;');

                // 加载成功即复位错误刷新计数：
                // 否则残留的旧计数会让下一次错误刷新直接清 ECSCache（触发全量重同步，启动明显变慢）
                try {
                    if (parseInt(localStorage.getItem('kami_reload_count') || '0', 10) > 0) {
                        localStorage.setItem('kami_reload_count', '0');
                        log('🔁 [智能重载] 游戏加载成功，错误刷新计数已复位为 0');
                    }
                } catch (_) {}

                // 先点击 Party 按钮展开 Kami 列表
                const partyBtn = document.querySelector('#party_button button');
                if (partyBtn) {
                    log('📦 [启动] 点击 Party 按钮展开 Kami 列表...');
                    simulateClick(partyBtn, 500);
                    await delay(2000);  // 等待列表展开
                    log('✅ [启动] Party 按钮已点击，等待列表展开完成');
                } else {
                    log('⚠️ [启动] 未找到 Party 按钮（#party_button button），跳过点击');
                }

                // 尝试切换到 eye-half 模式
                const eyeBeforeState = getEyeState();
                log(`👁️ [启动] 当前眼睛状态: ${eyeBeforeState ?? '未找到'}，开始切换到 eye-half...`);
                const eyeOk = await waitForEyeHalf();
                if (eyeOk) {
                    log(`%c✅ [启动] 眼睛已切换到 eye-half，启动自动采集逻辑...`, 'color: green; font-weight: bold;');
                    await delay(3500);
                    await runAutomation();
                    setInterval(runAutomation, checkInterval);
                    // 🔻SYNC→内部版[1.1.22 退避复读] C2：启动退避复读调度器（15s 轻量、只做零 gas state 复读，全 try/catch 不影响主循环）
                    try {
                        if (!window.__stopBackoffSchedulerStarted) {
                            window.__stopBackoffSchedulerStarted = true;
                            setInterval(() => { _stopBackoffSchedulerTick(); }, STOP_BACKOFF_SCAN_INTERVAL_MS);
                            log(`⏳ [停采诊断/退避] 退避复读调度器已启动（每 ${STOP_BACKOFF_SCAN_INTERVAL_MS / 1000}s 扫描一次，仅零 gas 复读 state；表 ${STOP_BACKOFF_TABLE_MS.map(x => x / 1000 + 's').join('/')}）`);
                        }
                    } catch (_) {}
                    // 🔻SYNC[1.2.7 gas真值账本] C3：启动 gas 账本 reconciler（每 N 分钟只读 receipt 补 gas，零新增 tx，全 try/catch 不影响主循环）
                    try {
                        if (!window.__gasLedgerReconcilerStarted) {
                            window.__gasLedgerReconcilerStarted = true;
                            setInterval(() => { _gasLedgerReconcile(); }, GAS_LEDGER_RECONCILE_MS);
                            log(`⛽ [gas账本] reconciler 已启动（每 ${GAS_LEDGER_RECONCILE_MS / 60000} 分钟补一次 receipt gas，单轮≤${GAS_LEDGER_RECONCILE_BATCH} 条，零新增 tx；报告命令 showGasReport()）`);
                        }
                    } catch (_) {}
                    break;
                } else {
                    log('%c⚠️ [启动] waitForEyeHalf 失败，已触发刷新，终止当前启动流程。', 'color: red; font-weight: bold;');
                    break;
                }
            }

            // 3. 超时检测（3分钟还没进入游戏）
            if (elapsed >= maxWaitTime) {
                log(`%c🧨 超过 ${(maxWaitTime / 60000).toFixed(1)} 分钟仍未成功进入游戏，触发刷新...`,
                    'color: red; font-weight: bold;');
                log(`   检测详情: connectedAddress=${details.connectedAddress}, playerApiExists=${details.playerApiExists}`);
                smartReload('游戏加载超时');
                break;
            }

            // 4. 还没成功，继续等待
            const remainingSec = Math.ceil((maxWaitTime - elapsed) / 1000);
            if (remainingSec % 30 === 0 || remainingSec <= 10) {  // 每30秒或最后10秒输出日志
                log(`⏳ 游戏加载中，剩余 ${remainingSec} 秒... (钱包: ${details.connectedAddress ? '已连接' : '未连接'}, API: ${details.playerApiExists ? '可用' : '不可用'})`);
            }

            // 尝试点击加载按钮（如果存在）
            const loadBtn = document.querySelector('#party_button button');
            if (loadBtn) {
                log('📦 检测到加载按钮，点击...');
                simulateClick(loadBtn, 500);
            }

            await delay(checkIntervalMs);
        }
    }

    // ============================================================
    // 【板块：喂食低血量 RESTING kami（三阶段 + 批量熔断）】
    // ------------------------------------------------------------
    // ▍功能：
    //   扫描传入的 kami 卡片列表，找出处于 RESTING 状态且 HP 缺口 ≥50
    //   的 kami，按缺口大小智能匹配食物（金苹果/蜜露鳞/汉堡），分批发
    //   送喂食 TX；单批失败过多立即熔断。目标：让休息中的 kami 尽快回
    //   满血、缩短休息时间，同时不浪费任何一点食物恢复量。
    // ▍触发时机：
    //   由核心调度流程在喂食阶段调用，传入当前页面上的 kami 卡片 DOM
    //   列表（kamiList）。
    // ▍依赖：
    //   - DOM：卡片内 img[src*="/assets/kami_"] 状态图标（src 含
    //     resting / harvesting 判定状态）；该图标的下一个兄弟元素文本
    //     中的 "(xx%)" 为血量百分比。
    //   - window.kami_core_db：本地 kami 数据库（imgNumber → index /
    //     kamiId / maxhp 映射）。
    //   - window.network.network.connectedAddress.value_：当前钱包地址。
    //   - window.network.explorer.accounts.getByOperator(addr)：查询
    //     账户库存 inventories（三种食物余额）。
    //   - window.network.explorer.kamis.getByIndex(index, {harvest:true})：
    //     发 TX 前复核链上实时状态。
    //   - window.network.api.player.pet.item.use(kamiId, itemId)：喂食
    //     TX 的实际入口。
    //   - 模块级状态 __feedFailedKamis：Map<kamiId, {count, lastFailTime}>，
    //     喂食失败冷却记录（内存态，脚本重载即清空）。
    //   - TX 双锁：tryAcquireNormalLock / releaseNormalLock /
    //     hasEmergencyLock。
    //   - localStorage：本板块不直接读写。
    // ▍核心流程：
    //   1) 收集候选：遍历卡片读状态与血量，只保留 RESTING、血量可解析
    //      且缺口 ≥ MIN_GAP_BURGER(50HP) 的 kami；处于失败冷却期的跳过。
    //   2) 查询库存：一次拉取三种食物余额；候选为空或库存全 0 直接
    //      返回——此时不拿锁、不发任何 TX。
    //   3) 拿普通锁后按 BATCH_SIZE 分批喂食：每只先复核链上状态（非
    //      RESTING 跳过且不计失败）→ 按"缺口从大到小"匹配食物 → 发 TX
    //      等待上链 → 本地扣减库存计数；每批结束统计成败，失败达阈值
    //      熔断；finally 中必定释放锁。
    //   食物匹配规则（不浪费原则）：缺口≥150 且有金苹果 → 金苹果(+150)；
    //   否则缺口≥75 且有蜜露鳞 → 蜜露鳞(+75)；否则缺口≥50 且有汉堡 →
    //   汉堡(+50)；三者都不满足（如缺口 60HP 但只剩金苹果）宁可跳过也
    //   不浪费恢复量。缺口大优先用大食物，可减少喂食 TX 笔数。
    // ▍边界与保护：
    //   - 锁纪律：确认"有活干"（候选>0 且库存>0）后才申请普通锁，避免
    //     空转占锁挡住其他 TX 板块；finally 保证释放。
    //   - 紧急锁让路：每批开始前、每只喂食前都检查 hasEmergencyLock()，
    //     检测到立即中断整轮喂食，把 TX 通道让给紧急停采。
    //   - 失败冷却：同一 kami 失败次数达 FEED_MAX_FAILS 后，在
    //     FEED_FAIL_COOLDOWN_MS 内静默跳过（典型场景：kami 卡在
    //     STARVING 等链上异常状态时，避免反复发失败 TX 烧 gas）；
    //     冷却期满自动清除记录重新尝试；喂食成功也会清除记录。
    //   - 批内熔断：单批失败 ≥ FAIL_THRESHOLD 视为系统性问题（RPC 故
    //     障、余额异常等），立即停止后续所有批次，防止连环烧 gas。
    //   - 链上二次确认：DOM 状态可能滞后，发 TX 前用 explorer 复核，
    //     非 RESTING 直接跳过且不计入失败。
    //   - 无预检设计：食物喂食不做 estimateGas 预检——可用的预检路径
    //     走 system 合约（system.kami.use.item），与实际调用的封装层
    //     api.player.pet.item.use 函数签名不一致，encodeFunctionData
    //     必抛 UNEXPECTED_ARGUMENT，预检结果 100% 是误报。取舍：偶尔
    //     一笔失败 TX 浪费约 100-500K gas，远好于因误报永远跳过喂食。
    //   - 容错回退：tx 对象无 wait 方法时退化为固定 8 秒延时等待上链；
    //     单张卡片解析异常静默跳过，不影响其余候选。
    // ▍可调参数：
    //   - ITEM_CHEESEBURGER = 11302 — 汉堡的物品 index，恢复 +50 HP。
    //   - ITEM_HONEYDEW_SCALE = 11312 — 蜜露鳞的物品 index，恢复 +75 HP。
    //   - ITEM_GOLDEN_APPLE = 11313 — 金苹果的物品 index，恢复 +150 HP。
    //   - MIN_GAP_BURGER / MIN_GAP_HONEY / MIN_GAP_APPLE = 50 / 75 / 150
    //     — 使用对应食物所需的最小 HP 缺口，与食物恢复量一致；调小会
    //     浪费恢复量（溢出），调大则 kami 要掉更多血才吃得上、休息更久。
    //   - BATCH_SIZE = 3 — 每批喂食数量；调大整轮更快但熔断判定粒度
    //     变粗，调小更保守但整轮耗时更长。
    //   - FAIL_THRESHOLD = 2 — 单批熔断阈值；调小对偶发失败更敏感
    //     （可能误熔断），调大容忍更多连续失败（可能多烧 gas）。
    //   - FEED_MAX_FAILS / FEED_FAIL_COOLDOWN_MS（脚本配置区定义）—
    //     单只 kami 进入冷却的失败次数阈值 / 冷却时长。
    //   - 喂食间隔 1500ms、批次间隔 2000ms、无 wait 回退延时 8000ms —
    //     调小提速，但增大 nonce 冲突与 RPC 限流风险。
    // ▍相关控制台命令：本板块内未定义。
    // ============================================================
    async function autoFeedLowHpRestingKamis(kamiList) {
        const ITEM_CHEESEBURGER = 11302;    // +50 HP
        const ITEM_HONEYDEW_SCALE = 11312;  // +75 HP
        const ITEM_GOLDEN_APPLE = 11313;    // +150 HP
        const MIN_GAP_BURGER = 50;          // cheeseburger最小缺口
        const MIN_GAP_HONEY = 75;           // 蜜露鳞最小缺口
        const MIN_GAP_APPLE = 150;          // 金苹果最小缺口
        const BATCH_SIZE = 3;               // 每批喂食数量
        const FAIL_THRESHOLD = 2;           // 一批中失败≥2个就熔断

        // ========= 阶段1: 收集需要喂食的候选kami =========
        const feedCandidates = [];

        for (const kamiDiv of kamiList) {
            try {
                // 获取状态
                let stateText = 'UNKNOWN';
                const stateImg = kamiDiv.querySelector('img[src*="/assets/kami_"]');
                if (stateImg) {
                    if (stateImg.src.includes('resting')) stateText = 'RESTING';
                    else if (stateImg.src.includes('harvesting')) stateText = 'HARVESTING';
                }

                // 获取血量：从状态图标的下一个兄弟元素文本中解析 "(xx%)" 百分比
                let hpPercent = NaN;
                const hpDiv = stateImg?.nextElementSibling;
                if (hpDiv) {
                    const hpText = hpDiv.textContent?.trim() || '';
                    const match = hpText.match(/\((\d+)%\)/);
                    if (match) {
                        hpPercent = parseInt(match[1], 10);
                    }
                }

                // 用卡片图号在本地数据库反查 index/kamiId/maxhp，换算当前 HP 与缺口
                const imgNumber = getimgNumber(kamiDiv);
                const record = window.kami_core_db.find(k => k.imgNumber === imgNumber);
                const dbIndex = record?.index;
                const kamiId = record?.kamiId;
                const maxhp = record?.maxhp || 100;
                const currentHp = Math.floor((hpPercent / 100) * maxhp);
                const hpGap = maxhp - currentHp;

                // 基本条件：RESTING + 缺口≥50HP（最小食物cheeseburger恢复50HP）
                if (stateText !== 'RESTING' || isNaN(hpPercent) || hpGap < MIN_GAP_BURGER) continue;

                // 检查失败冷却：失败达 FEED_MAX_FAILS 次且未过冷却期的静默跳过；期满自动清除记录
                if (kamiId && __feedFailedKamis.has(kamiId)) {
                    const failInfo = __feedFailedKamis.get(kamiId);
                    const elapsed = Date.now() - failInfo.lastFailTime;

                    if (failInfo.count >= FEED_MAX_FAILS && elapsed < FEED_FAIL_COOLDOWN_MS) {
                        continue;  // 静默跳过冷却中的
                    }
                    if (elapsed >= FEED_FAIL_COOLDOWN_MS) {
                        __feedFailedKamis.delete(kamiId);
                    }
                }

                feedCandidates.push({ kamiDiv, dbIndex, kamiId, hpGap, imgNumber });
            } catch (e) {
                // 静默跳过解析错误
            }
        }

        if (feedCandidates.length === 0) {
            log(`✅ 喂食完成，无需喂食`);
            return;
        }

        // ========= 阶段2: 查询库存 =========
        const addr = window.network?.network?.connectedAddress?.value_;
        if (!addr) {
            log(`⚠️ [喂食] 无法获取钱包地址`);
            return;
        }

        let balBurger = 0, balHoney = 0, balApple = 0;
        try {
            const acc = window.network.explorer.accounts.getByOperator(addr);
            const inv = Array.isArray(acc?.inventories) ? acc.inventories : [];
            balBurger = Number((inv.find(it => Number(it?.item?.index) === ITEM_CHEESEBURGER)?.balance) || 0);
            balHoney = Number((inv.find(it => Number(it?.item?.index) === ITEM_HONEYDEW_SCALE)?.balance) || 0);
            balApple = Number((inv.find(it => Number(it?.item?.index) === ITEM_GOLDEN_APPLE)?.balance) || 0);
        } catch (e) {
            log(`⚠️ [喂食] 查询库存失败: ${e?.message || e}`);
            return;
        }

        const totalFood = balBurger + balHoney + balApple;
        if (totalFood <= 0) {
            log(`⚠️ [喂食] 库存不足：金苹果=${balApple}, 蜜露鳞=${balHoney}, 汉堡=${balBurger}`);
            return;
        }

        // 库存档位预筛：先算出当前库存能覆盖的最小缺口档位，过滤掉喂不了的候选，
        // 再决定要不要取锁——避免"有食物但档位全不匹配"时空转持锁
        // （曾致仅持金苹果的账户 30+ 候选逐只链上复查约 12 分钟，普通锁超时被强制释放）
        const minGapAvailable = balBurger > 0 ? MIN_GAP_BURGER : (balHoney > 0 ? MIN_GAP_HONEY : MIN_GAP_APPLE);
        const matchableCandidates = feedCandidates.filter(k => k.hpGap >= minGapAvailable);
        if (matchableCandidates.length === 0) {
            const maxGap = Math.max(...feedCandidates.map(k => k.hpGap));
            log(`ℹ️ [喂食] 候选${feedCandidates.length}个但库存档位不匹配（库存最小档位${minGapAvailable}HP > 候选最大缺口${maxGap}HP），本轮跳过不取锁；建议补低档位食物（汉堡/蜜露鳞）`);
            return;
        }

        // 锁纪律：确认有活干（候选>0 且库存>0 且档位可匹配）后才申请普通锁，避免空转占锁
        if (!tryAcquireNormalLock('feed', 'core')) {
            log(`[TX锁] ⏸️ 普通锁被占用，跳过本轮喂食`);
            return;
        }
        try {
        log(`🍔 [喂食] 候选${feedCandidates.length}个(档位可匹配${matchableCandidates.length})，库存: 金苹果${balApple} 蜜露鳞${balHoney} 汉堡${balBurger}`);

        // ========= 阶段3: 分批喂食 + 失败熔断 =========
        let totalSuccess = 0;
        let totalFail = 0;
        let batchNum = 0;

        for (let i = 0; i < matchableCandidates.length; i += BATCH_SIZE) {
            // 每批前检查紧急锁
            if (hasEmergencyLock()) {
                log(`[TX锁] ⏸️ 检测到紧急锁，中断喂食`);
                break;
            }
            batchNum++;
            const batch = matchableCandidates.slice(i, i + BATCH_SIZE);
            let batchSuccess = 0;
            let batchFail = 0;

            for (const kami of batch) {
                // 每个kami喂食前检查紧急锁
                if (hasEmergencyLock()) {
                    log(`[TX锁] ⏸️ 检测到紧急锁，中断喂食`);
                    break;
                }
                const { dbIndex, kamiId, hpGap } = kami;

                try {
                    // 先按缺口+本地库存余量选食物（此时零链上调用），根据缺口从大到小匹配，不浪费；
                    // 链上复查挪到食物匹配之后，避免为"注定喂不了"的候选浪费一次 getByIndex（约20秒）
                    let itemToUse = null;
                    let foodName = '';

                    if (hpGap >= MIN_GAP_APPLE && balApple > 0) {
                        itemToUse = ITEM_GOLDEN_APPLE;
                        foodName = '金苹果(+150)';
                    } else if (hpGap >= MIN_GAP_HONEY && balHoney > 0) {
                        itemToUse = ITEM_HONEYDEW_SCALE;
                        foodName = '蜜露鳞(+75)';
                    } else if (hpGap >= MIN_GAP_BURGER && balBurger > 0) {
                        itemToUse = ITEM_CHEESEBURGER;
                        foodName = '汉堡(+50)';
                    }

                    if (!itemToUse) {
                        // 缺口和库存不匹配，跳过（此时尚未发起链上调用）
                        log(`ℹ️ [喂食] #${dbIndex} 缺口${hpGap}HP，无匹配食物，跳过`);
                        continue;
                    }

                    // 食物匹配通过后，再发 TX 前复核链上实时状态（DOM 可能滞后），非 RESTING 跳过且不计失败
                    const kamiInfo = await window.network.explorer.kamis.getByIndex(dbIndex, { harvest: true });
                    const apiState = String(kamiInfo?.state || '').toUpperCase();

                    if (apiState !== 'RESTING') {
                        log(`ℹ️ [喂食] #${dbIndex} 状态=${apiState}，跳过`);
                        continue;  // 不计入失败
                    }

                    // 【v1.1.10 冷却公式预筛】同一次 getByIndex 已带 harvest.time.last，
                    // 零新增查询判断是否仍在180s操作冷却内；冷却中发tx必败，且会误触发
                    // 喂食熔断（FAIL_THRESHOLD），此处跳过且不计入失败，熔断只该记真失败
                    const cdRemain = _cooldownRemainSec(kamiInfo?.harvest?.time?.last);
                    if (cdRemain > 0) {
                        log(`⏳ [喂食] #${dbIndex} 冷却中(剩余${cdRemain}s)，跳过`);
                        continue;  // 不计入失败，不进 __feedFailedKamis
                    }

                    // 食物喂食不做 estimateGas 预检（有意设计）：
                    // 原因：可用的预检路径走 system 合约（system.kami.use.item.execute），
                    //       而实际喂食走封装层 api.player.pet.item.use，两者函数签名不一致
                    //       → 预检必抛 UNEXPECTED_ARGUMENT，结果 100% 是误报
                    // 依据：真实喂食 API 即 pet.item.use(kamiId, itemId)；
                    //       XP 药水喂食路径同样无预检，长期稳定可行
                    // 取舍：偶尔失败浪费 1 笔 ~100-500K gas，比"100% 误报导致永不喂食"好太多
                    log(`🍔 [喂食] #${dbIndex} 缺口${hpGap}HP → ${foodName}`);
                    const tx = await window.network.api.player.pet.item.use(kamiInfo.id, itemToUse);
                    _gasLedgerRecord('feed', [kamiInfo.id], tx);   // 🔻SYNC[1.2.7 gas真值账本] 记账 hook（日常喂食）

                    // 等待上链确认；tx 对象无 wait 方法时退化为固定 8 秒延时
                    if (typeof tx?.wait === 'function') {
                        await tx.wait();
                    } else {
                        await delay(8000);
                    }

                    log(`✅ [喂食/成功] #${dbIndex}`);
                    batchSuccess++;
                    totalSuccess++;

                    // 本地扣减库存计数，后续候选据此匹配食物（省去重复查链）
                    if (itemToUse === ITEM_GOLDEN_APPLE) balApple--;
                    else if (itemToUse === ITEM_HONEYDEW_SCALE) balHoney--;
                    else if (itemToUse === ITEM_CHEESEBURGER) balBurger--;

                    // 喂食成功，清除该 kami 的失败冷却记录
                    if (kamiId) __feedFailedKamis.delete(kamiId);

                } catch (feedErr) {
                    const errMsg = feedErr?.message || String(feedErr);
                    log(`❌ [喂食/失败] #${dbIndex}: ${errMsg.slice(0, 60)}`);
                    batchFail++;
                    totalFail++;

                    // 记录失败次数与时间，达 FEED_MAX_FAILS 次后进入冷却期
                    if (kamiId) {
                        const prev = __feedFailedKamis.get(kamiId) || { count: 0, lastFailTime: 0 };
                        __feedFailedKamis.set(kamiId, { count: prev.count + 1, lastFailTime: Date.now() });
                    }
                }

                await delay(1500);  // 相邻两笔喂食 TX 的间隔，防 nonce 冲突/限流
            }

            log(`📦 [喂食/批次${batchNum}] 成功${batchSuccess}/${batch.length}`);

            // 熔断检查：一批中≥2个失败，停止后续喂食
            if (batchFail >= FAIL_THRESHOLD) {
                log(`🛑 [喂食/熔断] 批次${batchNum}失败${batchFail}个(≥${FAIL_THRESHOLD})，疑似系统问题，停止喂食`);
                break;
            }

            // 批次间隔
            if (i + BATCH_SIZE < matchableCandidates.length) {
                await delay(2000);
            }
        }

        log(`✅ 喂食完成，成功${totalSuccess}个，失败${totalFail}个`);
        } finally {
            releaseNormalLock('feed', 'core');
        }
    }

    // ============================================================
    // 【板块：批量部署（预检 / 黑名单 / 二分拆包重试）】
    // ------------------------------------------------------------
    // ▍功能：
    //   把一组 RESTING 的 kami 通过一笔批量 TX（executeBatched）部署回
    //   指定采集点 tile——N 只合并为 1 笔 TX，摊薄固定 gas 开销。板块
    //   内含三层：_preCheckTx（estimateGas 预检，0 成本识别必败 TX）、
    //   _apiDeployOnce（单次批量部署 + 失败逐个排查）、deployWithBackoff
    //   （包队列调度：重试、二分拆包、黑名单过滤、超时链上核对）。
    // ▍触发时机：
    //   由上层部署调度逻辑调用——上层负责收集 RESTING 候选、凑批门槛
    //   判断、部署暂停窗口检查等；本板块专注"把给定的一批安全地部署
    //   上链并确认收敛"。_preCheckStop 供停采流程复用同一预检通道。
    // ▍依赖：
    //   - window.network.network.signer — estimateGas 预检所需签名者。
    //   - window.network.txQueue.systems["system.harvest.start"] /
    //     ["system.harvest.stop"] — 合约 system 对象：取 interface 编码
    //     calldata、取 target 作为预检目标地址。
    //   - window.network.api.player.pet.harvest.start(ids, tile) —
    //     批量部署 TX 的实际入口。
    //   - window.network.explorer.kamis.getByIndex — 链上状态核对。
    //   - window.kami_core_db — kamiId 反查 index，用于日志编号显示。
    //   - DOM：_isCardHarvestingByImg(imgNumber) — 按卡片图标判断该
    //     kami 是否已显示"采集中"。
    //   - 模块级状态：__kamiDeployFailCount（kamiId → 连续失败次数）、
    //     __blockedKamiIds（部署黑名单 Set）、__kamiBlockedTime（拉黑
    //     时间戳，用于超时自动解除）。三者均为内存态，脚本重载即清空。
    //   - 紧急锁：hasEmergencyLock / waitForEmergencyRelease。
    //   - DEPLOY_BLOCK_CONFIG（脚本配置区定义）：FAIL_THRESHOLD 连续
    //     失败拉黑阈值、AUTO_CLEAR_MS 黑名单自动解除时长。
    //   - UI_SETTLE_MS（脚本配置区定义）：TX 确认后等 UI 收敛的时长。
    //   - localStorage：本板块不直接读写。
    // ▍核心流程：
    //   1) _preCheckTx(type, params)：用 system.interface.
    //      encodeFunctionData('executeBatched', ...) 构造与真实 TX 一致
    //      的 calldata，再用 signer.estimateGas 模拟执行。成功返回
    //      {ok:true, gasEstimate}，revert 返回 {ok:false, reason}，全程
    //      不上链、不消耗 gas。deploy 编码参数为 [kamiIds, tile,
    //      0(taxerID), 0(taxAmt)]；stop 编码参数为 [harvestIds]。
    //   2) _apiDeployOnce(ids, tile)：整批预检 → 若失败则逐个预检定位
    //      坏 kami（失败者累计计数、达阈值拉黑），仅用通过者继续 →
    //      发 TX 前若紧急锁被占先等待（上限 300 秒）→ api.start 发 TX
    //      并 wait 确认 → 成功清空相关失败计数；失败按错误类型分类返回。
    //   3) deployWithBackoff(apiItems, tile, maxAttempts)：包队列调度。
    //      先静置 STATE_CHECK_DELAY_MS 再进循环：过滤黑名单与已在采集
    //      中的 → _apiDeployOnce → 成功后逐只链上复核，未收敛（仍非
    //      HARVESTING）的回队重试；失败时：超时走"查链上真实状态、只
    //      重试真正失败的"，非超时按 DOM 过滤后回队；同包连败 2 次且
    //      仍有多只时二分拆包。队列清空或尝试次数达 maxAttempts 后，
    //      返回仍未成功的 pending 列表交上层处理。
    // ▍边界与保护：
    //   - 预检防线：estimateGas 模拟失败即不发真实 TX，链上卡住的坏
    //     kami 以 0 gas 成本被识别并拉黑；signer 或 system.interface
    //     不可用时预检直接放行，不阻塞主流程。
    //   - 黑名单：连续失败 ≥ DEPLOY_BLOCK_CONFIG.FAIL_THRESHOLD 拉黑；
    //     过滤时发现拉黑已超 AUTO_CLEAR_MS 则自动解除并清零失败计数，
    //     给 kami 状态自愈后重新上岗的机会。
    //   - 紧急锁让路（三道检查）：deployWithBackoff 每轮循环前检查；
    //     _apiDeployOnce 发 TX 前若被占则等待释放（超 300 秒放弃）；
    //     TX 发送后立即再查一次，检测到紧急锁则跳过确认环节直接让路
    //     （TX 已广播，链上执行不受影响）。
    //   - gas 消耗判别：失败按 nonce 被拒（未消耗 gas）/ 超时（可能已
    //     消耗）/ CALL_EXCEPTION 及其他（已消耗）分类打日志，便于对账。
    //   - 防重复部署：超时后等 5 秒逐只查链上状态，已 HARVESTING 的不
    //     再重试，避免对已成功的 kami 重复发 TX 烧双倍 gas；过滤与回
    //     队阶段还用 _isCardHarvestingByImg 做 DOM 二次确认。
    //   - 二分拆包：同一包 failStreak ≥ 2 且仍有 >1 只时对半拆分回队，
    //     用二分法把"整包连坐失败"收敛为"隔离个别坏 kami"。
    //   - 保守回退：链上状态查询异常的 kami 一律按"未部署成功"处理、
    //     加入重试，宁可多试一次也不漏部署。
    //   - 上限保护：maxAttempts 限制整个队列的发 TX 总次数，防止无限
    //     重试烧 gas。
    // ▍可调参数：
    //   - STATE_CHECK_DELAY_MS = 5000 — 进入部署前的静置等待，让上一
    //     轮 TX 的 nonce/链上状态稳定；调小提速但增大 Nonce 冲突概率。
    //   - RETRY_DELAY_MS = 5000 — 每次失败后重试前的间隔；同上。
    //   - maxAttempts = 5（deployWithBackoff 形参默认值）— 队列最大发
    //     TX 尝试次数；调大更执着但极端情况下更烧 gas。
    //   - 二分拆包阈值 failStreak >= 2、超时后链上核对前延时 5000ms、
    //     Tx 无 wait 方法时的回退延时 15000ms — 函数内固定值。
    //   - UI_SETTLE_MS、DEPLOY_BLOCK_CONFIG.FAIL_THRESHOLD /
    //     AUTO_CLEAR_MS — 见脚本配置区。
    //   - 紧急锁等待上限 300000ms（300 秒）。
    // ▍相关控制台命令：本板块内未定义。
    // ============================================================

    // 通用交易预检函数：用 estimateGas 模拟执行整笔批量 TX，
    // revert 则不发真实交易，以 0 gas 成本拦截注定失败的部署/停采
    // type: 'deploy' | 'stop'
    async function _preCheckTx(type, params) {
        try {
            const signer = window.network?.network?.signer;
            if (!signer) {
                dlog('api', `[预检/${type}] signer不可用，跳过预检`);
                return { ok: true };
            }

            let system, callData;

            switch (type) {
                case 'deploy': {
                    system = window.network?.txQueue?.systems?.["system.harvest.start"];
                    if (!system?.interface) return { ok: true };
                    callData = system.interface.encodeFunctionData('executeBatched', [
                        params.kamiIds.map(id => BigInt(id)),
                        params.tile,
                        0,  // taxerID
                        0   // taxAmt
                    ]);
                    break;
                }
                case 'stop': {
                    system = window.network?.txQueue?.systems?.["system.harvest.stop"];
                    if (!system?.interface) return { ok: true };
                    callData = system.interface.encodeFunctionData('executeBatched', [
                        params.harvestIds.map(id => BigInt(id))
                    ]);
                    break;
                }
                // 注意：这里没有 'feed' case —— 食物喂食不走预检
                //（system.kami.use.item 的 ABI 与封装层 api.player.pet.item.use 不一致，
                //  encodeFunctionData 必抛 UNEXPECTED_ARGUMENT，预检 100% 误报，详见喂食板块说明）
                default:
                    dlog('api', `[预检] 未知类型: ${type}`);
                    return { ok: true };
            }

            const gasEstimate = await signer.estimateGas({
                to: system.target,
                data: callData
            });

            dlog('api', `[预检/${type}] 通过，预估gas: ${gasEstimate.toString()}`);
            return { ok: true, gasEstimate: gasEstimate.toString() };

        } catch (e) {
            const reason = e.code || e.reason || 'UNKNOWN';
            // 🔻SYNC→内部版[1.1.22 revert原因观测] C6：多字段提取更完整的 revert 原因串，供停采 estimateGas 裁决处打观测日志（判定逻辑不变，仍以 reason 为准）。
            //   依次尝试 e.reason / e.shortMessage / e.info?.error?.message / e.data / e.message，取首个非空截 120 字。
            let detail = '';
            try {
                detail = e.reason || e.shortMessage || (e.info && e.info.error && e.info.error.message) || e.data || e.message || '';
                detail = (typeof detail === 'string' ? detail : String(detail)).slice(0, 120);
            } catch (_) {}
            dlog('api', `[预检/${type}] 失败: ${reason}${detail ? ' | ' + detail : ''}`);
            return { ok: false, reason, detail };
        }
    }

    // 便捷封装
    async function _preCheckDeploy(kamiIds, tile) {
        return _preCheckTx('deploy', { kamiIds, tile });
    }

    async function _preCheckStop(harvestIds) {
        return _preCheckTx('stop', { harvestIds });
    }

    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
    // tx 无 wait() 方法时（部分 ethers 版本/包装层可能出现）轮询回执兜底：
    // 退避 3s→6s→12s→24s，累计不超过 capMs；拿到回执立即返回，拿不到返回 null
    // 交调用方按"已发送待确认"处理——绝不能因为拿不到回执就假设已经成功。
    async function _pollTransactionReceipt(signer, txHash, capMs) {
        const provider = signer?.provider;
        if (!provider?.getTransactionReceipt || !txHash) return null;
        const steps = [3000, 6000, 12000, 24000];
        let waited = 0;
        for (const step of steps) {
            if (waited >= capMs) break;
            try {
                const r = await provider.getTransactionReceipt(txHash);
                if (r) return r;
            } catch (_) { /* 查询异常继续退避重试，不中断轮询 */ }
            const thisWait = Math.min(step, capMs - waited);
            if (thisWait <= 0) break;
            await delay(thisWait);
            waited += thisWait;
        }
        try { return await provider.getTransactionReceipt(txHash); } catch (_) { return null; }
    }

    // 单次批量部署：整批预检 → 失败则逐个排查定位坏 kami → 发 TX 并等待确认
    // 返回 { ok, isCallException, isTimeout, deployedIds/attemptedIds }，供上层决定是否重试
    async function _apiDeployOnce(ids, tile, fmtListForLog) {
        const api = window.network?.api?.player?.pet?.harvest;
        if (!api?.start) throw new Error('api.start 不可用');
        log(`🧾 [批量部署/准备(API)] ${ids.length} 个 → ${fmtListForLog}`);
        dlog('api', '[DEPLOY ids]', ids, 'tile=', tile);

        // 先对整批做一次预检（一次 estimateGas 覆盖全批）
        let idsToUse = ids.slice();
        const preCheck = await _preCheckDeploy(ids, tile);

        if (!preCheck.ok) {
            log(`⚠️ [批量部署/批量预检失败] 原因: ${preCheck.reason}，开始逐个排查...`);

            // 批量预检失败时，逐个预检定位问题 kami（预检不上链，不消耗 gas）
            const okIds = [];
            const failIds = [];

            for (const id of ids) {
                const singleCheck = await _preCheckDeploy([id], tile);
                const record = window.kami_core_db?.find(k => k.kamiId === id);
                const idx = record?.index || '?';

                if (singleCheck.ok) {
                    okIds.push(id);
                    dlog('api', `[逐个预检] #${idx} ✅ 通过`);
                } else {
                    failIds.push(id);
                    log(`⚠️ [逐个预检] #${idx} ❌ 失败: ${singleCheck.reason}`);
                    // 只把失败的记录失败次数
                    const count = (__kamiDeployFailCount.get(id) || 0) + 1;
                    __kamiDeployFailCount.set(id, count);
                    if (count >= DEPLOY_BLOCK_CONFIG.FAIL_THRESHOLD) {
                        __blockedKamiIds.add(id);
                        __kamiBlockedTime.set(id, Date.now());
                        log(`🚫 [批量部署/预检] Kami #${idx} 连续失败${count}次，已加入黑名单（未消耗gas）`);
                    }
                }
            }

            log(`📊 [批量部署/排查结果] 通过: ${okIds.length}个, 失败: ${failIds.length}个`);

            if (okIds.length === 0) {
                log(`❌ [批量部署/全部预检失败] 跳过本批`);
                return { ok: false, isCallException: true, isPreCheckFail: true };
            }

            // 用通过预检的继续
            idsToUse = okIds;
            const okRecords = okIds.map(id => window.kami_core_db?.find(k => k.kamiId === id));
            const okFmt = okRecords.map(r => `#${r?.index || '?'}`).join(',');
            log(`✅ [批量部署/继续] 使用 ${okIds.length} 个通过预检的kami → ${okFmt}`);
        } else {
            log(`✅ [批量部署/预检通过] 预估gas: ${preCheck.gasEstimate || 'N/A'}`);
        }

        // 发 TX 前最后一道防线：如果紧急锁已被紧急停采抢占，先让路（最多等 300 秒）
        if (hasEmergencyLock()) {
            const released = await waitForEmergencyRelease('批量部署', 300000);
            if (!released) {
                log(`⚠️ [批量部署] 等待紧急锁释放超时，放弃本次部署`);
                return { ok: false, isCallException: false };
            }
        }

        try {
            const tx = await api.start(idsToUse, tile);
            if (!tx) {
                log(`⚠️ [批量部署/API返回空Tx]`);
                return { ok: false, isCallException: false };
            }
            _gasLedgerRecord('deploy', idsToUse, tx);   // 🔻SYNC[1.2.7 gas真值账本] 记账 hook（非侵入，仅此一行；tx 已非空，抓 hash 待补 gas）
            if (typeof tx.wait === 'function') {
                await tx.wait();
            } else {
                // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                // 0709 审计定案：v1.1.11 及更早在这里直接 delay(15000) 就当作
                // 已确认，往下无条件走 ok:true——tx 到底有没有成功执行完全未知，
                // 这是"部署假成功"的根因之一。改为轮询 provider.getTransactionReceipt
                // （退避 3s→6s→12s→24s，cap 60s）；拿到 status===1 才继续走成功
                // 分支，拿不到回执（或 provider 不可用）一律按"已发送待确认"处理，
                // 交上层走既有的 isTimeout 链上复核分支，绝不假设成功。
                log(`⚠️ [部署诊断] Tx无wait方法，改为轮询receipt确认(cap 60s)`);
                const signerForPoll = window.network?.network?.signer;
                const receipt = await _pollTransactionReceipt(signerForPoll, tx.hash, 60000);
                if (!receipt) {
                    log(`⚠️ [部署诊断] 60s内未拿到回执，按"已发送待确认"处理，交上层链上复核（不假设成功）`);
                    return { ok: false, isTimeout: true, attemptedIds: idsToUse };
                }
                if (receipt.status !== 1) {
                    log(`❌ [部署诊断] 轮询到回执但执行失败 status=${receipt.status} tx:${tx.hash ? String(tx.hash).slice(0,10)+'…' : 'N/A'}`);
                    return { ok: false, isCallException: true, attemptedIds: idsToUse };
                }
                log(`✅ [部署诊断] 轮询到回执确认成功 status=1 tx:${tx.hash ? String(tx.hash).slice(0,10)+'…' : 'N/A'}`);
            }
            const okRecords = idsToUse.map(id => window.kami_core_db?.find(k => k.kamiId === id));
            const okFmt = okRecords.map(r => `#${r?.index || '?'}`).join(',');
            log(`🚀 [批量部署/完成(API)] tx:${(tx?.hash ? String(tx.hash).slice(0,10)+'…' : 'N/A')} → ${okFmt} [消耗Gas]`);
            // 成功，清除这些kamiId的失败计数
            for (const id of idsToUse) {
                __kamiDeployFailCount.delete(id);
            }
            return { ok: true, isCallException: false, deployedIds: idsToUse };
        } catch (e) {
            const errMsg = e?.message || String(e);
            const isCallException = e?.code === 'CALL_EXCEPTION' || errMsg.includes('CALL_EXCEPTION') || errMsg.includes('revert');
            const isTimeout = errMsg.includes('timeout') || errMsg.includes('not mined');
            const isNonceError = errMsg.toLowerCase().includes('nonce') || errMsg.includes('sequence mismatch');

            // 按错误类型判断 gas 消耗：nonce 被拒未上链不花 gas；超时可能已上链；其余视为已消耗
            let gasHint = '[消耗Gas]';
            if (isNonceError) gasHint = '[未消耗Gas - Nonce被拒]';
            else if (isTimeout) gasHint = '[可能消耗Gas - 超时]';

            log(`❌ [批量部署/API失败] ${gasHint} ${errMsg.slice(0, 80)}`);

            // 如果是CALL_EXCEPTION，说明有kami卡住，记录失败
            if (isCallException) {
                log(`⚠️ [批量部署] 检测到CALL_EXCEPTION，可能有kami卡在链上`);
                for (const id of idsToUse) {
                    const count = (__kamiDeployFailCount.get(id) || 0) + 1;
                    __kamiDeployFailCount.set(id, count);
                    if (count >= DEPLOY_BLOCK_CONFIG.FAIL_THRESHOLD) {
                        __blockedKamiIds.add(id);
                        __kamiBlockedTime.set(id, Date.now());
                        const record = window.kami_core_db?.find(k => k.kamiId === id);
                        log(`🚫 [批量部署] Kami #${record?.index || '?'} 连续失败${count}次，已加入黑名单`);
                    }
                }
            }
            // 返回isTimeout标记，让上层查询链上状态再决定重试
            return { ok: false, isCallException, isTimeout, attemptedIds: idsToUse };
        }
    }

    // 包队列调度器：把待部署项组包发 TX，失败重试、连败二分拆包、黑名单过滤，
    // 直到队列清空或尝试次数用尽。
    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
    // 返回 { pending, succeeded }：pending 是最终仍未部署成功、交上层处理的项
    // （含被拉黑/冷却预筛跳过、从未真正尝试过的）；succeeded 是本次调用内已
    // 显式确认部署成功的项——上层应直接用 succeeded 判定成功，不要再用
    // "输入减 pending 的差集"反推（那样会把 pending 里漏收的项误算成功）。
    async function deployWithBackoff(apiItems, tile, maxAttempts = 5) {
        // 留足延时，避免 Nonce 冲突
        const STATE_CHECK_DELAY_MS = 5000;  // 进部署前静置，等上一轮 TX 的 nonce/链上状态稳定
        const RETRY_DELAY_MS = 5000;        // 每次失败后重试前的间隔
        await delay(STATE_CHECK_DELAY_MS);
        if (!apiItems?.length) return { pending: [], succeeded: [] };

        const queue = [{ items: apiItems.slice(), failStreak: 0 }];
        let attempts = 0;

        // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
        // 0709 审计定案：旧版没有显式的"成功"清单，上层靠 ready.filter(不在
        // pending里) 的差集反推 doneList——凡是被本函数在中途悄悄丢弃、既不在
        // succeeded也不在最终队列里的项，都会被那个差集误算成"成功"。已确认
        // 命中过（拉黑/DOM已在采集中/最终确认成功等）的 push 进 succeeded；
        // 被拉黑或冷却预筛跳过、本次调用内没有真正尝试过的 push 进
        // droppedPending（收尾并入 pending，绝不算成功）。
        const succeeded = [];
        const droppedPending = [];

        while (queue.length && attempts < maxAttempts) {
            // 每次循环检查紧急锁
            if (hasEmergencyLock()) {
                log(`[TX锁] ⏸️ 检测到紧急锁，中断deployWithBackoff`);
                break;
            }
            const node = queue.shift();
            const chunkItems = node.items;

            // 过滤：排除黑名单中的 kamiId；拉黑超过 AUTO_CLEAR_MS 的自动解除
            let live = chunkItems.filter(x => {
                if (!x.kamiId) return false;
                if (_isCardHarvestingByImg(x.imgNumber)) {
                    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                    // DOM 已显示采集中 = 确认部署成功（可能是本次调用更早的一批
                    // 已经成功、或者本来就在采），计入 succeeded，不再悄悄丢弃
                    succeeded.push(x);
                    return false;
                }
                // 检查是否blocked
                if (__blockedKamiIds.has(x.kamiId)) {
                    // 检查是否超时需要自动清除
                    const blockedAt = __kamiBlockedTime.get(x.kamiId);
                    if (blockedAt && (Date.now() - blockedAt) > DEPLOY_BLOCK_CONFIG.AUTO_CLEAR_MS) {
                        __blockedKamiIds.delete(x.kamiId);
                        __kamiBlockedTime.delete(x.kamiId);
                        __kamiDeployFailCount.delete(x.kamiId);
                        log(`⏰ [批量部署] Kami #${x.dbIndex} 已超时自动解除黑名单`);
                        return true;
                    }
                    log(`🚫 [批量部署] 跳过被blocked的 Kami #${x.dbIndex}`);
                    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                    // 被拉黑跳过：未曾真正尝试部署，绝不能算成功——并入
                    // droppedPending，收尾时合并进最终 pending 返回给上层
                    droppedPending.push(x);
                    return false;
                }
                return true;
            });
            if (live.length === 0) {
                log(`⭐️ [批量部署/跳过] 本包无可部署目标`);
                continue;
            }

            // 【v1.1.10 冷却公式预筛】部署预检走整批 estimateGas，没有现成的逐只链上
            // 读数；本批经 chunkRandom 已限定 ≤10 只（在≤20的补读阈值内），补读一次
            // getByIndex({harvest:true}) 换 remain，提前挑掉仍在180s操作冷却内的候选，
            // 避免整批 estimateGas 失败触发二分拆包（tx必败但仍误伤同批健康kami）
            if (live.length > 0 && live.length <= 20) {
                const deployReady = [];
                const deployCooling = [];
                for (const x of live) {
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(x.dbIndex, { harvest: true });
                        const remain = _cooldownRemainSec(res?.harvest?.time?.last);
                        if (remain > 0) {
                            deployCooling.push({ item: x, remain });
                        } else {
                            deployReady.push(x);
                        }
                    } catch (_) {
                        deployReady.push(x); // 读失败按无冷却处理，回落旧行为
                    }
                }
                if (deployCooling.length > 0) {
                    const fmtCooling = deployCooling.map(c => `#${c.item.dbIndex}(剩${c.remain}s)`).join(', ');
                    log(`⏳ [批量部署/冷却预筛] ${deployCooling.length} 个冷却中，本批不发（tx必败省gas）: ${fmtCooling}`);
                    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                    // 冷却预筛跳过：未曾真正尝试部署，绝不能算成功——并入 droppedPending
                    droppedPending.push(...deployCooling.map(c => c.item));
                }
                live = deployReady;
            }
            if (live.length === 0) {
                log(`⭐️ [批量部署/跳过] 冷却预筛后本包无可部署目标`);
                continue;
            }

            const ids = live.map(x => x.kamiId);
            const fmt = _fmtStartList(live);

            attempts++;
            const result = await _apiDeployOnce(ids, tile, fmt);

            // TX 发送后立即再查紧急锁：若紧急停采已到来，跳过确认环节让路（TX 已广播，不受影响）
            if (hasEmergencyLock()) {
                log(`[TX锁] ⚡ 部署Tx已发送，检测到紧急锁，跳过确认让路紧急停采`);
                break;
            }

            if (result.ok) {
                log(`✅ [批量部署/API链上确认成功] 共 ${ids.length} 个 → ${fmt}`);
                // 等前端 UI 收敛后再逐只复核链上状态
                await delay(UI_SETTLE_MS);
                const stillNotHarvesting = [];
                for (const x of live) {
                    try {
                        const res = await window.network.explorer.kamis.getByIndex(x.dbIndex, { harvest: true });
                        const state = (res?.state || '').toUpperCase();
                        if (state !== 'HARVESTING') {
                            if (!_isCardHarvestingByImg(x.imgNumber)) {
                                stillNotHarvesting.push(x);
                            }
                        }
                    } catch (err) {
                        console.warn(`⚠️ [检查状态失败] Kami ${x.dbIndex}:`, err);
                        stillNotHarvesting.push(x);
                    }
                }

                // 🔻SYNC→内部版[1.2.4 部署防重发门禁] D3：25s 索引复核假失败源头掐断。
                // ★语义辨析（务必读懂再复制到别处）：本分支只在【本批 result.ok（executeBatched 原子批 status===1）之后】运行。
                //   system.harvest.start 无 executeBatchedAllowFailure（探针 undefined）→维持原子批，status===1 指向已发送子集(deployedIds)部署成功；★B1修后：D3计成功已收窄到 deployedIds ∩ estimateGas revert，不再用整个 live；
                //   此处对"UI_SETTLE 后 getByIndex 仍报非 HARVESTING"的逐只再跑一次部署 estimateGas：
                //   genuine revert（CALL_EXCEPTION / execution reverted，且必须排除网络错）= 链上无法再次部署 = 已部署（索引器滞后谎报未起采）。
                //   ★双重证据（I3）：唯有【status===1 原子批】+【estimateGas revert】两重都指向已部署才计成功；单一 revert 绝不在别处当"已部署"用——
                //     停采场景 revert 有已停/冷却/卡链/网络毛刺四成因（见2524），此处能反推"已部署"仅因本上下文有 status===1 背书，禁止跨上下文复制该结论。
                //   ★冷却边界（0712用户补充）：若某 kami 在这 25s 窗内恰被紧急停采，start 会因【操作冷却】而非【已部署】revert → 本处也计"部署成功"。
                //     这记账是对的：该 kami 本批确实成功部署过（status===1），随后被紧急停采停下、进入冷却，链上历经"已部署→已停采"两态；计成功不回队正确，
                //     绝不能因它此刻非 HARVESTING 就回队重发（会撞冷却 revert 白烧 gas）。
                //   只信方向：ok===true=真没部署→照旧回队；网络错/预检异常=读不到结果→保守回队（下轮主循环 estimateGas 门禁 8027 兜底，不烧 gas）。
                // 🔻SYNC→内部版[1.2.4 部署防重发门禁] B1修(grok审)：D3计成功必须 ∩ result.deployedIds（本次真正上过链的子集）。
                //   _apiDeployOnce 整批预检可能剔掉几只只发子集，result.ok 只覆盖已发送的；一只从没被发送(预检就fail)的 kami
                //   若在此又 revert（非"已部署"原因，如 tile满/其他合约条件）会被误计成功→漏部署。故双重证据的第一重(status=1)
                //   必须精确到 deployedIds，不能用整个 live。不在 deployedIds 的 → 落幸存者回队（DOM兜底 D1 三层门禁保 gas 不烧）。
                const _deployedSet = new Set(result.deployedIds || []);
                const _d3GasConfirmed = [];
                if (stillNotHarvesting.length > 0) {
                    const _d3Survivors = [];
                    for (const x of stillNotHarvesting) {
                        // B1：仅对"本批确实发送并 status=1"的 kami 才允许用 revert 反推已部署
                        if (!_deployedSet.has(x.kamiId)) { _d3Survivors.push(x); continue; }
                        let _d3chk = null;
                        try { _d3chk = await _preCheckDeploy([x.kamiId], tile); } catch (_) { _d3chk = null; }
                        // genuine revert 判定：复用本文件既有 CALL_EXCEPTION/revert 检测口径（见 _apiDeployOnce catch 8122）。网络错(NETWORK/TIMEOUT/SERVER)不算 revert→落幸存者回队。
                        const _d3IsRevert = !!(_d3chk && _d3chk.ok === false &&
                            (_d3chk.reason === 'CALL_EXCEPTION' ||
                             /call_exception|revert/i.test(String(_d3chk.reason || '') + ' ' + String(_d3chk.detail || ''))));
                        if (_d3IsRevert) _d3GasConfirmed.push(x);
                        else _d3Survivors.push(x);   // ok===true(真没部署) / 网络错 / 预检异常 → 保守回队
                    }
                    if (_d3GasConfirmed.length > 0) {
                        for (const x of _d3GasConfirmed) __kamiDeployFailCount.delete(x.kamiId);   // 清失败计数（同 8117 成功路径）
                        succeeded.push(..._d3GasConfirmed);
                        log(`✅ [批量部署/D3复核纠偏] ${_d3GasConfirmed.length}只 estimateGas确认已部署(索引滞后/已部署后被停采)，计成功不回队: ${_fmtStartList(_d3GasConfirmed)}`);
                    }
                    // 用 estimateGas 幸存者（真没部署/读不到结果）替换，下面只对这些回队（const 数组：原地清空后回填）
                    stillNotHarvesting.length = 0;
                    for (const x of _d3Survivors) stillNotHarvesting.push(x);
                }

                if (stillNotHarvesting.length > 0) {
                    const fmtStill = _fmtStartList(stillNotHarvesting);
                    node.failStreak = (node.failStreak || 0) + 1;
                    log(`⚠️ [批量部署/UI未收敛] 仍未起采 ${stillNotHarvesting.length}/${live.length} → ${fmtStill}`);

                    // 同包连败 2 次且仍有多只：二分拆包回队，隔离可能的坏 kami
                    if (node.failStreak >= 2 && stillNotHarvesting.length > 1) {
                        const mid = Math.floor(stillNotHarvesting.length / 2);
                        queue.push({ items: stillNotHarvesting.slice(0, mid), failStreak: 0 });
                        queue.push({ items: stillNotHarvesting.slice(mid),     failStreak: 0 });
                        log(`🪓 [二分拆包] ${stillNotHarvesting.length} → ${stillNotHarvesting.slice(0, mid).length} + ${stillNotHarvesting.slice(mid).length}`);
                    } else {
                        queue.push({ items: stillNotHarvesting, failStreak: node.failStreak });
                        log(`🔁 [重试排队] 回队 ${stillNotHarvesting.length} 个`);
                    }
                } else {
                    log(`🎉 [批量部署/最终确认成功] 共 ${ids.length} 个 → ${fmt}`);
                    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                    // 唯一的"最终确认成功"分支：显式累加进 succeeded，供上层直接使用
                    // 🔻SYNC→内部版[1.2.4 部署防重发门禁] D3：可能已把部分 live 作为 estimateGas 确认 push 进 succeeded，此处过滤避免重复计入
                    const _d3Counted = new Set(_d3GasConfirmed.map(k => k.kamiId));
                    succeeded.push(...live.filter(k => !_d3Counted.has(k.kamiId)));
                }
            } else {
                // 超时时查询链上状态，避免重复部署已成功的kami
                if (result.isTimeout && result.attemptedIds?.length) {
                    log(`⏱️ [批量部署/超时] 等待5秒后查询链上状态...`);
                    await delay(5000);

                    const retryBase = [];
                    const confirmedNow = [];  // 🔻SYNC→内部版[1.1.12] DOM/链上双路确认已部署成功的，累加进 succeeded
                    for (const x of live) {
                        // 先检查DOM
                        if (_isCardHarvestingByImg(x.imgNumber)) {
                            log(`   ✅ #${x.dbIndex} DOM已显示采集中，跳过重试`);
                            confirmedNow.push(x);
                            continue;
                        }
                        // 再查链上状态
                        try {
                            const res = await window.network.explorer.kamis.getByIndex(x.dbIndex, { harvest: true });
                            const state = (res?.state || '').toUpperCase();
                            if (state === 'HARVESTING') {
                                log(`   ✅ #${x.dbIndex} 链上已是HARVESTING，跳过重试`);
                                confirmedNow.push(x);
                                continue;
                            }
                            retryBase.push(x);
                            log(`   ⏳ #${x.dbIndex} 链上状态${state}，需要重试`);
                        } catch (err) {
                            // 查询失败，保守加入重试
                            retryBase.push(x);
                            log(`   ⚠️ #${x.dbIndex} 查询失败，保守重试`);
                        }
                    }
                    succeeded.push(...confirmedNow);

                    if (retryBase.length === 0) {
                        log(`⭐️ [超时但成功] 所有kami已部署成功，无需重试`);
                        continue;
                    }
                    log(`📋 [超时重试筛选] 原${live.length}个 → 真正需重试${retryBase.length}个`);
                    node.failStreak = (node.failStreak || 0) + 1;
                    if (node.failStreak >= 2 && retryBase.length > 1) {
                        const mid = Math.floor(retryBase.length / 2);
                        queue.push({ items: retryBase.slice(0, mid), failStreak: 0 });
                        queue.push({ items: retryBase.slice(mid),     failStreak: 0 });
                        log(`🪓 [二分拆包] ${retryBase.length} → ${retryBase.slice(0, mid).length} + ${retryBase.slice(mid).length}`);
                    } else {
                        queue.push({ items: retryBase, failStreak: node.failStreak });
                        log(`🔁 [重试排队] 回队 ${retryBase.length} 个（failStreak=${node.failStreak}）`);
                    }
                } else {
                    // 非超时失败（revert / nonce 被拒等）：按 DOM 过滤掉已在采集中的，其余回队重试
                    const retryBase = live.filter(x => !_isCardHarvestingByImg(x.imgNumber));
                    // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                    // DOM 已显示采集中的那部分（live 减 retryBase）确认成功，累加进 succeeded
                    const confirmedByDom = live.filter(x => _isCardHarvestingByImg(x.imgNumber));
                    if (confirmedByDom.length > 0) succeeded.push(...confirmedByDom);
                    if (retryBase.length === 0) {
                        log(`⭐️ [重试放弃] 本包已无可部署目标；不再回队`);
                        continue;
                    }
                    node.failStreak = (node.failStreak || 0) + 1;
                    if (node.failStreak >= 2 && retryBase.length > 1) {
                        const mid = Math.floor(retryBase.length / 2);
                        queue.push({ items: retryBase.slice(0, mid), failStreak: 0 });
                        queue.push({ items: retryBase.slice(mid),     failStreak: 0 });
                        log(`🪓 [二分拆包] ${retryBase.length} → ${retryBase.slice(0, mid).length} + ${retryBase.slice(mid).length}`);
                    } else {
                        queue.push({ items: retryBase, failStreak: node.failStreak });
                        log(`🔁 [重试排队] 回队 ${retryBase.length} 个（failStreak=${node.failStreak}）`);
                    }
                }
                await delay(RETRY_DELAY_MS);
            }
        }

        // 收尾：收集队列中所有仍未显示"采集中"的项，作为未完成列表返回给上层；
        // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
        // droppedPending（被拉黑/冷却预筛跳过、从未真正尝试过的）并入 pending；
        // 队列里到收尾时 DOM 已经显示采集中的（例如轮询期间恰好确认），归入 succeeded
        // 而不是静默丢弃——因为上层现在直接用 succeeded 判定成功，不再靠差集反推。
        const pending = [...droppedPending];
        for (const node of queue) {
            for (const x of node.items) {
                if (!_isCardHarvestingByImg(x.imgNumber)) {
                    pending.push(x);
                } else {
                    succeeded.push(x);
                }
            }
        }
        return { pending, succeeded };
    }

    // ============================================================
    // 【板块：runAutomation 核心自动化主循环】
    // ------------------------------------------------------------
    // ▍功能：
    //   整个脚本的心脏。每个检测周期执行一次，完成"扫描 → 决策 → 执行"
    //   的完整闭环：读取 Party 面板中每只 kami 的状态与 HP，据此执行
    //   普通停采、紧急停采升级、饿死救援喂食、批量部署、低血喂食、
    //   批量复活等全部自动化动作。
    // ▍触发时机：
    //   由脚本的检测周期定时器反复调用；页面加载完成后的首轮也走同一入口。
    // ▍依赖：
    //   - DOM：div#party 下的 kami 卡片列表（具体选择器见各板块说明）
    //   - window.kami_core_db：本地 kami 数据库（LT 清算线 / kamiId /
    //     harvestId / index / state 等字段，由 syncKamiDb() 维护）
    //   - window.network.explorer：游戏内置只读 API
    //     （kamis.getByIndex / accounts.getByOperator）
    //   - window.__kamiMode / window.__killerDetected：运行模式与杀手告警
    //     （由配套的辅助脚本 / 轻量杀手监控脚本维护）
    //   - TX 双锁：紧急锁 hasEmergencyLock() + 普通锁 window.__txNormalLock，
    //     防止多模块并发发 TX 造成 nonce 冲突
    //   - localStorage：kami_last_known_count（历史规模峰值，DOM 预检用）
    // ▍核心流程：
    //   1) checkKamiList：确认 kami 卡片已渲染，连续失败则刷新页面自救
    //   2) DOM 预检：不完整率 + 规模异常双重检测，必要时等待/重开面板
    //   3) 遍历卡片：解析状态（HARVESTING/RESTING/STARVING/DEAD）与 HP
    //      - DEAD → 只收集，循环结束后统一批量复活
    //      - HARVESTING/STARVING → 按停采线判定是否进停采池
    //      - RESTING → 按 HP 分层（≥98% 强 / ≥95% 暖）进部署池
    //   4) 停采分流：有 harvestId 的走 API 批量，其余走 DOM 点击兜底
    //   5) 停采候选过多 → 硬触发紧急停采接管（疑似批量攻击）
    //   6) 锁协调：先确认本轮确实有活干，再等紧急锁/抢普通锁
    //   7) 锁内执行：省 gas 凑批决策 → 饿死救援喂食 → API/DOM 批量停采
    //      → 批量部署（杀手排除 / 主地块校验 / 转移暂停 / 凑批闸门）
    //   8) 锁外收尾：低血 RESTING 喂食（函数内部按需自行拿锁）→ 批量复活
    // ▍边界与保护：
    //   - 紧急锁优先：任何阶段检测到紧急锁立即让路（中断批次/跳过本轮）
    //   - 普通锁"等待而非放弃"：拿不到先等最多 60 秒，避免丢弃整轮扫描结果
    //   - alreadyActed/recordAction 冷却机制：同一 kami 同一动作防重复执行
    //   - 每只 kami 的解析独立 try/catch，单只异常不影响整轮
    //   - window.__kamiOperationInProgress：停采执行期间置位，防强制刷新打断
    // ▍设计哲学：
    //   减少 TX 次数 + 省 gas + 让 kami 采集得更久。所有"凑批 / 跳过本轮"
    //   的决策都是在 gas 曲线甜区内争取最大采集时长，而非无脑堆批。
    // ▍相关控制台命令：
    //   syncKamiDb() — 重建/补全本地 kami 数据库
    //   resumeDeploy() — 立即解除转移部署暂停窗口
    // ============================================================
    async function runAutomation() {
        // 健康心跳（v1.1.5 起）：主循环平时可能整轮静默（无候选时不打日志），
        // 写时间戳供辅助脚本的健康看板区分"没活干"与"卡死"
        (window.__kamiHealthBeats = window.__kamiHealthBeats || {})['主循环'] = Date.now();
        try { if (window.__evalFrontendFrozen) window.__evalFrontendFrozen(600000); } catch (e) {}   // [②v1.1.25] 每轮刷新前端冻结传感器（纯日志 + 维护 window.__frontendFrozen）
        // ============================================================
        // 【板块：Kami 列表就绪检测（checkKamiList）】
        // ------------------------------------------------------------
        // ▍功能：确认 Party 面板中的 kami 卡片列表已经渲染，未渲染则定时
        //   重查；连续多次仍查不到判定页面卡死，刷新页面自救。
        // ▍触发时机：runAutomation 每轮开始时先执行。
        // ▍依赖：
        //   - DOM 选择器 'div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div'
        //     —— Party 面板中单只 kami 卡片的容器节点（游戏 UI 改版需同步更新）
        //   - smartReload(reason)：带防抖的页面刷新（避免陷入无限刷新循环）
        //   - printAccountAndRooms()：检测成功后打印账户与地块信息
        // ▍核心流程：1) 查询卡片列表 2) 为空则计数并定时重查 3) 连续
        //   maxRetries 次为空 → smartReload 刷新页面 4) 非空 → 打印账户信息
        // ▍边界与保护：重试间隔叠加随机抖动，避免与其他定时任务同拍。
        // ▍可调参数：
        //   maxRetries = 10 — 连续空结果多少次后刷新页面；调小恢复更快但
        //     网络慢时可能误刷，调大容忍更久但卡死恢复更慢
        //   retryIntervalMs = 10 秒 + 随机抖动 — 相邻两次检测的间隔
        // ============================================================
        let retryCount = 0;
        const maxRetries = 10;
        const retryIntervalMs = 10 * 1000 + getRandomDelayMs(10 / 60);
        let kamiList = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');

        async function checkKamiList() {
            kamiList = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
            if (kamiList.length === 0) {
                retryCount++;
                log(`🚨 第 ${retryCount} 次检测：未发现任何 Kami，${retryIntervalMs / 1000} 秒后再次检测...`);

                if (retryCount < maxRetries) {
                    setTimeout(checkKamiList, retryIntervalMs);
                } else {
                    log('%c⚠️ 连续 10 次未检测到 Kami，刷新页面防止卡顿。', 'color: red; font-weight: bold;');
                    smartReload('检测不到 Kami 列表');
                }
            } else {
                log(`✅ 检测到 ${kamiList.length} 个 Kami，正在监测血量百分比...`);
                await printAccountAndRooms();
            }
        }

        checkKamiList();

        // ============================================================
        // 【板块：DOM 预检 —— 不完整率 + 规模异常双重兜底】
        // ------------------------------------------------------------
        // ▍功能：正式扫描前先给 DOM 做体检。页面刚加载或渲染卡顿时，kami
        //   卡片可能缺字段（状态图标/HP/编号/主按钮），甚至整个列表只渲染
        //   出极少数卡片。不预检就直接扫会产生两类问题：
        //   ① 大批 kami 被早期过滤，停采/部署池全空，整轮白跑；
        //   ② 更危险的"规模严重不足"：列表只渲染出几只时，脚本会把渲染
        //      缺失误当成真实状态做出错误决策——因此宁可跳过本轮，也不在
        //      DOM 渲染不全时误操作。
        // ▍触发时机：checkKamiList 之后、正式遍历 kami 卡片之前。
        // ▍依赖：
        //   - __countIncompleteDom(list)：统计"不完整"卡片数。完整的定义是
        //     同时具备：状态图标 img[src*="/assets/kami_"]、其相邻兄弟节点
        //     文本中的 HP "(N%)"、getimgNumber 可取到卡片编号、
        //     harvest-/stop- 图标所在的主按钮
        //   - localStorage['kami_last_known_count']：历史 kami 规模峰值
        //   - DOM：#party_button button（Party 面板开关按钮）
        //   - getEyeState()/waitForEyeHalf()：卡片列表"眼睛"视图开关，
        //     处于 half 状态时才展示脚本所需的字段布局
        // ▍核心流程：
        //   1) 统计不完整卡片占比 __ratio
        //   2) 读历史峰值判断规模异常：峰值 ≥ 20 且当前数量 < 峰值 × 10%
        //   3) 占比超阈值或规模异常 → 进入修复重试：
        //      第 1 次：纯等待 8 秒（多数情况 DOM 只是慢半拍）
        //      第 2 次：重新点击 Party 按钮 + 把眼睛切回 half + 再等 5 秒
        //   4) 每次修复后重查 kamiList，两项检查都通过则提前跳出
        //   5) 扫描规模正常时更新历史峰值（只升不降，见下方峰值记录）
        // ▍边界与保护：
        //   - 最多重试 __maxDomRetry 次；修不好也继续向下执行，由遍历阶段
        //     的早期过滤兜底（不完整卡片只会被跳过，不会被误操作）
        //   - 规模异常判定要求历史峰值 ≥ 20：小账户天然数量少，不适用该规则
        // ▍可调参数：
        //   __DOM_INCOMPLETE_THRESHOLD = 0.5 — 不完整占比阈值；调小更敏感
        //     （轻微渲染慢也触发等待），调大可能带着残缺 DOM 硬扫
        //   __SCALE_ANOMALY_RATIO = 0.1 — 当前数量低于峰值的多少倍判定规模
        //     异常；调大更保守（更容易触发修复），调小容忍更大的渲染缺口
        //   __maxDomRetry = 2 — 修复尝试次数上限
        //   8000 / 2000 / 5000 ms — 各阶段等待时长，机器或网络慢可适当调大
        // ▍相关 localStorage key：
        //   kami_last_known_count — 历史规模峰值；基线失真时可手动执行
        //   localStorage.removeItem('kami_last_known_count') 重置
        // ============================================================
        function __countIncompleteDom(list) {
            let incomplete = 0;
            for (const kd of list) {
                const sImg = kd.querySelector('img[src*="/assets/kami_"]');
                const hText = sImg?.nextElementSibling?.textContent?.trim() || '';
                const iN = getimgNumber(kd);
                const mB = kd.querySelector('img[src*="/assets/harvest-"], img[src*="/assets/stop-"]')?.closest('button');
                if (!sImg || !hText.match(/\((\d+)%\)/) || !iN || !mB) incomplete++;
            }
            return incomplete;
        }

        const __DOM_INCOMPLETE_THRESHOLD = 0.5;
        const __KAMI_COUNT_KEY = 'kami_last_known_count';   // 历史 kami 规模峰值的 localStorage key
        const __SCALE_ANOMALY_RATIO = 0.1;                  // 当前规模 < 峰值 10% 判定规模异常
        const __maxDomRetry = 2;
        for (let __domRetry = 0; __domRetry < __maxDomRetry; __domRetry++) {
            const __incomplete = __countIncompleteDom(kamiList);
            const __ratio = kamiList.length > 0 ? __incomplete / kamiList.length : 0;
            const __historyMax = parseInt(localStorage.getItem(__KAMI_COUNT_KEY) || '0', 10);
            const __scaleAbnormal = __historyMax >= 20 && kamiList.length < __historyMax * __SCALE_ANOMALY_RATIO;
            if (__ratio <= __DOM_INCOMPLETE_THRESHOLD && !__scaleAbnormal) break;

            if (__scaleAbnormal) {
                log(`%c🚨 [DOM预检] 规模严重不足 ${kamiList.length}/${__historyMax}（历史峰值 10% 以下），第 ${__domRetry+1}/${__maxDomRetry} 次尝试修复...`,
                    'color: red; font-weight: bold;');
            } else {
                log(`%c⚠️ [DOM预检] 不完整 ${__incomplete}/${kamiList.length} (${(__ratio*100).toFixed(0)}%) 超阈值，第 ${__domRetry+1}/${__maxDomRetry} 次尝试修复...`,
                    'color: orange; font-weight: bold;');
            }

            if (__domRetry === 0) {
                log('⏳ [DOM预检] 等待 8 秒让 DOM 充分加载...');
                await delay(8000);
            } else {
                const __partyBtn = document.querySelector('#party_button button');
                if (__partyBtn) {
                    log('📦 [DOM预检] 重新点击 Party 按钮...');
                    simulateClick(__partyBtn, 500);
                    await delay(2000);
                }
                if (getEyeState() !== 'half') {
                    log('👁️ [DOM预检] 眼睛不在 half，重新切换...');
                    await waitForEyeHalf();
                }
                await delay(5000);
            }

            kamiList = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
            log(`🔄 [DOM预检] 重新查询 kamiList，共 ${kamiList.length} 条`);
        }

        // 记录历史峰值：>=20 且超过旧峰值才更新（只升不降），避免个别异常轮拉低基线
        const __curPeak = parseInt(localStorage.getItem(__KAMI_COUNT_KEY) || '0', 10);
        if (kamiList.length >= 20 && kamiList.length > __curPeak) {
            localStorage.setItem(__KAMI_COUNT_KEY, String(kamiList.length));
            log(`📏 [DOM预检] 更新历史峰值: ${__curPeak} → ${kamiList.length}`);
        }

        // ============================================================
        // 【板块：扫描池与统计器初始化】
        // ------------------------------------------------------------
        // ▍功能：为本轮扫描准备收集容器，遍历阶段只往里分拣，执行阶段统一消费。
        // ▍容器清单：
        //   __startStrong — 部署候选（RESTING 且 HP≥98%），部署主力
        //   __startWarm   — 部署候选（RESTING 且 95%≤HP<98%），不单独成行，
        //                   只在有 strong 候选带队时随队部署
        //   __stopPool    — 停采候选（HP 贴近/跌破停采线，或已饿死）
        //   __scanStats   — 扫描统计：停采/部署池意外为空时靠这些计数定位
        //                   原因；早期过滤按 4 个 DOM 字段细分，可直接看出
        //                   具体是哪个字段未渲染
        //   __normalLineStopCount — "普通模式停采线"独立计数器（见下方注释）
        //   __deadToRevive — 本轮发现的 DEAD kami，循环内只收集不处理，
        //                   循环后由 _reviveDeadBatch 一次锁内批量复活
        // ============================================================
        const __startStrong = [];
        const __startWarm  = [];
        const __stopPool   = [];
        // 扫描统计：定位 pool 为空的原因；早期过滤按 4 个 DOM 字段细分
        const __scanStats = {
            earlyFilter: 0,
            earlyFilter_emptyState: 0,
            earlyFilter_nanHP: 0,
            earlyFilter_emptyImg: 0,
            earlyFilter_emptyBtn: 0,
            restingTotal: 0, restingLTSkip: 0, restingHPLow: 0, restingAlreadyActed: 0
        };
        // "普通模式停采线"独立计数器（不论当前是否贪婪模式都计算）。
        // 贪婪模式 + 无杀手时实际停采线极低（5%），按当前模式扫描几乎不可能
        // 凑出大批停采候选，"候选过多 → 紧急停采"的保护会形同虚设；因此再以
        // "LT+3% 或默认 65%/76%"的普通线为基准独立扫一遍计数，超过硬触发
        // 阈值就紧急停采保命（详见下方"紧急停采硬触发"板块）
        let __normalLineStopCount = 0;

        // 本轮扫描发现的 DEAD 收集于此，循环后统一批量复活（见 _reviveDeadBatch）
        const __deadToRevive = [];

        // ============================================================
        // 【板块：Kami 卡片遍历 —— 状态解析与分池】
        // ------------------------------------------------------------
        // ▍功能：逐张解析 kami 卡片，识别状态与 HP，把每只 kami 分进
        //   停采池 / 部署池 / 复活收集队列，或按早期过滤跳过。
        // ▍触发时机：DOM 预检结束后，每轮一次全量遍历。
        // ▍依赖：
        //   - DOM：状态图标 img[src*="/assets/kami_"]（dead / harvesting /
        //     resting 三种），其相邻兄弟节点文本中的 "(N%)" 为 HP 百分比；
        //     属性图标行 *[direction="row"] img（第 1 张判定体质）；
        //     主按钮 = harvest-/stop- 图标所在的 button
        //   - window.kami_core_db：按 imgNumber 匹配本地档案
        //   - alreadyActed(imgNumber, action)：动作冷却，防重复
        // ▍核心流程：
        //   1) 状态解析：kami_dead → DEAD；kami_harvesting + HP=0% → STARVING
        //      （游戏 DOM 没有独立的饿死图标，只能用"采集图标 + HP 归零"推断）；
        //      kami_harvesting + HP>0 → HARVESTING；kami_resting → RESTING
        //   2) DEAD → 推入 __deadToRevive 后 continue（循环内绝不逐只复活）
        //   3) 早期过滤：状态/HP/编号/主按钮任一缺失 → 分类计数后跳过
        //   4) HARVESTING/STARVING → 停采决策（见下方板块）
        //   5) RESTING → 部署候选收集（见下方板块）
        // ▍边界与保护：
        //   - 每只 kami 独立 try/catch，单只解析异常不影响其余
        //   - DEAD 但本地库缺 kamiId 时不收集，日志提示先跑 syncKamiDb()
        //   - 状态判定 API 与 DOM 并联：本地库 state 与 DOM 图标任一显示
        //     采集中即按采集中处理（宁可多查一次，不可漏停）
        // ▍相关控制台命令：syncKamiDb() — 重建/补全本地 kami 数据库
        // ============================================================
        for (const kamiDiv of kamiList) {
            try {
                // 从卡片节点直接解析状态图标与 HP 文本
                const stateImg = kamiDiv.querySelector('img[src*="/assets/kami_"]');
                const hpDiv = stateImg?.nextElementSibling;

                // 状态判断：kami_harvesting + HP=0% → STARVING（DOM 无独立 starving 图标）
                const hpText = hpDiv?.textContent?.trim() || '';
                const hpMatch = hpText.match(/\((\d+)%\)/);
                const hpPercent = hpMatch ? parseInt(hpMatch[1], 10) : NaN;

                let stateText = '';
                if (stateImg?.src?.includes('kami_dead')) {
                    stateText = 'DEAD';
                } else if (stateImg?.src?.includes('kami_harvesting')) {
                    // STARVING = harvesting 图标 + HP 为 0%（饿死后仍显示采集图标）
                    stateText = (hpPercent === 0) ? 'STARVING' : 'HARVESTING';
                } else if (stateImg?.src?.includes('kami_resting')) {
                    stateText = 'RESTING';
                }
                // 属性图标行（第 1 张图标用于体质判定）
                const attrImgs = kamiDiv.querySelectorAll('*[direction="row"] img');

                // imgNumber：卡片图片编号，是 DOM 卡片与本地数据库之间的关联键
                const imgNumber = getimgNumber(kamiDiv);
                // 主按钮：卡片上 harvest-/stop- 图标所在的按钮，DOM 路操作的入口
                const mainButton = kamiDiv.querySelector('img[src*="/assets/harvest-"], img[src*="/assets/stop-"]')?.closest('button');
                // 按 imgNumber 匹配本地数据库档案（LT / kamiId / harvestId 等）
                const record = window.kami_core_db.find(k => k.imgNumber === imgNumber);

                // ------------------------------------------------------------
                // safePercent：个性化停采线 = 精确清算线 LT + LT_STOP_MARGIN(3%) 缓冲，封顶 MAX_THRESHOLD(80%)
                // 封顶是有意设计：目标是单周期采集时长最大化，清算线过高的 kami
                // 应先升级降低 LT，而不是放宽停采上限去迁就
                // ------------------------------------------------------------
                const safePercent = Number.isFinite(record?.LT)
                    ? Math.min(Math.floor(record.LT + LT_STOP_MARGIN), MAX_THRESHOLD)
                    : undefined;

                const dbIndex = record?.index;
                // 体质判定：属性图标第 1 张含 'normal' 即普通体质；图标缺失时回退本地库 body 字段
                const isNormal = attrImgs?.[0]?.getAttribute('src')?.includes('normal') ?? (record?.body === 'normal');

                // DEAD 只收集，循环后统一批量复活（_reviveDeadBatch）。如此设计的原因：
                //   ① 若逐只单独拿锁并等待确认，慢链下上一笔 TX 的等待会长时间占锁，
                //      后面的死 kami 逐只抢锁全被自己上一笔挡掉，表现为"日志提示复活
                //      但迟迟没动作"；收集后一次锁内批量处理则互不阻塞
                //   ② 不做地块检查：死亡 kami 在任何地块都可复活，且死亡状态下
                //      harvest.node 基本读不到，检查地块既无必要也不可靠
                if (stateText === 'DEAD') {
                    const kamiId = record?.kamiId || record?.id || null;
                    if (!kamiId) {
                        log(`❌ Kami ${dbIndex} 已死亡但缺 kamiId，无法复活（请跑 syncKamiDb() 补数据）`);
                    } else {
                        __deadToRevive.push({ dbIndex, imgNumber, kamiId });
                    }
                    continue;
                }

                // 早期过滤：关键字段（状态/HP/编号/主按钮）任一缺失说明卡片未渲染完整，跳过
                if (!stateText || isNaN(hpPercent) || !imgNumber || !mainButton) {
                    __scanStats.earlyFilter++;
                    // 分类统计具体是哪个字段未就绪，便于从日志直接定位渲染问题
                    if (!stateText)      __scanStats.earlyFilter_emptyState++;
                    if (isNaN(hpPercent)) __scanStats.earlyFilter_nanHP++;
                    if (!imgNumber)      __scanStats.earlyFilter_emptyImg++;
                    if (!mainButton)     __scanStats.earlyFilter_emptyBtn++;
                    continue;
                }

                // 此处不检查操作面板是否存在：面板只有点击卡片后才会渲染，扫描阶段检查必然失败导致误跳过

                dlog('parse', `[PARSE] #${dbIndex}/img${imgNumber} state=${stateText} hp=${hpPercent}% isNormal=${!!isNormal}`);

                // 本地库缓存的链上状态；与 DOM 状态并联使用（任一显示采集中都算）
                const stateAPI = record?.state?.toUpperCase?.() || '';

                // ============================================================
                // 【板块：停采决策 —— 阈值三选一 + 双线计数】
                // ------------------------------------------------------------
                // ▍功能：为每只采集中的 kami 计算停采线；HP 进入预警带或已
                //   饿死则推入停采池，同时按"普通模式停采线"独立计数。
                // ▍触发时机：API 或 DOM 任一判定该 kami 为采集中
                //   （HARVESTING / STARVING）。
                // ▍依赖：
                //   - window.__kamiMode：'greedy' = 贪婪模式（榨干 HP 换更长
                //     的采集时间，旧名 'starving'），其余值为普通模式
                //   - window.__killerDetected：杀手告警，由外部轻量杀手监控
                //     脚本维护；有杀手时即使贪婪模式也退回安全线
                //   - record.LT：本地库清算线（HP 低于该值可能被杀手清算）
                // ▍核心流程（阈值三选一）：
                //   1) 贪婪模式 + 无杀手 → GREEDY_THRESHOLD 极限线
                //      （thresholdSource='GREEDY_EXTREME'）
                //   2) 其余情况、本地库有 LT → safePercent = LT+3%（封顶 80%；
                //      source='NORMAL'，贪婪模式+有杀手时为 'GREEDY_SAFE'）
                //   3) 无 LT 数据 → 默认线：normal 体质用 DEFAULT_THRESHOLD_NORMAL，
                //      其他体质用 DEFAULT_THRESHOLD_OTHER（更高，无数据时按
                //      更保守的线处理）
                //   之后 delta = HP − 阈值；delta ≤ 1（进入 1% 预警带）或已饿死，
                //   且不在动作冷却期 → 推入 __stopPool
                // ▍边界与保护：
                //   - alreadyActed(imgNumber,'stopHarvest') 冷却防重复
                //   - isStarving 标记随候选带入停采池：饿死的必须先喂食才能停采
                //   - 双线计数：不论当前模式，再按普通线算一次 delta 并计入
                //     __normalLineStopCount，供"批量受攻击早期识别"使用
                // ▍可调参数（常量定义于脚本头部配置区）：
                //   GREEDY_THRESHOLD — 贪婪模式极限停采线（%），原 STARVING_THRESHOLD
                //   DEFAULT_THRESHOLD_NORMAL / DEFAULT_THRESHOLD_OTHER —
                //     无 LT 数据时 normal / 其他体质的默认停采线（%）
                //   MAX_THRESHOLD — 个性化停采线封顶（80%，有意不放开）
                //   delta ≤ 1 — 入池预警带宽度；调大更早停采（更安全但少采），
                //     调小更贴线（多采但被清算/饿死的风险升高）
                // ============================================================
                if (stateAPI === 'HARVESTING' || stateText === 'HARVESTING' || stateText === 'STARVING') {
                    // 本地库有 LT 清算线数据 → 可使用个性化停采线 safePercent
                    const isKillFromDb = typeof safePercent === 'number';

                    // 杀手状态由外部的轻量杀手监控脚本维护 window.__killerDetected

                    let threshold;
                    let thresholdSource = '';

                    if (window.__kamiMode === 'greedy' && !window.__killerDetected) {
                        // 贪婪模式 + 无杀手: 使用极限停采线
                        threshold = GREEDY_THRESHOLD;
                        thresholdSource = 'GREEDY_EXTREME';
                    } else {
                        // Normal模式 或 贪婪模式+有杀手: 使用安全停采线
                        if (isKillFromDb) {
                            // 有 LT 值：使用 safePercent（已含80%上限）
                            threshold = safePercent;
                        } else {
                            // 无 LT 值：使用新默认值（65%/76%）
                            threshold = isNormal ? DEFAULT_THRESHOLD_NORMAL : DEFAULT_THRESHOLD_OTHER;
                        }
                        thresholdSource = (window.__kamiMode === 'greedy' && window.__killerDetected)
                            ? 'GREEDY_SAFE'
                            : 'NORMAL';
                    }

                    // delta = 当前 HP − 停采线；≤ 1 表示已进入预警带、该停了
                    const delta = +(hpPercent - threshold).toFixed(2);

                    dlog('stop', `[STOP?] #${dbIndex}/img${imgNumber} hp=${hpPercent}% thr=${threshold}%(${thresholdSource}) Δ=${delta} include=${delta<=1} starving=${stateText==='STARVING'}`);

                    if ((delta <= 1 || stateText === 'STARVING') && !alreadyActed(imgNumber, 'stopHarvest')) {
                        const harvestId = record?.harvestId || null;
                        __stopPool.push({
                            imgNumber,
                            dbIndex,
                            harvestId,
                            delta,
                            isStarving: stateText === 'STARVING'  // 标记已饿死：停采前必须先喂食
                        });
                    }

                    // 不论当前模式，按"普通模式停采线"独立计数
                    // 用于"批量受攻击早期识别"（>25 即触发紧急停采，不受当前模式扫描结果限制）
                    const normalLineThr = (typeof safePercent === 'number')
                        ? safePercent
                        : (isNormal ? DEFAULT_THRESHOLD_NORMAL : DEFAULT_THRESHOLD_OTHER);
                    const normalLineDelta = +(hpPercent - normalLineThr).toFixed(2);
                    if ((normalLineDelta <= 1 || stateText === 'STARVING') && !alreadyActed(imgNumber, 'stopHarvest')) {
                        __normalLineStopCount++;
                    }
                }

                // ============================================================
                // 【板块：部署候选收集 —— RESTING 按 HP 分层入池】
                // ------------------------------------------------------------
                // ▍功能：把休息中且血量足够的 kami 收进部署候选池，按 HP 分
                //   strong（≥98%）/ warm（≥95%）两层。
                // ▍触发时机：API 或 DOM 任一判定该 kami 为 RESTING。
                // ▍依赖：
                //   - _fetchKamiAndHarvestIds(dbIndex)：本地库缺 kamiId 时按
                //     索引从链上补查，并把 kamiId/harvestId 回填进本地库
                //   - _isHash64：校验 harvestId 是否为合法 64 位哈希
                // ▍核心流程：
                //   1) alreadyActed('startHarvest') 冷却检查，处理过的计数跳过
                //   2) 缺 kamiId → 链上补查并回填
                //   3) LT > 95 的跳过部署：未升级的低级 kami 清算线接近 100%，
                //      部署后几乎立刻要停采，纯浪费 gas，应先升级再部署
                //   4) HP ≥ 98 → strong 池；HP ≥ 95 → warm 池；更低 → 计数跳过
                // ▍分层意义：strong 是部署主力；warm 不单独成行，只在有 strong
                //   带队时顺路同批部署——为血未回满的 kami 单独发 TX 不划算，
                //   部署后也会更早触线停采。
                // ▍可调参数：
                //   98 / 95 — strong/warm 的 HP 门槛；调低回岗更快，但单周期
                //     采集时长变短、TX 频率升高
                //   95 — LT 跳过线；调低会把更多高清算线 kami 排除在自动部署外
                // ============================================================
                if (stateAPI === 'RESTING' || stateText === 'RESTING') {
                    __scanStats.restingTotal++;
                    if (alreadyActed(imgNumber, 'startHarvest')) {
                        __scanStats.restingAlreadyActed++;
                    } else {
                        dlog('start', `[START?] #${dbIndex}/img${imgNumber} hp=${hpPercent}% -> ${hpPercent>=98?'STRONG':hpPercent>=95?'WARM':'skip'}`);

                        let kamiId = record?.kamiId || record?.id || null;
                        // 本地库缺 kamiId 时按索引从链上补查，并回填本地库（顺带回填 harvestId）
                        if (!kamiId && Number.isFinite(+dbIndex)) {
                            const { kamiId: kid, harvestId: hid } = await _fetchKamiAndHarvestIds(dbIndex);
                            if (kid) {
                                kamiId = kid;
                                record.kamiId = record.kamiId || kid;
                            }
                            if (hid && !_isHash64(record?.harvestId)) {
                                record.harvestId = hid;
                            }
                        }

                        // 清算线过高的Kami跳过部署（未升级的低等级Kami清算线接近100%，部署后立刻要停采）
                        const deployLT = record?.LT;
                        if (Number.isFinite(deployLT) && deployLT > 95) {
                            __scanStats.restingLTSkip++;
                            log(`⏭️ [部署跳过] #${dbIndex} 清算线过高(LT=${deployLT}%)，需先升级后再部署`);
                        } else if (hpPercent >= 98) {
                            __startStrong.push({ imgNumber, dbIndex, kamiId, hpPercent });
                        } else if (hpPercent >= 95) {
                            __startWarm.push({ imgNumber, dbIndex, kamiId, hpPercent });
                        } else {
                            __scanStats.restingHPLow++;
                        }
                    }
                }

            } catch (e) {
                log(`❌ Kami 处理异常：${e}`);
            }
        }

        // ============================================================
        // 【板块：停采候选分流与排序（API / DOM 两路）】
        // ------------------------------------------------------------
        // ▍功能：停采池按危险程度排序后，按"是否有合法 harvestId"分两路：
        //   - API 路：harvestId 为合法 64 位哈希 → 链上 API 批量停采
        //     （快、真批量、省 gas，主路径）
        //   - DOM 路：无合法 harvestId → 模拟点击卡片按钮逐只停采（慢，兜底）
        // ▍排序：delta 越小 = HP 离停采线越近/越低 = 越危险，排前面优先停
        //   （delta = 当前血量 − 停采阈值）。
        // ▍依赖：_isHash64()；_fmtStopList()（日志格式化）。
        // ============================================================
        const final = __stopPool
        .filter(x => x && typeof x.delta === 'number')
        .sort((a, b) => a.delta - b.delta);
        let apiList = final.filter(x => _isHash64(x.harvestId));
        let domList = final.filter(x => !_isHash64(x.harvestId));

        log(`📊 [stop 分流] API=${apiList.length} → ${_fmtStopList(apiList)}`);
        log(`📊 [stop 分流] DOM=${domList.length} → ${_fmtStopList(domList)}`);
        log(`📊 [部署池] kamiList=${kamiList.length}, strong(HP≥98)=${__startStrong.length}, warm(HP≥95)=${__startWarm.length}, stop=${__stopPool.length}`);
        log(`📊 [扫描统计] RESTING总数=${__scanStats.restingTotal}, 已处理跳过=${__scanStats.restingAlreadyActed}, HP<95%=${__scanStats.restingHPLow}, LT>95跳过=${__scanStats.restingLTSkip}, 早期过滤(DOM不完整)=${__scanStats.earlyFilter} [state空=${__scanStats.earlyFilter_emptyState}, HP NaN=${__scanStats.earlyFilter_nanHP}, img空=${__scanStats.earlyFilter_emptyImg}, 按钮空=${__scanStats.earlyFilter_emptyBtn}]`);

        dlog('stop', `final stop candidates=${final.length} (delta<=1)，api=${apiList.length} dom=${domList.length}`);

        // ============================================================
        // 【板块：紧急停采硬触发 —— 候选过多视为批量攻击】
        // ------------------------------------------------------------
        // ▍功能：单轮停采候选异常多，大概率是杀手在批量攻击，普通分批
        //   停采的节奏抗不住，立即升级为紧急停采流程接管。
        // ▍触发条件（两路任一满足，且当前没有紧急锁）：
        //   1) 当前模式停采线扫出的候选总数（API+DOM）≥ STOP_TRIGGER_ACT
        //   2) "普通模式停采线"独立计数 ≥ STOP_TRIGGER_ACT —— 第二路专治
        //      盲区：贪婪模式 + 无杀手时实际停采线仅 5%，按当前模式几乎
        //      扫不出大批候选，第一路等于失效；用普通线（LT+3% / 65%~80%）
        //      独立扫，就能在杀手批量攻击的早期识别险情
        //   候选 ∈ (HARD, ACT) 即 26~30：只打观察预警，不硬触发，交普通停采凑批
        // ▍核心流程：后台启动 emergencyStopHarvest({trimTo:HARD})（不 await，
        //   让它自己拿紧急锁运行；扫描后只停最危险的超额部分，修剪到 HARD 只继续采）；
        //   主流程继续向下，在"锁协调"处向紧急锁让路。
        // ▍边界与保护：
        //   - 已有紧急锁时不重复触发
        //   - 启动时的同步/异步异常都被捕获，只记日志，不中断主流程
        // ▍可调参数：
        //   STOP_TRIGGER_HARD = 25 — 修剪目标/预警线（>此值可观察预警；硬触发后修剪保留数）
        //   STOP_TRIGGER_ACT = HARD + TARGET_BATCH_MIN = 31 — 动手线（超额≥6 才硬触发）
        // ============================================================
        const STOP_TRIGGER_HARD = 25; // 修剪目标/预警线
        const STOP_TRIGGER_ACT = STOP_TRIGGER_HARD + 6; // =31 = HARD + TARGET_BATCH_MIN；超额≥6 才硬触发
        const __totalStopCount = apiList.length + domList.length;
        const __triggerByCurrent = __totalStopCount >= STOP_TRIGGER_ACT;
        const __triggerByNormalLine = __normalLineStopCount >= STOP_TRIGGER_ACT;
        if ((__triggerByCurrent || __triggerByNormalLine) && !hasEmergencyLock()) {
            const reason = __triggerByCurrent
                ? `当前模式停采线候选 ${__totalStopCount} ≥ ${STOP_TRIGGER_ACT}`
                : `普通模式停采线候选 ${__normalLineStopCount} ≥ ${STOP_TRIGGER_ACT}（当前模式仅扫到 ${__totalStopCount}，但按 LT+${LT_STOP_MARGIN}% 已危险）`;
            log(`%c🚨 [紧急触发] ${reason}，升级为紧急停采流程接管（修剪到 ${STOP_TRIGGER_HARD}）`,
                'color: red; font-weight: bold; font-size: 13px;');
            // 后台启动紧急停采（不 await），主流程下方会在最多300秒的等待中被紧急锁接管
            // 仅本硬触发路径带 trimTo；杀手监控等其它调用方不传参、无修剪
            try {
                emergencyStopHarvest({ trimTo: STOP_TRIGGER_HARD }).catch(e => log(`[紧急触发] 紧急停采异常: ${e?.message || e}`));
            } catch (e) {
                log(`[紧急触发] 紧急停采启动失败: ${e?.message || e}`);
            }
        } else if (!hasEmergencyLock()) {
            // 候选 > HARD 但 < ACT：观察预警（每轮本分支最多一条），交普通停采流程凑批
            const __warnN = (__totalStopCount > STOP_TRIGGER_HARD && __totalStopCount < STOP_TRIGGER_ACT)
                ? __totalStopCount
                : ((__normalLineStopCount > STOP_TRIGGER_HARD && __normalLineStopCount < STOP_TRIGGER_ACT)
                    ? __normalLineStopCount : 0);
            if (__warnN > 0) {
                log(`ℹ️ [批量预警] 停采线候选${__warnN}只(>${STOP_TRIGGER_HARD})但超额<6，暂不硬触发，交普通停采流程凑批`);
            }
        }

        // ============================================================
        // 【板块：TX 双锁协调 —— 等紧急锁 + 抢普通锁】
        // ------------------------------------------------------------
        // ▍功能：真正发 TX 前完成锁协调。双锁模型：
        //   - 紧急锁（hasEmergencyLock()）：紧急停采专用、最高优先级，
        //     所有普通操作见到它一律让路
        //   - 普通锁（window.__txNormalLock）：普通停采/部署/喂食/合成等
        //     模块共用，防止多模块同时发 TX 造成 nonce 冲突
        // ▍核心流程：
        //   1) 紧急锁存在且本轮有活（__hasWorkThisRound：停采或部署候选
        //      非空）→ 原地等待紧急锁释放，最多 300 秒、每 3 秒轮询。
        //      选择等待而非立即放弃：立即跳过会把本轮已扫描好的候选池
        //      整个丢掉，只能等下个检测周期重扫，白白错失可部署的 kami
        //   2) 等满 300 秒仍有紧急锁 → 放弃本轮停采/部署（喂食在后面自行判断）
        //   3) 无紧急锁且有活 → tryAcquireNormalLock('batch_stop_deploy','core')
        //      抢普通锁；被占用则等待释放（最多 60 秒、每 3 秒轮询），
        //      等待途中若冒出紧急锁立即放弃
        //   4) 进入执行段前校验锁的 operation/script 确实是自己持有，防止
        //      把其他模块刚抢到的锁误当成自己的
        // ▍锁纪律：先查后锁——确认本轮确实有活干才碰锁；空轮不拿锁，
        //   不白占资源挡住辅助脚本的合成等模块。
        // ▍可调参数：
        //   300000 ms — 等待紧急锁上限；60000 ms — 等待普通锁上限；
        //   3000 ms — 轮询间隔
        // ============================================================
        const __hasWorkThisRound = apiList.length > 0 || domList.length > 0 || __startStrong.length > 0 || __startWarm.length > 0;
        if (hasEmergencyLock() && __hasWorkThisRound) {
            log(`[TX锁] ⏸️ 紧急锁存在，等待紧急停采完成再继续本轮部署（最多300秒）...`);
            const emergencyWaitStart = Date.now();
            while (hasEmergencyLock() && Date.now() - emergencyWaitStart < 300000) {
                await delay(3000);
            }
            const __emergencyWaitSec = Math.round((Date.now() - emergencyWaitStart) / 1000);
            if (hasEmergencyLock()) {
                log(`[TX锁] ⏸️ 等待${__emergencyWaitSec}秒后紧急锁仍未释放（上限300秒），跳过本轮部署`);
            } else {
                log(`[TX锁] ✅ 紧急锁已释放（等待${__emergencyWaitSec}秒），继续执行本轮停采/部署`);
            }
        }

        // 检查紧急锁 - 有紧急停采在进行，跳过普通停采
        if (hasEmergencyLock()) {
            log(`[TX锁] ⏸️ 紧急锁存在，跳过本轮普通停采/部署，等紧急停采完成`);
            // 直接跳到喂食检查（喂食会自己检查锁）
        } else if (apiList.length > 0 || domList.length > 0 || __startStrong.length > 0 || __startWarm.length > 0) {
            // 尝试获取普通锁，获取不到则等待（最多60秒），避免跳过整轮部署
            if (!tryAcquireNormalLock('batch_stop_deploy', 'core')) {
                const lockHolder = window.__txNormalLock;
                log(`[TX锁] ⏸️ 普通锁被 [${lockHolder?.script}/${lockHolder?.operation}] 占用，等待释放（最多60秒）...`);
                const waitStart = Date.now();
                while (window.__txNormalLock && Date.now() - waitStart < 60000) {
                    if (hasEmergencyLock()) {
                        log(`[TX锁] ⏸️ 等待中出现紧急锁，跳过本轮停采/部署`);
                        break;
                    }
                    await delay(3000);
                }
                if (hasEmergencyLock()) {
                    // 紧急锁出现，跳过
                } else if (!tryAcquireNormalLock('batch_stop_deploy', 'core')) {
                    log(`[TX锁] ⏸️ 等待60秒后仍无法获取普通锁，跳过本轮停采/部署`);
                } else {
                    // 成功获取，进入下面的 try 块（通过标记）
                }
            }
            // 检查是否成功获取了锁
            if (window.__txNormalLock?.operation === 'batch_stop_deploy' && window.__txNormalLock?.script === 'core') {
                try {
        // 置位"操作进行中"标记：停采执行期间，强制刷新等自保逻辑看到
        // window.__kamiOperationInProgress 会避让，防止操作中途被刷新打断
        if (apiList.length > 0 || domList.length > 0) {
            window.__kamiOperationInProgress = true;
        }

        // ============================================================
        // 【板块：省 Gas 单停凑批决策】
        // ------------------------------------------------------------
        // ▍功能：本轮只有 1 只 kami 需要停采（且 DOM 路为空）时，判断是
        //   "跳过等凑批"还是"立刻单停"。为 1 只单独发一笔 TX 最不划算，
        //   安全余量足够时宁可等下轮凑够 ≥2 只再批量停。
        // ▍触发时机：apiList 恰好 1 个且 domList 为空。
        // ▍核心流程（四分支）：
        //   1) 已饿死（isStarving）→ 必须立刻处理（先喂食再停采），不凑批
        //   2) 贪婪模式 + 无杀手 → 停采线仅 GREEDY_THRESHOLD(5%)，HP 已在
        //      极限边缘，多等一轮就可能饿死，立刻停，不凑批
        //   3) 普通线 + delta > SINGLE_STOP_DANGER_DELTA → 安全余量充足，
        //      清空 apiList 跳过本轮，等下轮凑批省 gas
        //   4) 普通线 + delta ≤ SINGLE_STOP_DANGER_DELTA → HP 已低于停采线
        //      超过 3%，再等可能饿死（饿死后必须先喂食才能停，更贵更险），
        //      立刻单独停
        // ▍可调参数：
        //   SINGLE_STOP_DANGER_DELTA = -1 — 单停危险线（配 +3 薄垫收紧：再等
        //     一轮就可能踩到清算线）；调小（如 -2）更敢等但风险升高
        // ============================================================
        const SINGLE_STOP_DANGER_DELTA = -1;
        const isGreedyNoKiller = (window.__kamiMode === 'greedy' && !window.__killerDetected);
        if (apiList.length === 1 && domList.length === 0) {
            const solo = apiList[0];
            if (solo.isStarving) {
                // STARVING饿死的kami：必须立刻处理（先喂食再停），绝不凑批
                log(`🚨 [饿死/单停] kami #${solo.dbIndex} 已饿死(STARVING)，必须立刻喂食+停采，不凑批！`);
            } else if (isGreedyNoKiller) {
                // 贪婪模式：停采线仅5%，绝不能跳过
                log(`🚨 [贪婪模式/单停] kami #${solo.dbIndex} 停采线仅${GREEDY_THRESHOLD}%，HP已在极限边缘（Δ=${solo.delta.toFixed(2)}%），立刻停采，不凑批！`);
            } else if (solo.delta > SINGLE_STOP_DANGER_DELTA) {
                // 非贪婪模式 + 不太危险：跳过等凑批
                log(`⏸️ [省Gas/普通凑批] 仅1个kami #${solo.dbIndex} 需停采（Δ=${solo.delta.toFixed(2)}%），安全余量充足，跳过本轮等凑够≥2个再批量停采。`);
                apiList = [];
            } else {
                // 非贪婪模式 + 很危险：立刻停
                log(`🚨 [省Gas/紧急单停] kami #${solo.dbIndex} 的HP%已低于停采线超过${-SINGLE_STOP_DANGER_DELTA}%（Δ=${solo.delta.toFixed(2)}%），已逼近清算线，立刻单独停采！`);
            }
        }

        // ============================================================
        // 【板块：饿死救援 —— STARVING 先喂食再停采】
        // ------------------------------------------------------------
        // ▍功能：已饿死（STARVING，HP=0）的 kami 无法直接停采——游戏规则
        //   要求先喂食回血才能执行 Stop。本板块把停采池中的饿死 kami 先
        //   批量喂一轮，喂完直接进入下方停采流程，无需等待冷却。
        // ▍触发时机：停采池中存在带 isStarving 标记的候选。
        // ▍依赖：
        //   - window.network.explorer.kamis.getByIndex(idx, {harvest:true})：
        //     查询该 kami 采集所在地块（harvest.node.index）
        //   - __getMyRoomIndex() / __getRoomNameByIndex()：当前地块及其名称
        //   - _starvingFeedKamis(list, tag)：公共喂食函数，支持 11 种 HP
        //     恢复食物，按库存自动选择
        // ▍核心流程：
        //   1) 逐只查询饿死 kami 的采集地块
        //   2) 与当前地块不一致 → 无法隔地块喂食，收进"其他地块"列表并
        //      打醒目日志请用户手动处理
        //   3) 同地块（或查询失败按保守策略保留）→ 进入喂食队列
        //   4) _starvingFeedKamis 批量喂食，喂到的 kami 直接进入停采
        // ▍边界与保护：
        //   - 地块查询失败时保守保留：宁可多试一次喂食，不可漏救
        //   - 其他地块的饿死 kami 只提醒不操作，避免注定失败的无效 TX
        // ============================================================
        const starvingMyRoom = __getMyRoomIndex();
        const starvingAllPool = [...apiList, ...domList].filter(x => x.isStarving);
        const starvingOtherRoom = [];
        const starvingInPool = [];
        for (const x of starvingAllPool) {
            try {
                const res = await window.network.explorer.kamis.getByIndex(x.dbIndex, { harvest: true });
                const harvestRoom = res?.harvest?.node?.index ?? null;
                if (starvingMyRoom != null && harvestRoom != null && harvestRoom !== starvingMyRoom) {
                    starvingOtherRoom.push({ dbIndex: x.dbIndex, harvestRoom });
                } else {
                    starvingInPool.push(x);
                }
            } catch (_) {
                starvingInPool.push(x); // 查询失败保守保留
            }
        }
        if (starvingOtherRoom.length > 0) {
            const roomName = __getRoomNameByIndex(starvingMyRoom) || `#${starvingMyRoom}`;
            const otherList = starvingOtherRoom.map(x => `#${x.dbIndex}(地块${x.harvestRoom})`).join(', ');
            log(`%c⚠️ [饿死救援/地块不匹配] 当前地块: ${roomName}，${starvingOtherRoom.length} 个STARVING kami在其他地块，请手动处理: ${otherList}`,
                'color: orange; font-weight: bold;');
        }
        if (starvingInPool.length > 0) {
            log(`%c🍖 [普通停采/饿死救援] 发现 ${starvingInPool.length} 个STARVING的kami，需先喂食！`,
                'color: orange; font-weight: bold;');

            // 公共喂食函数：支持 11 种 HP 恢复食物，按库存自动选择
            const fedCount = await _starvingFeedKamis(starvingInPool, '普通/饿死救援');

            if (fedCount > 0) {
                log(`✅ [饿死救援] 已喂食 ${fedCount} 个kami，直接进入停采流程`);
            }
        }

        // ============================================================
        // 【板块：API 批量停采】
        // ------------------------------------------------------------
        // ▍功能：对有合法 harvestId 的候选走链上 API 批量停采，一笔 TX
        //   停多只，是停采的主路径。
        // ▍依赖：
        //   - chunkRandom(list, 6, 10)：把候选切成每批 6~10 只的随机批次，
        //     批量落在 gas 曲线甜区内，随机批量也避免链上行为呈固定指纹
        //   - stopWithBackoff(batch, 5)：带退避重试的批量停采（最多 5 次），
        //     返回仍失败、需要 DOM 兜底的条目
        // ▍核心流程：1) 切批 2) 每批发送前检查紧急锁，出现即中断剩余批次
        //   3) 失败条目累积进 needDomAll，交给下方 DOM 兜底
        // ▍可调参数：批量下限 6 / 上限 10 — 调大单笔更省 gas 但单批失败
        //   影响面更大；退避重试上限 5 次
        // ============================================================
        const apiBatches = chunkRandom(apiList, 6, 10);
        let needDomAll = [];

        dlog('stop', `apiBatches=${apiBatches.length} size=6-10 (random)`);

        for (let bi = 0; bi < apiBatches.length; bi++) {
            // 每批前检查紧急锁
            if (hasEmergencyLock()) {
                log(`[TX锁] ⏸️ 检测到紧急锁，中断普通停采`);
                break;
            }
            const batch = apiBatches[bi];
            log(`🛑 [批量停止/API - 第 ${bi+1}/${apiBatches.length} 笔] 计划 ${batch.length} 个 → ${_fmtStopList(batch)}`);
            const needDom = await stopWithBackoff(batch, 5);
            needDomAll = needDomAll.concat(needDom);
        }

        // ============================================================
        // 【板块：DOM 兜底停采】
        // ------------------------------------------------------------
        // ▍功能：API 路失败的候选 + 本就没有合法 harvestId 的候选，退化为
        //   模拟点击游戏界面完成停采。慢，但不依赖 harvestId。
        // ▍依赖：
        //   - kamis.getByIndex + _isCardHarvestingByImg：点击前双重确认状态
        //     仍是采集中（API 路可能其实已停成功，避免重复操作）
        //   - DOM 路径：卡片主按钮 → 弹出操作面板（主按钮 closest
        //     div[cursor="pointer"] 的父节点第 2 个子节点）→ 面板内文本为
        //     'Stop Harvest' 且可见（offsetParent 非空）的项
        //   - recordAction(imgNumber, 'stopHarvest')：记录动作进入冷却
        // ▍核心流程：
        //   1) 合并 domList 与 API 失败件，重新过滤 delta ≤ 1
        //   2) 按 imgNumber|dbIndex 去重（同一只可能同时出现在两路）
        //   3) chunkRandom(6, 10) 切批；每批前检查紧急锁，出现即中断
        //   4) 逐只：双重确认仍在采集 → 点主按钮开面板 → 1.2 秒后在面板中
        //      找 Stop Harvest 点击 → 记录动作
        // ▍边界与保护：
        //   - 找不到主按钮/面板只记日志跳过，不重试（下轮扫描会再次收集）
        //   - 每只之间 delay(800) 节流，避免点击过快、面板来不及渲染
        // ▍可调参数：setTimeout 1200 ms — 等面板渲染；delay 800 ms — 只间节流
        // ============================================================
        const domTargets = [...domList, ...needDomAll].filter(it => it.delta <= 1);
        const seen = new Set();
        const uniqDom = domTargets.filter(it => {
            const key = `${it.imgNumber}|${it.dbIndex}`;
            if (seen.has(key)) return false; seen.add(key); return true;
        });

        const domBatches = chunkRandom(uniqDom, 6, 10);
        dlog('stop', `domBatches=${domBatches.length} size=6-10 (random)`);

        for (let di = 0; di < domBatches.length; di++) {
            // 每批前检查紧急锁
            if (hasEmergencyLock()) {
                log(`[TX锁] ⏸️ 检测到紧急锁，中断DOM停采`);
                break;
            }
            const dBatch = domBatches[di];
            if (dBatch.length) {
                log(`🧰 [批量停止/DOM - 第 ${di+1}/${domBatches.length} 批] 计划 ${dBatch.length} 个 → ${_fmtStopList(dBatch)}`);
            }
            for (const it of dBatch) {
                try {
                    const res = await window.network.explorer.kamis.getByIndex(it.dbIndex, { harvest:true });
                    const stateAPI = String(res?.state || '').toUpperCase();
                    if (stateAPI !== 'HARVESTING' && !_isCardHarvestingByImg(it.imgNumber)) continue;

                    const card = Array.from(kamiList).find(div => getimgNumber(div) === String(it.imgNumber));
                    const mainButtonDom = card?.querySelector('img[src*="/assets/harvest-"], img[src*="/assets/stop-"]')?.closest('button');
                    if (!mainButtonDom) { log(`⚠️ DOM 停止找不到主按钮：img=${it.imgNumber}`); continue; }

                    simulateClick(mainButtonDom, 0);
                    setTimeout(() => {
                        const panelContainerDom = mainButtonDom?.closest('div[cursor="pointer"]')?.parentElement?.children?.[1];
                        if (!panelContainerDom) { log('⚠️ 找不到操作面板'); return; }
                        const stopHarvest = [...panelContainerDom.querySelectorAll('img[src*="stop"]')]
                        .map(img => img.closest('div'))
                        .find(d => d?.textContent.trim() === 'Stop Harvest' && d.offsetParent !== null);
                        if (stopHarvest) {
                            simulateClick(stopHarvest, 1000);
                            recordAction(it.imgNumber, 'stopHarvest');
                            log(`🛑 停采成功(DOM)：Kami ${it.dbIndex}（img:${it.imgNumber}） Δ=${typeof it.delta === 'number' ? it.delta.toFixed(2) : ''}`);
                        }
                    }, 1200);
                    await delay(800);
                } catch (eDom) {
                    log(`❌ DOM 停止异常：${eDom?.message || eDom}`);
                }
            }
        }

        // 停采流程结束，清除"操作进行中"标记，恢复允许强制刷新等自保逻辑
        window.__kamiOperationInProgress = false;

        // ============================================================
        // 【板块：批量部署（Start Harvest）】
        // ------------------------------------------------------------
        // ▍功能：把部署候选批量部署到当前地块采集。发 TX 前依次经过四道
        //   闸门：杀手排除 → 主地块校验 → 转移暂停窗口 → 凑批下限，
        //   全部通过才真正执行。
        // ▍触发时机：停采流程结束后，仍持有普通锁的同一执行段内。
        // ▍依赖：
        //   - window.MY_KILLER_KAMIS（Set<dbIndex>）：自家杀手 kami 集合，
        //     由外部轻量杀手监控脚本自动注册
        //   - accounts.getByOperator(addr)：账户全量 kami（主地块抽样与
        //     小账户判定用）
        //   - window.__deployPausedUntil：转移暂停窗口的截止时间戳
        //   - _getTileNumber()：当前地块 tile 编号（部署 TX 的必需参数）
        //   - deployWithBackoff(ready, tile, 5)：带退避重试的批量部署 API
        //   - MIN_DEPLOY_BATCH：部署凑批下限（脚本头部常量）
        // ▍核心流程：
        //   1) 组池（分层规则见下方注释）
        //   2) 杀手排除：MY_KILLER_KAMIS 中的从池中剔除——杀手的站位是
        //      战术选择，由用户手动部署到攻击位置，脚本不代劳
        //   3) 主地块校验：当前地块不是"采集中 kami 最多的地块"则暂停
        //      部署并周期提醒（详见下方板块）
        //   4) 转移暂停窗口：__deployPausedUntil 未到期则清空池——全量
        //      停采通常意味着要转移地块，转移期间不自动部署
        //   5) 小账户逃生通道：账户总 kami ≤ MIN_DEPLOY_BATCH 时下限降为 1
        //   6) 凑批闸门：候选 < 有效下限 → 跳过本轮等凑批（单只部署约
        //      1.35M gas，N=6 时约 0.80M/只，凑批可省约 40%）
        //   7) chunkRandom(有效下限, 10) 切批（含尾批合并），逐批 API 部署；
        //      失败件走 DOM 兜底：点卡片 → 操作面板 → 'Start Harvest' 或
        //      'Onyx Harvest' 按钮
        // ▍边界与保护：
        //   - 每批发送前检查紧急锁，出现即中断；DOM 兜底前再查一次
        //   - 发送前逐只确认未在采集且有 kamiId（ready 过滤）
        //   - 成功件 recordAction('startHarvest') 进冷却防重复
        //   - tile 获取失败 → 放弃本轮部署（缺参数无法发 TX）
        //   - 整段 try/catch 包裹，异常只记日志，不影响后续喂食/复活
        // ▍可调参数：
        //   MIN_DEPLOY_BATCH — 凑批下限；批量上限 10；退避重试 5 次
        // ▍相关控制台命令：resumeDeploy() — 立即解除转移暂停窗口恢复部署
        // ============================================================
        try {
            // 组池规则：strong(HP≥98)≥2 → strong+warm 全上；strong=1 且有 warm → 一带多；
            // 仅 1 只 strong → 单只候选（能否真部署由凑批闸门决定）；无 strong → 空池
            // （warm 不单独成行：为血未回满的 kami 单独发 TX 不划算，部署后也更早触线停采）
            let pool = [];
            if (__startStrong.length >= 2) {
                pool = [...__startStrong, ...__startWarm];
            } else if (__startStrong.length === 1 && __startWarm.length >= 1) {
                pool = [__startStrong[0], ...__startWarm];
            } else if (__startStrong.length === 1 && __startWarm.length === 0) {
                pool = [__startStrong[0]];
            } else {
                pool = [];
            }

            // 部署 pool 排除 MY_KILLER_KAMIS：杀手 kami 由用户手动部署到攻击位置
            // 联动：外部轻量杀手监控脚本会把自检发现的自家杀手 kami 自动注册进这个 Set
            const __killerSetForDeploy = window.MY_KILLER_KAMIS instanceof Set ? window.MY_KILLER_KAMIS : null;
            if (__killerSetForDeploy && __killerSetForDeploy.size > 0 && pool.length > 0) {
                const __skippedKillers = pool.filter(p => __killerSetForDeploy.has(Number(p.dbIndex)));
                if (__skippedKillers.length > 0) {
                    pool = pool.filter(p => !__killerSetForDeploy.has(Number(p.dbIndex)));
                    log(`%c🛡️ [部署] 跳过 ${__skippedKillers.length} 只杀手 kami: ${__skippedKillers.map(p => '#' + p.dbIndex).join(', ')}（不参与自动部署，由用户手动部署到攻击位置）`,
                        'color: orange;');
                }
            }

            // ============================================================
            // 【板块：主地块校验 —— 防止误部署到临时地块】
            // ------------------------------------------------------------
            // ▍功能：部署前确认当前所在地块就是"主地块"（采集中 kami 最多
            //   的地块）。用户临时跑图/办事时若照常部署，会把 kami 撒到
            //   错误地块；判定不匹配则清空部署池并周期提醒。
            // ▍依赖：账户全量 kami 列表 + kamis.getByIndex 查每只的
            //   harvest.node.index；__getMyRoomIndex() 取当前地块。
            // ▍核心流程：
            //   1) 采集中 kami 不足 5 只时跳过检查（样本太小易误判）
            //   2) 等距抽样最多 15 只，统计各地块出现次数，众数即主地块
            //   3) 第一次抽样与当前地块不匹配 → 用 offset 错开样本再抽一次
            //      做二次确认，排除偶然误判
            //   4) 两次都不匹配 → 确认暂停：清空 pool，注册每 3 分钟一次的
            //      提醒定时器（window.__deployPauseReminder）；检测到回到
            //      主地块时自动清除提醒，下个检测周期恢复部署
            // ▍边界与保护：
            //   - 实时抽样、不缓存：用户真的迁移主地块后，下一轮自动认新家
            //   - 校验自身出错时放行部署，不因查询故障卡死自动化
            //   - 注册新提醒前先清掉旧定时器，防止提醒重复堆积
            // ▍可调参数：
            //   5 — 启用校验的最少采集中数量；15 — 抽样上限（调大更准但
            //   查询更多）；3*60*1000 ms — 暂停提醒间隔
            // ============================================================
            if (pool.length > 0) {
                try {
                    const currentRoom = __getMyRoomIndex();
                    if (currentRoom != null) {
                        const addr = window.network.network.connectedAddress.value_;
                        const acctInfo = window.network.explorer.accounts.getByOperator(addr);
                        const harvestingAll = (Array.isArray(acctInfo?.kamis) ? acctInfo.kamis : [])
                            .filter(k => String(k.state||'').toUpperCase() === 'HARVESTING');

                        if (harvestingAll.length >= 5) {
                            // 抽样函数：从列表中抽 sampleSize 个，用 offset 偏移避免两次抽同一批
                            async function samplePrimaryRoom(list, sampleSize, offset = 0) {
                                const step = Math.max(1, Math.floor(list.length / sampleSize));
                                const roomCounts = {};
                                for (let si = 0; si < sampleSize && (si * step + offset) < list.length; si++) {
                                    const k = list[(si * step + offset) % list.length];
                                    try {
                                        const res = await window.network.explorer.kamis.getByIndex(k.index, { harvest: true });
                                        const ri = res?.harvest?.node?.index;
                                        if (ri != null) roomCounts[ri] = (roomCounts[ri] || 0) + 1;
                                    } catch (e) { /* 跳过 */ }
                                }
                                const top = Object.entries(roomCounts).sort((a, b) => b[1] - a[1])[0];
                                return top ? Number(top[0]) : null;
                            }

                            const sampleSize = Math.min(15, harvestingAll.length);

                            // 第一次抽样
                            const primaryRoom1 = await samplePrimaryRoom(harvestingAll, sampleSize, 0);

                            if (primaryRoom1 != null && primaryRoom1 !== currentRoom) {
                                // 不匹配，换一批再抽一次确认
                                dlog('start', `[主地块检查] 第1次抽样: 主地块=${primaryRoom1}, 当前=${currentRoom}, 不匹配，二次确认...`);
                                const primaryRoom2 = await samplePrimaryRoom(harvestingAll, sampleSize, Math.floor(sampleSize / 2));

                                if (primaryRoom2 != null && primaryRoom2 !== currentRoom) {
                                    // 两次都不匹配，确认跳过
                                    const primaryName = __getRoomNameByIndex(primaryRoom2) || `#${primaryRoom2}`;
                                    const currentName = __getRoomNameByIndex(currentRoom) || `#${currentRoom}`;
                                    const msg = `⏸️ [部署暂停] 主地块: ${primaryName}(#${primaryRoom2})，当前: ${currentName}(#${currentRoom})。回到主地块后自动恢复部署。`;
                                    log(`%c${msg}`, 'color: red; font-weight: bold; font-size: 14px;');

                                    // 每3分钟重复提醒，直到回到主地块或下次runAutomation
                                    if (window.__deployPauseReminder) clearInterval(window.__deployPauseReminder);
                                    window.__deployPauseReminder = setInterval(() => {
                                        const nowRoom = __getMyRoomIndex();
                                        if (nowRoom === primaryRoom2) {
                                            log(`%c✅ [部署恢复] 已回到主地块 ${primaryName}，下次检测周期将自动部署`,
                                                'color: green; font-weight: bold; font-size: 14px;');
                                            clearInterval(window.__deployPauseReminder);
                                            window.__deployPauseReminder = null;
                                        } else {
                                            const curName = __getRoomNameByIndex(nowRoom) || `#${nowRoom}`;
                                            log(`%c⏸️ [提醒] 自动部署仍暂停中。主地块: ${primaryName}(#${primaryRoom2})，当前: ${curName}(#${nowRoom})。回到主地块即可恢复。`,
                                                'color: red; font-weight: bold;');
                                        }
                                    }, 3 * 60 * 1000);

                                    pool = [];
                                }
                            }
                        }
                        // 采集中Kami不足5个时不检查，避免样本太小误判
                    }
                } catch (e) {
                    dlog('start', `主地块检查出错，继续部署: ${e?.message || e}`);
                }
            }

            // 转移暂停窗口：全量停采通常意味着用户要转移地块，__deployPausedUntil
            // 到期前不自动部署，避免刚停完又被部署回原地块（立即恢复可用 resumeDeploy()）
            const __deployPauseLeft = (window.__deployPausedUntil || 0) - Date.now();
            if (__deployPauseLeft > 0 && pool.length > 0) {
                log(`%c⏸️ [部署] 转移暂停窗口生效中，剩余 ${Math.ceil(__deployPauseLeft / 60000)} 分钟，本轮 ${pool.length} 只候选不部署（立即恢复 → resumeDeploy()）`,
                    'color: orange; font-weight: bold;');
                pool.length = 0;
            }
            if (pool.length === 0) {
                if (__startStrong.length === 0 && __startWarm.length === 0 && __deployPauseLeft <= 0) {
                    log(`ℹ️ [部署] 没有HP足够的RESTING Kami可以部署（需HP≥98%）`);
                }
                // pool被主地块检查清空时已有提示，这里不重复
            } else {
                // 小账户逃生通道：账户总 kami ≤ MIN_DEPLOY_BATCH 时凑批下限降为 1（按实际数量部署）
                // 否则小账户永远凑不齐一批，会陷入"反复跳过部署"的死循环
                let effectiveMin = MIN_DEPLOY_BATCH;
                let accKamiTotal = -1;
                try {
                    const _addr = window.network?.network?.connectedAddress?.value_;
                    const _acc = await window.network?.explorer?.accounts?.getByOperator(_addr);
                    accKamiTotal = Array.isArray(_acc?.kamis) ? _acc.kamis.length : -1;
                } catch (_) { /* 拿不到就按默认 MIN_DEPLOY_BATCH 走 */ }
                if (accKamiTotal >= 0 && accKamiTotal <= MIN_DEPLOY_BATCH) {
                    effectiveMin = 1;
                    log(`%cℹ️ [部署] 账户总 kami=${accKamiTotal} ≤ ${MIN_DEPLOY_BATCH}，小账户逃生通道生效：MIN_DEPLOY_BATCH 降为 1（按实际数量部署）`,
                        'color: #888;');
                }

                if (pool.length < effectiveMin) {
                    // 候选不足 effectiveMin 跳过本轮，等下一轮 runAutomation 凑批
                    // gas 曲线：单只部署约 1.35M gas，N=6 时约 0.80M/只（单只多花约 70%）
                    const fmtList = pool.map(x => `#${x.dbIndex}`).join(', ');
                    log(`%c⏭️ [部署/凑批] 候选仅 ${pool.length} 只 (${fmtList}) < ${effectiveMin}，跳过本轮等下一轮凑批省 gas`,
                        'color: cyan; font-weight: bold;');
                    log(`%c   单只部署 1.35M gas vs N=6 时 0.80M/只，凑批可省 ~40%`,
                        'color: cyan;');
                } else {
                    const currentName = __getRoomNameByIndex(__getMyRoomIndex()) || '未知';
                    log(`🚀 [部署] 准备部署 ${pool.length} 个Kami到 ${currentName}（HP≥98%: ${__startStrong.length}个, HP≥95%: ${__startWarm.length}个）`);

                    const tile = await _getTileNumber();
                    if (!Number.isFinite(tile)) {
                        log('❌ [部署] tile 获取失败，跳过本轮部署');
                    } else {
                        // 部署与停采采用同一套 chunkRandom(effectiveMin, 10) 随机切批策略
                        // 含尾批合并：避免最后一批 < effectiveMin 个的零碎尾批浪费 gas
                        // 小账户 effectiveMin=1 时退化为单只部署也 OK
                const batches = chunkRandom(pool, effectiveMin, 10);

                    dlog('start', `pool: strong=${__startStrong.length}, warm=${__startWarm.length}, total=${pool.length}`);
                    dlog('start', `start batches=${batches.length}, sizes=${batches.map(b=>b.length).join(',')} (chunkRandom ${effectiveMin}-10 + 尾批合并)`);

                    for (let bi = 0; bi < batches.length; bi++) {
                        // 每批前检查紧急锁
                        if (hasEmergencyLock()) {
                            log(`[TX锁] ⏸️ 检测到紧急锁，中断部署`);
                            break;
                        }
                        const batch = batches[bi];
                        // 发送前逐只确认：已在采集中或缺 kamiId 的从本批剔除
                        const ready = batch.filter(x => !_isCardHarvestingByImg(x.imgNumber) && x.kamiId);
                        if (ready.length === 0) continue;

                        log(`📦 [批量部署/第 ${bi+1}/${batches.length} 笔(API)] 计划 ${ready.length} 个 → ${_fmtStartList(ready)}`);

                        // still = 重试后仍未成功、需要走 DOM 兜底的条目
                        // 🔻SYNC→内部版[1.1.12 停采确认解耦+gas判级+estimateGas裁决]
                        // 0709 审计定案：旧版靠 ready.filter(不在still里) 的差集反推
                        // doneList——deployWithBackoff 内部凡是被拉黑/冷却预筛跳过而
                        // 悄悄丢弃（既不在 still 也没被判定成功）的项，会被这个差集误
                        // 算成"成功"（部署假成功的根因之一）。现在 deployWithBackoff
                        // 显式返回 succeeded（真正确认成功的）与 pending（含被丢弃的，
                        // 绝不算成功），上层直接用 succeeded，不再用差集反推。
                        const { pending: still, succeeded: doneList } = await deployWithBackoff(ready, tile, 5);
                        for (const it of doneList) {
                            recordAction(it.imgNumber, 'startHarvest');
                        }
                        // 同一笔 executeBatched 原子成功，整批一行汇总（逐只打印是冗余刷屏）
                        if (doneList.length) {
                            log(`✅ [批量部署/第 ${bi + 1} 笔(API)] 成功 ${doneList.length} 个：${doneList.map(it => `#${it.dbIndex}(img:${it.imgNumber})`).join(', ')}`);
                        }

                        // DOM 兜底（紧急锁存在时跳过，避免nonce冲突）
                        const seenStart = new Set();
                        const uniqDomStart = still.filter(it => {
                            const key = `${it.imgNumber}|${it.dbIndex}`;
                            if (seenStart.has(key)) return false; seenStart.add(key); return true;
                        });

                        if (uniqDomStart.length && hasEmergencyLock()) {
                            log(`[TX锁] ⏸️ 紧急锁存在，跳过DOM兜底部署（${uniqDomStart.length}个）`);
                        } else if (uniqDomStart.length) {
                            log(`🧰 [批量部署/第 ${bi+1} 笔(DOM)] 准备 ${uniqDomStart.length} 个 → ${_fmtStartList(uniqDomStart)}`);
                        }
                        for (const it of (hasEmergencyLock() ? [] : uniqDomStart)) {
                            try {
                                // 🔻SYNC→内部版[1.2.4 部署防重发门禁] D2：DOM 兜底遵守 API 黑名单。
                                //   deployWithBackoff 内部对 estimateGas 连败的 kami 拉黑（__blockedKamiIds，30min 自动解除见 8199-8208），
                                //   但被拉黑者经 droppedPending→pending→still 流回本兜底；旧码不查黑名单会逐只重发→revert 白烧 gas。
                                //   此处过滤即可（黑名单自愈，不会永久搁置：下轮 deployWithBackoff 预检超时会自动解除）。
                                if (__blockedKamiIds?.has?.(it.kamiId)) {
                                    log(`⏭️ [DOM兜底] #${it.dbIndex} 在API黑名单内(30min自动解除)，跳过点击省gas`);
                                    continue;
                                }
                                const res = await window.network.explorer.kamis.getByIndex(it.dbIndex, { harvest:true });
                                const stateAPI = String(res?.state || '').toUpperCase();
                                if (stateAPI === 'HARVESTING' || _isCardHarvestingByImg(it.imgNumber)) continue;
                                // 🔻SYNC→内部版[1.2.4 部署防重发门禁] D1v2：DOM 兜底部署【三层门禁】（冷却公式排第一，零RPC）。
                                // 【第一道·冷却公式预筛，零额外RPC】复用现成 _cooldownRemainSec()（180s 操作冷却，269只样本零错配，见2261-2273）。
                                //   time.last 顺手取自上面同一次 getByIndex 的 res.harvest.time.last，零额外查询。冷却中(remain>0)→部署 tx 必败，
                                //   连 estimateGas 都不用跑，直接 skip 省一次注定失败的 gas。time.last 读不到时 _cooldownRemainSec 返回0→自动落到第二道（保守）。
                                let _cdRemain = 0;
                                try { _cdRemain = _cooldownRemainSec(res?.harvest?.time?.last); } catch (_) { _cdRemain = 0; }
                                if (_cdRemain > 0) {
                                    log(`⏭️ [DOM兜底] #${it.dbIndex} 冷却中剩${_cdRemain}s,跳过(tx必败省gas)`);
                                    continue;
                                }
                                // 【第二道·estimateGas 门禁】冷却已过才跑。复用 _preCheckDeploy([id],tile)——即 _apiDeployOnce 8027/8037 用的同一预检入口
                                //   （内部 _preCheckTx('deploy') 走 signer.estimateGas，eth_call 模拟、零 gas、零新增 tx，见 I1）。单只调用：_preCheckDeploy([it.kamiId], tile)。
                                //   **只信 ok===true 方向**（同停采 C2 纪律 2529）：唯有 estimateGas 成功且返回 gasEstimate=链上确认"还能部署=尚未部署"才点击（第三道）。
                                //   因第一道已排除冷却，这里的 revert 归因已干净（基本=已部署）；ok===true但无gasEstimate(signer/system不可用=读不到结果) 或预检抛异常 → 保守 skip 不点击。
                                //   动机：DOM 兜底会把 API 层刚 estimateGas 实锤"已部署"的 kami 逐只重发白烧 gas（aaron 实测 18 笔 revert）。漏点一轮代价小——
                                //   该 kami 仍在 pending，下轮主循环 API 门禁(8027)重扫再试(I2)，绝不永久搁置；烧 gas 才是真损失（真钱路径宁严勿松）。
                                let _d1chk = null;
                                try { _d1chk = await _preCheckDeploy([it.kamiId], tile); } catch (_) { _d1chk = null; }
                                if (!(_d1chk && _d1chk.ok === true && _d1chk.gasEstimate)) {
                                    log(`⏭️ [DOM兜底] #${it.dbIndex} estimateGas未通过(冷却已排除⇒疑似已部署/读不到结果)，跳过省gas`);
                                    continue;
                                }
                                // 【第三道】estimateGas ok===true 且有 gasEstimate → 照原逻辑点击部署
                                const card = Array.from(kamiList).find(div => getimgNumber(div) === String(it.imgNumber));
                                const mainButtonDom = card?.querySelector('img[src*="/assets/harvest-"], img[src*="/assets/stop-"]')?.closest('button');
                                if (!mainButtonDom) { log(`⚠️ DOM 部署找不到主按钮：img=${it.imgNumber}`); continue; }

                                simulateClick(mainButtonDom, 100);
                                setTimeout(() => {
                                    const panelContainerDom = mainButtonDom?.closest('div[cursor="pointer"]')?.parentElement?.children?.[1];
                                    if (!panelContainerDom) { log('⚠️ 找不到操作面板'); return; }
                                    const startBtn = [...panelContainerDom.querySelectorAll('img[src*="harvest"], img[src*="start"], img[src*="onyx"]')]
                                    .map(img => img.closest('div'))
                                    .find(d => /Start Harvest|Onyx Harvest/i.test(d?.textContent) && d.offsetParent !== null);
                                    if (startBtn) {
                                        simulateClick(startBtn, 800);
                                        recordAction(it.imgNumber, 'startHarvest');
                                        log(`🚀 单个部署成功(DOM)：Kami ${it.dbIndex}（img:${it.imgNumber}）`);
                                    }
                                }, 1200);
                                await delay(800);
                            } catch (eDom) {
                                log(`❌ DOM 部署异常：${eDom?.message || eDom}`);
                            }
                        }
                    }
                }
                }
            }
        } catch (errBatchStart) {
            log(`❌ [批量开始] 失败：${errBatchStart?.message || errBatchStart}`);
        }
                } finally {
                    // 释放普通锁
                    releaseNormalLock('batch_stop_deploy', 'core');
                }
            }
        }  // end of else if block

        // ============================================================
        // 【板块：低血 RESTING 喂食调度】
        // ------------------------------------------------------------
        // ▍功能：对休息中但血量偏低、自然回血太慢的 kami 自动喂食加速回血，
        //   让它们更快回到可部署状态。具体判定与执行都在
        //   autoFeedLowHpRestingKamis 内部完成。
        // ▍触发时机：停采/部署段结束、普通锁已释放之后。
        // ▍锁纪律（先查后锁）：普通锁的获取在函数内部完成——先确认
        //   "候选 > 0 且食物库存 > 0"确实有活干才拿锁；多数轮次没有喂食
        //   需求，不拿锁就不会白占资源挡住辅助脚本的合成等模块。
        // ▍边界与保护：紧急锁存在时整体跳过（紧急停采优先于一切普通操作）。
        // ============================================================
        // 喂食前检查锁
        if (hasEmergencyLock()) {
            log(`[TX锁] ⏸️ 紧急锁存在，跳过本轮喂食`);
        } else {
            // 锁在函数内部按需获取（先查确认有活干才拿锁），
            // 候选=0 的常见轮次不占锁，不挡辅助脚本的合成等模块
            await autoFeedLowHpRestingKamis(kamiList);
        }

        // ============================================================
        // 【板块：批量复活收尾】
        // ------------------------------------------------------------
        // ▍功能：把本轮扫描收集的 DEAD kami（__deadToRevive）交给
        //   _reviveDeadBatch 一次性批量复活。
        // ▍放在最后的原因：停采/喂食是保命操作（不停会继续掉血甚至被
        //   清算），优先级最高；已死亡的 kami 不会再有进一步损失，垫后
        //   处理不吃亏。
        // ▍批量的原因：逐只复活时每只都要单独抢锁并等待确认，慢链下上
        //   一笔的等待会长时间占锁，后面的死 kami 全被自己上一笔挡住；
        //   收集后一次锁内批量处理，互不阻塞。
        // ▍依赖：_reviveDeadBatch(list) — 内部自行处理锁、分批与重试。
        // ============================================================
        await _reviveDeadBatch(__deadToRevive);
    }

    // ============================================================
    // 【板块：批量复活（死亡 kami 自动复活）】
    // ------------------------------------------------------------
    // ▍功能：
    //   检测到死亡 kami 后，用复活丝带 Red Ribbon Gummy(#11001) 批量复活，
    //   一次普通锁内串行发送所有复活 tx；复活成功的 kami 回 10 HP。
    // ▍触发时机：
    //   由死亡监控流程调用 _reviveDeadBatch(deadList)，deadList 为 DOM
    //   扫描出的死亡 kami 名单（元素形如 {dbIndex, imgNumber, kamiId}）。
    // ▍依赖：
    //   - 链上 API：window.network.explorer.accounts.getByOperator
    //     （全量查询账户下所有 kami 状态 + 背包库存）、
    //     window.network.explorer.kamis.getByIndex（按 index 反查 kamiId）、
    //     window.network.api.player.pet.item.use（对 kami 使用物品 = 发复活 tx）；
    //   - 本地数据：window.kami_core_db（index → kamiId 映射表，优先走本地
    //     省一次网络请求）；
    //   - TX 双锁：hasEmergencyLock / tryAcquireNormalLock / releaseNormalLock；
    //   - 内存状态：window.__reviveSentAt（Map<kamiId, 发送时间戳>，防重复）。
    // ▍核心流程：
    //   1) 名单合并：以 API 全量查询 state=DEAD 的结果为准，DOM 名单仅作底本
    //      （网络慢时 party 列表渲染不全，只信 DOM 会漏掉死亡 kami）；
    //   2) 冷却过滤：15 分钟内已发过复活 tx 的 kami 本轮不重发；
    //   3) 丝带库存检查：背包无货则红字提示购买、直接返回不发 tx；
    //   4) 丝带不足时截断名单，只复活前 N 只（N = 丝带余额）；
    //   5) 锁检查：紧急锁存在或普通锁被占均整轮跳过、下轮再试；
    //   6) 逐只串行：发送前先登记 __reviveSentAt → 发 use(kamiId, 11001)
    //      → 等待确认（45s 超时不阻塞）→ 间隔 1.2s 处理下一只；
    //   7) finally 中释放普通锁，保证任何异常路径都不会把锁带走。
    // ▍边界与保护：
    //   - 锁：进入发 tx 阶段前检查紧急锁 + 抢普通锁('revive')，抢不到跳过；
    //   - 防重复：__reviveSentAt 在【发送前】登记（防同轮/下轮重发）；
    //     发送抛异常（tx 未发出）时删除登记、允许下轮立即重试；tx 已发出
    //     但确认超时的不删登记，靠 15 分钟冷却兜底——防慢链下对同一只
    //     kami 重复发 tx、重复消耗丝带；
    //   - 超时：慢链下 tx.wait 可能卡几十秒，用 Promise.race 加 45s 超时，
    //     超时只记日志不中断整批，下轮由死亡监控自动核查结果；
    //   - 容错回退：API 全查失败 → 降级为仅按 DOM 名单处理；丝带库存查询
    //     失败 → 保守按"有货"尝试（宁可发 tx 也不漏复活）；
    //   - 省 gas：丝带为 0 时完全不发 tx，避免每轮白发注定失败的 tx。
    // ▍可调参数：
    //   - REVIVE_RIBBON_ID = 11001 — 复活丝带 Red Ribbon Gummy 的物品 ID，
    //     链上物品表固定值，勿改；
    //   - REVIVE_RETRY_COOLDOWN_MS = 15*60*1000 — 同一 kami 的复活重发冷却。
    //     调小：慢链下可能对同一只重复发 tx、多耗丝带；调大：tx 意外丢失时
    //     要等更久才补发；
    //   - 45000 — tx.wait 确认超时(ms)。调小：慢链下"确认超时"误报增多；
    //     调大：单只卡住时拖慢整批复活；
    //   - delay(1200) — 相邻两只复活 tx 的发送间隔(ms)，配合锁防 nonce 冲突。
    // ▍相关控制台命令：
    //   - window.__reviveSentAt.clear() — 清空复活防重登记（确认丝带未被
    //     消耗、需要立即重发复活 tx 时手动使用）。
    // ============================================================
    const REVIVE_RIBBON_ID = 11001;                       // Red Ribbon Gummy（复活丝带，复活并回10HP）
    const REVIVE_RETRY_COOLDOWN_MS = 15 * 60 * 1000;      // 同一 kami 复活tx发出后 15 分钟内不重发（防慢链下重复消耗丝带）
    window.__reviveSentAt = window.__reviveSentAt || new Map();   // 防重登记表：kamiId → 复活tx发送时间戳（页面刷新后清空）

    async function _reviveDeadBatch(deadList) {
        // 复活名单以 API 全量查询为准，DOM 扫描仅作补充——
        //   网络慢时 party 列表可能渲染不全，仅靠 DOM 扫描会漏掉未渲染出来的
        //   死亡 kami，使其一直进不了复活流程；API 返回的才是链上全量真值。
        const merged = Array.isArray(deadList) ? [...deadList] : [];
        try {
            const addr = window.network?.network?.connectedAddress?.value_;   // 当前操作员(Operator)钱包地址
            const acc = window.network.explorer.accounts.getByOperator(addr);
            const seen = new Set(merged.map(k => String(k.dbIndex)));   // DOM 名单里已有的 kami index，避免重复加入
            const deadApi = (acc?.kamis || []).filter(k => String(k?.state || '').toUpperCase() === 'DEAD');   // 链上全量死亡名单
            let added = 0;
            for (const k of deadApi) {
                if (seen.has(String(k.index))) continue;
                let kid = (window.kami_core_db || []).find(r => Number(r.index) === Number(k.index))?.kamiId || k.id || null;   // 优先本地映射表反查 kamiId
                if (!kid) { try { kid = (await window.network.explorer.kamis.getByIndex(k.index, {}))?.id || null; } catch (_) {} }   // 本地查不到再走 API 反查
                if (kid) { merged.push({ dbIndex: k.index, imgNumber: null, kamiId: kid }); added++; }
            }
            if (added > 0) {
                log(`%c🔍 [复活] API 全查补充 ${added} 只 DOM 漏扫的死亡 kami（DOM ${deadList.length} → 合计 ${merged.length}）`,
                    'color: orange; font-weight: bold;');
            }
        } catch (e) {
            log(`⚠️ [复活] API 死亡全查失败（${e?.message || e}），仅按 DOM 扫描名单处理`);
        }
        if (merged.length === 0) return;
        const now = Date.now();
        // 冷却过滤：剔除 15 分钟内已发过复活 tx、仍在等链上确认的 kami
        const fresh = merged.filter(k => now - (window.__reviveSentAt.get(k.kamiId) || 0) > REVIVE_RETRY_COOLDOWN_MS);
        const dup = merged.length - fresh.length;
        if (dup > 0) log(`⏳ [复活] ${dup} 只在 15 分钟内已发过复活tx（慢链确认中），本轮不重发`);
        if (fresh.length === 0) return;

        // 丝带库存检查：没货不发 tx（防每轮白发注定失败的 tx 烧 gas）
        let ribbons = 0;
        try {
            const addr = window.network?.network?.connectedAddress?.value_;
            const acc = window.network.explorer.accounts.getByOperator(addr);
            ribbons = Number((acc?.inventories || []).find(it => Number(it?.item?.index) === REVIVE_RIBBON_ID)?.balance ?? 0);   // 背包中复活丝带(#11001)余额
        } catch (e) {
            log(`⚠️ [复活] 丝带库存查询失败（${e?.message || e}），保守按有货尝试`);
            ribbons = fresh.length;
        }
        if (ribbons <= 0) {
            log(`%c🚨 [复活] ${fresh.length} 只 kami 死亡，但背包没有复活丝带 Red Ribbon Gummy(#${REVIVE_RIBBON_ID})！请去 Mina 商店购买（GDA 浮动价，基价 ~100 musu）。本轮不发 tx。`,
                'color: red; font-weight: bold; font-size: 14px;');
            return;
        }
        const todo = fresh.slice(0, ribbons);   // 丝带不足时截断：只复活名单前 N 只（N = 丝带余额）
        if (todo.length < fresh.length) {
            log(`%c⚠️ [复活] 丝带仅 ${ribbons} 个 < 死亡 ${fresh.length} 只，本轮先复活前 ${todo.length} 只，请补货`, 'color: orange; font-weight: bold;');
        }

        if (hasEmergencyLock()) { log(`[TX锁] ⏸️ 紧急锁存在，本轮跳过复活（下轮再试）`); return; }
        if (!tryAcquireNormalLock('revive', 'core')) { log(`[TX锁] ⏸️ 普通锁被占用（可能上一轮复活tx仍在确认），本轮跳过复活`); return; }
        try {
            log(`%c💀 [复活] 批量复活 ${todo.length} 只：${todo.map(k => '#' + k.dbIndex).join(', ')}（丝带库存 ${ribbons}）`,
                'color: red; font-weight: bold;');
            for (const k of todo) {
                // 🔻SYNC→内部版[1.1.11 冷却预筛推广]：复活【冷却观察】——不预筛、不改复活逻辑，
                // 只加日志。复活是否受停采/喂食同款 180s 操作冷却约束【未验证】：复活对象是
                // DEAD kami，其 harvest.time.last 语义（是否仍随停采/喂食一起被同一冷却计时器
                // 驱动）未经实盘确认，所以这里只读字段打观察日志，不做任何跳过判断。日志用于
                // 后续 grep 统计"age<180 的复活失败率 vs age>180"，判断复活是否受冷却影响，
                // 再决定要不要像停采/喂食那样加预筛。
                let reviveTimeLast = null;
                try {
                    const rInfo = await window.network.explorer.kamis.getByIndex(k.dbIndex, { harvest: true });
                    reviveTimeLast = rInfo?.harvest?.time?.last ?? null;
                } catch (_) { /* 查询失败不影响复活流程，仅本条观察日志缺失 age */ }
                const reviveAge = reviveTimeLast ? Math.round(Date.now() / 1000 - reviveTimeLast) : null;
                if (reviveAge !== null) {
                    log(`🔬 [复活/冷却观察] #${k.dbIndex} DEAD，time.last age=${reviveAge}s（${reviveAge < 180 ? '⚠️在180s冷却窗内' : '已过冷却窗'}）`);
                } else {
                    log(`🔬 [复活/冷却观察] #${k.dbIndex} DEAD，查不到 time.last（无法判断冷却窗）`);
                }

                let reviveSuccess = false;
                let reviveDetail = '';
                try {
                    window.__reviveSentAt.set(k.kamiId, Date.now());   // 发送前登记：防下一轮扫描重发
                    const tx = await window.network.api.player.pet.item.use(k.kamiId, REVIVE_RIBBON_ID);
                    _gasLedgerRecord('revive', [k.kamiId], tx);   // 🔻SYNC[1.2.7 gas真值账本] 记账 hook（复活）
                    if (typeof tx?.wait === 'function') {
                        // 慢链下 wait 可能卡几十秒，45s 超时兜底，不阻塞后续 kami 的复活
                        const result = await Promise.race([
                            tx.wait().then(() => 'ok').catch(() => 'revert'),
                            new Promise(r => setTimeout(() => r('timeout'), 45000)),
                        ]);
                        if (result === 'ok') { log(`%c✅ [复活] #${k.dbIndex} 复活成功`, 'color:green;font-weight:bold;'); reviveSuccess = true; }
                        else if (result === 'timeout') { log(`⏱️ [复活] #${k.dbIndex} tx已发出但确认超时（慢链），15分钟内不重发，下轮自动核查`); reviveDetail = '(超时未确认)'; }
                        else { log(`%c❌ [复活] #${k.dbIndex} tx执行失败(revert)`, 'color:red;'); reviveDetail = '(revert)'; }
                    } else {
                        log(`✅ [复活] #${k.dbIndex} 复活tx已发出`);
                        reviveSuccess = true;
                        reviveDetail = '(已发出未confirm)';
                    }
                } catch (e) {
                    window.__reviveSentAt.delete(k.kamiId);   // 未发出，允许下轮重试
                    log(`%c❌ [复活] #${k.dbIndex} 发送失败: ${e?.message || e}`, 'color:red;');
                    reviveDetail = '(发送异常)';
                }
                // 【复活/冷却观察】后置日志：age 沿用发 tx 前查到的 reviveAge（发 tx 到这里最长
                // 隔了 45s 超时窗口，未重新查询以省一次 RPC；分桶统计 age<180 时这点滞后可忽略）
                if (reviveAge !== null) {
                    log(`🔬 [复活/冷却观察] #${k.dbIndex} age=${reviveAge}s 时复活结果=${reviveSuccess ? '成功' : '失败'}${reviveDetail}`);
                }
                await delay(1200);   // 每只间隔 1.2s，配合锁防 nonce 冲突
            }
        } finally {
            releaseNormalLock('revive', 'core');   // 无论成败都释放锁，避免锁被带走卡死其他模块
        }
    }

    // ============================================================
    // 【板块：自动拾荒 autoScavenge】
    // ------------------------------------------------------------
    // ▍功能：
    //   自动打开当前采集点(Node)面板，读取累计拾荒次数(rolls)，达到
    //   门槛后点击 Scavenge 按钮，一笔 tx 领取全部拾荒奖励。
    // ▍触发时机：
    //   由主循环按周期调用；函数入口固定等待 5 分钟再动作，与其他
    //   模块的启动时序错峰。
    // ▍依赖：
    //   - DOM 元素：#node_button 下的 Harvest 按钮（按其 <img> 的 src
    //     匹配 assets/harvest-*.png 识别）、#node 面板、面板内文本为
    //     "Scavenge" 的按钮、该按钮同容器内显示 "N rolls" 的 <div>、
    //     文本为 "X" 的关闭按钮；
    //   - TX 双锁：hasEmergencyLock / tryAcquireNormalLock /
    //     releaseNormalLock（仅在点击 Scavenge 发 tx 时占用）。
    // ▍核心流程：
    //   1) 等待 5 分钟；2) 紧急锁存在则整轮跳过；3) 点 Harvest 按钮打开
    //   Node 面板（纯 DOM 读，不占锁）；4) 解析面板中的 rolls 数；
    //   5) rolls < 1000 → 关面板返回；6) 抢普通锁('scavenge') → 点击
    //   Scavenge 发 tx；7) finally 释放锁，最后关闭面板。
    // ▍边界与保护：
    //   - 锁纪律"先查后锁"：开面板、读 rolls 都是纯 DOM 读取，不需要锁；
    //     只有点击 Scavenge（真正发 tx）才进锁。这样 rolls 不够时不会
    //     白占一趟锁，避免挡住合成/喂食等其他模块；
    //   - 紧急锁存在 → 整轮跳过；普通锁被占 → 关面板跳过，下轮再试；
    //   - 找不到 Harvest 按钮 / 面板未显示 → 直接返回，不报错不重试；
    //   - rolls 解析失败按 0 处理（自然走"未到门槛"分支，不发 tx）；
    //   - 每步点击后 delay(500) 等待 DOM 渲染，结束时关闭面板还原界面。
    // ▍可调参数：
    //   - 1000（写死在 if (rolls < 1000)）— rolls 领取门槛。调小：领取更
    //     频繁、tx 更多更费 gas；调大：更省 tx 但奖励积压更久。攒够一大
    //     批再一次领取，是"减少 TX 次数 + 省 gas"哲学的直接体现；
    //   - delay(5 * 60 * 1000) — 入口固定延迟(ms)；
    //   - delay(500) — 各步 DOM 渲染等待时间(ms)。
    // ▍相关控制台命令：
    //   - 无（本板块全自动运行，无需手动干预）。
    // ============================================================
    async function autoScavenge() {
        // 健康心跳：本模块每次页面加载只跑一轮，写"存在性"埋点供辅助健康看板判活
        (window.__kamiHealthBeats = window.__kamiHealthBeats || {})['拾荒'] = Date.now();
        await delay(5 * 60 * 1000);   // 入口固定等待 5 分钟，与其他模块错峰

        if (hasEmergencyLock()) {
            log(`[TX锁] ⏸️ 紧急锁存在，跳过拾荒`);
            return;
        }
        // 锁纪律：先查后锁。开面板/读 rolls 是纯 DOM 读，不需要锁；
        // rolls 不够就不占锁，避免挡住合成/喂食等模块。只有点击 Scavenge（发 tx）才进锁。
        // Harvest 按钮无稳定 id/class，用其图标图片路径 assets/harvest-*.png 识别
        const harvestBtn = Array.from(document.querySelectorAll('#node_button button'))
        .find(btn => /assets\/harvest-.*\.png/.test(btn.querySelector('img')?.src));
        if (!harvestBtn) { log('未找到 Harvest 按钮'); return; }
        harvestBtn.click();
        await delay(500);

        const node = document.getElementById('node');
        if (!node || node.style.display === 'none') return;   // 面板未打开（不存在或隐藏）则放弃本轮
        const scavengeBtn = Array.from(node.querySelectorAll('button'))
        .find(btn => /^\s*Scavenge\s*$/i.test(btn.textContent));

        // Scavenge 按钮同容器内的 div 文本形如 "1234 rolls"，从中解析累计拾荒次数
        const container = scavengeBtn?.parentElement;
        const rollsDiv = container?.querySelector('div');
        const matchRolls = rollsDiv?.textContent.trim().match(/^(\d+)\s*rolls/i);
        const rolls = matchRolls ? parseInt(matchRolls[1], 10) : 0;   // 解析失败按 0 处理，走"未到门槛"分支
        // 关闭 Node 面板：点击面板内文本为 "X" 的按钮
        const closeNodePanel = () => {
            const closeBtn = Array.from(node.querySelectorAll('button'))
            .find(btn => btn.textContent.trim() === 'X');
            if (closeBtn) closeBtn.click();
            log('[自动拾荒(Scavenge)] 关闭弹窗');
        };

        if (rolls < 1000) {
            log(`[自动拾荒(Scavenge)] rolls=${rolls} < 1000 未到领取门槛，本次跳过（未占锁）`);
            closeNodePanel();
            await delay(500);
            return;
        }

        if (!tryAcquireNormalLock('scavenge', 'core')) {
            log(`[TX锁] ⏸️ 普通锁被占用，跳过拾荒`);
            closeNodePanel();
            await delay(500);
            return;
        }
        try {
            scavengeBtn.click();
            _gasLedgerRecord('scavenge', [], null);   // 🔻SYNC[1.2.7 gas真值账本] 记账 hook（拾荒=UI点击，无 tx 对象/hash，仅计动作次数，gas 无法回填）
            log(`[自动拾荒(Scavenge)] 本次自动拾荒完成，拾荒次数(rolls): ${rolls}`);
            await delay(500);
        } finally {
            releaseNormalLock('scavenge', 'core');
        }
        closeNodePanel();
        await delay(500);
    }

    // ============================================================
    // 【板块：体力读取 / 背包查询 / XP 药水合成执行】
    // ------------------------------------------------------------
    // ▍功能：
    //   为自动合成流程提供三块基础能力：
    //   ① getStamina() — 读取账户当前步长（体力）实时值；
    //   ② fetchInventoryItems() — 查询背包中与合成链相关的 7 种物品数量；
    //   ③ autoCraftGreaterXPPotion() — 调链上 craft 接口合成 1 瓶
    //      Greater XP Potion。
    // ▍触发时机：
    //   由自动合成/喂食主流程在每轮决策前调用。
    // ▍依赖：
    //   - window.getStaminaFromDOM()：辅助脚本暴露的接口，从页面 #MyPath
    //     步长条读取实时步长——本脚本体力数据的唯一信任来源；
    //   - 链上 API：window.network.explorer.accounts.getByOperator
    //     （背包库存）、window.network.api.player.account.item.craft
    //     （合成，参数 = 配方编号, 执行次数）。
    // ▍核心流程：
    //   1) getStamina：优先调 window.getStaminaFromDOM()，返回有限数值即
    //      采纳；读不到一律返回 0（本轮跳过合成、下轮再试）；
    //   2) fetchInventoryItems：API 拉取 inventories，物品名转小写后经
    //      nameMap 映射为内部 key，返回 {key: 数量} 对象；
    //   3) autoCraftGreaterXPPotion：craft(2, 1) —— 链上配方编号 2 =
    //      Greater XP Potion，执行 1 次；成功后等 3s 让链上状态落地。
    // ▍边界与保护：
    //   - 步长【只认 DOM】：API 返回的 acc.stamina.sync 是上次链上动作时
    //     记录的检查点旧值，不随时间自然回复，直接使用会严重偏离真实
    //     体力、导致合成超扣，因此禁用；DOM 步长条才是含自然回复的实时
    //     真值。DOM 读取失败时返回 0 而不回退到 API 旧值——宁可本轮不
    //     合成，绝不拿陈旧数据冒险；
    //   - fetchInventoryItems 查询失败返回空对象 {}（上层视为库存全 0，
    //     自然不会触发合成）；不在 nameMap 中的物品直接忽略；
    //   - autoCraftGreaterXPPotion 合成失败仅记日志，不重试不抛出。
    // ▍可调参数：
    //   - nameMap — 物品显示名(小写) → 内部 key 的映射表；合成链新增
    //     物品时在此登记即可被背包查询覆盖；
    //   - craft(2, 1) — 2 为链上配方编号（Greater XP Potion）、1 为执行
    //     次数，均由链上合约定义，勿随意修改；
    //   - delay(3000) — 合成成功后等待链上状态刷新的时间(ms)。
    // ▍相关控制台命令：
    //   - 无（本板块为内部工具函数，由合成流程自动调用）。
    // ============================================================
    async function getStamina() {
        // 步长【只认 DOM】(实时真值,含自然回复)。
        //   API 的 acc.stamina.sync 是上次链上动作记录的检查点旧值、不随时间回复，禁用。
        //   优先用辅助脚本暴露的 window.getStaminaFromDOM()(读 #MyPath 步长条)。
        //   DOM 读不到 → 返回 0(本轮不合成、下轮再试)，绝不拿陈旧 API 值冒险超扣。
        try {
            if (typeof window.getStaminaFromDOM === 'function') {
                const dom = window.getStaminaFromDOM();
                if (Number.isFinite(dom)) return dom;
            }
        } catch (_) {}
        log('⚠️ [体力] DOM 步长读取失败，本轮按 0 处理（跳过合成，不用陈旧 API sync 值）');
        return 0;
    }

    async function fetchInventoryItems() {
        try {
            const addr = window.network.network.connectedAddress.value_;
            const acc = window.network.explorer.accounts.getByOperator(addr);
            const inventories = acc.inventories || [];
            const result = {};
            // 物品显示名(小写) → 内部 key；只关心合成链相关的 7 种物品，其余忽略
            const nameMap = {
                'pine cone': 'pine_cone',
                'pine pollen': 'pine_pollen',
                'glass jar': 'glass_jar',
                'spice grinder': 'spice_grinder',
                'portable burner': 'portable_burner',
                'greater xp potion': 'greater_xp_potion',
                'fortified xp potion': 'fortified_xp_potion'
            };
            for (const inv of inventories) {
                const name = (inv.item?.name || '').toLowerCase();
                const key = nameMap[name];
                if (key) {
                    result[key] = Number(inv.balance) || 0;
                }
            }
            return result;
        } catch (e) {
            log('❌ 获取背包物品失败：', e);
            return {};
        }
    }

    async function autoCraftGreaterXPPotion() {
        log("🔧 开始合成 Greater XP Potion");
        try {
            await window.network.api.player.account.item.craft(2, 1);   // 配方编号 2 = Greater XP Potion，执行 1 次
            log('%c✅ 成功合成 Greater XP Potion × 1（API方式）', 'color: red; font-weight: bold;');
            await delay(3000);
        } catch (e) {
            log("❌ 合成失败：", e);
        }
    }

    // ============================================================
    // 【板块：合成配方表 RECIPE_DEFS 与材料短缺诊断】
    // ------------------------------------------------------------
    // ▍功能：
    //   定义 XP 药水合成链的配方真值（RECIPE_DEFS），并在合成条件不足时
    //   打印一张完整诊断卡片：体力缺口、各材料/工具缺口、可合成物递归
    //   追溯到最底层基础原料（pine_pollen → pine_cone）、最终采购清单。
    // ▍触发时机：
    //   合成主流程判定"条件不足、本轮不合成"时调用 _diagnoseCraft()。
    // ▍依赖：
    //   - 输入数据：items（fetchInventoryItems() 的背包快照）、stamina
    //     （getStamina() 的实时步长）；
    //   - 无 DOM / 链上 API 直接依赖，纯本地计算 + 日志输出，不发 tx。
    // ▍核心流程：
    //   1) _diagnoseCraft(recipeKey, items, stamina)：逐项核对体力、
    //      consumes（消耗品）、tools（工具），逐条 ✅/❌ 标注；
    //   2) 短缺项调 _traceDeficit() 递归下钻：可合成物列出"还需合成几次、
    //      每次产量/耗体力"，不可合成的基础料标记 🛒 需采购；
    //   3) _accumulatePurchase() 把所有短缺递归折算到最底层基础料数量，
    //      汇总为采购清单打印；
    //   4) 全部输出合并为单次 log 调用（避免每行重复时间戳前缀）。
    // ▍边界与保护：
    //   - consumes 与 tools 语义严格区分：consumes 按合成次数倍数累加
    //     消耗；tools 只需持有量 ≥ 阈值即可，不随次数累加；
    //   - glass_jar 是"循环容器"：合成时每瓶占用 1 个（合成瞬间库存确实
    //     会减，故放在 consumes 参与算术），但喂食 Greater/Fortified XP
    //     Potion 后会返还背包，并非净消耗——缺 jar 时应优先喂掉库存药水
    //     回收空瓶，而不是采购新瓶；
    //   - 合成次数用 Math.ceil 向上取整，按整次执行计算，不会低估需求；
    //   - 未知配方 key 直接返回 / 视为基础采购料，不会递归出错。
    // ▍可调参数（RECIPE_DEFS 配方真值，数值均经链上实测确认）：
    //   - greater_xp_potion：outputAmount=1（每次产 1 瓶）、staminaCost=50
    //     （每次耗 50 步长）、consumes={pine_pollen:2500, glass_jar:1}、
    //     tools={portable_burner:1 便携炉}；
    //   - pine_pollen：outputAmount=500（每次执行产 500 松花粉）、
    //     staminaCost=10（每次耗 10 步长）、consumes={pine_cone:1，每次
    //     1 个松果}、tools={spice_grinder:1 香料磨}。链上接口按"执行
    //     次数"计量：craft(6,10) = 执行 10 次 = 10 松果 + 100 步长
    //     → 5000 松花粉；
    //   - ITEM_LABEL — 诊断输出用的物品显示名，仅影响日志可读性。
    // ▍相关控制台命令：
    //   - 无（诊断由合成流程自动触发）。
    // ============================================================
    // consumes：每次配方按倍数消耗的"原料"；tools：只需持有 ≥ 1 的"工具"，不按倍数累加
    const RECIPE_DEFS = {
        greater_xp_potion: {
            displayName: 'Greater XP Potion',
            outputAmount: 1,
            staminaCost: 50,
            consumes: { pine_pollen: 2500, glass_jar: 1 },  // jar=循环容器：占用1/瓶，喂食后返还
            tools:    { portable_burner: 1 },
        },
        pine_pollen: {
            displayName: 'Pine Pollen',
            outputAmount: 500,            // 每次执行产出 500（经链上实测确认）
            staminaCost: 10,              // 每次执行 10 步长（实测确认）
            consumes: { pine_cone: 1 },   // 每次执行 1 松果（实测确认）
            tools:    { spice_grinder: 1 },
        },
    };
    // 简洁标签：只标物品名，类型/数量描述放在输出格式里（避免重复啰嗦）
    const ITEM_LABEL = {
        pine_cone:          'Pine Cone (松果)',
        pine_pollen:        'Pine Pollen (松花粉)',
        glass_jar:          'Glass Jar (玻璃罐·喂食XP药水后返还)',
        spice_grinder:      'Spice Grinder (香料磨)',
        portable_burner:    'Portable Burner (便携炉)',
        greater_xp_potion:  'Greater XP Potion',
        fortified_xp_potion:'Fortified XP Potion',
    };

    function _labelOf(key) { return ITEM_LABEL[key] || key; }

    // 递归追溯某个短缺物的来源：可合成的列出子配方需求，基础料标记"采购"
    function _traceDeficit(itemKey, deficit, items, depth = 1) {
        const pad = '   '.repeat(depth);
        const recipe = RECIPE_DEFS[itemKey];
        const lines = [];
        if (!recipe) {
            lines.push(`${pad}└─ 🛒 ${_labelOf(itemKey)} → 需采购 ${deficit} 个`);
            return lines;
        }
        const crafts = Math.ceil(deficit / recipe.outputAmount);   // 需要的合成次数（向上取整，按整次执行）
        lines.push(`${pad}└─ 🔄 ${_labelOf(itemKey)} 还差 ${deficit}，需合成 ${crafts} 次（每次产 ${recipe.outputAmount}，耗体力 ${recipe.staminaCost}）`);
        for (const [mKey, mPer] of Object.entries(recipe.consumes || {})) {
            const totalNeed = mPer * crafts;
            const have = items[mKey] ?? 0;
            const sub = Math.max(0, totalNeed - have);
            if (sub > 0) {
                lines.push(`${pad}   ├─ ❌ ${_labelOf(mKey)}：需 ${totalNeed}，有 ${have}，缺 ${sub}`);
                lines.push(..._traceDeficit(mKey, sub, items, depth + 1));
            } else {
                lines.push(`${pad}   ├─ ✅ ${_labelOf(mKey)}：需 ${totalNeed}，有 ${have}`);
            }
        }
        for (const [tKey, tNeed] of Object.entries(recipe.tools || {})) {
            const have = items[tKey] ?? 0;
            if (have < tNeed) {
                lines.push(`${pad}   ├─ ❌ ${_labelOf(tKey)} [工具]：需 ≥ ${tNeed}，有 ${have}`);
                lines.push(..._traceDeficit(tKey, tNeed - have, items, depth + 1));
            } else {
                lines.push(`${pad}   ├─ ✅ ${_labelOf(tKey)} [工具]：需 ≥ ${tNeed}，有 ${have}`);
            }
        }
        return lines;
    }

    // 合成不足时打印完整诊断卡片：体力 + 各材料 + 短缺追溯 + 采购建议汇总
    // 全部内容合并为单次 log 调用，避免每行重复时间戳前缀和 source link
    function _diagnoseCraft(recipeKey, items, stamina) {
        const recipe = RECIPE_DEFS[recipeKey];
        if (!recipe) return;
        const out = [];
        out.push(`🔍 ═══ 合成诊断：${recipe.displayName} ═══`);

        // 体力
        if (stamina < recipe.staminaCost) {
            out.push(`   ❌ 体力：需 ≥ ${recipe.staminaCost}（当前 ${stamina}，缺 ${recipe.staminaCost - stamina}）— 等恢复或喝体力药`);
        } else {
            out.push(`   ✅ 体力：需 ≥ ${recipe.staminaCost}（当前 ${stamina}）`);
        }

        // 各材料
        const purchaseSummary = {};
        for (const [mKey, mNeed] of Object.entries(recipe.consumes || {})) {
            const have = items[mKey] ?? 0;
            if (have < mNeed) {
                const deficit = mNeed - have;
                out.push(`   ❌ ${_labelOf(mKey)} [消耗品]：需 ≥ ${mNeed}，有 ${have}，缺 ${deficit}`);
                out.push(..._traceDeficit(mKey, deficit, items));
                _accumulatePurchase(mKey, deficit, items, purchaseSummary);
            } else {
                out.push(`   ✅ ${_labelOf(mKey)} [消耗品]：需 ≥ ${mNeed}，有 ${have}`);
            }
        }
        for (const [tKey, tNeed] of Object.entries(recipe.tools || {})) {
            const have = items[tKey] ?? 0;
            if (have < tNeed) {
                const deficit = tNeed - have;
                out.push(`   ❌ ${_labelOf(tKey)} [工具]：需 ≥ ${tNeed}，有 ${have}，缺 ${deficit}`);
                _accumulatePurchase(tKey, deficit, items, purchaseSummary);
            } else {
                out.push(`   ✅ ${_labelOf(tKey)} [工具]：需 ≥ ${tNeed}，有 ${have}`);
            }
        }

        // 采购汇总
        const purchaseEntries = Object.entries(purchaseSummary);
        if (purchaseEntries.length > 0) {
            out.push(`   💡 ───── 采购清单（最底层基础料） ─────`);
            for (const [k, v] of purchaseEntries) {
                out.push(`      🛒 ${_labelOf(k)} × ${v}`);
            }
            out.push(`   👉 补齐后才能合成 ${recipe.displayName}`);
        }
        out.push(`═══════════════════════════════════`);

        log(out.join('\n'));
    }

    // 把短缺递归折算到最底层基础料数量，写入 summary
    function _accumulatePurchase(itemKey, deficit, items, summary) {
        const recipe = RECIPE_DEFS[itemKey];
        if (!recipe) {
            summary[itemKey] = (summary[itemKey] || 0) + deficit;
            return;
        }
        const crafts = Math.ceil(deficit / recipe.outputAmount);
        // 消耗品按 crafts 倍数；工具只需补到 ≥ 阈值
        for (const [mKey, mPer] of Object.entries(recipe.consumes || {})) {
            const totalNeed = mPer * crafts;
            const have = items[mKey] ?? 0;
            const sub = Math.max(0, totalNeed - have);
            if (sub > 0) _accumulatePurchase(mKey, sub, items, summary);
        }
        for (const [tKey, tNeed] of Object.entries(recipe.tools || {})) {
            const have = items[tKey] ?? 0;
            if (have < tNeed) _accumulatePurchase(tKey, tNeed - have, items, summary);
        }
    }

    // ============================================================
    // 【板块：XP Potion 喂食记录与喂食参数】
    // ------------------------------------------------------------
    // ▍功能：
    //   持久化记录哪些 kami 已喂过 XP 药水（Fortified/Greater 共用同一份
    //   记录，每只 kami 终生只喂一次），并定义 XP 药水轮喂用到的物品 ID
    //   与筛选参数。
    // ▍触发时机：
    //   XP 药水轮喂流程在挑选喂食对象前读取记录、喂食成功后写入记录；
    //   旧 key 迁移在脚本载入时立即执行一次。
    // ▍依赖：
    //   - localStorage key：'kami_xp_potion_fed'（JSON 数组，元素为 kamiId
    //     字符串）；旧 key 'kami_fortified_fed' 存在且新 key 为空时自动
    //     迁移到新 key 并删除旧 key；
    //   - window.clearXPPotionFed / window.clearFortifiedFed：暴露给用户
    //     的清除命令（两个名字指向同一函数，旧名保留兼容）。
    // ▍核心流程：
    //   1) 载入时执行一次旧 key 迁移（仅当新 key 尚不存在才迁移，避免
    //      覆盖已有新记录）；
    //   2) _getXPPotionFedSet()：读取并解析为 Set；
    //   3) _saveXPPotionFed(kamiId)：把 kamiId 加入 Set 后整体写回。
    // ▍边界与保护：
    //   - localStorage 持久化：跨页面刷新、跨会话保留，保证"每只只喂
    //     一次"不因刷新而失效；
    //   - 读写全部包 try/catch：localStorage 不可用或数据损坏时静默退化
    //     为空记录，不影响主流程；
    //   - kamiId 统一 String 化后存储，避免数字/字符串混型导致查重失效。
    // ▍可调参数：
    //   - ITEM_FORTIFIED_XP = 11411 — Fortified XP Potion 物品 ID（链上
    //     固定值，勿改）；
    //   - ITEM_GREATER_XP = 11402 — Greater XP Potion 物品 ID（链上固定
    //     值，勿改）；
    //   - XP_POTION_LT_THRESHOLD = 70 — 只有清算线 LT 高于 70% 的 kami
    //     才参与 XP 药水轮喂（精确清算线刻度；换算自旧公式刻度的 70%）。
    //     调高：喂食对象更少、更保守；调低：更多 kami 有资格被喂，
    //     但药水喂给低 LT（本就安全）的 kami 性价比更低；
    //   - GREATER_RESERVE = 3 — Greater XP Potion 常备保留量，这部分留作
    //     合成 Fortified 的原料，只有超出保留量的库存才会被喂出去。
    //     调大：更多瓶子留给合成；调小：更多瓶子直接喂食。
    // ▍相关控制台命令：
    //   - clearXPPotionFed() — 清空全部 XP 药水喂食记录（清空后所有 kami
    //     重新变为可喂状态）；clearFortifiedFed() 为其旧名别名。
    // ============================================================
    const XP_POTION_FED_KEY = 'kami_xp_potion_fed';
    (function _migrateOldKey() {
        try {
            const oldRaw = localStorage.getItem('kami_fortified_fed');
            if (oldRaw && !localStorage.getItem(XP_POTION_FED_KEY)) {   // 新 key 已有数据则不迁移，避免覆盖
                localStorage.setItem(XP_POTION_FED_KEY, oldRaw);
                localStorage.removeItem('kami_fortified_fed');
            }
        } catch {}
    })();
    function _getXPPotionFedSet() {
        try {
            const raw = localStorage.getItem(XP_POTION_FED_KEY);
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    }
    function _saveXPPotionFed(kamiId) {
        const s = _getXPPotionFedSet();
        s.add(String(kamiId));
        localStorage.setItem(XP_POTION_FED_KEY, JSON.stringify([...s]));
    }
    // 暴露清除方法给用户：clearXPPotionFed()（保留旧名兼容）
    window.clearXPPotionFed = window.clearFortifiedFed = function() {
        const s = _getXPPotionFedSet();
        localStorage.removeItem(XP_POTION_FED_KEY);
        console.log(`✅ 已清除 ${s.size} 条 XP Potion 喂食记录（Fortified+Greater通用）`);
    };

    const ITEM_FORTIFIED_XP = 11411;  // Fortified XP Potion
    const ITEM_GREATER_XP   = 11402;  // Greater XP Potion

    const XP_POTION_LT_THRESHOLD = 70;  // 只有清算线 LT > 70% 的高危 kami 才参与 XP Potion 轮喂（优先喂高清算线 kami，升级降 LT）
    const GREATER_RESERVE = 3;          // Greater XP Potion 库存保留量（用于合成 Fortified）

    // ============================================================
    // 【板块：杀手 kami 保护清单（MY_KILLER_KAMIS）】
    // ------------------------------------------------------------
    // ▍功能：维护一份"杀手 kami"编号集合，XP Potion 喂食流程会自动
    //   跳过清单内的 kami。杀手 kami 的技能 build 通常是手动精调过的
    //   （技能点分配专门服务于清算/攻击），而喂 XP 药水会触发升级、
    //   升级会重新分配技能点，直接冲掉既有 build——因此把它们从
    //   喂食流程里排除，是"保 build"的保护机制。
    // ▍触发时机：脚本加载时初始化一次（若 window.MY_KILLER_KAMIS 已由
    //   其他脚本/控制台提前定义，则沿用已有集合、不覆盖）；此后
    //   autoFeedXPPotion 在每轮喂食前读取此集合做过滤。
    // ▍依赖：
    //   - window.MY_KILLER_KAMIS —— 全局 Set，成员为 kami 的数字编号（index）
    //   - 若同时运行辅助脚本：辅助脚本中也有一份同类保护清单
    //     （RESET_WHITELIST），两份清单需要你手动保持一致，否则会出现
    //     "核心脚本跳过、辅助脚本不跳过"的不一致行为
    // ▍核心流程：1) 初始化集合（默认空） 2) 喂食时按 Number(kami.index)
    //   是否命中集合决定跳过 3) showMyKillers() 随时打印当前清单
    // ▍边界与保护：
    //   - 默认清单为空 = 不跳过任何 kami，XP 喂食对全部达标 kami 生效
    //   - 读取处均有 (window.MY_KILLER_KAMIS || ...) 兜底，集合未定义或
    //     被外部清空也不会报错
    //   - 控制台用 .add()/.delete() 做的修改仅当前会话有效，刷新页面
    //     即恢复脚本内写死的清单；长期生效需修改脚本源码（核心脚本 +
    //     辅助脚本两处都要改）
    // ▍可调参数：
    //   - window.MY_KILLER_KAMIS —— 杀手 kami 编号集合，默认空 Set。
    //     示例：window.MY_KILLER_KAMIS = new Set([1234, 5678]);
    //     （把 1234、5678 换成你自己杀手 kami 的编号）
    //     加得越多 = 越多 kami 不吃 XP 药水（保 build 但升级变慢）；
    //     清空 = 全员参与喂食
    // ▍相关控制台命令：
    //   - showMyKillers() —— 查看当前清单及修改方法提示
    //   - window.MY_KILLER_KAMIS.add(编号) / .delete(编号) —— 临时增删
    //     （仅当前会话有效）
    // ============================================================
    window.MY_KILLER_KAMIS = window.MY_KILLER_KAMIS || new Set([
        // 默认留空 = 不保护任何 kami；需要保护时在此填入编号，如：1234, 5678
    ]);
    window.showMyKillers = function() {
        const list = [...(window.MY_KILLER_KAMIS || [])];
        if (list.length === 0) {
            console.log('🛡️ 当前未配置杀手 kami（XP Potion 喂食对所有 kami 生效）');
            return;
        }
        console.log(`🛡️ 我的杀手清单（共 ${list.length} 只，XP Potion 喂食自动跳过）：`);
        console.log('   ' + list.map(i => `#${i}`).join(', '));
        console.log('   💡 修改方法：在控制台执行 window.MY_KILLER_KAMIS.add(数字) 或 .delete(数字)');
        console.log('   ⚠️ 长期生效需同步修改核心脚本 + 辅助脚本两处常量');
    };

    // ============================================================
    // 【板块：XP Potion 自动喂食（autoFeedXPPotion）】
    // ------------------------------------------------------------
    // ▍功能：给高清算线（LT）的高价值 kami 批量喂经验药水，加速升级。
    //   LT 是 kami 会被杀手清算的 HP 线，LT 越高 = 越"扛饿"、单周期
    //   采集时间越长、价值越高——所以稀缺的 XP 药水按 LT 降序优先投放。
    // ▍触发时机：由 XP 药水总控流程 autoXPPotionFlow 在"合成 Greater"
    //   环节之后调用，不单独定时；也可在控制台手动执行 autoFeedXPPotion()。
    // ▍依赖：
    //   - window.kami_core_db —— 精简数据库（每条含 index / kamiId / LT）
    //   - window.network.network.connectedAddress.value_ —— 当前连接的钱包地址
    //   - window.network.explorer.accounts.getByOperator(addr) —— 查账户
    //     实际持有的 kami 列表（用于幽灵过滤）
    //   - window.network.explorer.kamis.getByIndex(index, {harvest:true})
    //     —— 查单只 kami 的实时状态（RESTING / HARVESTING / DEAD 等）
    //   - window.network.api.player.pet.item.use(kamiId, itemId) —— 链上喂食 TX
    //   - fetchInventoryItems() —— 读背包库存（fortified_xp_potion /
    //     greater_xp_potion 两个字段）
    //   - localStorage：XP_POTION_FED_KEY —— 本轮已喂 kamiId 集合（轮喂
    //     去重记录，由 _getXPPotionFedSet / _saveXPPotionFed 读写；历史
    //     旧 key "kami_fortified_fed" 的数据会自动迁移到新 key）
    //   - window.MY_KILLER_KAMIS —— 杀手保护清单（见上一板块，命中即跳过）
    // ▍核心流程：
    //   1) _printXPPotionRules() 打印规则速览，说明为什么有药水也可能不喂
    //   2) 查链上账户实际持有的 kami index 集合（幽灵过滤的依据）
    //   3) 从数据库筛出 LT > XP_POTION_LT_THRESHOLD 且仍在持有中的 kami
    //   4) 剔除杀手清单成员（并打印跳过了谁）
    //   5) 剔除本轮已喂过的；若达标 kami 全部喂过 → 清空去重记录，
    //      自动开始新一轮
    //   6) 查背包：Fortified 全量可用；Greater 扣除 GREATER_RESERVE 后
    //      的余量才可用；两者都为 0 则直接返回
    //   7) 按 LT 降序逐只喂：先查实时状态、仅 RESTING 才喂；物品选择
    //      Fortified 优先、用完换 Greater；每喂一只写入去重记录并在
    //      本地扣减库存计数
    //   8) 收尾统计：喂了几只、因非 RESTING 跳过几只；若有候选有库存
    //      却 0 喂食，明确提示原因（多半全在 HARVESTING）
    // ▍边界与保护：
    //   - 幽灵过滤：数据库里可能残留已转走/卖出的 kami，对它们发喂食 TX
    //     必然失败、白烧 gas——因此以链上账户实际持有为准；若查询失败，
    //     容错回退为"不过滤"（宁可多试一只，也不中断整轮流程）
    //   - 状态过滤：仅 RESTING 喂食。HARVESTING 中喂食会影响采集参数，
    //     DEAD / 升级中喂不进去，一律跳过并计数提示
    //   - 杀手保护：MY_KILLER_KAMIS 命中即跳过，避免升级重分配技能点
    //   - 轮喂去重：同一只 kami 一轮只喂 1 次（localStorage 持久化，
    //     刷新页面不丢）；全部喂过后自动重置开新一轮，重置后的候选
    //     同样已剔除杀手
    //   - 库存保护：Greater 始终保留 GREATER_RESERVE 个不喂（留作合成
    //     Fortified 的原料）；喂食过程中本地计数扣减，可用量耗尽即停
    //   - 单只失败不连坐：每只的状态查询 + 喂食 TX 都包在 try/catch 里，
    //     失败只记日志，继续喂下一只
    //   - 节流：每只之间固定 delay(3000)，降低 TX 过密引发 nonce 冲突的风险
    // ▍可调参数：
    //   - XP_POTION_LT_THRESHOLD = 70 —— 参与喂食的 LT 门槛（%）。
    //     调低 = 更多 kami 能吃到药水，但稀缺库存被摊薄；
    //     调高 = 只喂最顶级的 kami，一轮更快喂完、更快进入下一轮
    //   - GREATER_RESERVE = 3 —— Greater 的常备保留数（合成 Fortified 的
    //     原料）。调大 = 留给合成的更多、可喂的更少；调 0 = Greater 全喂
    //   - ITEM_FORTIFIED_XP = 11411 —— Fortified XP Potion 的链上物品 ID
    //   - ITEM_GREATER_XP = 11402 —— Greater XP Potion 的链上物品 ID
    //   - 喂食间隔 delay(3000) —— 每只间隔 3 秒；调小提速但增加 nonce
    //     冲突风险，不建议低于链上确认节奏
    // ▍相关控制台命令：
    //   - autoFeedXPPotion() —— 手动执行一次喂食流程
    //   - clearXPPotionFed() —— 清空轮喂去重记录，强制立刻重喂
    //   - showMyKillers() —— 查看喂食豁免的杀手清单
    // ============================================================

    // 在喂食入口打印一份完整规则，方便用户理解为什么有时背包有 potion 却不喂
    // 说明：全部行合并为单次 log 输出，避免控制台每行都带重复的时间戳前缀和 source link
    function _printXPPotionRules() {
        const killerCount = (window.MY_KILLER_KAMIS && window.MY_KILLER_KAMIS.size) || 0;
        const lines = [
            `🧪 ═══════ XP Potion 喂食规则速览 ═══════`,
            `   ① 目标 kami：精简数据库 LT > ${XP_POTION_LT_THRESHOLD}% 的高价值 kami（按 LT 降序优先）`,
            `   ② 持有过滤：仅当前账户实际持有的 kami 才喂（已转走的"幽灵"跳过，省 gas）`,
            `   ③ 状态过滤：仅 RESTING 才喂（HARVESTING / DEAD / 升级中等一律跳过）`,
            `   ④ 物品优先级：Fortified XP Potion > Greater XP Potion`,
            `   ⑤ 库存保留：Greater 始终保留 ${GREATER_RESERVE} 个用于合成 Fortified，剩下的才用于喂食`,
            `   ⑥ 轮喂去重：同一只 kami 一轮只喂 1 次（localStorage 持久化），全部喂过自动重置开始新一轮`,
            `   ⑦ 杀手保护：我的杀手 kami 自动跳过（当前 ${killerCount} 只，控制台 showMyKillers() 查看）`,
            `   💡 想强制重喂某只 kami → 控制台输入：clearXPPotionFed()`,
            `═══════════════════════════════════════`,
        ];
        log(lines.join('\n'));
    }

    async function autoFeedXPPotion() {
        _printXPPotionRules();
        // 精简数据库：每条记录含 index / kamiId / LT
        const db = window.kami_core_db || [];
        // 本轮已喂过的 kamiId 集合（localStorage 持久化，刷新页面不丢）
        let fedSet = _getXPPotionFedSet();

        // 获取当前账户实时持有的 kami index 集合，过滤掉数据库里已转走的"幽灵 kami"，避免发失败 tx 浪费 gas
        // ownedIdx 保持 null = 查询失败，后续容错回退为不过滤
        let ownedIdx = null;
        try {
            const addr = window.network.network.connectedAddress.value_;
            const acc = window.network.explorer.accounts.getByOperator(addr);
            ownedIdx = new Set((acc?.kamis || []).map(k => Number(k.index)));
            log(`🔍 [XP Potion] 当前账户实时持有 ${ownedIdx.size} 只 kami，数据库 ${db.length} 条`);
        } catch (e) {
            log(`⚠️ [XP Potion] 获取账户持有列表失败，退化为不过滤：${e?.message || e}`);
        }

        // 筛选LT达标（>XP_POTION_LT_THRESHOLD%）且仍在当前账户持有的高价值kami
        const highLTKamis = db.filter(k => {
            if (typeof k.LT !== 'number' || k.LT <= XP_POTION_LT_THRESHOLD) return false;
            if (ownedIdx && !ownedIdx.has(Number(k.index))) return false;
            return true;
        });

        if (highLTKamis.length === 0) {
            log(`⚠️ 没有LT>${XP_POTION_LT_THRESHOLD}%的Kami，跳过XP Potion喂食`);
            return;
        }

        // 先排除我的杀手 kami（保住杀手既有 build，避免升级后技能点重分配）
        const killerSet = window.MY_KILLER_KAMIS instanceof Set ? window.MY_KILLER_KAMIS : new Set();
        const skippedKillers = highLTKamis.filter(k => killerSet.has(Number(k.index)));
        const nonKillerKamis = highLTKamis.filter(k => !killerSet.has(Number(k.index)));
        if (skippedKillers.length > 0) {
            const skipList = skippedKillers.map(k => `#${k.index}(LT=${k.LT}%)`).join(', ');
            log(`🛡️ [XP Potion] 跳过我的杀手 ${skippedKillers.length} 只: ${skipList}`);
        }

        // 候选 = 非杀手 + 本轮未喂过，按 LT 降序（LT 越高越先喂）
        let candidates = nonKillerKamis
            .filter(k => !fedSet.has(String(k.kamiId)))
            .sort((a, b) => b.LT - a.LT);

        // LT 达标的全部喂过一轮 → 自动重置去重记录，开始新一轮
        // 注意：重置后的候选取自 nonKillerKamis，杀手依然被排除在外
        if (candidates.length === 0) {
            log(`%c🔄 [XP Potion] LT>${XP_POTION_LT_THRESHOLD}%的 ${nonKillerKamis.length} 个kami已全部喂过一轮，自动重置开始新一轮`,
                'color: cyan; font-weight: bold;');
            localStorage.removeItem(XP_POTION_FED_KEY);
            fedSet = new Set();
            candidates = nonKillerKamis.sort((a, b) => b.LT - a.LT);
        }

        // 查背包库存，计算本轮实际可用的药水数量
        const items = await fetchInventoryItems();
        let balFortified = items.fortified_xp_potion ?? 0;
        let balGreater   = items.greater_xp_potion ?? 0;

        // Greater XP Potion 保留 GREATER_RESERVE 个用于合成 Fortified，多余的才拿来喂
        const greaterAvailable = Math.max(0, balGreater - GREATER_RESERVE);

        const totalAvailable = balFortified + greaterAvailable;
        if (totalAvailable <= 0) {
            log(`📦 背包中无可用XP Potion（Fortified: ${balFortified}, Greater: ${balGreater}, 保留${GREATER_RESERVE}个用于合成），跳过喂食`);
            return;
        }

        log(`%c🧪 [XP Potion] 开始批量喂食：Fortified×${balFortified} + Greater可用×${greaterAvailable}（库存${balGreater}，保留${GREATER_RESERVE}），待喂kami: ${candidates.length}个`,
            'color: cyan; font-weight: bold;');

        let fedCount = 0;
        let skippedNotResting = 0;
        let skippedCooldown = 0;  // 【v1.1.10】冷却期跳过计数，与非RESTING跳过分开统计
        for (const kami of candidates) {
            // 每次喂食前选择：优先用Fortified，用完再用Greater
            let useItem, useName;
            if (balFortified > 0) {
                useItem = ITEM_FORTIFIED_XP;
                useName = 'Fortified XP Potion';
            } else if (balGreater > GREATER_RESERVE) {
                useItem = ITEM_GREATER_XP;
                useName = 'Greater XP Potion';
            } else {
                log(`📦 [XP Potion] Potion已用完（Fortified: 0, Greater剩余${balGreater}≤保留${GREATER_RESERVE}），停止喂食`);
                break;
            }

            try {
                // 喂食前查实时状态，只喂 RESTING 的 kami（HARVESTING 中喂食会影响采集参数）
                // RESTING 的 kami 不在任何地块上，因此这里无需（也无法）做地块检查
                const kamiInfo = await window.network.explorer.kamis.getByIndex(kami.index, { harvest: true });
                const apiState = String(kamiInfo?.state || '').toUpperCase();
                if (apiState !== 'RESTING') {
                    skippedNotResting++;
                    continue;
                }

                // 【v1.1.10 冷却公式预筛】同一次 getByIndex 已带 harvest.time.last，
                // 零新增查询判断是否仍在180s操作冷却内；冷却中发tx必败，跳过不发
                const cdRemainXp = _cooldownRemainSec(kamiInfo?.harvest?.time?.last);
                if (cdRemainXp > 0) {
                    log(`⏳ [XP Potion] #${kami.index} 冷却中(剩余${cdRemainXp}s)，跳过`);
                    skippedCooldown++;
                    continue;
                }

                log(`🩹 喂食 ${useName} 给 Kami #${kami.index} (LT=${kami.LT}%)，剩余potion: F=${balFortified} G=${balGreater}`);
                // 链上喂食 TX：对该 kami 使用选定的药水
                const __xpTx = await window.network.api.player.pet.item.use(kami.kamiId, useItem);   // 🔻SYNC[1.2.7 gas真值账本] 捕获返回抓 hash（原返回值本就丢弃）
                _gasLedgerRecord('xp_potion', [kami.kamiId], __xpTx);
                // 立即写入轮喂去重记录（即使后续流程中断，这只也不会被重复喂）
                _saveXPPotionFed(kami.kamiId);

                // 扣减本地计数
                if (useItem === ITEM_FORTIFIED_XP) balFortified--;
                else balGreater--;

                fedCount++;
                log(`%c✅ 已喂食 ${useName} 给 Kami #${kami.index}`, 'color: green; font-weight: bold;');
            } catch (e) {
                log(`❌ 喂食失败：Kami #${kami.index}`, e);
            }

            // 每只之间间隔 3 秒：节流，降低 TX 过密引发 nonce 冲突的风险
            await delay(3000);
        }
        if (skippedNotResting > 0) {
            log(`📊 [XP Potion] 跳过: 非RESTING=${skippedNotResting}（这些 kami 当前在 HARVESTING / DEAD / 升级中，本轮不喂）`);
        }
        if (skippedCooldown > 0) {
            log(`📊 [XP Potion] 跳过: 冷却中=${skippedCooldown}（180s操作冷却内，下轮自动重试）`);
        }

        if (fedCount > 0) {
            log(`%c🎉 [XP Potion] 本次批量喂食完成：共喂 ${fedCount} 个kami`, 'color: cyan; font-weight: bold;');
        } else if (candidates.length > 0) {
            // 有可喂候选 + 有库存却 0 喂食 → 提示用户为什么
            log(`%c⚠️ [XP Potion] 本轮 0 喂食。候选 ${candidates.length} 只全部不在 RESTING 状态（多在 HARVESTING）。背包 potion 仍保留，等下一轮（30 分钟后）这些 kami 停采进入 RESTING 时会自动喂食。`,
                'color: #d4a017; font-weight: bold;');
        }
    }

    // ============================================================
    // 【板块：XP 药水总控流程（autoXPPotionFlow）】
    // ------------------------------------------------------------
    // ▍功能：XP 药水相关动作的统一入口，一轮内串行完成三件事：
    //   ① 合成 Greater XP Potion（原料/步长够时）
    //   ② 喂食 XP 药水（Fortified 优先、Greater 兜底，见上一板块）
    //   ③ 凑批合成 Pine Pollen（松花粉，Greater 药水的上游原料）
    //   三件事共用一次"普通锁"占用，减少锁的争抢次数。
    // ▍触发时机：由主循环定时调度（约每 30 分钟一轮）；也可在控制台
    //   手动执行 autoXPPotionFlow()。
    // ▍依赖：
    //   - TX 双锁：hasEmergencyLock() 检查紧急锁；
    //     tryAcquireNormalLock('xp_potion', 'core') /
    //     releaseNormalLock('xp_potion', 'core') 占用/释放普通锁
    //   - getStamina() —— 读账户当前步长（stamina，上限 100）
    //   - fetchInventoryItems() —— 读背包（pine_pollen 松花粉 / glass_jar
    //     玻璃罐 / portable_burner 便携炉 / pine_cone 松果 / spice_grinder
    //     香料研磨器 / fortified_xp_potion / greater_xp_potion）
    //   - autoCraftGreaterXPPotion() —— Greater XP Potion 合成子流程
    //   - autoFeedXPPotion() —— 喂食子流程（上一板块）
    //   - _diagnoseCraft(配方名, items, stamina) —— 打印"还缺什么原料/
    //     步长"的诊断，帮助用户理解为什么这轮没合成
    //   - window.network.api.player.account.item.craft(6, n) —— 链上合成
    //     TX（配方 6 = Pine Pollen）
    //   - DOM：#crafting 面板内文本为 "X" 的按钮（合成后关窗清理）+
    //     simulateClick()
    // ▍核心流程：
    //   1) 紧急锁存在 → 整轮直接跳过（紧急停采等高优先级流程正占用 TX 通道）
    //   2) 先查后锁：纯读取步长 + 背包，预判三件事是否至少有一件可能
    //      执行；全不满足 → 不占锁，只打印合成诊断后返回
    //   3) 尝试拿普通锁（模块名 xp_potion / 来源 core），拿不到 → 跳过本轮
    //   4) Greater 合成：步长≥50 且 松花粉≥2500 且 玻璃罐≥1 且 便携炉≥1
    //      → 执行合成，随后等 30 秒让链上库存刷新；否则打印诊断
    //   5) 调 autoFeedXPPotion() 喂食
    //   6) 重新读步长/背包（前两步已有消耗），凑批合成 Pine Pollen：
    //      步长≥100 且 松果≥10 且 研磨器≥1 → 单笔 tx 合成 10 次；
    //      否则打印"等下轮"+ 诊断
    //   7) 找到 Crafting 面板的关闭按钮并点掉（UI 清理）
    //   8) finally 中释放普通锁（无论成功或异常）
    // ▍边界与保护：
    //   - 紧急锁优先：紧急锁在手的流程（如紧急停采）绝对优先，本流程让路
    //   - 先查后锁：预判是纯读操作、不发 TX，不需要占锁；"条件全不满足"
    //     是最常见的轮次，若先拿锁再检查，会白占普通锁挡住其他模块的 TX
    //   - 锁必释放：整个执行体包在 try/finally 里，中途任何异常都不会
    //     导致普通锁泄漏
    //   - Pine Pollen 固定凑批：宁等不拆（详见下方设计说明），符合
    //     "减少 TX 次数优先"的总体哲学
    //   - 合成 TX 有 try/catch，失败只记日志不中断
    //   - DOM 容错：找不到 Crafting 关闭按钮只提示、不报错
    // ▍可调参数：
    //   - POLLEN_BATCH = 10 —— 每笔 tx 的 Pine Pollen 合成执行次数。
    //     步长上限 100、每次执行耗 10 步长，10 次正好吃满单笔上限；
    //     调小 = 更频繁的小批合成，同样材料多付固定 gas，不建议
    //   - POLLEN_BATCH_STAM = 100 —— 凑批所需步长（10 次 × 10 步长/次）
    //   - Greater 合成门槛（写死在条件里）：步长≥50、松花粉≥2500、
    //     玻璃罐≥1、便携炉≥1
    //   - delay(30000) —— Greater 合成后的等待，给链上状态刷新留时间
    //   - 喂食可能性粗筛中的 LT > XP_POTION_LT_THRESHOLD 与 GREATER_RESERVE —— 见代码内注释
    // ▍相关控制台命令：
    //   - autoXPPotionFlow() —— 手动跑一轮总控流程
    //   - autoFeedXPPotion() / clearXPPotionFed() / showMyKillers() ——
    //     见"XP Potion 自动喂食"板块
    // ============================================================
    async function autoXPPotionFlow() {
        // 健康心跳：本模块每次页面加载只跑一轮，写"存在性"埋点供辅助健康看板判活
        (window.__kamiHealthBeats = window.__kamiHealthBeats || {})['XP流程'] = Date.now();
        log("🧠 启动 XP 药水总控流程（合成 Greater/Pine Pollen + 喂食 Fortified 优先）");

        // 紧急锁存在 = 紧急停采等高优先级流程正占用 TX 通道，本流程整轮让路
        if (hasEmergencyLock()) {
            log(`[TX锁] ⏸️ 紧急锁存在，跳过XP Potion流程`);
            return;
        }

        // 锁纪律：先查后锁。读步长/背包与下面三段预判都是纯读操作、不发 TX，
        // 不需要占锁；"合成/喂食条件全不满足"是最常见的轮次，若先拿锁再检查，
        // 会在什么都不做的情况下白占普通锁、挡住其他模块的 TX。
        const stamina = await getStamina();
        const items = await fetchInventoryItems();
        // 预判①：Greater XP Potion 合成条件（步长≥50 + 松花粉≥2500 + 玻璃罐≥1 + 便携炉≥1）
        const _greaterOk = stamina >= 50 && (items.pine_pollen ?? 0) >= 2500 &&
                           (items.glass_jar ?? 0) >= 1 && (items.portable_burner ?? 0) >= 1;
        // 预判②：Pine Pollen 凑批条件（步长≥100 + 松果≥10 + 香料研磨器≥1）
        const _pollenOk  = stamina >= 100 && (items.pine_cone ?? 0) >= 10 && (items.spice_grinder ?? 0) >= 1;
        // 预判③：喂食可能性粗筛——背包有可喂药水（Fortified>0，或 Greater 超出保留量），
        // 且数据库存在 LT 超过喂食阈值（XP_POTION_LT_THRESHOLD）的高价值记录。
        // 阈值必须引用常量与正式喂食逻辑保持一致：若此处比正式阈值更严，
        // 落在两个阈值之间的 kami 会被预判挡在门外（判定"无事可做"不拿锁），永远轮不到喂食。
        const _feedMaybe = ((items.fortified_xp_potion ?? 0) > 0 || (items.greater_xp_potion ?? 0) > GREATER_RESERVE) &&
                           (window.kami_core_db || []).some(r => Number(r?.LT) > XP_POTION_LT_THRESHOLD);
        if (!_greaterOk && !_pollenOk && !_feedMaybe) {
            log(`💤 [XP流程] 合成/喂食条件均不满足，本轮不占锁，直接给诊断：`);
            log("%c⚠️ 不满足 Greater XP Potion 合成条件，跳过合成", 'color: red; font-weight: bold;');
            _diagnoseCraft('greater_xp_potion', items, stamina);
            log(`💤 凑批条件不足，跳过等下轮（步长：${stamina}/100，松果：${items.pine_cone}）`);
            _diagnoseCraft('pine_pollen', items, stamina);
            return;
        }

        // 普通锁：与其他发 TX 的模块互斥，防 nonce 冲突；拿不到 = 别的模块正在发 TX
        if (!tryAcquireNormalLock('xp_potion', 'core')) {
            log(`[TX锁] ⏸️ 普通锁被占用，跳过XP Potion流程`);
            return;
        }

        try {

        // Greater XP Potion 合成门槛：步长≥50 + 松花粉≥2500 + 玻璃罐≥1 + 便携炉≥1
        if (stamina >= 50 &&
            (items.pine_pollen ?? 0) >= 2500 &&
            (items.glass_jar ?? 0) >= 1 &&
            (items.portable_burner ?? 0) >= 1) {
            log("🔧 开始合成 Greater XP Potion");
            await autoCraftGreaterXPPotion();
            // 等 30 秒让链上库存/状态刷新，再进入喂食环节
            await delay(30000);
        } else {
            log("%c⚠️ 不满足 Greater XP Potion 合成条件，跳过合成", 'color: red; font-weight: bold;');
            _diagnoseCraft('greater_xp_potion', items, stamina);
        }

        // 合成后喂食XP Potion：优先Fortified，没有则用Greater
        await autoFeedXPPotion();

        // 前面的合成/喂食已消耗步长和材料，重新读一次再判断 Pine Pollen 凑批
        const currentStamina = await getStamina();
        const currentInventory = await fetchInventoryItems();

        // 【设计说明】Pine Pollen 固定凑满 10 次一笔 tx，不拆小批：
        //   craft(6,10) = 单笔 tx 完成 10 次执行 = 10 松果 + 100 步长 → 5000 松花粉（链上实测）。
        //   步长不足 100 时宁可等下轮——拆小批 = 同样的步长变多笔 tx，多付固定 gas
        //   （哲学：减少 TX 优先；松花粉是囤积材料，不赶时间）。
        const POLLEN_BATCH = 10;        // 固定批量：10 次执行/笔 tx
        const POLLEN_BATCH_STAM = 100;  // 10 次 × 10 步长/次（链上实测消耗）
        if (currentStamina >= POLLEN_BATCH_STAM &&
            (currentInventory.pine_cone ?? 0) >= POLLEN_BATCH &&
            (currentInventory.spice_grinder ?? 0) >= 1) {
            log(`🛠️ 步长已满 ${POLLEN_BATCH_STAM}，合成 pine_pollen × ${POLLEN_BATCH}（单笔 tx：${POLLEN_BATCH} 松果 + ${POLLEN_BATCH_STAM} 步长 → ${POLLEN_BATCH * 500} 松花粉）`);

            try {
                // 链上合成 TX：配方 6 = Pine Pollen，单笔 tx 内执行 POLLEN_BATCH 次
                await window.network.api.player.account.item.craft(6, POLLEN_BATCH);
                log(`%c✅ 成功合成 pine_pollen × ${POLLEN_BATCH}（API方式）`, 'color: red; font-weight: bold;');
                await delay(3000);
            } catch (e) {
                log("❌ 合成失败：", e);
            }
        } else {
            log(`💤 凑批条件不足，跳过等下轮（步长：${currentStamina}/${POLLEN_BATCH_STAM}，松果：${currentInventory.pine_cone}）`);
            _diagnoseCraft('pine_pollen', currentInventory, currentStamina);
        }

        // UI 清理：合成走 API 后，页面上可能残留打开的 Crafting 面板，找到 "X" 按钮点掉
        const craftingCloseBtn = Array.from(document.querySelectorAll('#crafting button'))
        .find(btn => btn.textContent.trim() === 'X');

        if (craftingCloseBtn) {
            simulateClick(craftingCloseBtn);
            log("🧼 已关闭 Crafting 窗口");
        } else {
            log("⚠️ 未找到 Crafting 关闭按钮");
        }
        } finally {
            // 无论正常结束还是中途异常，都必须释放普通锁，避免锁泄漏卡死其他模块
            releaseNormalLock('xp_potion', 'core');
        }
    }

    // ============================================================
    // 【板块：手动 XP Potion 喂食接口（只喂不合成）】
    // ------------------------------------------------------------
    // ▍功能：
    //   提供控制台命令 feedXPPotionNow()，立即手动触发一次 XP Potion 喂食。
    //   它是 autoFeedXPPotion 的薄包装：只做"喂"这一步，不合成
    //   Greater XP Potion、也不合成 pine_pollen（这两步属于启动时的
    //   全流程 autoXPPotionFlow，与本手动入口区分开）。
    // ▍触发时机：
    //   仅由用户在浏览器控制台手动调用；脚本自身不会自动执行本函数。
    // ▍依赖：
    //   - window.feedXPPotionNow —— 本函数暴露到全局的入口
    //   - autoFeedXPPotion() —— 实际喂食实现，沿用其全部喂食规则：
    //     LT>70% + 状态为 RESTING + Fortified 药水优先 + 跳过杀手 + 轮喂去重
    //   - TX 双锁接口：hasEmergencyLock() / tryAcquireNormalLock() /
    //     releaseNormalLock()，本函数使用的锁标识为 ('xp_potion', 'manual')
    // ▍核心流程：
    //   1) 检查紧急锁：存在则直接让路返回（紧急停采等高优先级操作优先）
    //   2) 尝试获取普通锁：被占用（主流程可能正在 XP Potion 流程或其他
    //      tx 操作）则让路返回，不排队、不重试
    //   3) 拿到锁后调用 autoFeedXPPotion() 执行真正的喂食
    //   4) finally 中释放普通锁，保证异常时锁也能归还
    // ▍边界与保护：
    //   - 双锁让路：紧急锁 / 普通锁任一存在即放弃本次调用，避免 nonce 冲突
    //   - finally 释放锁：即使喂食过程抛异常也不会把普通锁悬挂
    //   - 轮喂去重：已喂过的 kami 不会被重复喂
    // ▍可调参数：
    //   无独立参数；喂食阈值、优先级等均由 autoFeedXPPotion 内部规则决定。
    // ▍相关控制台命令：
    //   feedXPPotionNow() — 立即触发一次"只喂不合成"的 XP Potion 喂食
    //   clearXPPotionFed() — 清除"已喂过"记录；想重喂已喂过的 kami，
    //                        先调它再调 feedXPPotionNow()
    // ============================================================
    /**
     * 立即触发一次 XP Potion 喂食（autoFeedXPPotion 的薄包装）
     * - 不合成 Greater XP Potion、不合成 pine_pollen（跟启动时的全流程区分）
     * - 沿用全部喂食规则：LT>70% + RESTING + Fortified优先 + 跳过杀手 + 轮喂去重
     * - 自带 TX 锁保护：紧急锁存在 / 普通锁占用时自动让路
     * - 想重喂已喂过的 kami：先 clearXPPotionFed() 再调本函数
     */
    async function feedXPPotionNow() {
        log('%c🧪 [手动] 立即触发 XP Potion 喂食（只喂不合成）', 'color: cyan; font-weight: bold;');
        if (hasEmergencyLock()) {
            log(`[TX锁] ⏸️ 紧急锁存在，feedXPPotionNow 让路（请稍后再试或先看主流程是否在停采）`);
            return;
        }
        if (!tryAcquireNormalLock('xp_potion', 'manual')) {
            log(`[TX锁] ⏸️ 普通锁被占用（主流程可能正在 XP Potion 流程或其他 tx 操作），feedXPPotionNow 让路`);
            return;
        }
        try {
            await autoFeedXPPotion();
        } finally {
            releaseNormalLock('xp_potion', 'manual');
        }
    }
    window.feedXPPotionNow = feedXPPotionNow;

    // ============================================================
    // 【板块：游戏进入检测】
    // ------------------------------------------------------------
    // ▍功能：
    //   判断页面刷新/加载后是否真正成功进入了游戏，由三个函数组成：
    //   - detectGameError()：识别两种阻止进入游戏的错误界面
    //   - hasRealKami()：判断 Party 面板里是否渲染出了真实 Kami 条目
    //   - checkGameLoaded()：综合判定"是否成功进入游戏"，并附带
    //     详细的诊断信息（details 对象），便于排查加载失败原因
    // ▍触发时机：
    //   由需要确认游戏状态的流程按需调用（如刷新后自检、重载判断）；
    //   本板块自身不含定时器。
    // ▍依赖：
    //   - DOM 元素：#wallet-connector（钱包连接弹窗）、#party / #party_button
    //     （Party 面板与按钮）、#party button img[src*="eye-"]（眼睛按钮）、
    //     div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>
    //     div:nth-of-type(2)>div（Kami 列表条目）、document.body.innerText
    //     （用于识别 "Unknown error" 文案）
    //   - window.network 接口：window.network.api / .api.player /
    //     .network.connectedAddress.value_（判断 API 与钱包地址是否就绪）
    // ▍核心流程：
    //   1) detectGameError()：
    //      a. #wallet-connector 存在且 computed display 不为 none
    //         → 返回 'Wallet Connector 认证卡住'（认证超时弹窗卡住）
    //      b. 页面正文包含 "Unknown error" → 返回 'Unknown error 界面'
    //         （游戏崩溃黑屏，该界面没有稳定 id，只能按文字内容判断）
    //      c. 都没有 → 返回 null
    //   2) checkGameLoaded()：先跑 detectGameError()，有错误界面直接判失败；
    //      没有错误时，以"有钱包地址 + player API 已就绪"作为成功标准
    //      （success = connectedAddress && playerApiExists）
    // ▍边界与保护：
    //   - 选择器稳定性：Wallet Connector 用 id 定位、Unknown error 用文字
    //     内容判断，都不依赖容易随前端改版变化的 class 名
    //   - hasRealKami() 不作为成功判据：进入游戏后若用户没点 Party 按钮
    //     展开列表，DOM 里也检测不到真实 Kami，会造成误判；因此成功
    //     标准只看钱包地址 + API，Kami 列表信息仅进 details 供诊断
    //   - document.body 可能尚未就绪，取 innerText 时用可选链兜底为 ''
    // ▍可调参数：
    //   无常量参数；判定标准全部内置于函数逻辑。
    // ▍相关控制台命令：
    //   无直接命令；结果通过调用方（如智能重载）体现。
    // ============================================================
    /**
     * 检测是否遇到了阻止进入游戏的错误界面
     *
     * 两种常见的错误情况：
     * 1. Wallet Connector 弹窗卡住（认证超时）
     * 2. Unknown error 黑屏（游戏崩溃）
     *
     * 使用稳定的元素选择器，避免依赖容易变化的 class 名：
     * - Wallet Connector: 通过 id="wallet-connector" 定位
     * - Unknown error: 通过页面文字内容判断
     *
     * @returns {string|null} 错误描述，或 null 表示没有错误
     */
    function detectGameError() {
        // 检测 "Wallet Connector" 弹窗
        // 元素结构: <div id="wallet-connector" style="display: block;">
        const walletConnector = document.querySelector('#wallet-connector');
        if (walletConnector) {
            // 检查是否可见（display 不是 none）
            const style = window.getComputedStyle(walletConnector);
            if (style.display !== 'none') {
                return 'Wallet Connector 认证卡住';
            }
        }

        // 检测 "Unknown error" 界面
        // 元素结构: <div class="...">Unknown error: 2. Can you drop this in the discord if it persists?</div>
        // 使用文字内容判断，因为没有稳定的 id
        const bodyText = document.body?.innerText || '';
        if (bodyText.includes('Unknown error')) {
            return 'Unknown error 界面';
        }

        return null;
    }

    /**
     * 检测是否有真正的 Kami（不是提示文字）
     *
     * 注意：本函数不作为"是否进入游戏"的主要判断依据，因为：
     * - 进入游戏后如果没点击 Party 按钮展开列表，DOM 里检测不到真实 Kami
     * - 但此时游戏实际上已经成功进入
     * 结果仅作为 checkGameLoaded() 的 details 诊断信息之一。
     */
    function hasRealKami() {
        const kamiList = document.querySelectorAll(
            'div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div'
        );

        return Array.from(kamiList).some(el =>
            el.querySelectorAll('*[direction="row"]').length > 0
        );
    }

    /**
     * 检测游戏是否已成功加载并进入
     * @returns {Object} { success: boolean, error: string|null, details: Object }
     *
     * 判断逻辑：
     * 1. 先检查是否有错误界面（Wallet Connector / Unknown error）
     * 2. 如果没有错误，再检查是否有钱包地址和 API
     * details 里额外收集 Party 面板 / 按钮 / Kami 列表等信息，仅供诊断。
     */
    function checkGameLoaded() {
        const kamiList = document.querySelectorAll(
            'div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div'
        );

        const details = {
            partyExists: !!document.querySelector('#party'),
            partyButtonExists: !!document.querySelector('#party_button'),
            eyeButtonExists: !!document.querySelector('#party button img[src*="eye-"]'),
            kamiListLength: kamiList.length,
            hasRealKami: hasRealKami(),
            networkExists: !!window.network,
            apiExists: !!window.network?.api,
            playerApiExists: !!window.network?.api?.player,
            connectedAddress: !!window.network?.network?.connectedAddress?.value_
        };

        // 1. 先检查是否有错误界面
        const error = detectGameError();
        if (error) {
            return { success: false, error, details };
        }

        // 2. 没有错误界面，检查是否有钱包地址和 API
        // 成功进入游戏 = 有钱包地址 + 有 API + 没有错误界面
        const success = details.connectedAddress && details.playerApiExists;

        return { success, error: null, details };
    }

    // ============================================================
    // 【板块：全局操作标记（是否正在执行停采/部署）】
    // ------------------------------------------------------------
    // ▍功能：
    //   一个全局布尔标记 window.__kamiOperationInProgress，表示当前
    //   是否有停采或部署操作正在进行中。
    // ▍触发时机：
    //   由停采/部署流程在开始时置 true、结束时置 false（写入方在
    //   对应的业务板块中）；本处只负责初始化为 false。
    // ▍依赖：
    //   - window.__kamiOperationInProgress（全局变量本身）
    //   - 读取方：定时刷新板块的 performScheduledReload()
    // ▍核心流程：
    //   1) 脚本加载时初始化为 false
    //   2) 停采/部署开始 → true；完成/失败收尾 → false
    //   3) 定时刷新前检查该标记，为 true 时延迟刷新，避免刷新
    //      打断正在发送的 TX（半途刷新可能造成状态不一致或 gas 浪费）
    // ▍边界与保护：
    //   - 若业务侧异常导致标记未复位，定时刷新板块有"最多延迟 3 次"
    //     的熔断，不会被该标记永久卡住
    // ▍可调参数：无。
    // ▍相关控制台命令：无（内部标记，不建议手动改动）。
    // ============================================================
    window.__kamiOperationInProgress = false;

    // ============================================================
    // 【板块：日志保存（刷新前落盘到下载文件夹）】
    // ------------------------------------------------------------
    // ▍功能：
    //   把内存中的日志缓冲区一次性导出为 .txt 文件并触发浏览器下载，
    //   同时在导出前结算一次 gas 统计，让结算日志也进入同一份文件。
    // ▍触发时机：
    //   - 智能重载 smartReload() 刷新前自动调用
    //   - 定时刷新 performScheduledReload() 刷新前自动调用
    //   - 用户随时手动调用 saveKamiLogs()
    // ▍依赖：
    //   - window.__kamiLogBuffer：日志缓冲区（log() 每条都会追加进去）
    //   - checkLowBalanceOnce(账户名,'end')：刷新前低余额告警检查
    //   - window.network.network.connectedAddress.value_：当前钱包地址
    //   - window.network.explorer.accounts.getByOperator(addr)：
    //     由钱包地址反查游戏账户名，用于拼进文件名
    //   - Blob + URL.createObjectURL + 隐藏 <a> 点击：触发浏览器下载
    // ▍核心流程：
    //   1) 先取账户名 accName（失败则留空，不影响后续）
    //   2) 先调 checkLowBalanceOnce()：它内部产生的告警日志会写进
    //      __kamiLogBuffer，从而和其他日志一起被导出（这就是"先检查
    //      后导出"顺序不能颠倒的原因）
    //   3) 缓冲区为空则打一条提示直接返回，不生成空文件
    //   4) 生成文件名：kami_log_<账户名>_<日期>_<时间>.txt，时间统一用
    //      配置时区的时间（默认浏览器本地，__TZ_OFFSET_MS 换算），便于多机
    //      日志按同一时区对齐
    //   5) 拼接日志内容 → Blob → 创建隐藏 <a> → click() 触发下载 →
    //      移除 <a> 并 revokeObjectURL 释放内存
    // ▍边界与保护：
    //   - 取账户名与 checkLowBalanceOnce 均用 try/catch 包裹：DOM/链上接口未就绪
    //     时静默跳过，保证日志导出本身不受影响
    //   - 账户名为空时文件名省略该段（namePart 为空字符串）
    //   - 空缓冲区直接返回，避免下载空文件
    // ▍可调参数：
    //   无常量参数；文件名格式与时区偏移（8 小时）内置于代码。
    // ▍相关控制台命令：
    //   saveKamiLogs() — 手动立即导出当前全部日志到下载文件夹
    // ============================================================
    /**
     * 保存日志到本地文件
     */
    function saveLogsBeforeReload() {
        // accName 提前获取，然后先做刷新前低余额检查（其 log 会进 buffer 一起被导出）
        let accName = '';
        try {
            const addr = window.network?.network?.connectedAddress?.value_;
            if (addr) {
                const acc = window.network.explorer.accounts.getByOperator(addr);
                accName = acc?.name || '';
            }
        } catch {}
        try { checkLowBalanceOnce(accName || '(unknown)', 'end'); } catch {}

        const logs = window.__kamiLogBuffer || [];
        if (logs.length === 0) {
            log('📝 [日志保存] 无日志需要保存');
            return;
        }
        const namePart = accName ? `_${accName}` : '';

        // 生成文件名：kami_log_<账户名>_<日期>_<时间>.txt
        const now = new Date();
        const beijingTime = new Date(now.getTime() + __TZ_OFFSET_MS);  // 换算为配置时区（默认浏览器本地）
        const dateStr = beijingTime.toISOString().slice(0, 10);  // 日期部分，格式 YYYY-MM-DD
        const timeStr = beijingTime.toISOString().slice(11, 19).replace(/:/g, '-');  // 时间部分，冒号换成连字符，格式 HH-MM-SS
        const filename = `kami_log${namePart}_${dateStr}_${timeStr}.txt`;

        // 创建文件内容
        const content = logs.join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

        // 触发下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        log(`%c📁 [日志保存] 已保存 ${logs.length} 条日志到: 下载文件夹/${filename}`, 'color: #00ff00; font-weight: bold;');
    }

    // 暴露手动保存命令
    window.saveKamiLogs = saveLogsBeforeReload;

    // ============================================================
    // 【板块：控制台命令统一打"手动调用"标记】
    // ------------------------------------------------------------
    // ▍功能：
    //   把面向用户的控制台命令统一用 wrapManual() 包一层，调用时在
    //   日志中标记"这是手动触发"，方便事后从日志区分自动流程与人工
    //   操作（排查问题时非常关键）。
    // ▍触发时机：
    //   脚本加载时执行一次，对下方列表中已定义的全局函数原地替换。
    // ▍依赖：
    //   - wrapManual(name, fn)：包装器，由前文定义
    //   - window 上已挂载的各控制台命令函数
    // ▍核心流程：
    //   1) 遍历命令名列表
    //   2) 仅当 window[name] 确实是函数时才替换（typeof 检查，避免
    //      因个别命令未定义而报错）
    //   3) 用 wrapManual 包装后写回 window[name]
    // ▍边界与保护：
    //   - typeof 检查容错：命令不存在时静默跳过
    //   - 两个入口刻意不包装：
    //     a. kamiDebugOn / kamiDebugOff —— 内部有 location.reload 副作用，
    //        包装标记在刷新后不稳定
    //     b. waitForEmergencyRelease —— 是给辅助脚本调用的 API，
    //        不属于"用户手动命令"
    // ▍可调参数：
    //   命令名列表本身即配置项；新增控制台命令时把名字加进列表即可。
    // ▍相关控制台命令：
    //   列表中全部命令（emergencyStopHarvest、stopCurrentRoom、
    //   setKamiMode、getKamiMode、clearBlockedKamis、clearStopBlockedKamis、
    //   showStopBlockedKamis、showBlockedKamis、clearFeedFails、
    //   clearStarvingStuck、showGasRules、clearXPPotionFed、
    //   clearFortifiedFed、saveKamiLogs、showGasReport、showMyKillers）
    //   ——功能不变，仅增加手动标记。
    // ============================================================
    [
        'emergencyStopHarvest',
        'stopCurrentRoom',
        'setKamiMode',
        'getKamiMode',
        'clearBlockedKamis',
        'clearStopBlockedKamis',
        'showStopBlockedKamis',
        'showBlockedKamis',
        'clearFeedFails',
        'clearStarvingStuck',
        'showGasRules',
        'clearXPPotionFed',
        'clearFortifiedFed',
        'saveKamiLogs',
        'showGasReport',
        'showMyKillers',
    ].forEach(name => {
        if (typeof window[name] === 'function') {
            window[name] = wrapManual(name, window[name]);
        }
    });

    // ============================================================
    // 【板块：智能重载 smartReload（连续失败自动清缓存）】
    // ------------------------------------------------------------
    // ▍功能：
    //   带"失败计数"的页面刷新：普通情况只刷新；连续第 2 次仍需重载
    //   时，判定为本地 ECS 缓存损坏（典型表现是白屏），先删除
    //   IndexedDB 里的 ECSCache-* 缓存库再刷新，迫使游戏客户端从链上
    //   全量重新同步状态。
    // ▍触发时机：
    //   由检测到异常（游戏未成功进入、界面报错等）的流程调用，
    //   传入 reason 说明重载原因；不是定时器。
    // ▍依赖：
    //   - localStorage key：kami_reload_count —— 跨刷新的重载次数计数器
    //   - IndexedDB：名字以 "ECSCache-" 开头的数据库（游戏客户端的
    //     ECS 状态缓存），通过 indexedDB.databases() 枚举后删除
    //   - saveLogsBeforeReload()：刷新前先把日志落盘
    // ▍核心流程：
    //   1) 先保存日志（刷新后内存日志会丢失）
    //   2) 读取 kami_reload_count 并 +1
    //   3) 若累计 >= 2：清 ECSCache-* → 计数归零 → 1.5 秒后刷新
    //      （多给 0.5 秒，让 IndexedDB 删除请求和日志下载有时间完成）
    //   4) 否则：写回新计数 → 1 秒后刷新（1 秒是留给日志文件下载的时间）
    // ▍边界与保护：
    //   - 环境不支持 indexedDB.databases()（旧内核）时跳过清缓存，
    //     只做普通刷新，不抛错
    //   - 计数达到阈值后立刻归零，避免下次正常刷新也误触发清缓存
    //   - 成功进入游戏的正常流程应把 kami_reload_count 复位，
    //     防止偶发失败累计误伤
    // ▍可调参数：
    //   - 阈值 2（nextCount >= 2）—— 连续几次重载后清缓存；调大则更
    //     保守（多试几次普通刷新），调小则更激进（更早全量重同步，
    //     重同步耗时较长）
    //   - 1500 / 1000（毫秒）—— 刷新前等待时间；过短可能导致日志
    //     下载或 IndexedDB 删除未完成
    // ▍相关控制台命令：
    //   无直接命令；可手动执行 localStorage.removeItem('kami_reload_count')
    //   重置计数。
    // ============================================================
    function smartReload(reason = '未知原因') {
        // 刷新前保存日志
        saveLogsBeforeReload();

        const reloadCountKey = 'kami_reload_count';
        const count = parseInt(localStorage.getItem(reloadCountKey)) || 0;  // 无记录时按 0 处理
        const nextCount = count + 1;

        log(`🔁 [智能重载] 第 ${nextCount} 次尝试重载（原因：${reason}）`);

        if (nextCount >= 2) {
            log('🧨 [白屏保护] 已达到第 2 次重载，将清除 IndexedDB 中的 ECSCache-* 缓存');

            if (!indexedDB.databases) {
                // 旧内核不支持枚举数据库，无法定位 ECSCache-*，退化为普通刷新
                log('⚠️ 当前环境不支持 indexedDB.databases()，跳过清除');
            } else {
                indexedDB.databases().then(dbs => {
                    // 只删游戏 ECS 缓存库，不碰其他站点数据
                    const targets = dbs.filter(db => db.name?.startsWith('ECSCache-'));
                    for (const db of targets) {
                        indexedDB.deleteDatabase(db.name);
                        log(`🗑️ 已请求删除 IndexedDB：${db.name}`);
                    }
                });
            }

            localStorage.setItem(reloadCountKey, '0');  // 清缓存后计数归零，避免下次误触发
            setTimeout(() => location.reload(), 1500);  // 1.5 秒后刷新，留时间给删除请求与日志下载
        } else {
            localStorage.setItem(reloadCountKey, String(nextCount));
            setTimeout(() => location.reload(), 1000);  // 等待1秒让下载完成
        }
    }

    // ============================================================
    // 【板块：防断连模拟鼠标操作（idle keep-alive）】
    // ------------------------------------------------------------
    // ▍功能：
    //   长时间无人操作时，周期性向页面派发一组合成鼠标事件，让游戏
    //   客户端认为用户仍在活动，避免因 idle 被判定离线/断开连接。
    // ▍触发时机：
    //   由启动主流程调用 initIdleKeepAlive() 后常驻运行（内部是一个
    //   永不退出的 async 循环）。
    // ▍依赖：
    //   - window 的 mousemove / click 事件监听（记录真实鼠标活动时间）
    //   - document.elementFromPoint()：定位点击目标元素
    //   - delay() / getRandomDelayMs()：等待与随机抖动工具函数
    // ▍核心流程：
    //   1) 注册 mousemove / click 监听，任何真实鼠标活动都刷新
    //      lastMouseActivity 时间戳
    //   2) idleLoop 无限循环：每轮等待 60 秒 + getRandomDelayMs(1)
    //      的随机抖动（随机化间隔，行为更接近真人）
    //   3) 醒来后判断：距上次真实鼠标活动超过 60 秒才执行模拟，
    //      否则跳过（真人在用时不干扰）
    //   4) 模拟动作：在屏幕左下角 (10, innerHeight-10) 处按顺序派发
    //      mousemove → mousedown → mouseup → click 四个事件，目标元素
    //      取该坐标处的元素，取不到则退回 document.body
    // ▍边界与保护：
    //   - 点击位置固定在左下角空白处，避免误点游戏内按钮
    //   - 日志限流：__idleSimCount 计数，仅首次 + 每满 10 次打 1 条，
    //     防止每分钟 1 条把日志缓冲区刷满
    //   - 事件 bubbles/cancelable 均为 true，保证游戏的事件监听能收到
    // ▍可调参数：
    //   - 循环基础间隔 60 * 1000 毫秒 —— 调小模拟更频繁（更保险但
    //     日志更多），调大则 idle 判定风险上升
    //   - idle 判定阈值 60 * 1000 毫秒 —— 距真实活动多久才开始模拟
    //   - 限流步长 10（% 10 === 0）—— 每多少次模拟记 1 条日志
    // ▍相关控制台命令：无。
    // ============================================================
    function initIdleKeepAlive() {
        let lastMouseActivity = Date.now();

        // 真实鼠标活动 → 刷新时间戳（供 idle 判定）
        // isTrusted 守卫：忽略 C7/本模块合成事件，两套保活各自独立判"真人"
        window.addEventListener('mousemove', (e) => { if (!e.isTrusted) return; lastMouseActivity = Date.now(); });
        window.addEventListener('click', (e) => { if (!e.isTrusted) return; lastMouseActivity = Date.now(); });

        let __idleSimCount = 0;  // 日志限流计数：累计模拟次数
        function simulateIdleMouseAction() {
            // 固定点屏幕左下角空白处，避免误点游戏内按钮
            const x = 10;
            const y = window.innerHeight - 10;
            const target = document.elementFromPoint(x, y) || document.body;  // 取不到元素时退回 body
            const eventOptions = { bubbles: true, cancelable: true, clientX: x, clientY: y };

            // 按真实点击的事件顺序派发一整组鼠标事件
            target.dispatchEvent(new MouseEvent('mousemove', eventOptions));
            target.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            target.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            target.dispatchEvent(new MouseEvent('click', eventOptions));

            // 日志限流：首次 + 每 10 次打 1 条，避免每分钟 1 条刷满日志缓冲区
            __idleSimCount++;
            if (__idleSimCount === 1 || __idleSimCount % 10 === 0) {
                log(`💻 [防断连] 模拟点击屏幕左下角 (${x}, ${y})（累计 ${__idleSimCount} 次，每 10 次记 1 条）`);
            }
        }

        async function idleLoop() {
            while (true) {
                // 每轮约 60 秒 + 随机抖动，间隔不完全固定，行为更接近真人
                const interval = 60 * 1000 + getRandomDelayMs(1);
                await delay(interval);

                const now = Date.now();
                if (now - lastMouseActivity > 60 * 1000) {
                    // 超过 60 秒无真实鼠标活动 → 执行模拟
                    simulateIdleMouseAction();
                } else {
                    log('🟢 [防断连] 有鼠标活动，跳过模拟');
                }
            }
        }

        idleLoop();
        log('🌀 [防断连] 已启动 idle 模拟机制');
    }

    // ============================================================
    // 🔻SYNC→内部版[1.1.22 活动保活] 【板块：人化活动模拟保活（对照实验·真人让路）】
    // ------------------------------------------------------------
    // ▍背景：0710 CZ 组件同步滞后风暴时 hidden=false/WS 正常/区块流正常——嫌疑集中在
    //   app 级"无操作降速"。本模块模拟真人活动做对照实验：风暴消失=坐实并保留，无效=下轮撤。
    // ▍行为（用户 0710 实测定稿）：
    //   1) 真人让路：监听 isTrusted 的 mousedown/keydown/wheel/mousemove/pointerdown，
    //      3 分钟内有真人操作 → 本轮扫掠/合成事件全部跳过（不打扰玩家，也不污染实验）；
    //   2) 每 ~75s：合成 mousemove（随机坐标，isTrusted=false）；
    //   3) 每 ~5 分钟：人化全程扫掠——先点一次白名单锚点(HP文本/状态图标,非随机)（用户实测无副作用），
    //      再小步(250~420px)随机停顿(300~700ms)偶尔驻足(12%概率1.5s)滚到底→回顶→回原位，约 20s；
    //      紧急锁持有期间顺延；上一轮扫掠未结束不重入。
    // ▍开关：localStorage 'kami_keepalive'==='off' 禁用；window.setKeepAlive('on'|'off')。默认 on。
    // ▍日志：启动一条说明；每小时一条汇总。全 try/catch，异常静默跳过，绝不影响业务，零 tx。
    // ============================================================
    (function initHumanlikeKeepAlive() {
        try {
            const REAL_IDLE_MS = 3 * 60 * 1000;      // 真人3分钟内活动过 → 让路
            const MOVE_BASE_MS = 75000;              // 合成 mousemove 周期 ~75s
            const SWEEP_BASE_MS = 5 * 60 * 1000;     // 全程扫掠周期 ~5min
            let __lastRealActivity = 0;
            let __sweepRunning = false;
            let __statMove = 0, __statSweep = 0, __statYield = 0, __lastReport = Date.now();
            let __keepaliveNoTarget = 0;   // 保活点击 fail-closed(两锚点都没认到)次数,供小时汇报排障

            const _kaOn = () => { try { return localStorage.getItem('kami_keepalive') !== 'off'; } catch (e) { return true; } };
            window.setKeepAlive = function (v) {
                if (v !== 'on' && v !== 'off') { console.log("用法: setKeepAlive('on'|'off') 当前=" + (_kaOn() ? 'on' : 'off')); return; }
                try { localStorage.setItem('kami_keepalive', v); } catch (e) {}
                console.log(`✅ 活动保活已切为 ${v}`);
            };
            // 真人活动监听（capture+passive，isTrusted 才算）
            for (const ev of ['mousedown', 'keydown', 'wheel', 'mousemove', 'pointerdown', 'touchstart']) {
                try { window.addEventListener(ev, e => { if (e.isTrusted) __lastRealActivity = Date.now(); }, { capture: true, passive: true }); } catch (e) {}
            }
            const _humanActive = () => (Date.now() - __lastRealActivity) < REAL_IDLE_MS;
            const rnd = (a, b) => a + Math.random() * (b - a);
            const pause = ms => new Promise(r => setTimeout(r, ms));
            function _findScroller() {
                const cards = document.querySelectorAll('div#party>div>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(2)>div');
                if (!cards.length) return { sc: null, cards };
                let el = cards[0];
                while (el && el !== document.body) {
                    if (el.scrollHeight > el.clientHeight + 10) return { sc: el, cards };
                    el = el.parentElement;
                }
                return { sc: null, cards };
            }
            // 🔻SYNC→内部版[1.2.3 保活点击锚定安全元素] ⚠️ 真钱教训：游戏是像素风 styled-component UI，
            //   feed/停采等操作按钮都是**纯 div**（无 button/a/role），旧版"排除 button/a 后随机点 div"会把
            //   真按钮当"安全"点中→点开喂食菜单→下轮再随机点中食物项→误喂 Half Heart/Cleaning Fluid 等（真钱损失）。
            //   改为**白名单式锚定**，只点用户确认的两处纯展示元素（都在 HP 那一行内，非操作区）：
            //     主锚点：HP 文本叶子节点（形如 "156/230 (68%)"，整段全等，纯文本 display）；
            //     备用：状态图标 img[src*="/assets/kami_"]（纯展示图，其后紧跟 HP 文本；优先采集中的 kami_harvesting）。
            //   两者都认不到 → fail-closed 本轮不点。⚠️ dispatchEvent bubbles:true 会冒泡，closest 只挡语义祖先、
            //   挡不住 React 根委托——但这两处的祖先是卡片行(选中级,无 tx),不含 feed 按钮,误喂链已断(grok 审确认)。
            const _HP_RE = /^\s*\d+\s*\/\s*\d+\s*\(\s*\d+\s*%\s*\)\s*$/;   // 整段全等，防含此格式子串的别的元素误入
            function _pickKeepaliveTargets(cards) {
                const hp = [], icon = [];
                for (const card of cards) {
                    // 主：HP 文本叶子（纯文本节点，整段就是 HP）
                    for (const n of card.querySelectorAll('div,span')) {
                        if (n.children.length === 0 && _HP_RE.test((n.textContent || '').trim())
                            && n.offsetWidth > 5 && n.offsetHeight > 5) hp.push(n);
                    }
                    // 备用：状态图标 img（优先采集中）
                    const img = card.querySelector('img[src*="/assets/kami_harvesting"]')
                              || card.querySelector('img[src*="/assets/kami_"]');
                    if (img && img.offsetWidth > 3 && img.offsetHeight > 3) icon.push(img);
                }
                return { hp, icon };
            }
            function _safeClick(cards) {
                try {
                    const { hp, icon } = _pickKeepaliveTargets(cards);
                    const pool = hp.length ? hp : icon;      // 主锚点优先；主认不到才用备用状态图标
                    if (pool.length === 0) { __keepaliveNoTarget++; return; }   // fail-closed：两处都没有，本轮不点
                    const t = pool[Math.floor(Math.random() * pool.length)];
                    if (t.closest('button,a,[role=button],[onclick]')) return;   // 语义按钮兜底（挡不住 React 委托，见块注释）
                    const r = t.getBoundingClientRect();
                    const opt = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
                    t.dispatchEvent(new MouseEvent('mousedown', opt));
                    t.dispatchEvent(new MouseEvent('mouseup', opt));
                    t.dispatchEvent(new MouseEvent('click', opt));
                } catch (e) {}
            }
            async function _sweep() {
                if (__sweepRunning) return;
                __sweepRunning = true;
                try {
                    const { sc, cards } = _findScroller();
                    if (!sc) return;
                    _safeClick(cards);
                    const origin = sc.scrollTop;
                    const maxTop = () => sc.scrollHeight - sc.clientHeight;
                    let guard = 0;
                    while (sc.scrollTop < maxTop() - 5 && guard++ < 120) {
                        sc.scrollTop = Math.min(sc.scrollTop + rnd(250, 420), maxTop());
                        await pause(rnd(300, 700));
                        if (Math.random() < 0.12) await pause(1500);
                        if (_humanActive()) { sc.scrollTop = origin; __statYield++; return; }   // 扫掠中真人来了→立即还原让路
                    }
                    await pause(rnd(800, 1500));
                    guard = 0;
                    while (sc.scrollTop > 5 && guard++ < 120) {
                        sc.scrollTop = Math.max(sc.scrollTop - rnd(250, 420), 0);
                        await pause(rnd(300, 700));
                        if (Math.random() < 0.12) await pause(1500);
                        if (_humanActive()) { sc.scrollTop = origin; __statYield++; return; }
                    }
                    sc.scrollTop = origin;
                    __statSweep++;
                } catch (e) {} finally { __sweepRunning = false; }
            }
            function _tickMove() {
                try {
                    if (_kaOn() && !_humanActive()) {
                        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 + Math.random() * 600, clientY: 100 + Math.random() * 400 }));
                        __statMove++;
                    } else if (_kaOn()) { __statYield++; }
                    if (Date.now() - __lastReport >= 3600000) {
                        __lastReport = Date.now();
                        log(`🖱️ [保活] 近1小时: mousemove=${__statMove} 全程扫掠=${__statSweep} 真人让路=${__statYield} 点击无锚点=${__keepaliveNoTarget}`);
                        __statMove = 0; __statSweep = 0; __statYield = 0; __keepaliveNoTarget = 0;
                    }
                } catch (e) {}
                setTimeout(_tickMove, MOVE_BASE_MS + Math.random() * 15000);
            }
            function _tickSweep() {
                try {
                    const lockHeld = (typeof window.__txEmergencyLock !== 'undefined' && window.__txEmergencyLock);
                    if (_kaOn() && !_humanActive() && !lockHeld) { _sweep(); }
                    else if (_kaOn()) { __statYield++; }
                } catch (e) {}
                setTimeout(_tickSweep, SWEEP_BASE_MS + Math.random() * 60000);
            }
            setTimeout(_tickMove, 45000);
            setTimeout(_tickSweep, 90000);
            log(`🖱️ [保活] 人化活动模拟已启动（75s合成mousemove + 5min人化全程扫掠；真人操作3分钟内自动让路；关闭: setKeepAlive('off')）`);
        } catch (e) {}
    })();

    // ============================================================
    // 【板块：页面加载状态检测（启动前自检 + 自动刷新兜底）】
    // ------------------------------------------------------------
    // ▍功能：
    //   在主流程启动前确认页面处于"可自动化"状态，由两个函数组成：
    //   - isPageFullyLoaded()：按 4 项检查判断页面是否完全加载
    //   - checkAndRefreshIfNeeded()：未加载完成时等待随机 10-20 秒后
    //     自动刷新页面，从头再来
    // ▍触发时机：
    //   启动主流程的初始延迟结束后调用一次；也可被其他流程按需复用。
    // ▍依赖：
    //   - DOM 元素：#wallet-connector（钱包连接弹窗）、#account-registrar
    //     （账户注册弹窗）、#party 下所有子元素（查 Kamiless 提示）、
    //     document.body.innerText（查 Unknown error 文案）
    //   - delay()：等待工具函数；location.reload()：刷新
    // ▍核心流程（isPageFullyLoaded 依次做 4 项检查，任一命中即未就绪）：
    //   1) #wallet-connector 可见（内联 style.display 不为 none）
    //      → 钱包还在连接中
    //   2) #account-registrar 可见 → 当前账户尚未注册，需要人工处理
    //   3) 页面正文包含 "Unknown error" → 游戏崩溃界面
    //   4) #party 内存在可见的 "You are Kamiless" 提示 → 账户名下
    //      没有 kami（或列表未正确加载）；可见性判断除元素自身外还
    //      沿父链逐级向上检查 display/visibility，直到 body 为止，
    //      因为游戏会把该提示隐藏保留在 DOM 中，只查自身会误判
    // ▍核心流程（checkAndRefreshIfNeeded）：
    //   1) 调 isPageFullyLoaded()，已就绪则返回 true 放行
    //   2) 未就绪：等待 10000 + random*10000 毫秒（10-20 秒随机，
    //     错开多账户同时刷新的时间点）后 location.reload()
    //   3) 返回 false（刷新后本页脚本终止，调用方据此中断后续启动）
    // ▍边界与保护：
    //   - 检查 1/2 用内联 style.display 判断，检查 4 用 computedStyle，
    //     分别对应两类弹窗各自的显隐实现方式
    //   - Kamiless 父链检查防止把"隐藏的提示文字"误判为未加载
    //   - 刷新前有明确日志与等待时长提示，便于回看
    // ▍可调参数：
    //   - 10000 + random*10000 毫秒 —— 刷新前等待窗口；调大更从容
    //     但恢复更慢，调小恢复快但多账户可能同时刷新
    // ▍相关控制台命令：无。
    // ============================================================
    function isPageFullyLoaded() {
        // 1. 检查 wallet-connector 是否可见（钱包连接中）
        const walletConnector = document.querySelector('#wallet-connector');
        if (walletConnector && walletConnector.style.display !== 'none') {
            return { loaded: false, reason: 'Wallet Connector 仍在显示，钱包连接中...' };
        }

        // 2. 检查 account-registrar 是否可见（需要注册账户）
        const accountRegistrar = document.querySelector('#account-registrar');
        if (accountRegistrar && accountRegistrar.style.display !== 'none') {
            return { loaded: false, reason: 'Account Registrar 显示中，需要注册账户' };
        }

        // 3. 检查是否有 Unknown error 提示
        if (document.body?.innerText?.includes('Unknown error')) {
            return { loaded: false, reason: '页面出现 Unknown error 错误' };
        }

        // 4. 检查是否有可见的 Kamiless 提示（隐藏的不算）
        const kamilessElements = document.querySelectorAll('#party *');
        for (const el of kamilessElements) {
            if (el.textContent?.includes('You are Kamiless')) {
                // 检查元素及其父元素是否可见
                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    // 再检查父元素
                    let parent = el.parentElement;
                    let isVisible = true;
                    while (parent && parent !== document.body) {
                        const parentStyle = window.getComputedStyle(parent);
                        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
                            isVisible = false;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    if (isVisible) {
                        return { loaded: false, reason: '页面显示 You are Kamiless' };
                    }
                }
            }
        }

        return { loaded: true, reason: '' };
    }

    async function checkAndRefreshIfNeeded() {
        const status = isPageFullyLoaded();
        if (!status.loaded) {
            const waitTime = 10000 + Math.floor(Math.random() * 10000); // 10-20秒随机
            log(`%c⚠️ [页面检测] ${status.reason}`, 'color: orange; font-weight: bold;');
            log(`%c🔄 将在 ${(waitTime/1000).toFixed(1)} 秒后自动刷新页面...`, 'color: orange;');
            await delay(waitTime);
            log(`🔄 [页面检测] 执行刷新...`);
            location.reload();
            return false; // 不会执行到这里，但保持逻辑完整
        }
        return true;
    }

    // ============================================================
    // 【板块：启动主流程（各模块的启动顺序与依赖）】
    // ------------------------------------------------------------
    // ▍功能：
    //   脚本的总入口：等待页面充分加载后，按固定顺序把各常驻模块
    //   依次拉起。
    // ▍触发时机：
    //   脚本注入后立即排定：initialDelay = 120 秒 + getRandomDelayMs(30/60)
    //   的随机抖动（约半分钟级），随机化是为了多账户/多标签页错峰启动。
    //   等待期间每秒 tick 一次，剩余秒数逢 10 的倍数或最后 10 秒逐秒
    //   打印倒计时，方便确认脚本存活。
    // ▍依赖：
    //   - checkAndRefreshIfNeeded()：启动前页面自检（本文件上方板块）
    //   - syncKamiDb()：本地 kami 数据库增量同步
    //   - initIdleKeepAlive()：防断连模拟（本文件上方板块）
    //   - startMyKamiDeathMonitor() / autoScavenge() /
    //     startSequenceAfterDelay() / autoXPPotionFlow()：
    //     各业务模块入口（定义在前文对应板块）
    // ▍核心流程（严格按此顺序执行）：
    //   1) 倒计时结束，清掉倒计时定时器
    //   2) 页面自检 checkAndRefreshIfNeeded()：未就绪则触发刷新并
    //      return，后续模块一律不启动（刷新后从头再来）
    //   3) syncKamiDb()：DB 增量自愈，补全账户新入手的 kami。放在
    //      所有业务模块之前，保证它们启动时本地数据已是全的；账户
    //      无变化时 0 新增 + 0 额外 API 调用，几乎无开销
    //   4) initIdleKeepAlive()：防断连常驻循环，最先拉起，保证后续
    //      长时间运行不掉线
    //   5) startMyKamiDeathMonitor()：自己 kami 的死亡监控（基于 API
    //      检测），先于部署流程启动，部署后一旦被杀能立刻发现
    //   6) autoScavenge()：自动 scavenge 领取流程
    //   7) startSequenceAfterDelay()：核心的自动部署/停采主循环
    //   8) autoXPPotionFlow()：XP 药水全流程（合成 + 喂食）
    //   注：kami 被喂食（Feed）监控不在本脚本内启动，由配套的
    //   轻量杀手监控脚本负责，两个脚本需配合运行。
    // ▍边界与保护：
    //   - 页面未就绪时整条启动链中断，靠刷新重来，绝不带病启动
    //   - syncKamiDb 外层再包一层 try/catch（其内部也 catch 了所有
    //     异常），同步失败只打日志，不阻塞主流程
    // ▍可调参数：
    //   - initialDelay 基础值 120 * 1000 毫秒 —— 启动前等待；调小
    //     启动快但页面可能未加载完，调大更稳但采集开始更晚
    //   - getRandomDelayMs(30 / 60) —— 随机抖动幅度（参数按分钟计）
    //   - 倒计时打印规则：secondsLeft % 10 === 0 或 <= 10 时打印
    // ▍相关控制台命令：无（自动执行）。
    // ============================================================
    const initialDelay = 120 * 1000 + getRandomDelayMs(30 / 60);  // 120 秒 + 随机抖动，错峰启动
    const startTimestamp = Date.now();
    const endTimestamp = startTimestamp + initialDelay;

    log(`🕒 启动自动化部署/停止采集主流程前等待网页充分加载：等待 ${(initialDelay / 1000).toFixed(1)} 秒...`);

    // 启动倒计时：每秒 tick 一次，逢 10 的倍数或最后 10 秒打印剩余时间
    const intervalId = setInterval(() => {
        const remaining = Math.max(0, endTimestamp - Date.now());
        const secondsLeft = Math.ceil(remaining / 1000);

        if (secondsLeft <= 0) {
            clearInterval(intervalId);
            return;
        }

        if (secondsLeft % 10 === 0 || secondsLeft <= 10) {
            log(`⌛ 剩余 ${secondsLeft} 秒后启动自动化部署/停止采集主流程，请耐心等待...`);
        }
    }, 1000);

    setTimeout(async () => {
        clearInterval(intervalId);

        // 检测页面是否完全加载
        log('🔍 [页面检测] 正在检查页面加载状态...');
        const pageReady = await checkAndRefreshIfNeeded();
        if (!pageReady) return; // 如果需要刷新，后续代码不会执行

        log('✅ [页面检测] 页面已完全加载，继续启动...');

        // DB 增量自愈：启动业务模块前先补全账户新入手的 kami
        // - 账户无变化时 0 新增 + 0 额外 API 调用，几乎无开销
        // - 失败不阻塞主流程（syncKamiDb 内部已 catch 所有异常，这里再兜一层）
        try {
            await syncKamiDb();
        } catch (e) {
            log(`⚠️ [DB增量] 同步异常（不影响主流程）: ${e?.message || e}`);
        }

        log('🚀 启动自动化部署/采集...');
        initIdleKeepAlive();  // 防断连模拟，最先拉起
        // Feed（被喂食）监控由配套的轻量杀手监控脚本负责，本脚本不启动
        // 启动自己 kami 死亡监控（基于 API 检测），先于部署流程
        startMyKamiDeathMonitor();
        autoScavenge();  // 自动 scavenge 领取
        startSequenceAfterDelay();  // 核心：自动部署/停采主循环
        autoXPPotionFlow();  // XP 药水全流程（合成 + 喂食）
    }, initialDelay);

    // ============================================================
    // 【板块：定时刷新（每 45 分钟 + 随机 0-5 分钟）】
    // ------------------------------------------------------------
    // ▍功能：
    //   每运行约 45 分钟 + 随机 0-5 分钟就整页刷新一次。长时间不刷新
    //   会积累内存泄漏、WebSocket 断连、状态漂移等问题，定期刷新让
    //   页面回到干净状态；随机量用于多账户错峰。
    // ▍触发时机：
    //   脚本注入时排定一次 setTimeout(performScheduledReload,
    //   totalDelayMs)；刷新后脚本重新注入，等于自动续期。
    // ▍依赖：
    //   - window.__kamiOperationInProgress：全局操作标记（上方板块），
    //     判断当前是否有停采/部署正在进行
    //   - saveLogsBeforeReload()：刷新前把日志落盘
    //   - getRandomDelayMs(5)：随机附加延迟
    // ▍核心流程：
    //   1) 到点执行 performScheduledReload()
    //   2) 若有操作进行中且延迟次数未达上限：延迟计数 +1，打日志，
    //      3 分钟后重试本函数（不打断正在发送的 TX）
    //   3) 若延迟已达上限（3 次 × 3 分钟 = 9 分钟）但操作标记仍为
    //      true：打红色警告并强制刷新——防止操作标记因异常未复位
    //      导致刷新被无限延迟
    //   4) 刷新前先 saveLogsBeforeReload() 保存日志
    //   5) 再等 1 秒（给日志文件下载留时间）后 location.reload()
    // ▍边界与保护：
    //   - 操作让路：正在停采/部署时不硬刷，先延迟
    //   - 延迟熔断：最多延迟 __RELOAD_MAX_DELAYS 次，防无限延迟
    //   - 日志兜底：任何路径的刷新前都先落盘日志
    // ▍可调参数：
    //   - baseMinutes = 45 —— 基础刷新周期（分钟）；调小更"干净"但
    //     刷新期间自动化短暂中断更频繁，调大则内存/断连风险上升
    //   - getRandomDelayMs(5) —— 随机附加量（0-5 分钟），错峰用
    //   - __RELOAD_MAX_DELAYS = 3 —— 最多延迟次数；调大给长操作更多
    //     让路时间，调小则刷新更守时
    //   - __RELOAD_DELAY_MS = 3 * 60 * 1000 —— 每次延迟时长（3 分钟）
    //   - 刷新前固定等待 1000 毫秒 —— 让日志下载完成
    // ▍相关控制台命令：无（自动执行）。
    // ============================================================
    const baseMinutes = 45;  // 基础刷新周期（分钟）
    const totalDelayMs = (baseMinutes * 60 * 1000) + getRandomDelayMs(5);  // 45 分钟 + 随机附加量

    log(`⏳ 页面将在 ${(totalDelayMs / 60000).toFixed(1)} 分钟后刷新...`);

    /**
     * 定时强制刷新函数
     * 如果当前有正在进行的停采/部署操作，则延迟 3 分钟再刷新；
     * 最多延迟 3 次（共 9 分钟），超过后强制刷新以防止无限延迟。
     */
    let __reloadDelayCount = 0;
    const __RELOAD_MAX_DELAYS = 3;   // 最多延迟3次
    const __RELOAD_DELAY_MS = 3 * 60 * 1000;  // 每次延迟3分钟
    function performScheduledReload() {
        // 有操作进行中且还有延迟额度 → 让路，3 分钟后再试
        if (window.__kamiOperationInProgress && __reloadDelayCount < __RELOAD_MAX_DELAYS) {
            __reloadDelayCount++;
            log(`%c⏸️ [强制刷新] 检测到有正在进行的操作，延迟 3 分钟后再刷新...（第 ${__reloadDelayCount}/${__RELOAD_MAX_DELAYS} 次延迟）`,
                'color: orange; font-weight: bold;');
            setTimeout(performScheduledReload, __RELOAD_DELAY_MS);
            return;
        }

        // 延迟额度用尽但操作标记仍在 → 强制刷新（防标记异常未复位导致无限延迟）
        if (window.__kamiOperationInProgress) {
            log(`%c⚠️ [强制刷新] 已达到最大延迟次数（${__RELOAD_MAX_DELAYS}次 × 3分钟 = ${__RELOAD_MAX_DELAYS * 3}分钟），强制刷新！`,
                'color: red; font-weight: bold;');
        }

        // 刷新前保存日志
        saveLogsBeforeReload();

        log(`🔄 [强制刷新] 执行定时刷新...`);
        setTimeout(() => location.reload(), 1000);  // 等待1秒让下载完成
    }

    setTimeout(performScheduledReload, totalDelayMs);  // 排定定时刷新；刷新后脚本重新注入，自动续期


})();
