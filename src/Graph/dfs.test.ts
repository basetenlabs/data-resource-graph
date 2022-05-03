import assert from 'assert';
import overArgs from 'lodash/overArgs';
import DataNode from '../DataNode/DataNode';
import testGraphs from '../Test/testGraphs';
import { mapNodesToIds } from '../Test/testUtils';
import dfs from './dfs';

let visitorSpy: jest.Mock<unknown, [node: string, stack: string[]]>;
let wrappedVisitor: (node: DataNode, stack: DataNode[]) => void;

/**
 * Takes in the expected paths visited, each starting with a starting node and ending with the visited node
 * @param expectedPaths
 */
function expectTraversal(expectedPaths: string[][]) {
  expect(visitorSpy.mock.calls.map(([currNode, path]) => [...path.slice(), currNode])).toEqual(
    expectedPaths,
  );
}

beforeEach(() => {
  visitorSpy = jest.fn();
  wrappedVisitor = overArgs(visitorSpy, [mapNodesToIds, mapNodesToIds]);
});

describe('forward-traversal', () => {
  test('medium DAG, single starting node', () => {
    const graph = testGraphs.makeMediumDAG();
    const nodeC = graph.getNode('c');
    assert(nodeC);
    dfs([nodeC], wrappedVisitor, 'forward');
    expectTraversal([['c'], ['c', 'b'], ['c', 'b', 'e'], ['c', 'b', 'f'], ['c', 'd']]);
  });

  test('medium DAG, multiple starting nodes', () => {
    const graph = testGraphs.makeMediumDAG();
    const nodeB = graph.getNode('b');
    const nodeC = graph.getNode('c');
    assert(nodeB);
    assert(nodeC);
    dfs([nodeB, nodeC], wrappedVisitor, 'forward');
    expectTraversal([['b'], ['b', 'e'], ['b', 'f'], ['c'], ['c', 'd']]);
  });

  test('medium DAG skips deleted nodes', () => {
    const graph = testGraphs.makeMediumDAG();
    graph.act(() => graph.deleteNode('b'));
    const nodeC = graph.getNode('c');
    assert(nodeC);
    dfs([nodeC], wrappedVisitor, 'forward');
    expectTraversal([['c'], ['c', 'd'], ['c', 'd', 'e']]);
  });
});

describe('backward-traversal', () => {
  test('medium DAG, single starting node', () => {
    const graph = testGraphs.makeMediumDAG();
    const nodeE = graph.getNode('e');
    assert(nodeE);
    dfs([nodeE], wrappedVisitor, 'backward');
    expectTraversal([
      ['e'],
      ['e', 'b'],
      ['e', 'b', 'a'],
      ['e', 'b', 'c'],
      ['e', 'd'],
      ['e', 'd', 'g'],
    ]);
  });
});

describe('conditional forward-traversal', () => {
  test('7 node binary tree, stop at certain nodes', () => {
    const graph = testGraphs.make7NodeBinaryTree();
    const nodeD = graph.getNode('d');
    assert(nodeD);
    visitorSpy.mockImplementation((node) => node !== 'f');
    dfs([nodeD], wrappedVisitor, 'forward');
    expectTraversal([['d'], ['d', 'b'], ['d', 'b', 'a'], ['d', 'b', 'c'], ['d', 'f']]);
  });
});
