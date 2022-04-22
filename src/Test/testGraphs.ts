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

  make3By3Net: () =>
    graphBuilder()
      .addNode('a', [])
      .addNode('b', [])
      .addNode('c', [])
      .addNode('d', ['a', 'b'])
      .addNode('e', ['a', 'b', 'c'])
      .addNode('f', ['b', 'c'])
      .addNode('g', ['d', 'e'])
      .addNode('h', ['d', 'e', 'f'])
      .addNode('i', ['e', 'f']).graph,
} as const;

export default testGraphs;
