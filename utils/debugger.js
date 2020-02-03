"use strict";

// node debug-map.js ./actions.json ./animation.html

const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "debugger.html")).toString();

const token =
  "pk.eyJ1IjoibW9yZ2FuaGVybG9ja2VyIiwiYSI6Ii1zLU4xOWMifQ.FubD68OEerk74AYCLduMZQ";

const actions = fs
  .readFileSync(process.argv[2])
  .toString()
  .split("\n")
  .filter(line => {
    return line.length;
  })
  .map(JSON.parse);
/* .filter(line => {
    return line.type !== 'log';
  });*/

const render = html
  .split("{{token}}")
  .join(token)
  .split("{{actions}}")
  .join(JSON.stringify(actions));

fs.writeFileSync(process.argv[3], render);
