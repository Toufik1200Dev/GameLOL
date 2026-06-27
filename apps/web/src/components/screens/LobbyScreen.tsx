'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  HARD_MAX_PLAYERS,
  TEAMS,
  type LobbyState,
  type PlayerPublic,
  type TeamId,
} from '@game/shared';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useUIStore } from '../../stores/uiStore';
import { Button, Panel, Slider, Toggle } from '../ui/primitives';

const TEAM_LABEL: Record<TeamId, string> = { red: 'Red Team', blue: 'Blue Team' };
const TEAM_ACCENT: Record<TeamId, string> = {
  red: 'text-team-red border-team-red/40',
  blue: 'text-team-blue border-team-blue/40',
};
const TEAM_DOT: Record<TeamId, string> = { red: 'bg-team-red', blue: 'bg-team-blue' };

function pingColor(ping: number): string {
  if (ping <= 0) return 'text-white/30';
  if (ping < 80) return 'text-success';
  if (ping < 150) return 'text-warning';
  return 'text-danger';
}

function PlayerRow({
  player,
  isSelf,
  canKick,
  onKick,
}: {
  player: PlayerPublic;
  isSelf: boolean;
  canKick: boolean;
  onKick: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="bg-bg-elevated/60 group flex items-center gap-3 rounded-lg px-3 py-2"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${TEAM_DOT[player.team]}`} />
      <span className="flex-1 truncate text-sm font-medium text-white/90">
        {player.name}
        {player.isHost && <span className="text-warning ml-1.5 text-xs">★ host</span>}
        {isSelf && <span className="ml-1.5 text-xs text-white/40">(you)</span>}
      </span>
      <span className={`w-12 text-right text-xs tabular-nums ${pingColor(player.ping)}`}>
        {player.ping > 0 ? `${player.ping}ms` : '—'}
      </span>
      <span
        className={`w-14 text-right text-xs font-semibold ${player.ready ? 'text-success' : 'text-white/30'}`}
      >
        {player.ready ? 'READY' : 'idle'}
      </span>
      {canKick && !player.isHost && (
        <button
          onClick={onKick}
          className="text-danger/60 hover:text-danger text-xs opacity-0 transition-opacity group-hover:opacity-100"
          title="Kick player"
        >
          ✕
        </button>
      )}
    </motion.div>
  );
}

function TeamColumn({
  team,
  lobby,
  selfId,
  isHost,
  onKick,
}: {
  team: TeamId;
  lobby: LobbyState;
  selfId: string | null;
  isHost: boolean;
  onKick: (id: string) => void;
}) {
  const players = lobby.players.filter((p) => p.team === team);
  return (
    <Panel className={`flex flex-1 flex-col gap-2 border-t-2 p-4 ${TEAM_ACCENT[team]}`}>
      <div className="flex items-center justify-between px-1">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide">
          {TEAM_LABEL[team]}
        </h3>
        <span className="text-xs text-white/40">{players.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <AnimatePresence mode="popLayout">
          {players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              isSelf={p.id === selfId}
              canKick={isHost}
              onKick={() => onKick(p.id)}
            />
          ))}
        </AnimatePresence>
        {players.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-white/25">No players</p>
        )}
      </div>
    </Panel>
  );
}

function HostSettings({ lobby }: { lobby: LobbyState }) {
  const updateSettings = useLobbyStore((s) => s.updateSettings);
  const { settings } = lobby;
  return (
    <Panel className="flex flex-col gap-4 p-5">
      <h3 className="font-display text-accent text-sm uppercase tracking-wide">Match Settings</h3>
      <Slider
        label="Max Players"
        value={settings.maxPlayers}
        min={2}
        max={HARD_MAX_PLAYERS}
        step={1}
        onChange={(v) => updateSettings({ maxPlayers: v })}
        format={(v) => `${v}`}
      />
      <Slider
        label="Match Duration"
        value={settings.matchDurationSec}
        min={60}
        max={1800}
        step={30}
        onChange={(v) => updateSettings({ matchDurationSec: v })}
        format={(v) => `${Math.round(v / 60)} min`}
      />
      <Slider
        label="Score Limit"
        value={settings.scoreLimit}
        min={5}
        max={200}
        step={5}
        onChange={(v) => updateSettings({ scoreLimit: v })}
        format={(v) => `${v}`}
      />
      <div className="flex items-center justify-between">
        <Toggle
          checked={settings.friendlyFire}
          onChange={(v) => updateSettings({ friendlyFire: v })}
          label="Friendly Fire"
        />
        <Toggle
          checked={settings.autoBalance}
          onChange={(v) => updateSettings({ autoBalance: v })}
          label="Auto-balance"
        />
      </div>
    </Panel>
  );
}

export function LobbyScreen() {
  const lobby = useLobbyStore((s) => s.lobby);
  const playerId = useLobbyStore((s) => s.playerId);
  const isHost = useLobbyStore((s) => s.isHost());
  const { leaveLobby, closeLobby, startGame, setReady, selectTeam, kick } = useLobbyStore.getState();
  const pushToast = useUIStore((s) => s.pushToast);
  const [showSettings, setShowSettings] = useState(false);

  if (!lobby) return null;

  const self = lobby.players.find((p) => p.id === playerId) ?? null;
  const canStart =
    lobby.players.length >= 1 && lobby.players.every((p) => p.isHost || p.ready);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      pushToast('Lobby code copied!', 'success');
    } catch {
      pushToast(`Code: ${lobby.code}`, 'info');
    }
  };

  return (
    <div className="menu-grid-bg h-full w-full overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">Lobby Code</p>
            <button
              onClick={copyCode}
              className="font-display text-accent flex items-center gap-2 text-5xl font-bold tracking-[0.15em] transition-opacity hover:opacity-80"
              title="Click to copy"
            >
              {lobby.code}
              <span className="text-base text-white/30">⧉</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/50">
              {lobby.players.length}/{lobby.settings.maxPlayers} players
            </span>
            <Button variant="ghost" onClick={leaveLobby}>
              Leave
            </Button>
          </div>
        </div>

        {/* Teams */}
        <div className="flex flex-col gap-4 sm:flex-row">
          {TEAMS.map((team) => (
            <TeamColumn
              key={team}
              team={team}
              lobby={lobby}
              selfId={playerId}
              isHost={isHost}
              onKick={kick}
            />
          ))}
        </div>

        {/* Self controls */}
        {self && (
          <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-white/40">Your Team</span>
              <div className="flex gap-2">
                {TEAMS.map((team) => (
                  <Button
                    key={team}
                    size="sm"
                    variant={self.team === team ? 'primary' : 'secondary'}
                    onClick={() => selectTeam(team)}
                  >
                    {team === 'red' ? 'Red' : 'Blue'}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              variant={self.ready ? 'secondary' : 'primary'}
              onClick={() => setReady(!self.ready)}
            >
              {self.ready ? '✓ Ready' : 'Mark Ready'}
            </Button>
          </Panel>
        )}

        {/* Host controls */}
        {isHost ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" disabled={!canStart} onClick={startGame} className="flex-1">
                {canStart ? 'Start Game' : 'Waiting for players to ready up…'}
              </Button>
              <Button variant="secondary" onClick={() => setShowSettings((v) => !v)}>
                {showSettings ? 'Hide Settings' : 'Settings'}
              </Button>
              <Button variant="danger" onClick={closeLobby}>
                Close Lobby
              </Button>
            </div>
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <HostSettings lobby={lobby} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <p className="text-center text-sm text-white/40">
            Waiting for the host to start the match…
          </p>
        )}
      </div>
    </div>
  );
}
