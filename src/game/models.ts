import * as THREE from "three";

// ---------- shared materials & helpers ----------

const gradientMap = (() => {
  const data = new Uint8Array([80, 165, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

export function toon(
  color: THREE.ColorRepresentation,
  extra: THREE.MeshToonMaterialParameters = {},
) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

/** Faceted low-poly look: split vertices so every face gets its own normal. */
export function flat<T extends THREE.BufferGeometry>(geo: T): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.BackSide });
/** Body while the skeleton shows through: dark see-through jelly. */
export const XRAY_MAT = new THREE.MeshBasicMaterial({
  color: 0x14143a,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
/** Body on the "negative" strobe frame: blinding yellow-white. */
export const ZAP_MAT = new THREE.MeshBasicMaterial({ color: 0xfff7a8 });
export const BONE_MAT = new THREE.MeshBasicMaterial({ color: 0xfdf6d8 });
const BLACK = new THREE.MeshBasicMaterial({ color: 0x111111 });
const WHITE = toon(0xffffff);
const EYE_WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const GLOW_YELLOW = new THREE.MeshBasicMaterial({
  color: 0xfff176,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});
const WATER_MAT = toon(0x48b6f0, { transparent: true, opacity: 0.9 });
const METAL = toon(0xb9c6d2);
const DARK_METAL = toon(0x4b5563);
const RUBBER_YELLOW = toon(0xffd93b);

export function outline(mesh: THREE.Mesh, amount = 0.07) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  o.scale.setScalar(1 + amount);
  o.userData["outline"] = true;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A flat 2D lightning-bolt polygon, extruded a hair so it has sides. */
function boltShape(h = 0.5, w = 0.22) {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.2, h / 2);
  s.lineTo(w * 0.5, h / 2);
  s.lineTo(w * 0.05, 0.05 * h);
  s.lineTo(w * 0.45, 0.05 * h);
  s.lineTo(-w * 0.35, -h / 2);
  s.lineTo(-w * 0.05, -0.1 * h);
  s.lineTo(-w * 0.5, -0.1 * h);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
}

// ---------- character ----------

export type HatKind =
  "party" | "top" | "propeller" | "cowboy" | "viking" | "chef" | "crown" | "beanie";
export const HAT_KINDS: HatKind[] = [
  "party",
  "top",
  "propeller",
  "cowboy",
  "viking",
  "chef",
  "crown",
  "beanie",
];

export type WeaponKind =
  | "balloon"
  | "rod"
  | "taser"
  | "eel"
  | "soaker"
  | "bucket"
  | "cloud"
  | "duck"
  | "umbrella"
  | "sprinkler";
export const WEAPON_KINDS: WeaponKind[] = [
  "balloon",
  "rod",
  "taser",
  "eel",
  "soaker",
  "bucket",
  "cloud",
  "duck",
  "umbrella",
  "sprinkler",
];

export interface Skeleton {
  group: THREE.Group;
  jaw: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

export interface CharModel {
  root: THREE.Group;
  pivot: THREE.Group;
  head: THREE.Group;
  eyes: { white: THREE.Mesh; pupil: THREE.Mesh; x: THREE.Group }[];
  brows: THREE.Mesh[];
  mouth: THREE.Mesh;
  tongue: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  holder: THREE.Group;
  items: Record<WeaponKind, THREE.Object3D>;
  hat: THREE.Group;
  hatKind: HatKind;
  hatColor: number;
  propeller: THREE.Object3D | null;
  hair: THREE.Group;
  spikes: THREE.Group;
  skel: Skeleton;
  koStars: THREE.Group;
  sweat: THREE.Group;
  rods: THREE.Group;
  skin: THREE.Mesh[];
  skinMat: Map<THREE.Mesh, THREE.Material>;
  outlines: THREE.Mesh[];
  bodyMat: THREE.MeshToonMaterial;
  gloveMat: THREE.MeshToonMaterial;
  baseColor: THREE.Color;
  puddle: THREE.Mesh;
  marker: THREE.Mesh;
  eelSegs: THREE.Object3D[];
  taserTip: THREE.Object3D;
  taserLed: THREE.Mesh;
  soakerNozzle: THREE.Object3D;
  bucketWater: THREE.Mesh;
  umbrellaCanopy: THREE.Group;
  sprinklerArm: THREE.Object3D;
  cloudFace: MiniCloud;
}

export function buildCharacter(color: number, hatKind: HatKind, hatColor: number): CharModel {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const bodyMat = toon(color);
  const gloveMat = toon(0xffffff);
  const shoeMat = toon(0x2a2438);
  const skin: THREE.Mesh[] = [];
  const outlines: THREE.Mesh[] = [];

  const addSkin = (m: THREE.Mesh, o = 0.07) => {
    skin.push(m);
    if (o > 0) outlines.push(outline(m, o));
    return m;
  };

  // torso: low-poly bean
  const lathePts = [
    [0.01, 0],
    [0.36, 0.02],
    [0.5, 0.2],
    [0.53, 0.44],
    [0.46, 0.66],
    [0.3, 0.8],
    [0.01, 0.82],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torsoGeo = flat(new THREE.LatheGeometry(lathePts, 7));
  torsoGeo.center();
  const torso = addSkin(mesh(torsoGeo, bodyMat), 0.06);
  torso.position.y = 0.88;
  pivot.add(torso);

  const btn = mesh(flat(new THREE.IcosahedronGeometry(0.05, 0)), BLACK, false);
  btn.position.set(0, 0.95, 0.51);
  pivot.add(btn);
  skin.push(btn);

  // head
  const head = new THREE.Group();
  head.position.y = 1.62;
  pivot.add(head);
  const headGeo = flat(new THREE.IcosahedronGeometry(0.5, 1));
  const headMesh = addSkin(mesh(headGeo, bodyMat), 0.06);
  head.add(headMesh);

  const eyes: CharModel["eyes"] = [];
  const brows: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const white = mesh(flat(new THREE.IcosahedronGeometry(0.16, 1)), EYE_WHITE, false);
    white.position.set(0.19 * s, 0.1, 0.4);
    outline(white, 0.12);
    head.add(white);
    const pupil = mesh(flat(new THREE.IcosahedronGeometry(0.075, 0)), BLACK, false);
    pupil.position.set(0, 0, 0.12);
    white.add(pupil);
    const x = new THREE.Group();
    for (const r of [0.8, -0.8]) {
      const bar = mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), BLACK, false);
      bar.rotation.z = r;
      x.add(bar);
    }
    x.position.set(0, 0, 0.14);
    x.visible = false;
    white.add(x);
    eyes.push({ white, pupil, x });
    const brow = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), BLACK, false);
    brow.position.set(0.2 * s, 0.32, 0.42);
    brow.rotation.z = -0.25 * s;
    head.add(brow);
    brows.push(brow);
  }
  const mouth = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), BLACK, false);
  mouth.position.set(0, -0.17, 0.46);
  head.add(mouth);
  const tongue = mesh(new THREE.BoxGeometry(0.08, 0.04, 0.14), toon(0xff6b9d), false);
  tongue.position.set(0.05, -0.24, 0.5);
  tongue.rotation.x = 0.4;
  tongue.visible = false;
  head.add(tongue);

  // hat
  const { hat, propeller } = buildHat(hatKind, hatColor);
  hat.position.y = 0.38;
  head.add(hat);

  // charred afro (hidden until the storm gets you)
  const hair = new THREE.Group();
  const hairMat = toon(0x1a1a1a);
  const coneGeo = flat(new THREE.ConeGeometry(0.1, 0.42, 4));
  for (let i = 0; i < 14; i++) {
    const c = mesh(coneGeo, hairMat, false);
    const theta = (i / 14) * Math.PI * 2 * 2.3;
    const phi = 0.15 + (i / 14) * 1.2;
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    c.position.copy(dir).multiplyScalar(0.48);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    hair.add(c);
  }
  hair.visible = false;
  head.add(hair);

  // electric hair: stands straight up while being zapped
  const spikes = new THREE.Group();
  const spikeGeo = flat(new THREE.ConeGeometry(0.07, 0.6, 4));
  const spikeMat = new THREE.MeshBasicMaterial({ color: 0xfff176 });
  for (let i = 0; i < 9; i++) {
    const c = mesh(spikeGeo, spikeMat, false);
    const theta = (i / 9) * Math.PI * 2;
    const phi = 0.25 + (i % 3) * 0.25;
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    c.position.copy(dir).multiplyScalar(0.62);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    spikes.add(c);
  }
  spikes.visible = false;
  head.add(spikes);

  // sweat/water drops hanging off the head when soaked
  const sweat = new THREE.Group();
  const dropGeo = flat(new THREE.ConeGeometry(0.07, 0.16, 5));
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff });
  for (let i = 0; i < 5; i++) {
    const d = mesh(dropGeo, dropMat, false);
    const a = (i / 5) * Math.PI * 2 + 0.4;
    d.position.set(Math.cos(a) * 0.5, 0.15 - (i % 2) * 0.25, Math.sin(a) * 0.5);
    d.rotation.x = Math.PI;
    sweat.add(d);
  }
  sweat.visible = false;
  head.add(sweat);

  // dizzy stars orbiting the head after a K.O.
  const koStars = new THREE.Group();
  const starGeo = starGeometry(0.16);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const s = mesh(starGeo, starMat, false);
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
    koStars.add(s);
  }
  koStars.position.y = 0.55;
  koStars.visible = false;
  head.add(koStars);

  // arms
  const armGeo = flat(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 6));
  const gloveGeo = flat(new THREE.IcosahedronGeometry(0.14, 0));
  const makeArm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(0.47 * s, 1.12, 0);
    g.rotation.z = 0.3 * s;
    const a = addSkin(mesh(armGeo, bodyMat), 0.12);
    a.position.y = -0.21;
    g.add(a);
    const h = addSkin(mesh(gloveGeo, gloveMat), 0.12);
    h.position.y = -0.46;
    g.add(h);
    pivot.add(g);
    return g;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const holder = new THREE.Group();
  holder.position.set(0, -0.52, 0.06);
  armR.add(holder);

  // legs
  const legGeo = flat(new THREE.CylinderGeometry(0.12, 0.1, 0.4, 6));
  const shoeGeo = flat(new THREE.DodecahedronGeometry(0.17, 0));
  const makeLeg = (s: number) => {
    const g = new THREE.Group();
    g.position.set(0.2 * s, 0.5, 0);
    const l = addSkin(mesh(legGeo, bodyMat), 0.1);
    l.position.y = -0.2;
    g.add(l);
    const shoe = addSkin(mesh(shoeGeo, shoeMat), 0.1);
    shoe.scale.set(0.85, 0.55, 1.2);
    shoe.position.set(0, -0.42, 0.07);
    g.add(shoe);
    pivot.add(g);
    return g;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // the comic x-ray skeleton (whole thing in one group so it can jump out of the body)
  const skel = buildSkeleton();
  skel.group.visible = false;
  pivot.add(skel.group);

  // weapon items in hand
  const taser = buildTaser();
  const soaker = buildSoaker();
  const bucket = buildBucket();
  const umbrella = buildUmbrella();
  const sprinkler = buildSprinkler();
  const cloud = buildMiniCloud(0.35);
  const eel = buildEel();
  const duck = buildDuck(true);
  const items: Record<WeaponKind, THREE.Object3D> = {
    balloon: buildBalloon(0x3fa9ff),
    rod: buildRod(),
    taser: taser.group,
    eel: eel.group,
    soaker: soaker.group,
    bucket: bucket.group,
    cloud: cloud.group,
    duck: duck,
    umbrella: umbrella.group,
    sprinkler: sprinkler.group,
  };
  items.balloon.scale.setScalar(0.8);
  items.balloon.position.y = -0.12;
  items.rod.rotation.x = Math.PI / 2;
  items.rod.position.z = 0.15;
  items.rod.scale.setScalar(0.7);
  items.taser.position.z = 0.12;
  items.taser.rotation.x = Math.PI / 2;
  eel.group.scale.setScalar(0.6);
  eel.group.rotation.x = Math.PI / 2;
  eel.group.position.z = 0.05;
  items.soaker.position.set(0.02, 0.02, 0.18);
  items.soaker.rotation.x = Math.PI / 2;
  items.soaker.scale.setScalar(0.8);
  items.bucket.position.set(0, -0.1, 0.1);
  items.bucket.scale.setScalar(0.75);
  items.cloud.position.set(0, 0.05, 0.1);
  items.duck.scale.setScalar(0.6);
  items.duck.position.set(0, -0.05, 0.1);
  items.umbrella.position.set(0, 0.0, 0.05);
  items.umbrella.scale.setScalar(0.8);
  items.sprinkler.scale.setScalar(0.55);
  items.sprinkler.position.set(0, -0.1, 0.15);
  for (const k of WEAPON_KINDS) {
    items[k].visible = false;
    holder.add(items[k]);
  }

  const rods = new THREE.Group();
  pivot.add(rods);

  // soggy puddle under the feet, shown when very wet
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 9),
    new THREE.MeshBasicMaterial({ color: 0x4fb3ff, transparent: true, opacity: 0.55 }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.03;
  puddle.visible = false;
  root.add(puddle);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.92, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9 }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.04;
  marker.visible = false;
  root.add(marker);

  const skinMat = new Map<THREE.Mesh, THREE.Material>();
  for (const m of skin) skinMat.set(m, m.material as THREE.Material);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData["outline"] && o !== puddle && o !== marker) {
      o.castShadow = true;
    }
  });

  return {
    root,
    pivot,
    head,
    eyes,
    brows,
    mouth,
    tongue,
    armL,
    armR,
    legL,
    legR,
    holder,
    items,
    hat,
    hatKind,
    hatColor,
    propeller,
    hair,
    spikes,
    skel,
    koStars,
    sweat,
    rods,
    skin,
    skinMat,
    outlines,
    bodyMat,
    gloveMat,
    baseColor: new THREE.Color(color),
    puddle,
    marker,
    eelSegs: eel.segs,
    taserTip: taser.tip,
    taserLed: taser.led,
    soakerNozzle: soaker.nozzle,
    bucketWater: bucket.water,
    umbrellaCanopy: umbrella.canopy,
    sprinklerArm: sprinkler.arm,
    cloudFace: cloud,
  };
}

