import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './components/flow/Canvas';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { useServerStatus } from './hooks/useServerStatus';
import { useWorkflowStore } from './store/useWorkflowStore';
import { fetchWorkflows } from './services/api';
import { useEffect } from 'react';
import { toast } from 'sonner';

function App() {
  const isConnected = useServerStatus();
  const { setWorkflows } = useWorkflowStore();

  useEffect(() => {
    if (isConnected) {
      fetchWorkflows()
        .then((workflows) => {
          if (workflows.length > 0) {
            setWorkflows(workflows);
            toast.success('Workflows synced with server');
          } else {
            toast.info('No workflows found. Create a new one to get started!');
          }
        })
        .catch(() => toast.error('Failed to sync workflows'));
    }
  }, [isConnected, setWorkflows]);

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-black/90">
        <Navbar />
        <div className="flex flex-grow h-full pt-16"> {/* Add padding top for navbar */}
          <Sidebar />
          <Canvas />
        </div>
      </div>
    </ReactFlowProvider>
  )
}

export default App
