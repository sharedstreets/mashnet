'use strict';

// generate a fixture from a osm.pbf file
// node generate-fixture honolulu.osm.pbf honolulu.json

const fs = require('fs');
const through = require('through2');
const parser = require('osm-pbf-parser');
const turf = require('@turf/turf');
const normalize = require('../src/normalizer.js');

async function run() {
  const pbf = process.argv[2];
  const fixture = process.argv[3];

  const ways = await loadPBF(pbf);
  const graph = normalize(ways);
  fs.writeFileSync(fixture, JSON.stringify(graph));
}

run();

async function loadPBF(pbf) {
  let data = {
    ways: [],
    nodes: new Map()
  };
  data = await loadWays(pbf, data);
  data = await loadNodes(pbf, data);

  const edges = [];
  for (const way of data.ways) {
    const coordinates = [];
    let complete = true;
    for (const ref of way.refs) {
      const coordinate = data.nodes.get(ref);

      if (coordinate && coordinate.length === 2) {
        coordinates.push(coordinate);
      } else {
        complete = false;
      }
    }

    if (complete && coordinates.length >= 2) {
      const edge = turf.lineString(coordinates, { id: way.id, refs: way.refs });
      for (const tag of Object.keys(way.tags)) {
        edge.properties[tag] = way.tags[tag];
      }

      edges.push(edge);
    }
  }

  return edges;
}

async function loadWays(pbf, data) {
  return new Promise((resolve, reject) => {
    const parse = parser();

    // load ways
    fs.createReadStream(pbf)
      .pipe(parse)
      .pipe(
        through.obj((items, enc, next) => {
          for (const item of items) {
            if (item.type === 'way') {
              if (item.tags.highway) {
                data.ways.push(item);
                for (const ref of item.refs) {
                  data.nodes.set(ref, []);
                }
              }
            }
          }
          next();
        })
      )
      .on('finish', () => {
        resolve(data);
      });
  });
}

async function loadNodes(pbf, data) {
  return new Promise((resolve, reject) => {
    const parse = parser();

    // load ways
    fs.createReadStream(pbf)
      .pipe(parse)
      .pipe(
        through.obj((items, enc, next) => {
          for (const item of items) {
            if (item.type === 'node') {
              if (data.nodes.has(item.id)) {
                data.nodes.set(item.id, [item.lon, item.lat]);
              }
            }
          }
          next();
        })
      )
      .on('finish', () => {
        resolve(data);
      });
  });
}
