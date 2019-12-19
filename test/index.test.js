const test = require("tap").test;
const path = require("path");

const Mashnet = require("../src/index.js");

test("mashnet", async t => {
  const honolulu = require(path.join(__dirname, "./fixtures/honolulu.json"));

  var net = new Mashnet(honolulu);

  var addition = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [
        [-157.92146623134613, 21.341897545122254],
        [-157.92099952697754, 21.341887552012036],
        [-157.92073667049405, 21.341847579564284],
        [-157.920001745224, 21.341737655276813],
        [-157.91917026042938, 21.34162773090694]
      ]
    }
  };

  var result = net.match(addition);

  t.done();
});
