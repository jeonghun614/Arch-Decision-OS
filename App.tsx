import React from 'react';
import { useProjectState } from './src/hooks/useProjectState';
import StartScreen from './src/components/StartScreen';
import DecisionView from './src/components/DecisionView';
import ResultPage from './src/components/ResultPage';

const App: React.FC = () => {
  const ctx = useProjectState();

  if (!ctx.isStarted) return <StartScreen ctx={ctx} />;
  if (ctx.state.completed || ctx.location.pathname === '/result') return <ResultPage ctx={ctx} />;
  return <DecisionView ctx={ctx} />;
};

export default App;
