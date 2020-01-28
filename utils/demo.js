const path = require("path");
const turf = require("@turf/turf");

const Mashnet = require("../src/index.js");

const honolulu = require(path.join(__dirname, "../samples/honolulu.json"));

var net = new Mashnet(honolulu);
/*
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

// scan

var scores = net.scan(addition);


// match

const isMatch = net.match(scores);

const metadata = {
  max_speed: 70
};

// merge

net.merge(scores[0].id, metadata);

const data = net.metadata.get(scores[0].id);
*/
// add

var street = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "LineString",
    coordinates: [
      [-157.91604816913605, 21.35034147982776],
      [-157.91581213474274, 21.35018409732726],
      [-157.91565924882886, 21.350114149495003],
      [-157.91538298130035, 21.349984246289427],
      [-157.9150503873825, 21.34975441725907],
      [-157.91475266218185, 21.349584543396308]
    ]
  }
};

net.add(street);
