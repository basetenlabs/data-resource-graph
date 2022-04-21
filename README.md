# Data Resource Graph

Project structure based on https://github.com/metachris/typescript-boilerplate.git

## Key features

- Generic async and sync nodes
  - Nodes declare their dependencies and are assumed to be pure, deterministic functions
  - Nodes produce a JS value as output
- Error handling, causes dependent tasks to error out
- Efficient re-computation
  - Short-circuiting on equality of inputs and output
  - Option to use referential equality to short-cirucit output as well
- Cycle detection
- Cancellation of async tasks
- Lazy evaluation
- Batching of recomputation as well as side-effects of a recomputation
- Hot swapping of node dependencies
- Nodes identified by unique string ID (eases debugging)

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
