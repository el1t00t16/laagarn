import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import {
  ConvoyPeer,
  ConvoyTelemetryPacket,
  ConvoyJoinRequest,
  ConvoyVehicleType,
  ConvoySharedRoute,
  generateConvoyRoomCode,
  getOrCreatePeerId,
  getSavedColor,
  getSavedNickname,
  getSavedVehicle,
  normalizeConvoyCode,
  getConvoyTopic,
  getConvoyMqttTopic,
  saveNickname,
  saveVehicle,
  enrichPeerMetrics,
} from '../utils/convoySync';

export interface UseConvoyReturn {
  roomCode: string | null;
  isSharing: boolean;
  isHost: boolean;
  joinApprovalStatus: 'idle' | 'pending' | 'accepted' | 'declined';
  pendingJoinRequests: ConvoyJoinRequest[];
  autoAccept: boolean;
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
  cancelJoinRequest: () => void;
  acceptJoinRequest: (peerId: string) => void;
  declineJoinRequest: (peerId: string) => void;
  setAutoAccept: (val: boolean) => void;
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

  const [isHost, setIsHost] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('laagarn_convoy_is_host');
      return stored !== 'false';
    }
    return true;
  });

  const [joinApprovalStatus, setJoinApprovalStatus] = useState<
    'idle' | 'pending' | 'accepted' | 'declined'
  >(() => {
    if (typeof window !== 'undefined') {
      const storedHost = localStorage.getItem('laagarn_convoy_is_host');
      if (storedHost !== 'false') return 'accepted';
      const code = localStorage.getItem('laagarn_convoy_code');
      const isApproved = code && localStorage.getItem(`laagarn_approved_${code}`) === 'true';
      return isApproved ? 'accepted' : 'idle';
    }
    return 'accepted';
  });

  const [pendingJoinRequests, setPendingJoinRequests] = useState<ConvoyJoinRequest[]>([]);
  const [autoAccept, setAutoAcceptState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('laagarn_convoy_auto_accept') === 'true';
    }
    return false;
  });

  const approvedPeerIdsRef = useRef<Set<string>>(new Set());

  const setAutoAccept = useCallback((val: boolean) => {
    setAutoAcceptState(val);
    try {
      localStorage.setItem('laagarn_convoy_auto_accept', String(val));
    } catch {}
  }, []);

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

  const mqttClientRef = useRef<MqttClient | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Keep latest refs to avoid stale closures
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const autoAcceptRef = useRef(autoAccept);
  autoAcceptRef.current = autoAccept;

  const joinApprovalStatusRef = useRef(joinApprovalStatus);
  joinApprovalStatusRef.current = joinApprovalStatus;

  const stateRef = useRef({
    roomCode,
    isSharing,
    isHost,
    myName,
    myVehicle,
    myColor,
    gpsState,
  });
  stateRef.current = { roomCode, isSharing, isHost, myName, myVehicle, myColor, gpsState };

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

  // Broadcast packet to peers (via MQTT over WebSocket and local BroadcastChannel)
  const broadcastPacket = useCallback((packet: ConvoyTelemetryPacket) => {
    const raw = JSON.stringify(packet);

    // 1. Primary Network Delivery: MQTT publish to broker
    if (mqttClientRef.current && mqttClientRef.current.connected && stateRef.current.roomCode) {
      const topic = getConvoyMqttTopic(stateRef.current.roomCode);
      try {
        mqttClientRef.current.publish(topic, raw, { qos: 0 });
      } catch (err) {
        console.warn('Convoy MQTT publish error:', err);
      }
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
      accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
      updatedAt: Date.now(),
      isHost: stateRef.current.isHost,
    };
    broadcastPacket(packet);
  }, [broadcastPacket]);

  // Handle incoming packets
  const handleIncomingPacket = useCallback((packet: ConvoyTelemetryPacket) => {
    if (!packet || !packet.peerId || packet.peerId === peerIdRef.current) {
      return; // Ignore self packets
    }

    // 1. Member left room
    if (packet.type === 'leave') {
      setPeersMap((prev) => {
        const next = { ...prev };
        delete next[packet.peerId];
        return next;
      });
      setPendingJoinRequests((prev) => prev.filter((r) => r.peerId !== packet.peerId));
      return;
    }

    // 2. Join Request (Received by Host)
    if (packet.type === 'join_request') {
      if (!isHostRef.current) return; // Only host evaluates join requests

      // If autoAccept is enabled or previously approved, immediately accept
      if (autoAcceptRef.current || approvedPeerIdsRef.current.has(packet.peerId)) {
        approvedPeerIdsRef.current.add(packet.peerId);
        const acceptPacket: ConvoyTelemetryPacket = {
          type: 'join_accepted',
          targetPeerId: packet.peerId,
          peerId: peerIdRef.current,
          name: stateRef.current.myName,
          vehicle: stateRef.current.myVehicle,
          color: stateRef.current.myColor,
          lat: stateRef.current.gpsState?.lat ?? 0,
          lng: stateRef.current.gpsState?.lng ?? 0,
          heading: stateRef.current.gpsState?.heading ?? null,
          speedKmh: stateRef.current.gpsState?.speedKmh ?? null,
          accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
          updatedAt: Date.now(),
          route: sharedRouteRef.current || undefined,
          isHost: true,
        };
        broadcastPacket(acceptPacket);
        return;
      }

      // Add to pending requests for host manual approval
      setPendingJoinRequests((prev) => {
        if (prev.some((r) => r.peerId === packet.peerId)) return prev;
        return [
          ...prev,
          {
            peerId: packet.peerId,
            name: packet.name || 'Friend',
            vehicle: packet.vehicle || 'motorcycle',
            color: packet.color || '#06b6d4',
            lat: packet.lat,
            lng: packet.lng,
            accuracyMeters: packet.accuracyMeters,
            timestamp: Date.now(),
          },
        ];
      });
      return;
    }

    // 3. Join Accepted (Received by Joiner)
    if (packet.type === 'join_accepted') {
      if (packet.targetPeerId === peerIdRef.current) {
        setJoinApprovalStatus('accepted');
        if (stateRef.current.roomCode) {
          try {
            localStorage.setItem(`laagarn_approved_${stateRef.current.roomCode}`, 'true');
          } catch {}
        }

        // Add host to peers map
        if (packet.lat && packet.lng) {
          const hostPeer: ConvoyPeer = {
            id: packet.peerId,
            name: packet.name || 'Convoy Host',
            vehicle: packet.vehicle || 'motorcycle',
            color: packet.color || '#8b5cf6',
            lat: packet.lat,
            lng: packet.lng,
            heading: packet.heading,
            speedKmh: packet.speedKmh,
            accuracyMeters: packet.accuracyMeters,
            batteryLevel: packet.batteryLevel,
            updatedAt: packet.updatedAt || Date.now(),
            status: 'active',
            isHost: true,
          };
          setPeersMap((prev) => ({ ...prev, [packet.peerId]: hostPeer }));
        }

        if (packet.route && !sharedRouteRef.current) {
          setSharedRoute(packet.route);
        }

        // Send our live telemetry back to host
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
          accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
          batteryLevel: batteryLevelRef.current,
          updatedAt: Date.now(),
          isHost: false,
        };
        broadcastPacket(replyPacket);
      }
      return;
    }

    // 4. Join Declined (Received by Joiner)
    if (packet.type === 'join_declined') {
      if (packet.targetPeerId === peerIdRef.current) {
        setJoinApprovalStatus('declined');
      }
      return;
    }

    // 5. Ping (Handshake)
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
          accuracyMeters: packet.accuracyMeters,
          batteryLevel: packet.batteryLevel,
          updatedAt: packet.updatedAt || Date.now(),
          status: 'active',
          isSelf: false,
          isHost: Boolean(packet.isHost),
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
        accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route: sharedRouteRef.current || undefined,
        isHost: isHostRef.current,
      };
      broadcastPacket(replyPacket);

      // If peer provided a shared route, adopt it
      if (packet.route && !sharedRouteRef.current) {
        setSharedRoute(packet.route);
      }
      return;
    }

    // 6. Telemetry update
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
          accuracyMeters: packet.accuracyMeters,
          batteryLevel: packet.batteryLevel,
          updatedAt: packet.updatedAt || Date.now(),
          status: 'active',
          isSelf: false,
          isHost: Boolean(packet.isHost),
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

    // 7. Route Share
    if (packet.type === 'route_share' && packet.route) {
      setSharedRoute(packet.route);
      return;
    }

    // 8. Route Suggestion
    if (packet.type === 'route_suggest' && packet.route) {
      setRouteSuggestions((prev) => {
        const exists = prev.some((r) => r.id === packet.route?.id);
        if (exists) return prev;
        return [packet.route!, ...prev.slice(0, 4)];
      });
      return;
    }
  }, [broadcastPacket]);

  // Connect to room transport via EMQX MQTT over WebSocket
  useEffect(() => {
    if (!roomCode || !isSharing) {
      setConnectionStatus('disconnected');
      if (mqttClientRef.current) {
        try {
          mqttClientRef.current.end(true);
        } catch {}
        mqttClientRef.current = null;
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      setPeersMap({});
      return;
    }

    setConnectionStatus('connecting');
    const topic = getConvoyMqttTopic(roomCode);

    // 1. Setup BroadcastChannel for instant local cross-tab communication
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(`laagarn_convoy_${topic.replace(/\//g, '_')}`);
        bc.onmessage = (ev) => {
          handleIncomingPacket(ev.data);
        };
        broadcastChannelRef.current = bc;
      }
    } catch {
      // BroadcastChannel optional
    }

    // 2. Connect to high-reliability EMQX public MQTT WebSocket broker
    let isCancelled = false;
    const clientId = `laagarn_${peerIdRef.current}_${Math.random().toString(16).slice(2, 6)}`;

    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2500,
      connectTimeout: 8000,
    });
    mqttClientRef.current = client;

    client.on('connect', () => {
      if (isCancelled) return;
      setConnectionStatus('connected');

      // Subscribe to the shared convoy topic
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (err || isCancelled) return;

        // If Host: send immediate ping
        // If Joiner: send join_request (or ping if already accepted)
        if (isHostRef.current || joinApprovalStatusRef.current === 'accepted') {
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
            accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
            batteryLevel: batteryLevelRef.current,
            updatedAt: Date.now(),
            route: sharedRouteRef.current || undefined,
            isHost: isHostRef.current,
          };
          try {
            client.publish(topic, JSON.stringify(pingPacket), { qos: 0 });
          } catch {}
        } else {
          // Send Join Request to Host
          const reqPacket: ConvoyTelemetryPacket = {
            type: 'join_request',
            peerId: peerIdRef.current,
            name: stateRef.current.myName,
            vehicle: stateRef.current.myVehicle,
            color: stateRef.current.myColor,
            lat: stateRef.current.gpsState?.lat ?? 0,
            lng: stateRef.current.gpsState?.lng ?? 0,
            heading: stateRef.current.gpsState?.heading ?? null,
            speedKmh: stateRef.current.gpsState?.speedKmh ?? null,
            accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
            updatedAt: Date.now(),
            isHost: false,
          };
          try {
            client.publish(topic, JSON.stringify(reqPacket), { qos: 0 });
          } catch {}
        }
      });
    });

    client.on('message', (_receivedTopic, message) => {
      if (isCancelled) return;
      try {
        const parsed = JSON.parse(message.toString());
        handleIncomingPacket(parsed);
      } catch {
        // Ignore non-json or corrupt message
      }
    });

    client.on('reconnect', () => {
      if (isCancelled) return;
      setConnectionStatus('connecting');
    });

    client.on('close', () => {
      if (isCancelled) return;
      setConnectionStatus('connecting');
    });

    client.on('error', (err) => {
      if (isCancelled) return;
      console.warn('Convoy MQTT connection error:', err);
    });

    return () => {
      isCancelled = true;
      if (client) {
        try {
          client.end(true);
        } catch {}
        if (mqttClientRef.current === client) {
          mqttClientRef.current = null;
        }
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, [roomCode, isSharing, handleIncomingPacket]);

  // Immediate Telemetry Broadcast when GPS acquires its first fix (only if accepted)
  const prevGpsStateRef = useRef<GpsPositionState | null>(null);
  useEffect(() => {
    if (
      !prevGpsStateRef.current &&
      gpsState &&
      roomCode &&
      isSharing &&
      (isHost || joinApprovalStatus === 'accepted')
    ) {
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
        accuracyMeters: gpsState.accuracyMeters,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route: sharedRouteRef.current || undefined,
        isHost,
      };
      broadcastPacket(initialPacket);
    }
    prevGpsStateRef.current = gpsState;
  }, [gpsState, roomCode, isSharing, isHost, joinApprovalStatus, myName, myVehicle, myColor, broadcastPacket]);

  // Periodic GPS Telemetry Broadcast (every 4 seconds when sharing and accepted)
  useEffect(() => {
    if (!roomCode || !isSharing) return;
    if (!isHost && joinApprovalStatus !== 'accepted') return;

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
        accuracyMeters: gpsState?.accuracyMeters ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route: sharedRouteRef.current || undefined,
        isHost,
      };
      broadcastPacket(packet);
    }, 4000);

    return () => clearInterval(interval);
  }, [roomCode, isSharing, isHost, joinApprovalStatus, gpsState, myName, myVehicle, myColor, broadcastPacket]);

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
    setIsHost(true);
    setJoinApprovalStatus('accepted');
    setRoomCode(code);
    setIsSharing(true);
    setPendingJoinRequests([]);
    approvedPeerIdsRef.current.clear();
    try {
      localStorage.setItem('laagarn_convoy_code', code);
      localStorage.setItem('laagarn_convoy_is_host', 'true');
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
    setIsHost(false);
    setJoinApprovalStatus('pending');
    setRoomCode(clean);
    setIsSharing(true);
    setPendingJoinRequests([]);
    try {
      localStorage.setItem('laagarn_convoy_code', clean);
      localStorage.setItem('laagarn_convoy_is_host', 'false');
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
    setJoinApprovalStatus('idle');
    setPendingJoinRequests([]);
    setPeersMap({});
    setSharedRoute(null);
    setRouteSuggestions([]);
    try {
      localStorage.removeItem('laagarn_convoy_code');
      localStorage.removeItem('laagarn_convoy_is_host');
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

  const cancelJoinRequest = useCallback(() => {
    leaveConvoy();
  }, [leaveConvoy]);

  const acceptJoinRequest = useCallback(
    (peerId: string) => {
      setPendingJoinRequests((prev) => prev.filter((r) => r.peerId !== peerId));
      approvedPeerIdsRef.current.add(peerId);

      // Save to local storage for persistent reconnects
      if (stateRef.current.roomCode) {
        try {
          const key = `laagarn_convoy_approved_${stateRef.current.roomCode}`;
          const existing = JSON.parse(localStorage.getItem(key) || '[]');
          if (!existing.includes(peerId)) {
            localStorage.setItem(key, JSON.stringify([...existing, peerId]));
          }
        } catch {}
      }

      // Broadcast join_accepted to notify the joiner
      const packet: ConvoyTelemetryPacket = {
        type: 'join_accepted',
        targetPeerId: peerId,
        peerId: peerIdRef.current,
        name: stateRef.current.myName,
        vehicle: stateRef.current.myVehicle,
        color: stateRef.current.myColor,
        lat: stateRef.current.gpsState?.lat ?? 0,
        lng: stateRef.current.gpsState?.lng ?? 0,
        heading: stateRef.current.gpsState?.heading ?? null,
        speedKmh: stateRef.current.gpsState?.speedKmh ?? null,
        accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
        updatedAt: Date.now(),
        route: sharedRouteRef.current || undefined,
        isHost: true,
      };
      broadcastPacket(packet);
    },
    [broadcastPacket]
  );

  const declineJoinRequest = useCallback(
    (peerId: string) => {
      setPendingJoinRequests((prev) => prev.filter((r) => r.peerId !== peerId));
      approvedPeerIdsRef.current.delete(peerId);

      const packet: ConvoyTelemetryPacket = {
        type: 'join_declined',
        targetPeerId: peerId,
        peerId: peerIdRef.current,
        name: stateRef.current.myName,
        vehicle: stateRef.current.myVehicle,
        color: stateRef.current.myColor,
        lat: 0,
        lng: 0,
        heading: null,
        speedKmh: null,
        accuracyMeters: null,
        updatedAt: Date.now(),
        isHost: true,
      };
      broadcastPacket(packet);
    },
    [broadcastPacket]
  );

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
          accuracyMeters: gpsState?.accuracyMeters ?? null,
          batteryLevel: batteryLevelRef.current,
          updatedAt: Date.now(),
          route: sharedRouteRef.current || undefined,
          isHost,
        };
        broadcastPacket(packet);
      }
    },
    [roomCode, isSharing, isHost, gpsState, broadcastPacket]
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
        accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route,
        isHost: isHostRef.current,
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
        accuracyMeters: stateRef.current.gpsState?.accuracyMeters ?? null,
        batteryLevel: batteryLevelRef.current,
        updatedAt: Date.now(),
        route,
        isHost: isHostRef.current,
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
    isHost,
    joinApprovalStatus,
    pendingJoinRequests,
    autoAccept,
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
    cancelJoinRequest,
    acceptJoinRequest,
    declineJoinRequest,
    setAutoAccept,
    updateProfile,
    shareRouteToConvoy,
    suggestRouteToConvoy,
    clearSharedRoute,
    dismissRouteSuggestion,
  };
}
