/**
 * @public
 */
export declare type AsyncTransactionCompletion = {
    /**
     * Indicates whether the transaction was cancelled, meaning another transaction started while this transaction
     * was still evaluating.
     */
    wasCancelled: boolean;
};

/**
 * @public
 */
export declare type BatchFunction = (callback: () => void) => void;

/* Excluded from this release type: CalculateFunction */

/**
 * @public
 */
export declare type CircularDependencyNodeState = {
    status: NodeStatus.CicularDependencyError;
};

/**
 * A node in the data graph. Each DataNode has:
 * - An array of dependencies on other nodes
 * - A calculate function which takes in the values of its dependency nodes and returns its own value
 * @public
 */
export declare class DataNode<TResult = unknown> {
    readonly graph: Graph;
    readonly id: string;
    dependencies: DataNode[];
    private calculateFunction;
    /* Excluded from this release type: state */
    private lastEvaluation;
    private currentAsyncEvaluation;
    dependents: Set<DataNode<unknown>>;
    private observers;
    private pendingObservers;
    readonly [Symbol.toStringTag]: string;
    /* Excluded from this release type: __constructor */
    addObserver(observer: Observer<TResult>): void;
    removeObserver(observer: Observer<TResult>): void;
    hasObserver(): boolean;
    /* Excluded from this release type: hasPendingObservers */
    /* Excluded from this release type: notifyObservers */
    /**
     * Signal that the value has changed. The previously cached value won't be used except for detecting which dependent nodes to evaluate
     */
    invalidate(): void;
    /* Excluded from this release type: markPending */
    replace<TArgs extends unknown[]>(dependencies: DataNodesOf<TArgs>, fn: (...args: TArgs) => TResult): void;
    replaceWithAsync<TArgs extends unknown[]>(dependencies: DataNodesOf<TArgs>, fn: (...args: TArgs) => Promise<TResult>): void;
    private replaceInternal;
    private getEvaluationInfo;
    /**
     * @returns Whether to notify observers
     */
    private commitEvaluation;
    /* Excluded from this release type: evaluate */
    /**
     * @returns Whether to notify observers
     */
    evaluateAsync(): Promise<void>;
    delete(): void;
    isDeleted(): boolean;
    private assertNotDeleted;
    isAsync(): boolean;
    /* Excluded from this release type: setCircularDependencyError */
}

/**
 * Constructs a tuple of typed DataNodes from a tuple of result types
 * @public
 */
export declare type DataNodesOf<TArgs extends unknown[]> = {
    [Key in keyof TArgs]: DataNode<TArgs[Key]>;
};

/**
 * @public
 */
export declare type DeletedNodeState = {
    status: NodeStatus.Deleted;
};

/**
 * @public
 */
export declare type DependencyErrorNodeState = {
    status: NodeStatus.DependencyError;
    error: unknown;
    /**
     * Path of nodes from originating up to current node
     */
    path: DataNode[];
};

/**
 * @public
 */
export declare type ErrorNodeState = {
    status: NodeStatus.OwnError;
    error: unknown;
};

/**
 * The states of a node which may cause an observer to be notified
 * @public
 */
export declare type EvaluatedNodeState<TResult> = DeletedNodeState | MissingDependencyErrorNodeState | CircularDependencyNodeState | ResolvedNodeState<TResult> | ErrorNodeState | DependencyErrorNodeState;

/**
 * @public
 */
