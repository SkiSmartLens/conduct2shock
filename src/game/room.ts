import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { HatKind } from "@/game/models";

export const MAX_ROOM_PLAYERS = 8;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface RoomProfile {
  id: string;
  name: string;
  color: number;
  hat: HatKind;
  hatColor: number;
  joinedAt: number;
  phase: "lobby" | "play";
}

export interface MatchStart {
  matchId: string;
  seed: number;
  startedAt: number;
}

interface GameMessage {
  from: string;
  event: string;
  data: unknown;
}

interface RoomCallbacks {
  onRoster: (players: RoomProfile[]) => void;
  onMatch: (match: MatchStart) => void;
  onGame: (event: string, data: unknown, from: string) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}

export function makeRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function cleanRoomCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function roomCodeFromUrl(): string {
  if (typeof window === "undefined") return "";
  return cleanRoomCode(new URL(window.location.href).searchParams.get("room") ?? "");
}

export function roomShareUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", cleanRoomCode(code));
  return url.toString();
}

export class RoomSession {
  readonly code: string;
  readonly playerId = crypto.randomUUID();
  profile: RoomProfile;
  players: RoomProfile[] = [];
  match: MatchStart | null = null;
  private channel: RealtimeChannel | null = null;
  private callbacks: RoomCallbacks;
  private knownPlayerIds = new Set<string>();
  private closed = false;

  constructor(code: string, profile: Omit<RoomProfile, "id" | "joinedAt" | "phase">, callbacks: RoomCallbacks) {
    this.code = cleanRoomCode(code);
    this.profile = {
      ...profile,
      id: this.playerId,
      joinedAt: Date.now(),
      phase: "lobby",
    };
    this.callbacks = callbacks;
  }

  get isCoordinator(): boolean {
    return this.players[0]?.id === this.playerId;
  }

  connect(): Promise<void> {
    this.closed = false;
    const channel = supabase.channel(`conduct2shock:${this.code}`, {
      config: { broadcast: { self: false }, presence: { key: this.playerId } },
    });
    this.channel = channel;

    channel
      .on("presence", { event: "sync" }, () => this.syncPresence())
      .on("broadcast", { event: "start" }, ({ payload }) => {
        const match = payload as MatchStart;
        if (!match?.matchId || this.match?.matchId === match.matchId) return;
        this.match = match;
        this.setPhase("play");
        this.callbacks.onMatch(match);
      })
      .on("broadcast", { event: "game" }, ({ payload }) => {
        const message = payload as GameMessage;
        if (!message?.event || message.from === this.playerId) return;
        this.callbacks.onGame(message.event, message.data, message.from);
      });

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("The room took too long to connect. Check your connection and try again."));
      }, 12000);

      channel.subscribe((status) => {
        this.callbacks.onStatus(status);
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timeout);
          void channel.track(this.profile);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          window.clearTimeout(timeout);
          if (!this.closed) reject(new Error("Could not connect to that room. Please try again."));
        }
      });
    });
  }

  startMatch(): MatchStart | null {
    if (!this.isCoordinator || this.players.length < 2) return null;
    const match: MatchStart = {
      matchId: crypto.randomUUID(),
      seed: Math.floor(Math.random() * 2_147_483_647),
      startedAt: Date.now(),
    };
    this.match = match;
    this.setPhase("play");
    void this.channel?.send({ type: "broadcast", event: "start", payload: match });
    return match;
  }

  sendGame(event: string, data: unknown): void {
    if (this.closed || !this.channel) return;
    const payload: GameMessage = { from: this.playerId, event, data };
    void this.channel.send({ type: "broadcast", event: "game", payload });
  }

  leave(): void {
    if (this.closed) return;
    this.closed = true;
    const channel = this.channel;
    this.channel = null;
    this.players = [];
    this.knownPlayerIds.clear();
    if (channel) {
      void channel.untrack();
      void supabase.removeChannel(channel);
    }
  }

  private setPhase(phase: "lobby" | "play"): void {
    if (this.profile.phase === phase) return;
    this.profile = { ...this.profile, phase };
    void this.channel?.track(this.profile);
  }

  private syncPresence(): void {
    const channel = this.channel;
    if (!channel || this.closed) return;
    const states = channel.presenceState<RoomProfile>();
    const players = Object.entries(states)
      .map(([id, metas]) => {
        const meta = metas[0] as Partial<RoomProfile> | undefined;
        return meta ? ({ ...meta, id } as RoomProfile) : null;
      })
      .filter((player): player is RoomProfile => Boolean(player?.name))
      .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

    if (players.length > MAX_ROOM_PLAYERS && !players.slice(0, MAX_ROOM_PLAYERS).some((p) => p.id === this.playerId)) {
      this.callbacks.onError("That room is full. Rooms support up to eight players.");
      this.leave();
      return;
    }

    const previous = this.knownPlayerIds;
    this.knownPlayerIds = new Set(players.map((player) => player.id));
    this.players = players;
    this.callbacks.onRoster(players);

    // A late joiner receives the current match from any player already inside it.
    if (this.match && [...this.knownPlayerIds].some((id) => !previous.has(id))) {
      void channel.send({ type: "broadcast", event: "start", payload: this.match });
    }
  }
}