function starGeometry(r: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(shape);
}

/** A proper cartoon skeleton: skull with jaw, vertebrae, rib cage, pelvis, limb bones. */
export function buildSkeleton(): Skeleton {
  const group = new THREE.Group();
  const bone = (geo: THREE.BufferGeometry) => mesh(geo, BONE_MAT, false);
  const ball = (r: number) => bone(flat(new THREE.IcosahedronGeometry(r, 0)));

  // skull
  const skull = bone(flat(new THREE.IcosahedronGeometry(0.4, 1)));
  skull.scale.set(1, 1.05, 0.95);
  skull.position.y = 1.66;
  group.add(skull);
  for (const s of [-1, 1]) {
    const sock = mesh(flat(new THREE.IcosahedronGeometry(0.12, 0)), BLACK, false);
    sock.position.set(0.16 * s, 0.06, 0.32);
    skull.add(sock);
  }
  const nose = mesh(flat(new THREE.ConeGeometry(0.05, 0.1, 3)), BLACK, false);
  nose.position.set(0, -0.08, 0.38);
  nose.rotation.x = Math.PI;
  skull.add(nose);
  const upperTeeth = bone(new THREE.BoxGeometry(0.3, 0.07, 0.1));
  upperTeeth.position.set(0, -0.3, 0.28);
  skull.add(upperTeeth);
  for (let i = 0; i < 4; i++) {
    const gap = mesh(new THREE.BoxGeometry(0.015, 0.08, 0.02), BLACK, false);
    gap.position.set(-0.1 + i * 0.07, -0.3, 0.335);
    skull.add(gap);
  }
  const jaw = bone(new THREE.BoxGeometry(0.32, 0.09, 0.26));
  jaw.position.set(0, -0.38, 0.14);
  skull.add(jaw);
  const jawTeeth = bone(new THREE.BoxGeometry(0.28, 0.06, 0.06));
  jawTeeth.position.set(0, 0.07, 0.12);
  jaw.add(jawTeeth);

  // spine
  for (let i = 0; i < 6; i++) {
    const v = bone(flat(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6)));
    v.position.y = 0.6 + i * 0.14;
    group.add(v);
    const disc = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 6), BLACK, false);
    disc.position.y = 0.67 + i * 0.14;
    group.add(disc);
  }
  // rib cage: three pairs of curved ribs
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const rib = bone(new THREE.TorusGeometry(0.28 - i * 0.03, 0.03, 4, 8, Math.PI));
      rib.position.set(0, 1.18 - i * 0.16, 0.02);
      rib.rotation.set(Math.PI / 2, 0, s > 0 ? Math.PI : 0);
      rib.rotation.x = (Math.PI / 2) * 0.85;
      group.add(rib);
    }
  }
  const sternum = bone(new THREE.BoxGeometry(0.06, 0.45, 0.04));
  sternum.position.set(0, 1.0, 0.3);
  group.add(sternum);
  // pelvis
  const pelvis = bone(new THREE.BoxGeometry(0.4, 0.12, 0.16));
  pelvis.position.y = 0.52;
  group.add(pelvis);
  for (const s of [-1, 1]) {
    const hip = ball(0.09);
    hip.position.set(0.2 * s, 0.5, 0);
    group.add(hip);
  }

  // limbs: upper bone + joint ball + lower bone + hand/foot
  const limb = (len: number, r: number, foot: boolean) => {
    const g = new THREE.Group();
    const upper = bone(flat(new THREE.CylinderGeometry(r, r * 0.8, len * 0.48, 5)));
    upper.position.y = -len * 0.24;
    g.add(upper);
    const elbow = ball(r * 1.5);
    elbow.position.y = -len * 0.5;
    g.add(elbow);
    const lower = bone(flat(new THREE.CylinderGeometry(r * 0.8, r * 0.8, len * 0.48, 5)));
    lower.position.y = -len * 0.75;
    g.add(lower);
    if (foot) {
      const f = bone(new THREE.BoxGeometry(0.12, 0.06, 0.3));
      f.position.set(0, -len - 0.02, 0.08);
      g.add(f);
      for (let i = 0; i < 3; i++) {
        const toe = ball(0.03);
        toe.position.set(-0.04 + i * 0.04, -len - 0.02, 0.25);
        g.add(toe);
      }
    } else {
      const palm = ball(r * 1.6);
      palm.position.y = -len - 0.02;
      g.add(palm);
      for (let i = 0; i < 3; i++) {
        const finger = bone(new THREE.BoxGeometry(0.025, 0.14, 0.025));
        finger.position.set(-0.05 + i * 0.05, -len - 0.12, 0);
        finger.rotation.z = (i - 1) * 0.25;
        g.add(finger);
      }
    }
    return g;
  };
  const armL = limb(0.5, 0.035, false);
  armL.position.set(-0.47, 1.12, 0);
  armL.rotation.z = -0.3;
  const armR = limb(0.5, 0.035, false);
  armR.position.set(0.47, 1.12, 0);
  armR.rotation.z = 0.3;
  const legL = limb(0.5, 0.04, true);
  legL.position.set(-0.2, 0.5, 0);
  const legR = limb(0.5, 0.04, true);
  legR.position.set(0.2, 0.5, 0);
  for (const s of [-1, 1]) {
    const shoulder = ball(0.08);
    shoulder.position.set(0.44 * s, 1.14, 0);
    group.add(shoulder);
    const collar = bone(new THREE.BoxGeometry(0.4, 0.04, 0.04));
    collar.position.set(0.22 * s, 1.18, 0.1);
    collar.rotation.z = -0.15 * s;
    group.add(collar);
  }
  group.add(armL, armR, legL, legR);
  return { group, jaw, armL, armR, legL, legR };
}

