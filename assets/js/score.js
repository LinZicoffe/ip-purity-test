(function (IPQ) {
  'use strict';

  IPQ.SCORE = {
    compute: function (r) {
      if (!r.exitIp) {
        return { total: null, grade: null, items: [], advice: ['未能获取出口 IP，请检查网络后重新检测。'] };
      }

      var intel = r.intel || null;
      var f = (intel && intel.flags) || {};
      var type = intel ? intel.type : null;
      var items = [];
      var typeKnown = !!(type || Object.keys(f).some(function (k) { return f[k] != null; }));

      function item(label, known, deduction, hitEvidence, missEvidence) {
        if (!known) {
          items.push({ label: label, deduction: 0, missing: true });
          return 0;
        }
        var d = deduction > 0 ? deduction : 0;
        items.push({ label: label, deduction: d, evidence: d ? hitEvidence : missEvidence });
        return d;
      }

      item('机房 / 托管 IP', f.hosting != null, f.hosting ? 35 : 0, '该 IP 属于云服务或托管机房', '非机房 IP');
      if (type !== 'hosting') {
        item('商业宽带', !!type, type === 'business' ? 10 : 0, '商业宽带，风控敏感度略高于住宅网络', '住宅、运营商或教育网络');
      }

      var privacy = 0;
      privacy += item('VPN 标记', f.vpn != null, f.vpn ? 25 : 0, '已被标记为 VPN', '无 VPN 标记');
      privacy += item('代理标记', f.proxy != null, f.proxy ? 25 : 0, '已被标记为代理', '无代理标记');
      privacy += item('中继标记', f.relay != null, f.relay ? 20 : 0, '已被标记为中继', '无中继标记');
      privacy += item('Tor 标记', f.tor != null, f.tor ? 60 : 0, '属于 Tor 出口节点', '无 Tor 标记');
      if (privacy > 60) {
        items.push({ label: '隐私类扣分上限', deduction: 60 - privacy, evidence: '多类标记叠加时，合计最多扣 60 分' });
        privacy = 60;
      }

      var mismatch = r.consistency ? r.consistency.mismatch : null;
      item('出口 IP 一致性', mismatch != null, mismatch ? 15 : 0, '不同服务看到的出口 IP 不一致，存在分流或多出口', '各来源出口一致');

      var state = r.webrtc ? r.webrtc.state : null;
      item('WebRTC 泄漏', state === 'leak' || state === 'clean', state === 'leak' ? 15 : 0, 'WebRTC 暴露了与出口不同的公网地址', '未发现泄漏');

      if (!typeKnown) {
        return { total: null, grade: null, items: items, advice: ['未能获取 IP 类型信息（所有 IP 情报来源均不可用），无法计算纯净度评分。'] };
      }

      var total = Math.max(0, 100 - items.reduce(function (sum, i) { return sum + i.deduction; }, 0));

      var coreLabels = { '机房 / 托管 IP': 1, 'VPN 标记': 1, '代理标记': 1, '中继标记': 1, 'Tor 标记': 1 };
      var missingCore = items.filter(function (i) { return i.missing && coreLabels[i.label]; });
      if (missingCore.length && total >= 85) {
        return {
          total: null,
          grade: null,
          items: items,
          advice: [missingCore.map(function (i) { return i.label; }).join('、') + '没有数据。这些项按未命中计分会得到纯净结果，因此本次不评分。']
        };
      }

      var grade;
      if (total >= 85) {
        grade = { key: 'good', label: '纯净', text: 'IP 类型干净，适合注册和日常使用。' };
      } else if (total >= 60) {
        grade = { key: 'warn', label: '一般', text: '可日常访问，但用于注册或订阅账号有一定风控风险。' };
      } else {
        grade = { key: 'bad', label: '高风险', text: '风险信号明显，容易触发人机验证或封号，不建议用于账号操作。' };
      }

      var advice = [];
      if (f.hosting) advice.push('当前是机房 IP：日常访问没有问题，但不建议用于注册、订阅或长期登录 ChatGPT / Claude 账号，更容易遇到人机验证。');
      if (f.vpn || f.proxy || f.relay) advice.push('该 IP 被标记为 VPN / 代理 / 中继，风控风险较高，建议改用住宅 IP。');
      if (f.tor) advice.push('该 IP 属于 Tor 网络，绝大多数 AI 服务会直接拒绝，请更换网络。');
      if (mismatch) advice.push('不同服务看到的出口 IP 不一致，说明存在分流或多出口，部分请求可能没有经过代理。');
      if (state === 'leak') advice.push('WebRTC 暴露了真实地址，建议在浏览器中禁用 WebRTC，或在代理软件中开启 UDP 转发。');
      var unavailable = (r.services || []).filter(function (s) {
        return s && (s.status === 'region' || s.status === 'blocked');
      });
      var names = unavailable.map(function (s) { return s.name; }).filter(function (name) { return name; });
      if (names.length) advice.push(names.join('、') + ' 在当前网络下不可用，请切换到受支持地区的节点后重新检测。');
      else if (unavailable.length) advice.push('有服务在当前网络下不可用，请切换到受支持地区的节点后重新检测。');
      if (!advice.length) advice.push('未发现明显的风险信号，当前 IP 适合访问 AI 服务。');

      return { total: total, grade: grade, items: items, advice: advice };
    }
  };
})(window.IPQ = window.IPQ || {});
