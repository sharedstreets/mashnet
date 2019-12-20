const path = require("path");
const fs = require("fs");
const turf = require("@turf/turf");
const rimraf = require("rimraf");
const mkdirp = require("mkdirp");
const Chance = require("chance");
const Mashnet = require("../src/index.js");

const COUNT = 10;
const SHIFT = 0.05;
const UNITS = { units: "kilometers" };

const dir = path.join(__dirname, "./fixtures/graphs");
rimraf.sync(dir);
mkdirp.sync(dir);

const honolulu = require(path.join(__dirname, "./fixtures/honolulu.json"));
const chance = new Chance();

for (let i = 0; i < COUNT; i++) {
  console.log(i + 1 + "/" + COUNT);
  var net = new Mashnet(honolulu);

  for (let vertex of net.vertices) {
    var point = turf.point(vertex[1]);
    var shifted = turf.destination(
      point,
      chance.normal() * SHIFT,
      Math.random() * 360,
      UNITS
    );
    net.vertices.set(vertex[0], shifted);
  }

  //fs.writeFileSync(path.join(dir, i+'.json'), net.toJSON())
}
