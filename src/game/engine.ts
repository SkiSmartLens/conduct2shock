import * as THREE from "three";
import { GameAudio } from "./audio";
import { FX, Meter } from "./fx";
import {
  buildBalloon,
  buildCharacter,
  buildDuck,
  buildEel,
  buildHat,
  buildMiniCloud,
  buildRod,
  buildSprinkler,
  buildStormCloud,
  buildWorld,
  groundHeight,
  FOUNTAIN_R,
  SAND_R,
  WALK_R,
  WEAPON_KINDS,
  XRAY_MAT,
  ZAP_MAT,
  type CharModel,
  type HatKind,
  type MiniCloud,
  type WeaponKind,
  type World,
} from "./models";

// ---------- public types ----------

export interface PlayerSetup {
  name: string;
  color: number;
  hat: HatKind;
  hatColor: number;
}

export interface HudPlayer {
  id: number;
  name: string;
  color: string;
  hp: number;
  wet: number;
  rods: number;
  cond: number;
  kos: number;
  deaths: number;
  alive: boolean;
  isHuman: boolean;
}

export interface HudState {
  players: HudPlayer[];
  weapon: WeaponKind;
  cooldowns: Record<WeaponKind, number>;
  storm: { timeLeft: number; countdown: boolean; target: string | null };
  timeLeft: number;
  phase: "playing" | "over";
  winner: string | null;
  flash: number;
  shaking: boolean;
  umbrella: boolean;
  you: HudPlayer | null;
}

export interface EngineCallbacks {
  onHud: (s: HudState) => void;
  onFeed: (msg: string, color?: string) => void;
}

export interface NetworkPlayerSetup extends PlayerSetup {
  id: string;
}

export interface NetPlayerState {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  wet: number;
  rods: number;
  kos: number;
  deaths: number;
  alive: boolean;
  weapon: WeaponKind;
  umbrella: boolean;
  shaking: boolean;
  firing: boolean;
  aimX: number;
  aimZ: number;
}

export interface NetEffect {
  targetId: string;
  byId: string;
  kind: "soak" | "damage" | "shock" | "rod" | "stun";
  amount: number;
  how?: string;
  stun?: number;
}

export interface NetAction {
  weapon: WeaponKind;
  x: number;
  z: number;
  yaw: number;
  aimX: number;
  aimZ: number;
}

export interface NetDeploy {
  kind: "duck" | "sprinkler" | "cloud";
  x: number;
  y: number;
  z: number;
}

export interface NetStorm {
  phase: "countdown" | "strike";
  targetId: string | null;
  at: [number, number, number];
  maxCond: number;
  nextIn: number;
}

export interface MultiplayerOptions {
  playerId: string;
  players: NetworkPlayerSetup[];
  send: (event: string, data: unknown) => void;
  isCoordinator: () => boolean;
  elapsed?: number;
}

export interface WeaponInfo {
  label: string;
  cooldown: number;
  range: number;
  key: string;
  blurb: string;
}

export const WEAPONS: Record<WeaponKind, WeaponInfo> = {
  balloon: {
    label: "Water Balloon",
    cooldown: 0.9,
    range: 14,
    key: "1",
    blurb: "Throw. Soaks on splash.",
  },
  rod: {
    label: "Lightning Rod",
    cooldown: 2.2,
    range: 16,
    key: "2",
    blurb: "Throw. Sticks on, +18% each.",
  },
  taser: {
    label: "Taser",
    cooldown: 0.7,
    range: 2.4,
    key: "3",
    blurb: "Close range. Damage × conductance.",
  },
  eel: {
    label: "Electric Eel",
    cooldown: 2.6,
    range: 19,
    key: "4",
    blurb: "Throw. Damage × conductance.",
  },
  soaker: {
    label: "Super Soaker",
    cooldown: 0.11,
    range: 9,
    key: "5",
    blurb: "Hold. Steady stream of wet.",
  },
  bucket: {
    label: "Bucket Dump",
    cooldown: 2.8,
    range: 3,
    key: "6",
    blurb: "Melee. Drenches everyone in front.",
  },
  cloud: {
    label: "Pocket Storm",
    cooldown: 7,
    range: 15,
    key: "7",
    blurb: "Throw. Mini storm zaps the best conductor near it.",
  },
  duck: {
    label: "Decoy Duck",
    cooldown: 9,
    range: 2,
    key: "8",
    blurb: "Place. 70% conductor that lures the storm.",
  },
  umbrella: {
    label: "Metal Umbrella",
    cooldown: 0,
    range: 0,
    key: "9",
    blurb: "Hold. Blocks throws… but +30% conductance.",
  },
  sprinkler: {
    label: "Sprinkler",
    cooldown: 9,
    range: 12,
    key: "0",
    blurb: "Throw. Waters an area for 7s.",
  },
};
const KEY_TO_WEAPON: Record<string, WeaponKind> = Object.fromEntries(
  WEAPON_KINDS.map((k) => [WEAPONS[k].key, k]),
) as Record<string, WeaponKind>;

const BOT_NAMES = [
  "Sparky",
  "Puddles",
  "Zapatha",
  "Dampy",
  "Voltina",
  "Soggy Sam",
  "Ohm",
  "Drizzle",
];
const BOT_COLORS = [0xff6b6b, 0x48dbfb, 0xfeca57, 0x1dd1a1, 0xff9ff3, 0xff9f43, 0x54a0ff, 0xc8d6e5];
const HATS: HatKind[] = [
  "party",
  "top",
  "propeller",
  "cowboy",
  "viking",
  "chef",
  "crown",
  "beanie",
];
const TAUNTS_HIT = ["GOTCHA!", "SPLISH!", "HAHA!", "WET YET?", "OOPS!"];
const TAUNTS_UHOH = ["uh oh...", "not me!", "MOMMY!", "why me?!"];

const MATCH_SECONDS = 180;
const G = -22;
const DUCK_COND = 70;

// ---------- entities ----------

type AiMode = "wander" | "hunt" | "shake" | "flee";

class Character {
  model: CharModel;
  meter: Meter;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  hp = 100;
  wet = 0;
  rods: { mesh: THREE.Object3D; t: number }[] = [];
  kos = 0;
  deaths = 0;
  alive = true;
  respawnT = 0;
  weapon: WeaponKind = "balloon";
  cooldowns: Record<WeaponKind, number> = Object.fromEntries(
    WEAPON_KINDS.map((k) => [k, 0]),
  ) as Record<WeaponKind, number>;
  umbrellaOpen = false;
  umbrellaK = 0;
  // animation
  walkPhase = 0;
  speedAnim = 0;
  throwT = -1;
  taserT = -1;
  soakT = 0;
  swingT = -1;
  bucketPending = false;
  shaking = false;
  shakeT = 0;
  squash = 0;
  spawnT = 0;
  zapT = -1;
  zapDur = 0.6;
  zapBig = false;
  rattled = false;
  charredT = 0;
  stun = 0;
  dashT = 0;
  dashCd = 0;
  dripT = 0;
  blinkT = 2;
  lookT = 1;
  lookY = 0;
  brrT = 2;
  crackleT = 0;
  saidUhOh = false;
  // ai
  ai: {
    mode: AiMode;
    target: Character | null;
    wander: THREE.Vector3;
    think: number;
    strafe: number;
    aimErr: number;
    umbrellaT: number;
    fleeFrom: THREE.Vector3;
    fleeT: number;
  } = {
    mode: "wander",
    target: null,
    wander: new THREE.Vector3(),
    think: 0,
    strafe: 1,
    aimErr: 0.6,
    umbrellaT: 0,
    fleeFrom: new THREE.Vector3(),
    fleeT: 0,
  };
  moveDir = new THREE.Vector3();
  aim = new THREE.Vector3();
  wantsFire = false;
  netId: string | null = null;
  remote = false;
  netGoal: NetPlayerState | null = null;

  constructor(
    public id: number,
    public name: string,
    public color: number,
    public isHuman: boolean,
    hat: HatKind,
    hatColor: number,
  ) {
    this.model = buildCharacter(color, hat, hatColor);
    this.meter = new Meter(name, "#" + new THREE.Color(color).getHexString());
    this.meter.sprite.position.y = 2.55;
    this.model.root.add(this.meter.sprite);
    this.setWeapon("balloon");
  }

  get cond() {
    return Math.min(
      100,
      Math.round(this.wet * 0.6 + this.rods.length * 18 + (this.umbrellaOpen ? 30 : 0)),
    );
  }

  setWeapon(w: WeaponKind) {
    this.weapon = w;
    for (const k of WEAPON_KINDS) this.model.items[k].visible = k === w;
  }
}

type ThrownKind = "balloon" | "rod" | "eel" | "cloud" | "sprinkler";

interface Projectile {
  kind: ThrownKind;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: Character;
  t: number;
  spin: THREE.Vector3;
  eelSegs?: THREE.Object3D[];
  harmless?: boolean;
  ghost?: boolean;
}

interface Debris {
  obj: THREE.Object3D;
  t: number;
  life: number;
  flop?: THREE.Object3D[];
  vel?: THREE.Vector3;
  spin?: THREE.Vector3;
}

interface Deploy {
  kind: "duck" | "sprinkler" | "cloud";
  obj: THREE.Group;
  pos: THREE.Vector3;
  t: number;
  life: number;
  owner: Character;
  meter?: Meter;
  arm?: THREE.Object3D;
  face?: MiniCloud;
  marker?: THREE.Mesh;
}

interface Conductor {
  name: string;
  cond: number;
  pos: THREE.Vector3;
  char: Character | null;
  deploy: Deploy | null;
}

