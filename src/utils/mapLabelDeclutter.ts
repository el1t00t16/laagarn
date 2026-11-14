export interface LabelCandidate {
  id: string;
  lat: number;
  lng: number;
  priority: number;
  widthPx: number;
  heightPx: number;
  minZoom?: number;
  alwaysShow?: boolean;
}

export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function boxesIntersect(a: ScreenBox, b: ScreenBox, paddingPx = 4): boolean {
  return !(
    a.right + paddingPx <= b.left ||
    a.left >= b.right + paddingPx ||
    a.bottom + paddingPx <= b.top ||
    a.top >= b.bottom + paddingPx
  );
}

/**
 * Computes which map markers should display permanent inline text labels at the
 * current zoom level without overlapping in screen space.
 * Lower-priority markers remain interactive icons with hover/tap popups.
 */
export function selectVisibleMapLabels(
  candidates: LabelCandidate[],
  projectToScreen: (lat: number, lng: number) => { x: number; y: number },
  zoom: number,
  options: {
    minDensityZoom?: number;
    paddingPx?: number;
  } = {}
): Set<string> {
  const { minDensityZoom = 14, paddingPx = 6 } = options;
  const visible = new Set<string>();
  const placedBoxes: ScreenBox[] = [];

  const sorted = [...candidates].sort((a, b) => {
    if (Boolean(a.alwaysShow) !== Boolean(b.alwaysShow)) {
      return a.alwaysShow ? -1 : 1;
    }
    return b.priority - a.priority;
  });

  for (const item of sorted) {
    const requiredZoom = item.minZoom ?? minDensityZoom;
    if (!item.alwaysShow && zoom < requiredZoom) {
      continue;
    }

    const pt = projectToScreen(item.lat, item.lng);
    // Label renders centered horizontally directly beneath the marker icon
    const box: ScreenBox = {
      left: pt.x - item.widthPx / 2,
      top: pt.y + 10,
      right: pt.x + item.widthPx / 2,
      bottom: pt.y + 10 + item.heightPx,
    };

    const collides = placedBoxes.some((existing) =>
      boxesIntersect(box, existing, paddingPx)
    );
    if (!collides || item.alwaysShow) {
      visible.add(item.id);
      placedBoxes.push(box);
    }
  }

  return visible;
}
