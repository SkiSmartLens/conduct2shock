import { useCallback, useEffect, useRef, useState } from "react";
import type { Engine, HudState, PlayerSetup } from "@/game/engine";
import { WEAPONS } from "@/game/engine";
import { WEAPON_KINDS, type HatKind, type WeaponKind } from "@/game/models";

const HATS: { kind: HatKind; label: string }[] = [
  { kind: "party", label: "🎉 Party" },
  { kind: "top", label: "🎩 Top Hat" },
  { kind: "propeller", label: "🚁 Propeller" },
  { kind: "cowboy", label: "🤠 Cowboy" },
  { kind: "viking", label: "🪖 Viking" },
  { kind: "chef", label: "👨‍🍳 Chef" },
  { kind: "crown", label: "👑 Crown" },
  { kind: "beanie", label: "🧢 Beanie" },
];
const COLORS = [0x4fd1ff, 0xff6b6b, 0xfeca57, 0x1dd1a1, 0xff9ff3, 0xff9f43, 0x7d5fff, 0xc8d6e5];
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const WEAPON_ICONS: Record<WeaponKind, string> = {
  balloon: "🎈",
  rod: "🔩",
  taser: "🔫",
  eel: "🐍",
  soaker: "💦",
  bucket: "🪣",
  cloud: "🌩️",
  duck: "🦆",
  umbrella: "☂️",
  sprinkler: "🚿",
};

interface Feed {
  id: number;
  msg: string;
  color: string;
}

