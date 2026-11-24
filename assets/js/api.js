(function (IPQ) {
  'use strict';

  var ERR_TEXT = {
    TIMEOUT: '请求超时',
    ABORTED: '已取消',
    NETWORK: '网络错误或被拦截',
    PARSE: '返回内容无法解析'
  };

  function errText(code) {
    if (ERR_TEXT[code]) return ERR_TEXT[code];
    if (code && code.indexOf('HTTP_') === 0) return '服务返回 HTTP ' + code.slice(5);
    return '未知错误';
  }

  IPQ.API = {
    errText: errText,

    // Never rejects: a failed request is a result like any other.
    request: function (url, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var controller = new AbortController();
        var reason = '';
        var outer = opts.signal;
        var start = performance.now();

        var onAbort = function () {
          reason = 'aborted';
          controller.abort();
        };
        if (outer) {
          if (outer.aborted) onAbort();
          else outer.addEventListener('abort', onAbort);
        }
        var timer = setTimeout(function () {
          reason = 'timeout';
          controller.abort();
        }, opts.timeout || 9000);

        function done(result) {
          clearTimeout(timer);
          if (outer) outer.removeEventListener('abort', onAbort);
          resolve(result);
        }

        function fail(err) {
          var code = err && err.name === 'AbortError' ? (reason === 'timeout' ? 'TIMEOUT' : 'ABORTED') : 'NETWORK';
          done({
            ok: false,
            status: 0,
            data: null,
            latencyMs: Math.round(performance.now() - start),
            error: { code: code, msg: errText(code) }
          });
        }

        fetch(url, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          headers: opts.headers || {},
          signal: controller.signal
        })
          .then(function (res) {
            return res.text().then(function (text) {
              return { res: res, text: text };
            });
          })
          .then(function (r) {
            var error = null;
            var data = r.text;
            if (opts.type !== 'text') {
              try {
                data = r.text ? JSON.parse(r.text) : null;
              } catch (e) {
                data = null;
                error = r.res.ok ? 'PARSE' : 'HTTP_' + r.res.status;
              }
            }
            if (!error && !r.res.ok) error = 'HTTP_' + r.res.status;
            done({
              ok: r.res.ok && !error,
              status: r.res.status,
              data: data,
              latencyMs: Math.round(performance.now() - start),
              error: error ? { code: error, msg: errText(error) } : null
            });
          })
          .catch(fail);
      });
    },

    parseTrace: function (text) {
      var out = {};
      String(text || '').split(/\r?\n/).forEach(function (line) {
        var i = line.indexOf('=');
        if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
      });
      return out;
    }
  };
})(window.IPQ = window.IPQ || {});
