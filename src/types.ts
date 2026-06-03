export type Point = {
  x: number;
  y: number;
};

export type RoomInput = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  angleDeg: number;
};

export type TileInput = {
  width: number;
  height: number;
  groutMm: number;
  rowOffset: number;
  offsetFlipRows: number;
  rotationDeg: number;
};

export type VisibleTile = {
  id: string;
  row: number;
  col: number;
  polygon: Point[];
  tilePolygon: Point[];
  localTilePolygon: Point[];
  localPolygon: Point[];
  area: number;
  isFull: boolean;
  footprintWidth: number;
  footprintHeight: number;
};

export type ReusePair = {
  id: string;
  sourceTileId: string;
  consumerTileId: string;
  reuseKind: 'width-strip' | 'height-strip';
};

export type LayoutStats = {
  roomArea: number;
  tileArea: number;
  visibleTileArea: number;
  fullTiles: number;
  cutPieces: number;
  reusedOffcuts: number;
  purchasedTiles: number;
  wasteArea: number;
  wastePercent: number;
};

export type LayoutResult = {
  roomPolygon: Point[];
  tiles: VisibleTile[];
  reusePairs: ReusePair[];
  stats: LayoutStats;
  isValid: boolean;
  message?: string;
};
