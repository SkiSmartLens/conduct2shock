import * as THREE from "three";
import { flat } from "./models";

// ---------- canvas text sprites ----------

const spriteCache = new Map<string, THREE.Texture>();

function textTexture(text: string, fill: string, stroke: string, px: number) {
  const key = `${text}|${fill}|${stroke}|${px}`;
  let tex = spriteCache.get(key);
  if (tex) return tex;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `900 ${px}px "Arial Black", Impact, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width + px * 0.8);
  canvas.width = w;
  canvas.height = Math.ceil(px * 1.5);
  ctx.font = `900 ${px}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = px * 0.22;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, w / 2, canvas.height / 2);
  ctx.fillStyle = fill;
  ctx.fillText(text, w / 2, canvas.height / 2);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  spriteCache.set(key, tex);
  return tex;
}

interface ComicWord {
  sprite: THREE.Sprite;
  t: number;
  life: number;
  vy: number;
  base: number;
  rot: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  t: number;
  life: number;
  gravity: number;
  scale: number;
  grow: number;
  bounce: boolean;
}

interface Bolt {
  group: THREE.Group;
  t: number;
  life: number;
}

const DROP_GEO = flat(new THREE.IcosahedronGeometry(0.11, 0));
const SPARK_GEO = new THREE.BoxGeometry(0.1, 0.1, 0.3);
const PUFF_GEO = flat(new THREE.IcosahedronGeometry(0.3, 0));
const BOLT_GEO = new THREE.CylinderGeometry(1, 1, 1, 5);
const DROP_MAT = new THREE.MeshBasicMaterial({ color: 0x4fc3ff });
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xfff176 });
const SPARK_MAT2 = new THREE.MeshBasicMaterial({ color: 0x8be9fd });
const PUFF_MAT = new THREE.MeshBasicMaterial({ color: 0x555566, transparent: true, opacity: 0.8 });
const STAR_MAT = new THREE.MeshBasicMaterial({ color: 0xffe14d });
const FEATHER_GEO = new THREE.PlaneGeometry(0.16, 0.3);
const FEATHER_MAT = new THREE.MeshBasicMaterial({ color: 0xffd93b, side: THREE.DoubleSide });
const FEATHER_MAT2 = new THREE.MeshBasicMaterial({ color: 0xfff3b0, side: THREE.DoubleSide });
const BOLT_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const BOLT_GLOW = new THREE.MeshBasicMaterial({
  color: 0x9be7ff,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});
const STAR_GEO = (() => {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.08 : 0.2;
    const a = (i / 10) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(shape);
})();

