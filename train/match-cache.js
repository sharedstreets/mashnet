const path = require("path");
const fs = require("fs");
const turf = require("@turf/turf");
const rimraf = require("rimraf");
const mkdirp = require("mkdirp");
const brain = require("brain.js");
const Chance = require("chance");
const Mashnet = require("../src/index.js");

const SHIFT = 0.003;
const JITTER = 0.0008;
const UNITS = { units: "kilometers" };
const TRAIN_COUNT = 30000;
const ITERATIONS = 10000;
const MATCH_DEPTH = 5;

const honolulu = require(path.join(__dirname, "../samples/honolulu.json"));
const chance = new Chance();
const modelDir = path.join(__dirname, "../model/");
const model = path.join(modelDir, "match.json");
const cache = path.join(modelDir, "cache.json");
mkdirp.sync(modelDir);

var net = new Mashnet(honolulu);

var samples = [];
var i = 0;
for (let edge of net.edges) {
  i++;
  console.log(i);
  if (i < TRAIN_COUNT) {
    var fake = perturb(net, edge[1]);

    if (chance.bool()) {
      // drop
      var copy = JSON.parse(JSON.stringify(edge));
      net.edges.delete(edge[0]);
      net.edgetree.remove(treecopy(net, edge), (a, b) => {
        return a.id === b.id;
      });

      // match
      const scores = net.scan(fake);
      var input = {};
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
      fs.appendFileSync(
        cache,
        JSON.stringify({
          input: input,
          output: { match: 0 }
        }) + "\n"
      );

      // reinsert
      net.edges.set(copy[0], copy[1]);
      net.edgetree.insert(treecopy(net, edge));
    } else {
      // match
      const scores = net.scan(fake);
      console.log(
        JSON.stringify(
          turf.featureCollection([
            turf.lineString(scores[0].line.geometry.coordinates, {
              stroke: "#f0f"
            }),
            turf.lineString(fake.geometry.coordinates, { stroke: "#0ff" })
          ])
        )
      );
      var input = {};
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
      fs.appendFileSync(
        cache,
        JSON.stringify({
          input: input,
          output: { match: 1 }
        }) + "\n"
      );
    }
  }
}

function perturb(net, edge) {
  const shift = chance.normal() * SHIFT;
  const drift = Math.random() * 360;

  var coordinates = [];
  for (let ref of edge) {
    var vertex = net.vertices.get(ref);
    var point = turf.point(vertex);
    var shifted = turf.destination(point, shift, drift, UNITS);
    var jittered = turf.destination(
      shifted,
      chance.normal() * JITTER,
      Math.random() * 360,
      UNITS
    );
    coordinates.push(jittered.geometry.coordinates);
  }
  var line = turf.lineString(coordinates, { stroke: "#F46BFF" });
  return line;
}

function treecopy(net, edge) {
  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;
  for (let ref of edge[1]) {
    var vertex = net.vertices.get(ref);
    if (vertex[0] < minX) minX = vertex[0];
    if (vertex[1] < minY) minY = vertex[1];
    if (vertex[0] > maxX) maxX = vertex[0];
    if (vertex[1] > maxY) maxY = vertex[1];
  }
  return {
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    id: edge[0]
  };
}
