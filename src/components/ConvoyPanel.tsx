import React, { useState, useEffect } from 'react';
import {
  ConvoyPeer,
  ConvoyVehicleType,
  ConvoySharedRoute,
  ConvoyJoinRequest,
  CONVOY_VEHICLE_OPTIONS,
  CONVOY_COLOR_PALETTE,
  buildConvoyShareUrl,
  buildQrCodeImageUrl,
  peerToLatLngPoint,
  normalizeConvoyCode,
  formatConvoyDistance,
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
  Edit3,
  UserCheck,
  UserX,
  Clock,
  ShieldCheck,
  Bike,
  Car,
  Bus,
  Footprints,
  Bell,
  Lightbulb,
  X,
  XCircle,
} from 'lucide-react';

function renderVehicleIcon(vehicle: ConvoyVehicleType | undefined, className = 'w-4 h-4') {
  switch (vehicle) {
    case 'car':
      return <Car className={className} />;
    case 'van':
      return <Bus className={className} />;
    case 'bicycle':
      return <Bike className={className} />;
    case 'pedestrian':
      return <Footprints className={className} />;
    case 'motorcycle':
    default:
      return <Bike className={className} />;
  }
}

interface ConvoyPanelProps {
  roomCode: string | null;
  isSharing: boolean;
  isHost?: boolean;
  joinApprovalStatus?: 'idle' | 'pending' | 'accepted' | 'declined';
  pendingJoinRequests?: ConvoyJoinRequest[];
  autoAccept?: boolean;
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
  onCancelJoinRequest?: () => void;
  onAcceptJoinRequest?: (peerId: string) => void;
  onDeclineJoinRequest?: (peerId: string) => void;
  onSetAutoAccept?: (val: boolean) => void;
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
  isHost = true,
  joinApprovalStatus = 'accepted',
  pendingJoinRequests = [],
  autoAccept = false,
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
  onCancelJoinRequest,
  onAcceptJoinRequest,
  onDeclineJoinRequest,
  onSetAutoAccept,
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
  const [showActiveProfileEdit, setShowActiveProfileEdit] = useState<boolean>(false);

  // Keep form inputs synced when external profile changes
  useEffect(() => {
    setNameInput(myName);
  }, [myName]);

  useEffect(() => {
    setVehicleInput(myVehicle);
  }, [myVehicle]);

  useEffect(() => {
    setColorInput(myColor);
  }, [myColor]);

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
    setShowActiveProfileEdit(false);
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
    <div className="flex flex-col gap-4 pb-4 min-h-full">
      {/* Room Header & Status */}
      <div>
        {isSharing && (
          <div className="flex items-center justify-between mb-3">
            <span className="px-2.5 py-1 rounded-full text-[10px] mono font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/35 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Broadcast</span>
            </span>
            <button
              type="button"
              onClick={onLeaveConvoy}
              className="min-h-[30px] px-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 mono text-[10px] uppercase tracking-wider text-rose-500 hover:bg-rose-500/20 cursor-pointer flex items-center gap-1 font-bold"
            >
              <LogOut className="w-3 h-3" />
              <span>Leave</span>
            </button>
          </div>
        )}

