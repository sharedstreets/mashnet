"use strict";

const RTree = require("rbush");
const turf = require("@turf/turf");
const cover = require("@mapbox/tile-cover");
const tilebelt = require("@mapbox/tilebelt");
const softmax = require("softmax-fn");
const brain = require("brain.js");
const debug = require("./debug");

// set constants
const UNITS = { units: "kilometers" };
const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;
const MAX_NODE_SHIFT = 0.01;
const MAX_VERTEX_SHIFT = 0.0075;
const MAX_PHANTOM_SHIFT = 0.005;
const DEBUG_COLOR_1 = "#ff66ff"; // pink
const DEBUG_COLOR_2 = "#00ff00"; // green
const DEBUG_COLOR_3 = "#66ffff"; // cyan
const DEBUG_COLOR_4 = "#ff9900"; // orange
const MATCH_DEPTH = 5;

// constructor
const Mashnet = function(ways) {
  this.edges = new Map();
  this.vertices = new Map();
  this.nodes = new Map();
  this.metadata = new Map();
  this.nodetree = new RTree();
  this.edgetree = new RTree();
  this.id = 0;
  this.nn = new brain.NeuralNetwork();

  // load pretrained match model, if present
  let matchModel;
  try {
    matchModel = require("../model/match.json");
    this.nn.fromJSON(matchModel);
  } catch (e) {
    throw new Error("unable to load model");
  }

  for (const way of ways) {
    if (way.geometry.coordinates.length === way.properties.refs.length) {
      // setup vertices
      let i = 0;
      for (const ref of way.properties.refs) {
        this.vertices.set(ref, way.geometry.coordinates[i]);
        i++;
      }

      // setup nodes
      //   start
      const start = way.properties.refs[0];
      let adjacent_start = this.nodes.get(start);
      if (!adjacent_start) {
        adjacent_start = new Set();
      }
      adjacent_start.add(way.properties.id);
      this.nodes.set(start, adjacent_start);

      //   end
      const end = way.properties.refs[way.properties.refs.length - 1];
      let adjacent_end = this.nodes.get(end);
      if (!adjacent_end) {
        adjacent_end = new Set();
      }
      adjacent_end.add(way.properties.id);
      this.nodes.set(end, adjacent_end);

      // setup edges
      this.edges.set(way.properties.id, way.properties.refs);

      // setup metadata
      const metadata = {};
      for (const property of Object.keys(way.properties)) {
        if (["id", "refs"].indexOf(property) === -1) {
          metadata[property] = way.properties[property];
        }
      }
      this.metadata.set(way.properties.id, metadata);
    }
  }

  // setup nodetree
  let nodeItems = [];
  for (const node of this.nodes) {
    const vertex = this.vertices.get(node[0]);
    const item = {
      minX: vertex[0],
      minY: vertex[1],
      maxX: vertex[0],
      maxY: vertex[1],
      id: node[0]
    };
    nodeItems.push(item);
  }
  this.nodetree.load(nodeItems);
  nodeItems = null;

  // setup edgetree
  let edgeItems = [];
  for (const edge of this.edges) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ref of edge[1]) {
      const vertex = this.vertices.get(ref);
      if (vertex[0] < minX) minX = vertex[0];
      if (vertex[1] < minY) minY = vertex[1];
      if (vertex[0] > maxX) maxX = vertex[0];
      if (vertex[1] > maxY) maxY = vertex[1];
    }
    const item = {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      id: edge[0]
    };
    edgeItems.push(item);
  }
  this.edgetree.load(edgeItems);
  edgeItems = null;
};