export declare class Graph implements Iterable<DataNode> {
    private readonly nodes;
    readonly options: GraphOptions;
    private currentMutation;
    /* Excluded from this release type: transactionId */
    constructor(options?: Partial<GraphOptions>);
    addNode<TArgs extends unknown[], TResult>(id: string, dependencies: DataNodesOf<TArgs>, fn: (...args: TArgs) => TResult): DataNode<TResult>;
    addAsyncNode<TArgs extends unknown[], TResult>(id: string, dependencies: DataNodesOf<TArgs>, fn: (...args: TArgs) => Promise<TResult>): DataNode<TResult>;
    private addNodeInternal;
    /**
     * Helper which either adds or replaces a node based on whether the node already exists
     */
    upsertNode<TArgs extends unknown[], TResult>(id: string, dependencies: DataNodesOf<TArgs>, fn: (...args: TArgs) => TResult): DataNode<TResult>;
    /**
     * Helper which either adds or replaces a node based on whether the node already exists for async calculate functions
     */
    upsertAsyncNode<TArgs extends unknown[], TResult>(id: string, dependencies: DataNodesOf<TArgs>, fn: (...args: TArgs) => Promise<TResult>): DataNode<TResult>;
    /* Excluded from this release type: deleteNodeInternal */
    getNode<TResult = unknown>(id: string): DataNode<TResult> | undefined;
    [Symbol.iterator](): IterableIterator<DataNode>;
    /* Excluded from this release type: markMutated */
    /**
     * Run mutations on the graph, resulting in graph re-evaluation
     *
     * @returns TransactionResult, only for outermost act() call. Also undefined if mutator didn't alter the graph.
     */
    act(mutator: () => void): TransactionResult | undefined;
}

/**
 * @public
 */
export declare interface GraphOptions {
    /**
     * Function with the ability to batch all observations that take place in the same transaction and execution stack. This can
     * improve the performance of any side effects that happen as a result of node changes.
     *
     * If you're rendering data in React, this should probably be React's `batch()` function.
     */
    observationBatcher: BatchFunction;
    /**
     * Called when there's an error during graph execution. Useful for logging
     */
    onError(error?: unknown): void;
}

/**
 * @public
 */
export declare type MissingDependencyErrorNodeState = {
    status: NodeStatus.MissingDependencyError;
    /**
     * Path from deleted node up to current node
     */
    path: DataNode[];
};

/* Excluded from this release type: NodeState */

/**
 * An enum describing the current evaluation state of the node
 * @public
 */
export declare enum NodeStatus {
    /**
     * Node hasn't been called or has been invalidated
     */
    Unevaluated = "uneval",
    /**
     * Node is awaiting evaluation. This is differs from `NodeStatus.Unevaluated` in that the last calculation
     * may be reused if it's still valid
     */
    Pending = "pending",
    /**
     * Calculate function is executing. Async nodes only
     */
    Running = "running",
    /**
     * Value is computed and current
     */
    Resolved = "resolved",
    /**
     * Calculate function threw or resolved error
     */
    OwnError = "ownError",
    /**
     * One of the node's dependencies (direct or indirect) threw an error
     */
    DependencyError = "depError",
    /**
     * Node is involved in a circular dependency
     */
    CicularDependencyError = "circularDepError",
    /**
     * Node is deleted
     */
    Deleted = "deleted",
    /**
     * One of the node's dependencies (direct or indirect) was deleted
     */
    MissingDependencyError = "missingDepError"
}

/**
 * An observer is a function which when registered on a node gets called every time the node is updated.
 * Observers are keyed by reference. A single observer may be registered on multiple nodes, but can only
 * be registered once per node.
 * @public
 */
export declare type Observer<TResult> = (state: EvaluatedNodeState<TResult>) => void;

/**
 * @public
 */
export declare type PendingNodeState = {
    status: NodeStatus.Pending;
};

/**
 * @public
 */
export declare type ResolvedNodeState<TResult> = {
    status: NodeStatus.Resolved;
    value: TResult;
};

/**
 * @public
 */
export declare type RunningNodeState = {
    status: NodeStatus.Running;
};

/**
 * Describes the execution that takes place after a transaction
 * @public
 */
export declare type TransactionResult = {
    sync: true;
} | {
    sync: false;
    /**
     * Promise fulfilled when the graph's evaluation finished
     */
    completion: Promise<AsyncTransactionCompletion>;
};

/**
 * @public
 */
export declare type UnevaluatedNodeState = {
    status: NodeStatus.Unevaluated;
};

export { }
