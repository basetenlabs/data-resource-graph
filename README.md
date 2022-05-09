# Data Resource Graph

An evaluator for complex data dependency graphs. Data Resource Graph provides the low-level primitives needed to create and execute complex data flows. It's not meant to be used directly as a state management framework but instead can undergird state management frameworks and complex applications.

## Key features

- **Generic data** - Each node calculates a pure, deterministic function and produces an arbitrary JS value
- **Async calculations** - Nodes may calculate values either synchronously or asynchronously. Transactions are as synchronous as possible and preempted only for async calculations.
- **Error handling** - Errors automatically propagate through the graph
- **Efficient re-computation** - Only recalculates what's changed in the graph, based on referential equality of outputs
- **Automatic cycle detection** - Any nodes in or downstream of a cycle are automatically put in an error state
- **Lazy evaluation** - Only evaluates the parts of the graph that are being observed
- **Batching** of graph mutations into transactions
- **Batching** of observers, allowing efficient updates based on node data
- **Hot swapping** - Ability to hot swap, or replace, a node's dependencies and calculation function
- **Runs anywhere**
- **Compact** - <10 kB minified

## Main concepts

Each `Graph` is a collection of one or more `DataNode`s. Each `DataNode` (or informally each _node_) has a list of nodes it depends on a **calculate function**. The calculate function takes the value of each dependency and returns a result from it. At least one node in the graph should have an empty list of dependencies, or else there would be a cycle. You can think of the graph like a spreadsheet, with cells (nodes) consisting of values and formulas which reference other cells.

**Observers** are functions that listen to particular nodes and get called whenever the node's value changes.

You can read more about [how the graph evaluates](./docs/Evaluation.md).

## Simple example

```ts
import { Graph } from 'data-resource-graph';

// Create a new graph
const graph = new Graph();

// All graph mutations must take place in an act() call
// Mutations include adding or deleting nodes, replacing nodes, or adding observers
graph.act(() => {
  const nodeA = graph.addNode('a', [], () => 1);
  const nodeB = graph.addNode('b', [], () => 4);
  const nodeC = graph.addNode('c', [nodeA, nodeB], (a, b) => a + b);

  nodeC.addObserver((val) => console.log(val));
});

// Console: { status: 'resolved', value: 5 }

graph.act(() => {
  // Update Node a's value to 2
  graph.getNode('a')?.replace('a', [], () => 2);
});

// After transaction, a, b, and c get updated, and c's observer gets notified of c's new value
// Console: { status: 'resolved', value: 6 }
```

## Contributing

```
npm i -g yarn
# Install
yarn
# Eslint
yarn lint
# Jest
yarn test
# TypeScript
yarn build
```

## Acknowledgements

This library is inspired by [MobX](https://mobx.js.org/) and the libraries that influenced it.
