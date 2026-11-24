# IP 纯净度测试

一个纯前端的 IP 质量检测工具：检测当前出口 IP 的类型与风险、能否直连 ChatGPT 和 Claude、不同服务看到的出口是否一致，以及 WebRTC 是否泄漏真实地址，最后给出 0–100 的纯净度评分。

所有请求由浏览器直接发往第三方服务，**没有后端、不收集任何数据**，可以部署在任何静态托管上。

![浅色主题预览](参考/preview-light.png)

## 功能

- **出口 IP 识别**：多个数据源自动回退，显示国家/地区、城市、ASN、运营商、反向解析与时区，支持一键复制。
- **IP 类型与风险**：识别机房/云服务、住宅宽带、商业宽带、教育网，并展示 VPN、代理、中继、Tor、移动网络等标记。
- **AI 服务可用性**：分别检测 ChatGPT（OpenAI）与 Claude（Anthropic），区分「可直连」「可连接，地区不在支持列表」「有风控风险」「地区受限」「无法连接」，并给出 Cloudflare 判定地区与支持列表的比对结果。没有地区码时不按「不在支持列表」扣分。
- **出口一致性**：对比出口 IP、ChatGPT / Claude 域名看到的出口、IPv6 探测结果。同一协议内出现不同地址才算不一致；样本不够时显示「无法判断」，不记为一致。
- **WebRTC 泄漏**：通过 STUN 收集候选地址，区分公网 / 内网 / mDNS。只把同协议且与出口不同的公网地址算作泄漏；没有出口 IP，或候选还没收集完时显示「无法判断」。
- **评分与建议**：按网络身份、隐私标记、AI 服务可用性、出口一致性与 WebRTC 泄漏分项扣分。重叠的隐私标记会递减，明细分组展示并给出针对性建议。
- **主题**：跟随系统 / 浅色 / 深色，选择保存在本地。

## 检测原理

| 检测项 | 数据来源 |
| --- | --- |
| 出口 IP | Cloudflare `cdn-cgi/trace` → IPinfo → ipify → ipapi.co，取第一个有效结果 |
| IP 情报 | IPinfo widget → ip-api.com（仅 HTTP 页面）→ IPinfo 基础信息 → ipapi.co。返回地址必须与查询 IP 一致，否则忽略；都失败时按 ASN / 组织名启发式推断 |
| AI 服务 | `<host>/cdn-cgi/trace` 判断连通与地区。官方 API 返回 400/401/404/405/429，或返回带错误 JSON 且不属于地区限制的 403，视为可达；地区限制单独标出。没有错误 JSON 的 403 视为封禁。没有地区码时不按「不在支持列表」扣分 |
| 出口一致性 | 按 IPv4、IPv6 分别比对上述来源的地址。同一协议内出现不同出口才算不一致；不足两个地址时无法判断 |
| WebRTC | 多个 STUN 服务器收集 ICE 候选地址。链路本地地址算内网，不按泄漏计算 |

评分从 100 分扣起，明细按网络身份、隐私标记、AI 服务、出口与泄漏四组展示。隐私标记同时命中时递减：第二项按一半、其后按四分之一，合计最多 50 分，避免 VPN、代理和 Tor 被当成三次独立重罚。AI 服务合计最多扣 32 分。机房扣分随情报准确度下降。

| 项目 | 扣分 |
| --- | --- |
| 机房 / 托管 IP（准确度高 / 中 / 仅组织名推断） | 35 / 28 / 18 |
| 商业宽带 | 10 |
| 教育网 | 16 |
| Tor 标记 | 45 |
| VPN 标记 | 24 |
| 代理标记 | 22 |
| 中继标记 | 18 |
| AI 服务无法连接或地区受限 | 每个 16，合计最多 32 |
| AI 服务可连接，但地区不在支持列表 | 每个 8，计入上面的 32 分上限 |
| 出口不一致（单协议 / 两种协议） | 16 / 20，每多一个出口再加 2，最多 24 |
| WebRTC 泄漏（1 个地址 / 多个地址） | 16 / 20 |

总分 ≥ 85 为「纯净」，≥ 60 为「一般」，否则为「高风险」。服务本身可连接时，IP 上已有的风控标记不在服务一项里重复扣。若没有出口 IP，或没有判定出 IP 类型，则显示「无法评分」而不是 0 分。机房、VPN、代理、中继、Tor 或某个 AI 服务没有数据，且把这些缺项按未命中计仍会落到「纯净」时，同样显示「无法评分」。无法评分时明细不展示具体扣分。

## 本地运行

无需安装依赖或构建：

```bash
# 方式一：直接双击 index.html

# 方式二：起一个静态服务
python -m http.server 8000
# 然后访问 http://localhost:8000
```

## 部署

纯静态站点，上传 `index.html` 和 `assets/` 即可。宝塔面板 + Nginx + HTTPS 的完整步骤见 [部署步骤.md](部署步骤.md)。