export function buildHat(kind: HatKind, color: number) {
  const hat = new THREE.Group();
  const mat = toon(color);
  let propeller: THREE.Object3D | null = null;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, o = 0.08) => {
    const me = mesh(flat(geo), m);
    outline(me, o);
    hat.add(me);
    return me;
  };
  switch (kind) {
    case "party": {
      const c = add(new THREE.ConeGeometry(0.24, 0.55, 7), mat);
      c.position.y = 0.22;
      c.rotation.z = -0.15;
      const pom = add(new THREE.IcosahedronGeometry(0.09, 0), WHITE, 0.15);
      pom.position.set(0.08, 0.5, 0);
      for (let i = 0; i < 3; i++) {
        const stripe = add(new THREE.TorusGeometry(0.19 - i * 0.055, 0.02, 4, 8), WHITE, 0.01);
        stripe.rotation.x = Math.PI / 2;
        stripe.position.y = 0.08 + i * 0.13;
        stripe.rotation.z = -0.15;
      }
      break;
    }
    case "top": {
      const brim = add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10), toon(0x222222), 0.05);
      brim.position.y = 0.02;
      const crown = add(new THREE.CylinderGeometry(0.27, 0.27, 0.48, 9), toon(0x222222), 0.05);
      crown.position.y = 0.26;
      const band = add(new THREE.CylinderGeometry(0.28, 0.28, 0.09, 9), mat, 0.02);
      band.position.y = 0.08;
      break;
    }
    case "propeller": {
      const cap = add(
        new THREE.SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        mat,
        0.05,
      );
      cap.position.y = -0.12;
      const stick = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 4), toon(0x333333));
      stick.position.y = 0.36;
      hat.add(stick);
      const prop = new THREE.Group();
      prop.position.y = 0.47;
      const bladeMat = toon(0xff4757);
      for (const s of [-1, 1]) {
        const b = mesh(new THREE.BoxGeometry(0.34, 0.025, 0.09), s > 0 ? bladeMat : toon(0x2ed573));
        b.position.x = 0.17 * s;
        prop.add(b);
      }
      hat.add(prop);
      propeller = prop;
      break;
    }
    case "cowboy": {
      const brown = toon(0x8b5a2b);
      const brim = add(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 10), brown, 0.04);
      brim.scale.z = 0.85;
      brim.position.y = 0.02;
      const crown = add(new THREE.CylinderGeometry(0.24, 0.3, 0.36, 8), brown, 0.06);
      crown.position.y = 0.2;
      const band = add(new THREE.CylinderGeometry(0.305, 0.31, 0.07, 8), mat, 0.01);
      band.position.y = 0.06;
      break;
    }
    case "viking": {
      const helm = add(
        new THREE.SphereGeometry(0.44, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        toon(0x9aa5b1),
        0.05,
      );
      helm.position.y = -0.14;
      for (const s of [-1, 1]) {
        const horn = add(new THREE.ConeGeometry(0.09, 0.42, 5), toon(0xfff3d6), 0.1);
        horn.position.set(0.42 * s, 0.1, 0);
        horn.rotation.z = -0.9 * s;
      }
      break;
    }
    case "chef": {
      const base = add(new THREE.CylinderGeometry(0.3, 0.28, 0.3, 9), WHITE, 0.05);
      base.position.y = 0.12;
      for (let i = 0; i < 4; i++) {
        const puff = add(new THREE.IcosahedronGeometry(0.2, 0), WHITE, 0.08);
        const a = (i / 4) * Math.PI * 2;
        puff.position.set(Math.cos(a) * 0.15, 0.38, Math.sin(a) * 0.15);
      }
      break;
    }
    case "crown": {
      const gold = toon(0xffc93c);
      const ring = add(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 8, 1, true), gold, 0.04);
      ring.position.y = 0.06;
      (ring.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = add(new THREE.ConeGeometry(0.07, 0.2, 4), gold, 0.1);
        sp.position.set(Math.cos(a) * 0.28, 0.24, Math.sin(a) * 0.28);
      }
      const gem = add(new THREE.OctahedronGeometry(0.06, 0), toon(color), 0.1);
      gem.position.set(0, 0.08, 0.31);
      break;
    }
    case "beanie": {
      const cap = add(
        new THREE.SphereGeometry(0.42, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        mat,
        0.05,
      );
      cap.position.y = -0.1;
      const cuff = add(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 9), toon(0xffffff), 0.03);
      cuff.position.y = -0.08;
      const pom = add(new THREE.IcosahedronGeometry(0.12, 0), toon(0xffffff), 0.1);
      pom.position.y = 0.34;
      break;
    }
  }
  return { hat, propeller };
}

