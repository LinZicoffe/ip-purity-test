(function (IPQ) {
  'use strict';

  var DATA = IPQ.DATA;
  var CIRC = 2 * Math.PI * 52;
  var STATUS_BADGE = { ok: 'badge--ok', risk: 'badge--warn', region: 'badge--bad', blocked: 'badge--bad' };
  var TYPE_CHIP = { hosting: 'warn', isp: 'ok', business: 'muted', education: 'ok' };
  var KIND_LABEL = { public: '公网', private: '内网', mdns: 'mDNS 本地域名' };

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(v) {
    return v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' }); } catch (e) {}

  function countryName(code) {
    if (!code) return '未知';
    var c = String(code).toUpperCase();
    var name = c;
    try { if (regionNames) name = regionNames.of(c); } catch (e) {}
    return name === c ? c : name + ' (' + c + ')';
  }

  function rowsHtml(rows) {
    var html = rows.filter(function (r) { return r[1] !== null && r[1] !== undefined && r[1] !== ''; }).map(function (r) {
      return '<div class="row"><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('');
    return html ? '<dl class="rows">' + html + '</dl>' : '';
  }

  function skeleton(widths) {
    return widths.map(function (w) { return '<div class="skeleton ' + w + '"></div>'; }).join('');
  }

  function chip(cls, text) {
    return '<span class="chip chip--' + cls + '">' + esc(text) + '</span>';
  }

  function badge(cls, text) {
    return '<p class="badge-line"><span class="badge ' + cls + '">' + esc(text) + '</span></p>';
  }

  function copyText(text, btn) {
    function done() {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1500);
    }
    function legacy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, legacy);
    } else {
      legacy();
    }
  }

  IPQ.UI = {
    countryName: countryName,

    init: function (opts) {
      var btn = byId('theme-btn');
      var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
      var labels = { auto: '跟随系统', light: '浅色', dark: '深色' };

      function apply(mode) {
        var dark = mode === 'dark' || (mode === 'auto' && mq && mq.matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-mode', mode);
        btn.textContent = '主题：' + labels[mode];
        try {
          if (mode === 'auto') localStorage.removeItem('ipq.theme');
          else localStorage.setItem('ipq.theme', mode);
        } catch (e) {}
      }

      btn.textContent = '主题：' + labels[document.documentElement.getAttribute('data-mode') || 'auto'];
      btn.addEventListener('click', function () {
        var order = ['auto', 'light', 'dark'];
        var cur = document.documentElement.getAttribute('data-mode') || 'auto';
        apply(order[(order.indexOf(cur) + 1) % order.length]);
      });
      if (mq) mq.addEventListener('change', function () {
        if (document.documentElement.getAttribute('data-mode') === 'auto') apply('auto');
      });

      byId('rerun-btn').addEventListener('click', opts.onRerun);
      document.addEventListener('click', function (e) {
        var target = e.target.closest('[data-copy]');
        if (target) copyText(target.getAttribute('data-copy'), target);
      });
    },

    reset: function () {
      byId('score-body').innerHTML = skeleton(['skeleton--lg', 'skeleton--w60']);
      byId('ip-body').innerHTML = skeleton(['skeleton--lg', 'skeleton--w60', 'skeleton--w80']);
      byId('ai-body').innerHTML = '<div class="svc">' + skeleton(['skeleton--w60', 'skeleton--w80', 'skeleton--w80']) + '</div>'.repeat(2);
      byId('risk-body').innerHTML = skeleton(['skeleton--w40', 'skeleton--w80', 'skeleton--w60']);
      byId('consistency-body').innerHTML = skeleton(['skeleton--w40', 'skeleton--full', 'skeleton--full']);
      byId('webrtc-body').innerHTML = skeleton(['skeleton--w40', 'skeleton--w80']);
      byId('detail-body').innerHTML = skeleton(['skeleton--full', 'skeleton--full', 'skeleton--w80']);
      byId('footer-links').innerHTML = '';
    },

    renderScore: function (score) {
      var body = byId('score-body');
      if (!score || score.total === null) {
        body.innerHTML = '<div class="score-text"><div class="grade">无法评分</div><p>' + esc(score ? score.advice[0] : '未能获取足够的数据。') + '</p></div>';
        return;
      }
      var g = score.grade;
      var offset = (CIRC * (1 - score.total / 100)).toFixed(1);
      body.innerHTML =
        '<div class="score-body">' +
          '<svg class="gauge" viewBox="0 0 120 120" role="img" aria-label="纯净度评分 ' + score.total + ' 分">' +
            '<circle class="gauge-track" cx="60" cy="60" r="52"></circle>' +
            '<circle class="gauge-value gauge-value--' + g.key + '" cx="60" cy="60" r="52" stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + offset + '"></circle>' +
            '<text class="gauge-num" x="60" y="60" text-anchor="middle">' + score.total + '</text>' +
            '<text class="gauge-unit" x="60" y="78" text-anchor="middle">/ 100</text>' +
          '</svg>' +
          '<div class="score-text"><div class="grade grade--' + g.key + '">' + esc(g.label) + '</div><p>' + esc(g.text) + '</p>' +
          '<p class="note">由 IP 类型、风险标记、出口一致性和 WebRTC 泄漏综合得出，仅供参考。</p></div>' +
        '</div>';
    },

    renderExit: function (exit, intel) {
      var body = byId('ip-body');
      if (!exit) return;
      if (!exit.ip) {
        body.innerHTML = badge('badge--bad', '未能获取出口 IP') +
          '<p class="note">' + esc((exit.errors || []).join('；') || '网络错误或被拦截') + '</p>';
        return;
      }
      var geo = (intel && intel.geo) || exit.geo || {};
      var rows = [
        ['国家 / 地区', geo.country ? countryName(geo.country) : (exit.loc ? countryName(exit.loc) : null)],
        ['州 / 省', geo.region],
        ['城市', geo.city],
        ['ASN', intel ? (intel.asn ? intel.asn + (intel.asnName ? ' ' + intel.asnName : '') : null) : (exit.asn || exit.org)],
        ['运营商 / 组织', intel ? intel.org : null],
        ['反向解析', intel ? intel.hostname : exit.hostname],
        ['时区', (intel && intel.timezone) || exit.timezone],
        ['地址来源', exit.source + ' · ' + exit.latencyMs + ' ms']
      ];
      body.innerHTML =
        '<div class="ip-line"><code class="ip">' + esc(exit.ip) + '</code>' +
        '<button type="button" class="btn btn--sm" data-copy="' + esc(exit.ip) + '">复制</button></div>' +
        rowsHtml(rows);
    },

    renderRisk: function (intel) {
      var body = byId('risk-body');
      if (intel === undefined) return;
      if (!intel || !intel.source) {
        var errors = (intel && intel.errors) || [];
        body.innerHTML = badge('badge--muted', '数据不足') +
          '<p class="note">未能从任何数据源获取 IP 类型信息。' + esc(errors.join('；')) + '</p>';
        return;
      }
      var f = intel.flags || {};
      var chips = [chip(intel.type ? TYPE_CHIP[intel.type] || 'muted' : 'muted', intel.type ? DATA.typeLabels[intel.type] || intel.type : '类型未知')];
      [['vpn', 'VPN'], ['proxy', '代理'], ['tor', 'Tor'], ['relay', '中继']].forEach(function (x) {
        var v = f[x[0]];
        chips.push(chip(v === true ? 'bad' : v === false ? 'ok' : 'muted', v === true ? '已标记 ' + x[1] : v === false ? '无 ' + x[1] + ' 标记' : x[1] + ' 未知'));
      });
      if (f.mobile === true) chips.push(chip('muted', '移动网络'));
      var rows = [
        ['ASN', intel.asn ? intel.asn + (intel.asnName ? ' ' + intel.asnName : '') : null],
        ['运营商 / 组织', intel.org],
        ['反向解析', intel.hostname],
        ['网段', intel.route],
        ['数据来源', intel.source + ' · ' + (DATA.confidenceLabels[intel.confidence] || '')]
      ];
      body.innerHTML = '<div class="chips">' + chips.join('') + '</div>' + rowsHtml(rows);
    },

    renderServices: function (list) {
      byId('ai-body').innerHTML = list.map(function (item) {
        if (!item.verdict) return '<div class="svc">' + skeleton(['skeleton--w60', 'skeleton--w80', 'skeleton--w80']) + '</div>';
        var svc = item.svc;
        var v = item.verdict;
        var sub = v.trace.reachable
          ? '该服务看到的出口：' + esc(v.trace.ip) + ' · ' + esc(countryName(v.trace.loc))
          : '该服务看到的出口：无法获取';
        var rows = [
          ['API 接口', v.api.text],
          ['网站连通', v.trace.text],
          ['地区检查', v.regionText]
        ];
        var notes = v.notes.concat(v.risks.length ? ['命中风险标记：' + v.risks.join('、')] : []);
        return '<div class="svc">' +
          '<div class="svc-head"><div><div class="svc-name">' + esc(svc.name) + '<span class="svc-vendor">' + esc(svc.vendor) + '</span></div>' +
          '<div class="svc-sub">' + sub + '</div></div>' +
          '<span class="badge ' + STATUS_BADGE[v.status] + '">' + esc(v.label) + '</span></div>' +
          rowsHtml(rows) +
          notes.map(function (n) { return '<p class="note">' + esc(n) + '</p>'; }).join('') +
          '<a class="btn btn--sm svc-link" href="' + svc.site + '" target="_blank" rel="noopener noreferrer">在新标签页打开 ' + esc(svc.host) + ' 实测</a>' +
          '</div>';
      }).join('');
    },

    renderConsistency: function (data) {
      var body = byId('consistency-body');
      if (!data || data.pending) return;
      var rows = data.rows.filter(function (r) { return r.ip; });
      if (rows.length < 2) {
        body.innerHTML = badge('badge--muted', '数据不足') +
          '<p class="note">' + (rows.length
            ? '只获取到 ' + rows.length + ' 个来源的地址，无法比对。不经过代理时 ChatGPT、Claude 域名不可达属正常现象。'
            : '所有来源都没有返回地址，无法比对。') + '</p>';
        return;
      }
      var head = data.mismatch
        ? badge('badge--warn', '检测到 ' + data.distinct + ' 个不同的 IPv4 出口')
        : badge('badge--ok', '各来源出口一致');
      var table = '<table class="table"><thead><tr><th>来源</th><th>地址</th><th>结果</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var cls;
          var text;
          if (r.ip.indexOf(':') !== -1) { cls = 't-muted'; text = 'IPv6 地址'; }
          else if (r.ip === data.exitIp) { cls = 't-ok'; text = '与出口一致'; }
          else { cls = 't-bad'; text = '不一致'; }
          return '<tr><td class="c-fixed">' + esc(r.source) + '</td><td>' + esc(r.ip) + '</td><td class="c-fixed ' + cls + '">' + text + '</td></tr>';
        }).join('') + '</tbody></table>';
      var notes = [];
      if (data.mismatch) notes.push('不同服务看到的出口 IP 不同，说明存在分流或多出口，部分请求可能没有经过代理。');
      if (data.dualStack) notes.push('当前是双栈网络：支持 IPv6 的网站可能通过另一个地址访问。');
      body.innerHTML = head + table + notes.map(function (n) { return '<p class="note">' + esc(n) + '</p>'; }).join('');
    },

    renderWebrtc: function (result) {
      var body = byId('webrtc-body');
      if (!result) return;
      var heads = {
        leak: ['badge--bad', '检测到泄漏'],
        clean: ['badge--ok', '未发现泄漏'],
        unknown: ['badge--muted', '无法判断'],
        unsupported: ['badge--muted', '浏览器不支持 WebRTC']
      };
      var notes = {
        leak: ['WebRTC 暴露了与出口 IP 不同的公网地址（已标红），真实网络可能被绕过代理访问。'],
        clean: ['未发现与出口 IP 不同的公网地址。内网地址和 .local 域名不会暴露真实公网 IP。'],
        unknown: [result.exitKnown
          ? '没有收集到任何候选地址，可能是浏览器禁用了 WebRTC 或 STUN 服务器不可达。零候选不等于一定安全。'
          : '尚未获取到出口 IP，无法比对。'],
        unsupported: []
      };
      var leaked = {};
      result.leaked.forEach(function (i) { leaked[i.address] = true; });
      var table = result.items.length
        ? '<table class="table"><thead><tr><th>地址</th><th>类型</th><th>协议</th></tr></thead><tbody>' +
          result.items.map(function (i) {
            var kind = KIND_LABEL[i.kind] + (i.kind === 'public' && i.address.indexOf(':') !== -1 ? '（IPv6）' : '');
            return '<tr><td class="' + (leaked[i.address] ? 't-bad' : '') + '">' + esc(i.address) + '</td><td class="c-fixed">' + esc(kind) + '</td><td class="c-fixed">' + esc(i.protocol) + '</td></tr>';
          }).join('') + '</tbody></table>'
        : '';
      var h = heads[result.state] || heads.unknown;
      body.innerHTML = badge(h[0], h[1]) + table +
        (notes[result.state] || []).map(function (n) { return '<p class="note">' + esc(n) + '</p>'; }).join('');
    },

    renderDetail: function (score) {
      var body = byId('detail-body');
      if (!score) return;
      var items = score.items.map(function (i) {
        var ded = i.missing
          ? '<span class="ded--miss">数据不足</span>'
          : '<span class="' + (i.deduction ? 'ded--hit' : 'ded--zero') + '">' + (i.deduction ? (i.deduction > 0 ? '-' : '+') + Math.abs(i.deduction) : '0') + '</span>';
        return '<li><span>' + esc(i.label) + '</span>' + ded + '<span class="ev">' + esc(i.evidence || '') + '</span></li>';
      }).join('');
      body.innerHTML = '<ul class="items">' + items + '</ul>' +
        (score.advice && score.advice.length ? '<p class="advice-title">建议</p><ul class="advice">' + score.advice.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '');
    },

    renderFooterLinks: function (ip) {
      var nav = byId('footer-links');
      if (!ip) { nav.innerHTML = ''; return; }
      var links = [
        ['IPinfo', 'https://ipinfo.io/' + ip],
        ['Scamalytics', 'https://scamalytics.com/ip/' + ip],
        ['AbuseIPDB', 'https://www.abuseipdb.com/check/' + ip],
        ['VirusTotal', 'https://www.virustotal.com/gui/ip-address/' + ip]
      ];
      nav.innerHTML = '在其他平台查看 ' + esc(ip) + '：' + links.map(function (l) {
        return '<a href="' + l[1] + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + '</a>';
      }).join('');
    }
  };
})(window.IPQ = window.IPQ || {});
