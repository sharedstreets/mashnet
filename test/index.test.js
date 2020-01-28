'use strict';

const test = require('tap').test;
const path = require('path');

const Mashnet = require('../src/index.js');

test('mashnet', async(t) => {
  const honolulu = require(path.join(__dirname, '../samples/honolulu.json'));

  const net = new Mashnet(honolulu);

  const addition = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [
        [-157.9146158695221, 21.346424354025306],
        [-157.9154634475708, 21.347043906401122],
        [-157.9165470600128, 21.348442886005444]
      ]
    }
  };

  // scan

  const scores = net.scan(addition);

  t.ok(scores.length > 0, 'found matches');
  t.equal(scores[0].line.type, 'Feature', 'result contains matched feature');

  // match

  const isMatch = net.match(scores);

  t.ok(isMatch, 'returns a match score');

  const metadata = {
    max_speed: 70
  };

  // merge

  net.merge(scores[0].id, metadata);

  const data = net.metadata.get(scores[0].id);
  t.equal(
    JSON.stringify(data),
    '{"highway":"residential","name":"Ala Akulikuli Street","max_speed":70}',
    'metadata merged'
  );

  // add

  const street = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
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

  t.done();
});
