import type { LayoutResult, Point, ReusePair, RoomInput, TileInput, VisibleTile } from './types';

const EPSILON = 0.0001;

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: total.x / points.length, y: total.y / points.length };
}

export function rotatePoint(point: Point, angleDeg: number, origin: Point): Point {
  const angle = toRad(angleDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  return {
    x: origin.x + x * cos - y * sin,
    y: origin.y + x * sin + y * cos,
  };
}

export function buildRoomPolygon(input: RoomInput): { polygon: Point[]; message?: string } {
  const { top, right, bottom, left, angleDeg } = input;
  if ([top, right, bottom, left].some((value) => value <= 0)) {
    return { polygon: [], message: 'All room sides must be greater than zero.' };
  }

  const angle = toRad(angleDeg);
  const p0 = { x: 0, y: 0 };
  const p1 = { x: top, y: 0 };
  const p3 = { x: left * Math.cos(angle), y: left * Math.sin(angle) };
  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= EPSILON) {
    return { polygon: [], message: 'The selected sides and angle collapse the room shape.' };
  }

  if (distance > right + bottom || distance < Math.abs(right - bottom)) {
    return {
      polygon: [],
      message: 'These side lengths and angle cannot form a quadrilateral.',
    };
  }

  const a = (right ** 2 - bottom ** 2 + distance ** 2) / (2 * distance);
  const hSquared = right ** 2 - a ** 2;
  if (hSquared < -EPSILON) {
    return {
      polygon: [],
      message: 'These side lengths and angle cannot form a quadrilateral.',
    };
  }

  const h = Math.sqrt(Math.max(0, hSquared));
  const ux = dx / distance;
  const uy = dy / distance;
  const base = { x: p1.x + a * ux, y: p1.y + a * uy };
  const candidates = [
    { x: base.x - uy * h, y: base.y + ux * h },
    { x: base.x + uy * h, y: base.y - ux * h },
  ];
  const p2 = candidates.find((point) => point.y >= Math.min(p1.y, p3.y) - EPSILON) ?? candidates[0];
  const polygon = normalizePolygon([p0, p1, p2, p3]);

  return polygonArea(polygon) > EPSILON
    ? { polygon }
    : { polygon: [], message: 'The selected values produce a zero-area room.' };
}

function normalizePolygon(points: Point[]): Point[] {
  const areaSign = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + (point.x * next.y - next.x * point.y);
  }, 0);
  return areaSign >= 0 ? points : [...points].reverse();
}

function bounds(points: Point[]) {
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

function footprint(points: Point[]) {
  const pointBounds = bounds(points);
  return {
    width: Math.max(0, pointBounds.maxX - pointBounds.minX),
    height: Math.max(0, pointBounds.maxY - pointBounds.minY),
  };
}

function isInsideEdge(point: Point, edgeStart: Point, edgeEnd: Point) {
  return (
    (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) -
      (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x) >=
    -EPSILON
  );
}

function lineIntersection(start: Point, end: Point, edgeStart: Point, edgeEnd: Point): Point {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;
  const x3 = edgeStart.x;
  const y3 = edgeStart.y;
  const x4 = edgeEnd.x;
  const y4 = edgeEnd.y;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denominator) < EPSILON) return end;

  return {
    x: ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator,
    y: ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator,
  };
}

export function clipPolygon(subject: Point[], clipper: Point[]): Point[] {
  return clipper.reduce((output, edgeStart, edgeIndex) => {
    const edgeEnd = clipper[(edgeIndex + 1) % clipper.length];
    const input = output;
    const clipped: Point[] = [];
    if (input.length === 0) return clipped;

    let previous = input[input.length - 1];
    for (const current of input) {
      const currentInside = isInsideEdge(current, edgeStart, edgeEnd);
      const previousInside = isInsideEdge(previous, edgeStart, edgeEnd);

      if (currentInside && !previousInside) {
        clipped.push(lineIntersection(previous, current, edgeStart, edgeEnd));
      }
      if (currentInside) {
        clipped.push(current);
      }
      if (!currentInside && previousInside) {
        clipped.push(lineIntersection(previous, current, edgeStart, edgeEnd));
      }

      previous = current;
    }
    return clipped;
  }, subject);
}

