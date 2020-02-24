"use strict";

const test = require("tap").test;
const path = require("path");
// const turf = require('@turf/turf');

const Mashnet = require("../src/index.js");

test("mashnet", async t => {
  const honolulu = require(path.join(__dirname, "../samples/honolulu.json"));

  const net = new Mashnet(honolulu);

  const addition = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [
        [-157.9146158695221, 21.346424354025306],
        [-157.9154634475708, 21.347043906401122],
        [-157.9165470600128, 21.348442886005444]
      ]
    }
  };

  // scan

  const scores = net.scan(addition);

  t.ok(scores.length > 0, "found matches");
  t.equal(scores[0].line.type, "Feature", "result contains matched feature");

  // match

  const isMatch = net.match(scores);

  t.ok(isMatch, "returns a match score");

  const metadata = {
    max_speed: 70
  };

  // merge

  net.merge(scores[0].id, metadata);

  const data = net.metadata.get(scores[0].id);
  t.equal(
    JSON.stringify(data),
    '{"highway":"residential","name":"Ala Akulikuli Street","max_speed":70}',
    "metadata merged"
  );

  // query

  const bbox = [
    -157.84507155418396,
    21.29764138193422,
    -157.84247517585754,
    21.299940472209933
  ];
  const subgraph = net.query(bbox);

  t.ok(subgraph.edges.size, "subgraph edges present");
  t.ok(subgraph.nodes.size, "subgraph nodes present");
  t.ok(subgraph.vertices.size, "subgraph vertices present");
  t.ok(subgraph.edgeTree.all().length, "subgraph edgeTree present");
  t.ok(subgraph.nodeTree.all().length, "subgraph nodeTree present");

  // snap

  const street = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [
        [-157.91675090789795, 21.380355978162594],
        [-157.9176950454712, 21.378317904666634],
        [-157.91451930999756, 21.37412178163886],
        [-157.9172658920288, 21.36864665932247],
        [-157.91460514068604, 21.358894839625684]
      ]
    }
  };

  const snaps = net.snap(street);

  t.equal(snaps.length, 492, "snap phantoms to network");

  // split

  const splits = net.split(snaps);

  t.equal(splits.length, 35, "splits snaps into chunks");

  // materialize

  const changesets = net.materialize(splits);

  t.equal(changesets.length, 35, "creates geojson linestrings from splits");

  // visualize changesets:
  // console.log(JSON.stringify(turf.featureCollection(changesets)));

  // commit

  net.commit(splits);

  t.done();
});
