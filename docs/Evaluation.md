# Evaluation

Evaluation is the process by which the graph and its nodes are updated. Evaluation happens via a transactions, and each transaction consists of two phases:

1. In the **mutation phase**, the callback passed into `graph.act()` can mutate the graph. A mutation is any change to the graph or a node which could result in a node's value changing. Some example of mutations are `graph.addNode()`, `node.replace()`, `node.invalidate()` and `node.delete()`. Mutations must take place synchronously inside the `graph.act()` callback.
2. Then, in the **processing phase**, the graph decides which nodes to re-evalute and when. Once a node is re-evaluated, if it has any observers, the observers are notified of the new value.

When you make mutations via `graph.act()`, the graph will automatically decide whether to run a synchronous or async evaluation based on the nodes that need to be evaluated. You can inspect the `TransactionResult` object returned from `graph.act()` to see which type of transaction took place.

## Synchronous evaluation

In synchronous evaluation, both the **mutation phase** and **processing phase** take place synchronously, meaning that by the time `act()` returns, the graph has been fully updated and all observers of updated nodes have been notified.

## Asynchronous evaluation

Asynchronous evaluation is a bit more complicated both because node change and notification happens in a separate execution block from `act()`, and because a node may not be done executing or may not ever run before the next transaction takes place.

The graph promises **eventual correctness**, meaning that after all pending computations are done, all observed node states have the correct values no matter what path, or sequence of transactions, the graph took to get to its state. All observers are also always notified eventually.

The processing phase takes place asynchronously for async evaluation. Synchronous nodes are still run synchronously if possible during an async evaluation, and async nodes may be run in parallel when they don't depend on each other.

If the processing phase of one transaction is still running (meaning some async node hasn't completed yet) when a new transaction begins, the first transaction is cancelled. No more nodes will be evaluated during the first transaction's processing phase. Any in-progress computation functions will continue to run, but their results will be discarded.

> Not yet implemented: In progress evaluations may be reused

> Not yet implemented: In progress evaluations may be committed so long as a new evaluation hasn't begun