        {/* NOT SHARING: Creation & Join Form */}
        {!isSharing ? (
          <div className="flex flex-col gap-3.5">
            {/* Host Section: Start a room */}
            <div className="p-4 cockpit-card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/35 text-[var(--accent)] flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--ink)]">
                    Host a Convoy Pack
                  </h3>
                  <p className="text-xs text-[var(--ink-dim)] mt-1 leading-relaxed">
                    Start a convoy session as Host. You will get a 4-digit PIN to share with your riding or driving group.
                  </p>
                </div>
              </div>

              {/* Profile setup preview */}
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white/80 text-white flex items-center justify-center shadow-sm shrink-0"
                    style={{ background: myColor }}
                  >
                    {renderVehicleIcon(myVehicle, 'w-4 h-4')}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--ink)]">{myName}</div>
                    <div className="mono text-[9.5px] text-[var(--ink-dim)] capitalize">
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
                          className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                            vehicleInput === veh.id
                              ? 'border-[var(--accent)] bg-purple-500/15 text-[var(--ink)] font-bold'
                              : 'cockpit-pill text-[var(--ink-dim)] hover:border-[var(--accent)]/50'
                          }`}
                        >
                          {renderVehicleIcon(veh.id, 'w-4 h-4')}
                          <div className="text-[8.5px] mono mt-1 truncate max-w-full">{veh.label.split(' ')[0]}</div>
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
                className="btn-primary mt-4 !w-full flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Radio className="w-4 h-4" />
                <span>Start New Convoy Room</span>
              </button>
            </div>

            {/* Join an existing room */}
            <div className="p-4 cockpit-card">
              <div className="text-xs font-bold text-[var(--ink)] mb-1">
                Have a Friend&apos;s Room Code?
              </div>
              <p className="text-[11px] text-[var(--ink-dim)] mb-3">
                Enter your name, pick your vehicle, and enter the 4-digit PIN (e.g. 6944) to join.
              </p>

              {/* Joiner Name & Avatar Setup */}
              <div className="mb-3 space-y-2 p-3 bg-[var(--surface-glass)] border border-[var(--border-subtle)] rounded-xl">
                <div>
                  <label className="mono text-[9px] block text-[var(--ink-dim)] font-bold mb-1">
                    Your Name (as seen by Host & Pals)
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      onUpdateProfile(e.target.value, vehicleInput, colorInput);
                    }}
                    placeholder="e.g. Maria, Juan"
                    className="editorial-input text-xs"
                  />
                </div>

                <div>
                  <label className="mono text-[9px] block text-[var(--ink-dim)] font-bold mb-1">
                    Vehicle Type
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {CONVOY_VEHICLE_OPTIONS.map((veh) => (
                      <button
                        key={veh.id}
                        type="button"
                        onClick={() => {
                          setVehicleInput(veh.id);
                          onUpdateProfile(nameInput, veh.id, colorInput);
                        }}
                        className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                          vehicleInput === veh.id
                            ? 'border-[var(--accent)] bg-purple-500/15 text-[var(--ink)] font-bold'
                            : 'cockpit-pill text-[var(--ink-dim)] hover:border-[var(--accent)]/50'
                        }`}
                      >
                        {renderVehicleIcon(veh.id, 'w-3.5 h-3.5')}
                        <div className="text-[8px] mono mt-1 truncate max-w-full">{veh.label.split(' ')[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Room Code Input */}
              <label className="mono text-[9px] block text-[var(--ink-dim)] font-bold mb-1">
                Room Code or 4-Digit PIN
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. 6944 or LAAG-6944"
                  className="editorial-input !uppercase mono tracking-wider flex-1 text-center font-bold"
                  maxLength={16}
                />
                <button
                  type="button"
                  disabled={!joinCodeInput.trim()}
                  onClick={() => {
                    onUpdateProfile(nameInput, vehicleInput, colorInput);
                    onJoinConvoy(normalizeConvoyCode(joinCodeInput));
                  }}
                  className="px-4 py-2 bg-[var(--accent)] text-white hover:opacity-90 rounded-xl mono text-xs uppercase font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        ) : isSharing && !isHost && joinApprovalStatus === 'pending' ? (
          /* WAITING FOR HOST ACCEPTANCE VIEW */
          <div className="p-6 cockpit-card border-purple-500/35 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
              <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white flex items-center justify-center shadow-lg">
                <Clock className="w-6 h-6" />
              </span>
            </div>

            <div>
              <div className="mono text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold">
                Join Request Sent
              </div>
              <h3 className="text-base font-black text-[var(--ink)] mt-1">
                Waiting for Host Approval
              </h3>
              <p className="text-xs text-[var(--ink-dim)] mt-1.5 max-w-sm mx-auto leading-relaxed">
                You requested to join convoy room <span className="font-extrabold text-[var(--accent)] tabular-nums">{roomCode}</span> as <span className="font-bold text-[var(--ink)]">{myName}</span> ({CONVOY_VEHICLE_OPTIONS.find((v) => v.id === myVehicle)?.label || myVehicle}). The host will accept your request on their screen.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onCancelJoinRequest || onLeaveConvoy}
                className="py-2 px-4 cockpit-pill hover:bg-rose-500/10 text-rose-500 border-rose-500/30 rounded-xl mono text-xs uppercase font-bold cursor-pointer transition-colors"
              >
                Cancel Request
              </button>
            </div>
          </div>
        ) : isSharing && !isHost && joinApprovalStatus === 'declined' ? (
          /* JOIN REQUEST DECLINED */
          <div className="p-6 cockpit-card border-rose-500/35 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/15 border border-rose-500/35 text-rose-500 flex items-center justify-center">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--ink)]">
                Join Request Declined
              </h3>
              <p className="text-xs text-[var(--ink-dim)] mt-1">
                The convoy host declined your request to join room {roomCode}.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => roomCode && onJoinConvoy(roomCode)}
                className="py-2 px-4 bg-[var(--accent)] text-white rounded-xl mono text-xs uppercase font-bold cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={onLeaveConvoy}
                className="py-2 px-4 cockpit-pill text-[var(--ink-dim)] rounded-xl mono text-xs uppercase font-bold cursor-pointer"
              >
                Exit
              </button>
            </div>
          </div>
        ) : (
          /* ACTIVE ROOM: Approved & Sharing */
          <div className="flex flex-col gap-4">
            {/* Host Join Requests Approval Card */}
            {isHost && pendingJoinRequests && pendingJoinRequests.length > 0 && (
              <div className="p-3.5 bg-gradient-to-r from-amber-500/15 to-purple-500/15 border-2 border-amber-500/40 rounded-2xl shadow-md space-y-2.5 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="mono text-[10px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 shrink-0" />
                    <span>Join Requests ({pendingJoinRequests.length})</span>
                  </div>
                  <span className="mono text-[9px] text-[var(--ink-dim)]">
                    Host approval required
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {pendingJoinRequests.map((req) => (
                    <div
                      key={req.peerId}
                      className="p-2.5 cockpit-subcard flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full border-2 border-white/80 text-white flex items-center justify-center shadow-sm shrink-0"
                          style={{ background: req.color }}
                        >
                          {renderVehicleIcon(req.vehicle, 'w-4 h-4')}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-[var(--ink)] truncate">
                            {req.name}
                          </div>
                          <div className="mono text-[8.5px] text-[var(--ink-dim)] truncate">
                            Wants to join your convoy
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onAcceptJoinRequest?.(req.peerId)}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white mono text-[9.5px] font-black uppercase rounded-lg cursor-pointer shadow-xs transition-all"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeclineJoinRequest?.(req.peerId)}
                          className="px-2 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-500 mono text-[9.5px] font-bold uppercase rounded-lg cursor-pointer transition-all"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Room Pass & Share Card */}
            <div className="p-4 cockpit-card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="mono text-[9.5px] uppercase tracking-wider text-[var(--ink-dim)]">
                    Active Convoy Room
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xl font-extrabold mono tabular-nums text-[var(--accent)] tracking-wider">
                      {roomCode}
                    </span>
                    {roomCode && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-[var(--accent)] mono tabular-nums text-[10px] font-bold">
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
                    aria-label="Copy convoy share link"
                    className="p-2 rounded-xl cockpit-pill hover:border-[var(--accent)] text-[var(--ink)] transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    title="Share with Friends (Messenger/WhatsApp/SMS)"
                    aria-label="Share convoy invite"
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
                    aria-label="Show convoy QR code"
                    className="p-2 rounded-xl cockpit-pill hover:border-[var(--accent)] text-[var(--ink)] transition-colors cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {copied && (
                <div className="mt-2 text-emerald-500 mono text-[10px] font-bold inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Link copied! Send it to your friend to join.</span>
                </div>
              )}

              {/* Host Auto-Accept Toggle */}
              {isHost && onSetAutoAccept && (
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-subtle)] mono text-[9.5px] text-[var(--ink-dim)]">
                  <span>Auto-accept riders with PIN</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAccept}
                      onChange={(e) => onSetAutoAccept(e.target.checked)}
                      className="accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="font-bold text-[var(--ink)]">{autoAccept ? 'ON' : 'OFF'}</span>
                  </label>
                </div>
              )}

              {/* My Telemetry Broadcast Stats */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)] mono tabular-nums text-[9.5px]">
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
            <div className="p-4 cockpit-card space-y-3">
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
                            isHostRoute: isHost,
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
                          isHostRoute: isHost,
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
                            className="p-1.5 cockpit-pill text-[var(--ink-dim)] hover:text-rose-500 rounded-lg cursor-pointer flex items-center justify-center"
                            title="Dismiss suggestion"
                            aria-label="Dismiss route suggestion"
                          >
                            <X className="w-3.5 h-3.5" />
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
                  You and {closeBuddies.map((b) => b.name).join(', ')} are in the same location!
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Members Ledger */}
      {isSharing && (isHost || joinApprovalStatus === 'accepted') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="section-label mono !mb-0">
              Convoy Members ({peers.length + 1})
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

          {/* Self Card with Inline Profile Editor */}
          <div className="route-card cursor-default !border-purple-500/30 mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full border-2 border-white/80 text-white flex items-center justify-center shadow-sm shrink-0"
                  style={{ background: myColor }}
                >
                  {renderVehicleIcon(myVehicle, 'w-4 h-4')}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-[var(--ink)]">{myName}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded mono text-[8.5px] font-bold uppercase ${
                        isHost
                          ? 'bg-purple-500/15 text-[var(--accent)] border border-purple-500/30'
                          : 'bg-cyan-500/15 text-cyan-500 border border-cyan-500/30'
                      }`}
                    >
                      {isHost ? 'You (Host)' : 'You (Member)'}
                    </span>
                  </div>
                  <div className="mono tabular-nums text-[9.5px] text-[var(--ink-dim)] mt-0.5">
                    {gpsState?.addressLabel || 'Current GPS Location'}
                    {gpsState?.accuracyMeters ? ` · ±${gpsState.accuracyMeters}m` : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowActiveProfileEdit((v) => !v)}
                  className="p-1 px-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-lg mono text-[8.5px] uppercase font-bold text-[var(--accent)] cursor-pointer flex items-center gap-1"
                  title="Change your rider name and vehicle icon"
                >
                  <Edit3 className="w-2.5 h-2.5" />
                  <span>{showActiveProfileEdit ? 'Done' : 'Edit Profile'}</span>
                </button>
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

            {/* Inline Profile Editor Collapse */}
            {showActiveProfileEdit && (
              <form
                onSubmit={handleSaveProfile}
                className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5"
              >
                <div>
                  <label className="mono text-[9px] block text-[var(--ink-dim)] font-bold mb-1">
                    Your Rider / Driver Name
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="editorial-input text-xs"
                    placeholder="Enter your rider name"
                  />
                </div>
                <div>
                  <label className="mono text-[9px] block text-[var(--ink-dim)] font-bold mb-1">
                    Vehicle Type
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {CONVOY_VEHICLE_OPTIONS.map((veh) => (
                      <button
                        key={veh.id}
                        type="button"
                        onClick={() => setVehicleInput(veh.id)}
                        className={`p-1 rounded-lg border text-center cursor-pointer transition-all ${
                          vehicleInput === veh.id
                            ? 'border-[var(--accent)] bg-[var(--accent)]/15 font-bold'
                            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-dim)]'
                        }`}
                      >
                        <div className="text-sm">{veh.emoji}</div>
                        <div className="text-[7.5px] mono truncate">{veh.label.split(' ')[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mono text-[9px] block text-[var(--ink-dim)] font-bold mb-1">
                    Avatar Color
                  </label>
                  <div className="flex gap-2">
                    {CONVOY_COLOR_PALETTE.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setColorInput(col)}
                        className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-transform ${
                          colorInput === col ? 'scale-125 border-white shadow-md' : 'border-transparent opacity-70'
                        }`}
                        style={{ background: col }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 bg-[var(--accent)] text-white mono text-[9.5px] font-bold rounded-lg uppercase tracking-wider cursor-pointer shadow-sm"
                >
                  Save & Broadcast Changes
                </button>
              </form>
            )}
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
                const isClose = peer.distanceKm !== undefined && peer.distanceKm < 0.1;
                const formattedDist = formatConvoyDistance(peer.distanceKm);

                return (
                  <div
                    key={peer.id}
                    className="route-card cursor-default group hover:border-[var(--accent)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full border-2 border-white/80 text-white flex items-center justify-center shadow-sm shrink-0"
                          style={{ background: peer.color }}
                        >
                          {renderVehicleIcon(peer.vehicle, 'w-4 h-4')}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[var(--ink)]">
                              {peer.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded mono text-[8px] font-bold uppercase ${
                                peer.isHost
                                  ? 'bg-purple-500/15 text-[var(--accent)] border border-purple-500/30'
                                  : 'bg-cyan-500/15 text-cyan-500 border border-cyan-500/30'
                              }`}
                            >
                              {peer.isHost ? 'Host' : 'Member'}
                            </span>
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isOnline ? 'bg-emerald-500 animate-pulse' : isIdle ? 'bg-amber-400' : 'bg-gray-400'
                              }`}
                              title={peer.status}
                            />
                          </div>
                          <div
                            className={`mono text-[9px] mt-0.5 font-semibold ${
                              isClose ? 'text-emerald-500 font-bold' : 'text-[var(--accent)]'
                            }`}
                          >
                            {formattedDist} {peer.cardinalDirection ? `(${peer.cardinalDirection})` : ''}
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
                        {peer.accuracyMeters && (
                          <span className="text-[8px] text-[var(--ink-dim)]">
                            ±{peer.accuracyMeters}m
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

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onAddPeerStop(peerToLatLngPoint(peer))}
                          className="mono text-[0.62rem] uppercase text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer flex items-center gap-1"
                          title="Add pal location as stop in trip planner"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Stop</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRouteToPeer(peerToLatLngPoint(peer))}
                          className="mono text-[0.62rem] uppercase text-[var(--accent)] hover:underline cursor-pointer font-bold flex items-center gap-1"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Route To</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Educational Note on Distance & GPS accuracy */}
          <div className="p-3 cockpit-subcard text-[10.5px] text-[var(--ink-dim)] leading-relaxed mt-4">
            <div className="font-bold text-[var(--ink)] flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Why is there a distance between devices in the same building?</span>
            </div>
            Smartphones have hardware satellite GPS (±3–8m accuracy), while laptops use Wi-Fi network location (±30–100m accuracy). An indoor variance of 30–50 meters is normal. When riding or driving on the road under an open sky, both devices lock onto satellites with high precision.
          </div>
        </div>
      )}

      {/* QR Code Mobile Bottom-Sheet Modal for Scanning from Phone Camera */}
      {showQrModal && roomCode && (
        <div className="fixed inset-0 z-[1200] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="cockpit-shell border-t sm:border border-[var(--border)] rounded-t-3xl sm:rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-sm w-full text-center space-y-4 shadow-2xl animate-in fade-in duration-150">
            <div className="w-10 h-1 rounded-full bg-purple-400/35 mx-auto sm:hidden" />
            <div className="flex items-center justify-between">
              <span className="mono text-xs uppercase tracking-wider font-bold text-[var(--ink)]">
                Scan to Join Convoy
              </span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                aria-label="Close QR dialog"
                className="w-8 h-8 rounded-full cockpit-pill text-[var(--ink-dim)] hover:text-[var(--ink)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!qrError ? (
              <div className="p-4 bg-white rounded-2xl inline-block mx-auto shadow-inner">
                <img
                  src={buildQrCodeImageUrl(shareUrl, 220)}
                  alt={`QR code for convoy room ${roomCode}`}
                  width={220}
                  height={220}
                  onError={() => setQrError(true)}
                  className="w-52 h-52 object-contain"
                />
              </div>
            ) : (
              <div className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-2xl space-y-2">
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
