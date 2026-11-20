/**
 * VigenCast — karakter vektor bergaya "stylized" (bukan 3D).
 *
 * Dimuat sebagai script klasik (bukan ES module) supaya tetap jalan saat
 * stage.html dibuka lewat file:// (vigen still / vigen check).
 *
 * API:
 *   VigenCast.names                 -> daftar nama karakter
 *   VigenCast.has(name)             -> boolean
 *   VigenCast.draw(ctx, name, { x, y, scale, flip, alpha, t, pose })
 *   VigenCast.scaleFor(name)        -> skala saran
 *
 * Semua gambar deterministik: tanpa Math.random. Gerak hanya fungsi `t`.
 * pose: 'idle' (default) | 'point' | 'hold'
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;

  const SKIN = {
    base: '#d8a273',
    light: '#e9c094',
    shade: '#b3804f',
    line: 'rgba(70,42,20,0.45)',
  };

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

  function capsule(ctx, a, b, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  function ellipse(ctx, cx, cy, rx, ry, color, rot) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function groundShadow(ctx, rx) {
    ctx.save();
    ctx.scale(1, 0.34);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, rx);
    g.addColorStop(0, 'rgba(58,36,16,0.30)');
    g.addColorStop(0.6, 'rgba(58,36,16,0.16)');
    g.addColorStop(1, 'rgba(58,36,16,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---------- peran ----------

  const ROLES = {
    pedagang: {
      tunic: '#a8663a', light: '#c98754', dark: '#7a4524',
      pants: '#6b5236', accent: '#c8321e', hat: 'cap',
      beard: false, moustache: true,
    },
    pelaut: {
      tunic: '#4f6b7a', light: '#6d8b9b', dark: '#38505c',
      pants: '#3f4a52', accent: '#c8321e', hat: 'bandana',
      beard: true, moustache: false,
    },
    serdadu: {
      tunic: '#8d99a3', light: '#aab6bf', dark: '#66727b',
      pants: '#4a4440', accent: '#c8321e', hat: 'helmet',
      beard: false, moustache: false, armor: true,
    },
    raja: {
      tunic: '#9c2b1d', light: '#bf4430', dark: '#6f1c12',
      pants: '#3a2a20', accent: '#d3a040', hat: 'crown',
      beard: true, moustache: true, robe: true,
    },
    petani: {
      tunic: '#5c7a4a', light: '#7c9a66', dark: '#425c34',
      pants: '#6b5a3c', accent: '#d3a040', hat: 'straw',
      beard: false, moustache: false,
    },
  };

  const DEFAULT_SCALE = {
    pedagang: 1, pelaut: 1, serdadu: 1.02, raja: 1.04, petani: 0.98,
  };

  function armPoints(pose) {
    // [bahu, siku, tangan] untuk kiri (x negatif) dan kanan (x positif)
    if (pose === 'point') {
      return {
        left: [[-30, -206], [-46, -162], [-50, -118]],
        right: [[30, -206], [62, -212], [92, -238]],
      };
    }
    if (pose === 'hold') {
      return {
        left: [[-30, -206], [-42, -168], [-16, -148]],
        right: [[30, -206], [42, -168], [16, -148]],
      };
    }
    return {
      left: [[-30, -206], [-46, -164], [-44, -118]],
      right: [[30, -206], [46, -164], [44, -118]],
    };
  }

  function drawArm(ctx, pts, role, side) {
    const [s, e, h] = pts;
    capsule(ctx, s, e, 21, side < 0 ? role.dark : role.tunic);
    capsule(ctx, e, h, 17, SKIN.base);
    ellipse(ctx, h[0], h[1], 11, 10, SKIN.base);
  }

  function drawLegs(ctx, role, t) {
    const step = Math.sin(t * 1.3) * 1.4;
    capsule(ctx, [-16, -118], [-19 + step, -10], 24, role.pants);
    capsule(ctx, [16, -118], [19 - step, -10], 24, role.pants);
    // sepatu
    ellipse(ctx, -20 + step, -5, 17, 8, 'rgba(60,40,22,0.85)');
    ellipse(ctx, 20 - step, -5, 17, 8, 'rgba(60,40,22,0.85)');
  }

  function drawTorso(ctx, role) {
    const g = ctx.createLinearGradient(-34, -210, 34, -100);
    g.addColorStop(0, role.light);
    g.addColorStop(0.55, role.tunic);
    g.addColorStop(1, role.dark);
    ctx.beginPath();
    ctx.moveTo(-33, -214);
    ctx.quadraticCurveTo(0, -222, 33, -214);
    ctx.lineTo(27, -108);
    ctx.quadraticCurveTo(0, -100, -27, -108);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,30,16,0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (role.armor) {
      // pauldron
      ellipse(ctx, -31, -206, 16, 13, '#aab6bf');
      ellipse(ctx, 31, -206, 16, 13, '#aab6bf');
      ellipse(ctx, -31, -208, 12, 9, '#c3ced6');
      ellipse(ctx, 31, -208, 12, 9, '#c3ced6');
      // lapisan dada
      ctx.beginPath();
      ctx.moveTo(-22, -202);
      ctx.quadraticCurveTo(0, -208, 22, -202);
      ctx.lineTo(18, -154);
      ctx.quadraticCurveTo(0, -146, -18, -154);
      ctx.closePath();
      const ag = ctx.createLinearGradient(-22, -202, 22, -154);
      ag.addColorStop(0, '#c3ced6');
      ag.addColorStop(0.6, '#9aa6b0');
      ag.addColorStop(1, '#76828c');
      ctx.fillStyle = ag;
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,44,50,0.45)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // garis tengah + rusuk
      ctx.strokeStyle = 'rgba(50,56,62,0.30)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -204);
      ctx.lineTo(0, -148);
      ctx.stroke();
      for (const k of [0.35, 0.65]) {
        ctx.beginPath();
        ctx.moveTo(-16, -202 + 50 * k);
        ctx.quadraticCurveTo(0, -196 + 50 * k, 16, -202 + 50 * k);
        ctx.stroke();
      }
    }

    if (role.robe) {
      // kerah emas
      ctx.beginPath();
      ctx.moveTo(-30, -212);
      ctx.lineTo(0, -176);
      ctx.lineTo(30, -212);
      ctx.lineWidth = 9;
      ctx.strokeStyle = role.accent;
      ctx.stroke();
    }

    // ikat pinggang
    roundRect(ctx, -29, -126, 58, 15, 5);
    ctx.fillStyle = role.accent;
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,30,16,0.30)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ellipse(ctx, 0, -118, 7, 6, 'rgba(255,236,190,0.85)');

    // lipatan kain
    ctx.strokeStyle = 'rgba(48,30,16,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -204);
    ctx.quadraticCurveTo(-18, -160, -12, -132);
    ctx.stroke();
  }

  function drawHead(ctx, role, t) {
    // leher
    capsule(ctx, [0, -218], [0, -232], 22, SKIN.shade);

    const look = Math.sin(t * 0.8) * 2.2;
    const hx = look;
    const hy = -256;

    // kepala
    const g = ctx.createRadialGradient(hx - 12, hy - 14, 6, hx, hy, 40);
    g.addColorStop(0, SKIN.light);
    g.addColorStop(0.62, SKIN.base);
    g.addColorStop(1, SKIN.shade);
    ellipse(ctx, hx, hy, 33, 36, g);

    // telinga
    ellipse(ctx, hx - 32, hy + 2, 7, 11, SKIN.shade);
    ellipse(ctx, hx + 32, hy + 2, 7, 11, SKIN.shade);

    // rambut dasar
    ctx.beginPath();
    ctx.ellipse(hx, hy - 12, 33, 26, 0, Math.PI, TAU);
    ctx.fillStyle = '#3a2a1c';
    ctx.fill();

    // mata & alis
    ellipse(ctx, hx - 12, hy - 2, 4.2, 5.2, '#2a1c12');
    ellipse(ctx, hx + 12, hy - 2, 4.2, 5.2, '#2a1c12');
    ctx.strokeStyle = 'rgba(60,38,20,0.65)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy - 12);
    ctx.lineTo(hx - 6, hy - 13);
    ctx.moveTo(hx + 6, hy - 13);
    ctx.lineTo(hx + 18, hy - 12);
    ctx.stroke();

    // hidung & mulut
    ctx.strokeStyle = 'rgba(120,70,36,0.55)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 2);
    ctx.lineTo(hx, hy + 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy + 16, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    if (role.beard) {
      ctx.beginPath();
      ctx.moveTo(hx - 24, hy + 8);
      ctx.quadraticCurveTo(hx - 20, hy + 46, hx, hy + 50);
      ctx.quadraticCurveTo(hx + 20, hy + 46, hx + 24, hy + 8);
      ctx.quadraticCurveTo(hx, hy + 26, hx - 24, hy + 8);
      ctx.fillStyle = '#3f2d1d';
      ctx.fill();
    }
    if (role.moustache) {
      ctx.beginPath();
      ctx.moveTo(hx - 16, hy + 12);
      ctx.quadraticCurveTo(hx, hy + 6, hx + 16, hy + 12);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#3a2a1c';
      ctx.stroke();
    }

    drawHat(ctx, role, hx, hy);
  }

  function drawHat(ctx, role, hx, hy) {
    if (role.hat === 'cap') {
      ctx.beginPath();
      ctx.ellipse(hx, hy - 22, 30, 16, 0, Math.PI, TAU);
      ctx.fillStyle = role.dark;
      ctx.fill();
      ctx.fillStyle = role.accent;
      ctx.fillRect(hx - 30, hy - 24, 60, 5);
    } else if (role.hat === 'bandana') {
      ctx.beginPath();
      ctx.ellipse(hx, hy - 20, 32, 20, 0, Math.PI * 1.02, TAU * 0.99);
      ctx.fillStyle = role.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + 28, hy - 18);
      ctx.lineTo(hx + 52, hy - 4);
      ctx.lineTo(hx + 30, hy - 2);
      ctx.closePath();
      ctx.fill();
    } else if (role.hat === 'helmet') {
      ctx.beginPath();
      ctx.ellipse(hx, hy - 18, 34, 24, 0, Math.PI, TAU);
      const hg = ctx.createLinearGradient(hx - 34, hy - 40, hx + 34, hy - 10);
      hg.addColorStop(0, '#c3ced6');
      hg.addColorStop(1, '#6f7b85');
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,44,50,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // pelipis
      ctx.beginPath();
      ctx.moveTo(hx - 34, hy - 14);
      ctx.quadraticCurveTo(hx, hy - 4, hx + 34, hy - 14);
      ctx.strokeStyle = '#8a959e';
      ctx.lineWidth = 6;
      ctx.stroke();
      // jambul
      ctx.beginPath();
      ctx.moveTo(hx, hy - 40);
      ctx.quadraticCurveTo(hx + 8, hy - 62, hx + 22, hy - 56);
      ctx.quadraticCurveTo(hx + 12, hy - 46, hx + 8, hy - 38);
      ctx.closePath();
      ctx.fillStyle = role.accent;
      ctx.fill();
    } else if (role.hat === 'crown') {
      ctx.beginPath();
      ctx.moveTo(hx - 28, hy - 24);
      ctx.lineTo(hx - 28, hy - 42);
      ctx.lineTo(hx - 14, hy - 32);
      ctx.lineTo(hx, hy - 48);
      ctx.lineTo(hx + 14, hy - 32);
      ctx.lineTo(hx + 28, hy - 42);
      ctx.lineTo(hx + 28, hy - 24);
      ctx.closePath();
      ctx.fillStyle = role.accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,20,0.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ellipse(ctx, hx, hy - 30, 4, 4, '#c8321e');
    } else if (role.hat === 'straw') {
      ellipse(ctx, hx, hy - 24, 46, 12, '#d9b672');
      ctx.beginPath();
      ctx.ellipse(hx, hy - 30, 26, 18, 0, Math.PI, TAU);
      ctx.fillStyle = '#c9a45c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,40,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function figure(ctx, o, role) {
    const t = Number(o.t || 0);
    const pose = o.pose === 'point' || o.pose === 'hold' ? o.pose : 'idle';
    const breathe = Math.sin(t * 1.7) * 2;
    const sway = Math.sin(t * 0.9) * 1.6;

    groundShadow(ctx, 64);

    ctx.save();
    ctx.translate(sway, breathe);
    const arms = armPoints(pose);

    // lengan belakang (kiri) digambar sebelum badan
    drawArm(ctx, arms.left, role, -1);
    drawLegs(ctx, role, t);
    drawTorso(ctx, role);
    drawHead(ctx, role, t);
    // lengan depan (kanan)
    drawArm(ctx, arms.right, role, 1);

    ctx.restore();
  }

  const CAST = {
    pedagang: (ctx, o) => figure(ctx, o, ROLES.pedagang),
    pelaut: (ctx, o) => figure(ctx, o, ROLES.pelaut),
    serdadu: (ctx, o) => figure(ctx, o, ROLES.serdadu),
    raja: (ctx, o) => figure(ctx, o, ROLES.raja),
    petani: (ctx, o) => figure(ctx, o, ROLES.petani),
  };

  const names = Object.keys(CAST);

  const scaleFor = (name) => DEFAULT_SCALE[name] || 1;

  function draw(ctx, name, opts) {
    const fn = CAST[name];
    if (!fn) return false;
    const o = opts || {};
    ctx.save();
    ctx.globalAlpha *= Number(o.alpha ?? 1);
    ctx.translate(Number(o.x || 0), Number(o.y || 0));
    const s = Number(o.scale ?? 1);
    if (s !== 1) ctx.scale(s, s);
    if (o.flip) ctx.scale(-1, 1);
    if (o.rotate) ctx.rotate(Number(o.rotate));
    fn(ctx, o);
    ctx.restore();
    return true;
  }

  window.VigenCast = {
    names,
    has: (name) => Object.prototype.hasOwnProperty.call(CAST, name),
    draw,
    scaleFor,
    defaultScale: DEFAULT_SCALE,
  };
})();
