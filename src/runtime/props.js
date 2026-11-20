/**
 * VigenProps — perpustakaan properti vektor bergaya diorama isometrik.
 *
 * Dimuat sebagai script klasik (bukan ES module) supaya tetap jalan saat
 * stage.html dibuka lewat file:// (vigen still / vigen check).
 *
 * API:
 *   VigenProps.names            -> daftar nama prop
 *   VigenProps.has(name)        -> boolean
 *   VigenProps.draw(ctx, name, { x, y, scale, rotate, alpha, t, ...opts })
 *
 * Semua gambar deterministik: tidak memakai Math.random. Animasi hanya
 * fungsi dari `t` (detik lokal) dan opsi yang diberikan.
 */
(function () {
  'use strict';

  const COS = Math.cos(Math.PI / 6);
  const SIN = 0.5;
  const TAU = Math.PI * 2;

  const P = {
    woodTop: '#c79a68',
    woodLeft: '#a97b4c',
    woodRight: '#8d6238',
    woodLine: 'rgba(74,46,20,0.55)',
    woodDarkTop: '#8a5c34',
    woodDarkLeft: '#6f4728',
    woodDarkRight: '#55351d',
    paper: '#f4e8d4',
    paperMid: '#e6d2ae',
    paperDeep: '#d2b98f',
    paperLine: 'rgba(120,92,56,0.45)',
    ink: '#241a12',
    inkSoft: 'rgba(36,26,18,0.62)',
    gold: '#d3a040',
    goldLight: '#f0c25e',
    goldDark: '#8f5c16',
    red: '#c8321e',
    redDark: '#8f2314',
    green: '#3f6b4a',
    greenDark: '#2b4a34',
    steel: '#8d99a3',
    steelDark: '#5f6a73',
    glass: 'rgba(255,236,186,0.92)',
    shadow: 'rgba(58,36,16,0.30)',
  };

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function fillPoly(ctx, pts, color) {
    poly(ctx, pts);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function shadow(ctx, rx, ry, a) {
    ctx.save();
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
    g.addColorStop(0, `rgba(58,36,16,${a})`);
    g.addColorStop(0.55, `rgba(58,36,16,${a * 0.55})`);
    g.addColorStop(1, 'rgba(58,36,16,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function boxFaces(cx, cy, w, d, h) {
    const ux = COS * w;
    const uy = SIN * w;
    const vx = -COS * d;
    const vy = SIN * d;
    const px = cx - ux - vx;
    const py = cy - uy - vy - h;
    return {
      ux, uy, vx, vy, px, py,
      top: [
        [px, py], [px + ux, py + uy], [px + ux + vx, py + uy + vy], [px + vx, py + vy],
      ],
      right: [
        [px + ux, py + uy], [px + ux + vx, py + uy + vy],
        [px + ux + vx, py + uy + vy + h], [px + ux, py + uy + h],
      ],
      left: [
        [px + vx, py + vy], [px + ux + vx, py + uy + vy],
        [px + ux + vx, py + uy + vy + h], [px + vx, py + vy + h],
      ],
    };
  }

  /**
   * Kotak isometrik. (cx, cy) = titik depan-bawah (paling dekat kamera).
   * w = lebar sumbu kanan, d = kedalaman sumbu kiri, h = tinggi.
   */
  function isoBox(ctx, cx, cy, w, d, h, colors) {
    const f = boxFaces(cx, cy, w, d, h);
    fillPoly(ctx, f.top, colors.top);
    fillPoly(ctx, f.right, colors.right);
    fillPoly(ctx, f.left, colors.left);

    if (colors.line) {
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    return f;
  }

  function isoEllipse(ctx, cx, cy, rx, ry, color) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function paperGrain(ctx, w, h, seed) {
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const x = ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1 * w - w / 2;
      const y = ((Math.sin(i * 78.233 + seed) * 12345.6789) % 1 + 1) % 1 * h - h / 2;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(120,80,40,0.08)' : 'rgba(255,250,238,0.18)';
      ctx.fillRect(x, y, 2, 1);
    }
    ctx.restore();
  }

  // ---------- props ----------

  function map(ctx, o) {
    shadow(ctx, 260, 120, 0.16);
    ctx.save();
    ctx.transform(1, 0.10, -0.20, 1, 0, 0);
    const w = 430;
    const h = 290;
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, '#f8efdd');
    g.addColorStop(0.55, P.paper);
    g.addColorStop(1, P.paperDeep);
    roundRect(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,92,56,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120,92,56,0.26)';
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 4, -h / 2 + 8);
      ctx.lineTo((i * w) / 4, h / 2 - 8);
      ctx.stroke();
    }

    // garis pantai
    ctx.strokeStyle = 'rgba(74,52,32,0.58)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-168, 42);
    ctx.bezierCurveTo(-128, -42, -44, -12, -12, -74);
    ctx.bezierCurveTo(28, -124, 92, -62, 122, -32);
    ctx.bezierCurveTo(162, 10, 112, 72, 62, 62);
    ctx.bezierCurveTo(12, 54, -42, 112, -92, 92);
    ctx.bezierCurveTo(-134, 76, -186, 92, -168, 42);
    ctx.stroke();
    ctx.fillStyle = 'rgba(201,138,46,0.14)';
    ctx.fill();

    // rute pelayaran
    const phase = Number(o.t || 0) * 0.16;
    for (let i = 0; i < 7; i++) {
      const p = ((phase + i / 7) % 1 + 1) % 1;
      ctx.fillStyle = 'rgba(200,50,30,0.82)';
      ctx.beginPath();
      ctx.arc(-150 + p * 280, 44 - Math.sin(p * Math.PI) * 96, 4.2, 0, TAU);
      ctx.fill();
    }

    // kompas
    ctx.save();
    ctx.translate(w / 2 - 56, h / 2 - 56);
    ctx.strokeStyle = 'rgba(74,52,32,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    paperGrain(ctx, w, h, 3);
    ctx.restore();
  }

  function book(ctx, o) {
    shadow(ctx, 170, 80, 0.20);
    const y = -4;
    isoBox(ctx, 0, y, 230, 170, 34, {
      top: P.paperMid, left: P.paperDeep, right: P.paperDeep, line: 'rgba(90,64,32,0.35)',
    });
    isoBox(ctx, 0, y - 34, 214, 156, 22, {
      top: '#f7ecd6', left: '#e8d4b0', right: '#d8bf95', line: 'rgba(120,92,56,0.35)',
    });
    isoBox(ctx, 0, y - 56, 236, 176, 12, {
      top: P.green, left: P.greenDark, right: P.greenDark, line: 'rgba(20,40,28,0.55)',
    });
    // halaman bergaris
    ctx.save();
    ctx.strokeStyle = 'rgba(120,92,56,0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const yy = y - 52 - i * 5;
      ctx.beginPath();
      ctx.moveTo(-86, yy);
      ctx.lineTo(86, yy - 20);
      ctx.stroke();
    }
    ctx.restore();
    // pita penanda
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(58, y - 66);
    ctx.lineTo(74, y - 66);
    ctx.lineTo(74, y - 4);
    ctx.lineTo(66, y - 14);
    ctx.lineTo(58, y - 4);
    ctx.closePath();
    ctx.fill();
  }

  function scroll(ctx, o) {
    shadow(ctx, 190, 70, 0.18);
    const w = 250;
    const h = 84;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#f8efdd');
    g.addColorStop(0.5, P.paper);
    g.addColorStop(1, P.paperDeep);
    roundRect(ctx, -w / 2, -h / 2, w, h, 12);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,92,56,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (const side of [-1, 1]) {
      const x = (side * w) / 2;
      ctx.fillStyle = side < 0 ? '#e6d2ae' : '#d8bf95';
      ctx.beginPath();
      ctx.ellipse(x, 0, 22, h / 2, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,92,56,0.35)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,92,56,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, 0, 9, h / 2 - 12, 0, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(90,64,32,0.40)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const yy = -18 + i * 12;
      ctx.beginPath();
      ctx.moveTo(-88, yy);
      ctx.lineTo(88, yy + 2);
      ctx.stroke();
    }
    // pita
    ctx.fillStyle = P.red;
    ctx.fillRect(-6, -h / 2, 12, h);
  }

  function ship(ctx, o) {
    const bob = Math.sin(Number(o.t || 0) * 1.5) * 4;
    shadow(ctx, 170, 46, 0.22);
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(-0.10);

    const hull = ctx.createLinearGradient(-140, 0, 140, 60);
    hull.addColorStop(0, '#7a4a26');
    hull.addColorStop(0.5, '#a06a38');
    hull.addColorStop(1, '#5f3619');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-140, 0);
    ctx.quadraticCurveTo(-116, 66, 0, 76);
    ctx.quadraticCurveTo(116, 66, 140, -4);
    ctx.lineTo(96, 16);
    ctx.quadraticCurveTo(0, 50, -96, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#d9b27a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 138, 22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,48,20,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // tiang
    ctx.strokeStyle = '#5b3a1e';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, -186);
    ctx.stroke();

    // layar
    const sail = ctx.createLinearGradient(-76, -176, 76, -20);
    sail.addColorStop(0, '#fdf6e8');
    sail.addColorStop(1, '#dcc6a0');
    ctx.fillStyle = sail;
    ctx.beginPath();
    ctx.moveTo(6, -170);
    ctx.quadraticCurveTo(106, -116, 68, -28);
    ctx.quadraticCurveTo(34, -52, 6, -40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,92,56,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // layar depan
    ctx.fillStyle = 'rgba(250,242,226,0.92)';
    ctx.beginPath();
    ctx.moveTo(-4, -150);
    ctx.quadraticCurveTo(-70, -108, -44, -34);
    ctx.quadraticCurveTo(-20, -52, -4, -42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // bendera
    const wave = Math.sin(Number(o.t || 0) * 2.2) * 4;
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(0, -186);
    ctx.quadraticCurveTo(36 + wave, -180, 50, -166);
    ctx.quadraticCurveTo(26 + wave, -158, 0, -166);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function coins(ctx, o) {
    shadow(ctx, 120, 44, 0.20);
    const n = Math.max(1, Math.min(4, Number(o.count || 3)));
    for (let i = 0; i < n; i++) {
      const x = (i % 2 === 0 ? -1 : 1) * (i * 10);
      const y = -i * 15;
      isoEllipse(ctx, x, y, 62, 20, 'rgba(90,56,12,0.35)');
      const g = ctx.createLinearGradient(-50, y - 20, 50, y + 20);
      g.addColorStop(0, P.goldLight);
      g.addColorStop(0.5, P.gold);
      g.addColorStop(1, P.goldDark);
      isoEllipse(ctx, x, y - 4, 62, 20, g);
      ctx.strokeStyle = 'rgba(90,56,12,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y - 4, 62, 20, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,236,180,0.45)';
      ctx.beginPath();
      ctx.ellipse(x - 16, y - 10, 20, 6, -0.3, 0, TAU);
      ctx.fill();
    }
  }

  function scale(ctx, o) {
    shadow(ctx, 170, 62, 0.20);
    // alas
    isoBox(ctx, 0, 0, 170, 120, 26, {
      top: P.woodTop, left: P.woodLeft, right: P.woodRight, line: P.woodLine,
    });
    // tiang
    ctx.fillStyle = P.steel;
    ctx.fillRect(-7, -236, 14, 214);
    ctx.fillStyle = P.steelDark;
    ctx.fillRect(1, -236, 6, 214);
    ctx.fillStyle = P.gold;
    ctx.beginPath();
    ctx.arc(0, -242, 12, 0, TAU);
    ctx.fill();

    const tilt = Math.sin(Number(o.t || 0) * 0.9) * 0.05;
    ctx.save();
    ctx.translate(0, -232);
    ctx.rotate(tilt);
    ctx.fillStyle = P.steelDark;
    ctx.fillRect(-128, -4, 256, 8);
    ctx.fillStyle = P.gold;
    ctx.fillRect(-128, -4, 6, 8);
    ctx.fillRect(122, -4, 6, 8);

    for (const side of [-1, 1]) {
      const x = side * 118;
      ctx.strokeStyle = 'rgba(70,70,70,0.75)';
      ctx.lineWidth = 1.6;
      for (const dx of [-18, 18]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, 4);
        ctx.lineTo(x + dx * 0.7, 46);
        ctx.stroke();
      }
      ctx.fillStyle = P.steelDark;
      ctx.beginPath();
      ctx.ellipse(x, 48, 42, 10, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = side < 0 ? P.gold : P.green;
      ctx.beginPath();
      ctx.ellipse(x, 44, 34, 8, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function lantern(ctx, o) {
    const t = Number(o.t || 0);
    const glow = 0.62 + Math.sin(t * 2.2) * 0.06;
    const g = ctx.createRadialGradient(0, -96, 10, 0, -96, 190);
    g.addColorStop(0, `rgba(255,214,140,${0.42 * glow})`);
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -96, 190, 0, TAU);
    ctx.fill();

    shadow(ctx, 64, 24, 0.16);
    // badan
    ctx.fillStyle = '#4a3a2a';
    roundRect(ctx, -34, -190, 68, 128, 12);
    ctx.fill();
    ctx.fillStyle = `rgba(255,224,160,${0.92 * glow})`;
    roundRect(ctx, -24, -178, 48, 104, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,214,0.85)';
    roundRect(ctx, -8, -166, 16, 80, 6);
    ctx.fill();
    // atap & gagang
    ctx.fillStyle = '#3a2c1e';
    ctx.beginPath();
    ctx.moveTo(-40, -190);
    ctx.quadraticCurveTo(0, -226, 40, -190);
    ctx.lineTo(30, -186);
    ctx.quadraticCurveTo(0, -212, -30, -186);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3a2c1e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, -214, 22, Math.PI, TAU);
    ctx.stroke();
    // kaki
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(-30, -62, 12, 10);
    ctx.fillRect(18, -62, 12, 10);
  }

  function lerpPt(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function crate(ctx, o) {
    shadow(ctx, 170, 70, 0.20);
    const f = isoBox(ctx, 0, 0, 210, 170, 150, {
      top: P.woodDarkTop, left: P.woodDarkLeft, right: P.woodDarkRight, line: P.woodLine,
    });
    const [r0, r1, r2, r3] = f.right;
    const [l0, l1, l2, l3] = f.left;

    ctx.save();
    ctx.strokeStyle = 'rgba(40,24,10,0.35)';
    ctx.lineWidth = 1.6;
    for (const k of [1 / 3, 2 / 3]) {
      ctx.beginPath();
      ctx.moveTo(...lerpPt(r0, r3, k));
      ctx.lineTo(...lerpPt(r1, r2, k));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(...lerpPt(l0, l3, k));
      ctx.lineTo(...lerpPt(l1, l2, k));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,190,140,0.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(...lerpPt(r0, r2, 0.10));
    ctx.lineTo(...lerpPt(r1, r3, 0.10));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...lerpPt(r1, r3, 0.10));
    ctx.lineTo(...lerpPt(r0, r2, 0.10));
    ctx.stroke();
    ctx.restore();
  }

  function spice(ctx, o) {
    shadow(ctx, 150, 54, 0.18);
    // kain
    ctx.fillStyle = 'rgba(200,50,30,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -8, 120, 40, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,30,18,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, -4, 104, 32, 0, 0, TAU);
    ctx.fill();

    // tumpukan rempah
    ctx.fillStyle = '#6b4423';
    ctx.beginPath();
    ctx.ellipse(0, -26, 72, 30, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7d5129';
    ctx.beginPath();
    ctx.ellipse(-18, -36, 40, 20, -0.2, 0, TAU);
    ctx.fill();

    // biji cengkih
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399;
      const r = 8 + (i % 7) * 9;
      const x = Math.cos(a) * r * 1.5;
      const y = -18 - Math.sin(a * 1.7) * 10 - (i % 3) * 4;
      const s = 0.8 + (i % 4) * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.scale(s, s);
      ctx.fillStyle = i % 3 === 0 ? '#7a4a26' : '#5f3619';
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3f2a16';
      ctx.fillRect(6, -1.4, 7, 2.8);
      ctx.restore();
    }
  }

  function compass(ctx, o) {
    shadow(ctx, 96, 40, 0.18);
    isoEllipse(ctx, 0, 0, 92, 32, P.woodRight);
    isoEllipse(ctx, 0, -8, 84, 28, P.gold);
    isoEllipse(ctx, 0, -12, 70, 23, '#f7ecd6');

    ctx.save();
    ctx.translate(0, -14);
    ctx.scale(1, 0.34);
    ctx.strokeStyle = 'rgba(90,64,32,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
      ctx.lineTo(Math.cos(a) * 62, Math.sin(a) * 62);
      ctx.stroke();
    }
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, TAU);
    ctx.stroke();
    // jarum
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(0, -56); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.moveTo(0, 56); ctx.lineTo(7, 6); ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function fort(ctx, o) {
    shadow(ctx, 220, 90, 0.20);
    const wall = { top: '#b7a88c', left: '#8d7f66', right: '#6f6350', line: 'rgba(50,40,28,0.45)' };
    isoBox(ctx, 0, 0, 260, 170, 96, wall);
    // menara
    isoBox(ctx, -70, -96, 86, 78, 74, wall);
    isoBox(ctx, 82, -82, 74, 66, 62, wall);
    // celah
    ctx.fillStyle = 'rgba(30,22,14,0.75)';
    ctx.fillRect(-84, -150, 10, 22);
    ctx.fillRect(-64, -150, 10, 22);
    // bendera
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-70, -170);
    ctx.lineTo(-70, -238);
    ctx.stroke();
    const wave = Math.sin(Number(o.t || 0) * 2.4) * 3;
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(-70, -238);
    ctx.quadraticCurveTo(-38 + wave, -232, -26, -220);
    ctx.quadraticCurveTo(-46 + wave, -214, -70, -220);
    ctx.closePath();
    ctx.fill();
    // pintu
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.moveTo(-22, -2);
    ctx.lineTo(-22, -58);
    ctx.quadraticCurveTo(0, -78, 22, -58);
    ctx.lineTo(22, -2);
    ctx.closePath();
    ctx.fill();
  }

  function flag(ctx, o) {
    shadow(ctx, 60, 24, 0.16);
    ctx.strokeStyle = '#5b3a1e';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -230);
    ctx.stroke();
    ctx.fillStyle = P.gold;
    ctx.beginPath();
    ctx.arc(0, -234, 8, 0, TAU);
    ctx.fill();
    const wave = Math.sin(Number(o.t || 0) * 2.4) * 6;
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(4, -226);
    ctx.quadraticCurveTo(74 + wave, -214, 108, -190);
    ctx.quadraticCurveTo(66 + wave, -172, 4, -184);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,214,0.85)';
    ctx.beginPath();
    ctx.arc(62, -198, 11, 0, TAU);
    ctx.fill();
  }

  const PROPS = {
    map, book, scroll, ship, coins, scale, lantern, crate, spice, compass, fort, flag,
  };

  const names = Object.keys(PROPS);

  // Skala saran agar semua prop terasa satu dunia (dipakai juga oleh
  // tools/props-sheet.html).
  const DEFAULT_SCALE = {
    map: 0.56, book: 0.78, scroll: 0.82, ship: 0.56,
    coins: 0.85, scale: 0.56, lantern: 0.78, crate: 0.72,
    spice: 0.82, compass: 0.95, fort: 0.62, flag: 0.72,
  };

  const scaleFor = (name) => DEFAULT_SCALE[name] || 0.7;

  function draw(ctx, name, opts) {
    const fn = PROPS[name];
    if (!fn) return false;
    const o = opts || {};
    ctx.save();
    ctx.globalAlpha *= Number(o.alpha ?? 1);
    ctx.translate(Number(o.x || 0), Number(o.y || 0));
    if (o.rotate) ctx.rotate(Number(o.rotate));
    const s = Number(o.scale ?? 1);
    if (s !== 1) ctx.scale(s, s);
    fn(ctx, o);
    ctx.restore();
    return true;
  }

  window.VigenProps = {
    names,
    has: (name) => Object.prototype.hasOwnProperty.call(PROPS, name),
    draw,
    scaleFor,
    defaultScale: DEFAULT_SCALE,
    isoBox,
    shadow,
    colors: P,
  };
})();
