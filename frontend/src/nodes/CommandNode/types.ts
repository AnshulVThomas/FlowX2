
import type { Node } from '@xyflow/react';

export type CommandNodeData = Node<{
    command?: string;
    prompt?: string;
    locked?: boolean;
    system_context?: any;
    ui_render?: {
        title: string;
        code_block: string;
        language: string;
        badge_color: string;
        description: string;
        system_effect: string;
    };
    history?: Array<HistoryItem>;

    // Tier 3 Execution Fields
    execution_status?: "generated" | "running" | "completed" | "failed" | "attention_required";
    thread_id?: string;
}>;

export type HistoryItem = {
    prompt: string;
    command: string;
    timestamp: number;
    type: 'generated' | 'executed';
    runType?: 'manual' | 'workflow'; // New field for differentiation
    status?: 'success' | 'failure' | 'pending';
};
