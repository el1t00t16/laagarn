import React, { useState } from 'react';
import {
  ConvoyPeer,
  ConvoyVehicleType,
  ConvoySharedRoute,
  CONVOY_VEHICLE_OPTIONS,
  CONVOY_COLOR_PALETTE,
  buildConvoyShareUrl,
  buildQrCodeImageUrl,
  peerToLatLngPoint,
  normalizeConvoyCode,
} from '../utils/convoySync';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import { LatLngPoint, ComputedRoute } from '../utils/routingEngine';
import {
  Share2,
  Copy,
  Check,
  QrCode,
  Users,
  Navigation,
  Crosshair,
  Plus,
  Radio,
  LogOut,
  Maximize2,
  Sparkles,
  Battery,
  Zap,
  MapPin,
  CheckCircle2,
} from 'lucide-react';

interface ConvoyPanelProps {
  roomCode: string | null;
  isSharing: boolean;
  myName: string;
  myVehicle: ConvoyVehicleType;
  myColor: string;
  peers: ConvoyPeer[];
  activePeersCount: number;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastBroadcastAt: number | null;
  gpsState: GpsPositionState | null;
  currentRoute?: ComputedRoute | null;
  sharedRoute?: ConvoySharedRoute | null;
  routeSuggestions?: ConvoySharedRoute[];
  onCreateConvoy: (customCode?: string) => void;
  onJoinConvoy: (code: string) => void;
  onLeaveConvoy: () => void;
  onUpdateProfile: (name: string, vehicle: ConvoyVehicleType, color: string) => void;
  onFocusCoordinate: (lat: number, lng: number, zoom?: number, label?: string) => void;
  onFitBounds?: (points: { lat: number; lng: number }[]) => void;
  onRouteToPeer: (point: LatLngPoint) => void;
  onAddPeerStop: (point: LatLngPoint) => void;
  onShareRouteToConvoy?: (route: ConvoySharedRoute) => void;
  onSuggestRouteToConvoy?: (route: ConvoySharedRoute) => void;
  onLoadSharedRoute?: (route: ConvoySharedRoute) => void;
  onDismissRouteSuggestion?: (id: string) => void;
  theme?: 'dark' | 'amoled' | 'light';
}