// ---------- weapons / projectiles ----------

export function buildBalloon(color: number) {
  const g = new THREE.Group();
  const geo = flat(new THREE.IcosahedronGeometry(0.22, 1));
  const b = mesh(geo, toon(color, { transparent: true, opacity: 0.9 }));
  b.scale.set(1, 1.15, 1);
  outline(b, 0.1);
  g.add(b);
  // sloshing water inside
  const water = mesh(flat(new THREE.IcosahedronGeometry(0.17, 1)), toon(0x1e88e5));
  water.position.y = -0.04;
  water.scale.set(1, 0.85, 1);
  water.name = "water";
  g.add(water);
  const knot = mesh(flat(new THREE.ConeGeometry(0.06, 0.1, 5)), toon(color));
  knot.position.y = -0.28;
  g.add(knot);
  const tie = mesh(new THREE.TorusGeometry(0.045, 0.02, 4, 8), toon(color));
  tie.position.y = -0.29;
  tie.rotation.x = Math.PI / 2;
  g.add(tie);
  const shine = mesh(flat(new THREE.IcosahedronGeometry(0.05, 0)), EYE_WHITE, false);
  shine.position.set(-0.09, 0.11, 0.17);
  g.add(shine);
  const shine2 = mesh(flat(new THREE.IcosahedronGeometry(0.025, 0)), EYE_WHITE, false);
  shine2.position.set(-0.13, 0.02, 0.17);
  g.add(shine2);
  return g;
}

const ROD_TIP = toon(0xff4757);
export function buildRod() {
  const g = new THREE.Group();
  const shaft = mesh(flat(new THREE.CylinderGeometry(0.035, 0.04, 1.2, 6)), METAL);
  g.add(shaft);
  for (let i = 0; i < 3; i++) {
    const rivet = mesh(new THREE.TorusGeometry(0.045, 0.015, 4, 8), DARK_METAL);
    rivet.rotation.x = Math.PI / 2;
    rivet.position.y = -0.3 + i * 0.3;
    g.add(rivet);
  }
  const tip = mesh(flat(new THREE.ConeGeometry(0.075, 0.26, 5)), ROD_TIP);
  tip.position.y = 0.72;
  g.add(tip);
  const ball = mesh(flat(new THREE.IcosahedronGeometry(0.075, 0)), ROD_TIP);
  ball.position.y = 0.5;
  g.add(ball);
  // lightning-bolt shaped tail fins
  const finGeo = boltShape(0.34, 0.2);
  const finMat = toon(0xffd32a);
  for (const r of [0, Math.PI / 2]) {
    const fin = mesh(finGeo, finMat);
    fin.position.y = -0.45;
    fin.rotation.y = r;
    fin.position.x = r ? 0 : -0.015;
    fin.position.z = r ? 0.015 : 0;
    g.add(fin);
  }
  return g;
}

