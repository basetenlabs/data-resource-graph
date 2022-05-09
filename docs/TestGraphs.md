# Test Graphs

Auto-generated from `src/Test/testGraphs.ts` by `src/Test/generateGraphVisual.ts`
Required Mermaid support in Markdown to render. For VS Code, use the 'shd101wyy.markdown-preview-enhanced' extension

## Key

```mermaid
flowchart LR
  a[hasObserver]
  b(unobserved)
```

## SmallSelfCycle
```mermaid
flowchart LR
  a(a)
  a --> a
  b(b)
```

## SmallAcyclic
```mermaid
flowchart LR
  a(a)
  a --> b
  a --> c
  b(b)
  c(c)
```

## SmallChain
```mermaid
flowchart LR
  a(a)
  a --> b
  b(b)
  b --> c
  c(c)
```

## SmallChevron
```mermaid
flowchart LR
  a(a)
  a --> c
  b(b)
  b --> c
  c(c)
```

## MediumAcylic
```mermaid
flowchart LR
  a(a)
  a --> c
  a --> e
  b(b)
  b --> c
  b --> d
  c(c)
  d(d)
  d --> e
  e(e)
```

## Medium3NodeCycle
```mermaid
flowchart LR
  b(b)
  b --> a
  d(d)
  d --> a
  a(a)
  a --> c
  c(c)
  c --> b
  e(e)
  e --> d
```

## MediumFigureEightCycle
```mermaid
flowchart LR
  b(b)
  b --> a
  d(d)
  d --> a
  a(a)
  a --> c
  a --> e
  c(c)
  c --> b
  e(e)
  e --> d
```

## MediumDAG
```mermaid
flowchart LR
  a(a)
  a --> b
  c(c)
  c --> b
  c --> d
  g(g)
  g --> d
  b(b)
  b --> e
  b --> f
  d(d)
  d --> e
  e(e)
  f(f)
```

## 3By3NuralNet
```mermaid
flowchart LR
  a(a)
  a --> d
  a --> e
  b(b)
  b --> d
  b --> e
  b --> f
  c(c)
  c --> e
  c --> f
  d(d)
  d --> g
  d --> h
  e(e)
  e --> g
  e --> h
  e --> i
  f(f)
  f --> h
  f --> i
  g(g)
  h(h)
  i(i)
```

## 7NodeBinaryTree
```mermaid
flowchart LR
  d(d)
  d --> b
  d --> f
  b(b)
  b --> a
  b --> c
  a(a)
  c(c)
  f(f)
  f --> e
  f --> g
  e(e)
  g(g)
```
  