Mashnet.prototype.scan = function(addition) {
  if (process.env.DEBUG) {
    debug({
      type: "log",
      message: "SCAN"
    });
    debug({
      type: "fit",
      bbox: turf.bbox(addition)
    });
    debug({
      type: "draw",
      geometry: addition.geometry,
      style: {
        width: 4,
        color: DEBUG_COLOR_1,
        opacity: 0.7
      },
      fade: 100000
    });
  }

  // find matching edge candidates

  // get candidates
  const buffer = 0.1;
  const bbox = turf.bbox(addition);
  const sw = turf.destination(turf.point(bbox.slice(0, 2)), buffer, 225, UNITS);
  const ne = turf.destination(turf.point(bbox.slice(2, 4)), buffer, 45, UNITS);

  const candidates = this.edgetree.search({
    minX: sw.geometry.coordinates[0],
    minY: sw.geometry.coordinates[1],
    maxX: ne.geometry.coordinates[0],
    maxY: ne.geometry.coordinates[1]
  });

  if (process.env.DEBUG) {
    debug({
      type: "fit",
      bbox: sw.geometry.coordinates.concat(ne.geometry.coordinates)
    });
    debug({
      type: "draw",
      geometry: turf.lineString(turf.bboxPolygon(bbox).geometry.coordinates[0])
        .geometry,
      style: {
        width: 0.5,
        color: DEBUG_COLOR_2,
        opacity: 0.9
      },
      fade: 3000
    });
    debug({
      type: "draw",
      geometry: turf.lineString(
        turf.envelope(turf.featureCollection([sw, ne])).geometry.coordinates[0]
      ).geometry,
      style: {
        width: 0.8,
        color: DEBUG_COLOR_2,
        opacity: 0.6
      }
    });

    const boxes = [];
    for (const candidate of candidates) {
      boxes.push(
        turf.lineString(
          turf.bboxPolygon([
            candidate.minX,
            candidate.minY,
            candidate.maxX,
            candidate.maxY
          ]).geometry.coordinates[0]
        ).geometry.coordinates
      );
    }
    if (boxes.length) {
      debug({
        type: "fit",
        bbox: turf.bbox(turf.multiLineString(boxes))
      });
      debug({
        type: "draw",
        geometry: turf.multiLineString(boxes).geometry,
        style: {
          width: 0.3,
          color: "#5AFF52",
          opacity: 0.9
        },
        fade: 5000
      });
    }
  }

  // get scores
  const a = heuristics(addition);

  let matches = [];
  for (const candidate of candidates) {
    const refs = this.edges.get(candidate.id);
    const coordinates = [];
    for (const ref of refs) {
      coordinates.push(this.vertices.get(ref));
    }
    const line = turf.lineString(coordinates);

    if (process.env.DEBUG) {
      debug({
        type: "fit",
        bbox: turf.bbox(turf.featureCollection([sw, ne, line]))
      });
      debug({
        type: "draw",
        geometry: turf.lineString(turf.envelope(line).geometry.coordinates[0])
          .geometry,
        style: {
          width: 0.5,
          color: DEBUG_COLOR_2,
          opacity: 0.95
        },
        fade: 2000
      });
      debug({
        type: "draw",
        geometry: line.geometry,
        style: {
          width: 4,
          color: DEBUG_COLOR_2,
          opacity: 0.7
        },
        fade: 2000
      });
    }

    const b = heuristics(line);
    const scores = compare(a, b);

    if (process.env.DEBUG) {
      debug({
        type: "log",
        message: "---"
      });
      for (const s of Object.keys(scores)) {
        debug({
          type: "log",
          message: s + ": " + scores[s].toFixed(6),
          color:
            "rgb(" +
            (100 + Math.round(Math.abs(scores[s] - 1) * 105)) +
            "," +
            (100 + Math.round(scores[s] * 50)) +
            "," +
            (100 + Math.round(scores[s] * 50)) +
            ");"
        });
      }
    }

    const weights = {
      distance: 1,
      scale: 1,
      straight: 1,
      curve: 1,
      scan: 1,
      terminal: 1,
      bearing: 1
    };

    let score = 0;
    for (const s of Object.keys(scores)) {
      score += scores[s] * weights[s];
    }

    if (score > 0) {
      const match = {
        id: candidate.id,
        line: line,
        score: score
      };
      for (const s of Object.keys(scores)) {
        match[s] = scores[s];
      }
      matches.push(match);
    }
  }

  const softmaxScores = softmax(
    matches.map(match => {
      return match.score;
    })
  );
  let i = 0;
  for (const sm of softmaxScores) {
    matches[i].softmax = sm;
    i++;
  }

  matches = matches.sort((a, b) => {
    return b.softmax - a.softmax;
  });

  if (process.env.DEBUG) {
    debug({
      type: "clear"
    });
    debug({
      type: "draw",
      geometry: matches[0].line.geometry,
      style: {
        color: DEBUG_COLOR_3,
        width: 7,
        opacity: 0.9
      },
      fade: 6000
    });
  }

  return matches;
};

Mashnet.prototype.match = function(scores) {
  if (!Array.isArray(scores)) {
    throw new Error("Mashnet.prototype.match must receive an array of scores");
  } else if (scores.length === 0) {
    return 0;
  } else {
    const input = {};
    for (let k = 0; k < MATCH_DEPTH; k++) {
      if (scores[k]) {
        input["distance_" + k] = scores[k].distance;
        input["scale_" + k] = scores[k].scale;
        input["straight_" + k] = scores[k].straight;
        input["curve_" + k] = scores[k].curve;
        input["scan_" + k] = scores[k].scan;
        input["terminal_" + k] = scores[k].terminal;
        input["bearing_" + k] = scores[k].bearing;
      } else {
        input["distance_" + k] = 0.0;
        input["scale_" + k] = 0.0;
        input["straight_" + k] = 0.0;
        input["curve_" + k] = 0.0;
        input["scan_" + k] = 0.0;
        input["terminal_" + k] = 0.0;
        input["bearing_" + k] = 0.0;
      }
    }
    const prediction = this.nn.run(input);
    return prediction.match;
  }
};

function compare(a, b) {
  const maxDistance = Math.max(a.distance, b.distance);
  const minDistance = Math.min(a.distance, b.distance);
  let scale = (a.distance + b.distance) / 100;
  if (scale > 1) scale = 1;
  const maxStraight = Math.max(a.straight, b.straight);
  const minStraight = Math.min(a.straight, b.straight);
  const maxCurve = Math.max(a.curve, b.curve);
  const minCurve = Math.min(a.curve, b.curve);

  const scan = similarity(a.scan, b.scan);
  const terminal = similarity(a.terminal, b.terminal);

  const bearingForward = bearingDistance(a.bearing, b.bearing);
  const bearingBack = bearingDistance(b.bearing, a.bearing);
  const bearing = Math.max(bearingForward, bearingBack);

  return {
    distance: minDistance / maxDistance,
    scale: scale,
    straight: minStraight / maxStraight,
    curve: minCurve / maxCurve,
    scan: scan,
    terminal: terminal,
    bearing: Math.abs(bearing - 180) / 180
  };
}

