const RTree = require("rbush");
const turf = require("@turf/turf");
const cover = require("@mapbox/tile-cover");
let softmax = require("softmax-fn");

const Mashnet = function(ways) {
  this.edges = new Map();
  this.vertices = new Map();
  this.nodes = new Map();
  this.metadata = new Map();
  this.nodetree = new RTree();
  this.edgetree = new RTree();
  this.pending = [];

  for (let way of ways) {
    if (way.geometry.coordinates.length === way.properties.refs.length) {
      // setup vertices
      var i = 0;
      for (let ref of way.properties.refs) {
        this.vertices.set(ref, way.geometry.coordinates[i]);
        i++;
      }

      // setup nodes
      //   start
      var start = way.properties.refs[0];
      var adjacent = this.nodes.get(start);
      if (!adjacent) {
        adjacent = new Set();
      }
      adjacent.add(way.properties.id);
      this.nodes.set(start, adjacent);

      //   end
      var end = way.properties.refs[way.properties.refs.length - 1];
      var adjacent = this.nodes.get(end);
      if (!adjacent) {
        adjacent = new Set();
      }
      adjacent.add(way.properties.id);
      this.nodes.set(end, adjacent);

      // setup edges
      this.edges.set(way.properties.id, way.properties.refs);

      // setup metadata
      var metadata = {};
      for (let property of Object.keys(way.properties)) {
        if (["id", "refs"].indexOf(property) === -1) {
          metadata[property] = way.properties[property];
        }
      }
      this.metadata.set(way.properties.id, metadata);
    }
  }

  // setup nodetree
  var nodeItems = [];
  for (let node of this.nodes) {
    var vertex = this.vertices.get(node[0]);
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
  var edgeItems = [];
  for (let edge of this.edges) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (let ref of edge[1]) {
      var vertex = this.vertices.get(ref);
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

Mashnet.prototype.match = function(addition) {
  // find matching edge

  // get candidates
  var buffer = 0.1;
  var bbox = turf.bbox(addition);
  var sw = turf.destination(turf.point(bbox.slice(0, 2)), buffer, 225, {
    units: "kilometers"
  });
  var ne = turf.destination(turf.point(bbox.slice(2, 4)), buffer, 45, {
    units: "kilometers"
  });

  var candidates = this.edgetree.search({
    minX: sw.geometry.coordinates[0],
    minY: sw.geometry.coordinates[1],
    maxX: ne.geometry.coordinates[0],
    maxY: ne.geometry.coordinates[1]
  });

  // get scores
  var a = heuristics(addition);

  var matches = [];
  for (let candidate of candidates) {
    const refs = this.edges.get(candidate.id);
    const coordinates = [];
    for (let ref of refs) {
      coordinates.push(this.vertices.get(ref));
    }
    const line = turf.lineString(coordinates);
    var b = heuristics(line);
    var scores = compare(a, b);

    var weights = {
      distance: 1,
      straight: 1,
      curve: 1,
      scan: 1,
      terminal: 1
    };

    var score = 0;
    for (let s of Object.keys(scores)) {
      score += scores[s] * weights[s];
    }

    if (score > 0) {
      matches.push({
        id: candidate.id,
        line: line,
        score: score
      });
    }
  }

  var softmaxScores = softmax(
    matches.map(match => {
      return match.score;
    })
  );
  var i = 0;
  for (let sm of softmaxScores) {
    matches[i].softmax = sm;
    i++;
  }

  matches = matches.sort((a, b) => {
    return b.softmax - a.softmax;
  });

  return matches;
};

function compare(a, b) {
  var maxDistance = Math.max(a.distance, b.distance);
  var minDistance = Math.min(a.distance, b.distance);
  var maxStraight = Math.max(a.straight, b.straight);
  var minStraight = Math.min(a.straight, b.straight);
  var maxCurve = Math.max(a.curve, b.curve);
  var minCurve = Math.min(a.curve, b.curve);

  var scan = similarity(a.scan, b.scan);
  var terminal = similarity(a.terminal, b.terminal);

  return {
    distance: minDistance / maxDistance,
    straight: minStraight / maxStraight,
    curve: minCurve / maxCurve,
    scan: scan,
    terminal: terminal
  };
}

function similarity(a, b) {
  var union = new Set();
  for (let scan of a) {
    union.add(scan);
  }
  for (let scan of b) {
    union.add(scan);
  }
  var overlap = new Set();
  for (let key of union) {
    if (a.has(key) && b.has(key)) {
      overlap.add(key);
    }
  }
  var sim = 0;
  if (union.size > 0) {
    sim = overlap.size / union.size;
  }
  return sim;
}

function heuristics(line) {
  var buffer = 0.02;
  var units = { units: "kilometers" };
  var z = 24;
  var zs = { min_zoom: z, max_zoom: z };
  var distance = turf.lineDistance(line, units);
  var straight = turf.distance(
    turf.point(line.geometry.coordinates[0]),
    turf.point(line.geometry.coordinates[line.geometry.coordinates.length - 1]),
    units
  );
  var curve = straight / distance;
  var indexes = cover.indexes(turf.buffer(line, buffer, units).geometry, zs);
  var scan = new Set();
  for (let index of indexes) {
    scan.add(index);
  }

  var terminalIndexes = cover.indexes(
    turf.buffer(
      turf.multiPoint([
        line.geometry.coordinates[0],
        line.geometry.coordinates[line.geometry.coordinates.length - 1]
      ]),
      buffer,
      units
    ).geometry,
    zs
  );
  var terminal = new Set();
  for (let index of terminalIndexes) {
    terminal.add(index);
  }

  return {
    distance: distance,
    straight: straight,
    curve: curve,
    scan: scan,
    terminal: terminal
  };
}

Mashnet.prototype.merge = function(existing, addition) {
  // merge existing edge
  var metadata = this.metadata.get(existing);
  for (let property of Object.keys(addition)) {
    metadata[property] = addition[property];
  }
  this.metadata.set(existing, metadata);
};

Mashnet.prototype.add = function() {
  // add new edge
};

Mashnet.prototype.toJSON = function() {
  // serialize
  var json = {
    edges: [],
    vertices: [],
    nodes: [],
    metadata: [],
    nodetree: this.nodetree.toJSON(),
    edgetree: this.edgetree.toJSON()
  };

  for (let edge of this.edges) {
    json.edges.push(edge);
  }
  for (let vertex of this.vertices) {
    json.vertices.push(vertex);
  }
  for (let node of this.nodes) {
    json.nodes.push(node);
  }
  for (let data of this.metadata) {
    json.metadata.push(data);
  }

  return json;
};

Mashnet.prototype.fromJSON = function(json) {
  // deserialize
  for (let edge of json.edges) {
    this.set(edge[0], edge[1]);
  }
  for (let vertex of json.vertices) {
    this.set(vertex[0], vertex[1]);
  }
  for (let node of json.nodes) {
    this.set(node[0], node[1]);
  }
  for (let data of json.metadata) {
    this.set(data[0], data[1]);
  }
  this.edgetree = rbush.fromJSON(json.edgetree);
  this.nodetree = rbush.fromJSON(json.nodetree);
};

module.exports = Mashnet;
