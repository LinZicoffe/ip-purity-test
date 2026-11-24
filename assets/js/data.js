(function (IPQ) {
  'use strict';

  function toSet(codes) {
    return new Set(codes.split(/\s+/));
  }

  IPQ.DATA = {
    regionsChecked: '2026-11-24',

    services: [
      {
        id: 'chatgpt',
        name: 'ChatGPT',
        vendor: 'OpenAI',
        host: 'chatgpt.com',
        site: 'https://chatgpt.com/',
        trace: 'https://chatgpt.com/cdn-cgi/trace',
        api: 'https://api.openai.com/v1/models',
        regions: 'openai'
      },
      {
        id: 'claude',
        name: 'Claude',
        vendor: 'Anthropic',
        host: 'claude.ai',
        site: 'https://claude.ai/',
        trace: 'https://claude.ai/cdn-cgi/trace',
        api: 'https://api.anthropic.com/v1/models',
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        regions: 'anthropic'
      }
    ],

    isRegionError: function (svc, body) {
      if (svc.id === 'chatgpt') {
        var err = body.error || {};
        return err.code === 'unsupported_country_region_territory' || err.type === 'unsupported_country_region_territory';
      }
      return body.type === 'error' && !!body.error && body.error.type === 'permission_error';
    },

    asnTypes: {
      16509: 'hosting',
      14618: 'hosting',
      8075: 'hosting',
      15169: 'hosting',
      14061: 'hosting',
      24940: 'hosting',
      16276: 'hosting',
      20473: 'hosting',
      45102: 'hosting',
      45090: 'hosting',
      31898: 'hosting',
      45338: 'hosting',
      63949: 'hosting'
    },

    keywords: [
      'aws', 'amazon', 'google cloud', 'microsoft', 'azure', 'ovh', 'hetzner', 'digitalocean', 'vultr',
      'alibaba', 'tencent', 'huawei', 'oracle', 'linode', 'akamai', 'hosting', 'datacenter',
      '阿里云', '腾讯云', '华为云'
    ],

    regions: {
      openai: {
        source: 'https://developers.openai.com/api/docs/supported-countries',
        codes: toSet('AD AE AF AG AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BR BS BT BW BZ CA CD CF CG CH CI CL CM CO CR CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GF GH GL GM GN GP GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IS IT JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MQ MR MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PM PS PT PW PY QA RE RO RS RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SZ TD TF TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VN VU WF WS YE YT ZA ZM ZW')
      },
      anthropic: {
        source: 'https://www.anthropic.com/supported-countries',
        codes: toSet('AD AE AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BZ CA CD CF CG CH CI CL CM CO CR CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IS IT JM JO JP KE KG KH KI KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VN VU WS ZA ZM ZW')
      }
    },

    typeLabels: {
      hosting: '机房 / 云服务',
      isp: '住宅 / 运营商宽带',
      business: '商业宽带',
      education: '教育网'
    },

    confidenceLabels: {
      high: '准确度高',
      medium: '准确度中',
      low: '仅供参考'
    }
  };
})(window.IPQ = window.IPQ || {});
