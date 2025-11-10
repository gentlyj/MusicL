window.LRC = (function () {
  function parse(raw) {
    if (!raw) return [];
    const lines = raw.replace(/\r/g, '').split('\n');

    // 支持：
    // [mm:ss]
    // [mm:ss.xx]
    // [mm:ss.xxx]
    const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

    const out = [];

    for (const ln of lines) {
      let m;
      let last = 0;
      const stamps = [];

      while ((m = re.exec(ln))) {
        const mm = parseInt(m[1], 10);
        const ss = parseInt(m[2], 10);
        const frac = m[3]; // 可能是 undefined / "0" / "12" / "345"

        let fracVal = 0;
        if (frac) {
          // 按位数缩放：
          // 1 位 -> /10
          // 2 位 -> /100
          // 3 位 -> /1000
          const scale = Math.pow(10, frac.length);
          fracVal = parseInt(frac, 10) / scale;
        }

        stamps.push(mm * 60 + ss + fracVal);
        last = re.lastIndex;
      }

      const text = ln.slice(last).trim();
      if (text && stamps.length) {
        for (const t of stamps) {
          out.push({ t, text });
        }
      }
    }

    return out.sort((a, b) => a.t - b.t);
  }

  function locate(list, sec, hint = 0) {
    let lo = hint;
    let hi = list.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= sec) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  return { parse, locate };
})();