export default function Game() {
  const [screen, setScreen] = useState<"menu" | "play">("menu");
  const [name, setName] = useState("You");
  const [color, setColor] = useState(COLORS[0]!);
  const [hat, setHat] = useState<HatKind>("party");
  const [bots, setBots] = useState(5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const feedId = useRef(0);

  const pushFeed = useCallback((msg: string, color = "#fff") => {
    const id = ++feedId.current;
    setFeed((f) => [...f.slice(-5), { id, msg, color }]);
    window.setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 6000);
  }, []);

  useEffect(() => {
    if (screen !== "play" || !canvasRef.current) return;
    let engine: Engine | null = null;
    let cancelled = false;
    const setup: PlayerSetup = {
      name: name.trim() || "You",
      color,
      hat,
      hatColor: COLORS[(COLORS.indexOf(color) + 3) % COLORS.length]!,
    };
    void import("@/game/engine").then(({ Engine }) => {
      if (cancelled || !canvasRef.current) return;
      engine = new Engine(canvasRef.current, setup, bots, { onHud: setHud, onFeed: pushFeed });
      engine.audio.setMuted(muted);
      engineRef.current = engine;
      engine.start();
    });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const toggleMute = () => {
    setMuted((m) => {
      engineRef.current?.audio.setMuted(!m);
      return !m;
    });
  };

  if (screen === "menu") {
    return (
      <div className="menu">
        <div className="menu-card">
          <h1 className="title">
            <span className="title-zap">⚡</span> Conduct<span className="title-two">2</span>Shock
          </h1>
          <p className="tagline">Get everyone wet. Stay dry. Wait for the storm.</p>
          <div className="row">
            <label>Name</label>
            <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row">
            <label>Color</label>
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={"swatch" + (c === color ? " on" : "")}
                  style={{ background: hex(c) }}
                  onClick={() => setColor(c)}
                  aria-label={hex(c)}
                />
              ))}
            </div>
          </div>
          <div className="row">
            <label>Hat</label>
            <div className="hats">
              {HATS.map((h) => (
                <button
                  key={h.kind}
                  className={"chip" + (h.kind === hat ? " on" : "")}
                  onClick={() => setHat(h.kind)}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <label>Bots</label>
            <div className="hats">
              {[2, 3, 5, 7].map((n) => (
                <button
                  key={n}
                  className={"chip" + (n === bots ? " on" : "")}
                  onClick={() => setBots(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button className="play" onClick={() => setScreen("play")}>
            PLAY ⚡
          </button>
          <div className="how">
            <h3>How it works</h3>
            <ul>
              <li>
                Getting people <b>wet</b> or sticking <b>🔩 lightning rods</b> on them raises their{" "}
                <b>⚡ conductance</b>, which everyone can see above heads.
              </li>
              <li>
                Every ~20s a <b>storm</b> strikes whoever has the <b>highest conductance</b>. It
                hurts a lot.
              </li>
              <li>
                Electric weapons (<b>🔫 taser</b>, <b>🐍 eel</b>, <b>🌩️ pocket storm</b>) do damage
                scaled by how conductive the target is. Dry targets barely feel it.
              </li>
              <li>
                Hold <b>R</b> to shake yourself dry like a wet dog (and fling rods off). Don't step
                in the fountain.
              </li>
            </ul>
            <div className="arsenal">
              {WEAPON_KINDS.map((k) => (
                <div key={k} className="arsenal-item">
                  <span className="wicon">{WEAPON_ICONS[k]}</span>
                  <span>
                    <b>
                      {WEAPONS[k].key} · {WEAPONS[k].label}
                    </b>
                    <br />
                    {WEAPONS[k].blurb}
                  </span>
                </div>
              ))}
            </div>
            <p className="keys">
              <kbd>WASD</kbd> move · <kbd>Mouse</kbd> aim · <kbd>Click</kbd> use/hold ·{" "}
              <kbd>1-0</kbd>/<kbd>scroll</kbd> weapons · <kbd>Space</kbd> dash · <kbd>R</kbd> shake
              · <kbd>M</kbd> mute
            </p>
          </div>
        </div>
      </div>
    );
  }

  const you = hud?.you ?? null;
  const sorted = hud ? [...hud.players].sort((a, b) => b.cond - a.cond) : [];
  const storm = hud?.storm;
  const over = hud?.phase === "over";

  return (
    <div className="game">
      <canvas ref={canvasRef} />
      {hud && hud.flash > 0 && <div className="flash" style={{ opacity: hud.flash * 0.85 }} />}
      {hud && storm?.countdown && <div className="vignette" />}

      {/* conductance board */}
      <div className="board">
        <div className="board-title">⚡ CONDUCTANCE</div>
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className={"brow" + (p.isHuman ? " you" : "") + (!p.alive ? " dead" : "")}
          >
            <span className="rank">{i === 0 && p.cond > 0 ? "⚡" : i + 1}</span>
            <span className="pname" style={{ color: p.color }}>
              {p.name}
            </span>
            <span className="bar">
              <span className="fill cond" style={{ width: `${p.cond}%` }} />
              <span className="fill hp" style={{ width: `${p.hp}%` }} />
            </span>
            <span className="pct">{p.cond}%</span>
            <span className="rods">{"🔩".repeat(p.rods)}</span>
            <span className="kos">{p.kos} KO</span>
          </div>
        ))}
      </div>

      {/* storm + clock */}
      <div className="top">
        <div className={"storm" + (storm?.countdown ? " soon" : "")}>
          {storm?.countdown ? (
            <>
              <div className="storm-big">⛈️ {Math.max(0, Math.ceil(storm.timeLeft))}</div>
              <div className="storm-sub">
                striking <b>{storm.target ?? "???"}</b>
              </div>
            </>
          ) : (
            <>
              <div className="storm-sub">next storm</div>
              <div className="storm-mid">{Math.max(0, Math.ceil(storm?.timeLeft ?? 0))}s</div>
            </>
          )}
        </div>
        <div className="clock">
          {Math.floor((hud?.timeLeft ?? 0) / 60)}:
          {String(Math.max(0, Math.floor((hud?.timeLeft ?? 0) % 60))).padStart(2, "0")}
        </div>
        <button className="mute" onClick={toggleMute}>
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* feed */}
      <div className="feed">
        {feed.map((f) => (
          <div key={f.id} className="feed-line" style={{ color: f.color }}>
            {f.msg}
          </div>
        ))}
      </div>

      {/* you */}
      {you && hud && (
        <div className="bottom">
          <div className="you-stats">
            <div className="stat">
              <span>❤️</span>
              <span className="mini">
                <span className="fill hp" style={{ width: `${you.hp}%` }} />
              </span>
              <span>{Math.round(you.hp)}</span>
            </div>
            <div className="stat">
              <span>💧</span>
              <span className="mini">
                <span className="fill wet" style={{ width: `${you.wet}%` }} />
              </span>
              <span>{Math.round(you.wet)}</span>
            </div>
            <div className="stat big">
              <span>⚡ {you.cond}%</span>
              {hud.shaking && <span className="shake">shaking it off!</span>}
              {hud.umbrella && <span className="shake warn">☂️ metal! +30%</span>}
              {!you.alive && <span className="shake">💀 respawning…</span>}
            </div>
          </div>
          <div className="weapons">
            {WEAPON_KINDS.map((k) => {
              const cd = hud.cooldowns[k];
              const max = WEAPONS[k].cooldown;
              return (
                <button
                  key={k}
                  className={"weapon" + (hud.weapon === k ? " on" : "")}
                  title={`${WEAPONS[k].label}: ${WEAPONS[k].blurb}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const eng = engineRef.current;
                    if (eng) eng.player.setWeapon(k);
                  }}
                >
                  <span className="wicon">{WEAPON_ICONS[k]}</span>
                  <span className="wkey">{WEAPONS[k].key}</span>
                  <span className="wname">{WEAPONS[k].label}</span>
                  {cd > 0 && max > 0 && (
                    <span className="cd" style={{ height: `${(cd / max) * 100}%` }} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="wblurb">
            {WEAPON_ICONS[hud.weapon]} <b>{WEAPONS[hud.weapon].label}</b> —{" "}
            {WEAPONS[hud.weapon].blurb}
          </div>
        </div>
      )}

      {over && hud && (
        <div className="overlay">
          <div className="menu-card results">
            <h2>{hud.winner === you?.name ? "🏆 YOU WIN!" : `🏆 ${hud.winner} wins!`}</h2>
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>KOs</th>
                  <th>Fried</th>
                </tr>
              </thead>
              <tbody>
                {[...hud.players]
                  .sort((a, b) => b.kos - a.kos || a.deaths - b.deaths)
                  .map((p) => (
                    <tr key={p.id} style={{ color: p.color }}>
                      <td>{p.name}</td>
                      <td>{p.kos}</td>
                      <td>{p.deaths}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <button className="play" onClick={() => setScreen("menu")}>
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