注意：HTTPS 页面会拦截明文 HTTP 请求，因此备用数据源 `ip-api.com` 在线上会被自动跳过，首选的 IPinfo 正常时不影响结果。IPinfo 故障时会再请求 ipapi.co，ASN 和组织名都拿不到时才按组织名推断。

`index.html` 里的样式和脚本带 `?v=` 版本号。更新 `assets/` 后要同时改这个版本号，否则浏览器或 Cloudflare 可能继续使用旧文件。

## 项目结构

```
index.html              页面骨架与主题初始化
assets/css/style.css    样式与浅色/深色主题变量
assets/js/data.js       服务定义、支持地区、ASN 与关键词配置
assets/js/api.js        统一请求层（超时、取消、错误归一化）
assets/js/checks.js     出口 IP、IP 情报、AI 服务、WebRTC 等检测
assets/js/score.js      扣分规则与评分
assets/js/ui.js         DOM 渲染与主题切换
assets/js/app.js        检测编排与增量渲染
部署步骤.md              宝塔 + Nginx + HTTPS 部署清单
参考/                   设计稿与界面预览图（不参与线上运行）
```

## 已知限制

- 脚本无法判断网页版是否弹出 Cloudflare 人机验证，ChatGPT / Claude 的最终可用性请以实际打开结果为准。
- 结果只反映检测时刻的网络状态；切换节点或代理规则后请点击「重新检测」。
- 评分仅供参考，不代表任何服务商的实际风控判定。
- OpenAI / Anthropic 的支持地区列表随官方政策变化，需同步更新 `assets/js/data.js` 中的地区码与 `regionsChecked` 日期。
- 组织名里如果完整出现云厂商关键词，可能被低准确度推断为机房。评分会标明这项仅供参考。
- WebRTC 收集超时后如果还没有公网候选，显示「无法判断」，而不是「未发现泄漏」。

## 隐私

页面没有后端，不写入 Cookie，不收集或上传任何检测结果。所有请求由访问者浏览器直接发往 Cloudflare、IPinfo、ipify、ipapi.co、OpenAI、Anthropic 等第三方服务，同时也会发起 STUN 请求用于 WebRTC 检测。

## 开源协议

本项目以 MIT 协议开源。你可以自由使用、修改和分发，但必须在副本中保留下面的版权声明和许可声明。

```
MIT License

Copyright (c) 2026 东林 梁

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

完整文本同时放在仓库根目录的 [LICENSE](LICENSE)。

## 更新日志

### 2026-11-24

*V5*：
- 文档更新：加入 MIT 开源协议（README.md、LICENSE）

*V4*：
- 文档更新：补充出口无法判断、WebRTC 无法判断、情报地址校验和静态资源版本号的说明（README.md）

*V3*：
- 修复问题：出口地址不足以比对时，一致性卡片不再显示「各来源出口一致」（ui.js、checks.js）
- 修复问题：没有出口 IP，或 WebRTC 候选尚未收集完时，不再显示「未发现泄漏」（checks.js、ui.js、score.js）
- 修复问题：trace 没有地区码时不再按「不在支持列表」扣分；地区不在列表时徽章改为「可连接，地区不在支持列表」（checks.js、ui.js、style.css）
- 修复问题：只有 ASN 或组织名、没有 IP 类型时，无法评分的说明不再写成所有情报来源都不可用（score.js、checks.js）
- 修复问题：ip-api 缺少字段时不再当成「不是机房」或「无代理」（checks.js）
- 修复问题：无法评分时明细不再展示具体扣分（ui.js）
- 修复问题：IPinfo widget 返回地址与查询 IP 不一致时忽略；HTTP 200 但正文不是 JSON 时不再视为接口可达（checks.js、api.js）
- 修复问题：fe80::/10 链路本地地址不再被当成公网泄漏（checks.js）
- 优化改进：教育网色块改为警示色；静态资源加上版本号，避免更新后继续使用旧脚本（ui.js、index.html）
- 文档更新：部署说明补上 ipapi.co 回退，并说明资源版本号（部署步骤.md、README.md）

*V2*：
- 优化改进：评分改为按网络身份、隐私标记、AI 服务可用性和出口/泄漏分项计算；重叠的隐私标记递减，机房扣分随情报准确度调整，明细按组展示（score.js、checks.js、app.js、ui.js、style.css）

*V1*：
- 修复问题：WebRTC 不再把另一协议的公网地址算作泄漏
- 修复问题：官方 API 已返回非地区限制的 JSON 403 时，服务显示为可直连
- 修复问题：风险标记不完整时不再给出纯净满分
- 修复问题：不同的 IPv6 出口会标为不一致
- 修复问题：服务看到的出口与已评估 IP 不同时，不再套用该 IP 的风险标记
- 修复问题：Claude 的 permission_error 不再一律判为地区受限
- 修复问题：ip-api.com 备用请求补上 query 字段，以便校验返回的是目标地址
