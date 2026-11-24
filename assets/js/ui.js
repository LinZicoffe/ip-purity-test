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
      var onSchemeChange = function () {
        if (document.documentElement.getAttribute('data-mode') === 'auto') apply('auto');
      };
      if (mq) {
        if (mq.addEventListener) mq.addEventListener('change', onSchemeChange);
        else if (mq.addListener) mq.addListener(onSchemeChange);
      }

      byId('rerun-btn').addEventListener('click', opts.onRerun);
      document.addEventListener('click', function (e) {
        var target = e.target.closest('[data-copy]');
        if (target) copyText(target.getAttribute('data-copy'), target);
      });
    },

    setBusy: function (busy) {
      var btn = byId('rerun-btn');
      btn.disabled = !!busy;
      btn.textContent = busy ? '检测中…' : '重新检测';
      document.body.setAttribute('aria-busy', busy ? 'true' : 'false');
    },

    reset: function () {
      byId('score-body').innerHTML = skeleton(['skeleton--lg', 'skeleton--w60']);
      byId('ip-body').innerHTML = skeleton(['skeleton--lg', 'skeleton--w60', 'skeleton--w80']);
      byId('ai-body').innerHTML = DATA.services.map(function () {
        return '<div class="svc">' + skeleton(['skeleton--w60', 'skeleton--w80', 'skeleton--w80']) + '</div>';
      }).join('');
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
            '<circle class="gauge-value gauge-value--' + g.key + '" cx="60" cy="60" r="52" stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + CIRC.toFixed(1) + '"></circle>' +
            '<text class="gauge-num" x="60" y="60" text-anchor="middle">' + score.total + '</text>' +
            '<text class="gauge-unit" x="60" y="78" text-anchor="middle">/ 100</text>' +
          '</svg>' +
          '<div class="score-text"><div class="grade grade--' + g.key + '">' + esc(g.label) + '</div><p>' + esc(g.text) + '</p>' +
          (score.note ? '<p class="note">' + esc(score.note) + '</p>' : '') + '</div>' +
        '</div>';
      var arc = body.querySelector('.gauge-value');
      if (arc) {
        arc.getBoundingClientRect();
        arc.style.strokeDashoffset = offset;
      }
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
      if (f.hosting === true && intel.type !== 'hosting') chips.push(chip('warn', '机房 IP'));
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
        return '<div class="svc svc--' + esc(v.status) + '">' +
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
      var parts = [];
      if (data.distinctV4 >= 2) parts.push(data.distinctV4 + ' 个不同的 IPv4 出口');
      if (data.distinctV6 >= 2) parts.push(data.distinctV6 + ' 个不同的 IPv6 出口');
      var head = data.mismatch
        ? badge('badge--warn', '检测到 ' + parts.join('，'))
        : badge('badge--ok', '各来源出口一致');
      var table = '<div class="table-wrap"><table class="table"><thead><tr><th>来源</th><th>地址</th><th>结果</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var cls;
          var text;
          if (r.align === 'diff') { cls = 't-bad'; text = '不一致'; }
          else if (r.align === 'single' && r.family === 'v6') { cls = 't-muted'; text = 'IPv6 地址'; }
          else { cls = 't-ok'; text = r.sameAsExit ? '与出口一致' : '一致'; }
          return '<tr><td class="c-fixed">' + esc(r.source) + '</td><td>' + esc(r.ip) + '</td><td class="c-fixed ' + cls + '">' + text + '</td></tr>';
        }).join('') + '</tbody></table></div>';
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
        clean: ['未发现与出口 IP 不同的同协议公网地址。内网地址和 .local 域名不会暴露真实公网 IP。'],
        unknown: [result.exitKnown
          ? (result.otherFamily && result.otherFamily.length
            ? '只收集到与出口不同协议的公网地址，不能据此判断是否泄漏。'
            : '没有收集到任何候选地址，可能是浏览器禁用了 WebRTC 或 STUN 服务器不可达。零候选不等于一定安全。')
          : '尚未获取到出口 IP，无法比对。'],
        unsupported: []
      };
      var extra = [];
      if (result.otherFamily && result.otherFamily.length && (result.state === 'clean' || result.state === 'leak')) {
        extra.push((result.otherFamily[0].address.indexOf(':') !== -1 ? 'IPv6' : 'IPv4') + ' 公网地址与当前出口不是同一协议，未按泄漏计算。');
      }
      var leaked = {};
      result.leaked.forEach(function (i) { leaked[i.address] = true; });
      var table = result.items.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>地址</th><th>类型</th><th>协议</th></tr></thead><tbody>' +
          result.items.map(function (i) {
            var kind = KIND_LABEL[i.kind] + (i.kind === 'public' && i.address.indexOf(':') !== -1 ? '（IPv6）' : '');
            return '<tr><td class="' + (leaked[i.address] ? 't-bad' : '') + '">' + esc(i.address) + '</td><td class="c-fixed">' + esc(kind) + '</td><td class="c-fixed">' + esc(i.protocol) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '';
      var h = heads[result.state] || heads.unknown;
      body.innerHTML = badge(h[0], h[1]) + table +
        (notes[result.state] || []).concat(extra).map(function (n) { return '<p class="note">' + esc(n) + '</p>'; }).join('');
    },

    renderDetail: function (score) {
      var body = byId('detail-body');
      if (!score) return;
      function dedHtml(i) {
        if (i.missing) return '<span class="ded--miss">数据不足</span>';
        if (i.absorbed) return '<span class="ded--miss">已合并</span>';
        var n = i.deduction || 0;
        return '<span class="' + (n > 0 ? 'ded--hit' : 'ded--zero') + '">' + (n > 0 ? '-' + n : '0') + '</span>';
      }
      function rowHtml(i) {
        return '<li><span>' + esc(i.label) + '</span>' + dedHtml(i) + '<span class="ev">' + esc(i.evidence || '') + '</span></li>';
      }
      var groups = [];
      var index = {};
      (score.items || []).forEach(function (item) {
        var name = item.group || '其他';
        if (index[name] == null) {
          index[name] = groups.length;
          groups.push({ name: name, items: [] });
        }
        groups[index[name]].items.push(item);
      });
      var html = groups.map(function (g) {
        var allMiss = g.items.length > 0 && g.items.every(function (i) { return i.missing; });
        var anyMiss = g.items.some(function (i) { return i.missing; });
        var sub = g.items.reduce(function (s, i) { return s + (i.deduction || 0); }, 0);
        var subHtml = allMiss
          ? '<span class="ded--miss">数据不足</span>'
          : anyMiss && sub === 0
            ? '<span class="ded--miss">未扣分</span>'
            : '<span class="' + (sub > 0 ? 'ded--hit' : 'ded--zero') + '">' + (sub > 0 ? '-' + sub : '0') + '</span>';
        return '<section class="score-group"><div class="score-group-head"><span>' + esc(g.name) + '</span>' + subHtml + '</div><ul class="items">' +
          g.items.map(rowHtml).join('') + '</ul></section>';
      }).join('');
      if (score.footnote) html += '<p class="note score-footnote">' + esc(score.footnote) + '</p>';
      if (score.advice && score.advice.length) {
        html += '<p class="advice-title">建议</p><ul class="advice">' + score.advice.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
      }
      body.innerHTML = html;
    },

    renderFooterLinks: function (ip) {
      var nav = byId('footer-links');
      if (!ip) { nav.innerHTML = ''; return; }
      var q = encodeURIComponent(ip);
      var links = [
        ['IPinfo', 'https://ipinfo.io/' + q],
        ['Scamalytics', 'https://scamalytics.com/ip/' + q],
        ['AbuseIPDB', 'https://www.abuseipdb.com/check/' + q],
        ['VirusTotal', 'https://www.virustotal.com/gui/ip-address/' + q]
      ];
      nav.innerHTML = '在其他平台查看 ' + esc(ip) + '：' + links.map(function (l) {
        return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + '</a>';
      }).join('');
    }
  };
})(window.IPQ = window.IPQ || {});
