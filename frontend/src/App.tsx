import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './components/flow/Canvas';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { ProcessSidebar } from './components/layout/ProcessSidebar';
import { useServerStatus } from './hooks/useServerStatus';
import { useWorkflowStore } from './store/useWorkflowStore';
import { fetchWorkflows } from './services/api';
import { useEffect } from 'react';
import { toast } from 'sonner';

function App() {
  const isConnected = useServerStatus();
  const { setWorkflows, createWorkflow } = useWorkflowStore();

  useEffect(() => {
    if (isConnected) {
      fetchWorkflows()
        .then((workflows) => {
          if (workflows.length > 0) {
            setWorkflows(workflows);
            toast.success('Workflows synced with server');
          } else {
            // Auto-create default workflow
            createWorkflow('Workflow 1');
            toast.info('Created new default workflow');
          }
        })
        .catch(() => toast.error('Failed to sync workflows'));
    }
  }, [isConnected, setWorkflows, createWorkflow]);

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-black/90">
        <Navbar />
        <div className="flex flex-grow h-full pt-16 relative">
          <Sidebar />
          <Canvas />
          <ProcessSidebar />
        </div>
      </div>
    </ReactFlowProvider>
  )
}

export default App