export class FX {
  scene: THREE.Scene;
  words: ComicWord[] = [];
  particles: Particle[] = [];
  bolts: Bolt[] = [];
  shake = 0;
  flash = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  comic(text: string, pos: THREE.Vector3, color = "#fff04d", stroke = "#1b1530", size = 1.35) {
    const tex = textTexture(text, color, stroke, 96);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const s = new THREE.Sprite(mat);
    const img = tex.image as HTMLCanvasElement;
    s.scale.set((img.width / img.height) * size, size, 1);
    s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, 0));
    s.renderOrder = 50;
    const rot = (Math.random() - 0.5) * 0.5;
    mat.rotation = rot;
    this.scene.add(s);
    this.words.push({ sprite: s, t: 0, life: 1.1, vy: 1.4, base: size, rot });
  }

  private spawn(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life: number,
    gravity: number,
    scale = 1,
    grow = 0,
    bounce = false,
  ) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.scale.setScalar(scale);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel, t: 0, life, gravity, scale, grow, bounce });
    if (this.particles.length > 600) {
      const p = this.particles.shift()!;
      this.scene.remove(p.mesh);
    }
  }

  splash(pos: THREE.Vector3, n = 26, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3.5) * power;
      this.spawn(
        DROP_GEO,
        DROP_MAT,
        pos,
        new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4 * power, Math.sin(a) * sp),
        0.7 + Math.random() * 0.5,
        -16,
        0.7 + Math.random() * 0.8,
        0,
        true,
      );
    }
  }

  drip(pos: THREE.Vector3) {
    this.spawn(
      DROP_GEO,
      DROP_MAT,
      pos,
      new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.5, (Math.random() - 0.5) * 1.5),
      0.6,
      -14,
      0.6,
      0,
      true,
    );
  }

  sparks(pos: THREE.Vector3, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.8,
        Math.random() - 0.5,
      ).normalize();
      this.spawn(
        SPARK_GEO,
        Math.random() > 0.4 ? SPARK_MAT : SPARK_MAT2,
        pos,
        dir.multiplyScalar((4 + Math.random() * 6) * power),
        0.25 + Math.random() * 0.3,
        -10,
        0.7 + Math.random() * 0.8,
      );
    }
  }

  stars(pos: THREE.Vector3, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(
        STAR_GEO,
        STAR_MAT,
        pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5)),
        new THREE.Vector3(Math.cos(a) * 1.2, 1.5, Math.sin(a) * 1.2),
        0.9,
        -3,
        1.2,
      );
    }
  }

  smoke(pos: THREE.Vector3, n = 8) {
    for (let i = 0; i < n; i++) {
      this.spawn(
        PUFF_GEO,
        PUFF_MAT,
        pos
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)),
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          1.2 + Math.random(),
          (Math.random() - 0.5) * 0.8,
        ),
        1 + Math.random() * 0.8,
        0,
        0.4 + Math.random() * 0.5,
        1.2,
      );
    }
  }

  /** One droplet with a given velocity (sprinklers, hoses). */
  spawnDrop(pos: THREE.Vector3, vel: THREE.Vector3) {
    this.spawn(DROP_GEO, DROP_MAT, pos, vel, 0.9, -14, 0.7, 0, true);
  }

  /** A squirt of water along a line (the super soaker). */
  stream(from: THREE.Vector3, dir: THREE.Vector3, len: number) {
    const n = 3 + Math.floor(len / 2);
    for (let i = 0; i < n; i++) {
      const d = (i / n) * len + Math.random() * 0.5;
      const p = from.clone().addScaledVector(dir, d);
      p.y -= d * d * 0.012;
      this.spawn(
        DROP_GEO,
        DROP_MAT,
        p,
        dir
          .clone()
          .multiplyScalar(9)
          .add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.5, (Math.random() - 0.5) * 1.5)),
        0.18 + Math.random() * 0.15,
        -12,
        0.5 + Math.random() * 0.4,
        0,
        true,
      );
    }
  }

  /** A burst of yellow feathers (the decoy duck's final moments). */
  feathers(pos: THREE.Vector3, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this.spawn(
        FEATHER_GEO,
        Math.random() < 0.7 ? FEATHER_MAT : FEATHER_MAT2,
        pos,
        new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp),
        1.4 + Math.random(),
        -2.5,
        0.8 + Math.random() * 0.6,
      );
    }
  }

  /** A jagged bolt from `from` (or a random spot `top` units up) down to `target`. */
  lightning(target: THREE.Vector3, top = 34, from?: THREE.Vector3) {
    const group = new THREE.Group();
    const start =
      from?.clone() ??
      new THREE.Vector3(
        target.x + (Math.random() - 0.5) * 6,
        top,
        target.z + (Math.random() - 0.5) * 6,
      );
    // short bolts (from a low cloud) get smaller zig-zags and forks
    const k = THREE.MathUtils.clamp((start.y - target.y) / 30, 0.2, 1);
    const buildBranch = (from: THREE.Vector3, to: THREE.Vector3, width: number, depth: number) => {
      const segs = 7 + Math.floor(Math.random() * 4);
      let prev = from.clone();
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const p = from.clone().lerp(to, t);
        if (i < segs) {
          p.x += (Math.random() - 0.5) * 2.4 * width * 2 * k;
          p.z += (Math.random() - 0.5) * 2.4 * width * 2 * k;
        }
        this.boltSegment(group, prev, p, width);
        if (depth > 0 && Math.random() < 0.45 && i < segs - 1) {
          const end = p
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 8 * k,
                (-3 - Math.random() * 5) * k,
                (Math.random() - 0.5) * 8 * k,
              ),
            );
          buildBranch(p, end, width * 0.5, depth - 1);
        }
        prev = p;
      }
    };
    buildBranch(start, target, 0.22, 2);
    this.scene.add(group);
    this.bolts.push({ group, t: 0, life: 0.45 });
    this.shake = Math.max(this.shake, 1);
    this.flash = 1;
  }

  taserArc(from: THREE.Vector3, to: THREE.Vector3) {
    const group = new THREE.Group();
    let prev = from.clone();
    const segs = 6;
    for (let i = 1; i <= segs; i++) {
      const p = from.clone().lerp(to, i / segs);
      if (i < segs)
        p.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
          ),
        );
      this.boltSegment(group, prev, p, 0.05);
      prev = p;
    }
    this.scene.add(group);
    this.bolts.push({ group, t: 0, life: 0.12 });
  }

  private boltSegment(group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, width: number) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    for (const [mat, w] of [
      [BOLT_MAT, width],
      [BOLT_GLOW, width * 3],
    ] as const) {
      const m = new THREE.Mesh(BOLT_GEO, mat);
      m.position.copy(mid);
      m.quaternion.copy(q);
      m.scale.set(w, len, w);
      m.userData["w"] = w;
      group.add(m);
    }
  }

  update(dt: number) {
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i]!;
      w.t += dt;
      const k = w.t / w.life;
      const pop = k < 0.15 ? 0.3 + (k / 0.15) * 0.9 : k < 0.3 ? 1.2 - ((k - 0.15) / 0.15) * 0.2 : 1;
      const img = (w.sprite.material.map as THREE.Texture).image as HTMLCanvasElement;
      w.sprite.scale.set((img.width / img.height) * w.base * pop, w.base * pop, 1);
      w.sprite.position.y += w.vy * dt;
      w.sprite.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      w.sprite.material.rotation = w.rot + Math.sin(w.t * 12) * 0.05;
      if (w.t >= w.life) {
        this.scene.remove(w.sprite);
        w.sprite.material.dispose();
        this.words.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.t += dt;
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.bounce && p.mesh.position.y < 0.05 && p.vel.y < 0) {
        p.mesh.position.y = 0.05;
        p.vel.y *= -0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.z += dt * 3;
      const k = p.t / p.life;
      p.mesh.scale.setScalar(p.scale * (1 + p.grow * k) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1));
      if (p.t >= p.life) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.t += dt;
      b.group.visible = Math.random() > 0.2;
      // thin each segment in place (scaling the group would slide it around the world origin)
      const k = 1 - b.t / b.life;
      for (const m of b.group.children) {
        const w = (m.userData["w"] as number) * (0.5 + k);
        m.scale.x = w;
        m.scale.z = w;
      }
      if (b.t >= b.life) {
        this.scene.remove(b.group);
        this.bolts.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 4);
  }

  dispose() {
    for (const w of this.words) this.scene.remove(w.sprite);
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const b of this.bolts) this.scene.remove(b.group);
    this.words = [];
    this.particles = [];
    this.bolts = [];
  }
}

