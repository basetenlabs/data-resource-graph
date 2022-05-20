import { graphBuilder } from './graphBuilder';

const testGraphs = {
  makeSmallSelfCycle: () =>
    graphBuilder(0).act((builder) =>
      builder.addNode('a', ['a'], (a) => a + 1).addNode('b', [], () => 1),
    ).graph,

  makeSmallAcyclic: () =>
    graphBuilder().act((builder) =>
      builder.addNode('a', []).addNode('b', ['a']).addNode('c', ['a']),
    ).graph,

  makeSmallChain: () =>
    graphBuilder(0).act((builder) =>
      builder
        .addNode('a', [], () => 1)
        .addNode('b', ['a'], (a) => 2 * a + 3)
        .addNode('c', ['b'], (b) => 4 * b - 5),
    ).graph,

  makeSmallChevron: () =>
    graphBuilder(0).act((builder) =>
      builder
        .addNode('a', [], () => 1)
        .addNode('b', [], () => 2)
        .addNode('c', ['a', 'b'], (a, b) => a + b),
    ).graph,

  makeMediumAcylic: () =>
    graphBuilder(0).act((builder) =>
      builder
        .addNode('a', [], () => -0.4)
        .addNode('b', [], () => -0.5)
        .addNode('c', ['a', 'b'], (a, b) => 0.9 * a + -0.4 * b)
        .addNode('d', ['b'], (b) => 0.2 * b)
        .addNode('e', ['a', 'd'], (a, d) => 0.2 * a + -0.9 * d),
    ).graph,

  makeMedium3NodeCycle: () =>
    graphBuilder(0).act((builder) =>
      builder
        .addNode('a', ['b', 'd'], (b, d) => 2 * b + 3 * d)
        .addNode('b', ['c'], (c) => c - 2)
        .addNode('c', ['a'], (a) => a + 1)
        .addNode('d', ['e'], (e) => e * 5)
        .addNode('e', [], () => 1),
    ).graph,

  makeMediumFigureEightCycle: () =>
    graphBuilder().act((builder) =>
      builder
        .addNode('a', ['b', 'd'])
        .addNode('b', ['c'])
        .addNode('c', ['a'])
        .addNode('d', ['e'])
        .addNode('e', ['a']),
    ).graph,

  makeSmallCycleWithDownstreams: () =>
    graphBuilder(0).act((builder) =>
      builder
        .addNode('a', ['b'], (b) => b + 1)
        .addNode('b', ['a'], (a) => a + 1)
        .addNode('c', ['a'], (a) => a + 2)
        .addNode('d', ['c'], (c) => c + 3)
        .addNode('e', ['b'], (b) => b + 4),
    ).graph,

  makeMediumDAG: () =>
    graphBuilder().act((builder) =>
      builder
        .addNode('a', [])
        .addNode('c', [])
        .addNode('g', [])
        .addNode('b', ['a', 'c'])
        .addNode('d', ['c', 'g'])
        .addNode('e', ['b', 'd'])
        .addNode('f', ['b'], undefined),
    ).graph,

  make3By3NuralNet: () =>
    graphBuilder<number>(0).act((builder) =>
      builder
        .addNode('a', [], () => -0.3)
        .addNode('b', [], () => -0.2)
        .addNode('c', [], () => 0.1)
        .addNode('d', ['a', 'b'], (a, b) => -0.8 * a + -0.1 * b)
        .addNode('e', ['a', 'b', 'c'], (a, b, c) => -0.8 * a + 0.5 * b + 0.2 * c)
        .addNode('f', ['b', 'c'], (b, c) => 0.3 * b + 0.1 * c)
        .addNode('g', ['d', 'e'], (d, e) => 0.1 * d + 0.9 * e)
        .addNode('h', ['d', 'e', 'f'], (d, e, f) => 0.3 * d + 0.2 * e + 0.1 * f)
        .addNode('i', ['e', 'f'], (e, f) => 0 * e + 0.7 * f),
    ).graph,

  make7NodeBinaryTree: () =>
    graphBuilder<number>(0).act((builder) =>
      builder
        .addNode('d', [])
        .addNode('b', ['d'])
        .addNode('a', ['b'])
        .addNode('c', ['b'])
        .addNode('f', ['d'])
        .addNode('e', ['f'])
        .addNode('g', ['f']),
    ).graph,
} as const;

export default testGraphs;
