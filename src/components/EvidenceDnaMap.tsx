import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { formatTimestamp, SEVERITY_META } from '../lib/formatters';
import type { InvestigationReport } from '../types/forensics';

interface SelectedNodeInfo {
  title: string;
  subtitle: string;
  details: string[];
  findingId?: string;
}

export function EvidenceDnaMap({
  report,
  onJumpToFinding,
}: {
  report: InvestigationReport;
  onJumpToFinding?: (findingId: string) => void;
}) {
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);

  const { nodes, edges, nodePayloads } = useMemo(() => {
    const builtNodes: Node[] = [];
    const builtEdges: Edge[] = [];
    const payloads = new Map<string, SelectedNodeInfo>();

    // Column 1: Source Files
    report.sources.forEach((src, i) => {
      const id = `node-src-${src.source_id}`;
      builtNodes.push({
        id,
        position: { x: 20, y: 40 + i * 140 },
        data: { label: `${src.source_id}\n${src.originalName.slice(0, 24)}` },
        style: {
          background: '#FFFFFF',
          color: '#0F172A',
          border: '1px solid #2563EB',
          borderRadius: '6px',
          fontSize: '12px',
          width: 190,
          padding: '10px',
          fontFamily: 'JetBrains Mono, monospace',
        },
      });
      payloads.set(id, {
        title: src.originalName,
        subtitle: `Source ${src.source_id} · ${src.kind.toUpperCase()}`,
        details: [
          `SHA-256: ${src.sha256.slice(0, 24)}...`,
          `Format: ${src.metadata.formatName}`,
          `Duration: ${src.metadata.durationSec ?? 'N/A'}s`,
          ...src.metadata.anomalies,
        ],
      });
    });

    // Column 2: Modalities
    const modalities = Array.from(new Set(report.findings.map((f) => f.modality)));
    modalities.forEach((mod, i) => {
      const id = `node-mod-${mod}`;
      builtNodes.push({
        id,
        position: { x: 290, y: 40 + i * 120 },
        data: { label: `${mod.toUpperCase()} AGENT` },
        style: {
          background: '#F1F5F9',
          color: '#1E293B',
          border: '1px solid #64748B',
          borderRadius: '6px',
          fontSize: '12px',
          width: 155,
          padding: '10px',
          fontWeight: 600,
        },
      });
      payloads.set(id, {
        title: `${mod.toUpperCase()} Forensic Module`,
        subtitle: 'Independent Analysis Agent',
        details: [
          `Findings produced: ${report.findings.filter((f) => f.modality === mod).length}`,
        ],
      });
    });

    // Column 3: Grounded Findings
    report.findings.forEach((f, i) => {
      const id = `node-fnd-${f.finding_id}`;
      const sev = SEVERITY_META[f.severity];
      builtNodes.push({
        id,
        position: { x: 520, y: 25 + i * 115 },
        data: {
          label: `${f.finding_id}${f.timestamp !== null ? ` @ ${formatTimestamp(f.timestamp)}` : ''}\n${f.indicator_title.slice(0, 34)}`,
        },
        style: {
          background: '#FFFFFF',
          color: '#0F172A',
          border: `1.5px solid ${sev.dotColor}`,
          borderRadius: '6px',
          fontSize: '11.5px',
          width: 235,
          padding: '10px',
        },
      });

      payloads.set(id, {
        title: `${f.finding_id}: ${f.indicator_title}`,
        subtitle: `${f.modality.toUpperCase()} · ${sev.label} · ${Math.round(f.evidence_confidence * 100)}% conf`,
        details: [f.observed_signal, f.forensic_explanation, `Benign cause: ${f.counter_evidence.benign_explanations[0] || 'N/A'}`],
        findingId: f.finding_id,
      });

      const srcModEdgeId = `e-${f.source_id}-${f.modality}`;
      if (!builtEdges.some((e) => e.id === srcModEdgeId)) {
        builtEdges.push({
          id: srcModEdgeId,
          source: `node-src-${f.source_id}`,
          target: `node-mod-${f.modality}`,
          style: { stroke: '#94A3B8' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
        });
      }

      builtEdges.push({
        id: `e-mod-${f.modality}-${f.finding_id}`,
        source: `node-mod-${f.modality}`,
        target: id,
        style: { stroke: sev.dotColor },
        markerEnd: { type: MarkerType.ArrowClosed, color: sev.dotColor },
      });
    });

    // Column 4: Cross-Modal Overlapping Windows
    report.cross_modal.overlapping_windows.forEach((win, i) => {
      const id = `node-xwin-${i}`;
      builtNodes.push({
        id,
        position: { x: 830, y: 60 + i * 140 },
        data: { label: `Cross-Modal Overlap\n@ ${formatTimestamp(win.timestampSec)}` },
        style: {
          background: '#EFF6FF',
          color: '#1E3A8A',
          border: '1px solid #2563EB',
          borderRadius: '6px',
          fontSize: '12px',
          width: 195,
          padding: '10px',
        },
      });

      payloads.set(id, {
        title: `Overlapping Window @ ${formatTimestamp(win.timestampSec)}`,
        subtitle: `Modalities: ${win.modalities.join(', ')}`,
        details: [win.summary, `Linked findings: ${win.cited_finding_ids.join(', ')}`],
      });

      win.cited_finding_ids.forEach((fid) => {
        builtEdges.push({
          id: `e-${fid}-${id}`,
          source: `node-fnd-${fid}`,
          target: id,
          animated: true,
          style: { stroke: '#2563EB' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#2563EB' },
        });
      });
    });

    return { nodes: builtNodes, edges: builtEdges, nodePayloads: payloads };
  }, [report]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-display font-semibold text-slate-900">Evidence DNA Map</h3>
          <p className="text-xs text-slate-500">
            Interactive provenance graph linking uploaded sources, forensic agents, grounded findings, and cross-modal overlaps. Click any node to inspect.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 h-[420px] border border-slate-200 rounded-xl overflow-hidden bg-[#F8FAFC]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => {
              const info = nodePayloads.get(node.id);
              if (info) setSelectedNode(info);
            }}
          >
            <Background color="#CBD5E1" gap={20} />
            <Controls />
            <MiniMap nodeColor="#2563EB" maskColor="rgba(241, 245, 249, 0.75)" />
          </ReactFlow>
        </div>

        <aside className="forensic-bezel rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500">
            Node Evidence Inspector
          </p>
          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-display font-semibold text-slate-900">{selectedNode.title}</h4>
                <p className="text-xs text-blue-700 mt-0.5">{selectedNode.subtitle}</p>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                {selectedNode.details.map((d, i) => (
                  <li key={i} className="border-t border-slate-200 pt-2">
                    {d}
                  </li>
                ))}
              </ul>
              {selectedNode.findingId && onJumpToFinding && (
                <button
                  type="button"
                  onClick={() => onJumpToFinding(selectedNode.findingId!)}
                  className="w-full py-2 px-3 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors"
                >
                  Open {selectedNode.findingId} Full Review
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              Select any node on the Evidence DNA graph to inspect SHA-256 source digests, timestamp bounds, and cross-modal citations.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
