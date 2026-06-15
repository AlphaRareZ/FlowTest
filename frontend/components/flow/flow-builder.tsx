"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { TopBar } from "./top-bar";
import { ComponentSidebar } from "./component-sidebar";
import { FlowCanvas } from "./flow-canvas";
import { PropertiesPanel } from "./properties-panel";
import { SimulationPanel } from "./simulation-panel";
import { ResultsPanel } from "./results-panel";
import { ValidationPanel } from "./validation-panel";

export function FlowBuilder() {
  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-background">
        <TopBar />
        <div className="flex-1 flex overflow-hidden">
          <ComponentSidebar />
          <main className="flex-1 relative">
            <FlowCanvas />
            <ValidationPanel />
          </main>
          <PropertiesPanel />
        </div>
        <SimulationPanel />
        <ResultsPanel />
      </div>
    </ReactFlowProvider>
  );
}
