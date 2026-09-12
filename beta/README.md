# 测试版（beta）—— 维护者自用的测试线

> # ⛔ 普通用户请勿安装
>
> 这个目录里的四个脚本装的是**还没经过实盘验证**的改动。它们会先在维护者自己的
> 一个账户上跑几天，确认不出事，才合并进主线发给大家。
>
> **你要装的是主线：** https://github.com/funcreator2030/kamigotchi-scripts
>
> 装这里的东西意味着你自愿替别人踩坑，而且这些脚本会**代替你发送真实链上交易、
> 消耗真实的 gas**。出了问题没有回滚保险。

---

## 装之前必须知道的两件事

### ① 先把主线的同类脚本停用

beta 和主线的 `@name` 不一样，篡改猴把它们当成**两个互不相干的脚本**，
可以同时装上、同时运行。真跑起来就是：

- 双份自动部署、双份停采、双份喂食 —— 同一件事发两遍交易
- 两条通道各管各的 nonce，互相抢号，轻则白烧 gas，重则把真正要发的交易挤掉

所以装 beta 之前，请在篡改猴面板里把下面四个**停用**（停用即可，不用删，回退还要用）：

```
Kamigotchi核心脚本-公开版 (core)
Kamigotchi辅助脚本-公开版 (helper)
Kamigotchi精简数据库-公开版 (database)
Kamigotchi轻量杀手监控-公开版 (killer monitor)
```

> 核心脚本里有一道单实例守卫，但**它拦不住这个组合** —— 守卫只有 beta 有，
> 主线没有，所以主线那个不会举旗也不会看旗，两个照样一起跑。
> 手动停用不是可选项。

### ② 四件套要一起换

beta 的核心会用到 beta 辅助里才有的函数。混装（beta 核心 + 主线辅助）不会崩，
但相关功能会打一条 ⚠️ 日志然后降级 —— 等于白装。四个一起换。

---

## 安装链接

先装 [Tampermonkey](https://www.tampermonkey.net/)，再打开 Chrome 的「允许用户脚本」
（`chrome://extensions` → 篡改猴 → 详情 → 允许用户脚本；新版 Chrome 可能叫「开发者模式」）。
**这一步最容易漏，漏了脚本装上也不会运行。**

然后逐个点开下面的链接，篡改猴会自动弹安装页：

| 脚本 | 版本 | 安装链接（点开即装） |
|---|---|---|
| Kamigotchi核心脚本-测试版 (core BETA) | `1.2.44` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/beta/kamigotchi-core-beta.user.js |
| Kamigotchi辅助脚本-测试版 (helper BETA) | `1.2.10` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/beta/kamigotchi-helper-beta.user.js |
| Kamigotchi精简数据库-测试版 (database BETA) | `1.2.4` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/beta/kamigotchi-database-beta.user.js |
| Kamigotchi轻量杀手监控-测试版 (killer BETA) | `1.2.7` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/beta/kamigotchi-killer-monitor-beta.user.js |

对照一下主线现在的版本：

| 脚本 | 版本 | 安装链接（点开即装） |
|---|---|---|
| Kamigotchi核心脚本-公开版 (core) | `1.2.35` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-core.user.js |
| Kamigotchi辅助脚本-公开版 (helper) | `1.2.9` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-helper.user.js |
| Kamigotchi精简数据库-公开版 (database) | `1.2.3` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-database.user.js |
| Kamigotchi轻量杀手监控-公开版 (killer monitor) | `1.2.6` | https://raw.githubusercontent.com/funcreator2030/kamigotchi-scripts/main/kamigotchi-killer-monitor.user.js |

---

## 怎么确认装对了

刷新游戏页，打开控制台（F12 → Console），应该看到：

```
✅ Kamigotchi核心脚本-测试版 vX.X.X 已成功启动
🧪 测试版核心运行中 vX.X.X —— 若同时看到「公开版」横幅，说明双开了
```

看到**红底的「⛔ 核心脚本【测试版】本次不启动」** = 主线核心没停干净，回上面第 ① 步。

控制台输入 `安装说明()` 可以随时打印安装/更新/回退说明。

> ⚠️ 不要拿「`[版本检查]` 已是最新」当判据。游戏页运行时会注入 CSP，
> 脚本 fetch 不到 GitHub，这行**基本不会出现**，看不到属正常。
> 以启动横幅和篡改猴面板里的版本号为准。

---

## 更新

不用重装。beta 的 `@name` 同样固定不带版本号，篡改猴会自动拉新版。
想立刻更新：篡改猴面板 → 实用工具 → 检查用户脚本的更新。

---

## 回退到主线

1. 篡改猴面板里把四个 **BETA** 脚本停用（或删除）
2. 把四个主线脚本重新启用
3. 刷新游戏页

数据不会丢：两条线用的是同一批 `localStorage` 键，精简数据库、gas 账本、
各种开关都是共用的，来回切不需要重新建库。

> 想回到更早的历史快照，见
> [Releases](https://github.com/funcreator2030/kamigotchi-scripts/releases)。
> ⚠️ 快照资产里的 `@downloadURL` 仍然指向 main，装完必须**逐个脚本**关掉
> 「检查更新」（面板 → 点脚本 → 设置 → 更新 → 关），否则下个检查周期会被
> 静默升回最新版，回退等于没做。

---

## 出了问题

控制台输入 `saveKamiLogs()` 导出日志，连同「哪一版、什么时候、看到什么」一起反馈。
beta 的定位就是用来暴露问题的，遇到坑是预期内的事。