export const ConvoyPanel: React.FC<ConvoyPanelProps> = ({
  roomCode,
  isSharing,
  myName,
  myVehicle,
  myColor,
  peers,
  activePeersCount,
  connectionStatus,
  lastBroadcastAt,
  gpsState,
  currentRoute,
  sharedRoute,
  routeSuggestions = [],
  onCreateConvoy,
  onJoinConvoy,
  onLeaveConvoy,
  onUpdateProfile,
  onFocusCoordinate,
  onFitBounds,
  onRouteToPeer,
  onAddPeerStop,
  onShareRouteToConvoy,
  onSuggestRouteToConvoy,
  onLoadSharedRoute,
  onDismissRouteSuggestion,
  theme = 'dark',
}) => {
  const [nameInput, setNameInput] = useState<string>(myName);
  const [vehicleInput, setVehicleInput] = useState<ConvoyVehicleType>(myVehicle);
  const [colorInput, setColorInput] = useState<string>(myColor);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrError, setQrError] = useState<boolean>(false);
  const [showProfileEdit, setShowProfileEdit] = useState<boolean>(false);

  const shareUrl = roomCode ? buildConvoyShareUrl(roomCode) : '';

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      prompt('Copy this Convoy link to share:', shareUrl);
    }
  };

  const handleNativeShare = async () => {
    if (!shareUrl || typeof navigator === 'undefined') return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `LAAGARN Live Convoy (${roomCode})`,
          text: `Join my live GPS convoy on LAAGARN so we can locate each other in real-time!`,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile(nameInput, vehicleInput, colorInput);
    setShowProfileEdit(false);
  };

  const handleFitAll = () => {
    if (!onFitBounds) return;
    const allPoints: { lat: number; lng: number }[] = [];
    if (gpsState) {
      allPoints.push({ lat: gpsState.lat, lng: gpsState.lng });
    }
    peers.forEach((p) => {
      allPoints.push({ lat: p.lat, lng: p.lng });
    });
    if (allPoints.length >= 1) {
      onFitBounds(allPoints);
    }
  };

  // Nearby peers within 200m
  const closeBuddies = peers.filter((p) => p.distanceKm !== undefined && p.distanceKm <= 0.2);

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Section I: Room Header & Status */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="section-label mono !mb-0">I. Live Convoy & Share</span>
            {isSharing && (
              <span className="px-2 py-0.5 rounded text-[9.5px] mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Broadcasting
              </span>
            )}
          </div>
          {isSharing && (
            <button
              type="button"
              onClick={onLeaveConvoy}
              className="mono text-[0.6rem] uppercase tracking-wider text-rose-500 hover:underline cursor-pointer flex items-center gap-1 font-bold"
            >
              <LogOut className="w-3 h-3" />
              <span>Leave</span>
            </button>
          )}
        </div>

        {/* NOT SHARING: Creation & Join Form */}
        {!isSharing ? (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-xs">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 text-xl">
                  📡
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--ink)]">
                    Locate Each Other Live
                  </h3>
                  <p className="text-xs text-[var(--ink-dim)] mt-1 leading-relaxed">
                    Start a convoy session so you and your friends can track each other&apos;s live GPS coordinates, speeds, and directions on the map simultaneously.
                  </p>
                </div>
              </div>

              {/* Profile setup preview */}
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-sm shadow-sm shrink-0"
                    style={{ background: myColor }}
                  >
                    {CONVOY_VEHICLE_OPTIONS.find((v) => v.id === myVehicle)?.emoji || '🏍️'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--ink)]">{myName}</div>
                    <div className="mono text-[9px] text-[var(--ink-dim)] capitalize">
                      {myVehicle} &middot; Your Avatar
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfileEdit((v) => !v)}
                  className="mono text-[10px] uppercase text-[var(--accent)] hover:underline cursor-pointer font-bold"
                >
                  {showProfileEdit ? 'Done' : 'Change Profile'}
                </button>
              </div>

              {/* Profile Editor Collapse */}
              {showProfileEdit && (
                <form
                  onSubmit={handleSaveProfile}
                  className="mt-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-3"
                >
                  <div className="input-group">
                    <label htmlFor="convoy-name-input" className="mono text-[10px]">
                      Your Rider / Driver Name
                    </label>
                    <input
                      id="convoy-name-input"
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="e.g. Juan (Lead)"
                      className="editorial-input"
                    />
                  </div>

                  <div>
                    <label className="mono text-[10px] block mb-1 text-[var(--ink-dim)] font-bold">
                      Vehicle Type
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CONVOY_VEHICLE_OPTIONS.map((veh) => (
                        <button
                          key={veh.id}
                          type="button"
                          onClick={() => setVehicleInput(veh.id)}
                          className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                            vehicleInput === veh.id
                              ? 'border-[var(--accent)] bg-[var(--accent)]/15 font-bold'
                              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-dim)] hover:border-[var(--accent)]/50'
                          }`}
                        >
                          <div className="text-base">{veh.emoji}</div>
                          <div className="text-[8px] mono mt-1 truncate">{veh.label.split(' ')[0]}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mono text-[10px] block mb-1 text-[var(--ink-dim)] font-bold">
                      Avatar Color Ring
                    </label>
                    <div className="flex gap-2">
                      {CONVOY_COLOR_PALETTE.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setColorInput(col)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                            colorInput === col ? 'scale-125 border-white shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                          style={{ background: col }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-1.5 bg-[var(--accent)] text-white mono text-[10px] font-bold rounded-lg uppercase tracking-wider cursor-pointer"
                  >
                    Save Avatar Profile
                  </button>
                </form>
              )}

              {/* Start Convoy Action Button */}
              <button
                type="button"
                onClick={() => onCreateConvoy()}
                className="btn-primary display mt-4 !w-full flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Radio className="w-4 h-4" />
                <span>Start New Convoy Room</span>
              </button>
            </div>

            {/* Join an existing room */}
            <div className="p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-xs">
              <div className="text-xs font-bold text-[var(--ink)] mb-1">
                Have a Friend&apos;s Room Code?
              </div>
              <p className="text-[11px] text-[var(--ink-dim)] mb-3">
                Enter either the 4-digit PIN (e.g. 6689) or full code (LAAG-6689) to connect instantly.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. 6689 or LAAG-6689"
                  className="editorial-input !uppercase mono tracking-wider flex-1 text-center font-bold"
                  maxLength={16}
                />
                <button
                  type="button"
                  disabled={!joinCodeInput.trim()}
                  onClick={() => onJoinConvoy(normalizeConvoyCode(joinCodeInput))}
                  className="px-4 py-2 bg-[var(--surface)] hover:bg-[var(--accent)] text-[var(--ink)] hover:text-white border border-[var(--border)] hover:border-[var(--accent)] rounded-xl mono text-xs uppercase font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE ROOM: Sharing Active */
          <div className="flex flex-col gap-4">
            {/* Room Pass & Share Card */}
            <div className="p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="mono text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">
                    Active Convoy Room
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xl font-extrabold display text-[var(--accent)] tracking-wider">
                      {roomCode}
                    </span>
                    {roomCode && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-[var(--accent)] mono text-[10px] font-black">
                        PIN: {roomCode.replace(/[^0-9]/g, '') || roomCode}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    title="Copy Share Link"
                    className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--ink)] transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    title="Share with Friends (Messenger/WhatsApp/SMS)"
                    className="p-2 rounded-xl bg-[var(--accent)] text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQrError(false);
                      setShowQrModal(true);
                    }}
                    title="Show QR Code for Camera Scan"
                    className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--ink)] transition-colors cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {copied && (
                <div className="mt-2 text-emerald-500 mono text-[10px] font-bold">
                  ✓ Link copied! Send it to your friend to join.
                </div>
              )}

              {/* My Telemetry Broadcast Stats */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)] mono text-[9px]">
                <div>
                  <div className="text-[var(--ink-dim)]">Pals Online</div>
                  <div className="text-xs font-bold text-[var(--ink)] mt-0.5">
                    {activePeersCount} {activePeersCount === 1 ? 'Friend' : 'Friends'}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-dim)]">Your Speed</div>
                  <div className="text-xs font-bold text-[var(--ink)] mt-0.5">
                    {gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined
                      ? `${gpsState.speedKmh} km/h`
                      : 'Stationary'}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-dim)]">Sync Status</div>
                  <div className="text-xs font-bold text-emerald-500 mt-0.5">
                    {connectionStatus === 'connected' ? 'Real-Time' : 'Syncing...'}
                  </div>
                </div>
              </div>
            </div>

            {/* Convoy Route Plan & Member Proposals */}
            <div className="p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="mono text-[10px] font-extrabold uppercase tracking-wider text-[var(--ink-dim)]">
                    Convoy Route Plan
                  </span>
                  {sharedRoute && (
                    <span className="px-2 py-0.5 rounded text-[8.5px] mono font-bold bg-purple-500/15 text-[var(--accent)] border border-purple-500/30">
                      Active
                    </span>
                  )}
                </div>
              </div>

              {sharedRoute ? (
                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Navigation className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--ink)]">
                          {sharedRoute.label}
                        </div>
                        <div className="mono text-[9px] text-[var(--ink-dim)] mt-0.5">
                          Shared by <span className="font-bold text-[var(--accent)]">{sharedRoute.suggestedByName}</span> &middot; {sharedRoute.stops.length} Stops &middot; {sharedRoute.totalDistanceKm} km
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-purple-500/20">
                    {onLoadSharedRoute && (
                      <button
                        type="button"
                        onClick={() => onLoadSharedRoute(sharedRoute)}
                        className="flex-1 py-1.5 px-3 bg-[var(--accent)] hover:opacity-90 active:scale-95 text-white mono text-[10px] font-bold rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Load & Follow Route</span>
                      </button>
                    )}
                    {currentRoute && onShareRouteToConvoy && (
                      <button
                        type="button"
                        onClick={() => {
                          onShareRouteToConvoy({
                            id: `route-${Date.now()}`,
                            label: currentRoute.label,
                            stops: currentRoute.stops,
                            totalDistanceKm: currentRoute.totalDistanceKm,
                            durationMinutes: currentRoute.totalDurationMinutes,
                            suggestedByPeerId: 'self',
                            suggestedByName: myName,
                            timestamp: Date.now(),
                            isHostRoute: true,
                          });
                        }}
                        className="py-1.5 px-3 bg-[var(--surface)] hover:bg-[var(--accent)]/15 border border-[var(--border)] text-[var(--ink)] mono text-[9px] font-bold rounded-lg uppercase cursor-pointer"
                        title="Update with my current route"
                      >
                        Update
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-[var(--ink-dim)] leading-relaxed">
                    Host or joiners can plan a route and broadcast it here so the entire convoy follows the same waypoints.
                  </p>
                  {currentRoute && onShareRouteToConvoy && (
                    <button
                      type="button"
                      onClick={() => {
                        onShareRouteToConvoy({
                          id: `route-${Date.now()}`,
                          label: currentRoute.label,
                          stops: currentRoute.stops,
                          totalDistanceKm: currentRoute.totalDistanceKm,
                          durationMinutes: currentRoute.totalDurationMinutes,
                          suggestedByPeerId: 'self',
                          suggestedByName: myName,
                          timestamp: Date.now(),
                          isHostRoute: true,
                        });
                      }}
                      className="w-full py-2 px-3 bg-[var(--accent)] hover:opacity-90 active:scale-95 text-white mono text-[10px] font-bold rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share My Route with Convoy</span>
                    </button>
                  )}
                </div>
              )}

              {/* Member Route Suggestions */}
              {routeSuggestions.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="mono text-[9px] font-bold text-[var(--ink-dim)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Route Suggestions from Pals ({routeSuggestions.length})</span>
                  </div>
                  {routeSuggestions.map((sug) => (
                    <div
                      key={sug.id}
                      className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[var(--ink)] truncate">
                          {sug.label}
                        </div>
                        <div className="mono text-[8.5px] text-[var(--ink-dim)] mt-0.5">
                          From <span className="text-amber-500 font-bold">{sug.suggestedByName}</span> &middot; {sug.totalDistanceKm} km
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onLoadSharedRoute && (
                          <button
                            type="button"
                            onClick={() => onLoadSharedRoute(sug)}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-black mono text-[9px] font-black uppercase rounded-lg cursor-pointer"
                          >
                            Accept
                          </button>
                        )}
                        {onDismissRouteSuggestion && (
                          <button
                            type="button"
                            onClick={() => onDismissRouteSuggestion(sug.id)}
                            className="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-dim)] hover:text-rose-500 mono text-[9px] rounded-lg cursor-pointer"
                            title="Dismiss suggestion"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Joiner suggest alternate button */}
              {sharedRoute && currentRoute && onSuggestRouteToConvoy && (
                <button
                  type="button"
                  onClick={() => {
                    onSuggestRouteToConvoy({
                      id: `sug-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      label: currentRoute.label,
                      stops: currentRoute.stops,
                      totalDistanceKm: currentRoute.totalDistanceKm,
                      durationMinutes: currentRoute.totalDurationMinutes,
                      suggestedByPeerId: 'self',
                      suggestedByName: myName,
                      timestamp: Date.now(),
                    });
                  }}
                  className="w-full py-1.5 px-3 bg-[var(--surface)] hover:bg-[var(--accent)]/15 border border-purple-500/30 text-[var(--accent)] mono text-[9.5px] font-bold rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-3 h-3" />
                  <span>Suggest My Route as Alternative</span>
                </button>
              )}
            </div>

            {/* Proximity / Meetup Banner */}
            {closeBuddies.length > 0 && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/35 rounded-xl flex items-center gap-2.5 text-emerald-600 dark:text-emerald-300">
                <Sparkles className="w-4 h-4 shrink-0 text-emerald-500" />
                <div className="text-xs font-bold leading-tight">
                  You and {closeBuddies.map((b) => b.name).join(', ')} are right next to each other! (&lt;200m)
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section II: Active Members Ledger */}
      {isSharing && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="section-label mono !mb-0">
              II. Convoy Pals ({peers.length + 1})
            </span>
            {peers.length > 0 && onFitBounds && (
              <button
                type="button"
                onClick={handleFitAll}
                className="mono text-[0.62rem] uppercase text-[var(--accent)] hover:underline cursor-pointer font-bold flex items-center gap-1"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Fit All in View</span>
              </button>
            )}
          </div>

          {/* Self Card */}
          <div className="route-card cursor-default !border-purple-500/30 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-sm shadow-sm shrink-0"
                  style={{ background: myColor }}
                >
                  {CONVOY_VEHICLE_OPTIONS.find((v) => v.id === myVehicle)?.emoji || '🏍️'}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-[var(--ink)]">{myName}</span>
                    <span className="px-1.5 py-0.2 rounded bg-purple-500/15 text-[var(--accent)] mono text-[8px] font-extrabold uppercase">
                      You (Host)
                    </span>
                  </div>
                  <div className="mono text-[9px] text-[var(--ink-dim)] mt-0.5">
                    {gpsState?.addressLabel || 'Current GPS Location'}
                  </div>
                </div>
              </div>

              {gpsState && (
                <button
                  type="button"
                  onClick={() => onFocusCoordinate(gpsState.lat, gpsState.lng, 16, myName)}
                  className="mono text-[0.62rem] uppercase text-[var(--accent)] hover:underline cursor-pointer font-bold"
                >
                  Locate
                </button>
              )}
            </div>
          </div>

          {/* Peers List */}
          {peers.length === 0 ? (
            <div className="route-card text-center py-6 cursor-default">
              <Users className="w-8 h-8 mx-auto text-[var(--ink-dim)] opacity-40 mb-2" />
              <div className="text-xs font-bold text-[var(--ink)]">
                Waiting for Friends to Join...
              </div>
              <div className="mono text-[10px] text-[var(--ink-dim)] mt-1 max-w-xs mx-auto">
                Share room code <span className="text-[var(--accent)] font-bold">{roomCode}</span> or tap Share Link above to start tracking each other.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {peers.map((peer) => {
                const isOnline = peer.status === 'active';
                const isIdle = peer.status === 'idle';
                const distText =
                  peer.distanceKm !== undefined
                    ? peer.distanceKm < 1
                      ? `${Math.round(peer.distanceKm * 1000)} m away`
                      : `${peer.distanceKm.toFixed(1)} km away`
                    : '';

                return (
                  <div
                    key={peer.id}
                    className="route-card cursor-default group hover:border-[var(--accent)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-sm shadow-sm shrink-0"
                          style={{ background: peer.color }}
                        >
                          {CONVOY_VEHICLE_OPTIONS.find((v) => v.id === peer.vehicle)?.emoji || '👤'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[var(--ink)]">
                              {peer.name}
                            </span>
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isOnline ? 'bg-emerald-500 animate-pulse' : isIdle ? 'bg-amber-400' : 'bg-gray-400'
                              }`}
                              title={peer.status}
                            />
                          </div>
                          <div className="mono text-[9px] text-[var(--accent)] font-semibold mt-0.5">
                            {distText} {peer.cardinalDirection ? `(${peer.cardinalDirection})` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end text-right mono text-[9px] text-[var(--ink-dim)]">
                        {peer.speedKmh !== null && peer.speedKmh !== undefined && (
                          <span className="font-bold text-[var(--ink)] flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5 text-amber-500" />
                            {peer.speedKmh} km/h
                          </span>
                        )}
                        {peer.batteryLevel !== null && peer.batteryLevel !== undefined && (
                          <span className="flex items-center gap-0.5">
                            <Battery className="w-2.5 h-2.5 text-emerald-500" />
                            {Math.round(peer.batteryLevel * 100)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => onFocusCoordinate(peer.lat, peer.lng, 16, peer.name)}
                        className="mono text-[0.62rem] uppercase text-[var(--accent)] hover:underline cursor-pointer font-bold flex items-center gap-1"
                      >
                        <Crosshair className="w-3 h-3" />
                        <span>Locate</span>
                      </button>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onAddPeerStop(peerToLatLngPoint(peer))}
                          className="mono text-[0.62rem] uppercase text-[var(--ink-dim)] hover:text-[var(--accent)] cursor-pointer font-bold flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Stop</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onRouteToPeer(peerToLatLngPoint(peer))}
                          className="mono text-[0.62rem] uppercase text-[var(--ink)] hover:text-[var(--accent)] cursor-pointer font-bold flex items-center gap-0.5"
                        >
                          <Navigation className="w-3 h-3 text-[var(--accent)]" />
                          <span>Route to {peer.name.split(' ')[0]}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] p-6 rounded-3xl max-w-sm w-full text-center shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[var(--ink)]">
                Scan with Phone Camera
              </h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-[var(--ink-dim)] hover:text-[var(--ink)] mono text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {!qrError ? (
              <div className="p-3 bg-white rounded-2xl inline-block shadow-md border border-gray-200">
                <img
                  src={buildQrCodeImageUrl(shareUrl, 200)}
                  alt={`Convoy QR Code ${roomCode}`}
                  onError={() => setQrError(true)}
                  className="w-48 h-48 block mx-auto"
                />
              </div>
            ) : (
              <div className="p-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] text-center space-y-2">
                <QrCode className="w-10 h-10 mx-auto text-[var(--accent)]" />
                <div className="mono text-xs font-bold text-[var(--ink)]">
                  Offline / QR Service Unavailable
                </div>
                <p className="text-[11px] text-[var(--ink-dim)]">
                  Share this 4-digit convoy code directly with your friends:
                </p>
                <div className="mono text-lg font-black text-[var(--accent)] tracking-widest bg-[var(--surface-glass)] py-2 rounded-xl border border-[var(--border)]">
                  {roomCode}
                </div>
              </div>
            )}

            <div>
              <div className="mono text-xs uppercase tracking-wider font-bold text-[var(--accent)]">
                {roomCode}
              </div>
              <p className="text-[11px] text-[var(--ink-dim)] mt-1">
                Your friend can point their phone camera at this screen to instantly connect to your live convoy session!
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] mono text-xs uppercase font-bold rounded-xl hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