function bearingDistance(b1, b2) {
  const b1Rad = b1 * DEG2RAD;
  const b2Rad = b2 * DEG2RAD;
  const b1y = Math.cos(b1Rad);
  const b1x = Math.sin(b1Rad);
  const b2y = Math.cos(b2Rad);
  const b2x = Math.sin(b2Rad);
  const crossp = b1y * b2x - b2y * b1x;
  const dotp = b1x * b2x + b1y * b2y;
  if (crossp > 0) {
    return Math.acos(dotp) * RAD2DEG;
  } else {
    return -Math.acos(dotp) * RAD2DEG;
  }
}

function similarity(a, b) {
  const union = new Set();
  for (const scan of a) {
    union.add(scan);
  }
  for (const scan of b) {
    union.add(scan);
  }
  const overlap = new Set();
  for (const key of union) {
    if (a.has(key) && b.has(key)) {
      overlap.add(key);
    }
  }
  let sim = 0;
  if (union.size > 0) {
    sim = overlap.size / union.size;
  }

  if (process.env.DEBUG) {
    const abCells = [];
    const cCells = [];

    for (const scan of a) {
      abCells.push(
        turf.bboxPolygon(tilebelt.tileToBBOX(tilebelt.quadkeyToTile(scan)))
          .geometry.coordinates[0]
      );
    }
    for (const scan of b) {
      abCells.push(
        turf.bboxPolygon(tilebelt.tileToBBOX(tilebelt.quadkeyToTile(scan)))
          .geometry.coordinates[0]
      );
    }
    for (const scan of overlap) {
      cCells.push(
        turf.bboxPolygon(tilebelt.tileToBBOX(tilebelt.quadkeyToTile(scan)))
          .geometry.coordinates[0]
      );
    }

    debug({
      type: "draw",
      geometry: turf.multiLineString(abCells).geometry,
      style: {
        color: DEBUG_COLOR_3,
        opacity: 0.8
      },
      fade: 1000
    });
    debug({
      type: "draw",
      geometry: turf.multiLineString(cCells).geometry,
      style: {
        color: DEBUG_COLOR_4,
        opacity: 0.8
      },
      fade: 2500
    });
  }

  return sim;
}

function heuristics(line) {
  const buffer = 0.05;
  const z = 23;
  const zs = { min_zoom: z, max_zoom: z };
  const start = turf.point(line.geometry.coordinates[0]);
  const end = turf.point(
    line.geometry.coordinates[line.geometry.coordinates.length - 1]
  );

  const distance = turf.lineDistance(line, UNITS);
  const straight = turf.distance(start, end, UNITS);
  const curve = straight / distance;
  const indexes = cover.indexes(turf.buffer(line, buffer, UNITS).geometry, zs);
  const scan = new Set();
  for (const index of indexes) {
    scan.add(index);
  }

  const terminalIndexes = cover.indexes(
    turf.buffer(
      turf.multiPoint([
        line.geometry.coordinates[0],
        line.geometry.coordinates[line.geometry.coordinates.length - 1]
      ]),
      buffer * 2,
      UNITS
    ).geometry,
    zs
  );
  const terminal = new Set();
  for (const index of terminalIndexes) {
    terminal.add(index);
  }

  const bearing = turf.bearing(start, end);

  return {
    line: line,
    distance: distance,
    straight: straight,
    curve: curve,
    scan: scan,
    terminal: terminal,
    bearing: bearing
  };
}

Mashnet.prototype.merge = function(existing, addition) {
  // merge existing edge
  const metadata = this.metadata.get(existing);
  for (const property of Object.keys(addition)) {
    metadata[property] = addition[property];
  }
  this.metadata.set(existing, metadata);
};

