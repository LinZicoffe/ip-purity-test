# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

纯静态的单页工具：检测访问者出口 IP 的类型与风险、AI 服务（ChatGPT / Claude）直连可用性、出口一致性与 WebRTC 泄漏，并给出 0–100 纯净度评分。没有后端、数据库、构建工具或依赖——浏览器直接向第三方接口发请求，服务器只需提供 `index.html` 与 `assets/`。

无 package.json、无测试、无 lint、无编译步骤。修改后直接刷新浏览器即可生效。

## 本地运行与部署

- 本地：直接双击 `index.html`，或 `python -m http.server 8000` 后访问 `http://localhost:8000`。
- 部署：见 `部署步骤.md`（宝塔 + Nginx + HTTPS），只上传 `index.html` 和 `assets/`。`参考/`、`assets.rar`、`.qoder/` 不参与线上运行。
- 线上与 `file://` 的差异：HTTPS 页面会拦截明文 HTTP，因此 `checks.js` 中备用数据源 `http://ip-api.com` 会被跳过，IP 情报退化为 IPinfo → ipapi.co → ASN/组织名推断。修改回退链路时需保留这个行为。

## 架构

所有 JS 都是挂在 `window.IPQ` 上的 IIFE 模块，无 ES module、无打包。**`index.html` 中的 script 顺序即依赖顺序**，必须保持：`data → api → checks → score → ui → app`。

- `assets/js/data.js` — 全部可调配置：AI 服务定义、OpenAI/Anthropic 支持地区码集合（带 `regionsChecked` 日期）、已知机房 ASN 表、机房关键词、中文标签。更新地区支持情况时改这里，并同步日期。
- `assets/js/api.js` — 唯一网络层 `API.request(url, opts)`：**永不 reject**，总是 resolve `{ ok, status, data, latencyMs, error }`；默认 9s 超时、`no-store`、`credentials: omit`；`type: 'text'` 时不做 JSON 解析；外层 `signal` 可取消。另有 `parseTrace()` 解析 Cloudflare `cdn-cgi/trace` 的 `key=value` 行。
- `assets/js/checks.js` — 采样与判定逻辑：
  - `exitIp()`：依次尝试 Cloudflare trace → IPinfo → ipify → ipapi.co，取第一个有效 IP 即返回，并携带该来源的 ASN/geo 线索。
  - `intel(ip, signal, fallback)`：IPinfo widget → （仅 HTTP 页面）ip-api.com → IPinfo 基础信息 → ipapi.co，最后用 ASN 表/关键词启发式判断是否机房 IP。回退数据源必须通过 `sameIp()` 校验返回地址与目标一致，否则忽略（分流场景下会返回别人的出口）。
  - `service()` / `verdict()`：每个服务并发请求 `<host>/cdn-cgi/trace` 与官方 API；`400/401/404/405/429` 视为可达，403 再由 `DATA.isRegionError()` 区分「地区受限」与「被封」。
  - `ipv6()`、`webrtc()`（STUN 候选收集）、`classifyAddresses()`（公网/内网/mDNS 分类与泄漏判定）。
- `assets/js/score.js` — 评分：从 100 扣分（机房 35、VPN/代理各 25、中继 20、Tor 60、商业宽带 10、出口不一致 15、WebRTC 泄漏 15）；隐私类扣分合计封顶 60；`>=85` 纯净、`>=60` 一般、否则高风险。**拿不到 IP 类型信息时返回 `total: null`**（显示「无法评分」），不要改成 0 分。
- `assets/js/ui.js` — 所有 DOM 渲染与主题切换。HTML 一律通过这里生成，任何外部字符串必须经 `esc()` 转义。状态/徽章/色块用固定类名映射（`STATUS_BADGE`、`TYPE_CHIP` 等）。
- `assets/js/app.js` — 编排：`run()` 重置状态后并行启动出口 IP、各 AI 服务、IPv6、WebRTC；每项完成即增量渲染，最后统一渲染一致性与评分。`runId` + `AbortController` 用于「重新检测」时丢弃上一轮迟到的结果——新增异步检查时也必须遵守 `isCurrent()` 守卫与 signal 取消。

## 修改约定

- 界面与提示文案统一中文（`zh-CN`），面向大陆访问者；不要引入外部字体或 CDN。
- 新增 AI 服务：在 `data.js` 的 `services` 增加条目（`trace`、`api`、`regions` 键），必要时为地区受限响应补充 `isRegionError()` 分支；`ui.js` 按 `services` 自动渲染，无需改结构。
- 新增出口 IP 数据源：改 `checks.js` 的 `EXIT_SOURCES`，并在 `exitIp()` 中补对应字段解析（trace 文本 vs JSON）。
- 新增检测项：需同时改 `checks.js`（采集/判定）、`app.js`（编排与状态）、`ui.js`（渲染）、`score.js`（扣分与建议），并在 `index.html` 加对应容器（如果需要）。
- 主题：`<head>` 内联脚本在 CSS 之前根据 `localStorage['ipq.theme']` 设置 `data-theme` 防止闪烁；`ui.js` 负责按钮在 跟随系统 → 浅色 → 深色 间循环。颜色只通过 `style.css` 中的 CSS 变量（`:root` 与 `[data-theme="dark"]`）控制。
- `参考/ip-purity-test.html` 是设计参考稿，不属于运行代码；不要把它当作实际实现去修改或部署。