function rectanglePolygon(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function buildLayout(roomInput: RoomInput, tileInput: TileInput): LayoutResult {
  const room = buildRoomPolygon(roomInput);
  if (!room.polygon.length) {
    return emptyLayout(room.message);
  }

  const { width, height, groutMm, rowOffset, rotationDeg } = tileInput;
  if (width <= 0 || height <= 0) return emptyLayout('Tile width and height must be greater than zero.');
  if (groutMm < 0) return emptyLayout('Grout gap cannot be negative.');

  const roomPolygon = room.polygon;
  const origin = centroid(roomPolygon);
  const inverseRoom = roomPolygon.map((point) => rotatePoint(point, -rotationDeg, origin));
  const roomBounds = bounds(inverseRoom);
  const groutCm = groutMm / 10;
  const pitchX = width + groutCm;
  const pitchY = height + groutCm;
  const padding = Math.max(width, height, Math.abs(rowOffset), 1) * 2;
  const minRow = Math.floor((roomBounds.minY - padding) / pitchY);
  const maxRow = Math.ceil((roomBounds.maxY + padding) / pitchY);
  const minCol = Math.floor((roomBounds.minX - padding) / pitchX) - 2;
  const maxCol = Math.ceil((roomBounds.maxX + padding) / pitchX) + 2;
  const tiles: VisibleTile[] = [];
  const tileArea = width * height;

  for (let row = minRow; row <= maxRow; row += 1) {
    const stagger = mod(row * rowOffset, pitchX);
    for (let col = minCol; col <= maxCol; col += 1) {
      const x = col * pitchX + stagger;
      const y = row * pitchY;
      const localTilePolygon = rectanglePolygon(x, y, width, height);
      const localClipped = clipPolygon(localTilePolygon, inverseRoom);
      const area = polygonArea(localClipped);

      if (area > EPSILON) {
        const tileFootprint = footprint(localClipped);
        tiles.push({
          id: `${row}:${col}`,
          row,
          col,
          polygon: localClipped.map((point) => rotatePoint(point, rotationDeg, origin)),
          tilePolygon: localTilePolygon.map((point) => rotatePoint(point, rotationDeg, origin)),
          localPolygon: localClipped,
          area,
          isFull: area >= tileArea - 0.05,
          footprintWidth: Math.min(width, tileFootprint.width),
          footprintHeight: Math.min(height, tileFootprint.height),
        });
      }
    }
  }

  const { stats, reusePairs } = estimateStats(roomPolygon, tiles, tileArea, width);
  return { roomPolygon, tiles, reusePairs, stats, isValid: true };
}

function emptyLayout(message?: string): LayoutResult {
  return {
    roomPolygon: [],
    tiles: [],
    reusePairs: [],
    stats: {
      roomArea: 0,
      tileArea: 0,
      visibleTileArea: 0,
      fullTiles: 0,
      cutPieces: 0,
      reusedOffcuts: 0,
      purchasedTiles: 0,
      wasteArea: 0,
      wastePercent: 0,
    },
    isValid: false,
    message,
  };
}

type OffcutPool = {
  widthStrips: ReusableOffcut[];
  heightStrips: ReusableOffcut[];
};

type ReusableOffcut = {
  sourceTileId: string;
  remaining: number;
};

function isRectangularStrip(tile: VisibleTile, tileArea: number) {
  return Math.abs(tile.area - tile.footprintWidth * tile.footprintHeight) <= Math.max(0.25, tileArea * 0.002);
}

function estimateStats(roomPolygon: Point[], tiles: VisibleTile[], tileArea: number, tileWidth: number) {
  const fullTiles = tiles.filter((tile) => tile.isFull).length;
  const tileHeight = tileArea / tileWidth;
  const cutTiles = tiles
    .filter((tile) => !tile.isFull)
    .sort((a, b) => b.footprintWidth * b.footprintHeight - a.footprintWidth * a.footprintHeight);
  const offcuts: OffcutPool = {
    widthStrips: [],
    heightStrips: [],
  };
  const reusePairs: ReusePair[] = [];
  let purchasedCutTiles = 0;
  let reusedOffcuts = 0;

  for (const cutTile of cutTiles) {
    const isCleanStrip = isRectangularStrip(cutTile, tileArea);
    const spansHeight = cutTile.footprintHeight >= tileHeight - 0.05;
    const spansWidth = cutTile.footprintWidth >= tileWidth - 0.05;
    const needsWidth = cutTile.footprintWidth;
    const needsHeight = cutTile.footprintHeight;

    if (isCleanStrip && spansHeight && needsWidth < tileWidth - 0.05) {
      const matchIndex = offcuts.widthStrips.findIndex((offcut) => offcut.remaining + EPSILON >= needsWidth);
      if (matchIndex >= 0) {
        const matchedOffcut = offcuts.widthStrips[matchIndex];
        matchedOffcut.remaining -= needsWidth;
        reusedOffcuts += 1;
        reusePairs.push({
          id: `reuse-${reusePairs.length + 1}`,
          sourceTileId: matchedOffcut.sourceTileId,
          consumerTileId: cutTile.id,
          reuseKind: 'width-strip',
        });
        if (matchedOffcut.remaining <= EPSILON) offcuts.widthStrips.splice(matchIndex, 1);
        offcuts.widthStrips.sort((a, b) => a.remaining - b.remaining);
        continue;
      }

      purchasedCutTiles += 1;
      const leftover = tileWidth - needsWidth;
      if (leftover > EPSILON) offcuts.widthStrips.push({ sourceTileId: cutTile.id, remaining: leftover });
      offcuts.widthStrips.sort((a, b) => a.remaining - b.remaining);
      continue;
    }

    if (isCleanStrip && spansWidth && needsHeight < tileHeight - 0.05) {
      const matchIndex = offcuts.heightStrips.findIndex((offcut) => offcut.remaining + EPSILON >= needsHeight);
      if (matchIndex >= 0) {
        const matchedOffcut = offcuts.heightStrips[matchIndex];
        matchedOffcut.remaining -= needsHeight;
        reusedOffcuts += 1;
        reusePairs.push({
          id: `reuse-${reusePairs.length + 1}`,
          sourceTileId: matchedOffcut.sourceTileId,
          consumerTileId: cutTile.id,
          reuseKind: 'height-strip',
        });
        if (matchedOffcut.remaining <= EPSILON) offcuts.heightStrips.splice(matchIndex, 1);
        offcuts.heightStrips.sort((a, b) => a.remaining - b.remaining);
        continue;
      }

      purchasedCutTiles += 1;
      const leftover = tileHeight - needsHeight;
      if (leftover > EPSILON) offcuts.heightStrips.push({ sourceTileId: cutTile.id, remaining: leftover });
      offcuts.heightStrips.sort((a, b) => a.remaining - b.remaining);
      continue;
    }

    purchasedCutTiles += 1;
  }

  const purchasedTiles = fullTiles + purchasedCutTiles;
  const visibleTileArea = tiles.reduce((sum, tile) => sum + tile.area, 0);
  const wasteArea = Math.max(0, purchasedTiles * tileArea - visibleTileArea);

  return {
    reusePairs,
    stats: {
      roomArea: polygonArea(roomPolygon),
      tileArea,
      visibleTileArea,
      fullTiles,
      cutPieces: cutTiles.length,
      reusedOffcuts,
      purchasedTiles,
      wasteArea,
      wastePercent: purchasedTiles > 0 ? (wasteArea / (purchasedTiles * tileArea)) * 100 : 0,
    },
  };
}

export function pointsToString(points: Point[]): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}
