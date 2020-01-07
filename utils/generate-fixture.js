// generate a fixture from a osm.pbf file
// node generate-fixture honolulu.osm.pbf honolulu.json

const fs = require("fs");
const path = require("path");
const through = require("through2");
const parser = require("osm-pbf-parser");
const turf = require("@turf/turf");
const normalize = require("../src/normalizer.js");

const Mashnet = require("../src/index.js");

async function run() {
  const pbf = process.argv[2];
  const fixture = process.argv[3];

  var ways = await loadPBF(pbf);
  var graph = normalize(ways);
  fs.writeFileSync(fixture, JSON.stringify(graph));
}

run();

async function loadPBF(pbf) {
  var data = {
    ways: [],
    nodes: new Map()
  };
  data = await loadWays(pbf, data);
  data = await loadNodes(pbf, data);

  var edges = [];
  for (let way of data.ways) {
    var coordinates = [];
    var complete = true;
    for (let ref of way.refs) {
      var coordinate = data.nodes.get(ref);

      if (coordinate && coordinate.length === 2) {
        coordinates.push(coordinate);
      } else {
        complete = false;
      }
    }

    if (complete && coordinates.length >= 2) {
      var edge = turf.lineString(coordinates, { id: way.id, refs: way.refs });
      for (let tag of Object.keys(way.tags)) {
        edge.properties[tag] = way.tags[tag];
      }

      edges.push(edge);
    }
  }

  return edges;
}

async function loadWays(pbf, data) {
  return new Promise((resolve, reject) => {
    var parse = parser();

    // load ways
    fs.createReadStream(pbf)
      .pipe(parse)
      .pipe(
        through.obj((items, enc, next) => {
          for (let item of items) {
            if (item.type === "way") {
              if (item.tags.highway) {
                data.ways.push(item);
                for (let ref of item.refs) {
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
    var nodes = [];
    var parse = parser();

    // load ways
    fs.createReadStream(pbf)
      .pipe(parse)
      .pipe(
        through.obj((items, enc, next) => {
          for (let item of items) {
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
