// Commit for 2025-07-02: App.tsx edit for historical commit
// updated file
import { ReactFlowProvider } from 'reactflow'
import FlowCanvas from './components/FlowCanvas'

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}
