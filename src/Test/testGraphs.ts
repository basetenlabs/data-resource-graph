import { graphBuilder } from './graphBuilder';

const testGraphs = {
  makeSmallSelfCycle: () =>
    graphBuilder<number>()
      .addNode('a', ['a'], { fn: (a) => a + 1 })
      .addNode('b', [], { fn: () => 1 }).graph,

  makeMediumAcylic: () =>
    graphBuilder()
      .addNode('a', [])
      .addNode('b', [])
      .addNode('c', ['a', 'b'])
      .addNode('d', ['b'])
      .addNode('e', ['a', 'd']).graph,

  makeMedium3NodeCycle: () =>
    graphBuilder()
      .addNode('a', ['b', 'd'], { fn: () => {} })
      .addNode('b', ['c'])
      .addNode('c', ['a'])
      .addNode('d', ['e'])
      .addNode('e', []).graph,

  makeMediumFigureEightCycle: () =>
    graphBuilder()
      .addNode('a', ['b', 'd'])
      .addNode('b', ['c'])
      .addNode('c', ['a'])
      .addNode('d', ['e'])
      .addNode('e', ['a']).graph,

  makeMediumDAG: () =>
    graphBuilder()
      .addNode('a', [])
      .addNode('c', [])
      .addNode('g', [])
      .addNode('b', ['a', 'c'])
      .addNode('d', ['c', 'g'])
      .addNode('e', ['b', 'd'])
      .addNode('f', ['b'], { isObserved: false }).graph,

  // 3x3 neural net
  make3By3NuralNet: () =>
    graphBuilder<number>()
      .addNode('a', [], { fn: () => -0.3 })
      .addNode('b', [], { fn: () => -0.2 })
      .addNode('c', [], { fn: () => 0.1 })
      .addNode('d', ['a', 'b'], { fn: (a, b) => -0.8 * a + -0.1 * b })
      .addNode('e', ['a', 'b', 'c'], {
        fn: (a, b, c) => -0.8 * a + 0.5 * b + 0.2 * c,
      })
      .addNode('f', ['b', 'c'], { fn: (b, c) => 0.3 * b + 0.1 * c })
      .addNode('g', ['d', 'e'], { fn: (d, e) => 0.1 * d + 0.9 * e })
      .addNode('h', ['d', 'e', 'f'], {
        fn: (d, e, f) => 0.3 * d + 0.2 * e + 0.1 * f,
      })
      .addNode('i', ['e', 'f'], { fn: (e, f) => 0 * e + 0.7 * f }).graph,
} as const;

export default testGraphs;
