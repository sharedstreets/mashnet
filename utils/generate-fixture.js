<<<<<<< HEAD
"use strict";
=======
#! /usr/bin/env node

'use strict';
>>>>>>> 9db7af70ff7f74be8786906d3a072c158a71e420

// generate a fixture from a osm.pbf file
// node generate-fixture honolulu.osm.pbf honolulu.json

const fs = require("fs");
const through = require("through2");
const parser = require("osm-pbf-parser");
const turf = require("@turf/turf");
const normalize = require("../src/normalizer.js");

if (require.main === module) {
    if (!process.argv[2] || !process.argv[3]) {
        console.error();
        console.error('Generate a graph friendly road network given an OSM PBF');
        console.error();
        console.error('Usage ./generate-fixture.js <osm.pbf> <output.json>');
        console.error();
        process.exit(1);
    }

    const pbf = process.argv[2];
    const fixture = process.argv[3]

    run(pbf, fixture);
} else {
    module.exports = run;
}

/**
 * Given the location of an OSM pbf file,
 * output a normalized graph
 *
 * @param {String} pbf path to osm.pbf
 * @param {String} output path to write normalized JSON to
 */
async function run(pbf, output) {
  const ways = await loadPBF(pbf);
  const graph = normalize(ways);
  fs.writeFileSync(output, JSON.stringify(graph));
}

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
            if (item.type === "way") {
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
      .on("finish", () => {
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
            if (item.type === "node") {
              if (data.nodes.has(item.id)) {
                data.nodes.set(item.id, [item.lon, item.lat]);
              }
            }
          }
          next();
        })
      )
      .on("finish", () => {
        resolve(data);
      });
  });
}
