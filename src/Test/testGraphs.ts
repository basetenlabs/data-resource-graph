import { graphBuilder } from './graphBuilder';

const testGraphs = {
  makeSmallSelfCycle: () => graphBuilder().addNode('a', ['a']).addNode('b', []).graph,

  makeMediumAcylic: () =>
    graphBuilder()
      .addNode('a', [])
      .addNode('b', [])
      .addNode('c', ['a', 'b'])
      .addNode('d', ['b'])
      .addNode('e', ['a', 'd']).graph,

  makeMedium3NodeCycle: () =>
    graphBuilder()
      .addNode('a', ['b', 'd'])
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
      .addNode('f', ['b'], false).graph,
} as const;

export default testGraphs;
