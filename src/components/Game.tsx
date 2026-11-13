import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Engine,
  HudState,
  NetAction,
  NetDeploy,
  NetEffect,
  NetPlayerState,
  NetStorm,
  PlayerSetup,
} from "@/game/engine";
import { WEAPONS } from "@/game/engine";
import { WEAPON_KINDS, type HatKind, type WeaponKind } from "@/game/models";
import {
  MAX_ROOM_PLAYERS,
  RoomSession,
  cleanRoomCode,
  makeRoomCode,
  roomCodeFromUrl,
  roomShareUrl,
  type MatchStart,
} from "@/game/room";

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

type Screen = "menu" | "lobby" | "play";

export default function Game() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [name, setName] = useState("You");
  const [color, setColor] = useState(COLORS[0]!);
  const [hat, setHat] = useState<HatKind>("party");
  const [bots, setBots] = useState(5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [muted, setMuted] = useState(false);
  const [joinCode, setJoinCode] = useState(roomCodeFromUrl);
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [roster, setRoster] = useState<RoomSession["players"]>([]);
  const [match, setMatch] = useState<MatchStart | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState("IDLE");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const roomRef = useRef<RoomSession | null>(null);
  const feedId = useRef(0);

  const pushFeed = useCallback((msg: string, color = "#fff") => {
    const id = ++feedId.current;
    setFeed((f) => [...f.slice(-5), { id, msg, color }]);
    window.setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 6000);
  }, []);

  const beginMatch = useCallback((nextMatch: MatchStart) => {
    setMatch(nextMatch);
    setHud(null);
    setFeed([]);
    setScreen("play");
  }, []);

  const handleGameMessage = useCallback(
    (session: RoomSession, event: string, data: unknown, from: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (event === "state") {
        const state = data as NetPlayerState;
        if (state.id === from) engine.applyNetworkState(state);
      } else if (event === "action") {
        engine.playNetworkAction(from, data as NetAction);
      } else if (event === "deploy") {
        engine.applyNetworkDeploy(from, data as NetDeploy);
      } else if (event === "effect") {
        engine.applyNetworkEffect(data as NetEffect);
      } else if (event === "ko") {
        engine.creditNetworkKo((data as { byId: string }).byId);
      } else if (event === "storm" && session.players[0]?.id === from) {
        engine.applyNetworkStorm(data as NetStorm);
      }
    },
    [],
  );

  const openRoom = async (code: string) => {
    const cleaned = cleanRoomCode(code);
    if (cleaned.length !== 6) {
      setError("Enter the six-character room code from your invite.");
      return;
    }
    if (connecting) return;
    setError("");
    setConnecting(true);
    const session = new RoomSession(
      cleaned,
      {
        name: name.trim() || "You",
        color,
        hat,
        hatColor: COLORS[(COLORS.indexOf(color) + 3) % COLORS.length]!,
      },
      {
        onRoster: (players) => {
          setRoster(players);
          engineRef.current?.setRoster(players);
        },
        onMatch: (nextMatch) => {
          if (roomRef.current === session) beginMatch(nextMatch);
        },
        onGame: (event, data, from) => handleGameMessage(session, event, data, from),
        onStatus: setConnection,
        onError: (message) => {
          if (roomRef.current !== session) return;
          roomRef.current = null;
          setRoom(null);
          setRoster([]);
          setError(message);
          setScreen("menu");
        },
      },
    );
    roomRef.current = session;
    setRoom(session);
    setRoster([]);
    setMatch(null);
    setScreen("lobby");
    const url = new URL(window.location.href);
    url.searchParams.set("room", cleaned);
    window.history.replaceState(null, "", url);
    try {
      await session.connect();
    } catch (connectError) {
      if (roomRef.current === session) {
        session.leave();
        roomRef.current = null;
        setRoom(null);
        setError(connectError instanceof Error ? connectError.message : "Could not open the room.");
        setScreen("menu");
      }
    } finally {
      setConnecting(false);
    }
  };

  const leaveRoom = useCallback(() => {
    roomRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setRoster([]);
    setMatch(null);
    setHud(null);
    setConnection("IDLE");
    setScreen("menu");
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => () => roomRef.current?.leave(), []);

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
      const session = roomRef.current;
      engine = new Engine(
        canvasRef.current,
        setup,
        session ? 0 : bots,
        { onHud: setHud, onFeed: pushFeed },
        session
          ? {
              playerId: session.playerId,
              players: session.players,
              send: (event, data) => session.sendGame(event, data),
              isCoordinator: () => session.isCoordinator,
              elapsed: match ? Math.max(0, (Date.now() - match.startedAt) / 1000) : 0,
            }
          : null,
      );
      engine.audio.setMuted(muted);
      engineRef.current = engine;
      engine.start();
    });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
    // Player setup and room identity are fixed for one match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, match?.matchId]);

  const toggleMute = () => {
    setMuted((m) => {
      engineRef.current?.audio.setMuted(!m);
      return !m;
    });
  };

  const startOnlineMatch = () => {
    const nextMatch = roomRef.current?.startMatch();
    if (nextMatch) beginMatch(nextMatch);
  };

  const copyInvite = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(roomShareUrl(room.code));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (screen === "lobby" && room) {
    const isHost = roster[0]?.id === room.playerId;
    return (
      <div className="menu">
        <div className="menu-card lobby-card">
          <p className="lobby-kicker">PRIVATE LOBBY</p>
          <h2 className="lobby-title">Your storm crew</h2>
          <p className="lobby-subtitle">Share this invite with up to seven friends.</p>
          <div className="room-code" aria-label={`Room code ${room.code}`}>
            {room.code}
          </div>
          <div className="invite-actions">
            <button className="chip" onClick={copyInvite}>
              {copied ? "✓ Invite copied" : "🔗 Copy invite link"}
            </button>
            <button
              className="chip"
              onClick={async () => {
                await navigator.clipboard.writeText(room.code);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }}
            >
              Copy code
            </button>
          </div>
          <div className="lobby-roster">
            <div className="lobby-roster-title">
              PLAYERS <span>{roster.length}/{MAX_ROOM_PLAYERS}</span>
            </div>
            {roster.length === 0 && <p className="waiting">Connecting to the room…</p>}
            {roster.map((player, index) => (
              <div className="lobby-player" key={player.id}>
                <span className="player-dot" style={{ background: hex(player.color) }} />
                <b>{player.name}{player.id === room.playerId ? " (you)" : ""}</b>
                {index === 0 && <span className="host-badge">HOST</span>}
              </div>
            ))}
          </div>
          {isHost ? (
            <button className="play" disabled={connecting || roster.length < 2} onClick={startOnlineMatch}>
              {roster.length < 2 ? "WAITING FOR PLAYERS…" : "START MATCH ⚡"}
            </button>
          ) : (
            <p className="waiting host-waiting">The host will start the match.</p>
          )}
          <button className="text-button" onClick={leaveRoom}>Leave room</button>
          <p className="lobby-note">Online matches are player-vs-player. Bots stay in solo mode.</p>
        </div>
      </div>
    );
  }

  if (screen === "menu") {
    return (
      <div className="menu">
        <div className="menu-card main-menu-card">
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
                <button key={n} className={"chip" + (n === bots ? " on" : "")} onClick={() => setBots(n)}>
                  {n}
                </button>
              ))}
              <span className="solo-label">solo only</span>
            </div>
          </div>
          {error && <div className="menu-error" role="alert">{error}</div>}
          <button className="play" onClick={() => { setMatch(null); setScreen("play"); }}>
            PLAY SOLO ⚡
          </button>
          <div className="multiplayer-section">
            <div className="section-divider"><span>PRIVATE MULTIPLAYER</span></div>
            <button className="create-room" onClick={() => void openRoom(makeRoomCode())} disabled={connecting}>
              ⚡ Create a private room
            </button>
            <form
              className="join-form"
              onSubmit={(event) => {
                event.preventDefault();
                void openRoom(joinCode);
              }}
            >
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(cleanRoomCode(event.target.value))}
                placeholder="ROOM CODE"
                aria-label="Room code"
                maxLength={6}
                autoCapitalize="characters"
              />
              <button type="submit" disabled={connecting || joinCode.length !== 6}>JOIN</button>
            </form>
          </div>
          <details className="how">
            <summary>How to play</summary>
            <ul>
              <li>
                Getting people <b>wet</b> or sticking <b>🔩 lightning rods</b> on them raises their{" "}
                <b>⚡ conductance</b>, which everyone can see above heads.
              </li>
              <li>Every ~20s a <b>storm</b> strikes whoever has the <b>highest conductance</b>.</li>
              <li>Electric weapons do damage scaled by how conductive the target is.</li>
              <li>Hold <b>R</b> to shake yourself dry and fling rods off. Avoid the fountain.</li>
            </ul>
            <div className="arsenal">
              {WEAPON_KINDS.map((k) => (
                <div key={k} className="arsenal-item">
                  <span className="wicon">{WEAPON_ICONS[k]}</span>
                  <span><b>{WEAPONS[k].key} · {WEAPONS[k].label}</b><br />{WEAPONS[k].blurb}</span>
                </div>
              ))}
            </div>
            <p className="keys">
              <kbd>WASD</kbd> move · <kbd>Mouse</kbd> aim · <kbd>Click</kbd> use/hold ·{" "}
              <kbd>1-0</kbd>/<kbd>scroll</kbd> weapons · <kbd>Space</kbd> dash · <kbd>R</kbd> shake · <kbd>M</kbd> mute
            </p>
          </details>
        </div>
      </div>
    );
  }

  const you = hud?.you ?? null;
  const sorted = hud ? [...hud.players].sort((a, b) => b.cond - a.cond) : [];
  const storm = hud?.storm;
  const over = hud?.phase === "over";
  const isHost = room?.isCoordinator ?? false;

  return (
    <div className="game">
      <canvas ref={canvasRef} />
      {hud && hud.flash > 0 && <div className="flash" style={{ opacity: hud.flash * 0.85 }} />}
      {hud && storm?.countdown && <div className="vignette" />}

      <div className="board">
        <div className="board-title">
          ⚡ CONDUCTANCE
          {room && <span className="board-room">{room.code} · {connection === "SUBSCRIBED" ? "ONLINE" : "RECONNECTING"}</span>}
        </div>
        {sorted.map((p, i) => (
          <div key={p.id} className={"brow" + (p.isHuman ? " you" : "") + (!p.alive ? " dead" : "")}>
            <span className="rank">{i === 0 && p.cond > 0 ? "⚡" : i + 1}</span>
            <span className="pname" style={{ color: p.color }}>{p.name}</span>
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

      <div className="top">
        <div className={"storm" + (storm?.countdown ? " soon" : "")}>
          {storm?.countdown ? (
            <>
              <div className="storm-big">⛈️ {Math.max(0, Math.ceil(storm.timeLeft))}</div>
              <div className="storm-sub">striking <b>{storm.target ?? "???"}</b></div>
            </>
          ) : (
            <>
              <div className="storm-sub">next storm</div>
              <div className="storm-mid">{Math.max(0, Math.ceil(storm?.timeLeft ?? 0))}s</div>
            </>
          )}
        </div>
        <div className="clock">
          {Math.floor((hud?.timeLeft ?? 0) / 60)}:{String(Math.max(0, Math.floor((hud?.timeLeft ?? 0) % 60))).padStart(2, "0")}
        </div>
        <button className="mute" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>{muted ? "🔇" : "🔊"}</button>
        {room && <button className="leave-game" onClick={leaveRoom}>LEAVE</button>}
      </div>

      <div className="feed">
        {feed.map((f) => <div key={f.id} className="feed-line" style={{ color: f.color }}>{f.msg}</div>)}
      </div>

      {you && hud && (
        <div className="bottom">
          <div className="you-stats">
            <div className="stat"><span>❤️</span><span className="mini"><span className="fill hp" style={{ width: `${you.hp}%` }} /></span><span>{Math.round(you.hp)}</span></div>
            <div className="stat"><span>💧</span><span className="mini"><span className="fill wet" style={{ width: `${you.wet}%` }} /></span><span>{Math.round(you.wet)}</span></div>
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
                  onClick={() => engineRef.current?.player.setWeapon(k)}
                >
                  <span className="wicon">{WEAPON_ICONS[k]}</span>
                  <span className="wkey">{WEAPONS[k].key}</span>
                  <span className="wname">{WEAPONS[k].label}</span>
                  {cd > 0 && max > 0 && <span className="cd" style={{ height: `${(cd / max) * 100}%` }} />}
                </button>
              );
            })}
          </div>
          <div className="wblurb">{WEAPON_ICONS[hud.weapon]} <b>{WEAPONS[hud.weapon].label}</b> — {WEAPONS[hud.weapon].blurb}</div>
        </div>
      )}

      {over && hud && (
        <div className="overlay">
          <div className="menu-card results">
            <h2>{hud.winner === you?.name ? "🏆 YOU WIN!" : `🏆 ${hud.winner} wins!`}</h2>
            <table>
              <thead><tr><th>Player</th><th>KOs</th><th>Fried</th></tr></thead>
              <tbody>
                {[...hud.players].sort((a, b) => b.kos - a.kos || a.deaths - b.deaths).map((p) => (
                  <tr key={p.id} style={{ color: p.color }}><td>{p.name}</td><td>{p.kos}</td><td>{p.deaths}</td></tr>
                ))}
              </tbody>
            </table>
            {room ? (
              isHost ? <button className="play" onClick={startOnlineMatch}>START REMATCH ⚡</button> : <p className="waiting">Waiting for the host to start a rematch…</p>
            ) : (
              <button className="play" onClick={() => setScreen("menu")}>PLAY AGAIN</button>
            )}
            {room && <button className="text-button" onClick={leaveRoom}>Leave room</button>}
          </div>
        </div>
      )}
    </div>
  );
}