Mashnet.prototype.snap = function(addition) {
  const phantoms = phantomify(addition.geometry.coordinates);
  const snaps = [];
  const buffer = MAX_NODE_SHIFT * 1.5;
  const bbox = turf.bbox(addition);
  const sw = turf.destination(turf.point(bbox.slice(0, 2)), buffer, 225, UNITS);
  const ne = turf.destination(turf.point(bbox.slice(2, 4)), buffer, 45, UNITS);
  const subgraph = this.query([
    sw.geometry.coordinates[0],
    sw.geometry.coordinates[1],
    ne.geometry.coordinates[0],
    ne.geometry.coordinates[1]
  ]);

  let anchors = [];
  for (const edge of subgraph.edges) {
    const coordinates = edge[1].map(ref => {
      return subgraph.vertices.get(ref);
    });
    anchors = anchors.concat(
      phantomify(coordinates).map(c => {
        return c.concat(edge[0]);
      })
    );
  }

  for (const phantom of phantoms) {
    const snap = {
      node: {
        distance: Infinity,
        id: null
      },
      vertex: {
        distance: Infinity,
        id: null
      },
      anchor: {
        distance: Infinity,
        id: null,
        pair: null
      },
      void: {
        pair: null
      }
    };

    // nodes
    for (const node of subgraph.nodes) {
      const pair = subgraph.vertices.get(node[0]);
      const distance = turf.distance(turf.point(pair), turf.point(phantom));
      if (distance < MAX_NODE_SHIFT && snap.node.distance > distance) {
        snap.node = {
          distance: distance,
          id: node[0]
        };
      }
    }

    // vertices
    if (!snap.node.id) {
      for (const vertex of subgraph.vertices) {
        const pair = subgraph.vertices.get(vertex[0]);
        const distance = turf.distance(turf.point(pair), turf.point(phantom));
        if (distance < MAX_VERTEX_SHIFT && snap.vertex.distance > distance) {
          snap.vertex = {
            distance: distance,
            id: vertex[0]
          };
        }
      }
    }

    // anchors
    if (!snap.node.id && !snap.vertex.id) {
      for (const anchor of anchors) {
        const pair = anchor.slice(0, 2);
        const distance = turf.distance(turf.point(pair), turf.point(phantom));
        if (distance < MAX_PHANTOM_SHIFT && snap.anchor.distance > distance) {
          snap.anchor = {
            distance: distance,
            id: anchor[2],
            pair: pair
          };
        }
      }
    }

    // void
    if (!snap.node.id && !snap.vertex.id && !snap.anchor.id) {
      snap.void = {
        pair: phantom
      };
    }

    // filter duplicate adjacent snaps
    if (snaps.length > 0) {
      const last = snaps[snaps.length - 1];
      if (
        !(snap.node.id && last.node.id && snap.node.id === last.node.id) &&
        !(
          snap.vertex.id &&
          last.vertex.id &&
          snap.vertex.id === last.vertex.id
        ) &&
        !(
          snap.anchor.id &&
          last.anchor.id &&
          snap.anchor.id === last.anchor.id &&
          snap.anchor.pair.join(",") === last.anchor.pair.join(",")
        )
      ) {
        snaps.push(snap);
      }
    } else {
      snaps.push(snap);
    }
  }

  return snaps;
};

/* Mashnet.prototype.crossing = function (coordinates, subgraph) {
  const crossings = [];
  const edges = [];
  for (let edge of subgraph.edges) {
    for (let i = 0; i < edge[1].length - 1; i++) {
      edges.push([
        subgraph.vertices.get(edge[1][i]),
        subgraph.vertices.get(edge[1][i+1]),
        edge[0]
      ]);
    }
  }

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segment = [coordinates[i], coordinates[i+1]]
    for (let edge of edges) {
      const intersect = intersects(
        edge[0],

      )
      if(intersect) console.log(JSON.stringify(intersect))
    }
  }
}

function intersects(a,b,c,d,p,q,r,s) {
  var det, gamma, lambda;
  det = (c - a) * (s - q) - (r - p) * (d - b);
  if (det === 0) {
    return false;
  } else {
    lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
    gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
  }
};*/

function phantomify(coordinates) {
  const line = turf.lineString(coordinates);
  const pairs = [coordinates[0]];
  const distance = turf.length(line);
  const step = MAX_PHANTOM_SHIFT / distance;
  let progress = 0.0;
  while (progress + step < 1.0) {
    progress += step;
    const pair = turf.along(line, progress * distance).geometry.coordinates;
    pairs.push(pair);
  }
  pairs.push(coordinates[coordinates.length - 1]);
  return pairs;
}

Mashnet.prototype.query = function(bbox) {
  const subgraph = {
    edges: new Map(),
    vertices: new Map(),
    nodes: new Map(),
    edgeTree: new RTree(),
    nodeTree: new RTree()
  };

  this.edgetree
    .search({
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3]
    })
    .forEach(e => {
      subgraph.edgeTree.insert(e);
      const refs = this.edges.get(e.id);
      subgraph.edges.set(e.id, refs);
      for (const ref of refs) {
        const vertex = this.vertices.get(ref);
        subgraph.vertices.set(ref, vertex);
      }
    });

  this.nodetree
    .search({
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3]
    })
    .forEach(n => {
      subgraph.nodeTree.insert(n);
      const edges = this.nodes.get(n.id);
      subgraph.nodes.set(n.id, edges);
    });

  return subgraph;
};

Mashnet.prototype.split = function(snaps) {
  const splits = [[snaps.shift()]];

  while (snaps.length) {
    const snap = snaps.shift();
    splits[splits.length - 1].push(snap);
    const next = snaps[0];

    if (
      !snap.void.pair &&
      // do not split anchors along matching edge
      !(
        snaps.length > 0 &&
        snap.anchor.id &&
        next.anchor.id &&
        snap.anchor.id === next.anchor.id
      )
    ) {
      splits.push([snap]);
    }
  }

  return splits;
};

Mashnet.prototype.materialize = function(splits) {
  const lines = [];
  let i = 0;
  for (const split of splits) {
    const pairs = [];
    for (const snap of split) {
      if (snap.node.id) {
        pairs.push(this.vertices.get(snap.node.id));
      } else if (snap.vertex.id) {
        pairs.push(this.vertices.get(snap.vertex.id));
      } else if (snap.anchor.id) {
        pairs.push(snap.anchor.pair);
      } else {
        pairs.push(snap.void.pair);
      }
    }

    const line = turf.lineString(pairs);

    let hasVoid = false;
    for (const snap of split) {
      if (snap.void.pair) {
        hasVoid = true;
        continue;
      }
    }
    if (hasVoid) {
      line.properties.action = "create";
    } else {
      line.properties.action = "merge";
    }
    line.properties.changeset = i;
    lines.push(line);
    i++;
  }
  return lines;
};

