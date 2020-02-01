"use strict";

const fs = require("fs");
const turf = require("@turf/turf");

const Mashnet = require("../src/index.js");

const network = JSON.parse(fs.readFileSync(process.argv[2]));

const net = new Mashnet([]);
net.fromJSON(network);

for (const edge of net.edges) {
  const metadata = net.metadata.get(edge[0]);
  const coordinates = [];
  for (const ref of edge[1]) {
    coordinates.push(net.vertices.get(ref));
  }
  const line = turf.lineString(coordinates, metadata);
  console.log(JSON.stringify(line));
}