export function buildTaser() {
  const group = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.17, 0.14, 0.36), toon(0x2b2d42));
  outline(body, 0.1);
  group.add(body);
  const grip = mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), toon(0x2b2d42));
  grip.position.set(0, -0.16, -0.08);
  grip.rotation.x = 0.35;
  outline(grip, 0.1);
  group.add(grip);
  const trigger = mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), toon(0xcfd8dc));
  trigger.position.set(0, -0.1, 0.06);
  group.add(trigger);
  for (const y of [0.04, -0.04]) {
    const stripe = mesh(new THREE.BoxGeometry(0.175, 0.03, 0.22), toon(0xffd32a));
    stripe.position.set(0, y, -0.02);
    group.add(stripe);
  }
  const boltBadge = mesh(
    boltShape(0.12, 0.07),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
    false,
  );
  boltBadge.position.set(0.09, 0, 0);
  boltBadge.rotation.y = Math.PI / 2;
  group.add(boltBadge);
  const led = mesh(
    flat(new THREE.IcosahedronGeometry(0.025, 0)),
    new THREE.MeshBasicMaterial({ color: 0x2ed573 }),
    false,
  );
  led.position.set(0, 0.085, -0.1);
  group.add(led);
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 5), METAL);
    p.rotation.x = Math.PI / 2;
    p.position.set(0.055 * s, 0.01, 0.25);
    group.add(p);
    const spark = mesh(
      flat(new THREE.IcosahedronGeometry(0.02, 0)),
      new THREE.MeshBasicMaterial({ color: 0x8be9fd }),
      false,
    );
    spark.position.set(0.055 * s, 0.01, 0.33);
    group.add(spark);
  }
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.01, 0.34);
  group.add(tip);
  return { group, tip, led };
}

export function buildEel() {
  const group = new THREE.Group();
  const segs: THREE.Object3D[] = [];
  const mat = toon(0x58b947);
  const belly = toon(0xf6e58d);
  const finMat = toon(0x2d8f3a);
  let parent: THREE.Object3D = group;
  const sizes = [0.21, 0.2, 0.18, 0.16, 0.14, 0.11, 0.085, 0.06];
  sizes.forEach((r, i) => {
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : -sizes[i - 1]! * 1.45;
    const m = mesh(flat(new THREE.IcosahedronGeometry(r, 0)), i % 2 ? belly : mat);
    m.scale.set(0.85, 0.85, 1.4);
    outline(m, 0.12);
    seg.add(m);
    parent.add(seg);
    segs.push(seg);
    parent = seg;
    if (i >= 1 && i <= 5) {
      const fin = mesh(flat(new THREE.ConeGeometry(0.06, 0.16, 3)), finMat);
      fin.position.set(0, r * 0.95, 0);
      fin.rotation.x = -0.3;
      seg.add(fin);
    }
    if (i === 0) {
      for (const s of [-1, 1]) {
        const e = mesh(flat(new THREE.IcosahedronGeometry(0.07, 0)), EYE_WHITE, false);
        e.position.set(0.12 * s, 0.1, 0.14);
        outline(e, 0.15);
        const p = mesh(flat(new THREE.IcosahedronGeometry(0.035, 0)), BLACK, false);
        p.position.z = 0.05;
        e.add(p);
        seg.add(e);
        const brow = mesh(new THREE.BoxGeometry(0.1, 0.025, 0.025), BLACK, false);
        brow.position.set(0.12 * s, 0.2, 0.16);
        brow.rotation.z = 0.5 * s;
        seg.add(brow);
      }
      // open mouth with two teeth
      const jaw = mesh(flat(new THREE.ConeGeometry(0.1, 0.22, 4)), belly);
      jaw.rotation.x = Math.PI / 2 + 0.5;
      jaw.position.set(0, -0.1, 0.22);
      seg.add(jaw);
      const maw = mesh(new THREE.BoxGeometry(0.14, 0.06, 0.1), BLACK, false);
      maw.position.set(0, -0.03, 0.27);
      seg.add(maw);
      for (const s of [-1, 1]) {
        const tooth = mesh(flat(new THREE.ConeGeometry(0.02, 0.05, 3)), EYE_WHITE, false);
        tooth.position.set(0.04 * s, -0.02, 0.3);
        tooth.rotation.x = Math.PI;
        seg.add(tooth);
      }
      // electric collar
      const collar = mesh(new THREE.TorusGeometry(0.24, 0.03, 4, 10), GLOW_YELLOW, false);
      collar.position.z = -0.05;
      collar.name = "collar";
      seg.add(collar);
    }
    if (i === sizes.length - 1) {
      const tail = mesh(flat(new THREE.ConeGeometry(0.14, 0.3, 4)), finMat);
      tail.rotation.x = -Math.PI / 2;
      tail.scale.x = 0.25;
      tail.position.z = -0.17;
      seg.add(tail);
    }
  });
  return { group, segs };
}

export function buildSoaker() {
  const group = new THREE.Group();
  const orange = toon(0xff9f43);
  const green = toon(0x2ed573);
  const body = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.46), orange);
  outline(body, 0.08);
  group.add(body);
  const barrel = mesh(flat(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 8)), green);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, 0.4);
  outline(barrel, 0.1);
  group.add(barrel);
  const muzzle = mesh(flat(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8)), toon(0xffd32a));
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.03, 0.6);
  group.add(muzzle);
  const pump = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), toon(0xffd32a));
  pump.position.set(0, -0.09, 0.42);
  group.add(pump);
  const tank = mesh(
    flat(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 8)),
    toon(0x7ad7ff, { transparent: true, opacity: 0.7 }),
  );
  tank.position.set(0, 0.17, -0.02);
  outline(tank, 0.06);
  group.add(tank);
  const tankWater = mesh(flat(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 8)), toon(0x1e88e5));
  tankWater.position.set(0, 0.12, -0.02);
  group.add(tankWater);
  const cap = mesh(flat(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8)), green);
  cap.position.set(0, 0.3, -0.02);
  group.add(cap);
  const grip = mesh(new THREE.BoxGeometry(0.1, 0.24, 0.11), green);
  grip.position.set(0, -0.16, -0.1);
  grip.rotation.x = 0.3;
  outline(grip, 0.08);
  group.add(grip);
  const trigger = mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), DARK_METAL);
  trigger.position.set(0, -0.1, 0.04);
  group.add(trigger);
  const nozzle = new THREE.Object3D();
  nozzle.position.set(0, 0.03, 0.65);
  group.add(nozzle);
  return { group, nozzle };
}