Mashnet.prototype.commit = function(splits, metadata) {
  // integrates changesets into graph
  for (const split of splits) {
    let merge = true;
    for (const snap of split) {
      if (snap.void.pair) {
        merge = false;
        continue;
      }
    }

    if (merge) {
      // search for matching edge
      const line = this.materialize([split])[0];
      const scores = this.scan(line);
      const isMatch = this.match(scores);
      // merge edge if top match passes threshold
      if (isMatch > 0.95) {
        this.merge(scores[0].id, metadata);
      }
    } else {
      // insert new edge
      const edgeId = this.id++;
      const refs = [];
      for (const snap of split) {
        if (snap.node.id) {
          // node
          refs.push(snap.node.id);
        } else if (snap.vertex.id) {
          // vertex
          refs.push(snap.vertex.id);
        } else if (snap.anchor.id) {
          // edge anchor
          const id = this.id++;
          refs.push(id);
          this.vertices.set(id, snap.anchor.pair);
          this.nodes.set(id, [edgeId]);
        } else {
          // void
          const id = this.id++;
          refs.push(id);
          this.vertices.set(id, snap.void.pair);
        }
      }
    }
  }
};

Mashnet.prototype.propose = function(addition) {
  // wraps snap+split
};

Mashnet.prototype.apply = function(addition) {
  // wraps snap+split+commit
};

