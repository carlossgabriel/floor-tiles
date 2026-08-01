import type { Point, TileInput, VisibleTile } from './types';

const EPSILON = 0.001;

export type RowOffsetMeasurement = {
  id: string;
  label: string;
  lineStart: Point;
  lineEnd: Point;
  labelPoint: Point;
  firstTickStart: Point;
  firstTickEnd: Point;
  secondTickStart: Point;
  secondTickEnd: Point;
};

type RowTrack = {
  boundaries: number[];
  row: number;
  y: number;
};

function formatCentimeters(value: number) {
  return Number.isInteger(value) ? `${value} cm` : `${value.toFixed(1)} cm`;
}

function minCoordinate(points: Point[], key: keyof Point) {
  return Math.min(...points.map((point) => point[key]));
}

function maxCoordinate(points: Point[], key: keyof Point) {
  return Math.max(...points.map((point) => point[key]));
}

function buildRowTracks(tiles: VisibleTile[]) {
  const rows = new Map<number, RowTrack>();
  const visibleXValues = tiles.flatMap((tile) => tile.localPolygon.map((point) => point.x));
  const roomMinX = Math.min(...visibleXValues);
  const roomMaxX = Math.max(...visibleXValues);

  for (const tile of tiles) {
    if (!tile.localPolygon.length || !tile.localTilePolygon.length) continue;

    const yMin = minCoordinate(tile.localTilePolygon, 'y');
    const yMax = maxCoordinate(tile.localTilePolygon, 'y');
    const boundaries = [
      minCoordinate(tile.localTilePolygon, 'x'),
      maxCoordinate(tile.localTilePolygon, 'x'),
    ].filter((x) => x >= roomMinX - EPSILON && x <= roomMaxX + EPSILON);
    const track = rows.get(tile.row) ?? {
      boundaries: [],
      row: tile.row,
      y: (yMin + yMax) / 2,
    };

    for (const boundary of boundaries) {
      if (!track.boundaries.some((existing) => Math.abs(existing - boundary) <= EPSILON)) {
        track.boundaries.push(boundary);
      }
    }
    rows.set(tile.row, track);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, boundaries: row.boundaries.sort((first, second) => first - second) }))
    .filter((row) => row.boundaries.length > 0)
    .sort((first, second) => first.y - second.y);
}

function findClosestBoundaryPair(firstRow: RowTrack, secondRow: RowTrack, targetDistance: number) {
  let bestPair: { first: number; second: number; distance: number; distanceFromTarget: number } | undefined;

  for (const first of firstRow.boundaries) {
    for (const second of secondRow.boundaries) {
      const distance = Math.abs(second - first);
      if (distance <= EPSILON) continue;
      const distanceFromTarget = Math.abs(distance - targetDistance);
      if (!bestPair || distanceFromTarget < bestPair.distanceFromTarget) {
        bestPair = { first, second, distance, distanceFromTarget };
      }
    }
  }

  return bestPair;
}

export function buildRowOffsetMeasurements(tiles: VisibleTile[], tile: TileInput): RowOffsetMeasurement[] {
  const offset = Math.abs(tile.rowOffset);
  if (offset <= EPSILON || tiles.length === 0) return [];

  const rows = buildRowTracks(tiles);
  const tickHalfHeight = Math.max(4, tile.height * 0.18);
  const labelGap = Math.max(13, tile.height * 0.7);
  const candidates = rows.slice(0, -1);

  return candidates.flatMap((row, index) => {
    const nextRow = rows[index + 1];
    const pair = findClosestBoundaryPair(row, nextRow, offset);
    if (!pair) return [];

    const xStart = Math.min(pair.first, pair.second);
    const xEnd = Math.max(pair.first, pair.second);
    const y = (row.y + nextRow.y) / 2;

    return {
      id: `row-offset-${row.row}-${nextRow.row}`,
      label: formatCentimeters(offset),
      lineStart: { x: xStart, y },
      lineEnd: { x: xEnd, y },
      labelPoint: { x: (xStart + xEnd) / 2, y: y - labelGap },
      firstTickStart: { x: xStart, y: y - tickHalfHeight },
      firstTickEnd: { x: xStart, y: y + tickHalfHeight },
      secondTickStart: { x: xEnd, y: y - tickHalfHeight },
      secondTickEnd: { x: xEnd, y: y + tickHalfHeight },
    };
  });
}
