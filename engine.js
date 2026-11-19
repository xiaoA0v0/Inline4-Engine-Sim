/* ============================================================================
 * engine.js — 直列四缸摩托车发动机运动学、热力学估算与经典机型预设
 * ========================================================================== */

(function (global) {
  'use strict';

  const CRANK_LAYOUTS = {
    flat180: {
      name: '平面曲轴 180° (Flat-Plane)',
      phases: [0, 540, 180, 360], // 点火顺序 1-3-4-2，间隔 180-180-180-180
    },
    flat180_alt: {
      name: '平面曲轴 180° (1-2-4-3)',
      phases: [0, 180, 540, 360], // 点火顺序 1-2-4-3，间隔 180-180-180-180
    },
    crossplane: {
      name: '十字曲轴 CP4 (Crossplane 90°)',
      phases: [0, 450, 270, 540], // 雅马哈 R1: 1-3-2-4，间隔 270-180-90-180
    },
    bigbang: {
      name: '赛车 Big-Bang 双发同步',
      phases: [0, 360, 360, 0], // 1&4 同点，360°后 2&3 同点
    },
    screamer720: {
      name: '均匀阶梯偏置 (0-90-180-270)',
      phases: [0, 90, 180, 270],
    },
  };

  const PRESETS = {
    zx4rr: {
      title: 'Kawasaki Ninja ZX-4RR (399cc)',
      crankType: 'flat180',
      phases: [0, 540, 180, 360],
      bore: 57.0,
      stroke: 39.1,
      rodRatio: 1.95,
      compression: 12.3,
      flywheel: 0.80,
      idleRpm: 1400,
      redline: 16500,
      ignAdvance: 22,
      camOverlap: 26,
      exhaust: 'akrapovic',
      limiterType: 'hard',
    },
    r1: {
      title: 'Yamaha YZF-R1 CP4 (998cc)',
      crankType: 'crossplane',
      phases: [0, 450, 270, 540],
      bore: 79.0,
      stroke: 50.9,
      rodRatio: 1.88,
      compression: 13.0,
      flywheel: 0.95,
      idleRpm: 1250,
      redline: 14000,
      ignAdvance: 20,
      camOverlap: 28,
      exhaust: 'akrapovic',
      limiterType: 'hard',
    },
    cbr1000: {
      title: 'Honda CBR1000RR-R Fireblade (999cc)',
      crankType: 'flat180',
      phases: [0, 540, 180, 360],
      bore: 81.0,
      stroke: 48.5,
      rodRatio: 1.92,
      compression: 13.4,
      flywheel: 0.85,
      idleRpm: 1300,
      redline: 14500,
      ignAdvance: 24,
      camOverlap: 32,
      exhaust: 'straight',
      limiterType: 'hard',
    },
    cb400: {
      title: 'Honda CB400 Super Four VTEC (399cc)',
      crankType: 'flat180',
      phases: [0, 540, 180, 360],
      bore: 55.0,
      stroke: 42.0,
      rodRatio: 1.90,
      compression: 11.3,
      flywheel: 1.05,
      idleRpm: 1300,
      redline: 13000,
      ignAdvance: 16,
      camOverlap: 18,
      exhaust: 'stock',
      limiterType: 'soft',
    },
    bigbang: {
      title: 'MotoGP Big-Bang Prototype (999cc)',
      crankType: 'bigbang',
      phases: [0, 360, 360, 0],
      bore: 81.0,
      stroke: 48.5,
      rodRatio: 1.98,
      compression: 14.2,
      flywheel: 0.65,
      idleRpm: 1800,
      redline: 16500,
      ignAdvance: 28,
      camOverlap: 36,
      exhaust: 'straight',
      limiterType: 'flame',
    },
  };

  // 6 速序列式变速箱总减速比（含初级减速与链条终传）
  const GEAR_RATIOS = [0, 14.5, 10.6, 8.3, 6.9, 5.9, 5.2];

  class Inline4Engine {
    constructor() {
      this.crankType = 'flat180';
      this.phases = [0, 540, 180, 360]; // 每缸在 720° 循环内的点火相位偏移
      this.bore = 57.0;        // 缸径 mm
      this.stroke = 39.1;      // 行程 mm
      this.rodRatio = 1.95;    // 连杆长 / 行程比 (L / S)
      this.compression = 12.3; // 几何压缩比
      this.flywheel = 0.80;    // 惯量系数（越小拉转越灵敏）
      this.idleRpm = 1400;
      this.redline = 16500;
      this.ignAdvance = 22;    // 点火提前角 BTDC (°)
      this.camOverlap = 26;    // 气门重叠角 (°)
      this.exhaust = 'akrapovic';
      this.limiterType = 'hard';
      this.popsEnabled = true;

      // 动态运行状态
      this.rpm = this.idleRpm;
      this.throttle = 0;         // 0 ~ 1
      this.prevThrottle = 0;
      this.rpmLocked = false;
      this.targetRpm = 4000;
      this.gear = 0;             // 0 = N, 1..6
      this.speedKmh = 0;
      this.crankAngle = 0;       // 可视化曲轴角度 [0, 720)
      this.timeScale = 0.08;     // 动画慢放倍率 (0.008 ~ 1.0)
      this.paused = false;

      // 断油与回火状态
      this.limiterActive = false;
      this.limiterCut = false;
      this.limiterTimer = 0;
      this.backfireIntensity = 0;
      this.egt = 310;            // 排气温度 °C
      this.blipTimer = 0;

      // 实时四缸状态缓存
      this.cylinders = [0, 1, 2, 3].map((i) => ({
        index: i,
        cycleAngle: 0,
        crankPinAngle: 0,
        pistonNorm: 0,      // 0 = TDC (上止点), 1 = BDC (下止点)
        rodAngleRad: 0,
        intakeLift: 0,      // 0 ~ 1
        exhaustLift: 0,     // 0 ~ 1
        strokeName: 'INTAKE',
        strokeCn: '进气',
        sparkFlash: 0,
        combustionGlow: 0,
        exhaustFlame: 0,
      }));
    }

    applyPreset(key) {
      const p = PRESETS[key];
      if (!p) return;
      this.crankType = p.crankType;
      this.phases = [...p.phases];
      this.bore = p.bore;
      this.stroke = p.stroke;
      this.rodRatio = p.rodRatio;
      this.compression = p.compression;
      this.flywheel = p.flywheel;
      this.idleRpm = p.idleRpm;
      this.redline = p.redline;
      this.ignAdvance = p.ignAdvance;
      this.camOverlap = p.camOverlap;
      this.exhaust = p.exhaust;
      this.limiterType = p.limiterType;
      if (this.rpm < this.idleRpm) this.rpm = this.idleRpm;
      if (this.rpm > this.redline) this.rpm = this.redline - 300;
    }

    setCrankLayout(layoutKey) {
      this.crankType = layoutKey;
      if (CRANK_LAYOUTS[layoutKey]) {
        this.phases = [...CRANK_LAYOUTS[layoutKey].phases];
      }
    }

    getDisplacementCC() {
      // 单缸排量 = pi * (bore/2)^2 * stroke / 1000
      const single = (Math.PI * Math.pow(this.bore / 2, 2) * this.stroke) / 1000;
      return single * 4;
    }

    getPistonSpeedMs() {
      // 平均活塞线速度 = 2 * Stroke(m) * RPM / 60
      return (2 * (this.stroke / 1000) * this.rpm) / 60;
    }

    getFiringSummary() {
      // 按点火发生顺序排序（当 crankAngle == (phase + 360) % 720 时点火）
      const events = this.phases.map((ph, idx) => ({
        cyl: idx + 1,
        angle: ((ph % 720) + 720) % 720,
      }));
      events.sort((a, b) => a.angle - b.angle || a.cyl - b.cyl);
      const order = events.map((e) => e.cyl).join('-');
      const intervals = [];
      for (let i = 0; i < events.length; i++) {
        const cur = events[i].angle;
        const nxt = i < events.length - 1 ? events[i + 1].angle : events[0].angle + 720;
        intervals.push(`${Math.round(nxt - cur)}°`);
      }
      return { order, intervals: intervals.join('-') };
    }

    // 计算特定转速下的理论全油门扭矩 (N·m) 与马力 (HP)
    getDynoAtRpm(rpm) {
      const cc = this.getDisplacementCC();
      const bsRatio = this.bore / this.stroke; // 越短行程，峰值转速越高
      const peakTorqueRpm = Math.min(this.redline * 0.80, Math.max(5500, 6200 + (bsRatio - 1.0) * 9500 + this.camOverlap * 65));
      const baseBMEP = 10.5 + (this.compression - 10) * 0.65; // 有效压力因子

      // 扭矩曲线钟形包络（低转受气门重叠角影响，高转受短行程与提前角加持）
      const norm = rpm / peakTorqueRpm;
      let shape;
      if (norm < 1) {
        const lowEndPenalty = 0.25 + (this.camOverlap / 45) * 0.16;
        shape = (1 - lowEndPenalty) + lowEndPenalty * Math.sin(norm * (Math.PI / 2));
        // 十字曲轴中低转扭力微增，体感更厚实
        if (this.crankType === 'crossplane' || this.crankType === 'bigbang') shape *= 1.04;
      } else {
        const over = (rpm - peakTorqueRpm) / Math.max(1200, this.redline - peakTorqueRpm);
        shape = Math.max(0.58, 1 - 0.30 * Math.pow(over, 1.65));
      }

      // 点火提前角最佳匹配修正（最佳提前角随转速升高）
      const idealAdv = 10 + (rpm / this.redline) * 24;
      const advDiff = Math.abs(this.ignAdvance - idealAdv);
      const advEff = Math.max(0.72, 1 - Math.pow(advDiff / 42, 2) * 0.28);

      // 基准每升排量扭矩 ~ 105~120 N·m/L
      const maxTorque = (cc / 1000) * baseBMEP * 9.5;
      const torqueNm = Math.max(2, maxTorque * shape * advEff);
      // 机械马力 HP = Torque(N·m) * RPM / 7127
      const hp = (torqueNm * rpm) / 7127;
      return { torqueNm, hp };
    }

    getDynoCurve() {
      const pts = [];
      let peakHp = 0, peakHpRpm = 0, peakNm = 0, peakNmRpm = 0;
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const r = this.idleRpm + ((this.redline - this.idleRpm) * i) / steps;
        const { torqueNm, hp } = this.getDynoAtRpm(r);
        pts.push({ rpm: r, torqueNm, hp });
        if (hp > peakHp) { peakHp = hp; peakHpRpm = r; }
        if (torqueNm > peakNm) { peakNm = torqueNm; peakNmRpm = r; }
      }
      return { pts, peakHp, peakHpRpm, peakNm, peakNmRpm };
    }

    getCurrentPower() {
      const full = this.getDynoAtRpm(this.rpm);
      const loadFactor = this.rpmLocked ? 0.35 + (this.rpm / this.redline) * 0.55 : Math.max(0.06, this.throttle);
      const cutFactor = this.limiterCut ? 0.15 : 1.0;
      return {
        torqueNm: full.torqueNm * loadFactor * cutFactor,
        hp: full.hp * loadFactor * cutFactor,
      };
    }

    triggerBlip() {
      this.blipTimer = 0.22;
    }

    shiftGear(delta) {
      const next = Math.max(0, Math.min(6, this.gear + delta));
      if (next === this.gear) return;
      const oldGear = this.gear;
      this.gear = next;
      // 换挡时根据齿比瞬时匹配转速（带降档自动补油体感）
      if (oldGear > 0 && next > 0) {
        const ratioScale = GEAR_RATIOS[next] / GEAR_RATIOS[oldGear];
        this.rpm = Math.max(this.idleRpm, Math.min(this.redline * 0.98, this.rpm * ratioScale));
        if (delta < 0) this.triggerBlip();
      } else if (oldGear === 0 && next > 0 && this.rpm > this.idleRpm + 2000) {
        this.rpm = Math.max(this.idleRpm, this.rpm * 0.72);
      }
    }

    // 单步物理更新
    update(dt, onPopCallback) {
      dt = Math.min(0.05, Math.max(0.001, dt));

      // 处理点油门 Blip
      let effectiveThrottle = this.throttle;
      if (this.blipTimer > 0) {
        this.blipTimer = Math.max(0, this.blipTimer - dt);
        effectiveThrottle = Math.max(effectiveThrottle, 0.82);
      }

      // 侦测高转骤收油门 -> 触发排气管回火放炮 (Pops & Bangs)
      if (this.popsEnabled && !this.rpmLocked) {
        if (this.prevThrottle > 0.45 && effectiveThrottle < 0.08 && this.rpm > Math.max(5200, this.redline * 0.42)) {
          this.backfireIntensity = Math.min(1.0, this.backfireIntensity + 0.85);
          if (onPopCallback) onPopCallback(0.9);
        } else if (this.backfireIntensity > 0.12 && effectiveThrottle < 0.08 && this.rpm > this.idleRpm + 2500) {
          if (Math.random() < dt * 7.5) {
            if (onPopCallback) onPopCallback(0.45 + Math.random() * 0.45);
          }
        }
      }
      this.prevThrottle = effectiveThrottle;
      this.backfireIntensity = Math.max(0, this.backfireIntensity - dt * 1.4);

      // 转速动力学更新
      if (this.rpmLocked) {
        const clampedTarget = Math.min(this.redline + 150, Math.max(600, this.targetRpm));
        this.rpm += (clampedTarget - this.rpm) * Math.min(1, dt * 10);
        this.limiterActive = this.rpm >= this.redline - 40;
        this.limiterCut = false;
      } else {
        // 档位越高，加速负载越大；飞轮越轻，空挡拉转越疯
        const gearInertia = this.gear === 0 ? 1.0 : 1.0 + (6.8 / GEAR_RATIOS[this.gear]) * 2.8;
        const effectiveInertia = this.flywheel * gearInertia;

        // 红线断油逻辑
        if (this.rpm >= this.redline) {
          this.limiterActive = true;
          this.limiterTimer += dt;
          if (this.limiterType === 'soft') {
            this.limiterCut = true;
            this.rpm = this.redline - 120;
          } else {
            const cutFreq = this.limiterType === 'flame' ? 24 : 18;
            this.limiterCut = Math.sin(this.limiterTimer * Math.PI * 2 * cutFreq) > 0;
            if (this.limiterCut) {
              this.rpm -= (4200 / this.flywheel) * dt;
              if (this.limiterType === 'flame' && Math.random() < dt * 20) {
                this.backfireIntensity = 1.0;
                if (onPopCallback) onPopCallback(0.75);
              }
            }
          }
        } else {
          if (this.rpm < this.redline - 260) {
            this.limiterActive = false;
            this.limiterCut = false;
          }
        }

        const revAccel = this.limiterCut ? -6500 : (effectiveThrottle * 24500) / effectiveInertia;
        const engineBrake = (1 - effectiveThrottle) * (3200 + (this.rpm / this.redline) * 6200) / effectiveInertia;
        const idleAssist = this.rpm < this.idleRpm ? (this.idleRpm - this.rpm) * 8.5 : 0;
        // 怠速轻微抖动（十字曲轴与大重叠角高转凸轮怠速抖动更有机械感）
        const idleJitter = this.rpm < this.idleRpm + 350 ? Math.sin(performance.now() * 0.017) * (12 + this.camOverlap * 0.8) : 0;

        this.rpm += (revAccel - engineBrake + idleAssist) * dt;
        this.rpm = Math.max(this.idleRpm * 0.85 + idleJitter, Math.min(this.redline + 250, this.rpm));
      }

      // 模拟车速计算（17寸后轮周长约 1.98m）
      if (this.gear === 0) {
        this.speedKmh = Math.max(0, this.speedKmh - dt * 28);
      } else {
        const wheelRpm = this.rpm / GEAR_RATIOS[this.gear];
        const targetSpeed = (wheelRpm * 1.98 * 60) / 1000;
        this.speedKmh += (targetSpeed - this.speedKmh) * Math.min(1, dt * 12);
      }

      // 排气温度模拟
      const targetEgt = 290 + (this.rpm / this.redline) * 480 + effectiveThrottle * 170 + this.backfireIntensity * 90;
      this.egt += (targetEgt - this.egt) * Math.min(1, dt * 1.5);

      // 推进可视化曲轴角度（受暂停与时间倍率影响）
      if (!this.paused) {
        const degPerSec = this.rpm * 6; // 1 RPM = 360°/60s = 6 deg/s
        this.crankAngle = (this.crankAngle + degPerSec * this.timeScale * dt) % 720;
      }

      // 计算四缸各自精确运动学与气门/点火状态
      const halfStroke = this.stroke / 2;
      const rodLen = this.stroke * this.rodRatio;
      const rOverL = halfStroke / rodLen;

      for (let i = 0; i < 4; i++) {
        const c = this.cylinders[i];
        const phase = ((this.phases[i] % 720) + 720) % 720;
        const alpha = (this.crankAngle - phase + 720) % 720;
        const thetaRad = ((alpha % 360) * Math.PI) / 180;

        // 精确曲柄滑块机构活塞位移 (0 = TDC 上止点, 1 = BDC 下止点)
        const sinT = Math.sin(thetaRad);
        const cosT = Math.cos(thetaRad);
        const xMm = halfStroke * (1 - cosT) + rodLen * (1 - Math.sqrt(Math.max(0.01, 1 - Math.pow(rOverL * sinT, 2))));
        c.cycleAngle = alpha;
        c.crankPinAngle = alpha % 360;
        c.pistonNorm = xMm / this.stroke;
        c.rodAngleRad = Math.asin(Math.max(-0.95, Math.min(0.95, rOverL * sinT)));

        // 凸轮气门升程曲线（受气门重叠角 camOverlap 控制）
        const overlapHalf = this.camOverlap * 0.5;
        // 进气门开启范围: (720 - overlapHalf) ~ (180 + 20)
        const inOpenStart = 720 - overlapHalf;
        const inOpenEnd = 180 + 22;
        const inDuration = overlapHalf + inOpenEnd;
        let inPos = -1;
        if (alpha >= inOpenStart) inPos = (alpha - inOpenStart) / inDuration;
        else if (alpha <= inOpenEnd) inPos = (alpha + overlapHalf) / inDuration;
        c.intakeLift = inPos >= 0 && inPos <= 1 ? Math.pow(Math.sin(inPos * Math.PI), 1.25) : 0;

        // 排气门开启范围: (540 - 22) ~ (720 + overlapHalf -> overlapHalf)
        const exOpenStart = 540 - 22;
        const exDuration = 180 + 22 + overlapHalf;
        let exPos = -1;
        if (alpha >= exOpenStart) exPos = (alpha - exOpenStart) / exDuration;
        else if (alpha <= overlapHalf) exPos = (alpha + (720 - exOpenStart)) / exDuration;
        c.exhaustLift = exPos >= 0 && exPos <= 1 ? Math.pow(Math.sin(exPos * Math.PI), 1.25) : 0;

        // 四冲程阶段标记
        if (alpha < 180) {
          c.strokeName = 'INTAKE';
          c.strokeCn = '进气';
        } else if (alpha < 360) {
          c.strokeName = 'COMP';
          c.strokeCn = '压缩';
        } else if (alpha < 540) {
          c.strokeName = 'POWER';
          c.strokeCn = '做功';
        } else {
          c.strokeName = 'EXHAUST';
          c.strokeCn = '排气';
        }

        // 火花塞提前点火闪烁（围绕 360 - ignAdvance）
        const sparkAngle = 360 - this.ignAdvance;
        const distSpark = Math.abs(alpha - sparkAngle);
        if (!this.limiterCut && distSpark < 18) {
          c.sparkFlash = 1 - distSpark / 18;
        } else {
          c.sparkFlash = 0;
        }

        // 做功燃烧室火焰强度
        if (!this.limiterCut && alpha >= sparkAngle && alpha < 510) {
          const prog = (alpha - sparkAngle) / (510 - sparkAngle);
          c.combustionGlow = Math.pow(Math.max(0, 1 - prog), 1.55) * (0.62 + effectiveThrottle * 0.38);
        } else {
          c.combustionGlow = 0;
        }

        // 排气回火火焰
        c.exhaustFlame = c.exhaustLift > 0.2 ? this.backfireIntensity * c.exhaustLift : 0;
      }
    }
  }

  global.Inline4Engine = Inline4Engine;
  global.ENGINE_PRESETS = PRESETS;
  global.CRANK_LAYOUTS = CRANK_LAYOUTS;
  global.GEAR_RATIOS = GEAR_RATIOS;
})(window);
