const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp");
const brain = require("brain.js");

const ITERATIONS = 15000;

const modelDir = path.join(__dirname, "../model/");
const model = path.join(modelDir, "match.json");
const cachePath = path.join(modelDir, "cache.json");
mkdirp.sync(modelDir);

const nn = new brain.NeuralNetwork();

const cache = fs
  .readFileSync(cachePath)
  .toString()
  .split("\n")
  .filter(line => {
    return line.length > 0;
  })
  .map(JSON.parse);
console.log(cache.length + " samples");
nn.train(cache.slice(0, 50000), {
  log: true,
  logPeriod: 10,
  iterations: ITERATIONS,
  learningRate: 0.2,
  errorThresh: 0.001
});
fs.writeFileSync(model, JSON.stringify(nn.toJSON()));
