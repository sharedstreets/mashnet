"use strict";

const fs = require("fs");
const turf = require("@turf/turf");
const cover = require("@mapbox/tile-cover");

const Mashnet = require("../src/index.js");

const osm = JSON.parse(fs.readFileSync(process.argv[2]));
const dot = JSON.parse(fs.readFileSync(process.argv[3]));
// const predictions = [];
const net = new Mashnet(osm);
const quadkeys = new Set();
for (const edge of osm) {
  const keys = cover.indexes(edge.geometry, { min_zoom: 17, max_zoom: 17 });
  for (const key of keys) {
    quadkeys.add(key);
  }
}

let i = 0;
let total = 0;
let then = Date.now();
let now = then;
let totalTime = 0;
for (const edge of dot.features) {
  now = Date.now();
  const delta = now - then;
  totalTime += delta;
  console.log(totalTime / i);
  then = now;
  // console.log("i:", ((i / dot.features.length) * 100).toFixed(4) + "%");
  const line = turf.lineString(edge.geometry.coordinates[0], edge.properties);

  const keys = cover.indexes(edge.geometry, { min_zoom: 17, max_zoom: 17 });
  let found = false;
  for (const key of keys) {
    if (quadkeys.has(key)) {
      found = true;
      continue;
    }
  }

  if (found && line.geometry.coordinates.length < 100) {
    i++;
    total++;
    // console.log('line:')
    // console.log(JSON.stringify(line))
    try {
      net.append(line);
    } catch (e) {
      // error found
    }
    /* const scores = net.scan(line);
    const match = net.match(scores);
    edge.properties.score = match;
    // console.log(JSON.stringify(edge))
    if (match < 0.5) {
      miss++;
      console.log(miss / total);
    }
    predictions.push(edge);*/
  }
}
/*
fs.writeFileSync(
  process.argv[4],
  JSON.stringify(turf.featureCollection(predictions))
);
*/
