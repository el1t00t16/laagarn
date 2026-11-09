import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import {
  ConvoyPeer,
  ConvoyTelemetryPacket,
  ConvoyVehicleType,
  ConvoySharedRoute,
  generateConvoyRoomCode,
  getOrCreatePeerId,
  getSavedColor,
  getSavedNickname,
  getSavedVehicle,
  normalizeConvoyCode,
  getConvoyTopic,
  saveNickname,
  saveVehicle,
  enrichPeerMetrics,
} from '../utils/convoySync';

export interface UseConvoyReturn {
  roomCode: string | null;
  isSharing: boolean;
  myName: string;
  myVehicle: ConvoyVehicleType;
  myColor: string;
  peers: ConvoyPeer[];
  activePeersCount: number;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastBroadcastAt: number | null;
  sharedRoute: ConvoySharedRoute | null;
  routeSuggestions: ConvoySharedRoute[];
  createConvoy: (customCode?: string) => void;
  joinConvoy: (code: string) => void;
  leaveConvoy: () => void;
  updateProfile: (name: string, vehicle: ConvoyVehicleType, color: string) => void;
  shareRouteToConvoy: (route: ConvoySharedRoute) => void;
  suggestRouteToConvoy: (route: ConvoySharedRoute) => void;
  clearSharedRoute: () => void;
  dismissRouteSuggestion: (id: string) => void;
}

