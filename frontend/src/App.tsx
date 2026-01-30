import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './components/flow/Canvas';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';

function App() {
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
