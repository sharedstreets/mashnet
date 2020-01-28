'use strict';

const fs = require('fs');
const turf = require('@turf/turf');

const Mashnet = require('../src/index.js');

const osm = JSON.parse(fs.readFileSync(process.argv[2]));
const dot = JSON.parse(fs.readFileSync(process.argv[3]));
const fails = [];
const net = new Mashnet(osm);
let i = 0;
for (const edge of dot.features) {
  i++;
  console.log('i:', ((i / dot.features.length) * 100).toFixed(4) + '%');
  const line = turf.lineString(edge.geometry.coordinates[0], edge.properties);
  const scores = net.scan(line);
  const match = net.match(scores);
  if (match > 0.99) {
    /* for (let k of Object.keys(edge.properties)) {
      edge.properties['ncdot:'+k] = edge.properties[k]
      delete edge.properties[k]
    }
    net.merge(scores[0].id, edge.properties)*/
  } else {
    edge.properties.match = match;
    fails.push(edge);
  }
}

// fs.writeFileSync(process.argv[4], JSON.stringify(net.toJSON()))
fs.writeFileSync(
  process.argv[4],
  JSON.stringify(turf.featureCollection(fails))
);
