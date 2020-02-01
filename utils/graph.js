"use strict";

// node graph.js ./graph.json ./graph.html

const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");
const Mashnet = require("../src/index.js");

const html = fs.readFileSync(path.join(__dirname, "graph.html")).toString();

const token =
  "pk.eyJ1IjoibW9yZ2FuaGVybG9ja2VyIiwiYSI6Ii1zLU4xOWMifQ.FubD68OEerk74AYCLduMZQ";

const honolulu = require(path.join(__dirname, "../samples/honolulu.json"));
const net = new Mashnet(honolulu);

const edges = turf.featureCollection([]);
const nodes = turf.featureCollection([]);
const vertices = turf.featureCollection([]);

for (const edge of net.edges) {
  const coordinates = [];
  for (const ref of edge[1]) {
    coordinates.push(net.vertices.get(ref));
  }
  edges.features.push(turf.lineString(coordinates));
}

for (const node of net.nodes) {
  const coordinates = net.vertices.get(node[0]);
  nodes.features.push(turf.point(coordinates));
}

for (const vertex of net.vertices) {
  vertices.features.push(turf.point(vertex[1]));
}

const render = html
  .split("{{token}}")
  .join(token)
  .split("{{edges}}")
  .join(JSON.stringify(edges))
  .split("{{vertices}}")
  .join(JSON.stringify(vertices))
  .split("{{nodes}}")
  .join(JSON.stringify(nodes));

fs.writeFileSync(process.argv[2], render);
