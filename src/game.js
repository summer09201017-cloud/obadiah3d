// 俄巴底藏一百先知(obadiah3d)——列王紀上 18:4,13(cuv 已查驗 2026-07-20;fork daniel-palace3d 潛行底座)
// 玩法:①護送潛行——俄巴底帶一批先知(formation-kit 小隊跟隨)避開耶洗別兵丁的火把光錐,分批潛行進山洞
//      ②分批藏洞——每帶一批到洞口=藏好一批(進度 /100),折返再帶;每五十人一洞、兩洞共一百(王上18:4)
//      ③供養收尾——一百位先知都藏好,拿餅和水到洞口供養(分餅 J/遞水 K/求神保守 L),神藉俄巴底保存眾先知。
// 神學鐵則:玩家零武器、零殺戮;得勝=神藉俄巴底保存先知,非俄巴底英勇。判定=畫面(光錐真實照到才算)。
import * as THREE from "three";
import { FollowerBand } from "./formation.js";

export const DIFFICULTY_LABELS = { kids: "幼兒", child: "兒童", easy: "入門", normal: "標準", hard: "職業" };
// guards=巡邏兵數;fov=光錐半角(rad);range=光錐長;speed=巡邏速度;window=供養綠區寬
export const DIFFICULTY_PRESETS = {
  kids:   { guards: 1, fov: 0.30, range: 4.0, speed: 0.9, window: 0.26 },
  child:  { guards: 2, fov: 0.34, range: 5.0, speed: 1.2, window: 0.22 },
  easy:   { guards: 3, fov: 0.38, range: 5.5, speed: 1.5, window: 0.18 },
  normal: { guards: 4, fov: 0.44, range: 6.5, speed: 1.8, window: 0.13 },
  hard:   { guards: 5, fov: 0.50, range: 8.0, speed: 2.2, window: 0.10 },
};
export const GAME_MODES = { solo: { id: "solo", label: "藏先知之夜" } };

const FIELD_HALF_W = 11;   // 場地半寬(x)
const START_Z = 16;        // 起點(俄巴底出發)
const CAVE_Z = -12;        // 山洞帶(遠端)
const PROPHETS_TOTAL = 100;
const CAVE_CAP = 50;       // 每五十人一洞(王上18:4)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

// 供養三連(收尾;玩家零武器,唯一動作=供養)
const PROVISIONS = [
  { key: "bread", label: "分餅",   phrase: "拿餅供養先知!" },
  { key: "water", label: "遞水",   phrase: "拿水供養先知!" },
  { key: "keep",  label: "求神保守", phrase: "願耶和華保守他們!" },
];

