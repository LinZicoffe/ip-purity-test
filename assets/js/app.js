(function (IPQ) {
  'use strict';

  var API = IPQ.API;
  var CHECKS = IPQ.CHECKS;
  var SCORE = IPQ.SCORE;
  var UI = IPQ.UI;
  var DATA = IPQ.DATA;

  var runId = 0;
  var controller = null;
  var results = null;

  function isV4(ip) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '');
  }

  function verdicts() {
    return DATA.services.map(function (svc) {
      var res = results.services[svc.id];
      return { svc: svc, verdict: res ? CHECKS.verdict(svc, res, results.intel) : null };
    });
  }

  function renderServices() {
    UI.renderServices(verdicts());
  }

  function consistencyData() {
    var exitIp = results.exit && results.exit.ip;
    var pending = !results.exit || results.ipv6 === undefined ||
      DATA.services.some(function (svc) { return !results.services[svc.id]; });
    if (pending) return { pending: true };
    var rows = [];
    if (exitIp) rows.push({ source: results.exit.source, ip: exitIp });
    DATA.services.forEach(function (svc) {
      var res = results.services[svc.id];
      if (res.trace.ok) {
        var t = API.parseTrace(res.trace.data);
        if (t.ip) rows.push({ source: svc.name, ip: t.ip });
      }
    });
    if (results.ipv6) rows.push({ source: 'IPv6 探测', ip: results.ipv6 });
    var v4 = rows.filter(function (r) { return isV4(r.ip); }).map(function (r) { return r.ip; });
    var distinct = v4.filter(function (ip, i) { return v4.indexOf(ip) === i; });
    return {
      pending: false,
      rows: rows,
      exitIp: exitIp,
      distinct: distinct.length,
      mismatch: distinct.length >= 2 ? true : v4.length >= 2 ? false : null,
      dualStack: !!results.ipv6 && isV4(exitIp)
    };
  }

  function renderConsistency() {
    UI.renderConsistency(consistencyData());
  }

  function renderWebrtc() {
    UI.renderWebrtc(CHECKS.classifyAddresses(results.webrtc, results.exit && results.exit.ip));
  }

  function renderScore() {
    var score = SCORE.compute({
      exitIp: results.exit && results.exit.ip,
      intel: results.intel || null,
      consistency: consistencyData(),
      webrtc: CHECKS.classifyAddresses(results.webrtc, results.exit && results.exit.ip),
      services: verdicts().map(function (v) { return v.verdict; }).filter(Boolean)
    });
    UI.renderScore(score);
    UI.renderDetail(score);
    UI.renderFooterLinks(results.exit && results.exit.ip);
  }

  function run() {
    var id = ++runId;
    if (controller) controller.abort();
    controller = new AbortController();
    var signal = controller.signal;
    var isCurrent = function () { return id === runId; };

    results = { exit: null, intel: undefined, services: {}, ipv6: undefined, webrtc: null };
    UI.reset();

    var exitP = CHECKS.exitIp(signal).then(function (exit) {
      if (!isCurrent()) return;
      results.exit = exit;
      UI.renderExit(exit, null);
      renderWebrtc();
      if (!exit.ip) {
        results.intel = null;
        UI.renderRisk(null);
        return;
      }
      return CHECKS.intel(exit.ip, signal, exit).then(function (intel) {
        if (!isCurrent()) return;
        results.intel = intel || null;
        UI.renderExit(exit, results.intel);
        UI.renderRisk(results.intel);
        renderServices();
      }, function (err) {
        if (!isCurrent()) return;
        console.error(err);
        results.intel = null;
        UI.renderRisk(null);
        renderServices();
      });
    });

    var servicePs = DATA.services.map(function (svc) {
      return CHECKS.service(svc, signal).then(function (res) {
        if (!isCurrent()) return;
        results.services[svc.id] = res;
        renderServices();
        renderConsistency();
      });
    });

    var ipv6P = CHECKS.ipv6(signal).then(function (ip) {
      if (!isCurrent()) return;
      results.ipv6 = ip;
      renderConsistency();
    });

    var webrtcP = CHECKS.webrtc(signal).then(function (r) {
      if (!isCurrent()) return;
      results.webrtc = r;
      renderWebrtc();
    });

    Promise.all([exitP].concat(servicePs, [ipv6P, webrtcP])).then(function () {
      if (isCurrent()) {
        renderConsistency();
        renderScore();
      }
    }, function (err) {
      console.error(err);
      if (isCurrent()) {
        renderConsistency();
        renderScore();
      }
    });
  }

  UI.init({ onRerun: run });
  run();
})(window.IPQ = window.IPQ || {});