// NOTE: pre-production legacy API, to be deprecated; preserved for initial demo
Mashnet.prototype.append = function(addition) {
  const buffer = MAX_NODE_SHIFT * 1.5;
  const bbox = turf.bbox(addition);
  const sw = turf.destination(turf.point(bbox.slice(0, 2)), buffer, 225, UNITS);
  const ne = turf.destination(turf.point(bbox.slice(2, 4)), buffer, 45, UNITS);

  const candidates = this.edgetree.search({
    minX: sw.geometry.coordinates[0],
    minY: sw.geometry.coordinates[1],
    maxX: ne.geometry.coordinates[0],
    maxY: ne.geometry.coordinates[1]
  });

  // build local data
  const edges = new Map();
  const nodes = new Map();
  const vertices = new Map();
  const phantoms = new Map();
  // build edges
  for (const candidate of candidates) {
    edges.set(candidate.id, this.edges.get(candidate.id));
  }

  for (const edge of edges) {
    // build vertices
    const coordinates = [];
    for (const ref of edge[1]) {
      const pair = this.vertices.get(ref);
      vertices.set(ref, pair);
      coordinates.push(pair);
    }

    // build nodes
    nodes.set(edge[1][0], vertices.get(edge[1][0]));
    nodes.set(
      edge[1][edge[1].length - 1],
      vertices.get(edge[1][edge[1].length - 1])
    );

    // build phantoms
    const line = turf.lineString(coordinates);
    const distance = turf.length(line);
    const step = MAX_PHANTOM_SHIFT / distance;
    let progress = 0.0;
    while (progress + step < 1.0) {
      progress += step;
      const pair = turf.along(line, progress * distance).geometry.coordinates;
      phantoms.set(phantoms.size, {
        edge: edge[0],
        pair: pair
      });
    }
  }

  // build local trees
  const nodeTree = new RTree();
  const vertexTree = new RTree();
  const phantomTree = new RTree();

  // build local node tree
  for (const node of nodes) {
    const pair = vertices.get(node[0]);
    const item = {
      minX: pair[0],
      minY: pair[1],
      maxX: pair[0],
      maxY: pair[1],
      id: node[0]
    };
    nodeTree.insert(item);
  }

  // build local vertex tree
  for (const vertex of vertices) {
    const item = {
      minX: vertex[1][0],
      minY: vertex[1][1],
      maxX: vertex[1][0],
      maxY: vertex[1][1],
      id: vertex[0]
    };
    vertexTree.insert(item);
  }

  // build local phantom tree
  for (const phantom of phantoms) {
    const item = {
      minX: phantom[1].pair[0],
      minY: phantom[1].pair[1],
      maxX: phantom[1].pair[0],
      maxY: phantom[1].pair[1],
      edge: phantom[1].edge,
      pair: phantom[1].pair
    };
    phantomTree.insert(item);
  }

  // build potential change list
  const pairs = addition.geometry.coordinates;
  // insert proposed vertices
  const changes = [
    {
      along: 0.0,
      pair: pairs[0],
      phantom: false
    }
  ];
  const distance = turf.length(addition);
  for (let i = 1; i < pairs.length; i++) {
    const pair = pairs[i];
    const along =
      turf.length(
        turf.lineSlice(turf.point(pairs[0]), turf.point(pair), addition)
      ) / distance;

    changes.push({
      along: along,
      pair: pair,
      phantom: false
    });
  }
  // insert phantom vertices
  const step = MAX_PHANTOM_SHIFT / distance;
  let progress = 0.0;
  while (progress + step < 1.0) {
    progress += step;
    const pair = turf.along(addition, progress * distance, UNITS).geometry
      .coordinates;
    changes.push({
      along: progress,
      pair: pair,
      phantom: true
    });
  }
  // sort change list
  changes.sort((a, b) => {
    return a.along - b.along;
  });

  // create commits from changes
  const commits = [];
  for (const change of changes) {
    let closestNode;
    let closestVertex;
    let closestPhantom;

    // get closest node
    const nodeCandidates = searchTree(change.pair, MAX_NODE_SHIFT, nodeTree);
    for (const nodeCandidate of nodeCandidates) {
      const pair = vertices.get(nodeCandidate.id);
      const apart = turf.distance(
        turf.point(pair),
        turf.point(change.pair),
        UNITS
      );
      if (!closestNode) {
        closestNode = {
          id: nodeCandidate.id,
          pair: pair,
          distance: apart
        };
      } else if (apart < closestNode.distance) {
        closestNode = {
          id: nodeCandidate.id,
          pair: pair,
          distance: apart
        };
      }
    }

    // get closest vertex
    if (!closestNode) {
      const vertexCandidates = searchTree(
        change.pair,
        MAX_VERTEX_SHIFT,
        vertexTree
      );
      for (const vertexCandidate of vertexCandidates) {
        const pair = vertices.get(vertexCandidate.id);
        const apart = turf.distance(
          turf.point(pair),
          turf.point(change.pair),
          UNITS
        );
        if (!closestVertex) {
          closestVertex = {
            id: vertexCandidate.id,
            pair: pair,
            distance: apart
          };
        } else if (apart < closestVertex.distance) {
          closestVertex = {
            id: vertexCandidate.id,
            pair: pair,
            distance: apart
          };
        }
      }
    }

    // get closest phantom
    if (!closestVertex) {
      const phantomCandidates = searchTree(
        change.pair,
        MAX_PHANTOM_SHIFT,
        phantomTree
      );
      for (const phantomCandidate of phantomCandidates) {
        const pair = phantomCandidate.pair;
        const apart = turf.distance(
          turf.point(pair),
          turf.point(change.pair),
          UNITS
        );
        if (!closestPhantom) {
          closestPhantom = {
            edge: phantomCandidate.edge,
            pair: pair,
            distance: apart
          };
        } else if (apart < closestPhantom.distance) {
          closestPhantom = {
            edge: phantomCandidate.edge,
            pair: pair,
            distance: apart
          };
        }
      }
    }

    if (closestNode && closestNode.distance <= MAX_NODE_SHIFT) {
      if (
        !commits.length ||
        (commits[commits.length - 1].type !== "node" &&
          commits[commits.length - 1].id !== closestNode.id)
      ) {
        commits.push({
          type: "node",
          id: closestNode.id
        });
      }
    } else if (closestVertex && closestVertex.distance <= MAX_VERTEX_SHIFT) {
      if (
        !commits.length ||
        (commits[commits.length - 1].type !== "vertex" &&
          commits[commits.length - 1].id !== closestVertex.id)
      ) {
        commits.push({
          type: "vertex",
          id: closestVertex.id
        });
      }
    } else if (closestPhantom && closestPhantom.distance <= MAX_PHANTOM_SHIFT) {
      commits.push({
        type: "phantom",
        edge: closestPhantom.edge
      });
    } else if (!change.phantom) {
      commits.push({
        type: "new",
        pair: change.pair
      });
    }
  }

  // split commits
  let next = commits.shift();
  let insert = [next];
  const inserts = [];
  while (commits.length) {
    next = commits.shift();
    if (next) {
      insert.push(next);

      // cut edge if node, vertex, or last new
      if (
        next.type === "node" ||
        next.type === "vertex" ||
        next.type === "phantom" ||
        commits.length === 0
      ) {
        inserts.push(insert);
        insert = [next];
      }
    }
  }

  for (const insert of inserts) {
    // classify
    let potentialMatch = false;
    for (const item of insert) {
      if (item.type === "phantom") {
        potentialMatch = true;
      }
    }

    if (potentialMatch) {
      // attempt merge
      // scan
      // if is match, merge
      // else ignore
    } else {
      const id = this.id++;
      const refs = [];
      for (const item of insert) {
        if (item.type === "node") {
          // add edge to node list
          const node = this.nodes.get(item.id);
          node.add(id);
          this.nodes.set(item.id, node);
          // add ref to edge
          refs.push(item.id);
        } else if (item.type === "vertex") {
          // get parents
          const parents = [];
          for (const edge of edges) {
            if (edge[1].indexOf(item.id) !== -1) {
              parents.push(edge);
            }
          }
          // delete parents
          for (const parent of parents) {
            this.edges.delete(parent[0]);
          }
          // split parents
          for (const parent of parents) {
            const a = {
              id: parent[0] + "!0",
              refs: parent[1].slice(0, parent[1].indexOf(item.id) + 1)
            };
            const b = {
              id: parent[0] + "!1",
              refs: parent[1].slice(
                parent[1].indexOf(item.id),
                parent[1].length
              )
            };
            this.edges.set(a.id, a.refs);
            this.edges.set(b.id, b.refs);
          }

          // add ref to edge
          refs.push(item.id);
          // re-node
        } else if (item.type === "phantom") {
          // set phantom id
          item.id = this.id++;
          // insert new vertex
          this.vertices.set(item.id, item.pair);
          // get parents
          const parents = [];
          for (const edge of edges) {
            if (edge[1].indexOf(item.id) !== -1) {
              parents.push(edge);
            }
          }
          // delete parents
          for (const parent of parents) {
            this.edges.delete(parent[0]);
          }
          // split parents
          for (const parent of parents) {
            // todo: detect forward and back nodes, split in between
            const a = {
              id: parent[0] + "!0",
              refs: parent[1].slice(0, parent[1].indexOf(item.id) + 1)
            };
            const b = {
              id: parent[0] + "!1",
              refs: parent[1].slice(
                parent[1].indexOf(item.id),
                parent[1].length
              )
            };
            this.edges.set(a.id, a.refs);
            this.edges.set(b.id, b.refs);
          }
          // add ref to edge
          refs.push(item.id);
          // re-node
        } else if (item.type === "new") {
          // set new id
          item.id = this.id++;
          // insert new vertex
          this.vertices.set(item.id, item.pair);
          // add ref to edge
          refs.push(item.id);
        }
      }
      // add new edge
      this.edges.set(id, refs);

      const coordinates = [];
      for (const ref of refs) {
        coordinates.push(this.vertices.get(ref));
      }
      const newLine = turf.lineString(coordinates);
      if (turf.length(newLine) > 0.05) {
        const scores = this.scan(newLine);

        if (scores[0].scan > 0 && scores[0].scan < 0.1) {
          console.log(JSON.stringify(turf.lineString(coordinates)));
        }
      }
    }
  }
};