export function buildBucket() {
  const group = new THREE.Group();
  const red = toon(0xff4757);
  const body = mesh(flat(new THREE.CylinderGeometry(0.26, 0.2, 0.4, 9, 1, true)), red);
  (body.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  group.add(body);
  const bottom = mesh(new THREE.CircleGeometry(0.2, 9), red);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -0.2;
  group.add(bottom);
  const rim = mesh(new THREE.TorusGeometry(0.26, 0.025, 4, 10), toon(0xc0392b));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.2;
  group.add(rim);
  const water = mesh(new THREE.CircleGeometry(0.235, 9), WATER_MAT);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.14;
  group.add(water);
  const handle = mesh(new THREE.TorusGeometry(0.28, 0.02, 4, 12, Math.PI), METAL);
  handle.position.y = 0.2;
  group.add(handle);
  const o = new THREE.Mesh(body.geometry, OUTLINE_MAT);
  o.scale.setScalar(1.06);
  o.userData["outline"] = true;
  group.add(o);
  return { group, water };
}

export interface MiniCloud {
  group: THREE.Group;
  pupils: THREE.Mesh[];
  brows: THREE.Mesh[];
  mouth: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
}

/** A pocket-sized thundercloud with an angry face. */
export function buildMiniCloud(scale = 1): MiniCloud {
  const group = new THREE.Group();
  const mat = toon(0x5b5f85);
  const puffs = [
    [0, 0, 0, 0.42],
    [-0.4, -0.05, 0.05, 0.32],
    [0.4, -0.05, -0.05, 0.34],
    [0.1, 0.25, -0.1, 0.3],
    [-0.2, 0.2, 0.15, 0.26],
    [0, -0.1, 0.3, 0.3],
  ] as const;
  for (const [x, y, z, r] of puffs) {
    const p = mesh(flat(new THREE.IcosahedronGeometry(r, 0)), mat);
    p.position.set(x, y, z);
    outline(p, 0.08);
    group.add(p);
  }
  const pupils: THREE.Mesh[] = [];
  const brows: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = mesh(flat(new THREE.IcosahedronGeometry(0.12, 1)), EYE_WHITE, false);
    e.position.set(0.2 * s, 0.05, 0.5);
    outline(e, 0.12);
    group.add(e);
    const p = mesh(flat(new THREE.IcosahedronGeometry(0.055, 0)), BLACK, false);
    p.position.set(0, 0, 0.09);
    e.add(p);
    pupils.push(p);
    const b = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), BLACK, false);
    b.position.set(0.2 * s, 0.22, 0.55);
    b.rotation.z = 0.55 * s;
    group.add(b);
    brows.push(b);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.14, 0.03, 4, 8, Math.PI), BLACK, false);
  mouth.position.set(0, -0.26, 0.5);
  mouth.rotation.z = 0;
  group.add(mouth);
  const bolt = mesh(boltShape(0.3, 0.14), new THREE.MeshBasicMaterial({ color: 0xfff176 }), false);
  bolt.position.set(0.05, -0.55, 0.1);
  bolt.name = "bolt";
  group.add(bolt);
  group.scale.setScalar(scale);
  return { group, pupils, brows, mouth, mat };
}

/** Rubber duck. With `withRod` it wears a lightning rod on its head: a decoy. */
export function buildDuck(withRod: boolean) {
  const g = new THREE.Group();
  const body = mesh(flat(new THREE.IcosahedronGeometry(0.34, 1)), RUBBER_YELLOW);
  body.scale.set(1, 0.8, 1.25);
  body.position.y = 0.28;
  outline(body, 0.07);
  g.add(body);
  const tail = mesh(flat(new THREE.ConeGeometry(0.14, 0.3, 5)), RUBBER_YELLOW);
  tail.position.set(0, 0.42, -0.4);
  tail.rotation.x = -1.0;
  g.add(tail);
  const head = mesh(flat(new THREE.IcosahedronGeometry(0.24, 1)), RUBBER_YELLOW);
  head.position.set(0, 0.68, 0.24);
  outline(head, 0.08);
  g.add(head);
  const beak = mesh(flat(new THREE.ConeGeometry(0.11, 0.22, 4)), toon(0xff9f43));
  beak.position.set(0, 0.62, 0.5);
  beak.rotation.x = Math.PI / 2;
  beak.scale.y = 0.5;
  g.add(beak);
  for (const s of [-1, 1]) {
    const e = mesh(flat(new THREE.IcosahedronGeometry(0.05, 0)), BLACK, false);
    e.position.set(0.14 * s, 0.76, 0.4);
    g.add(e);
    const wing = mesh(flat(new THREE.IcosahedronGeometry(0.16, 0)), toon(0xf5c518));
    wing.scale.set(0.5, 0.7, 1.1);
    wing.position.set(0.3 * s, 0.3, -0.05);
    g.add(wing);
  }
  if (withRod) {
    const rod = buildRod();
    rod.scale.setScalar(0.5);
    rod.position.set(0, 1.2, 0.2);
    g.add(rod);
    const strap = mesh(new THREE.TorusGeometry(0.25, 0.025, 4, 10), DARK_METAL);
    strap.position.set(0, 0.7, 0.24);
    strap.rotation.z = 0.3;
    g.add(strap);
  }
  return g;
}

export function buildUmbrella() {
  const group = new THREE.Group();
  const pole = mesh(flat(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6)), METAL);
  pole.position.y = 0.4;
  group.add(pole);
  const hook = mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 10, Math.PI), toon(0x8b5a2b));
  hook.position.set(-0.1, -0.15, 0);
  hook.rotation.z = Math.PI;
  group.add(hook);
  const canopy = new THREE.Group();
  canopy.position.y = 0.95;
  // alternating red/white panels via per-face vertex colours
  const geo = new THREE.ConeGeometry(0.95, 0.38, 8, 1, true).toNonIndexed();
  const colors = new Float32Array(geo.attributes["position"]!.count * 3);
  const c1 = new THREE.Color(0xff4757);
  const c2 = new THREE.Color(0xffffff);
  for (let f = 0; f < colors.length / 9; f++) {
    const c = f % 2 ? c1 : c2;
    for (let v = 0; v < 3; v++) {
      colors[f * 9 + v * 3] = c.r;
      colors[f * 9 + v * 3 + 1] = c.g;
      colors[f * 9 + v * 3 + 2] = c.b;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const top = mesh(geo, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  top.position.y = 0.1;
  canopy.add(top);
  const o = new THREE.Mesh(geo, OUTLINE_MAT);
  o.scale.setScalar(1.05);
  o.position.y = 0.1;
  o.userData["outline"] = true;
  canopy.add(o);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rib = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), METAL);
    rib.position.set(Math.cos(a) * 0.47, 0.1, Math.sin(a) * 0.47);
    rib.rotation.z = Math.cos(a) * 1.2;
    rib.rotation.x = -Math.sin(a) * 1.2;
    canopy.add(rib);
  }
  const tipBall = mesh(flat(new THREE.IcosahedronGeometry(0.05, 0)), METAL);
  tipBall.position.y = 0.33;
  canopy.add(tipBall);
  canopy.scale.set(0.15, 1, 0.15);
  group.add(canopy);
  return { group, canopy };
}

