import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Activity, Shield, MessageSquare, AlertTriangle,
  Lock, Unlock, ChevronRight, Send, Search, Terminal,
  Network, Bot, Cpu, MemoryStick, Settings, Power, Loader2, Play, Square, X,
  Database, Zap, ShieldAlert
} from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import NetworkGraph from './components/NetworkGraph'; // Import component

const isAnomalous = (flow) => {
  return (flow.flag_anomalies && flow.flag_anomalies.length > 0) ||
    flow.ttl_anomaly ||
    flow.sequence_anomaly ||
    flow.small_packet_anomaly;
};

// --- Components ---

const BentoCard = React.memo(({ children, className = "", bodyClassName = "", title, icon, actions }) => (
  <div className={`bg-gray-900/40 backdrop-blur-xl border-r border-b border-white/10 flex flex-col hover:bg-white/[0.02] transition-colors duration-300 group ${className}`}>
    {(title || actions) && (
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5 flex-shrink-0">
        {title && (
          <h3 className="font-bold text-lg flex items-center gap-3 text-slate-100 group-hover:text-primary transition-colors tracking-tight">
            {icon} {title}
          </h3>
        )}
        {actions}
      </div>
    )}
    <div className={`flex-grow relative overflow-hidden ${bodyClassName}`}>{children}</div>
  </div>
));