export function useConvoy(gpsState: GpsPositionState | null): UseConvoyReturn {
  const peerIdRef = useRef<string>(getOrCreatePeerId());
  const [roomCode, setRoomCode] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const urlCode = new URLSearchParams(window.location.search).get('convoy');
      if (urlCode) return normalizeConvoyCode(urlCode);
      const stored = localStorage.getItem('laagarn_convoy_code');
      return stored ? normalizeConvoyCode(stored) : null;
    }
    return null;
  });

  const [isSharing, setIsSharing] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlCode = new URLSearchParams(window.location.search).get('convoy');
      return Boolean(urlCode);
    }
    return false;
  });

  const [myName, setMyName] = useState<string>(() => getSavedNickname());
  const [myVehicle, setMyVehicle] = useState<ConvoyVehicleType>(() => getSavedVehicle());
  const [myColor, setMyColor] = useState<string>(() => getSavedColor());
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected');
  const [lastBroadcastAt, setLastBroadcastAt] = useState<number | null>(null);

  // Map of remote peers: peerId -> ConvoyPeer
  const [peersMap, setPeersMap] = useState<Record<string, ConvoyPeer>>({});

  // Shared route states
  const [sharedRoute, setSharedRoute] = useState<ConvoySharedRoute | null>(null);
  const [routeSuggestions, setRouteSuggestions] = useState<ConvoySharedRoute[]>([]);
  const sharedRouteRef = useRef<ConvoySharedRoute | null>(null);
  sharedRouteRef.current = sharedRoute;

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  // Keep latest refs to avoid stale closures
  const stateRef = useRef({
    roomCode,
    isSharing,
    myName,
    myVehicle,
    myColor,
    gpsState,
  });
  stateRef.current = { roomCode, isSharing, myName, myVehicle, myColor, gpsState };

  // Battery level helper
  const batteryLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any).getBattery?.().then((batt: any) => {
        batteryLevelRef.current = batt.level;
        batt.addEventListener('levelchange', () => {
          batteryLevelRef.current = batt.level;
        });
      }).catch(() => {
        // Battery API not permitted, ignore
      });
    }
  }, []);

  // Broadcast packet to peers (via HTTP POST to Ntfy and local BroadcastChannel)
  const broadcastPacket = useCallback((packet: ConvoyTelemetryPacket) => {
    const raw = JSON.stringify(packet);

    // 1. Primary Network Delivery: HTTP POST to Ntfy topic
    if (stateRef.current.roomCode) {
      const topic = getConvoyTopic(stateRef.current.roomCode);
      fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
      }).catch(() => {
        // Ignore network drops gracefully
      });
    }

    // 2. Cross-tab synchronization via BroadcastChannel
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage(packet);
      } catch {
        // Ignore broadcast error
      }
    }

    setLastBroadcastAt(Date.now());
  }, []);

  // Send leave notification when exiting
  const sendLeavePacket = useCallback(() => {
    if (!stateRef.current.roomCode) return;
    const packet: ConvoyTelemetryPacket = {
      type: 'leave',
      peerId: peerIdRef.current,
      name: stateRef.current.myName,
      vehicle: stateRef.current.myVehicle,
      color: stateRef.current.myColor,
      lat: stateRef.current.gpsState?.lat ?? 0,
      lng: stateRef.current.gpsState?.lng ?? 0,
      heading: null,
      speedKmh: null,
      updatedAt: Date.now(),
    };
    broadcastPacket(packet);
  }, [broadcastPacket]);

  // Handle incoming packets
  const handleIncomingPacket = useCallback((packet: ConvoyTelemetryPacket) => {
    if (!packet || !packet.peerId || packet.peerId === peerIdRef.current) {
      return; // Ignore self packets
    }

    if (packet.type === 'leave') {
      setPeersMap((prev) => {
        const next = { ...prev };
        delete next[packet.peerId];
        return next;
      });
      return;
    }

    if (packet.type === 'ping') {
      // Record peer if coordinates are available
      if (packet.lat && packet.lng) {
        const newPeer: ConvoyPeer = {
          id: packet.peerId,
          name: packet.name || 'Friend',
          vehicle: packet.vehicle || 'motorcycle',
          color: packet.color || '#06b6d4',
          lat: packet.lat,
          lng: packet.lng,
          heading: packet.heading,
          speedKmh: packet.speedKmh,
          batteryLevel: packet.batteryLevel,
          updatedAt: packet.updatedAt || Date.now(),
          status: 'active',
          isSelf: false,
        };
        setPeersMap((prev) => ({ ...prev, [packet.peerId]: newPeer }));
      }

      // Immediately respond with our current status and shared route
      const replyPacket: ConvoyTelemetryPacket = {
        type: 'telemetry',
        peerId: peerIdRef.current,
        name: stateRef.current.myName,
        vehicle: stateRef.current.myVehicle,
        color: stateRef.current.myColor,
        lat: stateRef.current.gpsState?.lat ?? 0,
        lng: stateRef.current.gpsState?.lng ?? 0,
        heading: stateRef.current.gpsState?.heading ?? null,
        speedKmh: stateRef.current.gpsState?.speedKmh ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route: sharedRouteRef.current || undefined,
      };
      broadcastPacket(replyPacket);

      // If peer provided a shared route, adopt it
      if (packet.route && !sharedRouteRef.current) {
        setSharedRoute(packet.route);
      }
      return;
    }

    if (packet.type === 'telemetry') {
      if (packet.lat && packet.lng) {
        const newPeer: ConvoyPeer = {
          id: packet.peerId,
          name: packet.name || 'Friend',
          vehicle: packet.vehicle || 'motorcycle',
          color: packet.color || '#06b6d4',
          lat: packet.lat,
          lng: packet.lng,
          heading: packet.heading,
          speedKmh: packet.speedKmh,
          batteryLevel: packet.batteryLevel,
          updatedAt: packet.updatedAt || Date.now(),
          status: 'active',
          isSelf: false,
        };

        setPeersMap((prev) => ({
          ...prev,
          [packet.peerId]: newPeer,
        }));
      }

      if (packet.route && !sharedRouteRef.current) {
        setSharedRoute(packet.route);
      }
      return;
    }

    if (packet.type === 'route_share' && packet.route) {
      setSharedRoute(packet.route);
      return;
    }

    if (packet.type === 'route_suggest' && packet.route) {
      setRouteSuggestions((prev) => {
        const exists = prev.some((r) => r.id === packet.route?.id);
        if (exists) return prev;
        return [packet.route!, ...prev.slice(0, 4)];
      });
      return;
    }
  }, [broadcastPacket]);

  // Connect to room transport
  useEffect(() => {
    if (!roomCode || !isSharing) {
      setConnectionStatus('disconnected');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      setPeersMap({});
      return;
    }

    setConnectionStatus('connecting');
    const topic = getConvoyTopic(roomCode);

    // 1. Setup BroadcastChannel for instant local cross-tab communication
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(`laagarn_convoy_${topic}`);
        bc.onmessage = (ev) => {
          handleIncomingPacket(ev.data);
        };
        broadcastChannelRef.current = bc;
      }
    } catch {
      // BroadcastChannel optional
    }

    // 2. Setup WebSocket and SSE fallback for receiving remote peer broadcasts
    let isCancelled = false;

    const setupFallbackSSE = () => {
      if (isCancelled || sseRef.current) return;
      try {
        const sse = new EventSource(`https://ntfy.sh/${topic}/sse`);
        sseRef.current = sse;
        sse.onopen = () => {
          if (isCancelled) return;
          setConnectionStatus('connected');
        };
        sse.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const raw = JSON.parse(event.data);
            if (raw.event === 'message' && raw.message) {
              const parsed = JSON.parse(raw.message);
              handleIncomingPacket(parsed);
            }
          } catch {
            // Ignore non-json
          }
        };
        sse.onerror = () => {
          if (isCancelled) return;
          setConnectionStatus('connecting');
        };
      } catch {
        // SSE not supported or blocked
      }
    };

    const connectTransport = () => {
      if (isCancelled) return;

      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      try {
        const ws = new WebSocket(`wss://ntfy.sh/${topic}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCancelled) return;
          setConnectionStatus('connected');

          // Immediately send handshake ping packet
          const pingPacket: ConvoyTelemetryPacket = {
            type: 'ping',
            peerId: peerIdRef.current,
            name: stateRef.current.myName,
            vehicle: stateRef.current.myVehicle,
            color: stateRef.current.myColor,
            lat: stateRef.current.gpsState?.lat ?? 0,
            lng: stateRef.current.gpsState?.lng ?? 0,
            heading: stateRef.current.gpsState?.heading ?? null,
            speedKmh: stateRef.current.gpsState?.speedKmh ?? null,
            batteryLevel: batteryLevelRef.current,
            updatedAt: Date.now(),
            route: sharedRouteRef.current || undefined,
          };
          broadcastPacket(pingPacket);
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const raw = JSON.parse(event.data);
            if (raw.event === 'message' && raw.message) {
              const parsed = JSON.parse(raw.message);
              handleIncomingPacket(parsed);
            }
          } catch {
            // Non-JSON or keep-alive message, ignore
          }
        };

        ws.onerror = () => {
          if (isCancelled) return;
          // If WebSocket has error, activate SSE fallback
          setupFallbackSSE();
        };

        ws.onclose = () => {
          if (isCancelled) return;
          setConnectionStatus('connecting');
          setupFallbackSSE();
          reconnectTimerRef.current = setTimeout(connectTransport, 5000);
        };
      } catch {
        if (!isCancelled) {
          setupFallbackSSE();
          reconnectTimerRef.current = setTimeout(connectTransport, 6000);
        }
      }
    };

    connectTransport();

    return () => {
      isCancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, [roomCode, isSharing, handleIncomingPacket, broadcastPacket]);

  // Immediate Telemetry Broadcast when GPS acquires its first fix
  const prevGpsStateRef = useRef<GpsPositionState | null>(null);
  useEffect(() => {
    if (!prevGpsStateRef.current && gpsState && roomCode && isSharing) {
      const initialPacket: ConvoyTelemetryPacket = {
        type: 'telemetry',
        peerId: peerIdRef.current,
        name: myName,
        vehicle: myVehicle,
        color: myColor,
        lat: gpsState.lat,
        lng: gpsState.lng,
        heading: gpsState.heading,
        speedKmh: gpsState.speedKmh,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route: sharedRouteRef.current || undefined,
      };
      broadcastPacket(initialPacket);
    }
    prevGpsStateRef.current = gpsState;
  }, [gpsState, roomCode, isSharing, myName, myVehicle, myColor, broadcastPacket]);

  // Periodic GPS Telemetry Broadcast (every 4 seconds when sharing)
  useEffect(() => {
    if (!roomCode || !isSharing) return;

    const interval = setInterval(() => {
      const packet: ConvoyTelemetryPacket = {
        type: 'telemetry',
        peerId: peerIdRef.current,
        name: myName,
        vehicle: myVehicle,
        color: myColor,
        lat: gpsState?.lat ?? 0,
        lng: gpsState?.lng ?? 0,
        heading: gpsState?.heading ?? null,
        speedKmh: gpsState?.speedKmh ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route: sharedRouteRef.current || undefined,
      };
      broadcastPacket(packet);
    }, 4000);

    return () => clearInterval(interval);
  }, [roomCode, isSharing, gpsState, myName, myVehicle, myColor, broadcastPacket]);

  // Periodic Peer Pruning (removes peers inactive for > 4 minutes)
  useEffect(() => {
    const pruneTimer = setInterval(() => {
      const now = Date.now();
      setPeersMap((prev) => {
        let changed = false;
        const next: Record<string, ConvoyPeer> = {};
        for (const [id, peer] of Object.entries(prev)) {
          if (now - peer.updatedAt < 240000) {
            next[id] = peer;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 15000);

    return () => clearInterval(pruneTimer);
  }, []);

  // User Actions
  const createConvoy = useCallback((customCode?: string) => {
    const code = customCode ? normalizeConvoyCode(customCode) : generateConvoyRoomCode();
    setRoomCode(code);
    setIsSharing(true);
    try {
      localStorage.setItem('laagarn_convoy_code', code);
      if (typeof window !== 'undefined' && window.history) {
        const url = new URL(window.location.href);
        url.searchParams.set('convoy', code);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Ignore
    }
  }, []);

  const joinConvoy = useCallback((code: string) => {
    const clean = normalizeConvoyCode(code);
    if (!clean) return;
    setRoomCode(clean);
    setIsSharing(true);
    try {
      localStorage.setItem('laagarn_convoy_code', clean);
      if (typeof window !== 'undefined' && window.history) {
        const url = new URL(window.location.href);
        url.searchParams.set('convoy', clean);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Ignore
    }
  }, []);

  const leaveConvoy = useCallback(() => {
    sendLeavePacket();
    setIsSharing(false);
    setRoomCode(null);
    setPeersMap({});
    setSharedRoute(null);
    setRouteSuggestions([]);
    try {
      localStorage.removeItem('laagarn_convoy_code');
      if (typeof window !== 'undefined' && window.history) {
        const url = new URL(window.location.href);
        if (url.searchParams.has('convoy')) {
          url.searchParams.delete('convoy');
          const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
          window.history.replaceState({}, '', cleanUrl || '/');
        }
      }
    } catch {
      // Ignore
    }
  }, [sendLeavePacket]);

  const updateProfile = useCallback(
    (name: string, vehicle: ConvoyVehicleType, color: string) => {
      const cleanName = name.trim() || 'Rider Buddy';
      setMyName(cleanName);
      setMyVehicle(vehicle);
      setMyColor(color);
      saveNickname(cleanName);
      saveVehicle(vehicle);
      try {
        localStorage.setItem('laagarn_color', color);
      } catch {
        // Ignore
      }

      // Immediately broadcast profile update if connected
      if (roomCode && isSharing) {
        const packet: ConvoyTelemetryPacket = {
          type: 'telemetry',
          peerId: peerIdRef.current,
          name: cleanName,
          vehicle,
          color,
          lat: gpsState?.lat ?? 0,
          lng: gpsState?.lng ?? 0,
          heading: gpsState?.heading ?? null,
          speedKmh: gpsState?.speedKmh ?? null,
          batteryLevel: batteryLevelRef.current,
          updatedAt: Date.now(),
          route: sharedRouteRef.current || undefined,
        };
        broadcastPacket(packet);
      }
    },
    [roomCode, isSharing, gpsState, broadcastPacket]
  );

  const shareRouteToConvoy = useCallback(
    (route: ConvoySharedRoute) => {
      setSharedRoute(route);
      sharedRouteRef.current = route;
      const packet: ConvoyTelemetryPacket = {
        type: 'route_share',
        peerId: peerIdRef.current,
        name: stateRef.current.myName,
        vehicle: stateRef.current.myVehicle,
        color: stateRef.current.myColor,
        lat: stateRef.current.gpsState?.lat ?? 0,
        lng: stateRef.current.gpsState?.lng ?? 0,
        heading: stateRef.current.gpsState?.heading ?? null,
        speedKmh: stateRef.current.gpsState?.speedKmh ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route,
      };
      broadcastPacket(packet);
    },
    [broadcastPacket]
  );

  const suggestRouteToConvoy = useCallback(
    (route: ConvoySharedRoute) => {
      const packet: ConvoyTelemetryPacket = {
        type: 'route_suggest',
        peerId: peerIdRef.current,
        name: stateRef.current.myName,
        vehicle: stateRef.current.myVehicle,
        color: stateRef.current.myColor,
        lat: stateRef.current.gpsState?.lat ?? 0,
        lng: stateRef.current.gpsState?.lng ?? 0,
        heading: stateRef.current.gpsState?.heading ?? null,
        speedKmh: stateRef.current.gpsState?.speedKmh ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route,
      };
      broadcastPacket(packet);
    },
    [broadcastPacket]
  );

  const clearSharedRoute = useCallback(() => {
    setSharedRoute(null);
    sharedRouteRef.current = null;
  }, []);

  const dismissRouteSuggestion = useCallback((id: string) => {
    setRouteSuggestions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Return peers enriched with relative distance and cardinal bearing
  const peers = useMemo(() => {
    return Object.values(peersMap)
      .map((p) => enrichPeerMetrics(p, gpsState?.lat, gpsState?.lng))
      .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }, [peersMap, gpsState?.lat, gpsState?.lng]);

  const activePeersCount = peers.filter((p) => p.status === 'active' || p.status === 'idle').length;

  return {
    roomCode,
    isSharing,
    myName,
    myVehicle,
    myColor,
    peers,
    activePeersCount,
    connectionStatus,
    lastBroadcastAt,
    sharedRoute,
    routeSuggestions,
    createConvoy,
    joinConvoy,
    leaveConvoy,
    updateProfile,
    shareRouteToConvoy,
    suggestRouteToConvoy,
    clearSharedRoute,
    dismissRouteSuggestion,
  };
}
