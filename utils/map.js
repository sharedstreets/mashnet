const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");

const Mashnet = require("../src/index.js");

const network = JSON.parse(fs.readFileSync(process.argv[2]));

var net = new Mashnet([]);
net.fromJSON(network);

for (let edge of net.edges) {
  const metadata = net.metadata.get(edge[0]);
  const coordinates = [];
  for (let ref of edge[1]) {
    coordinates.push(net.vertices.get(ref));
  }
  const line = turf.lineString(coordinates, metadata);
  console.log(JSON.stringify(line));
}
