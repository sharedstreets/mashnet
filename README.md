[WIP] mashnet
---

- [Overview](https://github.com/sharedstreets/mashnet#overview)
- [API](https://github.com/sharedstreets/mashnet#API)
- [Model](https://github.com/sharedstreets/mashnet#model)
- [Workflow](https://github.com/sharedstreets/mashnet#workflow)
- [Actions](https://github.com/sharedstreets/mashnet#actions)
- [Misc](https://github.com/sharedstreets/mashnet#misc)
- [Install](https://github.com/sharedstreets/mashnet#install)
- [Test](https://github.com/sharedstreets/mashnet#test)
- [Coverage](https://github.com/sharedstreets/mashnet#coverage)
- [Lint](https://github.com/sharedstreets/mashnet#lint)
- [Train](https://github.com/sharedstreets/mashnet#traine)

---

## Overview

`Mashnet` is a street network conflation library, used to merge road graphs for mapping and routing. It is designed to work with both human mapped data and ML derived networks, aiming for clean and consistent merging, even with disparate input datasets. Use `mashnet` to detect missing edges in the road graph, and enhance existing edges with new metadata.

_Example of merging 3 road networks into a single, routable network:_

![](https://i.imgur.com/ihvsQZR.jpg)

## Stability

Mashnet is under active development. It is usable in its current form, and the overall workflow is established, however, the API is subject to change rapidly until further notice.

## API

### new

The `mashnet` constructor is used to instantiate a new network. An optional path may be provided to an existing serialized road graph.

```js
const Mashnet = require('mashnet')

const net = new Mashnet('./honolulu.json')
```

### scan

Scan takes a proposed street and returns a list of similar edges in the existing graph. The edge list is ranked by similarity score.

```js
const street = {
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
}

const scores = net.scan(street)
```

### match

Match takes a list of edge scores and returns a confidence score that the top ranked edge represents the same street as the proposed input street.

```js
const isMatch = net.match(scores)
```

### merge

Merge accepts an existing metadata Id and a new set of metadata. The function will add or overwrite any new metadata to the existing blob. This function should be performed when a likely match is detected.

```js
const metadata = {
  highway: "motorway",
  surface: "asphalt",
  max_speed: 70
}
const isMatch = net.match(scores)
if (isMatch > 0.95) {
  net.merge(scores[0].id, metadata)
}
```

### query

Query the graph by a bbox. Returns a subgraph of nodes, vertices, and edges. Used internally for isolating graph partitions, but also useful for analyzing areas of interest.

```js
const subgraph = net.query([minX, minY, maxX, maxY]);
```

### snap

Accepts a proposed street and returns a set of "snaps" to the existing road network. Each snap of the proposed street will include information about nearby nodes, vertices, and edges.

```js
const snaps = net.snap(street);
```

### split

Accepts a set of snaps, and creates a set of logical changeset chunks. Some of these chunks will be new edges and some will be existing edges, indicated by the presence of void snaps.

```js
const splits = net.split(snaps);
```

### materialize

Accepts a set of changeset splits, and returns an array of GeoJSON LineStrings, which can be used to visualize the changesets.

```js
const lines = net.materialize(splits);
```

### commit

Accepts a set of changeset splits, and commits them to the graph. Optionally accepts metadata that can be merged into matching pre-existing edges.

```js
net.commit(splits, metadata);
```

### propose

Accepts a proposed street, and returns a set of changeset splits. This function is a wrapper of `snap` + `split`. These splits are not applied to the graph automatically with the `propose` function, allowing them to be visualized or fed to a task manager before modifying the network.

```js
const street = {
  type: "Feature",
  properties: {
    "max_speed": 30
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [-157.9146158695221, 21.346424354025306],
      [-157.9154634475708, 21.347043906401122],
      [-157.9165470600128, 21.348442886005444]
    ]
  }
}

net.propose(street)
```

### apply

Apply accepts a new street represented as a GeoJSON LineString Feature with properties representing a metadata blob. The apply function will merge metadata and insert new edges where detected.

```js
const street = {
  type: "Feature",
  properties: {
    "max_speed": 30
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [-157.9146158695221, 21.346424354025306],
      [-157.9154634475708, 21.347043906401122],
      [-157.9165470600128, 21.348442886005444]
    ]
  }
}

net.apply(street)
```


### toJSON

Serializes the loaded graph to a JSON format that can be transferred or stored to disk.

```js
const data = net.toJSON()
fs.writeFileSync('honolulu.json', JSON.stringify(data))
```

### fromJSON

Loads a JSON representation of a street network into memory for performing operations. This can also be accomplished using the `mashnet` constructor.

```js
const honolulu = require('honolulu.json')
net.fromJSON(honolulu)
```

## Model

Many types of geospatial data come in the form of geometry. Street networks are a special case of geospatial data that benefits from a graph data structure. This graph structure is an efficient representation that allows for links between features to be conveyed. For conflation, this is especially important, since adding streets to an existing network can cause changes to the network, such as splitting a street or inserting an intersection.

- edge
  - id (unique)
  - list of vertex ids
- vertex
  - id (unique)
  - x coordinate
  - y coordinate
- node
  - id (matches unique vertex id)
  - list of connected edge ids
- metadata
  - id (matches unique edge id)
  - json blob
- nodetree
  - RTree of nodes for quick scans
- edgetree
  - RTree of edges for quick scans

## Workflow

A conflation network can be created from scratch or with a bootstrapped graph from an existing network, such as OpenStreetMap or any other basemap that contains topological road links. After bootstrapping, new data is merged in iteratively, road by road. When adding a new street, we first look for an existing duplicate street. If one is found, the new street will be merged into the existing edge. If a match is not found, a new edge will be created and inserted into the graph.

## Actions

- *constructor*
  - initialize an existing graph database or create a new one
- *normalize*
  - identify intersection nodes
  - split edges crossing intersections
  - merge redundant edges
- *match*
  - looks for a matching edge in the graph
  - returns an ID with a confidence score
  - uses a trained classifier
  - inputs
    - quadkey haversine score of line
    - quadkey haversine score of buffered west-most node
    - quadkey haversine score of buffered east-most node
    - curve score
    - linear distance
  - inputs are normalized from pre-computed planet wide scan of extremes for each heuristic
- *add*
  - attempts to add a street to the road graph
  - looks for a matching existing edge
    - if found, merge metadata into existing edge
  - looks for intersections splitting proposed edge
    - if found, use use existing nodes or create new nodes
  - add new vertices and edges
  - re-normalize graph (possibly not needed)
  - add may fail, in which case it will remain pending
- *merge*
  - combine two metadata sets
  - if not present on match, add new metadata
  - if present, follow merge strategy (do nothing, use new, numeric average, etc)
  - merge may fail, in which case it will remain pending


## Install

```sh
npm i mashnet
```

## Test

```sh
npm t
```

## Coverage

```sh
npm run coverage
```

## Lint

Runs a linter across codebase and automatically formats all code using [prettier](https://prettier.io).

```sh
npm run lint
```

## Train

A pre-trained neural network is included with `mashnet`. A new network can be trained with custom parameters or training data.

```sh
npm run train
```