export class ObadiahGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.onEvent = null;
    this.onHud = null;
    this.modeId = "solo";
    this.difficulty = "easy";
    this.batchSize = 25; // 每趟人數(frames 決定:50/25/10)
    this.phase = "menu"; // menu | escort | provision | finale | done
    this.message = "";
    this.camView = 0;
    this.cameraShake = 0;
    try {
      const saved = Number(localStorage.getItem("obadiah3d-camview"));
      if ([0, 1, 2, 3, 4].includes(saved)) this.camView = saved;
    } catch { /* ignore */ }
    this.move = { x: 0, z: 0 }; // 玩家輸入向量(main.js 餵)
    // ★選單階段 render 也在跑:狀態必須先有數字,否則 undefined 進 lerp 把鏡頭毒成 NaN(07-15 踩雷)
    this.playerX = 0;
    this.playerZ = START_Z;
    this.heroHeading = Math.PI; // 面向 -z(往山洞)
    this.hidden = 0;           // 已藏先知數(進度 /100)
    this.tripIdx = 0;
    this.totalTrips = 4;
    this.caught = 0;
    this.provIdx = 0;
    this.provHits = 0;
    this.meterValue = 0;
    this.windowStart = 0.5;
    this.windowEnd = 0.7;
    this.checkpoint = { x: 0, z: START_Z };
    this._caughtT = 0;
    this.band = null;
    this._cohesionWarnT = 0;
    this._setupScene();
    this._buildField();
    this._buildActors();
    this._hudTimer = 0;
  }

  get preset() { return DIFFICULTY_PRESETS[this.difficulty]; }
  get activeCaveIdx() { return this.hidden < CAVE_CAP ? 0 : 1; }
  emit(type, payload = {}) { if (this.onEvent) this.onEvent({ type, ...payload }); }

  _setupScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b101e); // 三更之夜
    this.scene.fog = new THREE.Fog(0x0b101e, 30, 90);
    this.camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 200);
    this._camPos = new THREE.Vector3(0, 12, START_Z + 10);
    this._camLook = new THREE.Vector3(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0x9aa6c8, 1.25)); // 夜景要看得清
    const moon = new THREE.DirectionalLight(0xc2d0ea, 1.1);
    moon.position.set(-20, 30, 10);
    this.scene.add(moon);
  }

  _buildField() {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 120),
      new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.95 }), // 曠野土地
    );
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);
    // 掩蔽:岩石/樹叢(潛行掩體 + formation 障礙 + 檢查點藏身點)
    this.cover = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x2f3d28, roughness: 0.95 });
    for (let zi = 0; zi < 7; zi += 1) {
      for (const sx of [-8.5, 8.5]) {
        const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.8, 1.2), 0), rockMat);
        boulder.position.set(sx + rand(-1, 1), 0.7, 12 - zi * 4.6);
        boulder.rotation.set(rand(0, 1), rand(0, 6), rand(0, 1));
        g.add(boulder);
        this.cover.push({ mesh: boulder, x: boulder.position.x, z: boulder.position.z, r: 1.1 });
      }
    }
    // 藏身樹叢(檢查點;被抓退回這裡)
    this.checkpoints = [];
    let bi = 0;
    for (const [x, z, s] of [[-5, 8, 1.4], [6, 3, 1.6], [-3, -3, 1.5], [7, -7, 1.3], [-8, -1, 1.2]]) {
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), bi % 2 ? bushMat : rockMat);
      bush.position.set(x, s * 0.7, z);
      bush.scale.y = 0.8;
      g.add(bush);
      this.checkpoints.push({ x, z });
      this.cover.push({ mesh: bush, x, z, r: s });
      bi += 1;
    }
    // 遠處耶洗別營火(氛圍點光,表明兵營就在附近)
    for (const [x, z] of [[-16, CAVE_Z - 10], [15, CAVE_Z - 6], [-3, CAVE_Z - 16]]) {
      const fire = new THREE.PointLight(0xff9a3a, 1.1, 14);
      fire.position.set(x, 1.2, z);
      g.add(fire);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xffb03a }));
      flame.position.set(x, 0.35, z);
      g.add(flame);
    }
    // 兩個山洞(每五十人一洞,王上18:4)
    this.caves = [];
    const caveMat = new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 1 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x04050a });
    for (const [cx, cz] of [[-6.5, CAVE_Z + 2], [6.5, CAVE_Z - 3]]) {
      const grp = new THREE.Group();
      const hill = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), caveMat);
      hill.scale.set(1.35, 1.1, 1.15);
      grp.add(hill);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.25, 22), holeMat);
      mouth.position.set(0, 1.15, 2.5);
      grp.add(mouth);
      const glow = new THREE.PointLight(0xffb060, 0, 9); // 供養時亮起
      glow.position.set(0, 1.3, 3);
      grp.add(glow);
      grp.position.set(cx, 0, cz);
      this.scene.add(grp);
      this.caves.push({ x: cx, z: cz + 2.6, cx, cz, grp, glow, hidden: 0 });
    }
    this.scene.add(g);
  }

  // 古裝小人(矩形身體鐵則;先知/兵丁/俄巴底共用)
  _makeFigure(robeColor, { torch = false, scale = 1 } = {}) {
    const g = new THREE.Group();
    const robe = new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe6b183, roughness: 0.7, emissive: 0x5a4632, emissiveIntensity: 0.35 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x25201a });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), robe); // 矩形身體
    chest.position.y = 1.28;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.26), robe);
    skirt.position.y = 0.86;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), skin);
    neck.position.y = 1.66;
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skin);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.85 }));
    hair.position.y = 0.02;
    hair.rotation.x = -0.2;
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), white);
    eL.position.set(-0.075, 0.04, 0.175);
    const eR = eL.clone(); eR.position.x = 0.075;
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 10, Math.PI), dark);
    mouth.position.set(0, -0.08, 0.165);
    mouth.rotation.z = Math.PI;
    head.add(skull, hair, eL, eR, mouth);
    head.position.y = 1.9;
    const mkLeg = (sx) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.62, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.9 }));
      leg.position.set(sx, 0.42, 0);
      return leg;
    };
    const mkArm = (sx) => {
      const pivot = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 8), robe);
      arm.position.y = -0.26;
      pivot.add(arm);
      pivot.position.set(sx, 1.52, 0);
      return pivot;
    };
    const legL = mkLeg(-0.12), legR = mkLeg(0.12);
    const armL = mkArm(-0.31), armR = mkArm(0.31);
    g.add(chest, skirt, neck, head, legL, legR, armL, armR);
    if (torch) { // 手持火把(兵丁)
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x5a4028 }));
      stick.position.set(0, -0.5, 0.1);
      armR.add(stick);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0xffb03a }));
      flame.position.set(0, -0.85, 0.1);
      armR.add(flame);
      armR.rotation.x = -1.2;
      const light = new THREE.PointLight(0xff9a3a, 1.1, 8);
      light.position.set(0, 1.4, 0.6);
      g.add(light);
    }
    g.scale.setScalar(scale);
    g.userData = { armL, armR, legL, legR, head, mouth };
    return g;
  }

  _buildActors() {
    // 俄巴底(亞哈家宰,敬畏耶和華;深青家宰袍)
    this.hero = this._makeFigure(0x2f5a52, { scale: 0.98 });
    this.scene.add(this.hero);
    // 俄巴底手上的餅和水(供養時才顯示)
    this.bread = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd9a86a, roughness: 0.9 }));
    this.bread.position.set(-0.34, 1.18, 0.24);
    this.bread.visible = false;
    this.jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.32, 10), new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 0.5, metalness: 0.1 }));
    this.jar.position.set(0.34, 1.18, 0.24);
    this.jar.visible = false;
    this.hero.add(this.bread, this.jar);
    // 先知小隊(池 10;每趟由 formation-kit 帶隊,樸素土袍)
    const robeColors = [0x8a7a5a, 0x7a6a4a, 0x6a5a72, 0x8a6a4a, 0x5a6a5a, 0x7a5a4a, 0x6a6a4a, 0x8a7a6a, 0x5a5a6a, 0x7a6a5a];
    this.prophets = robeColors.map((c) => {
      const f = this._makeFigure(c, { scale: 0.9 });
      f.visible = false;
      this.scene.add(f);
      return f;
    });
    // 巡邏兵池(耶洗別的兵,最多 5)+光錐
    this.guards = [];
    for (let i = 0; i < 5; i += 1) {
      const fig = this._makeFigure(0x71283a, { torch: true, scale: 0.95 });
      fig.visible = false;
      this.scene.add(fig);
      const cone = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24, 0, 1), // 每幀重設角度/半徑
        new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      );
      cone.rotation.x = -Math.PI / 2;
      cone.visible = false;
      this.scene.add(cone);
      this.guards.push({ fig, cone, x: 0, z: 0, dir: 0, wp: [], wpIdx: 0 });
    }
    // 軍長 BOSS(突然出現的大獵手,照 2D 王宮之夜;分級:幼兒不出現/兒童短而慢)
    this.boss = this._makeFigure(0x181022, { torch: true, scale: 1.55 });
    this.boss.visible = false;
    this.scene.add(this.boss);
    this._bossActive = false;
    this._bossTimer = rand(26, 40);
    this._bossT = 0;
    // 洞口紅圈(當前目標洞)
    this.goalRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5544, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    this.goalRing.rotation.x = -Math.PI / 2;
    this.goalRing.visible = false;
    this.scene.add(this.goalRing);
  }

  applyPresentation({ difficulty, frames }) {
    if (DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
    // frames 1/2/3 → 每趟人數 50/25/10(都整除 50,確保每五十人一洞)
    this.batchSize = { 1: 50, 2: 25, 3: 10 }[frames] || 25;
    this.totalTrips = PROPHETS_TOTAL / this.batchSize;
  }

  startMatch() {
    this.hidden = 0;
    this.tripIdx = 0;
    this.caught = 0;
    this.provIdx = 0;
    this.provHits = 0;
    this.caves[0].hidden = 0;
    this.caves[1].hidden = 0;
    this.caves[0].glow.intensity = 0;
    this.caves[1].glow.intensity = 0;
    this.bread.visible = false;
    this.jar.visible = false;
    this.scene.background.set(0x0b101e);
    this.scene.fog.color.set(0x0b101e);
    this._bossGone();
    this._bossTimer = rand(26, 40);
    this._newBatch();
    this.phase = "escort";
    this.message = "耶洗別殺先知——帶這一批先知避開兵丁火把的光,潛行到洞口藏起來!";
    this.emit("match-start", {});
    this._pushHud();
  }

  // 出發一批:重置俄巴底到起點、擺好先知小隊、佈置兵丁、指定目標洞
  _newBatch() {
    const p = this.preset;
    this.playerX = 0;
    this.playerZ = START_Z;
    this.heroHeading = Math.PI;
    this.checkpoint = { x: 0, z: START_Z };
    // 目標洞(前五十→洞A,後五十→洞B)
    const cave = this.caves[this.activeCaveIdx];
    this.goal = { x: cave.x, z: cave.z };
    this.goalRing.position.set(this.goal.x, 0.03, this.goal.z);
    this.goalRing.visible = true;
    // formation-kit:一批 min(batchSize,10) 位先知跟隨俄巴底(整檔可搬的 FollowerBand)
    const squadN = Math.min(this.batchSize, this.prophets.length);
    this.band = new FollowerBand(squadN, {
      obstacles: this.cover,
      zClamp: [CAVE_Z - 1, START_Z + 3],
    });
    this.band.reset({ x: this.playerX, z: this.playerZ, heading: this.heroHeading });
    this.prophets.forEach((f, i) => { f.visible = i < squadN; });
    // 兵丁:橫向來回巡邏,分佈在起點與目標洞之間
    for (let i = 0; i < this.guards.length; i += 1) {
      const gd = this.guards[i];
      const active = i < p.guards;
      gd.fig.visible = active;
      gd.cone.visible = active;
      if (!active) continue;
      const laneZ = THREE.MathUtils.lerp(START_Z - 4, this.goal.z + 2.5, (i + 1) / (p.guards + 1));
      const w = rand(5, 9);
      const cx = rand(-FIELD_HALF_W + w, FIELD_HALF_W - w);
      gd.wp = [{ x: cx - w, z: laneZ }, { x: cx + w, z: laneZ + rand(-1.5, 1.5) }];
      gd.wpIdx = 0;
      gd.x = gd.wp[0].x;
      gd.z = gd.wp[0].z;
    }
  }

  _bossGone() {
    this._bossActive = false;
    this.boss.visible = false;
    this._bossTimer = rand(30, 45);
  }

  // 一批藏好:進度 +batchSize,折返再帶;藏滿一百→供養
  _hideBatch() {
    this.hidden = Math.min(PROPHETS_TOTAL, this.hidden + this.batchSize);
    const caveIdx = this.hidden <= CAVE_CAP ? 0 : 1;
    this.caves[caveIdx].hidden = Math.min(CAVE_CAP, this.caves[caveIdx].hidden + this.batchSize);
    this.prophets.forEach((f) => { f.visible = false; });
    this.goalRing.visible = false;
    this.emit("batch-hidden", { hidden: this.hidden, cave: caveIdx + 1 });
    if (this.hidden >= PROPHETS_TOTAL) {
      this._startProvision();
      return;
    }
    this.tripIdx += 1;
    this._newBatch();
    this.message = `藏好一批!已藏 ${this.hidden}/100——回去再帶下一批到洞口。`;
    this._pushHud();
  }

  _startProvision() {
    this._bossGone();
    this.phase = "provision";
    // 俄巴底已在洞口:拿出餅和水,兩洞亮起
    this.playerX = this.goal.x;
    this.playerZ = this.goal.z;
    this.heroHeading = Math.PI;
    this.bread.visible = true;
    this.jar.visible = true;
    this.caves[0].glow.intensity = 1.4;
    this.caves[1].glow.intensity = 1.4;
    this.provIdx = 0;
    this.provHits = 0;
    this._meterDir = 1;
    this.meterValue = 0;
    this._rollWindow();
    this.message = `一百位先知都藏好了!拿餅和水供養——指針進綠區按「${PROVISIONS[0].label}」!`;
    this.emit("provision-start", {});
    this._pushHud();
  }

  _rollWindow() {
    const w = this.preset.window;
    this.windowStart = rand(0.45, 0.9 - w);
    this.windowEnd = this.windowStart + w;
  }

  pressProvision(key) {
    if (this.phase !== "provision") return;
    const expect = PROVISIONS[this.provIdx].key;
    if (key !== expect) { // 按錯鍵=提示,不懲罰
      this.emit("provision-wrong", { expect: PROVISIONS[this.provIdx].label });
      return;
    }
    const inWindow = this.meterValue >= this.windowStart && this.meterValue <= this.windowEnd;
    if (inWindow) {
      this.provHits += 1;
      this.cameraShake = 0.12;
      this.emit("provision-hit", { idx: this.provIdx, label: PROVISIONS[this.provIdx].label, phrase: PROVISIONS[this.provIdx].phrase });
      this.provIdx += 1;
      if (this.provIdx >= PROVISIONS.length) {
        this._startFinale();
        return;
      }
      this._rollWindow();
      this.message = `好!下一個——指針進綠區按「${PROVISIONS[this.provIdx].label}」!`;
    } else {
      this.emit("provision-miss", { label: PROVISIONS[this.provIdx].label });
      this.message = `還沒到時候……再等指針進綠區,按「${PROVISIONS[this.provIdx].label}」!`;
    }
    this._pushHud();
  }

  _startFinale() {
    this.phase = "finale";
    this._finaleT = 4.4;
    this.scene.background.set(0x6a5540); // 天將亮,平安的暖色(非兵敗,是神保守)
    this.scene.fog.color.set(0x6a5540);
    this.caves[0].glow.intensity = 2.2;
    this.caves[1].glow.intensity = 2.2;
    this.cameraShake = 0.1;
    this.emit("finale", { caught: this.caught });
    this.message = "餅和水都送到了——神藉俄巴底保存了一百位先知!";
    this._pushHud();
  }

  _finish() {
    this.phase = "done";
    const perfect = this.caught === 0;
    this.emit("match-end", {
      title: perfect ? "一百位先知都藏好、得餅得水!完美護送!🕊️" : "神藉俄巴底保存了一百位先知!🕊️",
      text: `被兵丁發現 ${this.caught} 次${perfect ? "(完美護送!)" : ""}。「耶洗別殺耶和華眾先知的時候,俄巴底將一百個先知藏了,每五十人藏在一個洞裡,拿餅和水供養他們。」(王上18:4)——得勝不是靠俄巴底的膽量,是神藉他保存了眾先知。`,
      caught: this.caught,
    });
    this._pushHud();
  }

  cycleCamView() {
    this.camView = (this.camView + 1) % 5;
    try { localStorage.setItem("obadiah3d-camview", String(this.camView)); } catch { /* ignore */ }
    this.emit("status", { text: ["視角:隊伍後上方。", "視角:低角跟隨。", "視角:高空俯瞰。", "視角:山側面。", "視角:洞口回看。"][this.camView] });
  }

  update(dt) {
    if (this.phase === "menu" || this.phase === "done") return;
    const p = this.preset;
    if (this.phase === "escort") {
      // 俄巴底移動(鏡頭固定朝 -z,不需鏡像)
      const spd = 4.8;
      this.playerX = clamp(this.playerX + this.move.x * spd * dt, -FIELD_HALF_W, FIELD_HALF_W);
      this.playerZ = clamp(this.playerZ + this.move.z * spd * dt, CAVE_Z + 0.5, START_Z + 2);
      const moving = Math.abs(this.move.x) + Math.abs(this.move.z) > 0.01;
      if (moving) this.heroHeading = Math.atan2(this.move.x, this.move.z);
      // 先知小隊跟隨(formation-kit)
      if (this.band) this.band.update(dt, { x: this.playerX, z: this.playerZ, heading: this.heroHeading });
      // 兵丁走路+偵測(0.35s 寬限:掃到不秒抓,持續照到才算)
      let spotted = false;
      for (let i = 0; i < p.guards; i += 1) {
        const gd = this.guards[i];
        const wp = gd.wp[gd.wpIdx];
        const dx = wp.x - gd.x, dz = wp.z - gd.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) gd.wpIdx = (gd.wpIdx + 1) % gd.wp.length;
        else {
          gd.x += (dx / d) * p.speed * dt;
          gd.z += (dz / d) * p.speed * dt;
          gd.dir = Math.atan2(dx, dz);
        }
        // 光錐偵測(判定=畫面:錐形參數同渲染)
        const px = this.playerX - gd.x, pz = this.playerZ - gd.z;
        const dist = Math.hypot(px, pz);
        if (dist < p.range) {
          const ang = Math.atan2(px, pz);
          let diff = ang - gd.dir;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) < p.fov) spotted = true;
        }
      }
      if (spotted) {
        this._exposeT = (this._exposeT || 0) + dt;
        if (this._exposeT > 0.35) { this._exposeT = 0; this._caught(); }
      } else {
        this._exposeT = Math.max(0, (this._exposeT || 0) - dt * 2);
      }
      // 軍長 BOSS:突然出現直追(幼兒不出現、兒童短而慢;被抓=同溫柔規則)
      if (this.difficulty !== "kids") {
        if (!this._bossActive) {
          this._bossTimer -= dt;
          if (this._bossTimer <= 0) {
            this._bossActive = true;
            this._bossT = { child: 4, easy: 5, normal: 6.5, hard: 7.5 }[this.difficulty] || 5;
            this.boss.visible = true;
            const side = Math.random() < 0.5 ? -1 : 1;
            this.boss.position.set(side * (FIELD_HALF_W - 1), 0, clamp(this.playerZ - 14, CAVE_Z + 2, START_Z));
            this.cameraShake = 0.35;
            this.emit("boss", {});
            this.message = "軍長來了!快躲進岩石樹叢!";
            this._pushHud();
          }
        } else {
          const bs = { child: 2.6, easy: 3.6, normal: 4.4, hard: 5.0 }[this.difficulty] || 3.6; // 玩家 4.8:easy 以下追不上
          const bdx = this.playerX - this.boss.position.x, bdz = this.playerZ - this.boss.position.z;
          const bd = Math.hypot(bdx, bdz);
          if (bd > 0.001) {
            this.boss.position.x += (bdx / bd) * bs * dt;
            this.boss.position.z += (bdz / bd) * bs * dt;
            this.boss.rotation.y = Math.atan2(bdx, bdz);
          }
          if (bd < 1.15) {
            this._bossGone();
            this._caught();
          } else {
            this._bossT -= dt;
            if (this._bossT <= 0) this._bossGone();
          }
        }
      }
      // 檢查點:碰到藏身樹叢附近就更新
      for (const cp of this.checkpoints) {
        if (Math.hypot(cp.x - this.playerX, cp.z - this.playerZ) < 2.2) {
          this.checkpoint = { x: this.playerX, z: this.playerZ };
        }
      }
      // 掉隊牧養提醒(不是懲罰):cohesion 太低時溫柔提醒
      if (this.band) {
        this._cohesionWarnT -= dt;
        if (this.band.cohesion({ x: this.playerX, z: this.playerZ }) < 0.5 && this._cohesionWarnT <= 0) {
          this._cohesionWarnT = 5;
          this.emit("straggler", {});
        }
      }
      // 抵達目標洞
      if (Math.hypot(this.goal.x - this.playerX, this.goal.z - this.playerZ) < 1.35) {
        this._hideBatch();
      }
    } else if (this.phase === "provision") {
      const sweep = 0.55 + p.speed * 0.14;
      this.meterValue += this._meterDir * sweep * dt;
      if (this.meterValue >= 1) { this.meterValue = 1; this._meterDir = -1; }
      if (this.meterValue <= 0) { this.meterValue = 0; this._meterDir = 1; }
    } else if (this.phase === "finale") {
      this._finaleT -= dt;
      if (this._finaleT <= 0) this._finish();
    }
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.6);
    if (this._caughtT > 0) this._caughtT -= dt;
    this._hudTimer -= dt;
    if (this._hudTimer <= 0) { this._hudTimer = 0.12; this._pushHud(); }
  }

  _caught() {
    if (this._caughtT > 0) return; // 免疫窗(避免連環觸發)
    this.caught += 1;
    this._caughtT = 1.6;
    this.cameraShake = 0.22;
    this.playerX = this.checkpoint.x;
    this.playerZ = this.checkpoint.z;
    if (this.band) this.band.reset({ x: this.playerX, z: this.playerZ, heading: this.heroHeading });
    this.emit("caught", { n: this.caught });
    this.message = "被火把照到了!退回藏身點——貼著岩石樹叢走。";
    this._pushHud();
  }

  _pushHud() {
    if (!this.onHud) return;
    this.onHud({
      phase: this.phase,
      message: this.message,
      hidden: this.hidden ?? 0,
      total: PROPHETS_TOTAL,
      tripIdx: Math.min((this.tripIdx ?? 0) + 1, this.totalTrips),
      totalTrips: this.totalTrips,
      caught: this.caught ?? 0,
      provIdx: this.provIdx ?? 0,
      provLabel: this.phase === "provision" ? PROVISIONS[this.provIdx]?.label : "",
      meterValue: this.meterValue ?? 0,
      windowStart: this.windowStart ?? 0,
      windowEnd: this.windowEnd ?? 0,
    });
  }

  render(dt) {
    const t = performance.now() / 1000;
    // 俄巴底
    this.hero.position.set(this.playerX, 0, this.playerZ);
    this.hero.rotation.y = this.heroHeading;
    const moving = Math.abs(this.move.x) + Math.abs(this.move.z) > 0.01 && this.phase === "escort";
    if (moving) {
      const sw = Math.sin(t * 9) * 0.5;
      this.hero.userData.armL.rotation.x = sw;
      this.hero.userData.armR.rotation.x = -sw;
    } else if (this.phase !== "provision") {
      this.hero.userData.armL.rotation.x *= Math.max(0, 1 - dt * 8);
      this.hero.userData.armR.rotation.x *= Math.max(0, 1 - dt * 8);
    }
    if (this.phase === "provision" || this.phase === "finale") {
      this.hero.rotation.y = Math.PI;            // 面向山洞
      this.hero.userData.armL.rotation.x = -1.1; // 遞出餅和水
      this.hero.userData.armR.rotation.x = -1.1;
    }
    // 先知小隊(formation-kit 回傳座標)
    if (this.band) {
      const list = this.band.followers;
      this.prophets.forEach((f, i) => {
        if (!f.visible || i >= list.length) return;
        const fw = list[i];
        f.position.set(fw.x, 0, fw.z);
        f.rotation.y = this.heroHeading;
        const sw = Math.sin(fw.phase) * Math.min(0.55, 0.15 + fw.speed * 0.12);
        f.userData.armL.rotation.x = sw;
        f.userData.armR.rotation.x = -sw;
        f.userData.legL.rotation.x = -sw * 0.7;
        f.userData.legR.rotation.x = sw * 0.7;
        f.rotation.z = fw.stumbleT > 0 ? Math.sin(t * 20) * 0.12 : 0; // 絆倒晃一下
      });
    }
    // 兵丁+光錐
    for (let i = 0; i < this.guards.length; i += 1) {
      const gd = this.guards[i];
      if (!gd.fig.visible) continue;
      gd.fig.position.set(gd.x, 0, gd.z);
      gd.fig.rotation.y = gd.dir;
      const p = this.preset;
      gd.cone.geometry.dispose();
      gd.cone.geometry = new THREE.CircleGeometry(p.range, 24, Math.PI / 2 - p.fov, p.fov * 2);
      gd.cone.position.set(gd.x, 0.05, gd.z);
      gd.cone.rotation.z = -gd.dir;
    }
    // 軍長追擊擺臂
    if (this._bossActive) {
      const bsw = Math.sin(t * 11) * 0.7;
      this.boss.userData.armL.rotation.x = bsw;
      this.boss.userData.armR.rotation.x = -1.2;
      this.boss.userData.legL.rotation.x = bsw * 0.6;
      this.boss.userData.legR.rotation.x = -bsw * 0.6;
    }
    // 洞口紅圈呼吸
    if (this.goalRing.visible) {
      this.goalRing.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    }
    // 俄巴底被抓紅閃(苦臉)
    if (this.hero.userData.mouth) this.hero.userData.mouth.rotation.z = this._caughtT > 0 ? 0 : Math.PI;
    // 鏡頭(固定朝 -z 家族=不觸鏡像鐵則)
    let tPos, tLook;
    const px = this.playerX, pz = this.playerZ;
    if (this.camView === 1) {
      tPos = new THREE.Vector3(px, 3.4, pz + 7);
      tLook = new THREE.Vector3(px, 1, pz - 6);
    } else if (this.camView === 2) {
      tPos = new THREE.Vector3(px, 30, pz + 2);
      tLook = new THREE.Vector3(px, 0, pz - 3);
    } else if (this.camView === 3) {
      tPos = new THREE.Vector3(px - 16, 6, pz - 2);
      tLook = new THREE.Vector3(px, 0.8, pz - 2);
    } else if (this.camView === 4) {
      tPos = new THREE.Vector3(this.goal ? this.goal.x : 0, 4, (this.goal ? this.goal.z : 0) - 6);
      tLook = new THREE.Vector3(px, 0.8, pz);
    } else {
      tPos = new THREE.Vector3(px * 0.75, 11, pz + 11);
      tLook = new THREE.Vector3(px * 0.85, 0, pz - 4);
    }
    if (this.phase === "provision" || this.phase === "finale") {
      tPos = new THREE.Vector3(px, 5.5, pz + 9);
      tLook = new THREE.Vector3(px, 1.2, pz - 4);
    }
    const k = 1 - Math.exp(-dt * 3.4);
    this._camPos.lerp(tPos, k);
    this._camLook.lerp(tLook, k);
    const sh = this.cameraShake;
    this.camera.position.set(this._camPos.x + rand(-sh, sh) * 0.4, this._camPos.y + rand(-sh, sh) * 0.3, this._camPos.z);
    this.camera.lookAt(this._camLook);
    this.renderer.render(this.scene, this.camera);
  }

  startLoop() {
    if (this._running) return;
    this._running = true;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.update(dt);
      this.render(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
