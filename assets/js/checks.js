(function (IPQ) {
  'use strict';

  var API = IPQ.API;
  var DATA = IPQ.DATA;

  var EXIT_SOURCES = [
    { name: 'Cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace', type: 'text' },
    { name: 'IPinfo', url: 'https://ipinfo.io/json' },
    { name: 'ipify', url: 'https://api64.ipify.org?format=json' },
    { name: 'ipapi.co', url: 'https://ipapi.co/json/' }
  ];

  var IP_API_FIELDS = 'status,message,country,countryCode,regionName,city,isp,org,as,asname,mobile,proxy,hosting,query';

  var STUN_SERVERS = ['stun.cloudflare.com:3478', 'stun.l.google.com:19302', 'stun.miwifi.com:3478', 'stun.qq.com:3478'];

  function isV4(ip) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '');
  }

  function extractAsn(str) {
    var m = /AS?(\d+)/i.exec(str || '');
    return m ? 'AS' + m[1] : null;
  }

  function fail(r) {
    return r && r.error ? r.error.msg : '无有效数据';
  }

  function pickGeo(d) {
    return {
      country: d.country_code || d.country || null,
      countryName: d.country_name || null,
      region: d.region || null,
      city: d.city || null
    };
  }

  function flag(v) {
    return typeof v === 'boolean' ? v : null;
  }

  function fromIpinfo(ip, d) {
    var p = d.privacy || {};
    var type = (d.company && d.company.type) || (d.asn && d.asn.type) || null;
    var hosting = flag(p.hosting);
    if (hosting === null) hosting = flag(d.is_hosting);
    if (hosting === null && type) hosting = type === 'hosting';
    return {
      ip: d.ip || ip,
      source: 'IPinfo',
      confidence: 'high',
      asn: (d.asn && d.asn.asn) || null,
      asnName: (d.asn && d.asn.name) || null,
      org: (d.company && d.company.name) || null,
      route: (d.asn && d.asn.route) || null,
      hostname: d.hostname || null,
      timezone: d.timezone || null,
      type: type,
      flags: {
        hosting: hosting,
        vpn: flag(p.vpn),
        proxy: flag(p.proxy),
        tor: flag(p.tor),
        relay: flag(p.relay),
        mobile: flag(d.is_mobile)
      },
      geo: { country: d.country || null, countryName: null, region: d.region || null, city: d.city || null },
      errors: []
    };
  }

  function fromIpApi(d) {
    return {
      ip: d.query,
      source: 'ip-api.com',
      confidence: 'medium',
      asn: extractAsn(d.as),
      asnName: d.asname || null,
      org: d.isp || d.org || null,
      route: null,
      hostname: null,
      timezone: null,
      type: d.hosting ? 'hosting' : null,
      flags: {
        hosting: !!d.hosting,
        vpn: null,
        proxy: !!d.proxy,
        tor: null,
        relay: null,
        mobile: !!d.mobile
      },
      geo: {
        country: d.countryCode || null,
        countryName: d.country || null,
        region: d.regionName || null,
        city: d.city || null
      },
      errors: []
    };
  }

  function heuristicHosting(base) {
    var asnNum = base.asn ? base.asn.replace(/^AS/i, '') : '';
    if (asnNum && DATA.asnTypes[asnNum] === 'hosting') return true;
    var text = [base.org, base.asnName, base.hostname].filter(Boolean).join(' ').toLowerCase();
    return DATA.keywords.some(function (k) {
      k = k.toLowerCase();
      if (/^[a-z0-9]{1,4}$/.test(k)) return new RegExp('(^|[^a-z0-9])' + k + '([^a-z0-9]|$)').test(text);
      return text.indexOf(k) !== -1;
    }) ? true : null;
  }

  function isPrivateV4(addr) {
    var p = addr.split('.').map(Number);
    if (p.length !== 4 || p.some(isNaN)) return false;
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
    return false;
  }

  function isPrivate(addr) {
    var a = addr.toLowerCase();
    if (a.indexOf('::ffff:') === 0) return isPrivateV4(a.slice(7));
    if (a === '::1' || a.indexOf('fc') === 0 || a.indexOf('fd') === 0 || a.indexOf('fe80:') === 0) return true;
    return isV4(a) ? isPrivateV4(a) : false;
  }

  function isIpLike(ip) {
    return typeof ip === 'string' && ip.length <= 45 && (isV4(ip) || (ip.indexOf(':') !== -1 && /^[0-9a-fA-F:.]+$/.test(ip)));
  }

  function expandV6(ip) {
    var s = String(ip).toLowerCase().split('%')[0];
    if (s.indexOf('.') !== -1) return null;
    var halves = s.split('::');
    if (halves.length > 2) return null;
    function groups(side) {
      if (!side) return [];
      var out = side.split(':');
      for (var i = 0; i < out.length; i++) {
        if (!/^[0-9a-f]{1,4}$/.test(out[i])) return null;
        out[i] = ('0000' + out[i]).slice(-4);
      }
      return out;
    }
    var head = groups(halves[0]);
    if (!head) return null;
    if (halves.length === 1) return head.length === 8 ? head.join(':') : null;
    var tail = groups(halves[1]);
    if (!tail) return null;
    var missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    var mid = [];
    for (var i = 0; i < missing; i++) mid.push('0000');
    return head.concat(mid, tail).join(':');
  }

  // Fallback endpoints answer for whoever is calling, which can differ from the
  // exit IP under split routing. Accept only an answer for the same address.
  function sameIp(a, b) {
    if (!a || !b) return false;
    a = String(a).trim();
    b = String(b).trim();
    if (isV4(a) || isV4(b)) return isV4(a) && isV4(b) && a === b;
    var ea = expandV6(a);
    var eb = expandV6(b);
    if (ea && eb) return ea === eb;
    return a.toLowerCase() === b.toLowerCase();
  }

  function mismatchOrFail(r) {
    return r && r.ok && r.data && (r.data.ip || r.data.query) ? '返回的是另一个出口地址，已忽略' : fail(r);
  }

  function apiHost(url) {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }

  function apiErrorBody(body) {
    return !!(body && (body.type === 'error' || (body.error && typeof body.error === 'object')));
  }

  // Claude answers unsupported countries with permission_error and often no
  // geographic wording. That same type is also a plain permission refusal, so
  // use it as a region signal only when the trace location is unsupported.
  function refusesForRegion(svc, body, loc) {
    if (DATA.isRegionError(svc, body)) return true;
    if (svc.id !== 'claude' || !loc || !DATA.isPermissionError(body)) return false;
    var codes = DATA.regions[svc.regions] && DATA.regions[svc.regions].codes;
    return !!(codes && !codes.has(loc));
  }

  function candidateAddress(cand) {
    var parts = String(cand).replace(/^a=/, '').split(/\s+/);
    if (parts.length < 8 || !/^candidate:/.test(parts[0])) return null;
    return { address: parts[4], protocol: parts[2].toUpperCase(), candidateType: parts[7] };
  }

  IPQ.CHECKS = {
    exitIp: async function (signal) {
      var errors = [];
      for (var i = 0; i < EXIT_SOURCES.length; i++) {
        if (signal.aborted) break;
        var s = EXIT_SOURCES[i];
        var r = await API.request(s.url, { type: s.type, signal: signal });
        if (signal.aborted) break;
        var ip = null;
        var extra = {};
        if (r.ok) {
          if (s.type === 'text') {
            var t = API.parseTrace(r.data);
            ip = t.ip;
            extra = { loc: t.loc, colo: t.colo };
          } else if (r.data && typeof r.data.ip === 'string') {
            ip = r.data.ip;
            extra = {
              hostname: r.data.hostname || null,
              org: r.data.org || null,
              asn: r.data.asn || null,
              timezone: r.data.timezone || null,
              geo: pickGeo(r.data)
            };
          }
        }
        if (ip && !isIpLike(ip)) ip = null;
        if (ip) {
          return Object.assign({ ip: ip, source: s.name, latencyMs: r.latencyMs }, extra);
        }
        errors.push(s.name + '：' + fail(r));
      }
      return { ip: null, errors: errors };
    },

    intel: async function (ip, signal, fallback) {
      fallback = fallback || {};
      var r = await API.request('https://ipinfo.io/widget/demo/' + encodeURIComponent(ip), { signal: signal });
      if (signal.aborted) return null;
      if (r.ok && r.data && r.data.data) return fromIpinfo(ip, r.data.data);
      var errors = ['IPinfo：' + fail(r)];

      // HTTP only: skipped on HTTPS pages because of mixed-content blocking.
      if (location.protocol !== 'https:') {
        r = await API.request('http://ip-api.com/json/?lang=zh-CN&fields=' + IP_API_FIELDS, { signal: signal });
        if (signal.aborted) return null;
        if (r.ok && r.data && r.data.status === 'success' && sameIp(r.data.query, ip)) return fromIpApi(r.data);
        errors.push('ip-api.com：' + mismatchOrFail(r));
      }

      var base = {
        asn: fallback.asn || null,
        asnName: null,
        org: fallback.org || null,
        hostname: fallback.hostname || null,
        timezone: fallback.timezone || null,
        geo: fallback.geo || null
      };
      r = await API.request('https://ipinfo.io/json', { signal: signal });
      if (signal.aborted) return null;
      if (r.ok && r.data && sameIp(r.data.ip, ip)) {
        base.asn = extractAsn(r.data.org) || base.asn;
        base.org = r.data.org || base.org;
        base.hostname = r.data.hostname || base.hostname;
        base.timezone = r.data.timezone || base.timezone;
        base.geo = base.geo || pickGeo(r.data);
      } else {
        errors.push('IPinfo（基础信息）：' + mismatchOrFail(r));
      }
      if (!base.asn && !base.org) {
        r = await API.request('https://ipapi.co/json/', { signal: signal });
        if (signal.aborted) return null;
        if (r.ok && r.data && sameIp(r.data.ip, ip)) {
          base.asn = r.data.asn || null;
          base.org = r.data.org || null;
          base.geo = base.geo || pickGeo(r.data);
        } else {
          errors.push('ipapi.co：' + mismatchOrFail(r));
        }
      }

      var hosting = heuristicHosting(base);
      if (!base.asn && !base.org) {
        return { ip: ip, source: null, confidence: null, asn: null, asnName: null, org: null, route: null,
          hostname: base.hostname, timezone: base.timezone, type: null, flags: null, geo: base.geo, errors: errors };
      }
      return {
        ip: ip,
        source: 'ASN / 组织名推断',
        confidence: 'low',
        asn: base.asn,
        asnName: null,
        org: base.org,
        route: null,
        hostname: base.hostname,
        timezone: base.timezone,
        type: hosting ? 'hosting' : null,
        flags: { hosting: hosting, vpn: null, proxy: null, tor: null, relay: null, mobile: null },
        geo: base.geo,
        errors: errors
      };
    },

    service: function (svc, signal) {
      return Promise.all([
        API.request(svc.trace, { type: 'text', signal: signal }),
        API.request(svc.api, { headers: svc.headers, signal: signal })
      ]).then(function (r) {
        return { trace: r[0], api: r[1] };
      });
    },

    verdict: function (svc, res, intel) {
      var trace = res.trace;
      var api = res.api;
      var t = trace.ok ? API.parseTrace(trace.data) : null;
      var tReachable = !!(t && t.ip);
      var body = api.data && typeof api.data === 'object' && !Array.isArray(api.data) ? api.data : {};
      var loc = tReachable && t.loc ? String(t.loc).toUpperCase() : '';
      var regionHit = api.status === 403 && refusesForRegion(svc, body, loc);
      // JSON from the API means the host answered, including a non-region 403.
      // A 403 without that body is an edge block and stays unreachable.
      var apiReachable = api.ok || [400, 401, 404, 405, 429].indexOf(api.status) !== -1
        || (api.status === 403 && !regionHit && apiErrorBody(body));
      var risks = [];
      var notes = [];
      var serviceIp = tReachable ? t.ip : null;
      var intelApplies = !(serviceIp && intel && intel.ip) || sameIp(serviceIp, intel.ip);
      var f = intelApplies && intel && intel.flags;
      if (!intelApplies) {
        notes.push('该服务看到的出口与已评估的 IP 不同，未套用机房、VPN 等风险标记');
      } else if (f) {
        [['hosting', '机房 IP'], ['vpn', 'VPN'], ['proxy', '代理'], ['tor', 'Tor'], ['relay', '中继']].forEach(function (x) {
          if (f[x[0]] === true) risks.push(x[1]);
        });
        if (intel.source === null) notes.push('未能获取 IP 类型信息，无法评估风控风险');
      } else if (intel === undefined) {
        notes.push('IP 类型尚未判定，结果稍后更新');
      } else {
        notes.push('未能获取 IP 类型信息，无法评估风控风险');
      }

      var status;
      if (regionHit) status = 'region';
      else if (apiReachable) status = risks.length ? 'risk' : 'ok';
      else status = 'blocked';

      var regionCodes = DATA.regions[svc.regions].codes;
      var regionListed = null;
      var regionText = '无法判定';
      if (tReachable) {
        var inList = regionCodes.has(String(t.loc || '').toUpperCase());
        regionListed = inList;
        regionText = inList ? '所在地区在支持列表内' : '所在地区不在支持列表内';
        if (!inList) notes.push('Cloudflare 判定所在地区为 ' + (t.loc || '未知') + '，不在 ' + svc.vendor + ' 的支持列表内');
        if (intel && intel.geo && intel.geo.country && intel.geo.country !== String(t.loc || '').toUpperCase()) {
          notes.push('IP 数据库记录的地区（' + intel.geo.country + '）与 ' + svc.host + ' 判定的地区（' + t.loc + '）不一致');
        }
      }
      if (!tReachable) notes.push(svc.host + ' 未连通（' + (trace.error ? trace.error.msg : '无有效数据') + '），请在浏览器中实际打开确认');
      else if (!apiReachable && api.status === 0) {
        notes.push(svc.host + ' 可以访问，但 ' + apiHost(svc.api) + ' 连接失败（' + (api.error ? api.error.msg : '无响应') + '）。常见原因：代理规则没有覆盖该域名、网络拦截或 DNS 问题');
      }
      if (status === 'region') notes.push(svc.vendor + ' 的接口返回了地区限制（HTTP 403），当前出口所在地区不受支持');
      if (api.status === 403 && status === 'blocked') notes.push(svc.vendor + ' 拒绝了来自该 IP 的请求（HTTP 403）');

      var labels = { ok: '可直连', risk: '可连接但有风控风险', region: '地区受限', blocked: '无法连接' };
      return {
        status: status,
        label: labels[status],
        risks: risks,
        notes: notes,
        trace: {
          reachable: tReachable,
          ip: tReachable ? t.ip : null,
          loc: tReachable ? t.loc : null,
          text: tReachable ? '可达 · ' + trace.latencyMs + ' ms' : '不可达 · ' + (trace.error ? trace.error.msg : '无有效数据')
        },
        api: {
          reachable: apiReachable,
          text: apiReachable ? '可达 · ' + api.latencyMs + ' ms'
            : api.status > 0 ? '已拒绝 · HTTP ' + api.status
            : '不可达 · ' + (api.error ? api.error.msg : '无响应')
        },
        regionText: regionText,
        regionListed: regionListed
      };
    },

    ipv6: async function (signal) {
      var r = await API.request('https://api6.ipify.org?format=json', { timeout: 4000, signal: signal });
      return r.ok && r.data && r.data.ip ? r.data.ip : null;
    },

    webrtc: function (signal) {
      return new Promise(function (resolve) {
        if (!window.RTCPeerConnection) return resolve({ supported: false, addresses: [] });
        var pcs = [];
        var closeAll = function () {
          pcs.forEach(function (pc) { try { pc.close(); } catch (e) {} });
        };
        try {
          STUN_SERVERS.forEach(function (url) {
            pcs.push(new RTCPeerConnection({ iceServers: [{ urls: 'stun:' + url }] }));
          });
        } catch (e) {
          closeAll();
          return resolve({ supported: false, addresses: [] });
        }
        if (signal.aborted) {
          closeAll();
          return resolve({ supported: true, addresses: [] });
        }
        var addresses = [];
        var finished = false;
        var pending = pcs.length;

        var cleanup = function () {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          pcs.forEach(function (pc) {
            try {
              pc.onicecandidate = null;
              pc.close();
            } catch (e) {}
          });
        };
        var finish = function () {
          if (finished) return;
          finished = true;
          cleanup();
          resolve({ supported: true, addresses: addresses });
        };
        var onAbort = finish;
        var timer = setTimeout(finish, 6000);
        signal.addEventListener('abort', onAbort);

        var step = function () {
          pending--;
          if (pending <= 0) finish();
        };

        pcs.forEach(function (pc) {
          pc.onicecandidate = function (e) {
            if (finished) return;
            if (e.candidate && e.candidate.candidate) {
              var addr = candidateAddress(e.candidate.candidate);
              if (addr) addresses.push(addr);
            } else {
              pc.onicecandidate = null;
              step();
            }
          };
          try { pc.createDataChannel('ipq'); } catch (e) {}
          pc.createOffer()
            .then(function (offer) { return pc.setLocalDescription(offer); })
            .catch(function () {
            step();
          });
        });
      });
    },

    classifyAddresses: function (raw, exitIp) {
      var supported = !!(raw && raw.supported);
      var seen = {};
      var items = ((raw && raw.addresses) || []).reduce(function (acc, a) {
        if (seen[a.address]) return acc;
        seen[a.address] = true;
        var kind = /\.local$/i.test(a.address) ? 'mdns' : isPrivate(a.address) ? 'private' : 'public';
        acc.push(Object.assign({}, a, { kind: kind }));
        return acc;
      }, []);
      var pub = items.filter(function (i) { return i.kind === 'public'; });
      var sameFamily = function (addr) {
        return !!exitIp && isV4(addr) === isV4(exitIp);
      };
      var otherFamily = pub.filter(function (i) { return exitIp && !sameFamily(i.address); });
      // Different address families are not a leak: a dual-stack host always has both.
      var leaked = pub.filter(function (i) {
        return sameFamily(i.address) && !sameIp(i.address, exitIp);
      });
      var state;
      if (!supported) state = 'unsupported';
      else if (!exitIp && pub.length) state = 'unknown';
      else if (leaked.length) state = 'leak';
      else if (!items.length) state = 'unknown';
      else if (otherFamily.length && !pub.some(function (i) { return sameFamily(i.address); })) state = 'unknown';
      else state = 'clean';
      return { state: state, items: items, leaked: leaked, exitKnown: !!exitIp, otherFamily: otherFamily };
    },

    summarizeExits: function (rows, exitIp) {
      var list = (rows || []).filter(function (r) { return r && r.ip; });
      var v4 = [];
      var v6 = [];
      list.forEach(function (r) { (isV4(r.ip) ? v4 : v6).push(r.ip); });
      function uniq(ips) {
        var out = [];
        ips.forEach(function (ip) {
          if (!out.some(function (kept) { return sameIp(kept, ip); })) out.push(ip);
        });
        return out;
      }
      var d4 = uniq(v4);
      var d6 = uniq(v6);
      var comparable = v4.length >= 2 || v6.length >= 2;
      return {
        rows: list.map(function (r) {
          var v6row = !isV4(r.ip);
          var group = v6row ? v6 : v4;
          var ref = (v6row ? d6 : d4)[0] || null;
          return {
            source: r.source,
            ip: r.ip,
            family: v6row ? 'v6' : 'v4',
            align: group.length < 2 ? 'single' : (ref && sameIp(r.ip, ref) ? 'match' : 'diff'),
            sameAsExit: !!(exitIp && sameIp(r.ip, exitIp))
          };
        }),
        refV4: d4[0] || null,
        refV6: d6[0] || null,
        distinctV4: d4.length,
        distinctV6: d6.length,
        mismatch: comparable ? (d4.length >= 2 || d6.length >= 2) : null
      };
    }
  };
})(window.IPQ = window.IPQ || {});
