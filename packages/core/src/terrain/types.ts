/** A point in world metres (origin top-left, y down). */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** A street centreline. Major streets draw wider and are preferred for placement snapping. */
export interface Polyline {
  readonly pts: readonly Pt[];
  readonly major: boolean;
  readonly name?: string;
}

/** A closed area (park, water); the last point connects back to the first. */
export interface Polygon {
  readonly pts: readonly Pt[];
  readonly name?: string;
}

/** A map caption: a district name or a water name. */
export interface TerrainLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly kind: 'district' | 'water';
}

/** Hand-made or procedural map data, before the street graph is derived. */
export interface TerrainSource {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly streets: readonly Polyline[];
  readonly parks: readonly Polygon[];
  /** No-go areas: nothing is generated or dropped here (bridges excepted). */
  readonly water: readonly Polygon[];
  readonly labels: readonly TerrainLabel[];
}

/** One street segment between two graph nodes. */
export interface GraphEdge {
  readonly a: number;
  readonly b: number;
  readonly length: number;
  readonly major: boolean;
  /** Touches water: walkable, but nothing is placed on it. */
  readonly bridge: boolean;
}

/** Street network: intersections and polyline vertices as nodes, street pieces as edges. */
export interface StreetGraph {
  readonly nodes: readonly Pt[];
  readonly edges: readonly GraphEdge[];
  /** Edge indices per node, ascending. */
  readonly adjacency: readonly (readonly number[])[];
  readonly componentOf: readonly number[];
  readonly componentCount: number;
  /** Per node: inside a water polygon (mid-bridge vertices). */
  readonly inWater: readonly boolean[];
  /** Running sum of edge lengths, for length-weighted sampling. */
  readonly cumulativeLength: readonly number[];
  readonly totalLength: number;
  /** Same over non-bridge edges only (bridge edges add 0). */
  readonly landCumulativeLength: readonly number[];
  readonly landTotalLength: number;
}

/** A world's map: source data plus the derived street graph. JSON-safe; one object per world. */
export interface Terrain extends TerrainSource {
  readonly graph: StreetGraph;
  /** Per park: graph nodes from which a walker can step into it (ascending). */
  readonly parkGates: readonly (readonly number[])[];
}
