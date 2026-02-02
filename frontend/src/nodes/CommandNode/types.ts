
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
    history?: Array<{
        prompt: string;
        command: string;
        timestamp: number;
        type: 'generated' | 'executed';
        status?: 'success' | 'failure' | 'pending';
    }>;
}>;
