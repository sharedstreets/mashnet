[WIP] mashnet
---

- [overview](https://github.com/sharedstreets/mashnet#overview)
- [interface](https://github.com/sharedstreets/mashnet#interface)
- [data](https://github.com/sharedstreets/mashnet#data)
- [model](https://github.com/sharedstreets/mashnet#model)
- [workflow](https://github.com/sharedstreets/mashnet#workflow)
- [actions](https://github.com/sharedstreets/mashnet#actions)
- [misc](https://github.com/sharedstreets/mashnet#misc)
- [install](https://github.com/sharedstreets/mashnet#install)
- [test](https://github.com/sharedstreets/mashnet#test)
- [lint](https://github.com/sharedstreets/mashnet#lint)
- [fixtures](https://github.com/sharedstreets/mashnet#fixtures)

---

## overview

`Mashnet` is a street network conflation library, used to merge road graphs for mapping and routing. It is designed to work with both human mapped data and ML derived networks, aiming for clean and consistent merging, even with disparate input datasets. Use `mashnet` to detect missing edges in the road graph, and enhance existing edges with new metadata.

_Example of merging 3 road networks into a single, routable network:_

![](https://i.imgur.com/ihvsQZR.jpg)

## interface

- API
- CLI

## data

- data is internally stored in a key value structure that represents a graph
- key value structure is designed to be easy to serialize and deserialize, for both portability and storage

## model

Many types of geospatial data come in the form of geometry. Street networks are a special case of geospatial data that benefits from a graph data structure. This graph structure is an efficient representation that allows for links between features to be conveyed. For conflation, this is especially important, since adding streets to an existing network can cause changes to the network, such as splitting a street or inserting an intersection.

- edge
  - prefix: `e!`
  - id (unique)
  - list of vertex ids
- vertex
  - prefix: `v!`
  - id (unique)
  - x coordinate
  - y coordinate
- node
  - prefix: `n!`
  - id (matches unique vertex id)
  - list of connected edge ids
- data
  - prefix: `d!`
  - id (matches unique edge id)
  - json blob or (possibly) fixed schema protobuf
- pending
  - prefix: `p!`
  - id is a reserved edge id
  - like an edge, but unmerged (potentially due to failure)

## workflow

A conflation network can be created from scratch or with a bootstrapped graph from an existing network, such as OpenStreetMap or any other basemap that contains topological road links. After bootstrapping, new data is merged in iteratively, road by road. When adding a new street, we first look for an existing duplicate street. If one is found, the new street will be merged into the existing edge. If a match is not found, a new edge will be created and inserted into the graph.

## actions

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

## misc

- run as a library or a CLI
- load existing basemap from disk or in memory store, if available
- incrementally attempt to match and merge each new edge
- the same network should be generated regardless of order merged (ideally -- unclear if this is feasible)
- match threshold should be configurable using a metric scale for match probability
- once all merges have been performed, dump database to disk format or upload to s3 if in browser
- library will come with pre-computed match weights and normalization parameters for convenient deployment

## install

```sh
npm i mashnet
```

## test

```sh
npm t
```

## coverage

```sh
npm run coverage
```

## lint

Runs a linter across codebase and automatically formats all code using [prettier](https://prettier.io).

```sh
npm run lint
```

## train

A pre-trained neural network is included with `mashnet`. A new network can be trained with custom parameters or training data.

```sh
npm run train
```