// ---------- engine ----------

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  fx: FX;
  audio = new GameAudio();
  chars: Character[] = [];
  projectiles: Projectile[] = [];
  debris: Debris[] = [];
  deploys: Deploy[] = [];
  player: Character;
  private nextCharId = 1000;
  private netSendAcc = 0;
  private netLastSentAt = 0;
  private netLastSerialized = "";
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  stormCloud: MiniCloud;
  stormCloudGoal = new THREE.Vector3(0, 45, 0);
  stormMouthT = 0;
  keys = new Set<string>();
  mouse = new THREE.Vector2();
  mouseDown = false;
  aimPoint = new THREE.Vector3();
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8);
  time = 0;
  matchLeft = MATCH_SECONDS;
  stormIn = 14;
  stormCountdown = false;
  phase: "playing" | "over" = "playing";
  winner: string | null = null;
  hudT = 0;
  running = false;
  raf = 0;
  last = 0;
  camTarget = new THREE.Vector3();
  camShake = new THREE.Vector3();
  skyDay = new THREE.Color(0x8fd3ff);
  skyStorm = new THREE.Color(0x3b3f66);
  stormMix = 0;
  flashLight: THREE.PointLight;
  private resizeObs: ResizeObserver;
  private disposed = false;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onContext: (e: Event) => void;
  private onBlur: () => void;

  constructor(
    public canvas: HTMLCanvasElement,
    setup: PlayerSetup,
    botCount: number,
    public cb: EngineCallbacks,
    public net: MultiplayerOptions | null = null,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(0x8fd3ff, 45, 120);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 250);
    this.camera.position.set(0, 16, 14);

    this.hemi = new THREE.HemisphereLight(0xcfefff, 0x6a8f3f, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4d6, 2.2);
    this.sun.position.set(18, 30, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -32;
    sc.right = 32;
    sc.top = 32;
    sc.bottom = -32;
    sc.near = 5;
    sc.far = 90;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.flashLight = new THREE.PointLight(0xbfe8ff, 0, 80);
    this.flashLight.position.set(0, 20, 0);
    this.scene.add(this.flashLight);

    this.world = buildWorld();
    this.scene.add(this.world.group);
    this.fx = new FX(this.scene);
    this.stormCloud = buildStormCloud();
    this.stormCloud.group.position.set(0, 45, 0);
    this.stormCloud.group.visible = false;
    this.scene.add(this.stormCloud.group);

    // characters
    this.player = new Character(
      0,
      setup.name || "You",
      setup.color,
      true,
      setup.hat,
      setup.hatColor,
    );
    this.player.netId = this.net?.playerId ?? "local";
    this.chars.push(this.player);
    if (this.net) this.matchLeft = Math.max(1, MATCH_SECONDS - (this.net.elapsed ?? 0));
    const usedHats = new Set<HatKind>([setup.hat]);
    for (let i = 0; i < (this.net ? 0 : botCount); i++) {
      let hat = HATS[(i + 1) % HATS.length]!;
      if (usedHats.has(hat)) hat = HATS.find((h) => !usedHats.has(h)) ?? hat;
      usedHats.add(hat);
      const c = new Character(
        i + 1,
        BOT_NAMES[i % BOT_NAMES.length]!,
        BOT_COLORS[(i + (setup.color === BOT_COLORS[0] ? 1 : 0)) % BOT_COLORS.length]!,
        false,
        hat,
        BOT_COLORS[(i + 3) % BOT_COLORS.length]!,
      );
      c.ai.aimErr = 0.35 + Math.random() * 0.6;
      c.ai.think = Math.random();
      this.chars.push(c);
    }
    this.chars.forEach((c, i) => {
      this.scene.add(c.model.root);
      this.spawnAt(c, i, this.chars.length);
    });
    if (this.net) this.setRoster(this.net.players);

    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);

    this.onKeyDown = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      const w = KEY_TO_WEAPON[k];
      if (w) {
        this.player.setWeapon(w);
        this.audio.select();
      }
      if (k === "q") this.cycleWeapon(-1);
      if (k === "e") this.cycleWeapon(1);
      if (k === " " || k === "shift") this.dash(this.player);
      if (k === "m") this.audio.setMuted(!this.audio.muted);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    this.onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    };
    this.onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.dash(this.player);
      this.audio.init();
      this.audio.startMusic();
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this.onWheel = (e) => {
      this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      e.preventDefault();
    };
    this.onContext = (e) => e.preventDefault();
    this.onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContext);

    this.audio.init();
    this.audio.startMusic();
    this.cb.onFeed("⚡ Storm hits whoever conducts best. Stay dry!", "#ffe14d");
    // handy for poking at the game from the console
    (window as unknown as { __c2s: Engine }).__c2s = this;
  }

  // ---------- online multiplayer ----------

  setRoster(players: NetworkPlayerSetup[]) {
    if (!this.net) return;
    const unique = players
      .filter((p, i) => p.id && players.findIndex((other) => other.id === p.id) === i)
      .slice(0, 8);
    const previousIds = new Set(this.chars.map((c) => c.netId));
    const nextIds = new Set(unique.map((p) => p.id));
    const membershipChanged =
      previousIds.size !== nextIds.size || [...nextIds].some((id) => !previousIds.has(id));

    for (let i = this.chars.length - 1; i >= 0; i--) {
      const c = this.chars[i]!;
      if (!c.remote || (c.netId && nextIds.has(c.netId))) continue;
      this.scene.remove(c.model.root);
      c.meter.dispose();
      for (let p = this.projectiles.length - 1; p >= 0; p--) {
        if (this.projectiles[p]!.owner !== c) continue;
        this.scene.remove(this.projectiles[p]!.obj);
        this.projectiles.splice(p, 1);
      }
      for (let d = this.deploys.length - 1; d >= 0; d--) {
        if (this.deploys[d]!.owner === c) this.removeDeploy(d, false);
      }
      this.chars.splice(i, 1);
    }

    for (const profile of unique) {
      if (profile.id === this.net.playerId || this.chars.some((c) => c.netId === profile.id)) continue;
      const c = new Character(
        this.nextCharId++,
        profile.name,
        profile.color,
        false,
        profile.hat,
        profile.hatColor,
      );
      c.netId = profile.id;
      c.remote = true;
      this.chars.push(c);
      this.scene.add(c.model.root);
    }

    if (membershipChanged) {
      unique.forEach((profile, index) => {
        const c = this.chars.find((candidate) => candidate.netId === profile.id);
        if (c) this.spawnAt(c, index, Math.max(1, unique.length));
      });
    }
  }

  private networkCharacter(id: string | null | undefined): Character | null {
    return this.chars.find((c) => c.netId === id) ?? null;
  }

  private localNetworkState(): NetPlayerState {
    const p = this.player;
    const round = (n: number, scale = 100) => Math.round(n * scale) / scale;
    return {
      id: this.net!.playerId,
      x: round(p.pos.x),
      y: round(p.pos.y),
      z: round(p.pos.z),
      yaw: round(p.yaw, 1000),
      hp: Math.max(0, Math.round(p.hp)),
      wet: Math.round(p.wet),
      rods: p.rods.length,
      kos: p.kos,
      deaths: p.deaths,
      alive: p.alive,
      weapon: p.weapon,
      umbrella: p.umbrellaOpen,
      shaking: p.shaking,
      firing: p.wantsFire,
      aimX: round(p.aim.x),
      aimZ: round(p.aim.z),
    };
  }

  private updateNetwork(dt: number) {
    if (!this.net || document.hidden) return;
    this.netSendAcc += dt;
    const count = Math.max(2, this.chars.length);
    const interval = 1 / (count <= 5 ? 8 : count === 6 ? 6 : 4);
    if (this.netSendAcc < interval) return;
    this.netSendAcc = 0;
    const state = this.localNetworkState();
    const serialized = JSON.stringify(state);
    if (serialized === this.netLastSerialized && this.time - this.netLastSentAt < 1) return;
    this.netLastSerialized = serialized;
    this.netLastSentAt = this.time;
    this.net.send("state", state);
  }

  applyNetworkState(state: NetPlayerState) {
    if (!this.net || state.id === this.net.playerId) return;
    if (![state.x, state.y, state.z, state.yaw, state.hp, state.wet].every(Number.isFinite)) return;
    const c = this.networkCharacter(state.id);
    if (!c?.remote) return;
    const wasAlive = c.alive;
    c.netGoal = { ...state };
    if (WEAPON_KINDS.includes(state.weapon)) c.setWeapon(state.weapon);
    c.wantsFire = Boolean(state.firing);
    c.shaking = Boolean(state.shaking);
    c.aim.set(state.aimX, 0, state.aimZ);
    if (wasAlive && !state.alive) this.ko(c, c, "network");
    if (!wasAlive && state.alive) {
      this.spawnAt(c, 0, 8);
      c.pos.set(state.x, state.y, state.z);
      c.spawnT = 0.45;
    }
    c.hp = state.hp;
    c.wet = state.wet;
    c.kos = state.kos;
    c.deaths = state.deaths;
    c.alive = state.alive;
    this.syncRemoteRods(c, Math.max(0, Math.min(3, Math.round(state.rods))));
  }

  private syncRemoteRods(c: Character, count: number) {
    while (c.rods.length > count) {
      const rod = c.rods.pop()!;
      c.model.rods.remove(rod.mesh);
    }
    while (c.rods.length < count) {
      const rod = buildRod();
      rod.scale.setScalar(0.75);
      const a = (c.rods.length / 3) * Math.PI * 2;
      rod.position.set(Math.cos(a) * 0.45, 1.05, Math.sin(a) * 0.45);
      rod.rotation.set(0.3, a, 0.4);
      c.model.rods.add(rod);
      c.rods.push({ mesh: rod, t: 999 });
    }
  }

  playNetworkAction(from: string, action: NetAction) {
    const c = this.networkCharacter(from);
    if (!c?.remote || !WEAPON_KINDS.includes(action.weapon)) return;
    if (![action.x, action.z, action.yaw, action.aimX, action.aimZ].every(Number.isFinite)) return;
    c.pos.set(action.x, groundHeight(action.x, action.z), action.z);
    c.yaw = action.yaw;
    c.aim.set(action.aimX, 0, action.aimZ);
    c.setWeapon(action.weapon);
    this.fire(c, true);
  }

  applyNetworkDeploy(from: string, data: NetDeploy) {
    const owner = this.networkCharacter(from);
    if (!owner?.remote || ![data.x, data.y, data.z].every(Number.isFinite)) return;
    const at = new THREE.Vector3(data.x, data.y, data.z);
    if (data.kind === "duck") this.deployDuck(at, owner);
    else if (data.kind === "sprinkler") this.deploySprinkler(at, owner);
    else if (data.kind === "cloud") this.deployCloud(at, owner);
  }

  applyNetworkEffect(effect: NetEffect) {
    if (!this.net || effect.targetId !== this.net.playerId || !Number.isFinite(effect.amount)) return;
    const by = this.networkCharacter(effect.byId) ?? this.player;
    const amount = THREE.MathUtils.clamp(effect.amount, 0, 200);
    if (effect.kind === "soak") {
      this.soak(this.player, amount, by);
      if (effect.stun) this.player.stun = Math.max(this.player.stun, effect.stun);
    } else if (effect.kind === "damage") {
      if (effect.stun) this.player.stun = Math.max(this.player.stun, effect.stun);
      this.damage(this.player, amount, by, effect.how ?? "hit");
    } else if (effect.kind === "shock") {
      const how = (["taser", "eel", "storm", "cloud"].includes(effect.how ?? "")
        ? effect.how
        : "taser") as "taser" | "eel" | "storm" | "cloud";
      this.shock(this.player, by, amount, how);
      if (how === "storm") {
        this.player.charredT = 7;
        this.player.model.hair.visible = true;
        this.player.wet = Math.max(0, this.player.wet - 60);
      }
    } else if (effect.kind === "rod") {
      this.attachRod(this.player, by, this.player.pos);
    } else if (effect.kind === "stun") {
      this.player.stun = Math.max(this.player.stun, amount);
    }
  }

  private sendEffect(target: Character, by: Character, effect: Omit<NetEffect, "targetId" | "byId">) {
    if (!this.net || !target.remote || !target.netId || !by.netId) return;
    this.net.send("effect", { ...effect, targetId: target.netId, byId: by.netId });
  }

  creditNetworkKo(byId: string) {
    if (this.net && byId === this.net.playerId) this.player.kos++;
  }

  applyNetworkStorm(data: NetStorm) {
    if (!this.net || this.net.isCoordinator()) return;
    if (data.phase === "countdown") {
      this.stormIn = Math.max(0.1, data.nextIn);
      this.stormCountdown = true;
      this.audio.setTense(true);
      this.audio.siren();
      this.audio.rumble();
      this.stormCloud.group.visible = true;
      this.cb.onFeed("⛈️ STORM INCOMING! Highest conductance gets zapped!", "#ffe14d");
      return;
    }
    this.stormIn = Math.max(8, data.nextIn);
    this.stormCountdown = false;
    this.audio.setTense(false);
    this.strike(data);
  }

  // ---------- setup helpers ----------

  private spawnAt(c: Character, i: number, n: number) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    const r = 13;
    c.pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    c.vel.set(0, 0, 0);
    c.yaw = Math.atan2(-c.pos.x, -c.pos.z);
    c.hp = 100;
    c.wet = 0;
    c.alive = true;
    c.stun = 0;
    c.zapT = -1;
    c.charredT = 0;
    c.shaking = false;
    c.umbrellaOpen = false;
    c.swingT = -1;
    c.throwT = -1;
    c.bucketPending = false;
    c.saidUhOh = false;
    for (const r of c.rods) c.model.rods.remove(r.mesh);
    c.rods = [];
    const m = c.model;
    m.root.position.copy(c.pos);
    m.pivot.rotation.set(0, 0, 0);
    m.pivot.position.set(0, 0, 0);
    m.root.visible = true;
    m.hat.visible = true;
    m.koStars.visible = false;
    m.tongue.visible = false;
    m.hair.visible = false;
    m.spikes.visible = false;
    m.skel.group.position.y = 0;
    this.setXray(c, "off");
    this.setFace(c, "normal");
    this.applySkin(c);
  }

  private cycleWeapon(d: number) {
    const i = WEAPON_KINDS.indexOf(this.player.weapon);
    const n = WEAPON_KINDS.length;
    this.player.setWeapon(WEAPON_KINDS[(i + d + n) % n]!);
    this.audio.select();
  }

  resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    this.resizeObs.disconnect();
    this.audio.dispose();
    this.fx.dispose();
    for (const c of this.chars) c.meter.dispose();
    for (const d of this.deploys) d.meter?.dispose();
    this.renderer.dispose();
  }

  // ---------- main step ----------

  step(dt: number) {
    this.time += dt;
    if (this.phase === "playing") {
      this.matchLeft -= dt;
      if (this.matchLeft <= 0) this.endMatch();
    }
    this.updateAim();
    this.updateInput();
    for (const c of this.chars) if (!c.isHuman && !c.remote) this.updateAI(c, dt);
    const top = this.topConductor();
    for (const c of this.chars) this.updateChar(c, dt, top);
    this.updateProjectiles(dt);
    this.updateDeploys(dt, top);
    this.updateDebris(dt);
    this.updateStorm(dt, top);
    if (this.net) this.updateNetwork(dt);
    this.fx.update(dt);
    this.updateWorld(dt);
    this.updateCamera(dt);
    this.hudT += dt;
    if (this.hudT > 0.1) {
      this.hudT = 0;
      this.cb.onHud(this.hudState());
    }
  }

  private hudPlayer(c: Character): HudPlayer {
    return {
      id: c.id,
      name: c.name,
      color: "#" + new THREE.Color(c.color).getHexString(),
      hp: c.hp,
      wet: c.wet,
      rods: c.rods.length,
      cond: c.cond,
      kos: c.kos,
      deaths: c.deaths,
      alive: c.alive,
      isHuman: c.isHuman,
    };
  }

  hudState(): HudState {
    return {
      players: this.chars.map((c) => this.hudPlayer(c)),
      weapon: this.player.weapon,
      cooldowns: { ...this.player.cooldowns },
      storm: {
        timeLeft: this.stormIn,
        countdown: this.stormCountdown,
        target: this.stormCountdown ? (this.topConductor()?.name ?? null) : null,
      },
      timeLeft: this.matchLeft,
      phase: this.phase,
      winner: this.winner,
      flash: this.fx.flash,
      shaking: this.player.shaking,
      umbrella: this.player.umbrellaOpen,
      you: this.hudPlayer(this.player),
    };
  }

  private endMatch() {
    this.phase = "over";
    this.matchLeft = 0;
    const sorted = [...this.chars].sort((a, b) => b.kos - a.kos || a.deaths - b.deaths);
    this.winner = sorted[0]!.name;
    this.audio.stopMusic();
    this.audio.fanfare(sorted[0] === this.player);
    this.cb.onFeed(`🏆 ${this.winner} wins the match!`, "#ffe14d");
    this.cb.onHud(this.hudState());
  }

  // ---------- input ----------

  private updateAim() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, p)) {
      this.aimPoint.copy(p);
      this.aimPoint.y = 0;
    }
    this.player.aim.copy(this.aimPoint);
  }

  private updateInput() {
    const p = this.player;
    const k = this.keys;
    const d = new THREE.Vector3();
    if (k.has("w") || k.has("arrowup")) d.z -= 1;
    if (k.has("s") || k.has("arrowdown")) d.z += 1;
    if (k.has("a") || k.has("arrowleft")) d.x -= 1;
    if (k.has("d") || k.has("arrowright")) d.x += 1;
    if (d.lengthSq() > 0) d.normalize();
    p.moveDir.copy(d);
    p.wantsFire = this.mouseDown && this.phase === "playing";
    p.shaking = k.has("r") && p.alive && p.stun <= 0;
  }

  dash(c: Character) {
    if (!c.alive || c.dashCd > 0 || c.stun > 0 || this.phase !== "playing") return;
    const dir =
      c.moveDir.lengthSq() > 0
        ? c.moveDir.clone()
        : new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    c.vel.copy(dir.multiplyScalar(26));
    c.dashT = 0.18;
    c.dashCd = 1.4;
    this.audio.dash();
    this.fx.smoke(c.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 4);
  }

  // ---------- AI ----------

  private incomingThrow(c: Character) {
    for (const p of this.projectiles) {
      if (p.owner === c || p.harmless) continue;
      const to = c.pos.clone().sub(p.pos);
      const d = to.length();
      if (d < 6 && p.vel.clone().setY(0).normalize().dot(to.setY(0).normalize()) > 0.8) return true;
    }
    return false;
  }

  private updateAI(c: Character, dt: number) {
    if (!c.alive || this.phase !== "playing") {
      c.moveDir.set(0, 0, 0);
      c.wantsFire = false;
      c.shaking = false;
      return;
    }
    const ai = c.ai;
    ai.think -= dt;
    ai.umbrellaT = Math.max(0, ai.umbrellaT - dt);
    ai.fleeT = Math.max(0, ai.fleeT - dt);
    const others = this.chars.filter((o) => o !== c && o.alive);
    const top = this.topConductor();
    const stormSoon = this.stormCountdown || this.stormIn < 6;

    // reflex: raise the umbrella when something is flying at me
    if (
      ai.umbrellaT <= 0 &&
      !stormSoon &&
      c.cond < 45 &&
      Math.random() < dt * 1.5 &&
      this.incomingThrow(c)
    ) {
      ai.umbrellaT = 0.9;
    }

    if (ai.think <= 0) {
      ai.think = 0.25 + Math.random() * 0.3;
      const near = others.map((o) => ({ o, d: o.pos.distanceTo(c.pos) })).sort((a, b) => a.d - b.d);
      if (near.length) {
        const juicy = near
          .filter((n) => n.o.cond >= 35 && n.d < 12)
          .sort((a, b) => b.o.cond - a.o.cond)[0];
        ai.target = (
          juicy ?? near[Math.random() < 0.75 ? 0 : Math.floor(Math.random() * near.length)]!
        ).o;
      } else ai.target = null;

      const imSoaked = c.cond >= 45;
      const imTop = top?.char === c;
      if (ai.fleeT > 0) ai.mode = "flee";
      else if (stormSoon && imTop) ai.mode = "shake";
      else if (
        imSoaked &&
        !(ai.target && ai.target.pos.distanceTo(c.pos) < 4 && ai.target.cond >= 40) &&
        Math.random() < 0.65
      )
        ai.mode = "shake";
      else if (ai.target) ai.mode = Math.random() < 0.08 ? "wander" : "hunt";
      else ai.mode = "wander";
      if (ai.mode === "wander" || ai.wander.lengthSq() === 0) {
        const a = Math.random() * Math.PI * 2;
        const r = 5 + Math.random() * 15;
        ai.wander.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      if (Math.random() < 0.3) ai.strafe = Math.random() < 0.5 ? -1 : 1;

      // the escape plan: top conductor with a duck in the bag drops it and runs
      if (stormSoon && imTop && c.cooldowns.duck <= 0 && this.stormIn > 1.2) {
        c.setWeapon("duck");
        c.wantsFire = true;
        c.aim.copy(c.pos);
        this.fire(c);
        ai.fleeFrom.copy(c.pos);
        ai.fleeT = 3.5;
        ai.mode = "flee";
      }

      // pick a weapon
      if (ai.target && ai.mode === "hunt") {
        const d = ai.target.pos.distanceTo(c.pos);
        const tc = ai.target.cond;
        const cd = c.cooldowns;
        let w: WeaponKind = "balloon";
        if (tc >= 35 && d < 3.2 && cd.taser <= 0) w = "taser";
        else if (tc >= 30 && d < 19 && cd.eel <= 0.4) w = "eel";
        else if (d < 3.4 && cd.bucket <= 0 && Math.random() < 0.6) w = "bucket";
        else if (tc >= 25 && d < 15 && cd.cloud <= 0 && Math.random() < 0.5) w = "cloud";
        else if (d < 12 && cd.sprinkler <= 0 && Math.random() < 0.2) w = "sprinkler";
        else if (tc < 60 && cd.rod <= 0.5 && Math.random() < 0.5) w = "rod";
        else if (d < 8.5 && Math.random() < 0.35) w = "soaker";
        else if (cd.balloon <= 0.3) w = "balloon";
        else if (cd.rod <= 0.3) w = "rod";
        else w = "soaker";
        c.setWeapon(w);
      }
      if (Math.random() < 0.08 && c.dashCd <= 0) this.dash(c);
    }

    const move = new THREE.Vector3();
    c.shaking = false;
    c.wantsFire = false;
    const t = ai.target;
    if (ai.umbrellaT > 0) {
      c.setWeapon("umbrella");
      c.wantsFire = true;
      if (t) c.aim.copy(t.pos);
    } else if (ai.mode === "flee") {
      move.copy(c.pos).sub(ai.fleeFrom).setY(0);
      if (move.lengthSq() < 0.01) move.set(1, 0, 0);
      move.normalize();
    } else if (ai.mode === "shake") {
      const away = new THREE.Vector3();
      for (const o of others) {
        const d = c.pos.distanceTo(o.pos);
        if (d < 6)
          away.add(
            c.pos
              .clone()
              .sub(o.pos)
              .normalize()
              .multiplyScalar((6 - d) / 6),
          );
      }
      if (away.lengthSq() > 0.2) move.copy(away.normalize());
      else c.shaking = true;
    } else if (ai.mode === "hunt" && t) {
      const to = t.pos.clone().sub(c.pos);
      const d = to.length();
      to.normalize();
      const w = c.weapon;
      const want = w === "taser" || w === "bucket" ? 1.6 : w === "soaker" ? 5 : w === "eel" ? 9 : 7;
      if (d > want + 1.5) move.copy(to);
      else if (d < want - 1.5) move.copy(to).negate();
      else move.copy(new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(ai.strafe * 0.6));
      const lead = t.vel.clone().multiplyScalar(0.3 * d * 0.08);
      c.aim
        .copy(t.pos)
        .add(lead)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * ai.aimErr * 2,
            0,
            (Math.random() - 0.5) * ai.aimErr * 2,
          ),
        );
      const melee = w === "taser" || w === "bucket";
      const inRange = melee ? d < 2.6 : d < WEAPONS[w].range * 0.95;
      c.wantsFire = inRange && c.cooldowns[w] <= 0 && (w === "soaker" || Math.random() < 0.6);
    } else {
      const to = ai.wander.clone().sub(c.pos);
      if (to.length() < 1.5) ai.wander.set(0, 0, 0);
      else move.copy(to.normalize());
    }
    // avoid the fountain, the edge, obstacles and live sprinklers
    const r = c.pos.length();
    if (r < FOUNTAIN_R + 1.6 && !c.shaking) move.add(c.pos.clone().normalize().multiplyScalar(2));
    if (r > SAND_R - 1.5) move.add(c.pos.clone().normalize().multiplyScalar(-2));
    for (const o of this.world.obstacles) {
      const dx = c.pos.x - o.x;
      const dz = c.pos.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r + 1.2 && d > 0.001)
        move.add(new THREE.Vector3(dx / d, 0, dz / d).multiplyScalar(0.8));
    }
    for (const dp of this.deploys) {
      if (dp.kind !== "sprinkler") continue;
      const d = c.pos.distanceTo(dp.pos);
      if (d < 4.2 && d > 0.01) move.add(c.pos.clone().sub(dp.pos).normalize().multiplyScalar(1.2));
    }
    if (move.lengthSq() > 0) move.normalize();
    c.moveDir.copy(move);
  }

  // ---------- character update ----------

  private updateChar(c: Character, dt: number, top: Conductor | null) {
    const m = c.model;
    for (const k of WEAPON_KINDS) c.cooldowns[k] = Math.max(0, c.cooldowns[k] - dt);
    c.dashCd = Math.max(0, c.dashCd - dt);
    c.stun = Math.max(0, c.stun - dt);
    c.spawnT = Math.max(0, c.spawnT - dt);

    if (!c.alive) {
      if (!c.remote) c.respawnT -= dt;
      // fallen over, lying there with the stars going round
      m.pivot.rotation.x = THREE.MathUtils.lerp(m.pivot.rotation.x, -Math.PI / 2, dt * 6);
      m.pivot.position.y = THREE.MathUtils.lerp(m.pivot.position.y, 0.45, dt * 6);
      m.koStars.rotation.y += dt * 5;
      m.koStars.children.forEach((s, i) => {
        s.position.y = Math.sin(this.time * 6 + i) * 0.1;
        s.rotation.z += dt * 3;
      });
      m.legL.rotation.x = THREE.MathUtils.lerp(m.legL.rotation.x, 0.3, dt * 5);
      m.legR.rotation.x = THREE.MathUtils.lerp(m.legR.rotation.x, -0.2, dt * 5);
      m.armL.rotation.z = THREE.MathUtils.lerp(m.armL.rotation.z, -1.4, dt * 5);
      m.armR.rotation.z = THREE.MathUtils.lerp(m.armR.rotation.z, 1.4, dt * 5);
      if (!c.remote && c.respawnT <= 0) this.respawn(c);
      c.meter.update(0, c.cond, false, c.isHuman);
      return;
    }

    // ---- movement ----
    const busy = c.swingT >= 0 || (c.throwT >= 0 && c.throwT < 0.12);
    const moving = c.moveDir.lengthSq() > 0 && c.stun <= 0 && !c.shaking && !busy;
    const inFountain = c.pos.length() < FOUNTAIN_R - 0.2;
    const inOcean = c.pos.length() > SAND_R + 0.4;
    const wetK = THREE.MathUtils.clamp((c.wet - 45) / 55, 0, 1);
    if (c.remote && c.netGoal) {
      const old = c.pos.clone();
      const target = new THREE.Vector3(c.netGoal.x, c.netGoal.y, c.netGoal.z);
      if (c.pos.distanceTo(target) > 5) c.pos.copy(target);
      else c.pos.lerp(target, 1 - Math.exp(-12 * dt));
      c.vel.copy(c.pos).sub(old).divideScalar(Math.max(dt, 0.001));
      c.moveDir.copy(c.vel).setY(0);
      if (c.moveDir.lengthSq() > 0.01) c.moveDir.normalize();
    } else {
      let speed = 7.5;
      if (inFountain || inOcean) speed *= 0.55;
      speed *= 1 - wetK * 0.18;
      if (c.umbrellaOpen) speed *= 0.75;
      if (c.weapon === "soaker" && c.soakT > 0) speed *= 0.8;
      if (c.dashT > 0) {
        c.dashT -= dt;
      } else {
        const target = moving ? c.moveDir.clone().multiplyScalar(speed) : new THREE.Vector3();
        c.vel.x = THREE.MathUtils.damp(c.vel.x, target.x, 14, dt);
        c.vel.z = THREE.MathUtils.damp(c.vel.z, target.z, 14, dt);
      }
      c.pos.addScaledVector(c.vel, dt);

      for (const o of this.world.obstacles) this.pushOut(c.pos, o.x, o.z, o.r + 0.5);
      for (const o of this.chars) {
        if (o === c || !o.alive) continue;
        const dx = c.pos.x - o.pos.x;
        const dz = c.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1 && d > 0.0001) {
          const push = (1.1 - d) * (o.remote ? 1 : 0.5);
          c.pos.x += (dx / d) * push;
          c.pos.z += (dz / d) * push;
          if (!o.remote) {
            o.pos.x -= (dx / d) * push;
            o.pos.z -= (dz / d) * push;
          }
        }
      }
      const r = c.pos.length();
      if (r > WALK_R) c.pos.multiplyScalar(WALK_R / r);
      c.pos.y = groundHeight(c.pos.x, c.pos.z);
    }

    // ---- facing ----
    const aimDir = c.aim.clone().sub(c.pos);
    const aiming = c.wantsFire || c.throwT >= 0 || c.taserT >= 0 || c.swingT >= 0 || c.soakT > 0;
    if (c.remote && c.netGoal) {
      c.yaw = lerpAngle(c.yaw, c.netGoal.yaw, 1 - Math.exp(-dt * 14));
    } else if (aiming && aimDir.lengthSq() > 0.01) {
      const want = Math.atan2(aimDir.x, aimDir.z);
      c.yaw = lerpAngle(c.yaw, want, 1 - Math.exp(-dt * 18));
    } else if (moving) {
      const want = Math.atan2(c.vel.x, c.vel.z);
      c.yaw = lerpAngle(c.yaw, want, 1 - Math.exp(-dt * 12));
    }

    // ---- wetness ----
    if (!c.remote) {
    if (inFountain || inOcean) {
      if (c.wet < 100) {
        c.wet = Math.min(100, c.wet + dt * 140);
        if (Math.random() < dt * 6) this.fx.drip(c.pos.clone().add(new THREE.Vector3(0, 1, 0)));
      }
    } else if (c.shaking) {
      c.wet = Math.max(0, c.wet - dt * 28);
      c.shakeT += dt;
      if (c.wet > 3 && Math.random() < dt * 20) {
        this.fx.drip(
          c.pos
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 0.8,
                1 + Math.random(),
                (Math.random() - 0.5) * 0.8,
              ),
            ),
        );
        if (Math.random() < 0.3) this.audio.drip();
      }
      if (c.rods.length && c.shakeT > 1.6) {
        c.shakeT = 0;
        const rod = c.rods.pop()!;
        m.rods.remove(rod.mesh);
        this.dropRod(
          c,
          c.pos.clone().add(new THREE.Vector3(0, 1.3, 0)),
          new THREE.Vector3((Math.random() - 0.5) * 6, 5, (Math.random() - 0.5) * 6),
        );
        this.audio.boing();
        this.fx.comic("FLING!", c.pos.clone().add(new THREE.Vector3(0, 2.6, 0)), "#9be7ff");
      }
    } else {
      c.wet = Math.max(0, c.wet - dt * 2.2);
      c.shakeT = 0;
    }
    for (let i = c.rods.length - 1; i >= 0; i--) {
      const rod = c.rods[i]!;
      rod.t -= dt;
      rod.mesh.rotation.z += Math.sin(this.time * 9 + i) * dt * 0.4;
      if (rod.t <= 0) {
        c.rods.splice(i, 1);
        m.rods.remove(rod.mesh);
        this.dropRod(
          c,
          c.pos.clone().add(new THREE.Vector3(0, 1.3, 0)),
          new THREE.Vector3((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3),
        );
        this.audio.plop();
      }
    }
    if (c.wet > 40 && !inFountain) {
      c.dripT -= dt;
      if (c.dripT <= 0) {
        c.dripT = 0.8 - c.wet / 200;
        this.fx.drip(
          c.pos
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9, (Math.random() - 0.5) * 0.6)),
        );
      }
    }
    }
    // shivering "brrr" when soaked
    if (wetK > 0.3 && c.zapT < 0 && !c.shaking) {
      c.brrT -= dt;
      if (c.brrT <= 0) {
        c.brrT = 2.5 + Math.random() * 3;
        this.fx.comic(
          "brrr",
          c.pos.clone().add(new THREE.Vector3(0.6, 2.4, 0)),
          "#9be7ff",
          "#1b1530",
          0.8,
        );
        if (c.isHuman || c.pos.distanceTo(this.player.pos) < 12) this.audio.chatter();
      }
    }

    // ---- umbrella ----
    const wantUmbrella = c.weapon === "umbrella" && c.wantsFire && c.stun <= 0 && !c.shaking;
    if (wantUmbrella && !c.umbrellaOpen) {
      this.audio.umbrella();
      this.fx.comic(
        "FWOOMP",
        c.pos.clone().add(new THREE.Vector3(0, 2.8, 0)),
        "#ffffff",
        "#1b1530",
        0.9,
      );
    }
    c.umbrellaOpen = wantUmbrella;
    c.umbrellaK = THREE.MathUtils.damp(c.umbrellaK, c.umbrellaOpen ? 1 : 0, 14, dt);

    // ---- firing ----
    if (
      !c.remote &&
      c.wantsFire &&
      c.weapon !== "umbrella" &&
      c.cooldowns[c.weapon] <= 0 &&
      c.stun <= 0 &&
      !c.shaking &&
      c.swingT < 0
    )
      this.fire(c);
    if (c.remote && c.wantsFire && c.weapon === "soaker" && c.cooldowns.soaker <= 0) {
      c.cooldowns.soaker = WEAPONS.soaker.cooldown;
      c.soakT = 0.2;
      const nozzle = new THREE.Vector3();
      c.model.soakerNozzle.getWorldPosition(nozzle);
      const dir = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      this.fx.stream(nozzle, dir, WEAPONS.soaker.range * 0.8);
      if (c.pos.distanceTo(this.player.pos) < 14) this.audio.spray();
    }
    c.soakT = Math.max(0, c.soakT - dt);

    // =============== animation ===============
    const sp = Math.hypot(c.vel.x, c.vel.z);
    c.speedAnim = THREE.MathUtils.damp(c.speedAnim, sp / 7.5, 10, dt);
    c.walkPhase += dt * (6 + sp * 1.4) * (1 - wetK * 0.25);
    const wp = c.walkPhase;
    const k = c.speedAnim;
    const T = this.time;

    // base: walk cycle (soggy people trudge)
    const legAmp = 0.9 * (1 - wetK * 0.35);
    let lLx = Math.sin(wp) * legAmp * k;
    let lRx = -Math.sin(wp) * legAmp * k;
    let lLz = 0;
    let lRz = 0;
    let aLx = -Math.sin(wp) * 0.8 * k;
    let aLz = -0.3 - Math.abs(Math.sin(wp * 0.5)) * 0.1 * k;
    let aRx = Math.sin(wp) * 0.8 * k;
    let aRz = 0.3;
    let pivY = Math.abs(Math.sin(wp)) * (0.09 + wetK * 0.05) * k + Math.sin(T * 2.5 + c.id) * 0.015;
    let pivRx = k * 0.12;
    let pivRy = 0;
    let pivRz = 0;
    let pivX = 0;
    let pivZ = 0;
    let headZ = Math.sin(wp * 0.5) * 0.08 * k;
    let headX = 0;
    let headY = 0;
    let hatY = 0.38;
    let sx = 1;
    let sy = 1;
    let sz = 1;

    // idle look-around
    c.lookT -= dt;
    if (c.lookT <= 0) {
      c.lookT = 1.5 + Math.random() * 3;
      c.lookY = k < 0.2 ? (Math.random() - 0.5) * 1.1 : 0;
    }
    headY =
      m.head.rotation.y + (c.lookY * (k < 0.2 ? 1 : 0) - m.head.rotation.y) * Math.min(1, dt * 6);

    // soaked: hug yourself and shiver
    if (
      wetK > 0 &&
      c.zapT < 0 &&
      !c.shaking &&
      c.swingT < 0 &&
      c.throwT < 0 &&
      !c.umbrellaOpen &&
      c.soakT <= 0
    ) {
      const sh = Math.sin(T * 55) * wetK;
      aLx = THREE.MathUtils.lerp(aLx, -1.25, wetK);
      aLz = THREE.MathUtils.lerp(aLz, 0.7, wetK);
      aRx = THREE.MathUtils.lerp(aRx, -1.25, wetK * 0.8);
      aRz = THREE.MathUtils.lerp(aRz, -0.5, wetK * 0.8);
      lLz = -0.15 * wetK;
      lRz = 0.15 * wetK;
      pivX += sh * 0.03;
      headZ += sh * 0.06;
      pivRz += sh * 0.03;
    }

    // throw: wind up with a body twist, then whip forward
    if (c.throwT >= 0) {
      c.throwT += dt;
      const t = c.throwT;
      if (t < 0.14) {
        const q = t / 0.14;
        aRx = THREE.MathUtils.lerp(0, -2.8, q);
        pivRy = -0.55 * q;
        pivRx = -0.15 * q;
      } else if (t < 0.3) {
        const q = (t - 0.14) / 0.16;
        aRx = THREE.MathUtils.lerp(-2.8, 0.9, q);
        pivRy = THREE.MathUtils.lerp(-0.55, 0.4, q);
        pivRx = THREE.MathUtils.lerp(-0.15, 0.3, q);
        aLx = -0.8;
      } else if (t < 0.6) {
        const q = (t - 0.3) / 0.3;
        aRx = THREE.MathUtils.lerp(0.9, 0, q);
        pivRy = THREE.MathUtils.lerp(0.4, 0, q);
        pivRx = THREE.MathUtils.lerp(0.3, 0, q);
      } else c.throwT = -1;
      if (c.throwT < 0 && c.weapon !== "umbrella") m.items[c.weapon].visible = true;
    }

    // taser jab
    if (c.taserT >= 0) {
      c.taserT += dt;
      aRx = -1.5 + Math.sin(T * 60) * 0.1;
      aRz = 0.1;
      hatY = 0.38 + Math.abs(Math.sin(c.taserT * 20)) * 0.15;
      if (c.taserT > 0.3) c.taserT = -1;
    }

    // soaker: two-handed, slight recoil
    if (c.soakT > 0) {
      aRx = -1.45 + Math.sin(T * 70) * 0.04;
      aRz = 0.05;
      aLx = -1.2;
      aLz = 0.45;
      pivRx = 0.08;
    }

    // bucket: both arms over the head, then slam forward
    if (c.swingT >= 0) {
      c.swingT += dt;
      const t = c.swingT;
      if (t < 0.22) {
        const q = t / 0.22;
        aLx = aRx = THREE.MathUtils.lerp(0, -3.0, q);
        pivRx = -0.3 * q;
        pivY += 0.1 * q;
      } else if (t < 0.34) {
        const q = (t - 0.22) / 0.12;
        aLx = aRx = THREE.MathUtils.lerp(-3.0, 0.7, q);
        pivRx = THREE.MathUtils.lerp(-0.3, 0.45, q);
        if (!c.remote && c.bucketPending && t >= 0.28) {
          c.bucketPending = false;
          this.bucketDump(c);
        }
      } else if (t < 0.75) {
        const q = (t - 0.34) / 0.41;
        aLx = aRx = THREE.MathUtils.lerp(0.7, 0, q);
        pivRx = THREE.MathUtils.lerp(0.45, 0, q);
      } else c.swingT = -1;
      aLz = -0.15;
      aRz = 0.15;
    }

    // umbrella held straight up
    if (c.umbrellaK > 0.01) {
      aRx = THREE.MathUtils.lerp(aRx, -3.1, c.umbrellaK);
      aRz = THREE.MathUtils.lerp(aRz, 0.12, c.umbrellaK);
    }
    m.items.umbrella.rotation.x = Math.PI * c.umbrellaK;
    const can = 0.15 + 0.85 * c.umbrellaK;
    m.umbrellaCanopy.scale.set(can, 1, can);

    // shaking like a wet dog
    if (c.shaking) {
      const s = Math.sin(T * 38);
      pivRz = s * 0.28;
      pivRy = Math.sin(T * 19) * 0.3;
      headY = Math.sin(T * 45) * 0.5;
      aLz = -1.2 + s * 0.3;
      aRz = 1.2 - s * 0.3;
      aLx = aRx = 0;
      headZ = s * 0.2;
      hatY = 0.38 + Math.abs(s) * 0.08;
    }

    // stunned: head wobble
    if (c.stun > 0) headX = Math.sin(T * 40) * 0.2;

    // ZAP: comic electrocution
    if (c.zapT >= 0) {
      c.zapT += dt;
      const prog = c.zapT / c.zapDur;
      const strobe = Math.floor(c.zapT * 26) % 2 === 0;
      this.setXray(c, strobe ? "xray" : "zap");
      // starfish pose, vibrating
      aLx = aRx = (Math.random() - 0.5) * 0.3;
      aLz = -1.65 + (Math.random() - 0.5) * 0.2;
      aRz = 1.65 + (Math.random() - 0.5) * 0.2;
      lLz = -0.5;
      lRz = 0.5;
      lLx = lRx = 0;
      pivX = (Math.random() - 0.5) * 0.18;
      pivZ = (Math.random() - 0.5) * 0.12;
      pivRz = (Math.random() - 0.5) * 0.3;
      pivY += 0.15;
      hatY = 0.38 + Math.abs(Math.sin(c.zapT * 28)) * 0.4;
      headX = (Math.random() - 0.5) * 0.3;
      m.spikes.visible = true;
      m.spikes.rotation.y += dt * 12;
      const skel = m.skel;
      skel.jaw.position.y = -0.38 - Math.abs(Math.sin(T * 40)) * 0.1;
      if (c.zapBig) {
        // the skeleton jumps out of the body, flails, and hops back in
        const pk = THREE.MathUtils.clamp((prog - 0.22) / 0.5, 0, 1);
        const pop = Math.sin(pk * Math.PI);
        skel.group.position.y = pop * 1.6;
        skel.group.position.z = pop * 0.3;
        skel.group.rotation.z = Math.sin(pk * Math.PI * 3) * 0.25 * pop;
        skel.armL.rotation.z = -0.3 - 2.4 * pop;
        skel.armR.rotation.z = 0.3 + 2.4 * pop;
        skel.legL.rotation.x = Math.sin(T * 30) * 0.6 * pop;
        skel.legR.rotation.x = -Math.sin(T * 30) * 0.6 * pop;
        if (pk > 0 && pk < 1) skel.group.visible = true;
        if (pk > 0 && !c.rattled) {
          c.rattled = true;
          this.audio.boneRattle();
          this.fx.comic(
            "RATTLE!",
            c.pos.clone().add(new THREE.Vector3(0.8, 3.4, 0)),
            "#fdf6d8",
            "#1b1530",
            1,
          );
        }
      }
      if (Math.random() < dt * 30)
        this.fx.sparks(
          c.pos.clone().add(new THREE.Vector3(0, 0.3 + Math.random() * 1.8, 0)),
          2,
          0.5,
        );
      if (c.zapT >= c.zapDur) {
        c.zapT = -1;
        this.setXray(c, "off");
        m.spikes.visible = false;
        skel.group.position.set(0, 0, 0);
        skel.group.rotation.z = 0;
        skel.armL.rotation.z = -0.3;
        skel.armR.rotation.z = 0.3;
        skel.legL.rotation.x = skel.legR.rotation.x = 0;
        if (c.zapBig) this.fx.smoke(c.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 6);
      }
    }

    if (c.charredT > 0) {
      c.charredT -= dt;
      if (Math.random() < dt * 4) this.fx.smoke(c.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), 1);
      if (c.charredT <= 0) {
        m.hair.visible = false;
        this.applySkin(c);
      }
    }

    // squash & stretch, dash stretch, respawn pop
    c.squash = Math.max(0, c.squash - dt * 4);
    const sq = Math.sin(c.squash * Math.PI) * 0.25;
    sx = 1 + sq;
    sy = 1 - sq;
    sz = 1 + sq;
    if (c.dashT > 0) {
      sz *= 1.35;
      sy *= 0.85;
      sx *= 0.85;
    }
    if (c.spawnT > 0) {
      const q = 1 - c.spawnT / 0.45;
      const e = 1 - Math.pow(1 - q, 3) * Math.cos(q * 9);
      sx *= e;
      sy *= e;
      sz *= e;
    }

    // ---- apply ----
    m.legL.rotation.set(lLx, 0, lLz);
    m.legR.rotation.set(lRx, 0, lRz);
    m.armL.rotation.set(aLx, 0, aLz);
    m.armR.rotation.set(aRx, 0, aRz);
    m.pivot.position.set(
      pivX,
      THREE.MathUtils.lerp(m.pivot.position.y, pivY, Math.min(1, dt * 20)),
      pivZ,
    );
    m.pivot.rotation.set(
      THREE.MathUtils.lerp(m.pivot.rotation.x, pivRx, Math.min(1, dt * 14)),
      THREE.MathUtils.lerp(m.pivot.rotation.y, pivRy, Math.min(1, dt * 16)),
      THREE.MathUtils.lerp(m.pivot.rotation.z, pivRz, Math.min(1, dt * 16)),
    );
    m.pivot.scale.set(sx, sy, sz);
    m.head.rotation.set(headX, headY, headZ);
    m.hat.position.y = hatY;
    m.hat.rotation.z = Math.sin(wp) * 0.05 * k;
    if (m.propeller) m.propeller.rotation.y += dt * (3 + sp * 4);

    // blink
    c.blinkT -= dt;
    if (c.blinkT <= -0.12) c.blinkT = 2 + Math.random() * 4;
    const blink = c.blinkT <= 0 && c.zapT < 0 ? 0.15 : 1;

    // held-item idle animations
    if (c.weapon === "eel")
      m.eelSegs.forEach((s, i) => (s.rotation.y = Math.sin(T * 9 + i * 0.8) * 0.35));
    if (c.weapon === "balloon") m.items.balloon.scale.setScalar(0.8 * (1 + Math.sin(T * 6) * 0.04));
    if (c.weapon === "taser") {
      m.taserLed.visible = Math.floor(T * 4) % 2 === 0;
      c.crackleT -= dt;
      if (c.crackleT <= 0 && c.cooldowns.taser <= 0) {
        c.crackleT = 0.35 + Math.random() * 0.5;
        const tip = new THREE.Vector3();
        m.taserTip.getWorldPosition(tip);
        this.fx.taserArc(
          tip.clone().add(new THREE.Vector3(-0.05, 0, 0)),
          tip.clone().add(new THREE.Vector3(0.05, 0.03, 0.02)),
        );
      }
    }
    if (c.weapon === "cloud") {
      const f = m.cloudFace;
      f.pupils.forEach((p) =>
        p.position.set(Math.sin(T * 1.3) * 0.04, Math.cos(T * 0.9) * 0.03, 0.09),
      );
      const bolt = f.group.getObjectByName("bolt");
      if (bolt) bolt.visible = Math.random() > 0.4;
    }
    if (c.weapon === "sprinkler") m.sprinklerArm.rotation.y += dt * 4;
    m.bucketWater.visible = c.cooldowns.bucket <= 0.2;

    // wetness look
    this.applySkin(c);
    m.puddle.visible = c.wet > 60;
    m.puddle.scale.setScalar(0.6 + c.wet / 100);
    m.sweat.visible = c.wet > 50 && c.zapT < 0;
    if (m.sweat.visible) {
      m.sweat.rotation.y = Math.sin(T * 2) * 0.1;
      m.sweat.children.forEach(
        (d, i) => (d.position.y = 0.15 - (i % 2) * 0.25 + Math.sin(T * 4 + i) * 0.04),
      );
    }
    const isTop = !!top && top.char === c;
    m.marker.visible = this.stormCountdown && isTop;
    if (m.marker.visible) {
      m.marker.rotation.z += dt * 3;
      (m.marker.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(T * 12) * 0.4;
      if (!c.saidUhOh && !c.isHuman) {
        c.saidUhOh = true;
        this.fx.comic(
          TAUNTS_UHOH[Math.floor(Math.random() * TAUNTS_UHOH.length)]!,
          c.pos.clone().add(new THREE.Vector3(0, 2.9, 0)),
          "#ffffff",
          "#1b1530",
          0.9,
        );
      }
    } else if (!this.stormCountdown) c.saidUhOh = false;

    // face
    this.setFace(
      c,
      c.zapT >= 0
        ? "shock"
        : c.stun > 0
          ? "shock"
          : wetK > 0.4
            ? "cold"
            : c.cond > 70
              ? "worried"
              : c.wantsFire
                ? "angry"
                : "normal",
      blink,
    );

    m.root.position.copy(c.pos);
    m.root.rotation.y = c.yaw;
    c.meter.update(c.hp, c.cond, isTop && top.cond > 0, c.isHuman);
  }

  private pushOut(p: THREE.Vector3, x: number, z: number, r: number) {
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz);
    if (d < r && d > 0.0001) {
      p.x = x + (dx / d) * r;
      p.z = z + (dz / d) * r;
    }
  }

  private applySkin(c: Character) {
    const m = c.model;
    const wet = c.wet / 100;
    const col = m.baseColor.clone().lerp(new THREE.Color(0x2244aa), wet * 0.45);
    if (c.charredT > 0) col.lerp(new THREE.Color(0x222222), 0.6);
    m.bodyMat.color.copy(col);
    m.gloveMat.color.set(0xffffff).lerp(new THREE.Color(0x335599), wet * 0.4);
  }

  private setXray(c: Character, mode: "off" | "xray" | "zap") {
    const m = c.model;
    const xray = mode === "xray";
    m.skel.group.visible = xray;
    for (const s of m.skin)
      s.material = xray ? XRAY_MAT : mode === "zap" ? ZAP_MAT : m.skinMat.get(s)!;
    for (const o of m.outlines) o.visible = !xray;
    m.hat.visible = !xray && c.alive;
    for (const e of m.eyes) e.white.visible = !xray;
    m.mouth.visible = !xray;
    m.tongue.visible = !xray && !c.alive;
    for (const b of m.brows) b.visible = !xray;
    m.hair.visible = !xray && c.charredT > 0;
    for (const r of c.rods) r.mesh.visible = !xray;
    m.holder.visible = !xray;
  }

  private setFace(
    c: Character,
    f: "normal" | "angry" | "shock" | "worried" | "ko" | "cold",
    blink = 1,
  ) {
    const m = c.model;
    for (const [i, e] of m.eyes.entries()) {
      const s = i === 0 ? -1 : 1;
      e.x.visible = f === "ko";
      e.pupil.visible = f !== "ko";
      const sc = f === "shock" ? 1.6 : f === "worried" ? 1.15 : f === "cold" ? 0.9 : 1;
      e.white.scale.set(sc, sc * blink, sc);
      e.pupil.scale.setScalar(f === "shock" ? 0.45 : 1);
      const brow = m.brows[i]!;
      brow.visible = f !== "ko";
      brow.rotation.z =
        f === "angry"
          ? 0.5 * s
          : f === "worried" || f === "cold"
            ? -0.5 * s
            : f === "shock"
              ? 0
              : -0.25 * s;
      brow.position.y = f === "shock" ? 0.42 : f === "cold" ? 0.28 : 0.32;
    }
    if (f === "shock") {
      m.mouth.scale.set(0.7, 2.6, 1);
      m.mouth.rotation.z = 0;
    } else if (f === "angry") {
      m.mouth.scale.set(1.3, 1, 1);
      m.mouth.rotation.z = 0;
    } else if (f === "worried") {
      m.mouth.scale.set(1, 1, 1);
      m.mouth.rotation.z = 0.2;
    } else if (f === "cold") {
      m.mouth.scale.set(1.1, 1.6, 1);
      m.mouth.rotation.z = Math.sin(this.time * 55) * 0.1;
    } else {
      m.mouth.scale.set(1, 1, 1);
      m.mouth.rotation.z = 0;
    }
  }

  // ---------- weapons ----------

  private fire(c: Character, ghost = false) {
    const w = c.weapon;
    if (!ghost && this.net && c === this.player && w !== "soaker") {
      this.net.send("action", {
        weapon: w,
        x: c.pos.x,
        z: c.pos.z,
        yaw: c.yaw,
        aimX: c.aim.x,
        aimZ: c.aim.z,
      } satisfies NetAction);
    }
    c.cooldowns[w] = WEAPONS[w].cooldown;
    const dir = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const origin = c.pos.clone().add(new THREE.Vector3(dir.x * 0.4, 1.4, dir.z * 0.4));

    if (w === "taser") {
      c.taserT = 0;
      this.audio.zap(0.25, 0.8);
      const tip = origin.clone().addScaledVector(dir, 1.2);
      let hitAny = false;
      if (!ghost) for (const o of this.chars) {
        if (o === c || !o.alive) continue;
        const to = o.pos.clone().sub(c.pos);
        const d = to.length();
        if (d < WEAPONS.taser.range && to.normalize().dot(dir) > 0.55) {
          hitAny = true;
          this.fx.taserArc(tip, o.pos.clone().add(new THREE.Vector3(0, 1.1, 0)));
          this.shock(o, c, 4 + o.cond * 0.5, "taser");
        }
      }
      if (!hitAny) {
        this.fx.sparks(tip, 5, 0.5);
        this.fx.taserArc(
          tip,
          tip
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4)),
        );
      }
      return;
    }

    if (w === "soaker") {
      c.soakT = 0.2;
      const nozzle = new THREE.Vector3();
      c.model.soakerNozzle.getWorldPosition(nozzle);
      if (nozzle.lengthSq() === 0) nozzle.copy(origin);
      let best: Character | null = null;
      let bestD = WEAPONS.soaker.range;
      if (!ghost) for (const o of this.chars) {
        if (o === c || !o.alive) continue;
        const to = o.pos.clone().sub(c.pos).setY(0);
        const along = to.dot(dir);
        if (along < 0 || along > bestD) continue;
        const side = to.clone().sub(dir.clone().multiplyScalar(along)).length();
        if (side < 0.9) {
          best = o;
          bestD = along;
        }
      }
      const len = best ? bestD : WEAPONS.soaker.range * (0.7 + Math.random() * 0.3);
      this.fx.stream(nozzle, dir, len);
      this.audio.spray();
      if (best) {
        if (best.umbrellaOpen) {
          this.fx.drip(best.pos.clone().add(new THREE.Vector3(0, 2.4, 0)));
        } else {
          this.soak(best, 3.2, c);
          if (Math.random() < 0.15)
            this.fx.drip(best.pos.clone().add(new THREE.Vector3(0, 1.4, 0)));
        }
      }
      return;
    }

    if (w === "bucket") {
      c.swingT = 0;
      c.bucketPending = !ghost;
      this.audio.whoosh(0.5);
      if (ghost) this.fx.splash(origin.clone().addScaledVector(dir, 1.2), 24, 1.1);
      return;
    }

    if (w === "duck") {
      const at = c.pos.clone().addScaledVector(dir, 1.3);
      if (at.length() > WALK_R - 1) at.setLength(WALK_R - 1);
      if (!ghost) this.deployDuck(at, c);
      c.squash = 0.7;
      return;
    }

    // thrown things
    c.throwT = 0;
    c.model.items[w].visible = false;
    const target = c.aim.clone();
    target.y = 0;
    const flat = target.clone().sub(c.pos);
    flat.y = 0;
    const dist = Math.min(WEAPONS[w].range, Math.max(1.5, flat.length()));
    flat.normalize();
    const vy = 6 + dist * 0.33;
    const tFlight = (vy + Math.sqrt(vy * vy + 2 * -G * (origin.y - 0.5))) / -G;
    const vel = flat.multiplyScalar(dist / tFlight);
    vel.y = vy;
    const kind = w as ThrownKind;
    let obj: THREE.Object3D;
    let eelSegs: THREE.Object3D[] | undefined;
    if (kind === "balloon") {
      obj = buildBalloon(
        [0x3fa9ff, 0xff6b9d, 0x7bed9f, 0xffd32a, 0xa29bfe][Math.floor(Math.random() * 5)]!,
      );
      this.audio.whoosh(1);
    } else if (kind === "rod") {
      obj = buildRod();
      this.audio.whoosh(0.7);
      this.audio.rattle();
    } else if (kind === "cloud") {
      obj = buildMiniCloud(0.5).group;
      this.audio.whoosh(0.6);
      this.audio.rumble();
    } else if (kind === "sprinkler") {
      obj = buildSprinkler().group;
      obj.scale.setScalar(0.8);
      this.audio.whoosh(0.6);
    } else {
      const e = buildEel();
      obj = e.group;
      eelSegs = e.segs;
      this.audio.whoosh(0.5);
      this.audio.eelFlop();
    }
    obj.position.copy(origin);
    this.scene.add(obj);
    const proj: Projectile = {
      kind,
      obj,
      pos: origin.clone(),
      vel,
      owner: c,
      t: 0,
      spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
      ghost,
    };
    if (eelSegs) proj.eelSegs = eelSegs;
    this.projectiles.push(proj);
  }

  private bucketDump(c: Character) {
    const dir = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const at = c.pos
      .clone()
      .addScaledVector(dir, 1.4)
      .add(new THREE.Vector3(0, 1.2, 0));
    this.audio.bigSplash();
    this.fx.splash(at, 45, 1.4);
    this.fx.comic(
      "SPLOOSH!!",
      at.clone().add(new THREE.Vector3(0, 1, 0)),
      "#4fc3ff",
      "#1b1530",
      1.8,
    );
    let got = 0;
    for (const o of this.chars) {
      if (o === c || !o.alive) continue;
      const to = o.pos.clone().sub(c.pos);
      const d = to.length();
      if (d < 3.2 && to.normalize().dot(dir) > 0.2) {
        if (o.umbrellaOpen) {
          this.fx.comic(
            "PING!",
            o.pos.clone().add(new THREE.Vector3(0, 3, 0)),
            "#ffffff",
            "#1b1530",
            1,
          );
          this.audio.ping();
          this.soak(o, 12, c);
        } else {
          this.soak(o, 70, c);
          o.squash = 1;
          o.stun = Math.max(o.stun, 0.25);
          if (c === this.player) this.sendEffect(o, c, { kind: "stun", amount: 0.25 });
          got++;
        }
      }
    }
    if (got && !c.isHuman && Math.random() < 0.5) this.taunt(c);
    // ground gets wet too: a short-lived puddle splash for anyone walking through is overkill; just drips
    for (let i = 0; i < 6; i++)
      this.fx.drip(
        at
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 2, -0.8, (Math.random() - 0.5) * 2)),
      );
  }

  private taunt(c: Character) {
    this.fx.comic(
      TAUNTS_HIT[Math.floor(Math.random() * TAUNTS_HIT.length)]!,
      c.pos.clone().add(new THREE.Vector3(0, 2.9, 0)),
      "#ffffff",
      "#1b1530",
      0.9,
    );
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.t += dt;
      p.vel.y += G * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.obj.position.copy(p.pos);
      if (p.kind === "rod") {
        p.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.vel.clone().normalize());
        p.obj.rotateY(p.t * 10);
      } else if (p.kind === "eel") {
        p.obj.lookAt(p.pos.clone().add(p.vel));
        p.eelSegs?.forEach((s, k) => {
          s.rotation.y = Math.sin(this.time * 18 + k * 0.9) * 0.45;
        });
      } else if (p.kind === "cloud") {
        p.obj.rotation.y += dt * 2;
        p.obj.position.y += Math.sin(p.t * 20) * 0.03;
      } else if (p.kind === "balloon") {
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.z += p.spin.z * dt;
        const wob = 1 + Math.sin(p.t * 25) * 0.12;
        p.obj.scale.set(wob, 1 / wob, wob);
      } else {
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.z += p.spin.z * dt;
      }
      let hit: Character | null = null;
      for (const c of this.chars) {
        if (p.harmless || p.ghost || c === p.owner || !c.alive) continue;
        const dx = p.pos.x - c.pos.x;
        const dz = p.pos.z - c.pos.z;
        const dy = p.pos.y - c.pos.y - 1.1;
        const rr = c.umbrellaOpen ? 1.3 : 0.75;
        if (dx * dx + dz * dz < rr && dy > -1.2 && dy < (c.umbrellaOpen ? 1.8 : 1.0)) {
          hit = c;
          break;
        }
      }
      // umbrella: thrown stuff bounces off
      if (hit && hit.umbrellaOpen) {
        const topPos = hit.pos.clone().add(new THREE.Vector3(0, 2.6, 0));
        this.audio.ping();
        this.fx.comic(
          p.kind === "balloon" ? "POP!" : "PING!",
          topPos.clone().add(new THREE.Vector3(0, 0.6, 0)),
          "#ffffff",
          "#1b1530",
          1,
        );
        if (p.kind === "balloon") {
          this.fx.splash(topPos, 14, 0.7);
          this.scene.remove(p.obj);
          this.projectiles.splice(i, 1);
          continue;
        }
        p.harmless = true;
        p.owner = hit;
        p.vel.set((Math.random() - 0.5) * 5, 5 + Math.random() * 2, (Math.random() - 0.5) * 5);
        p.pos.copy(topPos);
        this.fx.sparks(topPos, 4, 0.5);
        continue;
      }
      let hitObstacle = false;
      if (!hit) {
        for (const o of this.world.obstacles) {
          const dx = p.pos.x - o.x;
          const dz = p.pos.z - o.z;
          if (dx * dx + dz * dz < o.pr * o.pr && p.pos.y < groundHeight(o.x, o.z) + o.h) {
            hitObstacle = true;
            break;
          }
        }
      }
      const ground = groundHeight(p.pos.x, p.pos.z);
      const hitGround = p.pos.y <= ground + 0.15 || p.pos.length() > SAND_R + 6;
      if (hit || hitObstacle || hitGround) {
        this.scene.remove(p.obj);
        this.projectiles.splice(i, 1);
        this.landProjectile(p, hit, hitObstacle);
      }
    }
  }

  private landProjectile(p: Projectile, hit: Character | null, hitObstacle: boolean) {
    const at = p.pos.clone();
    at.y = Math.max(at.y, groundHeight(at.x, at.z) + 0.1);
    if (p.ghost) {
      if (p.kind === "balloon") {
        this.fx.splash(at, 28, 1);
        this.fx.comic("SPLAT!", at.clone().add(new THREE.Vector3(0, 1.4, 0)), "#4fc3ff");
      } else if (p.kind === "rod") {
        this.stickRodInGround(at, p.vel);
      } else if (p.kind === "eel") {
        const e = buildEel();
        e.group.position.copy(at);
        this.scene.add(e.group);
        this.debris.push({ obj: e.group, t: 0, life: 3, flop: e.segs });
      } else {
        this.fx.smoke(at, 5);
      }
      return;
    }
    if (p.kind === "balloon") {
      this.audio.splash();
      this.fx.splash(at, 28, 1);
      this.fx.comic(
        hit ? "SPLOOSH!" : "SPLAT!",
        at.clone().add(new THREE.Vector3(0, 1.4, 0)),
        "#4fc3ff",
      );
      let got = false;
      for (const c of this.chars) {
        if (!c.alive) continue;
        const d = c.pos.distanceTo(new THREE.Vector3(at.x, c.pos.y, at.z));
        if (c === hit) {
          this.soak(c, 55, p.owner);
          got = true;
        } else if (d < 2.6 && !c.umbrellaOpen) this.soak(c, 30 * (1 - d / 2.6) + 8, p.owner);
      }
      if (hit) {
        hit.squash = 1;
        this.setFace(hit, "shock");
      }
      if (got && !p.owner.isHuman && Math.random() < 0.35) this.taunt(p.owner);
      return;
    }
    if (p.kind === "rod") {
      if (hit) {
        this.audio.clank();
        this.fx.comic("CLANK!", at.clone().add(new THREE.Vector3(0, 1.5, 0)), "#ffb347");
        this.fx.stars(hit.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), 5);
        hit.squash = 1;
        hit.stun = Math.max(hit.stun, 0.35);
        this.damage(hit, 4, p.owner, "rod");
        this.attachRod(hit, p.owner, at);
        if (p.owner === this.player) this.sendEffect(hit, p.owner, { kind: "rod", amount: 0 });
      } else {
        this.audio.plop();
        if (!hitObstacle)
          this.fx.comic(
            "THUNK",
            at.clone().add(new THREE.Vector3(0, 0.8, 0)),
            "#cfd8dc",
            "#1b1530",
            1,
          );
        this.stickRodInGround(at, p.vel);
      }
      return;
    }
    if (p.kind === "cloud") {
      this.deployCloud(hit ? hit.pos.clone() : at, p.owner);
      return;
    }
    if (p.kind === "sprinkler") {
      if (hit) {
        hit.squash = 0.8;
        this.fx.comic(
          "BONK",
          at.clone().add(new THREE.Vector3(0, 1.5, 0)),
          "#cfd8dc",
          "#1b1530",
          1,
        );
        this.audio.plop();
      }
      this.deploySprinkler(
        hit ? hit.pos.clone().addScaledVector(p.vel.clone().setY(0).normalize(), 0.8) : at,
        p.owner,
      );
      return;
    }
    // eel
    if (hit) {
      this.audio.eelSlap();
      const dmg = 6 + hit.cond * 0.55;
      this.shock(hit, p.owner, dmg, "eel");
      this.fx.comic("SLAP!", at.clone().add(new THREE.Vector3(0, 1.6, 0)), "#7bed9f");
    } else {
      this.audio.eelFlop();
    }
    const e = buildEel();
    e.group.position.copy(at);
    e.group.position.y = groundHeight(at.x, at.z) + 0.18;
    e.group.rotation.y = Math.random() * 6;
    this.scene.add(e.group);
    this.debris.push({ obj: e.group, t: 0, life: 3, flop: e.segs });
  }

  private attachRod(hit: Character, by: Character, at: THREE.Vector3) {
    if (hit.rods.length < 3) {
      const rod = buildRod();
      rod.scale.setScalar(0.75);
      const a = Math.random() * Math.PI * 2;
      const y = 0.7 + Math.random() * 0.9;
      rod.position.set(Math.cos(a) * 0.45, y, Math.sin(a) * 0.45);
      rod.rotation.set((Math.random() - 0.5) * 1.2, a, (Math.random() - 0.5) * 1.2 + 0.4);
      hit.model.rods.add(rod);
      hit.rods.push({ mesh: rod, t: 14 });
      if (hit.isHuman) this.cb.onFeed(`${by.name} stuck a lightning rod on you!`, "#ffb347");
    } else {
      this.dropRod(
        hit,
        at.clone().add(new THREE.Vector3(0, 1, 0)),
        new THREE.Vector3((Math.random() - 0.5) * 4, 4, (Math.random() - 0.5) * 4),
      );
    }
  }

  /** A rod that fell off someone: it tumbles to the ground but can't hit anyone. */
  private dropRod(owner: Character, from: THREE.Vector3, vel: THREE.Vector3) {
    const rod = buildRod();
    rod.position.copy(from);
    this.scene.add(rod);
    this.projectiles.push({
      kind: "rod",
      obj: rod,
      pos: from.clone(),
      vel,
      owner,
      t: 0,
      spin: new THREE.Vector3(),
      harmless: true,
    });
  }

  private stickRodInGround(at: THREE.Vector3, vel: THREE.Vector3) {
    const rod = buildRod();
    rod.position.copy(at);
    rod.position.y = groundHeight(at.x, at.z) + 0.25;
    rod.rotation.set(
      (Math.random() - 0.5) * 0.6 + 0.3 * Math.sign(vel.x || 1),
      Math.random() * 6,
      (Math.random() - 0.5) * 0.6,
    );
    this.scene.add(rod);
    this.debris.push({ obj: rod, t: 0, life: 8 });
  }

  private updateDebris(dt: number) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!;
      d.t += dt;
      if (d.vel) {
        d.vel.y += G * dt;
        d.obj.position.addScaledVector(d.vel, dt);
        const g = groundHeight(d.obj.position.x, d.obj.position.z) + 0.15;
        if (d.obj.position.y < g && d.vel.y < 0) {
          d.obj.position.y = g;
          d.vel.y *= -0.4;
          d.vel.x *= 0.6;
          d.vel.z *= 0.6;
          if (d.spin) d.spin.multiplyScalar(0.5);
        }
        if (d.spin) {
          d.obj.rotation.x += d.spin.x * dt;
          d.obj.rotation.z += d.spin.z * dt;
        }
      } else if (d.flop) {
        d.obj.position.y =
          0.18 + Math.abs(Math.sin(d.t * 9)) * 0.25 * Math.max(0, 1 - d.t / d.life);
        d.flop.forEach((s, k) => (s.rotation.y = Math.sin(d.t * 14 + k) * 0.6));
        if (Math.random() < dt * 3 && d.t < 2) this.audio.eelFlop();
      } else if (d.t > 0.3) {
        d.obj.rotation.z = Math.sin(d.t * 15) * 0.12 * Math.max(0, 1 - d.t / 2);
      }
      if (d.t > d.life - 0.5) d.obj.scale.setScalar(Math.max(0.01, (d.life - d.t) / 0.5));
      if (d.t >= d.life) {
        this.scene.remove(d.obj);
        this.debris.splice(i, 1);
      }
    }
  }

  // ---------- deployables ----------

  private broadcastDeploy(kind: NetDeploy["kind"], at: THREE.Vector3, owner: Character) {
    if (!this.net || owner !== this.player) return;
    this.net.send("deploy", { kind, x: at.x, y: at.y, z: at.z } satisfies NetDeploy);
  }

  private deployDuck(at: THREE.Vector3, owner: Character) {
    this.broadcastDeploy("duck", at, owner);
    const obj = buildDuck(true);
    obj.position.copy(at);
    obj.position.y = groundHeight(at.x, at.z);
    obj.rotation.y = owner.yaw + Math.PI;
    const meter = new Meter("Decoy Duck", "#ffd93b");
    meter.sprite.position.y = 1.75;
    meter.sprite.scale.set(1.7, 0.75, 1);
    obj.add(meter.sprite);
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.75, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9 }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.04;
    marker.visible = false;
    obj.add(marker);
    this.scene.add(obj);
    this.deploys.push({
      kind: "duck",
      obj,
      pos: obj.position.clone(),
      t: 0,
      life: 20,
      owner,
      meter,
      marker,
    });
    this.audio.quack();
    this.fx.comic(
      "QUACK!",
      at.clone().add(new THREE.Vector3(0, 1.6, 0)),
      "#ffd93b",
      "#1b1530",
      1.1,
    );
    if (owner.isHuman)
      this.cb.onFeed(
        "🦆 Decoy placed: it conducts 70%, so the storm may go for it instead.",
        "#ffd93b",
      );
  }

  private deploySprinkler(at: THREE.Vector3, owner: Character) {
    this.broadcastDeploy("sprinkler", at, owner);
    const s = buildSprinkler();
    s.group.position.copy(at);
    s.group.position.y = groundHeight(at.x, at.z);
    s.group.rotation.y = Math.random() * 6;
    this.scene.add(s.group);
    this.deploys.push({
      kind: "sprinkler",
      obj: s.group,
      pos: s.group.position.clone(),
      t: 0,
      life: 7,
      owner,
      arm: s.arm,
    });
    this.audio.plop();
    this.fx.comic(
      "TIK-TIK-TIK",
      at.clone().add(new THREE.Vector3(0, 1.2, 0)),
      "#7bed9f",
      "#1b1530",
      0.9,
    );
  }

  private deployCloud(at: THREE.Vector3, owner: Character) {
    this.broadcastDeploy("cloud", at, owner);
    const face = buildMiniCloud(0.95);
    face.group.position.copy(at);
    face.group.position.y = at.y + 0.5;
    this.scene.add(face.group);
    this.deploys.push({
      kind: "cloud",
      obj: face.group,
      pos: new THREE.Vector3(at.x, 0, at.z),
      t: 0,
      life: 2.3,
      owner,
      face,
    });
    this.audio.rumble();
    this.fx.comic(
      "grumble...",
      at.clone().add(new THREE.Vector3(0, 1.5, 0)),
      "#9b9bc4",
      "#1b1530",
      0.9,
    );
  }

  private updateDeploys(dt: number, top: Conductor | null) {
    for (let i = this.deploys.length - 1; i >= 0; i--) {
      const d = this.deploys[i]!;
      d.t += dt;
      const T = this.time;
      if (d.kind === "duck") {
        d.obj.position.y =
          groundHeight(d.pos.x, d.pos.z) + Math.abs(Math.sin(T * 5)) * 0.06 * (d.t < 1 ? 3 : 1);
        d.obj.rotation.z = Math.sin(T * 5) * 0.06;
        const isTop = !!top && top.deploy === d;
        if (d.marker) {
          d.marker.visible = this.stormCountdown && isTop;
          d.marker.rotation.z += dt * 3;
        }
        d.meter?.update(100, DUCK_COND, isTop, false);
        if (d.t > d.life - 0.5) d.obj.scale.setScalar(Math.max(0.01, (d.life - d.t) / 0.5));
        if (d.t >= d.life) this.removeDeploy(i, true);
        continue;
      }
      if (d.kind === "sprinkler") {
        if (d.arm) d.arm.rotation.y += dt * 7;
        if (Math.random() < dt * 40) {
          const a = (d.arm?.rotation.y ?? 0) + (Math.random() < 0.5 ? 0 : Math.PI);
          this.fx.spawnDrop(
            d.pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.4, 0.7, -Math.sin(a) * 0.4)),
            new THREE.Vector3(Math.cos(a) * 4.5, 3.5 + Math.random() * 2, -Math.sin(a) * 4.5),
          );
        }
        for (const c of this.chars) {
          if (!c.alive || c.umbrellaOpen) continue;
          const dist = c.pos.distanceTo(d.pos);
          if (dist < 3.4) this.soak(c, dt * 15, d.owner);
        }
        if (Math.random() < dt * 2 && d.pos.distanceTo(this.player.pos) < 14) this.audio.drip();
        if (d.t > d.life - 0.5) d.obj.scale.setScalar(Math.max(0.01, (d.life - d.t) / 0.5) * 0.8);
        if (d.t >= d.life) this.removeDeploy(i, false);
        continue;
      }
      // pocket storm cloud: rises, grumbles, then zaps the best conductor nearby
      const rise = Math.min(1, d.t / 0.5);
      d.obj.position.y =
        THREE.MathUtils.lerp(groundHeight(d.pos.x, d.pos.z) + 0.5, 4.2, 1 - Math.pow(1 - rise, 2)) +
        Math.sin(T * 3) * 0.1;
      d.obj.rotation.y = Math.sin(T * 2) * 0.2;
      const grow = 1 + Math.min(1, d.t / d.life) * 0.5;
      d.obj.scale.setScalar(0.95 * grow);
      if (d.face) {
        const bolt = d.face.group.getObjectByName("bolt");
        if (bolt) bolt.visible = Math.random() < 0.3 + d.t / d.life;
        d.face.brows.forEach(
          (b, j) => (b.rotation.z = (j ? 1 : -1) * (0.55 + Math.sin(T * 8) * 0.15)),
        );
      }
      if (Math.random() < dt * 6) this.fx.sparks(d.obj.position, 2, 0.4);
      if (d.t >= d.life) {
        let target: Character | null = null;
        for (const c of this.chars) {
          if (!c.alive) continue;
          if (c.pos.distanceTo(d.pos) > 4.6) continue;
          if (!target || c.cond > target.cond || (c.cond === target.cond && Math.random() < 0.5))
            target = c;
        }
        const from = d.obj.position.clone().add(new THREE.Vector3(0, -0.4, 0));
        if (target) {
          this.fx.lightning(target.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), from.y, from);
          this.fx.shake = Math.min(this.fx.shake, 0.5);
          this.audio.zap(0.5, 1.2);
          this.fx.comic(
            "ZAP!",
            target.pos.clone().add(new THREE.Vector3(0, 3.2, 0)),
            "#fff176",
            "#1b1530",
            1.6,
          );
          this.shock(target, d.owner, 10 + target.cond * 0.55, "cloud");
        } else {
          this.fx.lightning(d.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), from.y, from);
          this.fx.shake = Math.min(this.fx.shake, 0.3);
          this.audio.zap(0.3, 0.6);
          this.fx.comic(
            "fizz",
            d.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
            "#9b9bc4",
            "#1b1530",
            0.8,
          );
        }
        this.fx.flash = Math.min(this.fx.flash, 0.35);
        this.fx.smoke(d.obj.position, 10);
        this.removeDeploy(i, false);
      }
    }
  }

  private removeDeploy(i: number, pop: boolean) {
    const d = this.deploys[i]!;
    this.scene.remove(d.obj);
    d.meter?.dispose();
    this.deploys.splice(i, 1);
    if (pop) this.audio.pop();
  }

  // ---------- damage ----------

  private soak(c: Character, amount: number, by: Character) {
    const before = c.wet;
    c.wet = Math.min(100, c.wet + amount);
    if (before < 60 && c.wet >= 60 && c.isHuman)
      this.cb.onFeed("You're soaked! Press R to shake it off!", "#4fc3ff");
    if (c.isHuman && by !== c && amount > 20) this.audio.hurt(1.1);
    if (by === this.player) this.sendEffect(c, by, { kind: "soak", amount });
  }

  private shock(
    target: Character,
    by: Character,
    dmg: number,
    how: "taser" | "eel" | "storm" | "cloud",
  ) {
    const up = target.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const big = how === "storm" || how === "cloud";
    this.fx.sparks(up, big ? 40 : 16, big ? 1.5 : 1);
    target.zapT = 0;
    target.zapDur = how === "storm" ? 1.4 : how === "cloud" ? 1.0 : 0.6;
    target.zapBig = big;
    target.rattled = false;
    target.stun = Math.max(target.stun, how === "storm" ? 1.4 : big ? 1.0 : 0.5);
    if (!big) {
      this.fx.comic(
        target.cond > 50 ? "BZZZZT!" : "bzzt",
        up.clone().add(new THREE.Vector3(0, 1.3, 0)),
        "#fff04d",
        "#1b1530",
        target.cond > 50 ? 1.8 : 1,
      );
      if (dmg < 8) this.audio.fizzle();
      else this.audio.zap(0.35, Math.min(1.5, 0.6 + dmg / 30));
    }
    if (this.net && target.remote && (by === this.player || (how === "storm" && this.net.isCoordinator()))) {
      this.sendEffect(target, by, { kind: "shock", amount: dmg, how });
    }
    this.damage(target, dmg, by, how, false);
  }

  private damage(target: Character, dmg: number, by: Character, how: string, notify = true) {
    if (!target.alive) return;
    target.hp -= dmg;
    target.squash = Math.max(target.squash, 0.8);
    if (target.isHuman) this.fx.shake = Math.max(this.fx.shake, Math.min(1, dmg / 40));
    if (dmg > 0) this.audio.hurt(target.isHuman ? 1 : 0.8 + (target.id % 4) * 0.12);
    if (notify && by === this.player) this.sendEffect(target, by, { kind: "damage", amount: dmg, how });
    if (target.hp <= 0) {
      if (target.remote && this.net) target.hp = 0;
      else this.ko(target, by, how);
    }
  }

  private ko(target: Character, by: Character, how: string) {
    target.hp = 0;
    target.alive = false;
    target.deaths++;
    target.respawnT = 3.2;
    target.shaking = false;
    target.umbrellaOpen = false;
    target.zapT = -1;
    target.swingT = -1;
    target.throwT = -1;
    const m = target.model;
    this.setXray(target, "off");
    m.spikes.visible = false;
    m.skel.group.position.set(0, 0, 0);
    this.setFace(target, "ko");
    m.puddle.visible = false;
    m.marker.visible = false;
    m.sweat.visible = false;
    m.koStars.visible = true;
    m.tongue.visible = true;
    // the hat flies off
    m.hat.visible = false;
    const flyHat = buildHat(m.hatKind, m.hatColor).hat;
    const headPos = new THREE.Vector3();
    m.head.getWorldPosition(headPos);
    flyHat.position.copy(headPos).add(new THREE.Vector3(0, 0.4, 0));
    this.scene.add(flyHat);
    this.debris.push({
      obj: flyHat,
      t: 0,
      life: 3.2,
      vel: new THREE.Vector3((Math.random() - 0.5) * 4, 7, (Math.random() - 0.5) * 4),
      spin: new THREE.Vector3(Math.random() * 10 - 5, 0, Math.random() * 10 - 5),
    });
    this.audio.ko();
    this.fx.comic(
      "K.O.!",
      target.pos.clone().add(new THREE.Vector3(0, 2.8, 0)),
      "#ff5f6d",
      "#1b1530",
      2.2,
    );
    this.fx.stars(target.pos.clone().add(new THREE.Vector3(0, 2, 0)), 7);
    if (by !== target && how !== "network") by.kos++;
    if (this.net && target === this.player && by.remote && by.netId) {
      this.net.send("ko", { byId: by.netId });
    }
    const verb =
      how === "network"
        ? "was knocked out"
        : how === "storm"
        ? "got fried by the storm"
        : how === "cloud"
          ? `got zapped by ${by.name}'s pocket storm`
          : how === "taser"
            ? `got tased by ${by.name}`
            : how === "eel"
              ? `got eel-slapped by ${by.name}`
              : `got clonked by ${by.name}`;
    this.cb.onFeed(`💀 ${target.name} ${verb}!`, target.isHuman ? "#ff5f6d" : "#fff");
  }

  private respawn(c: Character) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * 13, 0, Math.sin(a) * 13);
      const d = Math.min(
        ...this.chars.filter((o) => o !== c && o.alive).map((o) => o.pos.distanceTo(p)),
        99,
      );
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    this.spawnAt(c, best, 8);
    c.spawnT = 0.45;
    this.audio.pop();
    this.fx.smoke(c.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 6);
    this.fx.comic(
      "I'M BACK!",
      c.pos.clone().add(new THREE.Vector3(0, 2.8, 0)),
      "#ffffff",
      "#1b1530",
      1.2,
    );
  }

  // ---------- storm ----------

  topConductor(): Conductor | null {
    let best: Conductor | null = null;
    for (const c of this.chars) {
      if (!c.alive) continue;
      if (!best || c.cond > best.cond)
        best = { name: c.name, cond: c.cond, pos: c.pos, char: c, deploy: null };
    }
    for (const d of this.deploys) {
      if (d.kind !== "duck") continue;
      if (!best || DUCK_COND > best.cond)
        best = {
          name: `${possessive(d.owner)} duck`,
          cond: DUCK_COND,
          pos: d.pos,
          char: null,
          deploy: d,
        };
    }
    return best;
  }

  private updateStorm(dt: number, top: Conductor | null) {
    const cloud = this.stormCloud;
    if (this.phase === "playing") {
      const prev = this.stormIn;
      this.stormIn -= dt;
      const controlsStorm = !this.net || this.net.isCoordinator();
      if (!controlsStorm) {
        this.stormIn = Math.max(0, this.stormIn);
      } else {
        if (!this.stormCountdown && this.stormIn <= 5) {
          this.stormCountdown = true;
          this.audio.setTense(true);
          this.audio.siren();
          this.audio.rumble();
          this.cb.onFeed("⛈️ STORM INCOMING! Highest conductance gets zapped!", "#ffe14d");
          cloud.group.visible = true;
          cloud.group.position.set(top ? top.pos.x : 0, 42, top ? top.pos.z - 3.5 : 0);
          if (this.net) {
            this.net.send("storm", {
              phase: "countdown",
              targetId: top?.char?.netId ?? null,
              at: top ? [top.pos.x, top.pos.y, top.pos.z] : [0, 0, 0],
              maxCond: top?.cond ?? 0,
              nextIn: 5,
            } satisfies NetStorm);
          }
        }
        if (this.stormCountdown && Math.ceil(prev) !== Math.ceil(this.stormIn) && this.stormIn > 0)
          this.audio.tick(this.stormIn < 2);
        if (this.stormIn <= 0) {
          const nextIn = 16 + Math.random() * 10;
          this.strike(null, nextIn);
          this.stormCountdown = false;
          this.stormIn = nextIn;
          this.audio.setTense(false);
        }
      }
    }
    const wantMix = this.stormCountdown ? 1 : 0;
    this.stormMix = THREE.MathUtils.damp(this.stormMix, wantMix, this.stormCountdown ? 2 : 1.2, dt);
    (this.scene.background as THREE.Color).copy(this.skyDay).lerp(this.skyStorm, this.stormMix);
    (this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color);
    this.sun.intensity = 2.2 - this.stormMix * 1.3;
    this.hemi.intensity = 0.9 - this.stormMix * 0.4;
    this.world.cloudMat.color.set(0xffffff).lerp(new THREE.Color(0x4a4a66), this.stormMix);
    this.flashLight.intensity = this.fx.flash * 400;

    // the angry cloud swoops in over its victim and glares down
    if (cloud.group.visible) {
      const T = this.time;
      if (this.stormCountdown && top) {
        // hover behind (screen-up from) the victim so it glares down without hiding them
        this.stormCloudGoal.set(top.pos.x, 5.5, top.pos.z - 3.5);
      } else {
        this.stormCloudGoal.y = 42;
      }
      cloud.group.position.lerp(this.stormCloudGoal, 1 - Math.exp(-dt * 2.2));
      cloud.group.position.x += Math.sin(T * 1.7) * 0.02;
      const s = 2.0 + Math.sin(T * 6) * 0.06 * this.stormMix;
      cloud.group.scale.setScalar(s);
      if (top) {
        // glare at a point above the victim so the face stays mostly upright and visible
        const look = top.pos.clone().add(new THREE.Vector3(0, 9, 8));
        // Matrix4.lookAt(target, eye) is what Object3D.lookAt uses for non-cameras: +z faces the target
        const q = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(look, cloud.group.position, new THREE.Vector3(0, 1, 0)),
        );
        cloud.group.quaternion.slerp(q, 1 - Math.exp(-dt * 3));
      }
      cloud.brows.forEach(
        (b, j) => (b.rotation.z = (j ? 1 : -1) * (0.55 + Math.sin(T * 7) * 0.12)),
      );
      cloud.pupils.forEach((p) => p.position.set(Math.sin(T * 3) * 0.02, -0.03, 0.09));
      this.stormMouthT = Math.max(0, this.stormMouthT - dt);
      cloud.mouth.scale.set(1, 1 + this.stormMouthT * 3, 1);
      cloud.mouth.rotation.z = this.stormMouthT > 0 ? Math.PI : 0;
      if (this.stormCountdown && Math.random() < dt * 3) {
        this.fx.sparks(
          cloud.group.position
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 4, -1, (Math.random() - 0.5) * 2)),
          3,
          0.6,
        );
      }
      if (!this.stormCountdown && cloud.group.position.y > 38) cloud.group.visible = false;
    }
  }

  strike(forced: NetStorm | null = null, nextIn = 16 + Math.random() * 10) {
    const forcedTarget = forced ? this.networkCharacter(forced.targetId) : null;
    const forcedPosition = forced ? new THREE.Vector3(...forced.at) : new THREE.Vector3();
    const forcedDeploy = forced && !forcedTarget
      ? this.deploys
          .filter((d) => d.kind === "duck")
          .sort((a, b) => a.pos.distanceTo(forcedPosition) - b.pos.distanceTo(forcedPosition))[0] ?? null
      : null;
    const top: Conductor | null = forced
      ? {
          name: forcedTarget?.name ?? "decoy",
          cond: forced.maxCond,
          pos: forcedTarget?.pos ?? forcedPosition,
          char: forcedTarget,
          deploy: forcedDeploy,
        }
      : this.topConductor();
    if (!top) return;
    const maxCond = top.cond;
    // ties among characters are random
    let target: Character | null = top.char;
    if (!forced && target) {
      const ties = this.chars.filter((c) => c.alive && c.cond === maxCond);
      target = ties[Math.floor(Math.random() * ties.length)]!;
    }
    const cloudFrom = this.stormCloud.group.visible
      ? this.stormCloud.group.position.clone().add(new THREE.Vector3(0, -1, 0))
      : undefined;
    this.stormMouthT = 0.6;
    const at = (target ? target.pos : top.pos).clone().add(new THREE.Vector3(0, 1.5, 0));
    if (!forced && this.net) {
      this.net.send("storm", {
        phase: "strike",
        targetId: target?.netId ?? null,
        at: [at.x, at.y, at.z],
        maxCond,
        nextIn,
      } satisfies NetStorm);
    }
    this.fx.lightning(at, 34, cloudFrom);
    this.audio.thunder(target?.isHuman ? 0 : at.distanceTo(this.player.pos));
    this.fx.comic(
      "KA-BOOM!",
      at.clone().add(new THREE.Vector3(0, 2, 0)),
      "#ffffff",
      "#1b1530",
      2.6,
    );
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 20;
      this.fx.lightning(new THREE.Vector3(Math.cos(a) * r, -0.5, Math.sin(a) * r), 36);
    }

    if (!target && top.deploy) {
      // the decoy duck takes the hit and explodes into feathers
      const d = top.deploy;
      this.fx.feathers(at);
      this.audio.quack();
      this.fx.comic(
        "QUACK?!",
        at.clone().add(new THREE.Vector3(0, 1, 0)),
        "#ffd93b",
        "#1b1530",
        1.5,
      );
      this.cb.onFeed(
        `⚡ The storm took the bait: ${possessive(d.owner)} decoy duck is toast!`,
        "#ffd93b",
      );
      const idx = this.deploys.indexOf(d);
      if (idx >= 0) this.removeDeploy(idx, false);
      this.chainFrom(at, d.owner, null);
      return;
    }
    if (!target) return;

    const dmg = maxCond === 0 ? 12 : 22 + maxCond * 0.8;
    this.cb.onFeed(
      maxCond === 0
        ? `⚡ Everyone was dry, so the storm picked ${target.name} at random!`
        : `⚡ Lightning struck ${target.name} (${maxCond}% conductance) for ${Math.round(dmg)}!`,
      "#ffe14d",
    );
    target.charredT = 7;
    target.model.hair.visible = true;
    this.fx.smoke(at, 14);
    this.shock(target, target, dmg, "storm");
    target.wet = Math.max(0, target.wet - 60); // steam-dried
    this.chainFrom(at, target, target);
  }

  private chainFrom(at: THREE.Vector3, by: Character, except: Character | null) {
    for (const o of this.chars) {
      if (o === except || !o.alive) continue;
      const d = o.pos.distanceTo(at);
      if (d < 3.5 && o.cond > 0) {
        this.fx.taserArc(at, o.pos.clone().add(new THREE.Vector3(0, 1.2, 0)));
        this.shock(o, by, 6 + o.cond * 0.35, "eel");
        this.cb.onFeed(`⚡ ...and it chained to ${o.name}!`, "#9be7ff");
      }
    }
  }

  // ---------- world & camera ----------

  private updateWorld(dt: number) {
    const geo = this.world.ocean.geometry;
    const pos = geo.attributes["position"] as THREE.BufferAttribute;
    const base = this.world.oceanBase;
    const t = this.time;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!;
      const z = base[i * 3 + 2]!;
      pos.setY(
        i,
        base[i * 3 + 1]! + Math.sin(x * 0.25 + t * 1.3) * 0.25 + Math.cos(z * 0.3 + t * 0.9) * 0.25,
      );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const foam = this.world.group.getObjectByName("foam");
    if (foam) foam.scale.setScalar(1 + Math.sin(t * 1.5) * 0.015);
    for (const c of this.world.clouds) {
      c.position.x += (c.userData["speed"] as number) * dt * (1 + this.stormMix * 3);
      if (c.position.x > 60) c.position.x = -60;
    }
    const duck = this.world.fountainDuck;
    duck.position.y = 0.3 + Math.sin(t * 2.2) * 0.05;
    duck.rotation.z = Math.sin(t * 1.7) * 0.12;
    duck.rotation.y += dt * 0.3;
    for (const [i, s] of this.world.signs.entries()) {
      s.rotation.y =
        (s.userData["baseRot"] as number) + Math.sin(t * 1.3 + i) * 0.04 * (1 + this.stormMix * 4);
    }
    const sp = this.world.fountainSpout;
    if (Math.random() < dt * 25) {
      this.fx.drip(
        sp
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2)),
      );
    }
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const lookAhead = this.aimPoint.clone().sub(p.pos).multiplyScalar(0.18);
    lookAhead.clampLength(0, 3);
    this.camTarget.lerp(p.pos.clone().add(lookAhead), 1 - Math.exp(-dt * 5));
    const s = this.fx.shake;
    this.camShake.set(
      (Math.random() - 0.5) * s * 0.8,
      (Math.random() - 0.5) * s * 0.5,
      (Math.random() - 0.5) * s * 0.8,
    );
    const offset = new THREE.Vector3(0, 17, 13.5);
    this.camera.position.copy(this.camTarget).add(offset).add(this.camShake);
    this.camera.lookAt(this.camTarget.clone().add(new THREE.Vector3(0, 1, 0)));
    this.sun.target.position.copy(p.pos);
    this.sun.position.copy(p.pos).add(new THREE.Vector3(18, 30, 12));
  }
}

function possessive(c: Character) {
  return c.isHuman ? "your" : `${c.name}'s`;
}

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