export function buildSprinkler() {
  const group = new THREE.Group();
  const base = mesh(flat(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 8)), toon(0x2ed573));
  base.position.y = 0.07;
  outline(base, 0.06);
  group.add(base);
  const stem = mesh(flat(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6)), METAL);
  stem.position.y = 0.38;
  group.add(stem);
  const arm = new THREE.Group();
  arm.position.y = 0.64;
  const bar = mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), METAL);
  arm.add(bar);
  for (const s of [-1, 1]) {
    const nozzle = mesh(flat(new THREE.CylinderGeometry(0.03, 0.045, 0.14, 5)), toon(0xffd32a));
    nozzle.position.set(0.43 * s, 0.07, 0);
    nozzle.rotation.z = -0.5 * s;
    arm.add(nozzle);
  }
  const hub = mesh(flat(new THREE.IcosahedronGeometry(0.08, 0)), toon(0xffd32a));
  arm.add(hub);
  group.add(arm);
  const hose = mesh(new THREE.TorusGeometry(0.3, 0.035, 5, 10, Math.PI * 1.3), toon(0x2ed573));
  hose.rotation.x = Math.PI / 2;
  hose.position.set(0.25, 0.05, -0.2);
  group.add(hose);
  return { group, arm };
}

/** The big angry storm cloud that swoops in during the countdown. */
export function buildStormCloud() {
  const c = buildMiniCloud(1);
  const extra = [
    [-0.9, 0.1, -0.2, 0.45],
    [0.9, 0.05, -0.3, 0.48],
    [0.3, 0.45, -0.4, 0.4],
    [-0.5, 0.4, -0.3, 0.38],
    [0, -0.2, -0.6, 0.5],
  ] as const;
  for (const [x, y, z, r] of extra) {
    const p = mesh(flat(new THREE.IcosahedronGeometry(r, 0)), c.mat);
    p.position.set(x, y, z);
    outline(p, 0.06);
    c.group.add(p);
  }
  const bolt = c.group.getObjectByName("bolt");
  if (bolt) bolt.visible = false;
  c.group.scale.setScalar(3.2);
  c.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData["outline"]) o.castShadow = true;
  });
  return c;
}

// ---------- world ----------

export interface Obstacle {
  x: number;
  z: number;
  r: number; // collision radius for walkers
  pr: number; // collision radius for projectiles
  h: number; // height for projectiles
}

export const GRASS_R = 22;
export const SAND_R = 24;
export const WALK_R = 25.6;
export const FOUNTAIN_R = 2.6;

export function groundHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r < GRASS_R) return 0;
  if (r < SAND_R) return -0.06;
  return -0.06 - (r - SAND_R) * 0.62;
}

export interface World {
  group: THREE.Group;
  obstacles: Obstacle[];
  ocean: THREE.Mesh;
  oceanBase: Float32Array;
  clouds: THREE.Group[];
  cloudMat: THREE.MeshToonMaterial;
  fountainSpout: THREE.Vector3;
  fountainDuck: THREE.Group;
  signs: THREE.Group[];
}