const StatCard = React.memo(({ label, value, icon, color = "text-primary", subtext }) => (
  <div className="bg-gray-900/40 backdrop-blur-md border-l border-white/10 p-4 flex items-center gap-4 hover:bg-white/5 transition-colors group h-full">
    <div className={`p-2 bg-white/5 ${color} group-hover:scale-105 transition-transform duration-300`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-secondary text-[10px] uppercase tracking-wider font-semibold truncate">{label}</p>
      <p className="text-xl font-bold font-mono text-slate-100 truncate">{value}</p>
      {subtext && <p className="text-[10px] text-secondary mt-0.5 truncate">{subtext}</p>}
    </div>
  </div>
));

const ChartContainer = React.memo(({ title, children, className }) => (
  <BentoCard title={title} className={className} bodyClassName="flex flex-col h-full">
    <div className="w-full flex-1 p-4 min-h-0">
      {children}
    </div>
  </BentoCard>
));

const SecurityTable = React.memo(({ flows, formatTime, selectedRows = [], onRowSelect }) => (
  <BentoCard title="Real-time Security Table" icon={<Terminal className="w-5 h-5 text-indigo-400" />} className="flex-1 overflow-hidden h-full">
    <div className="overflow-x-auto h-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent will-change-transform translate-z-0 overflow-y-auto">
      <table className="w-full text-left border-collapse table-fixed">
        <thead className="text-xs uppercase text-secondary bg-[#0B0F19] sticky top-0 backdrop-blur-sm z-20">
          <tr>
            <th className="px-6 py-4 font-bold tracking-wider w-[120px]">Time</th>
            <th className="px-6 py-4 font-bold tracking-wider w-1/3">Flow (Source → Dest)</th>
            <th className="px-6 py-4 font-bold tracking-wider w-[100px]">Type</th>
            <th className="px-6 py-4 font-bold tracking-wider w-[100px]">Status</th>
            <th className="px-6 py-4 font-bold tracking-wider w-[80px]">Pkts</th>
            <th className="px-6 py-4 font-bold tracking-wider">Latest Info</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-sm">
          {flows.map((flow, i) => {
            const isSelected = selectedRows.some(r => r.flow === flow.flow);
            return (
              <tr
                key={flow.flow || i}
                onClick={() => onRowSelect(flow)}
                className={`transition-colors cursor-pointer group h-14 ${isSelected ? 'bg-indigo-500/20 border-l-2 border-indigo-500' : 'hover:bg-white/5'}`}
              >
                <td className="px-6 py-3 font-mono text-xs text-secondary group-hover:text-slate-300">
                  {formatTime(flow.last_packet_time)}
                </td>
                <td className="px-6 py-3 font-mono text-indigo-200 truncate">{flow.flow}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wide ${flow.encryption === 'Encrypted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                    {flow.encryption}
                  </span>
                </td>
                <td className="px-6 py-3">
                  {isAnomalous(flow) ? (
                    <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20 w-fit">
                      <AlertTriangle className="w-3 h-3 animate-pulse" />
                      <span className="text-[10px] font-bold">ANOMALY</span>
                    </div>
                  ) : (
                    <Shield className="w-4 h-4 text-emerald-500/50" />
                  )}
                </td>
                <td className="px-6 py-3 font-mono">{flow.packet_count}</td>
                <td className="px-6 py-3 text-xs text-secondary truncate max-w-[200px]">
                  {flow.last_packet_info}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </BentoCard>
));

const App = () => {
  const [flows, setFlows] = useState([]);
  const [stats, setStats] = useState({
    totalPackets: 0,
    anomalies: 0,
    encryptedRatio: 0
  });
  const [systemStats, setSystemStats] = useState({ cpu: 0, ram: 0 }); // System Stats state
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Hello! I am your Network Security Assistant. How can I help you analyze the traffic today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  const [chartHistory, setChartHistory] = useState(new Array(30).fill({ packet_count: 0 }));
  const [graphData, setGraphData] = useState({ nodes: [], links: [] }); // Graph state
  const [portAlerts, setPortAlerts] = useState([]); // Port Activity state
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'graph'
  const messageQueue = useRef([]);
  const lastGraphUpdate = useRef(0); // Throttle graph updates

  // New state variables for Setup and Settings
  const [setupStep, setSetupStep] = useState(1);
  const [monitoringMethod, setMonitoringMethod] = useState(1);
  const [devices, setDevices] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const isMonitoringRef = useRef(isMonitoring);
  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);
  const [selectedModel, setSelectedModel] = useState("arcee-ai/trinity-large-preview:free");
  const [showSettings, setShowSettings] = useState(false);
  const [whitelist, setWhitelist] = useState({ ips: [], ports: [], anomaly_threshold: 0 });
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isSpoofingLoading, setIsSpoofingLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);

  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const res = await axios.get('http://localhost:8000/api/network/devices/');
      setDevices(res.data);
    } catch (e) { console.error(e); }
    setIsLoadingDevices(false);
  };

  const startSpoofing = async (targets) => {
    setIsSpoofingLoading(true);
    try {
      await axios.post('http://localhost:8000/api/network/spoof/start/', { targets: targets.map(t => t.ip) });
      setIsMonitoring(true);
    } catch (e) { console.error(e); }
    setIsSpoofingLoading(false);
    setSetupStep(0);
  };

  const stopSpoofing = async () => {
    try {
      await axios.post('http://localhost:8000/api/network/spoof/stop/');
      setIsMonitoring(false);
    } catch (e) { console.error(e); }
  };

  const fetchWhitelist = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/settings/whitelist/');
      setWhitelist(res.data);
    } catch (e) { console.error(e); }
  };

  const saveWhitelist = async (newWhitelist) => {
    try {
      await axios.post('http://localhost:8000/api/settings/whitelist/', newWhitelist);
      setWhitelist(newWhitelist);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchWhitelist();
  }, []);

  useEffect(() => {
    // WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:8000/ws/packets/`);

    ws.onmessage = (event) => {
      if (!isMonitoringRef.current) return;

      const data = JSON.parse(event.data);
      messageQueue.current.push(data);
    };

    // UI Update Loop (Throttled to 2 seconds)
    const updateInterval = setInterval(() => {
      if (messageQueue.current.length === 0) {
        setChartHistory(prev => [...prev, { packet_count: 0, time: formatTime(Date.now() / 1000) }].slice(-30));
        return;
      }

      const latestBatch = [...messageQueue.current];
      messageQueue.current = [];

      // Process latest data point for chart
      const representativeData = latestBatch[latestBatch.length - 1];
      setChartHistory((prev) => [...prev, {
        packet_count: representativeData.packet_count,
        time: formatTime(representativeData.last_packet_time)
      }].slice(-30));

      // Separate Updates
      const flowUpdates = latestBatch.filter(d => d.type !== 'graph_edge' && d.type !== 'port_alert' && d.type !== 'system_stats');
      const graphUpdates = latestBatch.filter(d => d.type === 'graph_edge');
      const alertUpdates = latestBatch.filter(d => d.type === 'port_alert');
      const sysUpdates = latestBatch.filter(d => d.type === 'system_stats');

      // Update System Stats
      if (sysUpdates.length > 0) {
        const latest = sysUpdates[sysUpdates.length - 1]; // Take most recent
        setSystemStats({
          cpu: latest.cpu,
          ram: latest.ram
        });
      }

      // Update Flows
      if (flowUpdates.length > 0) {
        setFlows((prev) => {
          let newFlows = [...prev];
          flowUpdates.forEach(data => {
            const existingIdx = newFlows.findIndex(f => f.flow === data.flow);
            if (existingIdx > -1) {
              newFlows[existingIdx] = data;
            } else {
              newFlows = [data, ...newFlows];
            }
          });
          newFlows.sort((a, b) => parseFloat(b.last_packet_time) - parseFloat(a.last_packet_time));
          newFlows = newFlows.slice(0, 50);

          // Update Stats
          const totalPackets = newFlows.reduce((acc, f) => acc + (f.packet_count || 0), 0);
          const anomalies = newFlows.filter(f =>
            (f.flag_anomalies && f.flag_anomalies.length > 0) || f.ttl_anomaly || f.sequence_anomaly || f.small_packet_anomaly
          ).length;
          const encrypted = newFlows.filter(f => f.encryption === 'Encrypted').length;

          setStats({
            totalPackets,
            anomalies,
            encryptedRatio: (encrypted / newFlows.length) * 100 || 0
          });
          return newFlows;
        });

        // 1.1 Chart History (using the latest flow update as representative)
        const latestFlow = flowUpdates[flowUpdates.length - 1];
        setChartHistory(prev => {
          const newData = {
            packet_count: latestFlow.packet_count || 0,
            time: formatTime(latestFlow.last_packet_time),
            bytes: latestFlow.bytes || 0, // Assuming 'bytes' field exists in flow data
            anomaly: latestFlow.anomaly_score || 0 // Assuming 'anomaly_score' field exists
          };
          return [...prev, newData].slice(-30); // Keep last 30 for chart
        });

        // Latest Info (Chat Context for anomalies)
        if (latestFlow.anomaly_score > 0.5) { // Threshold for anomaly alert
          setChatMessages(prev => [...prev, { // Changed setMessages to setChatMessages
            role: 'assistant',
            text: `🚨 Anomaly Detected! Score: ${latestFlow.anomaly_score.toFixed(2)} | src: ${latestFlow.src_ip}`,
          }]);
        }
      } else {
        // If no flow updates, still update chart history with zero packets
        setChartHistory(prev => [...prev, { packet_count: 0, time: formatTime(Date.now() / 1000) }].slice(-30));
      }


      // 2. Port Alerts
      if (alertUpdates.length > 0) {
        setPortAlerts(prev => {
          // Aggregate by port
          const portMap = new Map(prev.map(p => [p.port, p]));

          alertUpdates.forEach(update => {
            portMap.set(update.port, update);
          });

          // Convert back to array
          const aggregated = Array.from(portMap.values());

          // Optional: Sort by most active ports
          // aggregated.sort((a, b) => b.packets - a.packets);

          // Keep top 20 unique ports to avoid overcrowding
          return aggregated.slice(-20);
        });
      }

      // 3. Graph Updates (Throttled to 5s)
      if (graphUpdates.length > 0 && Date.now() - lastGraphUpdate.current > 5000) {
        lastGraphUpdate.current = Date.now();
        console.log(`[GraphDebug] Processing ${graphUpdates.length} graph edges from batch of ${latestBatch.length}`); // ADDED: Log how many graphUpdates found
        setGraphData(prev => {
          const now = Date.now();

          // Handle possibility that prev.nodes/links might be empty or undefined
          const currentNodes = prev.nodes || [];
          const currentLinks = prev.links || [];

          const nodes = new Map(currentNodes.map(n => [n.id, n]));
          const links = new Map(currentLinks.map(l => [l.id, l]));

          const isPrivateIP = (nodeId) => {
            if (!nodeId) return false;

            // Strip port for IPv4 (simple heuristic: has dot and colon)
            let ip = nodeId;
            if (nodeId.includes('.') && nodeId.includes(':')) {
              ip = nodeId.split(':')[0];
            }
            // Handle localhost/ipv6 explicitly
            if (ip === "::1" || ip === "localhost" || ip === "127.0.0.1") return true;
            // Handle ::1 with port (naive check)
            if (nodeId.startsWith("::1")) return true;

            const parts = ip.split('.');
            if (parts.length !== 4) return false;
            const first = parseInt(parts[0], 10);
            const second = parseInt(parts[1], 10);
            if (first === 10) return true;
            if (first === 172 && second >= 16 && second <= 31) return true;
            if (first === 192 && second === 168) return true;
            return false;
          };

          graphUpdates.forEach(edge => {
            // Validate edge data
            if (!edge.source || !edge.target) return;

            // Update Nodes
            [edge.source, edge.target].forEach(ip => {
              if (!nodes.has(ip)) {
                nodes.set(ip, {
                  id: ip,
                  val: 1,
                  lastSeen: now,
                  color: isPrivateIP(ip) ? "#3b82f6" : "#ef4444"
                });
              } else {
                const n = nodes.get(ip);
                n.lastSeen = now;
                n.val = (n.val || 1) + 0.1; // Slowly grow size
              }
            });

            // Update Link
            const linkId = `${edge.source}-${edge.target}-${edge.dst_port}`;
            const weight = Number(edge.weight) || 1; // Cast to Number

            if (links.has(linkId)) {
              const l = links.get(linkId);
              l.value = weight;
              l.lastSeen = now;
            } else {
              links.set(linkId, {
                id: linkId,
                source: edge.source,
                target: edge.target,
                port: edge.dst_port,
                value: weight,
                lastSeen: now
              });
            }
          });

          // Prune Stale Items (> 60s)
          for (const [id, node] of nodes) {
            if (now - (node.lastSeen || 0) > 60000) nodes.delete(id);
          }

          // Prune Stale Links & Orphaned Links
          for (const [id, link] of links) {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;

            if ((now - (link.lastSeen || 0) > 60000) || !nodes.has(sourceId) || !nodes.has(targetId)) {
              links.delete(id);
            }
          }

          // Calculate Curvature for Multi-Links
          // Group links by source-target pair
          const linksByPair = new Map();
          for (const link of links.values()) {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            const pairId = [sourceId, targetId].sort().join('-'); // Consistent key regardless of direction

            if (!linksByPair.has(pairId)) linksByPair.set(pairId, []);
            linksByPair.get(pairId).push(link);
          }

          // Assign curvature
          for (const [pairId, pairLinks] of linksByPair) {
            const count = pairLinks.length;
            if (count > 1) {
              pairLinks.forEach((link, i) => {
                // Spread curvature: 0, 0.2, -0.2, 0.4, -0.4...
                // If self-loop, just regular curvature
                const isSelfLoop = (link.source.id || link.source) === (link.target.id || link.target);
                if (isSelfLoop) {
                  link.curvature = 0.2 + (i * 0.1);
                } else {
                  // Alternating curvature for multi-links
                  link.curvature = 0.1 + (i * 0.15);
                }
              });
            } else {
              // Single link
              const isSelfLoop = (pairLinks[0].source.id || pairLinks[0].source) === (pairLinks[0].target.id || pairLinks[0].target);
              // Standard curvature for self-loops
              pairLinks[0].curvature = isSelfLoop ? 0.2 : 0;
            }
          }

          return {
            nodes: Array.from(nodes.values()),
            links: Array.from(links.values())
          };
        });
      }

    }, 2000);

    return () => {
      ws.close();
      clearInterval(updateInterval);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const formatTime = (epoch) => {
    if (!epoch) return '--:--:--';
    const date = new Date(parseFloat(epoch) * 1000);
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleSendMessage = async () => {
    if (!query.trim()) return;

    const userMsg = { role: 'user', text: query };
    setChatMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsTyping(true);

    try {
      const response = await axios.post('http://localhost:8000/api/chat/', { messages: query });
      setChatMessages(prev => [...prev, { role: 'assistant', text: response.data.result || response.data }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Error connecting to analysis engine.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleChatSubmit = async (message) => {
    if (!message.trim()) return;

    const userMsg = { role: 'user', text: message };
    setChatMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    const rowContext = selectedRows.length > 0 ? `
--- CONTEXT: SELECTED FLOWS (${selectedRows.length}) ---
${selectedRows.map(r => `
Flow: ${r.flow}
Description: ${r.last_packet_info}
Packets: ${r.packet_count}
Encryption: ${r.encryption}
`).join('\n---\n')}
----------------------------
` : '';

    try {
      const response = await axios.post('http://localhost:8000/api/chat/', {
        messages: message,
        model: selectedModel,
        selected_row: rowContext
      });
      setChatMessages(prev => [...prev, { role: 'assistant', text: response.data.result || response.data }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Error connecting to analysis engine.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  // --- Components ---




  return (
    <div className="h-screen flex flex-col bg-black text-white font-inter selection:bg-indigo-500/30 overflow-hidden">

      {/* Modals Overlay */}
      {setupStep > 0 && (
        <div className="fixed inset-0 z-50 bg-[#0B0F19]/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 p-8 max-w-2xl w-full">
            {setupStep === 1 && (
              <>
                <h2 className="text-2xl font-bold mb-4 text-slate-100">Setup Monitoring</h2>
                <p className="text-secondary mb-8">Choose how you want to capture network traffic.</p>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => { setMonitoringMethod(1); setSetupStep(0); setIsMonitoring(true); }} className="p-6 border border-white/10 hover:border-indigo-500 hover:bg-indigo-500/10 transition-colors text-left group">
                    <Activity className="w-8 h-8 text-indigo-400 mb-4 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-bold mb-2">Method 1 (Default)</h3>
                    <p className="text-sm text-secondary">Monitor traffic routing directly through this host interface.</p>
                  </button>
                  <button onClick={() => { setMonitoringMethod(2); setSetupStep(2); fetchDevices(); }} className="p-6 border border-white/10 hover:border-rose-500 hover:bg-rose-500/10 transition-colors text-left group">
                    <Network className="w-8 h-8 text-rose-400 mb-4 group-hover:scale-110 transition-transform" />
                    <h3 className="text-lg font-bold mb-2">Method 2 (ARP Spoofing)</h3>
                    <p className="text-sm text-secondary">Intercept traffic from other devices on the local network.</p>
                  </button>
                </div>
              </>
            )}
            {setupStep === 2 && (
              <>
                <h2 className="text-2xl font-bold mb-4 text-slate-100">Select Devices</h2>
                <p className="text-secondary mb-4">Select the target devices to intercept traffic from.</p>
                {isLoadingDevices ? (
                  <div className="flex items-center justify-center p-12 text-indigo-400 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" /> Fetching ARP table...
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto mb-6 border border-white/10">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/5 sticky top-0">
                        <tr>
                          <th className="p-3">Select</th>
                          <th className="p-3">IP Address</th>
                          <th className="p-3">MAC Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {devices.map(d => (
                          <tr key={d.ip} className="hover:bg-white/5">
                            <td className="p-3">
                              <input type="checkbox" checked={selectedTargets.some(t => t.ip === d.ip)} onChange={(e) => {
                                if (e.target.checked) setSelectedTargets([...selectedTargets, d]);
                                else setSelectedTargets(selectedTargets.filter(t => t.ip !== d.ip));
                              }} className="accent-rose-500" />
                            </td>
                            <td className="p-3 font-mono text-indigo-300">{d.ip}</td>
                            <td className="p-3 font-mono text-secondary">{d.mac}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <button onClick={() => setSetupStep(1)} className="px-6 py-2 text-sm text-secondary hover:text-white transition-colors">Back</button>
                  <button disabled={selectedTargets.length === 0 || isSpoofingLoading} onClick={() => startSpoofing(selectedTargets)} className="px-6 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                    {isSpoofingLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Executing sysctl & arpspoof...</> : "Start Interception"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-[#0B0F19]/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6 text-slate-100 flex items-center gap-3"><Settings className="w-6 h-6 text-indigo-400" /> Settings</h2>

            <div className="space-y-6">
              <div className="bg-white/5 p-4 border border-white/10">
                <h3 className="font-bold mb-2">Monitoring Method</h3>
                <div className="flex gap-4 mb-4">
                  <button onClick={() => { stopSpoofing(); setMonitoringMethod(1); setSetupStep(0); setIsMonitoring(true); setShowSettings(false); }} className={`px-4 py-2 text-sm border ${monitoringMethod === 1 ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300' : 'border-white/10 hover:bg-white/5'} transition-colors`}>Method 1 (Local)</button>
                  <button onClick={() => { stopSpoofing(); setMonitoringMethod(2); setSetupStep(2); fetchDevices(); setShowSettings(false); }} className={`px-4 py-2 text-sm border ${monitoringMethod === 2 ? 'border-rose-500 bg-rose-500/20 text-rose-300' : 'border-white/10 hover:bg-white/5'} transition-colors`}>Method 2 (ARP Spoofing)</button>
                </div>
                {monitoringMethod === 2 && (
                  <div className="mt-4">
                    <p className="text-sm font-bold text-secondary mb-2">Active Targets:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTargets.map(t => <span key={t.ip} className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-1 text-xs font-mono">{t.ip}</span>)}
                      {selectedTargets.length === 0 && <span className="text-xs text-secondary">No targets selected.</span>}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white/5 p-4 border border-white/10">
                <h3 className="font-bold mb-4">Whitelist Configuration</h3>
                <label className="block text-sm text-secondary mb-1">Whitelisted Ports (comma separated)</label>
                <input type="text" value={whitelist.ports.join(', ')} onChange={(e) => setWhitelist({ ...whitelist, ports: e.target.value.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p)) })} className="w-full bg-black/40 border border-white/10 p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 mb-4 font-mono" />

                <label className="block text-sm text-secondary mb-1">Anomaly Score Threshold</label>
                <input type="number" step="0.1" min="0" max="1" value={whitelist.anomaly_threshold} onChange={(e) => setWhitelist({ ...whitelist, anomaly_threshold: parseFloat(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 mb-4 font-mono" />

                <button onClick={() => saveWhitelist(whitelist)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors">Save Whitelist</button>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="px-6 py-2 border border-white/10 hover:bg-white/5 text-sm transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Background Gradients - Subtle */}
      <div className="fixed inset-0 pointer-events-none opacity-20 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px]" />
      </div>

      {/* Header - Boxy */}
      <header className="flex justify-between items-center border-b border-white/10 bg-[#0B0F19] relative z-20 h-16">
        <div className="flex items-center h-full px-6 border-r border-white/10 bg-white/[0.02]">

          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              NETFLOW
            </h1>
          </div>
        </div>

        <div className="flex items-center h-full flex-grow justify-end">
          {/* View Toggles */}
          <div className="flex h-full border-l border-white/10">
            <button
              onClick={() => setViewMode('list')}
              className={`px-6 h-full text-xs font-bold transition-colors flex items-center gap-2 border-r border-white/10 ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-secondary hover:bg-white/5'}`}
            >
              <Terminal className="w-4 h-4" /> LIST
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={`px-6 h-full text-xs font-bold transition-colors flex items-center gap-2 ${viewMode === 'graph' ? 'bg-indigo-600 text-white' : 'text-secondary hover:bg-white/5'}`}
            >
              <Network className="w-4 h-4" /> GRAPH
            </button>
          </div>

          {/* Stats Row */}
          <div className="flex h-full border-white/10 justify-center items-center gap-6 bg-[#0B0F19]">
            <div className="flex flex-col h-full">
              {/* <span className="text-[10px] text-secondary uppercase font-bold tracking-widest mb-1 opacity-50">System Metrics</span> */}
              <div className="flex h-full overflow-hidden border-r border-white/10 bg-black/20 fustat tracking-tight" >
                <StatCard
                  label="CPU"
                  value={`${systemStats.cpu}%`}
                  icon={<Activity className="w-3.5 h-3.5" />}
                  color="text-indigo-400"
                />
                <StatCard
                  label="RAM"
                  value={`${systemStats.ram}%`}
                  icon={<Database className="w-3.5 h-3.5" />}
                  color="text-indigo-400"
                />
                <StatCard
                  label="Live Flows"
                  value={flows.length}
                  icon={<Zap className="w-3.5 h-3.5" />}
                  color="text-indigo-400"
                />
                <StatCard
                  label="Anomalies"
                  value={stats.anomalies}
                  icon={<ShieldAlert className="w-3.5 h-3.5" />}
                  color={stats.anomalies > 0 ? "text-rose-400" : "text-indigo-400"}
                />
                <StatCard
                  label="Secured"
                  value={`${stats.encryptedRatio.toFixed(1)}%`}
                  icon={<Lock className="w-3.5 h-3.5" />}
                  color="text-emerald-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 border-l border-white/10">
              <button
                onClick={() => {
                  if (monitoringMethod === 2) {
                    if (isMonitoring) stopSpoofing();
                    else startSpoofing(selectedTargets);
                  } else {
                    setIsMonitoring(!isMonitoring);
                  }
                }}
                className={`p-2 border transition-colors ${isMonitoring ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 hover:bg-rose-500/30' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'}`}
                title={isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
              >
                {isMonitoring ? <Square className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
              </button>
              <button onClick={() => setShowSettings(true)} className="p-2 border border-white/10 hover:bg-white/5 text-secondary hover:text-white transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid - Boxy, No Gap */}
      <main className="grid grid-cols-12 flex-grow relative z-10 border-b border-white/10 overflow-hidden min-h-0">

        {/* Left Column: Visuals */}
        <div className="col-span-8 flex flex-col border-r border-white/10 overflow-hidden h-full">

          {/* Top Row: Charts */}
          <div className="grid grid-cols-2 h-72 border-b border-white/10 flex-shrink-0">
            <ChartContainer title="Traffic Volume" className="border-r border-white/10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartHistory}>
                  <defs>
                    <linearGradient id="colorPackets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis hide />
                  <Area
                    type="monotone"
                    dataKey="packet_count"
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#colorPackets)"
                    isAnimationActive={true}
                    connectNulls={true}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>

            <ChartContainer title="Port Activity" className="border-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portAlerts}>
                  <defs>
                    <linearGradient id="colorPorts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    cursor={{ fill: '#ffffff05' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar
                    dataKey="packets"
                    fill="url(#colorPorts)"
                    radius={[2, 2, 0, 0]}
                    barSize={12}
                    isAnimationActive={true}
                  />
                  <XAxis dataKey="port" hide />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Bottom Row: Content (Table/Graph) Area */}
          <div className="flex-1 min-h-0 relative bg-black/40">
            {viewMode === 'list' && (
              <SecurityTable
                flows={flows}
                formatTime={formatTime}
                selectedRows={selectedRows}
                onRowSelect={(flow) => {
                  setSelectedRows(prev => {
                    const exists = prev.some(r => r.flow === flow.flow);
                    if (exists) return prev.filter(r => r.flow !== flow.flow);
                    return [...prev, flow];
                  });
                }}
              />
            )}

            {viewMode === 'graph' && (
              <BentoCard
                title="Live Network Topology"
                icon={<Network className="w-5 h-5 text-indigo-400" />}
                className="h-full border-none"
                bodyClassName="h-full"
                actions={
                  <div className="text-xs text-secondary flex gap-4 font-mono">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-none bg-blue-500"></span> Internal</span>
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-none bg-rose-500"></span> External</span>
                  </div>
                }
              >
                <NetworkGraph nodes={graphData.nodes} links={graphData.links} />
              </BentoCard>
            )}
          </div>
        </div>

        {/* Right Column: AI Assistant */}
        <div className="col-span-4 h-[calc(100vh-64px)] bg-[#0B0F19] overflow-hidden sticky top-16 flex flex-col">
          <BentoCard
            title="Security Analyst AI"
            icon={<Bot className="w-5 h-5 text-emerald-400" />}
            className="flex-1 overflow-hidden border-none"
            bodyClassName="flex flex-col"
            actions={
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-black/40 border border-white/10 text-xs text-secondary focus:outline-none focus:border-indigo-500 py-1 px-2 font-mono scrollbar-thin rounded-none"
              >
                <option value="arcee-ai/trinity-large-preview:free">Trinity Large (Free)</option>
                <option value="google/gemini-2.5-flash:free">Gemini 2.5 Flash</option>
                <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B</option>
                <option value="deepseek/deepseek-r1:free">DeepSeek R1</option>
                <option value="qwen/qwen-2.5-coder-32b-instruct:free">Qwen 2.5 Coder 32B</option>
              </select>
            }
          >
            <div className="flex flex-col h-full bg-black/20 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent min-h-0">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 text-sm border ${msg.role === 'user'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-white/5 text-slate-200 border-white/10'
                        }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                          <Bot className="w-3 h-3" /> NetFlow AI
                        </div>
                      )}
                      <ReactMarkdown
                        components={{
                          code: ({ node, inline, className, children, ...props }) => (
                            <code className={`${className} bg-black/30 px-1 py-0.5 font-mono text-xs border border-white/10`} {...props}>{children}</code>
                          )
                        }}
                      >{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start animate-pulse">
                    <div className="bg-white/5 p-4 w-12 h-10 flex items-center justify-center gap-1 border border-white/10">
                      <span className="w-1 h-1 bg-indigo-400 rounded-none animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-indigo-400 rounded-none animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-indigo-400 rounded-none animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Context Preview & Chat Input */}
              <div className="border-t border-white/10 bg-black/40 backdrop-blur-xl">
                {/* Selected Context Chips */}
                {selectedRows.length > 0 && (
                  <div className="p-2 flex flex-wrap gap-2 border-b border-white/5 max-h-32 overflow-y-auto scrollbar-thin">
                    {selectedRows.map(row => (
                      <div key={row.flow} className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 px-2 py-1 text-[10px] font-mono text-indigo-300 group">
                        <span className="truncate max-w-[150px]">{row.flow}</span>
                        <button
                          onClick={() => setSelectedRows(prev => prev.filter(r => r.flow !== row.flow))}
                          className="hover:text-rose-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!inputValue.trim()) return;
                    handleChatSubmit(inputValue);
                    setInputValue('');
                  }}
                  className="relative flex"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={selectedRows.length > 0 ? `Ask about ${selectedRows.length} selected flows...` : "Ask about network anomalies..."}
                    className="w-full bg-transparent py-4 pl-4 pr-12 text-sm text-slate-200 focus:outline-none focus:bg-white/5 placeholder:text-slate-500 transition-colors rounded-none"
                  />
                  <button
                    type="submit"
                    className="absolute right-0 top-0 h-full px-4 text-indigo-400 hover:text-indigo-300 hover:bg-white/5 transition-colors border-l border-white/10 rounded-none"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </BentoCard>
        </div>
      </main>
    </div>
  );
};

export default App;
