// src/App.tsx

import React, { useState } from 'react';
import { TotemPoleVisualizer } from './components/TotemPoleVisualizer';
import TotemProgrammingIDE from './components/TotemProgrammingIDE';
import type { TotemStatus } from './types/totem';
import './App.css';

export default function App() {
  const [programmingTotem, setProgrammingTotem] = useState<TotemStatus | null>(null);

  const handleProgramSuccess = (totemId: string) => {
    console.log('Programming successful for totem:', totemId);
    // In a real app, you might refresh totem status here
  };

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <TotemPoleVisualizer
        onTotemDoubleClick={(totem) => setProgrammingTotem(totem)}
      />

      {programmingTotem && (
        <TotemProgrammingIDE
          totem={programmingTotem}
          onClose={() => setProgrammingTotem(null)}
          onProgramSuccess={handleProgramSuccess}
        />
      )}
    </div>
  );
}