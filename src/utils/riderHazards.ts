import { TrafficIncident, TrafficSeverity } from './routingEngine';

export type RiderHazardType =
  | 'gravel'
  | 'flood'
  | 'landslide'
  | 'construction'
  | 'crash'
  | 'checkpoint';

export interface RiderHazardPreset {
  id: RiderHazardType;
  label: string;
  iconName: string;
  severity: TrafficSeverity;
  delayMinutes: number;
  speedKmh: number;
  defaultDescription: string;
  safetyAdvice: string;
}

export const RIDER_HAZARD_PRESETS: RiderHazardPreset[] = [
  {
    id: 'gravel',
    label: 'Loose Gravel / Sand',
    iconName: 'AlertOctagon',
    severity: 'heavy',
    delayMinutes: 8,
    speedKmh: 20,
    defaultDescription: 'Slick loose gravel / sand on road surface. High slip risk on two wheels.',
    safetyAdvice: 'Reduce speed, avoid sudden braking or lean angles, stay upright.',
  },
  {
    id: 'landslide',
    label: 'Rockfall / Landslide',
    iconName: 'Mountain',
    severity: 'closure',
    delayMinutes: 25,
    speedKmh: 10,
    defaultDescription: 'Debris / rocks fallen onto highway lane. Single lane passable.',
    safetyAdvice: 'Slow down significantly, watch for falling debris, follow flaggers.',
  },
  {
    id: 'flood',
    label: 'Flooding / Slick Mud',
    iconName: 'Waves',
    severity: 'heavy',
    delayMinutes: 15,
    speedKmh: 15,
    defaultDescription: 'Submerged road portion / thick mud from mountain runoff.',
    safetyAdvice: 'Do not cross moving water, maintain low gear and steady throttle.',
  },
  {
    id: 'construction',
    label: 'Roadwork / Unpaved',
    iconName: 'Construction',
    severity: 'moderate',
    delayMinutes: 10,
    speedKmh: 25,
    defaultDescription: 'Road re-blocking / unpaved detour. Dusty and uneven surface.',
    safetyAdvice: 'Maintain safe distance from dump trucks and heavy machinery.',
  },
  {
    id: 'crash',
    label: 'Accident / Blockage',
    iconName: 'AlertTriangle',
    severity: 'heavy',
    delayMinutes: 20,
    speedKmh: 15,
    defaultDescription: 'Vehicular collision blocking highway lane. Emergency units on scene.',
    safetyAdvice: 'Expect queueing, give way to ambulances, follow local traffic enforcers.',
  },
  {
    id: 'checkpoint',
    label: 'Highway Checkpoint',
    iconName: 'ShieldAlert',
    severity: 'moderate',
    delayMinutes: 6,
    speedKmh: 20,
    defaultDescription: 'PNP / LTO inspection checkpoint along corridor.',
    safetyAdvice: 'Slow down, turn on headlights, prepare license and registration.',
  },
];

/**
 * Creates a new rider-reported TrafficIncident at the specified location.
 */
export function createRiderReportedHazard(
  type: RiderHazardType,
  lat: number,
  lng: number,
  corridorName: string = 'Highway Corridor',
  customNote?: string
): TrafficIncident {
  const preset = RIDER_HAZARD_PRESETS.find((p) => p.id === type) || RIDER_HAZARD_PRESETS[0];

  return {
    id: `rider-hazard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: preset.label,
    corridor: corridorName,
    type: type === 'construction' ? 'roadwork' : type === 'flood' ? 'weather' : 'accident',
    severity: preset.severity,
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
    delayMinutes: preset.delayMinutes,
    speedKmh: preset.speedKmh,
    description: customNote?.trim() || `${preset.defaultDescription} (${preset.safetyAdvice})`,
    updatedMinutesAgo: 0,
    active: true,
    createdAt: Date.now(),
  };
}
