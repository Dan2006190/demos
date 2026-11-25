/* Иллюстрации букетов: SVG собирается из параметров, без внешних картинок.
   bouquetSVG(seed, palette, kind) → строка <svg>. kind: rose | peony | tulip | mix | wild | box */
(function () {
  'use strict';
  function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  const PALETTES = {
    blush:  { f: ['#f4b8c4', '#e98fa3', '#f7d3da', '#d9677f'], c: '#7a2e45' },
    ruby:   { f: ['#b3122e', '#d8264a', '#8f0d22', '#e0475f'], c: '#4a0612' },
    cream:  { f: ['#f6ecdc', '#efdcc0', '#fbf5ea', '#e6caa2'], c: '#8a6b45' },
    sunset: { f: ['#f28c3b', '#f6b04a', '#e8603c', '#f9cf6b'], c: '#7a3412' },
    lilac:  { f: ['#b9a2e0', '#9d82d1', '#d9cbf0', '#7e62b8'], c: '#3e2b66' },
    mono:   { f: ['#ffffff', '#f3f1ec', '#e9e6df', '#ffffff'], c: '#8d877b' },
    tulip:  { f: ['#ef5a7a', '#f7a1b6', '#ffd36e', '#e6435f'], c: '#6b1a2b' }
  };

  function rose(x, y, r, col, dark) {
    let s = `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;
    for (let i = 0; i < 3; i++) {
      const rr = r * (0.78 - i * 0.22);
      s += `<path d="M${x - rr} ${y + rr * 0.15}a${rr} ${rr * 0.92} 0 1 1 ${rr * 1.6} ${-rr * 0.55}" fill="none" stroke="${dark}" stroke-opacity=".38" stroke-width="${Math.max(1.1, r * 0.09)}" stroke-linecap="round"/>`;
    }
    return s;
  }
  function peony(x, y, r, col, dark, R) {
    let s = '';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + R() * 0.4, d = r * 0.5;
      s += `<ellipse cx="${(x + Math.cos(a) * d).toFixed(1)}" cy="${(y + Math.sin(a) * d).toFixed(1)}" rx="${(r * 0.62).toFixed(1)}" ry="${(r * 0.48).toFixed(1)}" transform="rotate(${(a * 57.3).toFixed(0)} ${(x + Math.cos(a) * d).toFixed(1)} ${(y + Math.sin(a) * d).toFixed(1)})" fill="${col}" stroke="${dark}" stroke-opacity=".18"/>`;
    }
    s += `<circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="${col}" stroke="${dark}" stroke-opacity=".25"/><circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="${dark}" fill-opacity=".18"/>`;
    return s;
  }
  function tulip(x, y, r, col, dark) {
    return `<path d="M${x} ${y + r * 0.9}C${x - r * 1.1} ${y + r * 0.6} ${x - r} ${y - r * 0.6} ${x - r * 0.55} ${y - r}L${x - r * 0.2} ${y - r * 0.35}L${x} ${y - r * 1.05}L${x + r * 0.2} ${y - r * 0.35}L${x + r * 0.55} ${y - r}C${x + r} ${y - r * 0.6} ${x + r * 1.1} ${y + r * 0.6} ${x} ${y + r * 0.9}Z" fill="${col}" stroke="${dark}" stroke-opacity=".3"/>`;
  }
  function daisy(x, y, r, col) {
    let s = '';
    for (let i = 0; i < 10; i++) { const a = i * 36; s += `<ellipse cx="${x}" cy="${y - r * 0.55}" rx="${r * 0.18}" ry="${r * 0.5}" fill="#fff" transform="rotate(${a} ${x} ${y})"/>`; }
    return s + `<circle cx="${x}" cy="${y}" r="${r * 0.28}" fill="${col}"/>`;
  }
  function leaf(x, y, l, a, g) {
    return `<ellipse cx="${x}" cy="${y}" rx="${l * 0.24}" ry="${l * 0.6}" fill="${g}" transform="rotate(${a} ${x} ${y})"/>`;
  }

  window.bouquetSVG = function (seed, paletteName, kind) {
    const P = PALETTES[paletteName] || PALETTES.blush, R = rnd(seed * 97 + 13), W = 300, H = 340;
    const g1 = '#5d7a52', g2 = '#7f9b6c', g3 = '#3f5a3a';
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">`;
    // фон-ореол
    s += `<circle cx="150" cy="140" r="120" fill="${P.f[2]}" opacity=".35"/>`;
    if (kind === 'box') {
      s += `<rect x="70" y="170" width="160" height="120" rx="10" fill="#2b2a28"/><rect x="70" y="170" width="160" height="22" rx="6" fill="#3a3835"/><text x="150" y="250" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="#c9b48a" letter-spacing="2">FLOWERS</text>`;
    }
    // зелень
    for (let i = 0; i < 16; i++) {
      const x = 80 + R() * 140, y = 70 + R() * 100;
      s += leaf(x.toFixed(1), y.toFixed(1), 34 + R() * 26, (R() * 140 - 70).toFixed(0), [g1, g2, g3][i % 3]);
    }
    // цветы
    const cy = kind === 'box' ? 150 : 128, n = kind === 'box' ? 11 : 13;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (kind === 'box' ? 70 : 78);
      pts.push([150 + Math.cos(a) * d * 1.05, cy + Math.sin(a) * d * 0.62, i]);
    }
    pts.sort((a, b) => a[1] - b[1]);
    for (const [x, y, i] of pts) {
      const col = P.f[i % P.f.length], r = 20 + R() * 10, X = x.toFixed(1), Y = y.toFixed(1);
      const k = kind === 'mix' ? ['rose', 'peony', 'tulip', 'rose'][i % 4] : kind === 'wild' ? (i % 3 ? 'daisy' : 'tulip') : kind === 'box' ? 'rose' : kind;
      if (k === 'rose') s += rose(+X, +Y, r, col, P.c);
      else if (k === 'peony') s += peony(+X, +Y, r * 1.15, col, P.c, R);
      else if (k === 'tulip') s += tulip(+X, +Y, r * 0.95, col, P.c);
      else s += daisy(+X, +Y, r * 0.9, P.f[0]);
    }
    if (kind !== 'box') {
      // крафт-упаковка и лента
      s += `<path d="M58 178 L150 330 L242 178 Q150 206 58 178Z" fill="#d6b98c"/><path d="M58 178 L150 330 L120 196Z" fill="#c4a476"/><path d="M242 178 L150 330 L182 196Z" fill="#e3c99d"/>`;
      s += `<path d="M118 250 Q150 262 182 250 L178 262 Q150 274 122 262Z" fill="${P.c}"/><path d="M150 258 l-22 34 l10 2 l12 -30 l12 30 l10 -2Z" fill="${P.c}" opacity=".9"/>`;
    }
    return s + '</svg>';
  };
})();
