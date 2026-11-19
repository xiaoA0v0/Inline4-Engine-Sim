/* ============================================================================
 * app.js — 交互界面控制、全参数绑定、键盘操控与 60FPS 主渲染循环
 * ========================================================================== */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const engine = new window.Inline4Engine();
  const audio = new window.EngineAudioSynth(engine);

  const mainCanvas = $('#engine-canvas');
  const phaseCanvas = $('#phase-canvas');
  const dynoCanvas = $('#dyno-canvas');

  const viewOpts = {
    showLabels: true,
    showGas: true,
  };

  let revBtnHeld = false;
  let keyRevHeld = false;
  let sliderThrottle = 0;

  // 非线性时间倍率映射 (1~100 -> 0.008x ~ 1.0x)，让慢放观察区间极其细腻
  function sliderToTimeScale(val) {
    const t = (Number(val) - 1) / 99;
    return 0.008 * Math.pow(125, t);
  }

  function updateTimeScaleUI(sliderVal) {
    const ts = sliderToTimeScale(sliderVal);
    engine.timeScale = ts;
    const label = ts < 0.02 ? '超慢观察' : ts < 0.12 ? '慢放观察' : ts < 0.4 ? '清晰动态' : ts < 0.85 ? '高速运转' : '真实倍速';
    $('#val-timescale').textContent = `${ts < 0.1 ? ts.toFixed(3) : ts.toFixed(2)}x (${label})`;
  }

  // 把 engine 当前全部状态同步回右侧调校滑块和顶部元数据标签
  function syncAllControlsFromEngine() {
    $('#sel-crank-type').value = engine.crankType;
    for (let i = 0; i < 4; i++) {
      const deg = Math.round(((engine.phases[i] % 720) + 720) % 720);
      $(`#ph-${i + 1}`).value = String(deg);
      $(`#val-ph-${i + 1}`).textContent = `${deg}°`;
    }

    $('#rng-ign-adv').value = String(engine.ignAdvance);
    $('#val-ign-adv').textContent = `${engine.ignAdvance}°`;

    $('#rng-cam-overlap').value = String(engine.camOverlap);
    const camDesc = engine.camOverlap < 14 ? '街道低扭凸轮' : engine.camOverlap < 28 ? '运动高转凸轮' : '激进赛道高角度';
    $('#val-cam-overlap').textContent = `${engine.camOverlap}° (${camDesc})`;

    $('#rng-bore').value = String(engine.bore);
    $('#val-bore').textContent = `${engine.bore.toFixed(1)} mm`;

    $('#rng-stroke').value = String(engine.stroke);
    $('#val-stroke').textContent = `${engine.stroke.toFixed(1)} mm`;

    $('#rng-rod-ratio').value = String(engine.rodRatio);
    $('#val-rod-ratio').textContent = engine.rodRatio.toFixed(2);

    $('#rng-comp').value = String(engine.compression);
    $('#val-comp').textContent = `${engine.compression.toFixed(1)} : 1`;

    $('#rng-flywheel').value = String(engine.flywheel);
    const fwDesc = engine.flywheel < 0.75 ? '赛用极轻飞轮' : engine.flywheel < 1.15 ? '轻量化高转飞轮' : '重飞轮稳怠速';
    $('#val-flywheel').textContent = `${engine.flywheel.toFixed(2)} (${fwDesc})`;

    $('#rng-idle').value = String(engine.idleRpm);
    $('#val-idle').textContent = `${engine.idleRpm.toLocaleString()} RPM`;

    $('#rng-redline').value = String(engine.redline);
    $('#val-redline').textContent = `${engine.redline.toLocaleString()} RPM`;

    $('#sel-limiter-type').value = engine.limiterType;
    $('#sel-exhaust').value = engine.exhaust;
    $('#chk-pops').checked = engine.popsEnabled;

    // 排量与规格汇总
    const cc = engine.getDisplacementCC();
    const bs = engine.bore / engine.stroke;
    const bsDesc = bs > 1.35 ? '超短行程高转机' : bs > 1.05 ? '短行程运动机' : '长行程低扭机';
    $('#spec-cc').textContent = `${Math.round(cc)} cc`;
    $('#spec-single-cc').textContent = `${(cc / 4).toFixed(1)} cc`;
    $('#spec-bs-ratio').textContent = `${bs.toFixed(2)} (${bsDesc})`;

    // 顶部徽章与点火间隔
    const layoutInfo = window.CRANK_LAYOUTS[engine.crankType];
    $('#meta-crank').textContent = layoutInfo ? layoutInfo.name : '自定义曲柄相位 (Custom DIY)';
    const fire = engine.getFiringSummary();
    $('#meta-order').textContent = `点火顺序 ${fire.order}`;
    $('#meta-disp').textContent = `${Math.round(cc)} cc`;
    $('#phase-intervals').textContent = `间隔: ${fire.intervals}`;
  }

  function syncGearUI() {
    $$('.gear-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.gear) === engine.gear);
    });
    $('#tele-gear').textContent = engine.gear === 0 ? 'N' : String(engine.gear);
    $('#val-gear-ratio').textContent =
      engine.gear === 0 ? '空挡 (无负载，极速拉转)' : `${engine.gear} 档 · 总减速比 ${window.GEAR_RATIOS[engine.gear]} : 1`;
  }

  function updateEffectiveThrottle() {
    const active = revBtnHeld || keyRevHeld ? 1.0 : sliderThrottle;
    engine.throttle = active;
    $('#val-throttle').textContent = `${Math.round(active * 100)}%`;
    $('#btn-rev').classList.toggle('pressed', revBtnHeld || keyRevHeld);
  }

  function toggleAudio() {
    const on = audio.toggle();
    const btn = $('#btn-audio');
    btn.classList.toggle('on', on);
    btn.textContent = on ? '🔊 声浪已开启' : '🔇 开启声浪';
  }

  // ==================== 绑定预设与调校面板事件 ====================
  $$('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      engine.applyPreset(btn.dataset.preset);
      syncAllControlsFromEngine();
    });
  });

  $$('.tuner-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tuner-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.tuner-pane').forEach((p) => p.classList.toggle('active', p.id === `tuner-${tab.dataset.tuner}`));
    });
  });

  $('#btn-audio').addEventListener('click', toggleAudio);

  $('#btn-pause').addEventListener('click', () => {
    engine.paused = !engine.paused;
    $('#btn-pause').textContent = engine.paused ? '▶ 继续' : '⏸ 暂停';
  });

  $('#chk-labels').addEventListener('change', (e) => { viewOpts.showLabels = e.target.checked; });
  $('#chk-gas').addEventListener('change', (e) => { viewOpts.showGas = e.target.checked; });

  // 按住轰油门按钮（支持鼠标与触屏）
  const revBtn = $('#btn-rev');
  const startRev = (e) => { e.preventDefault(); revBtnHeld = true; updateEffectiveThrottle(); };
  const stopRev = () => { revBtnHeld = false; updateEffectiveThrottle(); };
  revBtn.addEventListener('mousedown', startRev);
  revBtn.addEventListener('touchstart', startRev, { passive: false });
  window.addEventListener('mouseup', stopRev);
  window.addEventListener('touchend', stopRev);

  $('#btn-blip').addEventListener('click', () => engine.triggerBlip());

  $('#rng-throttle').addEventListener('input', (e) => {
    sliderThrottle = Number(e.target.value) / 100;
    updateEffectiveThrottle();
  });

  // 定速锁定 RPM 模式
  $('#chk-rpm-lock').addEventListener('change', (e) => {
    engine.rpmLocked = e.target.checked;
    $('#rng-rpm-lock').disabled = !engine.rpmLocked;
    if (engine.rpmLocked) {
      engine.targetRpm = Number($('#rng-rpm-lock').value);
    }
  });

  $('#rng-rpm-lock').addEventListener('input', (e) => {
    engine.targetRpm = Number(e.target.value);
    $('#val-rpm-lock').textContent = `目标: ${engine.targetRpm.toLocaleString()} RPM`;
  });

  // 变速箱档位按钮
  $$('.gear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetGear = Number(btn.dataset.gear);
      engine.shiftGear(targetGear - engine.gear);
      syncGearUI();
    });
  });

  // 动画时间倍率
  $('#rng-timescale').addEventListener('input', (e) => updateTimeScaleUI(e.target.value));
  $$('.chip-mini').forEach((chip) => {
    chip.addEventListener('click', () => {
      $('#rng-timescale').value = chip.dataset.ts;
      updateTimeScaleUI(chip.dataset.ts);
    });
  });

  // 曲轴架构选择
  $('#sel-crank-type').addEventListener('change', (e) => {
    engine.setCrankLayout(e.target.value);
    syncAllControlsFromEngine();
  });

  // 四缸独立相位角 DIY 滑块
  $$('.phase-range').forEach((rng) => {
    rng.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.cyl);
      engine.phases[idx] = Number(e.target.value);
      engine.crankType = 'custom';
      syncAllControlsFromEngine();
    });
  });

  // 其余机械与 ECU 滑块
  $('#rng-ign-adv').addEventListener('input', (e) => { engine.ignAdvance = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-cam-overlap').addEventListener('input', (e) => { engine.camOverlap = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-bore').addEventListener('input', (e) => { engine.bore = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-stroke').addEventListener('input', (e) => { engine.stroke = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-rod-ratio').addEventListener('input', (e) => { engine.rodRatio = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-comp').addEventListener('input', (e) => { engine.compression = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-flywheel').addEventListener('input', (e) => { engine.flywheel = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-idle').addEventListener('input', (e) => { engine.idleRpm = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#rng-redline').addEventListener('input', (e) => { engine.redline = Number(e.target.value); syncAllControlsFromEngine(); });
  $('#sel-limiter-type').addEventListener('change', (e) => { engine.limiterType = e.target.value; });
  $('#sel-exhaust').addEventListener('change', (e) => { engine.exhaust = e.target.value; });
  $('#chk-pops').addEventListener('change', (e) => { engine.popsEnabled = e.target.checked; });
  $('#rng-volume').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('#val-volume').textContent = `${v}%`;
    audio.setVolume(v / 100);
  });

  // 键盘快捷键
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space' || e.code === 'KeyW') {
      e.preventDefault();
      if (!keyRevHeld) { keyRevHeld = true; updateEffectiveThrottle(); }
    } else if (e.code === 'KeyE' || e.code === 'ArrowUp') {
      e.preventDefault();
      engine.shiftGear(1);
      syncGearUI();
    } else if (e.code === 'KeyQ' || e.code === 'ArrowDown') {
      e.preventDefault();
      engine.shiftGear(-1);
      syncGearUI();
    } else if (e.code === 'KeyM') {
      toggleAudio();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'KeyW') {
      keyRevHeld = false;
      updateEffectiveThrottle();
    }
  });

  // ==================== 60FPS 主动画循环 ====================
  const ledNodes = $$('#shift-lights .led');
  let lastTime = performance.now();

  function frame(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    engine.update(dt, (intensity) => {
      audio.triggerBackfirePop(intensity);
    });

    // 渲染三块 Canvas 画布
    window.EngineRenderer.renderMainEngine(mainCanvas, engine, viewOpts);
    window.EngineRenderer.renderPhaseRadar(phaseCanvas, engine);
    const dyno = window.EngineRenderer.renderDynoAndWave(dynoCanvas, engine, audio);

    // 刷新实时数字遥测
    const power = engine.getCurrentPower();
    $('#tele-rpm').textContent = Math.round(engine.rpm).toLocaleString();
    $('#tele-speed').textContent = String(Math.round(engine.speedKmh));
    $('#tele-hp').innerHTML = `${power.hp.toFixed(1)} <small>HP</small>`;
    $('#tele-nm').innerHTML = `${power.torqueNm.toFixed(1)} <small>N·m</small>`;
    $('#tele-piston-spd').innerHTML = `${engine.getPistonSpeedMs().toFixed(1)} <small>m/s</small>`;
    $('#tele-egt').innerHTML = `${Math.round(engine.egt)} <small>°C</small>`;
    $('#dyno-peak').textContent = `峰值: ${Math.round(dyno.peakHp)} HP @ ${Math.round(dyno.peakHpRpm)} | ${dyno.peakNm.toFixed(1)} N·m`;
    $('#meta-limiter').classList.toggle('hidden', !engine.limiterActive);

    // 刷新顶部 12 颗换挡提示灯 (55% ~ 98% 红线转速逐颗点亮，断油时全红闪烁)
    const ratio = (engine.rpm - engine.redline * 0.50) / (engine.redline * 0.48);
    const litCount = Math.max(0, Math.min(12, Math.round(ratio * 12)));
    const flashOff = engine.limiterActive && Math.floor(now / 70) % 2 === 0;
    for (let i = 0; i < 12; i++) {
      ledNodes[i].classList.toggle('lit', !flashOff && i < litCount);
    }

    requestAnimationFrame(frame);
  }

  // 初始化
  engine.applyPreset('zx4rr');
  syncAllControlsFromEngine();
  syncGearUI();
  updateTimeScaleUI($('#rng-timescale').value);
  requestAnimationFrame(frame);
})();