// ---------- overhead meter ----------

export class Meter {
  sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private last = "";

  constructor(
    public name: string,
    public color: string,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 256;
    this.canvas.height = 112;
    this.ctx = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(2.3, 1.0, 1);
    this.sprite.renderOrder = 40;
    this.sprite.center.set(0.5, 0);
  }

  update(hp: number, cond: number, isTop: boolean, isYou: boolean) {
    const key = `${Math.round(hp)}|${Math.round(cond)}|${isTop}|${isYou}`;
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    const W = this.canvas.width;
    c.clearRect(0, 0, W, this.canvas.height);
    // name
    c.font = '900 30px "Arial Black", Impact, sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 7;
    c.lineJoin = "round";
    c.strokeStyle = "#1b1530";
    const label = (isYou ? "★ " : "") + this.name + (isTop ? " ⚡" : "");
    c.strokeText(label, W / 2, 22);
    c.fillStyle = isTop ? "#ffe14d" : this.color;
    c.fillText(label, W / 2, 22);
    // hp bar
    const bar = (y: number, h: number, v: number, col: string, text: string) => {
      c.fillStyle = "#1b1530";
      c.beginPath();
      c.roundRect(14, y, W - 28, h, 8);
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.roundRect(18, y + 4, Math.max(0, (W - 36) * v), h - 8, 6);
      c.fill();
      c.font = '900 20px "Arial Black", Impact, sans-serif';
      c.fillStyle = "#fff";
      c.strokeStyle = "#1b1530";
      c.lineWidth = 4;
      c.strokeText(text, W / 2, y + h / 2 + 1);
      c.fillText(text, W / 2, y + h / 2 + 1);
    };
    bar(46, 26, hp / 100, hp > 40 ? "#ff5f6d" : "#ff2d2d", `${Math.round(hp)} HP`);
    const k = cond / 100;
    const condColor = k > 0.66 ? "#ffd000" : k > 0.33 ? "#8be9fd" : "#4fc3ff";
    bar(78, 26, k, condColor, `⚡ ${Math.round(cond)}%`);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}
