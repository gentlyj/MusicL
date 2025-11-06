window.LRC = (function(){
  function parse(raw){
    if (!raw) return [];
    const lines = raw.replace(/\r/g,'').split('\n');
    const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]/g;
    const out = [];
    for (const ln of lines){
      let m, last = 0; const stamps = [];
      while ((m = re.exec(ln))) {
        const mm = parseInt(m[1],10), ss = parseInt(m[2],10), cs = m[3]? parseInt(m[3],10):0;
        stamps.push(mm*60 + ss + cs/100);
        last = re.lastIndex;
      }
      const text = ln.slice(last).trim();
      if (text && stamps.length) stamps.forEach(t => out.push({ t, text }));
    }
    return out.sort((a,b)=>a.t-b.t);
  }
  function locate(list, sec, hint=0){
    let lo = hint, hi = list.length-1, ans = -1;
    while (lo <= hi){
      const mid = (lo+hi)>>1;
      if (list[mid].t <= sec) { ans = mid; lo = mid+1; }
      else hi = mid-1;
    }
    return ans;
  }
  return { parse, locate };
})();