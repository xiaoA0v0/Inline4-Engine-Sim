/* ============================================================================
 * audio.js — 基于 Web Audio API 的实时四缸曲柄点火脉冲声浪合成器
 * 根据每缸真实曲柄相位（平面180° / 十字270-180-90-180 / Big-Bang / 自定义）
 * 按样本级精度调度燃烧脉冲、排气共振峰、进气啸叫与高转收油回火放炮
 * ========================================================================== */

(function (global) {
  'use strict';

  class EngineAudioSynth {
    constructor(engine) {
      this.engine = engine;
      this.ctx = null;
      this.enabled = false;
      this.volume = 0.65;

      // 音频节点
      this.masterGain = null;
      this.exhaustBus = null;
      this.shaper = null;
      this.resFilter1 = null;
      this.resFilter2 = null;
      this.lowpass = null;
      this.analyser = null;
      this.waveData = null;

      // 连续进气 & 机械谐波层
      this.droneOsc1 = null;
      this.droneOsc2 = null;
      this.droneGain = null;

      // 噪声缓冲（用于燃烧爆破音与收油放炮）
      this.noiseBuffer = null;

      // 独立高精度音频曲轴时钟（不受画面慢放影响，永远按真实 RPM 实时发声）
      this.audioCrankAngle = 0;
      this.nextScheduleTime = 0;
      this.schedulerId = null;
    }

    init() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;

      // 排气非线性饱和失真（营造金属排气管与钛合金高转嘶吼质感）
      this.shaper = this.ctx.createWaveShaper();
      this.shaper.curve = this.makeDistortionCurve(28);
      this.shaper.oversample = '2x';

      // 排气管双共振峰滤波器
      this.resFilter1 = this.ctx.createBiquadFilter();
      this.resFilter1.type = 'peaking';
      this.resFilter1.frequency.value = 340;
      this.resFilter1.Q.value = 1.6;
      this.resFilter1.gain.value = 6.5;

      this.resFilter2 = this.ctx.createBiquadFilter();
      this.resFilter2.type = 'peaking';
      this.resFilter2.frequency.value = 1150;
      this.resFilter2.Q.value = 1.8;
      this.resFilter2.gain.value = 5.0;

      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = 2600;
      this.lowpass.Q.value = 0.9;

      this.exhaustBus = this.ctx.createGain();
      this.exhaustBus.gain.value = 0.95;

      // 实时示波器分析器
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.waveData = new Uint8Array(this.analyser.fftSize);

      // 信号链: exhaustBus -> shaper -> resFilter1 -> resFilter2 -> lowpass -> masterGain -> analyser -> destination
      this.exhaustBus.connect(this.shaper);
      this.shaper.connect(this.resFilter1);
      this.resFilter1.connect(this.resFilter2);
      this.resFilter2.connect(this.lowpass);
      this.lowpass.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // 连续进气啸叫与曲轴基频层（增强拉转丝滑度与高转尖叫感）
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.08;

      this.droneOsc1 = this.ctx.createOscillator();
      this.droneOsc1.type = 'sawtooth';
      this.droneOsc1.frequency.value = 60;

      this.droneOsc2 = this.ctx.createOscillator();
      this.droneOsc2.type = 'triangle';
      this.droneOsc2.frequency.value = 120;

      const droneLP = this.ctx.createBiquadFilter();
      droneLP.type = 'bandpass';
      droneLP.frequency.value = 520;
      droneLP.Q.value = 1.1;
      this.droneFilter = droneLP;

      this.droneOsc1.connect(droneLP);
      this.droneOsc2.connect(droneLP);
      droneLP.connect(this.droneGain);
      this.droneGain.connect(this.exhaustBus);

      this.droneOsc1.start();
      this.droneOsc2.start();

      // 生成 1 秒白噪声缓冲区
      const sampleRate = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, sampleRate, sampleRate);
      const out = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < sampleRate; i++) {
        out[i] = Math.random() * 2 - 1;
      }

      this.nextScheduleTime = this.ctx.currentTime + 0.02;
    }

    makeDistortionCurve(amount) {
      const n = 2048;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    }

    toggle() {
      if (!this.ctx) this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();

      this.enabled = !this.enabled;
      const now = this.ctx.currentTime;
      if (this.enabled) {
        this.nextScheduleTime = now + 0.015;
        this.masterGain.gain.setTargetAtTime(this.volume * 0.55, now, 0.04);
        if (!this.schedulerId) {
          this.schedulerId = setInterval(() => this.scheduleStep(), 20);
        }
      } else {
        this.masterGain.gain.setTargetAtTime(0, now, 0.04);
      }
      return this.enabled;
    }

    setVolume(vol01) {
      this.volume = Math.max(0, Math.min(1, vol01));
      if (this.ctx && this.enabled) {
        this.masterGain.gain.setTargetAtTime(this.volume * 0.55, this.ctx.currentTime, 0.03);
      }
    }

    // 实时按排气音色、转速、油门调整共振腔参数
    updateToneFilters(now) {
      const eng = this.engine;
      const rpmNorm = Math.min(1, eng.rpm / 16500);
      const th = eng.rpmLocked ? 0.45 : eng.throttle;
      const dispScale = Math.sqrt(600 / Math.max(250, eng.getDisplacementCC())); // 小排量更尖，公升级更浑厚

      let lpBase = 1600, r1 = 260, r2 = 900, drive = 18;
      if (eng.exhaust === 'stock') {
        lpBase = 1150; r1 = 210; r2 = 720; drive = 12;
      } else if (eng.exhaust === 'akrapovic') {
        lpBase = 2400; r1 = 330; r2 = 1250; drive = 26;
      } else if (eng.exhaust === 'straight') {
        lpBase = 4200; r1 = 420; r2 = 1750; drive = 42;
      }

      const lpFreq = Math.min(9000, (lpBase + rpmNorm * 3200 + th * 1400) * dispScale);
      this.lowpass.frequency.setTargetAtTime(lpFreq, now, 0.03);
      this.resFilter1.frequency.setTargetAtTime(r1 * dispScale * (0.85 + rpmNorm * 0.55), now, 0.03);
      this.resFilter2.frequency.setTargetAtTime(r2 * dispScale * (0.85 + rpmNorm * 0.65), now, 0.03);

      // 更新连续进气/基频共振层
      // 四缸基频 = (RPM / 60) * 2 (平面180°为2倍曲轴频；十字/Big-Bang基频更偏1倍曲轴频)
      const orderMult = eng.crankType === 'crossplane' ? 1.5 : eng.crankType === 'bigbang' ? 1.0 : 2.0;
      const baseHz = Math.max(24, (eng.rpm / 60) * orderMult);
      this.droneOsc1.frequency.setTargetAtTime(baseHz, now, 0.02);
      this.droneOsc2.frequency.setTargetAtTime(baseHz * 2.0, now, 0.02);
      this.droneFilter.frequency.setTargetAtTime(Math.min(5500, baseHz * 3.8 + th * 900), now, 0.025);

      const droneAmp = eng.limiterCut ? 0.02 : (0.045 + th * 0.13 + rpmNorm * 0.09);
      this.droneGain.gain.setTargetAtTime(droneAmp, now, 0.02);
    }

    // 在精确时间 t 触发一发单缸排气脉冲
    triggerCylinderPulse(t, cylIndex) {
      const eng = this.engine;
      if (eng.limiterCut) return;

      const rpmNorm = Math.min(1, eng.rpm / 16500);
      const th = eng.rpmLocked ? 0.45 : eng.throttle;
      const dispScale = Math.sqrt(600 / Math.max(250, eng.getDisplacementCC()));

      // 脉冲时长随转速自动收窄（高转脉冲极短，聚合成连续咆哮）
      const pulseDur = Math.max(0.011, Math.min(0.055, 16 / Math.max(600, eng.rpm)));

      // 1. 燃烧膨胀主脉冲振荡器（频率快速下扫模拟气缸压力波）
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = eng.exhaust === 'straight' ? 'sawtooth' : 'triangle';

      // 每缸之间加入极微小的管长音色差异（模拟4-2-1排气歧管自然质感）
      const pipeJitter = 1 + (cylIndex - 1.5) * 0.022;
      const startFreq = (165 + rpmNorm * 360 + th * 95) * dispScale * pipeJitter;
      const endFreq = Math.max(48, startFreq * 0.42);

      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + pulseDur);

      const peakAmp = (0.24 + th * 0.34 + rpmNorm * 0.14);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peakAmp, t + 0.0022);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + pulseDur);

      osc.connect(gain);
      gain.connect(this.exhaustBus);
      osc.start(t);
      osc.stop(t + pulseDur + 0.005);

      // 2. 排气口高压气流嘶嘶/爆裂瞬态噪声
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const nFilter = this.ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime((650 + rpmNorm * 2200) * dispScale, t);
      nFilter.Q.value = eng.exhaust === 'straight' ? 1.0 : 1.8;

      const nGain = this.ctx.createGain();
      const nAmp = (0.06 + th * 0.18) * (eng.exhaust === 'stock' ? 0.55 : 1.0);
      nGain.gain.setValueAtTime(0.0001, t);
      nGain.gain.linearRampToValueAtTime(nAmp, t + 0.0018);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t + pulseDur * 0.85);

      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(this.exhaustBus);
      noise.start(t, Math.random() * 0.5, pulseDur);
    }

    // 触发高转收油回火放炮 (Pop & Bang)
    triggerBackfirePop(intensity = 0.8) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime + 0.005;

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(280 + Math.random() * 480, t);
      bp.Q.value = 1.2;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.65 * intensity, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08 + Math.random() * 0.05);

      noise.connect(bp);
      bp.connect(g);
      g.connect(this.exhaustBus);
      noise.start(t, Math.random() * 0.4, 0.14);
    }

    // Lookahead 调度器：按真实曲柄偏角计算未来 65ms 内每一缸的点火时刻
    scheduleStep() {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      this.updateToneFilters(now);

      const lookahead = 0.065;
      const sliceSec = 0.005; // 5ms 精细步进，确保 18,000 RPM 下也不漏缸
      const eng = this.engine;

      if (this.nextScheduleTime < now) {
        this.nextScheduleTime = now + 0.005;
      }

      while (this.nextScheduleTime < now + lookahead) {
        const degPerSec = Math.max(3600, eng.rpm * 6);
        const startAngle = this.audioCrankAngle;
        const deltaDeg = degPerSec * sliceSec;
        const endAngle = startAngle + deltaDeg;

        // 检查 4 个气缸是否在这段曲轴转角内穿过各自的点火角
        for (let i = 0; i < 4; i++) {
          const fireAngle = ((eng.phases[i] % 720) + 720) % 720;
          // 处理跨 720° 回绕
          let target = fireAngle;
          if (target < startAngle) target += 720;
          if (target >= startAngle && target < endAngle) {
            const frac = (target - startAngle) / deltaDeg;
            const exactTime = this.nextScheduleTime + frac * sliceSec;
            this.triggerCylinderPulse(exactTime, i);
          }
        }

        this.audioCrankAngle = endAngle % 720;
        this.nextScheduleTime += sliceSec;
      }
    }

    getWaveformData() {
      if (!this.analyser || !this.enabled) return null;
      this.analyser.getByteTimeDomainData(this.waveData);
      return this.waveData;
    }
  }

  global.EngineAudioSynth = EngineAudioSynth;
})(window);
