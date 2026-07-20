// src/formation.js —— 編隊/護送模組(formation-kit,2026-07-18 C1 藍圖;零依賴純 {x,z} 算術,整檔可搬)
// 核心溫柔規則=「一個也不失落」:落後者自動加速歸隊,永不真的丟人。
// 用法:const band = new FollowerBand(n, { obstacles, zClamp });
//       每幀 band.update(dt, { x, z, heading }) → 回傳 followers(x/z/speed/stumbleT/phase 供呈現層畫人)。
// 本檔不碰 three:呈現層自己畫人(speed 驅動步伐、stumbleT 驅動晃動)。
// heading 慣例同 game.js:forward =(sin h, cos h);槽位在領袖後方。

export const FORMATION = {
  walkSpeed: 3.0,    // 跟隨巡航速度
  catchUpMul: 1.9,   // 落後加速倍率
  catchUpDist: 3.2,  // 超過此距離就加速歸隊(一個也不失落)
  sepDist: 0.9,      // 彼此最小間距
  sepPush: 2.2,      // 分離推力
  stumbleR: 0.7,     // 太靠近障礙核心=溫柔絆一下
  stumbleTime: 0.5,  // 絆倒持續(只慢一下,不丟人)
  spacing: 1.15,     // 槽位間距
  cols: 3,           // 縱隊列數
};

// 領袖後方 n 個縱隊槽位(相對領袖,dz>0=後方,dx=左右)
export function slotOffsets(n, { spacing = FORMATION.spacing, cols = FORMATION.cols } = {}) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const colsInRow = Math.min(cols, n - row * cols);
    const dx = (col - (colsInRow - 1) / 2) * spacing;
    const dz = (row + 1) * spacing; // 在領袖後方
    out.push({ dx, dz });
  }
  return out;
}

export class FollowerBand {
  constructor(n, { obstacles = [], zClamp = null } = {}) {
    this.n = n;
    this.obstacles = obstacles; // [{ x, z, r }]
    this.zClamp = zClamp;       // [minZ, maxZ] 或 null
    this.slots = slotOffsets(n);
    this.followers = this.slots.map((s) => ({
      x: 0, z: 0, speed: 0, stumbleT: 0, phase: Math.random() * Math.PI * 2, slot: s,
    }));
  }

  // 槽位→世界座標(領袖後方 + 左右,依 heading 旋轉)
  _slotWorld(leader, slot) {
    const h = leader.heading || 0;
    const fwdx = Math.sin(h), fwdz = Math.cos(h);   // 前方
    const rgtx = Math.cos(h), rgtz = -Math.sin(h);  // 右方
    return {
      x: leader.x + rgtx * slot.dx - fwdx * slot.dz,
      z: leader.z + rgtz * slot.dx - fwdz * slot.dz,
    };
  }

  // 重排一批:把眾人瞬間放到領袖後方槽位(新一批出發時用)
  reset(leader) {
    for (const f of this.followers) {
      const w = this._slotWorld(leader, f.slot);
      f.x = w.x; f.z = w.z; f.speed = 0; f.stumbleT = 0;
    }
  }

  update(dt, leader) {
    const F = FORMATION;
    for (let i = 0; i < this.followers.length; i += 1) {
      const f = this.followers[i];
      const tgt = this._slotWorld(leader, f.slot);
      let ax = tgt.x - f.x, az = tgt.z - f.z;
      const dist = Math.hypot(ax, az) || 1e-6;
      // arrive 趨近槽位
      let vx = (ax / dist) * F.walkSpeed;
      let vz = (az / dist) * F.walkSpeed;
      // 落後自動加速歸隊
      if (dist > F.catchUpDist) { vx *= F.catchUpMul; vz *= F.catchUpMul; }
      // 靠近就減速(避免抖動)
      const ease = Math.min(1, dist / 0.8);
      vx *= ease; vz *= ease;
      // 彼此分離
      for (let j = 0; j < this.followers.length; j += 1) {
        if (j === i) continue;
        const g = this.followers[j];
        const sx = f.x - g.x, sz = f.z - g.z;
        const sd = Math.hypot(sx, sz);
        if (sd > 1e-4 && sd < F.sepDist) {
          const push = ((F.sepDist - sd) / F.sepDist) * F.sepPush;
          vx += (sx / sd) * push; vz += (sz / sd) * push;
        }
      }
      // 繞開障礙 + 太近=溫柔絆一下
      for (const o of this.obstacles) {
        const ox = f.x - o.x, oz = f.z - o.z;
        const od = Math.hypot(ox, oz);
        const rr = (o.r || 1) + 0.5;
        if (od > 1e-4 && od < rr) {
          const push = ((rr - od) / rr) * 2.4;
          vx += (ox / od) * push; vz += (oz / od) * push;
          if (od < (o.r || 1) * F.stumbleR && f.stumbleT <= 0) f.stumbleT = F.stumbleTime;
        }
      }
      if (f.stumbleT > 0) { f.stumbleT -= dt; vx *= 0.4; vz *= 0.4; }
      f.x += vx * dt; f.z += vz * dt;
      if (this.zClamp) f.z = Math.min(this.zClamp[1], Math.max(this.zClamp[0], f.z));
      f.speed = Math.hypot(vx, vz);
      f.phase += (0.5 + f.speed) * dt * 6;
    }
    return this.followers;
  }

  // 聚攏度 0..1(HUD 條;落後者會自己歸隊,永遠回到 1)
  cohesion(leader, radius = 4.5) {
    if (!this.followers.length) return 1;
    let inRange = 0;
    for (const f of this.followers) {
      if (Math.hypot(f.x - leader.x, f.z - leader.z) <= radius) inRange += 1;
    }
    return inRange / this.followers.length;
  }
}
