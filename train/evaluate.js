const path = require("path");
const fs = require("fs");
const turf = require("@turf/turf");
const rimraf = require("rimraf");
const mkdirp = require("mkdirp");
const brain = require("brain.js");
const Chance = require("chance");
const Mashnet = require("../src/index.js");

const SHIFT = 0.005;
const JITTER = 0.0008;
const UNITS = { units: "kilometers" };
MATCH_DEPTH = 5;

const honolulu = require(path.join(__dirname, "../samples/honolulu.json"));
const chance = new Chance();

var net = new Mashnet(honolulu);

var i = 0;
var total = 0;
var misses = 0;
var fakes = 0;
for (let edge of net.edges) {
  i++;
  if (i > 0) {
    total++;
    console.log(
      "misses: " +
        (misses / total).toFixed(4) +
        "% - fakes: " +
        (fakes / total).toFixed(4) +
        "% total: " +
        total
    );

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
      const prediction = net.match(scores);

      if (prediction > 0.9) {
        fakes++;
        fake.properties.match = prediction;
        console.log("fake");
        console.log(
          JSON.stringify(
            turf.featureCollection([
              fake,
              turf.lineString(scores[0].line.geometry.coordinates)
            ])
          )
        );
      }

      // reinsert
      net.edges.set(copy[0], copy[1]);
      net.edgetree.insert(treecopy(net, edge));
    } else {
      // match
      const scores = net.scan(fake);
      const prediction = net.match(scores);

      if (prediction < 0.1) {
        misses++;
        fake.properties.match = prediction;
        console.log("miss");
        console.log(
          JSON.stringify(
            turf.featureCollection([
              fake,
              turf.lineString(scores[0].line.geometry.coordinates)
            ])
          )
        );
      }
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
