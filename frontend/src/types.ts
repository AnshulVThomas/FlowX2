import type { Node, Edge } from '@xyflow/react';

export interface Workflow {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    detailsLoaded?: boolean;
    isDirty?: boolean;
}

export interface WorkflowSummary {
    id: string;
    name: string;
}
