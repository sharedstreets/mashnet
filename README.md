mashnet
---

![](https://i.imgur.com/mlE7O8x.jpg)

- [interface](https://gist.github.com/morganherlocker/7a42df347d338ce2488dcb250f6dd71f#interface)
- [data](https://gist.github.com/morganherlocker/7a42df347d338ce2488dcb250f6dd71f#data)
- [model](https://gist.github.com/morganherlocker/7a42df347d338ce2488dcb250f6dd71f#model)
- [actions](https://gist.github.com/morganherlocker/7a42df347d338ce2488dcb250f6dd71f#actions)
- [workflow](https://gist.github.com/morganherlocker/7a42df347d338ce2488dcb250f6dd71f#workflow)

## interface

- API
- CLI

## data

- data is internally stored in a key value structure that represents a graph
- key value structure is designed to be easy to serialize and deserialize, for both portability and storage

## model

- edge
  - prefix: `e!`
  - id (unique)
  - a node
  - b node
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

## workflow

- run as a library or a CLI
- load existing basemap from disk or in memory store, if available
- incrementally attempt to match and merge each new edge
- the same network should be generated regardless of order merged (ideally -- unclear if this is feasible)
- match threshold should be configurable using a metric scale for match probability
- once all merges have been performed, dump database to disk format or upload to s3 if in browser
- library will come with pre-computed match weights and normalization parameters for convenient deployment
