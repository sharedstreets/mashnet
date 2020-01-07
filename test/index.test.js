const test = require("tap").test;
const path = require("path");
const turf = require("@turf/turf");

const Mashnet = require("../src/index.js");

test("mashnet", async t => {
  const honolulu = require(path.join(__dirname, "../samples/honolulu.json"));

  var net = new Mashnet(honolulu);

  var addition = {
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
  var result = net.match(addition);

  t.ok(result.length > 0, "found matches");
  t.equal(result[0].line.type, "Feature", "result contains matched feature");

  t.done();
});
