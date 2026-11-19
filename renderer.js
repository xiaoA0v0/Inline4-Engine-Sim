/* ============================================================================
 * renderer.js — Canvas 2D 高精度直列四缸 DOHC 剖面动画、曲轴雷达与马力机示波器
 * ========================================================================== */

(function (global) {
  'use strict';

  const CYL_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6'];

  const STROKE_STYLE = {
    INTAKE:  { bg: 'rgba(56, 189, 248, 0.22)',  border: '#38bdf8', text: '#7dd3fc' },
    COMP:    { bg: 'rgba(251, 191, 36, 0.20)',  border: '#fbbf24', text: '#fde68a' },
    POWER:   { bg: 'rgba(239, 68, 68, 0.28)',   border: '#ef4444', text: '#fca5a5' },
    EXHAUST: { bg: 'rgba(148, 163, 184, 0.22)', border: '#94a3b8', text: '#cbd5e1' },
  };

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 绘制气门弹簧
  function drawValveSpring(ctx, cx, topY, bottomY, width) {
    const coils = 5;
    const step = (bottomY - topY) / coils;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - width / 2, topY);
    for (let i = 0; i < coils; i++) {
      const y1 = topY + i * step + step * 0.5;
      const y2 = topY + (i + 1) * step;
      ctx.lineTo(cx + width / 2, y1);
      ctx.lineTo(cx - width / 2, y2);
    }
    ctx.stroke();
  }

  // 绘制凸轮轴桃尖轮廓
  function drawCamLobe(ctx, cx, cy, angleRad, baseR, liftR, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.beginPath();
    ctx.arc(0, 0, baseR, 0.35, Math.PI * 2 - 0.35);
    ctx.quadraticCurveTo(baseR + liftR * 1.15, 0, Math.cos(0.35) * baseR, Math.sin(0.35) * baseR);
    ctx.closePath();
    const grad = ctx.createRadialGradient(-2, -2, 2, 0, 0, baseR + liftR);
    grad.addColorStop(0, '#cbd5e1');
    grad.addColorStop(0.65, color);
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 凸轮中心轴孔
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();
  }

  // =========================================================================
  //  1. 主画布：直列四缸 DOHC 剖面实时动画
  // =========================================================================
  function renderMainEngine(canvas, engine, opts) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // 深色工程背景渐变
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#090e1a');
    bgGrad.addColorStop(1, '#04060c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 细微背景网格
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 高转/断油时添加轻微真实引擎机脚震动
    const vibAmp = engine.paused ? 0 : (engine.limiterActive ? 2.4 : (engine.rpm / 18000) * 1.15);
    const vibX = (Math.random() - 0.5) * vibAmp;
    const vibY = (Math.random() - 0.5) * vibAmp;

    ctx.save();
    ctx.translate(vibX, vibY);

    // 按缸径/行程动态缩放气缸视觉几何（让调缸径和行程肉眼可见变化！）
    const borePx = Math.max(76, Math.min(122, 54 + engine.bore * 0.78));
    const strokePx = Math.max(58, Math.min(96, 26 + engine.stroke * 0.96));
    const crankR = strokePx / 2;
    const rodLenPx = Math.max(88, Math.min(138, strokePx * (engine.rodRatio * 0.65)));

    const crankCenterY = 344;
    const pistonHeight = 40;
    const tdcWristY = crankCenterY - crankR - rodLenPx;
    const deckY = tdcWristY - pistonHeight * 0.58; // 燃烧室顶面基准
    const chamberClearance = Math.max(12, Math.min(28, 36 - engine.compression * 1.45));
    const headTopY = deckY - chamberClearance;
    const camY = headTopY - 34;

    const colSpacing = W / 4;

    // 贯穿四缸的曲轴主轴干（Main Crankshaft Journal）
    const shaftGrad = ctx.createLinearGradient(0, crankCenterY - 9, 0, crankCenterY + 9);
    shaftGrad.addColorStop(0, '#475569');
    shaftGrad.addColorStop(0.5, '#cbd5e1');
    shaftGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = shaftGrad;
    ctx.fillRect(36, crankCenterY - 8, W - 72, 16);

    // 贯穿顶部进/排气凸轮主轴连杆线
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.fillRect(42, camY - 3, W - 84, 6);

    // 逐缸渲染 (Cyl #1 ~ #4)
    for (let i = 0; i < 4; i++) {
      const c = engine.cylinders[i];
      const cx = colSpacing * (i + 0.5);
      const halfBore = borePx / 2;

      // 1. 缸体外壳与水套
      drawRoundedRect(ctx, cx - halfBore - 14, headTopY - 12, borePx + 28, (crankCenterY - crankR * 0.15) - (headTopY - 12), 10);
      const blockGrad = ctx.createLinearGradient(cx - halfBore - 14, 0, cx + halfBore + 14, 0);
      blockGrad.addColorStop(0, '#1e293b');
      blockGrad.addColorStop(0.5, '#293548');
      blockGrad.addColorStop(1, '#172033');
      ctx.fillStyle = blockGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 2. 进气道（左）与排气道（右）
      const portY = headTopY - 6;
      // 进气道
      ctx.fillStyle = c.intakeLift > 0.08
        ? `rgba(56, 189, 248, ${0.15 + c.intakeLift * 0.45})`
        : 'rgba(15, 23, 42, 0.85)';
      drawRoundedRect(ctx, cx - halfBore - 28, portY - 8, 32, 18, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.stroke();

      // 排气道（随排气温度发红 + 回火喷焰）
      const heatGlow = Math.max(0, Math.min(1, (engine.egt - 450) / 450));
      ctx.fillStyle = c.exhaustLift > 0.08
        ? `rgba(249, 115, 22, ${0.2 + c.exhaustLift * 0.55})`
        : `rgba(${40 + heatGlow * 140}, ${24 + heatGlow * 30}, 28, 0.85)`;
      drawRoundedRect(ctx, cx + halfBore - 4, portY - 8, 32, 18, 5);
      ctx.fill();
      ctx.strokeStyle = `rgba(249, 115, 22, ${0.3 + heatGlow * 0.5})`;
      ctx.stroke();

      // 收油回火排气管蓝色/橙色火焰喷射
      if (opts.showGas && c.exhaustFlame > 0.06) {
        const flameLen = 14 + c.exhaustFlame * 30;
        const fGrad = ctx.createLinearGradient(cx + halfBore + 24, portY, cx + halfBore + 24 + flameLen, portY);
        fGrad.addColorStop(0, 'rgba(125, 211, 252, 0.95)');
        fGrad.addColorStop(0.45, 'rgba(251, 146, 60, 0.9)');
        fGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = fGrad;
        ctx.beginPath();
        ctx.moveTo(cx + halfBore + 24, portY - 6);
        ctx.lineTo(cx + halfBore + 24 + flameLen, portY + (Math.random() - 0.5) * 6);
        ctx.lineTo(cx + halfBore + 24, portY + 6);
        ctx.closePath();
        ctx.fill();
      }

      // 3. 气缸内腔（Cylinder Bore）
      const boreBottomY = tdcWristY + strokePx + pistonHeight * 0.55;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(cx - halfBore, headTopY, borePx, boreBottomY - headTopY);

      // 活塞实时 Y 坐标
      const wristY = tdcWristY + c.pistonNorm * strokePx;
      const pistonTopY = wristY - pistonHeight * 0.58;

      // 4. 燃烧室气体与火焰物理渲染
      if (opts.showGas) {
        const chamberH = Math.max(4, pistonTopY - headTopY);
        let gasGrad = ctx.createLinearGradient(cx, headTopY, cx, pistonTopY);

        if (c.combustionGlow > 0.02) {
          const g = c.combustionGlow;
          gasGrad.addColorStop(0, `rgba(255, 252, 225, ${Math.min(0.98, g * 1.1)})`);
          gasGrad.addColorStop(0.35, `rgba(251, 146, 60, ${g * 0.92})`);
          gasGrad.addColorStop(1, `rgba(220, 38, 38, ${g * 0.65})`);
        } else if (c.strokeName === 'INTAKE') {
          const a = 0.22 + (1 - c.pistonNorm * 0.3) * 0.26;
          gasGrad.addColorStop(0, `rgba(56, 189, 248, ${a + 0.12})`);
          gasGrad.addColorStop(1, `rgba(14, 165, 233, ${a * 0.5})`);
        } else if (c.strokeName === 'COMP') {
          const compProg = 1 - c.pistonNorm; // 0 -> 1 越来越压缩、越来越热
          const r = Math.round(56 + compProg * 195);
          const g = Math.round(189 - compProg * 45);
          const b = Math.round(248 - compProg * 210);
          gasGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.32 + compProg * 0.5})`);
          gasGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${0.18 + compProg * 0.3})`);
        } else {
          // 排气冲程余烟
          gasGrad.addColorStop(0, 'rgba(148, 163, 184, 0.32)');
          gasGrad.addColorStop(1, 'rgba(234, 88, 12, 0.16)');
        }

        ctx.fillStyle = gasGrad;
        ctx.fillRect(cx - halfBore + 1, headTopY + 1, borePx - 2, chamberH);
      }

      // 5. DOHC 进/排气门与气门弹簧 + 旋转凸轮轴
      const valveOffset = halfBore * 0.48;
      const inValveX = cx - valveOffset;
      const exValveX = cx + valveOffset;
      const maxValveDrop = 14;
      const inDrop = c.intakeLift * maxValveDrop;
      const exDrop = c.exhaustLift * maxValveDrop;

      // 气门弹簧
      drawValveSpring(ctx, inValveX, camY + 11 + inDrop * 0.55, headTopY - 2, 10);
      drawValveSpring(ctx, exValveX, camY + 11 + exDrop * 0.55, headTopY - 2, 10);

      // 进气门杆与伞面
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(inValveX, camY + 11 + inDrop);
      ctx.lineTo(inValveX, headTopY + 2 + inDrop);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(inValveX - 10, headTopY + 3 + inDrop);
      ctx.lineTo(inValveX + 10, headTopY + 3 + inDrop);
      ctx.lineTo(inValveX + 4, headTopY - 2 + inDrop);
      ctx.lineTo(inValveX - 4, headTopY - 2 + inDrop);
      ctx.closePath();
      ctx.fill();

      // 排气门杆与伞面
      ctx.strokeStyle = '#fdba74';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(exValveX, camY + 11 + exDrop);
      ctx.lineTo(exValveX, headTopY + 2 + exDrop);
      ctx.stroke();
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(exValveX - 10, headTopY + 3 + exDrop);
      ctx.lineTo(exValveX + 10, headTopY + 3 + exDrop);
      ctx.lineTo(exValveX + 4, headTopY - 2 + exDrop);
      ctx.lineTo(exValveX - 4, headTopY - 2 + exDrop);
      ctx.closePath();
      ctx.fill();

      // DOHC 双凸轮旋转角（转速为曲轴的 1/2）
      const inCamAngle = ((c.cycleAngle - 90) * 0.5 * Math.PI) / 180 + Math.PI / 2;
      const exCamAngle = ((c.cycleAngle - 630) * 0.5 * Math.PI) / 180 + Math.PI / 2;
      drawCamLobe(ctx, inValveX, camY, inCamAngle, 8, 7, '#0ea5e9');
      drawCamLobe(ctx, exValveX, camY, exCamAngle, 8, 7, '#f97316');

      // 6. 中置火花塞与高压电弧闪光
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cx - 4, headTopY - 22, 8, 14);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 6, headTopY - 10, 12, 9);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, headTopY - 1);
      ctx.lineTo(cx, headTopY + 5);
      ctx.stroke();

      if (opts.showGas && c.sparkFlash > 0.05) {
        const sR = 9 + c.sparkFlash * 16;
        const sGrad = ctx.createRadialGradient(cx, headTopY + 6, 1, cx, headTopY + 6, sR);
        sGrad.addColorStop(0, `rgba(255, 255, 255, ${c.sparkFlash})`);
        sGrad.addColorStop(0.4, `rgba(125, 211, 252, ${c.sparkFlash * 0.9})`);
        sGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(cx, headTopY + 6, sR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 7. 曲轴配重圆盘与曲柄销（Crankpin）
      const pinAngleRad = (c.crankPinAngle * Math.PI) / 180;
      // 0° 在正上方 (TDC), 顺时针旋转
      const pinX = cx + Math.sin(pinAngleRad) * crankR;
      const pinY = crankCenterY - Math.cos(pinAngleRad) * crankR;

      // 曲轴平衡配重块
      ctx.save();
      ctx.translate(cx, crankCenterY);
      ctx.rotate(pinAngleRad);
      ctx.beginPath();
      ctx.arc(0, 0, crankR + 12, 0.25, Math.PI - 0.25);
      ctx.lineTo(-10, -crankR * 0.45);
      ctx.lineTo(10, -crankR * 0.45);
      ctx.closePath();
      const cwGrad = ctx.createLinearGradient(-24, -24, 24, 24);
      cwGrad.addColorStop(0, '#475569');
      cwGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = cwGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 主轴中心
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#64748b';
      ctx.fill();
      ctx.restore();

      // 8. 锻造 H 型连杆（Connecting Rod）
      ctx.save();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pinX, pinY);
      ctx.lineTo(cx, wristY);
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pinX, pinY);
      ctx.lineTo(cx, wristY);
      ctx.stroke();

      // 曲柄销大头端
      ctx.beginPath();
      ctx.arc(pinX, pinY, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = CYL_COLORS[i];
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // 9. 锻造铝合金活塞与活塞环
      const pGrad = ctx.createLinearGradient(cx - halfBore, 0, cx + halfBore, 0);
      pGrad.addColorStop(0, '#64748b');
      pGrad.addColorStop(0.25, '#e2e8f0');
      pGrad.addColorStop(0.55, '#cbd5e1');
      pGrad.addColorStop(1, '#475569');
      drawRoundedRect(ctx, cx - halfBore + 2, pistonTopY, borePx - 4, pistonHeight, 4);
      ctx.fillStyle = pGrad;
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 三道活塞环（两道气环 + 一道油环）
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - halfBore + 2, pistonTopY + 5, borePx - 4, 2);
      ctx.fillRect(cx - halfBore + 2, pistonTopY + 10, borePx - 4, 2);
      ctx.fillRect(cx - halfBore + 2, pistonTopY + 15, borePx - 4, 2.2);

      // 活塞销 (Wrist Pin)
      ctx.beginPath();
      ctx.arc(cx, wristY, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 气缸壁高亮内边线
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - halfBore, headTopY);
      ctx.lineTo(cx - halfBore, boreBottomY);
      ctx.moveTo(cx + halfBore, headTopY);
      ctx.lineTo(cx + halfBore, boreBottomY);
      ctx.stroke();

      // 10. 顶部缸号 & 相位标注 + 底部冲程状态徽章
      ctx.font = '700 13px "JetBrains Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = CYL_COLORS[i];
      ctx.fillText(`CYL #${i + 1}`, cx, 22);
      ctx.font = '500 11px "JetBrains Mono", Consolas, monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`偏角 ${Math.round(engine.phases[i])}°`, cx, 38);

      if (opts.showLabels) {
        const st = STROKE_STYLE[c.strokeName];
        const pillW = 128;
        const pillH = 26;
        const pillX = cx - pillW / 2;
        const pillY = H - 36;
        drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 13);
        ctx.fillStyle = st.bg;
        ctx.fill();
        ctx.strokeStyle = st.border;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.font = '700 11.5px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = st.text;
        ctx.fillText(`${c.strokeCn} ${c.strokeName} · ${Math.round(c.cycleAngle)}°`, cx, pillY + 17);
      }
    }

    ctx.restore();
  }

  // =========================================================================
  //  2. 曲轴端面相位雷达 (Crankpin Polar View + 720° Firing Strip)
  // =========================================================================
  function renderPhaseRadar(canvas, engine) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, W, H);

    const cx = W * 0.5;
    const cy = H * 0.44;
    const R = Math.min(W, H) * 0.34;

    // 极坐标刻度圈
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    [R, R * 0.6].forEach((rad) => {
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    });

    // 十字基准线
    ctx.beginPath();
    ctx.moveTo(cx - R - 10, cy); ctx.lineTo(cx + R + 10, cy);
    ctx.moveTo(cx, cy - R - 10); ctx.lineTo(cx, cy + R + 10);
    ctx.stroke();

    ctx.font = '600 10px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('TDC 0°', cx, cy - R - 13);
    ctx.fillText('BDC 180°', cx, cy + R + 20);
    ctx.fillText('90°', cx + R + 22, cy + 3);
    ctx.fillText('270°', cx - R - 24, cy + 3);

    // 绘制 4 个曲柄销实时旋转位置
    for (let i = 0; i < 4; i++) {
      const c = engine.cylinders[i];
      const rad = (c.crankPinAngle * Math.PI) / 180;
      // 稍微错开 4 根连杆半径，防止平面曲轴 1&4 或 2&3 重叠遮挡文字
      const armR = R * (0.64 + i * 0.11);
      const px = cx + Math.sin(rad) * armR;
      const py = cy - Math.cos(rad) * armR;

      ctx.strokeStyle = CYL_COLORS[i];
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = CYL_COLORS[i];
      ctx.fill();

      ctx.fillStyle = '#040811';
      ctx.font = '800 10px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(String(i + 1), px, py + 3.5);
    }

    // 曲轴中心点
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();

    // 底部 720° 点火脉冲时间轴
    const barX = 24;
    const barW = W - 48;
    const barY = H - 24;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fillRect(barX, barY - 4, barW, 8);

    // 当前扫描游标
    const cursorX = barX + (engine.crankAngle / 720) * barW;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(cursorX - 1, barY - 10, 2, 20);

    // 四个点火点标记
    for (let i = 0; i < 4; i++) {
      const fireA = ((engine.phases[i] + 360) % 720 + 720) % 720;
      const fx = barX + (fireA / 720) * barW;
      ctx.beginPath();
      ctx.arc(fx, barY, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = CYL_COLORS[i];
      ctx.fill();
      ctx.fillStyle = '#040811';
      ctx.font = '800 8.5px monospace';
      ctx.fillText(String(i + 1), fx, barY + 3);
    }
  }

  // =========================================================================
  //  3. 动态马力机曲线 (Dyno) + 实时排气声波示波器
  // =========================================================================
  function renderDynoAndWave(canvas, engine, audio) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, W, H);

    const padL = 42, padR = 42, padT = 18, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // 网格线
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    const dyno = engine.getDynoCurve();
    const maxHpScale = Math.ceil(dyno.peakHp * 1.15 / 10) * 10 || 100;
    const maxNmScale = Math.ceil(dyno.peakNm * 1.18 / 10) * 10 || 60;

    const rpmToX = (r) => padL + ((r - engine.idleRpm) / Math.max(1000, engine.redline - engine.idleRpm)) * plotW;

    // 绘制扭矩曲线 (Amber)
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    dyno.pts.forEach((pt, idx) => {
      const x = rpmToX(pt.rpm);
      const y = padT + plotH - (pt.torqueNm / maxNmScale) * plotH;
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制马力曲线 (Sky Blue)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    dyno.pts.forEach((pt, idx) => {
      const x = rpmToX(pt.rpm);
      const y = padT + plotH - (pt.hp / maxHpScale) * plotH;
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 实时 Web Audio 排气声波示波器叠加层
    const wave = audio ? audio.getWaveformData() : null;
    if (wave) {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < wave.length; i++) {
        const x = padL + (i / (wave.length - 1)) * plotW;
        const v = (wave[i] - 128) / 128;
        const y = padT + plotH * 0.5 + v * (plotH * 0.36);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 当前 RPM 垂直实时追踪线
    const curX = Math.max(padL, Math.min(W - padR, rpmToX(engine.rpm)));
    ctx.strokeStyle = engine.limiterActive ? '#ef4444' : 'rgba(248, 250, 252, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(curX, padT);
    ctx.lineTo(curX, padT + plotH);
    ctx.stroke();

    // 当前马力与扭矩圆点
    const fullNow = engine.getDynoAtRpm(Math.min(engine.redline, engine.rpm));
    const hpY = padT + plotH - (fullNow.hp / maxHpScale) * plotH;
    const nmY = padT + plotH - (fullNow.torqueNm / maxNmScale) * plotH;

    ctx.beginPath(); ctx.arc(curX, hpY, 5, 0, Math.PI * 2); ctx.fillStyle = '#38bdf8'; ctx.fill();
    ctx.beginPath(); ctx.arc(curX, nmY, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#fbbf24'; ctx.fill();

    // 坐标轴标签
    ctx.font = '600 10px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(`${maxHpScale} HP`, 4, padT + 6);
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'right';
    ctx.fillText(`${maxNmScale} Nm`, W - 4, padT + 6);

    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText(`${(engine.idleRpm / 1000).toFixed(1)}k`, padL, H - 9);
    ctx.textAlign = 'center';
    ctx.fillText(`${((engine.idleRpm + engine.redline) / 2000).toFixed(1)}k RPM`, padL + plotW / 2, H - 9);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f87171';
    ctx.fillText(`${(engine.redline / 1000).toFixed(1)}k 红线`, W - padR, H - 9);

    return dyno;
  }

  global.EngineRenderer = {
    renderMainEngine,
    renderPhaseRadar,
    renderDynoAndWave,
  };
})(window);