function searchTree(pair, buffer, tree) {
  const sw = turf.destination(turf.point(pair), buffer * 1.5, 225, UNITS);
  const ne = turf.destination(turf.point(pair), buffer * 1.5, 45, UNITS);

  return tree.search({
    minX: sw.geometry.coordinates[0],
    minY: sw.geometry.coordinates[1],
    maxX: ne.geometry.coordinates[0],
    maxY: ne.geometry.coordinates[1]
  });
}

Mashnet.prototype.add = function(addition) {
  if (process.env.DEBUG) {
    debug({
      type: "log",
      message: "ADD"
    });
    debug({
      type: "fit",
      bbox: turf.bbox(addition)
    });
    debug({
      type: "draw",
      geometry: addition.geometry,
      style: {
        width: 4,
        color: DEBUG_COLOR_1,
        opacity: 0.7
      },
      fade: 100000
    });
  }

  // add new edge
  // get candidates
  const buffer = 0.01;
  const bbox = turf.bbox(addition);
  const sw = turf.destination(turf.point(bbox.slice(0, 2)), buffer, 225, UNITS);
  const ne = turf.destination(turf.point(bbox.slice(2, 4)), buffer, 45, UNITS);

  const candidates = this.edgetree.search({
    minX: sw.geometry.coordinates[0],
    minY: sw.geometry.coordinates[1],
    maxX: ne.geometry.coordinates[0],
    maxY: ne.geometry.coordinates[1]
  });

  const nodes = new Map();
  const vertices = new Map();
  for (const candidate of candidates) {
    const refs = this.edges.get(candidate.id);

    for (const ref of refs) {
      vertices.set(ref, turf.point(this.vertices.get(ref)));
    }

    nodes.set(refs[0], vertices.get(refs[0]));
    nodes.set(refs[refs.length - 1], vertices.get(refs[refs.length - 1]));
  }

  if (process.env.DEBUG) {
    const lines = [];

    for (const candidate of candidates) {
      const coordinates = [];
      const refs = this.edges.get(candidate.id);

      for (const ref of refs) {
        coordinates.push(this.vertices.get(ref));
      }
      lines.push(coordinates);
    }

    debug({
      type: "fit",
      bbox: turf.bbox(turf.multiLineString(lines))
    });
    debug({
      type: "log",
      message: candidates.length + " edge candidates"
    });
    debug({
      type: "draw",
      geometry: turf.multiLineString(lines).geometry,
      style: {
        width: 2,
        color: DEBUG_COLOR_2,
        opacity: 0.7
      },
      fade: 100000
    });
    debug({
      type: "log",
      message: vertices.size + " vertex candidates"
    });
    const vertexPts = [];
    for (const vertex of vertices) {
      vertexPts.push(vertex[1].geometry.coordinates);
    }
    debug({
      type: "draw",
      geometry: turf.multiPoint(vertexPts).geometry,
      style: {
        width: 4,
        color: DEBUG_COLOR_2,
        opacity: 0.7
      },
      fade: 100000
    });

    debug({
      type: "log",
      message: nodes.size + " node candidates"
    });
    const nodePts = [];
    for (const node of nodes) {
      nodePts.push(node[1].geometry.coordinates);
    }
    debug({
      type: "draw",
      geometry: turf.multiPoint(nodePts).geometry,
      style: {
        width: 8,
        color: DEBUG_COLOR_3,
        opacity: 0.7
      },
      fade: 100000
    });
    debug({
      // todo: delete
      type: "fit",
      bbox: turf.bbox(turf.multiLineString(lines))
    });
  }

  const steps = [];
  for (const coordinate of addition.geometry.coordinates) {
    const nodeDistances = [];
    const vertexDistances = [];
    const pt = turf.point(coordinate);
    for (const node of nodes) {
      const distance = turf.distance(pt, node[1]);
      nodeDistances.push({
        id: node[0],
        distance: distance
      });
    }
    for (const vertex of vertices) {
      const distance = turf.distance(pt, vertex[1]);
      vertexDistances.push({
        id: vertex[0],
        distance: distance
      });
    }
    nodeDistances.sort((a, b) => {
      return a.distance - b.distance;
    });
    vertexDistances.sort((a, b) => {
      return a.distance - b.distance;
    });
    let closestNode;
    let closestVertex;
    if (nodeDistances.length) {
      closestNode = nodeDistances[0];
    }
    if (vertexDistances.length) {
      closestVertex = vertexDistances[0];
    }

    if (process.env.DEBUG) {
      for (const item of nodeDistances) {
        const line = turf.lineString([
          coordinate,
          nodes.get(item.id).geometry.coordinates
        ]);
        debug({
          type: "draw",
          geometry: line.geometry,
          style: {
            width: 1,
            color: DEBUG_COLOR_1,
            opacity: 0.9
          },
          fade: 3000
        });
      }

      for (const item of vertexDistances) {
        const line = turf.lineString([
          coordinate,
          vertices.get(item.id).geometry.coordinates
        ]);
        debug({
          type: "draw",
          geometry: line.geometry,
          style: {
            width: 1,
            color: DEBUG_COLOR_4,
            opacity: 0.9
          },
          fade: 3000
        });
      }
    }

    if (closestNode.distance <= MAX_NODE_SHIFT) {
      if (process.env.DEBUG) {
        debug({
          type: "draw",
          geometry: nodes.get(closestNode.id).geometry,
          style: {
            width: 20,
            color: DEBUG_COLOR_1,
            opacity: 0.9
          },
          fade: 8000
        });
      }
      steps.push({
        type: "node",
        id: closestNode.id
      });
      continue;
    } else if (closestVertex.distance <= MAX_VERTEX_SHIFT) {
      if (process.env.DEBUG) {
        debug({
          type: "draw",
          geometry: vertices.get(closestVertex.id).geometry,
          style: {
            width: 20,
            color: DEBUG_COLOR_1,
            opacity: 0.9
          },
          fade: 8000
        });
      }
      steps.push({
        type: "vertex",
        id: closestVertex.id
      });
      continue;
    } else {
      steps.push({
        type: "insert",
        id: "n?" + this.id++,
        coordinate: coordinate
      });
      continue;
    }
  }

  let next = steps.shift();
  let insert = [next];
  while (steps.length) {
    next = steps.shift();
    if (next) {
      insert.push(next);

      if (next.type === "node" || next.type === "vertex") {
        // insert edge
        const id = "e?" + this.id++;
        const refs = [];
        for (const item of insert) {
          refs.push(item.id);
        }
        this.edges.set(id, refs);

        // normalize
        const start = this.nodes.get(refs[0]);
        if (start) {
          // update existing node
          start.add(id);
          this.nodes.set(refs[0], start);
        } else {
          // create new node
          this.nodes.set(next.id, new Set());
          // split edges

          /*  todo: split edges if a vertex was upgraded
          for (const candidate of candidates) {
            const candidateRefs = this.edges.get(candidate.id);
          }
          */
        }
        const end = this.nodes.get(refs[refs.length - 1]);
        if (end) {
          // update existing node
          end.add(id);
          this.nodes.set(refs[refs.length - 1], end);
        } else {
          // create new node
          this.nodes.set(next.id, new Set());

          // split edges
          /* todo: split edges if a vertex was upgraded
          for (const candidate of candidates) {
            const candidateRefs = this.edges.get(candidate.id);
          }
          */
        }

        // new edge
        insert = [next];
      }
    }
  }
};

Mashnet.prototype.toJSON = function() {
  // serialize
  const json = {
    edges: [],
    vertices: [],
    nodes: [],
    metadata: [],
    nodetree: this.nodetree.toJSON(),
    edgetree: this.edgetree.toJSON(),
    id: this.id
  };

  for (const edge of this.edges) {
    json.edges.push(edge);
  }
  for (const vertex of this.vertices) {
    json.vertices.push(vertex);
  }
  for (const node of this.nodes) {
    json.nodes.push(node);
  }
  for (const data of this.metadata) {
    json.metadata.push(data);
  }

  return json;
};

Mashnet.prototype.fromJSON = function(json) {
  // deserialize
  for (const edge of json.edges) {
    this.edges.set(edge[0], edge[1]);
  }
  for (const vertex of json.vertices) {
    this.vertices.set(vertex[0], vertex[1]);
  }
  for (const node of json.nodes) {
    this.nodes.set(node[0], node[1]);
  }
  for (const data of json.metadata) {
    this.metadata.set(data[0], data[1]);
  }
  this.edgetree = this.edgetree.fromJSON(json.edgetree);
  this.nodetree = this.nodetree.fromJSON(json.nodetree);
  this.id = json.id;
};

module.exports = Mashnet;