export function buildWorld(): World {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];

  // island
  const grass = new THREE.Mesh(
    flat(new THREE.CylinderGeometry(GRASS_R, GRASS_R + 0.4, 1.2, 40, 1)),
    toon(0x7ccf5a),
  );
  grass.position.y = -0.6;
  grass.receiveShadow = true;
  group.add(grass);
  const sand = new THREE.Mesh(
    flat(new THREE.CylinderGeometry(SAND_R, SAND_R + 3.5, 3.2, 40, 1)),
    toon(0xf3dc9a),
  );
  sand.position.y = -0.06 - 1.6;
  sand.receiveShadow = true;
  group.add(sand);
  const cliff = new THREE.Mesh(
    flat(new THREE.CylinderGeometry(SAND_R + 3.5, 14, 9, 14, 1)),
    toon(0xb98b5e),
  );
  cliff.position.y = -3.2 - 4.5;
  group.add(cliff);

  // grass patches and tufts
  const patchMat = toon(0x92dd6c);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 16;
    const p = new THREE.Mesh(new THREE.CircleGeometry(rand(0.8, 2), 6), patchMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = Math.random() * 3;
    p.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r);
    p.receiveShadow = true;
    group.add(p);
  }
  const tuftGeo = flat(new THREE.ConeGeometry(0.12, 0.45, 3));
  const tuftMat = toon(0x4fae3a);
  const flowerMats = [toon(0xff6b9d), toon(0xffe14d), toon(0xffffff), toon(0x7d5fff)];
  const flowerGeo = flat(new THREE.IcosahedronGeometry(0.1, 0));
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3.5 + Math.random() * 17.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tuft = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const t = new THREE.Mesh(tuftGeo, tuftMat);
      t.position.set(rand(-0.12, 0.12), 0.2, rand(-0.12, 0.12));
      t.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
      tuft.add(t);
    }
    if (i % 3 === 0) {
      const f = new THREE.Mesh(flowerGeo, flowerMats[i % 4]!);
      f.position.y = 0.45;
      tuft.add(f);
    }
    tuft.position.set(x, 0, z);
    group.add(tuft);
  }

  // fountain in the middle: step in and you get soaked
  const stone = toon(0xc9c3b6);
  const rim = new THREE.Mesh(flat(new THREE.TorusGeometry(FOUNTAIN_R + 0.15, 0.28, 4, 12)), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.22;
  rim.castShadow = true;
  rim.receiveShadow = true;
  outline(rim, 0.03);
  group.add(rim);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(FOUNTAIN_R, 12),
    toon(0x48b6f0, { transparent: true, opacity: 0.85 }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.32;
  group.add(pool);
  const pillar = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.3, 0.5, 1.7, 8)), stone);
  pillar.position.y = 0.85;
  pillar.castShadow = true;
  outline(pillar, 0.05);
  group.add(pillar);
  const bowl = new THREE.Mesh(flat(new THREE.CylinderGeometry(1, 0.35, 0.35, 8)), stone);
  bowl.position.y = 1.8;
  bowl.castShadow = true;
  outline(bowl, 0.05);
  group.add(bowl);
  const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(0.9, 8), toon(0x48b6f0));
  bowlWater.rotation.x = -Math.PI / 2;
  bowlWater.position.y = 1.96;
  group.add(bowlWater);
  // a stone duck statue spitting water on top
  const statue = buildDuck(false);
  statue.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !o.userData["outline"]) m.material = stone;
  });
  statue.scale.setScalar(0.7);
  statue.position.y = 1.95;
  group.add(statue);
  // and a real rubber duck bobbing in the pool
  const fountainDuck = buildDuck(false);
  fountainDuck.scale.setScalar(0.55);
  fountainDuck.position.set(1.3, 0.3, 0.9);
  fountainDuck.rotation.y = 2.2;
  group.add(fountainDuck);
  obstacles.push({ x: 0, z: 0, r: 0.65, pr: 0.9, h: 2.1 });

  // trees
  const trunkMat = toon(0x8a5a3b);
  const leafA = toon(0x3fa34d);
  const leafB = toon(0x5cc160);
  const treeSpots: [number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
    const r = i % 2 ? rand(9, 12) : rand(15, 19);
    treeSpots.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (const [x, z] of treeSpots) {
    const t = new THREE.Group();
    const s = rand(0.85, 1.2);
    const trunk = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.22, 0.34, 1.8, 6)), trunkMat);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    outline(trunk, 0.06);
    t.add(trunk);
    const c1 = new THREE.Mesh(flat(new THREE.IcosahedronGeometry(1.3, 0)), leafA);
    c1.position.y = 2.5;
    c1.castShadow = true;
    outline(c1, 0.04);
    t.add(c1);
    const c2 = new THREE.Mesh(flat(new THREE.IcosahedronGeometry(0.85, 0)), leafB);
    c2.position.set(0.4, 3.4, 0.2);
    c2.castShadow = true;
    outline(c2, 0.05);
    t.add(c2);
    t.scale.setScalar(s);
    t.rotation.y = Math.random() * 6;
    t.position.set(x, 0, z);
    group.add(t);
    obstacles.push({ x, z, r: 0.45 * s, pr: 1.25 * s, h: 3.9 * s });
  }

  // rocks
  const rockMat = toon(0x9ea7ad);
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(5, 19);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2.2)) continue;
    const s = rand(0.7, 1.2);
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const pos = geo.attributes["position"] as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      pos.setXYZ(
        k,
        pos.getX(k) * rand(0.85, 1.15),
        pos.getY(k) * rand(0.7, 1),
        pos.getZ(k) * rand(0.85, 1.15),
      );
    }
    const rock = new THREE.Mesh(flat(geo), rockMat);
    rock.scale.set(s, s * 0.75, s);
    rock.position.set(x, s * 0.35, z);
    rock.rotation.y = Math.random() * 6;
    rock.castShadow = true;
    rock.receiveShadow = true;
    outline(rock, 0.04);
    group.add(rock);
    obstacles.push({ x, z, r: 0.9 * s, pr: 0.95 * s, h: 1.1 * s });
  }

  // crates
  const crateMat = toon(0xd99a5b);
  const plankMat = toon(0xa86a35);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const r = rand(6, 8.5);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.8)) continue;
    const c = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
    box.position.y = 0.6;
    box.castShadow = true;
    box.receiveShadow = true;
    outline(box, 0.04);
    c.add(box);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.22, 1.22), plankMat);
      p.position.set(0.5 * sx, 0.6, 0);
      c.add(p);
    }
    const diag = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.14, 1.5), plankMat);
    diag.position.y = 0.6;
    diag.rotation.x = Math.PI / 4;
    c.add(diag);
    // "DANGER: HIGH VOLTAGE" style bolt stencil
    const stencil = new THREE.Mesh(
      boltShape(0.5, 0.25),
      new THREE.MeshBasicMaterial({ color: 0x1b1530 }),
    );
    stencil.position.set(0, 0.6, 0.6);
    c.add(stencil);
    c.position.set(x, 0, z);
    c.rotation.y = Math.random() * 6;
    group.add(c);
    obstacles.push({ x, z, r: 0.8, pr: 0.85, h: 1.25 });
  }

  // silly warning signs
  const signs: THREE.Group[] = [];
  const signTexts = ["⚡ NO SWIMMING", "WET FLOOR", "DUCK XING"];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.1;
    const r = 20;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.5)) continue;
    const s = new THREE.Group();
    const post = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 5)), trunkMat);
    post.position.y = 0.8;
    s.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.08), toon(0xffd32a));
    board.position.y = 1.5;
    outline(board, 0.04);
    s.add(board);
    const label = signSprite(signTexts[i]!);
    label.position.set(0, 1.5, 0.06);
    s.add(label);
    s.position.set(x, 0, z);
    s.rotation.y = -a + Math.PI / 2 + rand(-0.3, 0.3);
    s.userData["baseRot"] = s.rotation.y;
    group.add(s);
    signs.push(s);
    obstacles.push({ x, z, r: 0.25, pr: 0.6, h: 1.9 });
  }

  // palm trees on the beach
  const palmLeaf = toon(0x2fbf71);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.25;
    const r = 23;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const p = new THREE.Group();
    let y = 0;
    let lean = 0;
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.17, 0.22, 0.75, 5)), trunkMat);
      lean += 0.07;
      seg.position.set(lean * k * 0.6, y + 0.37, 0);
      seg.rotation.z = -lean;
      seg.castShadow = true;
      p.add(seg);
      y += 0.7;
    }
    const top = new THREE.Vector3(lean * 3, y, 0);
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(flat(new THREE.ConeGeometry(0.35, 1.9, 3)), palmLeaf);
      const la = (k / 6) * Math.PI * 2;
      leaf.position.copy(top).add(new THREE.Vector3(Math.cos(la) * 0.8, -0.15, Math.sin(la) * 0.8));
      leaf.rotation.set(0, -la, Math.PI / 2 + 0.35);
      leaf.scale.z = 0.3;
      leaf.castShadow = true;
      p.add(leaf);
    }
    p.position.set(x, -0.06, z);
    p.rotation.y = -a + Math.PI;
    group.add(p);
    obstacles.push({ x, z, r: 0.35, pr: 0.35, h: 3.5 });
  }

  // ocean
  const oceanGeo = new THREE.PlaneGeometry(300, 300, 64, 64);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(
    oceanGeo,
    new THREE.MeshLambertMaterial({ color: 0x2ea4dc, flatShading: true }),
  );
  ocean.position.y = -0.5;
  ocean.receiveShadow = true;
  group.add(ocean);
  const oceanBase = new Float32Array(
    (oceanGeo.attributes["position"] as THREE.BufferAttribute).array,
  );
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(SAND_R + 0.6, SAND_R + 1.4, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = -0.38;
  foam.name = "foam";
  group.add(foam);

  // clouds (kept well above the camera, which sits ~17 units up)
  const cloudMat = toon(0xffffff);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const c = buildCloud(cloudMat, 3 + Math.floor(Math.random() * 3));
    const a = Math.random() * Math.PI * 2;
    const r = rand(10, 40);
    c.position.set(Math.cos(a) * r, rand(27, 34), Math.sin(a) * r);
    c.scale.setScalar(rand(1.6, 2.6));
    c.userData["speed"] = rand(0.4, 1);
    group.add(c);
    clouds.push(c);
  }

  return {
    group,
    obstacles,
    ocean,
    oceanBase,
    clouds,
    cloudMat,
    fountainSpout: new THREE.Vector3(0, 2.0, 0),
    fountainDuck,
    signs,
  };
}

function signSprite(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.font = '900 34px "Arial Black", Impact, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1b1530";
  ctx.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.52),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  return m;
}

export function buildCloud(mat: THREE.Material, puffs: number) {
  const c = new THREE.Group();
  for (let k = 0; k < puffs; k++) {
    const p = new THREE.Mesh(flat(new THREE.IcosahedronGeometry(rand(0.8, 1.3), 0)), mat);
    p.position.set(k * 1.1 - puffs * 0.5, rand(-0.2, 0.4), rand(-0.4, 0.4));
    c.add(p);
  }
  return c;
}
