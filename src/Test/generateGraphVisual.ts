import * as fs from 'fs';
import Graph from '../Graph/Graph';
import TestGraphs from './testGraphs';

function generateMermaidVisual(graph: Graph): string {
  return (
    `flowchart LR\n` +
    Array.from(graph)
      .flatMap((nodeA) =>
        Array.from(nodeA.dependents).map((nodeB) => `  ${nodeA.id} --> ${nodeB.id}`),
      )
      .join('\n')
  );
}

if (require.main === module) {
  const graphVisuals = Object.entries(TestGraphs)
    .map(
      ([name, graphFactory]) =>
        `## ${name.replace(/^make/, '')}\n${'```'}mermaid\n${generateMermaidVisual(
          graphFactory(),
        )}\n${'```'}`,
    )
    .join('\n\n');
  fs.writeFileSync(
    './docs/TestGraphs.md',
    `# Test Graphs

Auto-generated from \`src/Test/testGraphs.ts\` by \`src/Test/generateGraphVisual.ts\`
Required Mermaid support in Markdown to render. For VS Code, use the 'shd101wyy.markdown-preview-enhanced' extension

${graphVisuals}
  `,
  );
}
