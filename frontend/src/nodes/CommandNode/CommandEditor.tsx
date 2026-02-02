
import { memo, useState, useEffect } from 'react';

// --- OPTIMIZATION 2: Isolated Command Editor to prevent full node re-renders on typing ---
export const CommandEditor = memo(({
    initialValue,
    onUpdate
}: {
    initialValue: string,
    onUpdate: (val: string) => void
}) => {
    const [value, setValue] = useState(initialValue);

    // Sync if external props change significantly
    useEffect(() => setValue(initialValue), [initialValue]);

    return (
        <textarea
            className="nodrag w-full h-full bg-[#1e1e1e] text-gray-300 font-mono text-[11px] leading-relaxed p-4 pt-4 border-none focus:ring-0 resize-none outline-none scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent flex-grow"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => onUpdate(value)}
            placeholder="# Generated command..."
            spellCheck={false}
        />
    );
});
