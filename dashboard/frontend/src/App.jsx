import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Activity, Shield, MessageSquare, AlertTriangle,
  Lock, Unlock, ChevronRight, Send, Search, Terminal,
  Network, Bot, Cpu, MemoryStick
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

const BentoCard = ({ children, className = "", title, icon, actions }) => (
  <div className={`bg-gray-900/40 backdrop-blur-xl border-r border-b border-white/10 flex flex-col hover:bg-white/[0.02] transition-colors duration-300 group ${className}`}>
    {(title || actions) && (
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        {title && (
          <h3 className="font-bold text-lg flex items-center gap-3 text-slate-100 group-hover:text-primary transition-colors tracking-tight">
            {icon} {title}
          </h3>
        )}
        {actions}
      </div>
    )}
    <div className="flex-grow relative">{children}</div>
  </div>
);

const StatCard = ({ label, value, icon, color = "text-primary", subtext }) => (
  <div className="bg-gray-900/40 backdrop-blur-md border-l border-white/10 p-4 flex items-center gap-4 hover:bg-white/5 transition-colors group h-full">
    <div className={`p-2 bg-white/5 ${color} group-hover:scale-105 transition-transform duration-300`}>
      {icon}
    </div>
    <div>
      <p className="text-secondary text-[10px] uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-xl font-bold font-mono text-slate-100">{value}</p>
      {subtext && <p className="text-[10px] text-secondary mt-0.5">{subtext}</p>}
    </div>
  </div>
);

const ChartContainer = ({ title, children, className }) => (
  <BentoCard title={title} className={className}>
    <div className="w-full h-full p-4">
      {children}
    </div>
  </BentoCard>
);

const SecurityTable = ({ flows, formatTime }) => (
  <BentoCard title="Real-time Security Table" icon={<Terminal className="w-5 h-5 text-indigo-400" />}>
    <div className="overflow-x-auto max-h-[400px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      <table className="w-full text-left border-collapse">
        <thead className="text-xs uppercase text-secondary bg-black/20 sticky top-0 backdrop-blur-sm z-10">
          <tr>
            <th className="px-6 py-4 font-bold tracking-wider">Time</th>
            <th className="px-6 py-4 font-bold tracking-wider">Flow (Source → Dest)</th>
            <th className="px-6 py-4 font-bold tracking-wider">Type</th>
            <th className="px-6 py-4 font-bold tracking-wider">Status</th>
            <th className="px-6 py-4 font-bold tracking-wider">Pkts</th>
            <th className="px-6 py-4 font-bold tracking-wider">Latest Info</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-sm">
          {flows.map((flow, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors cursor-pointer group">
              <td className="px-6 py-3 font-mono text-xs text-secondary group-hover:text-slate-300">
                {formatTime(flow.last_packet_time)}
              </td>
              <td className="px-6 py-3 font-mono text-indigo-200">{flow.flow}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  </BentoCard>
);

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

  useEffect(() => {
    // WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:8000/ws/packets/`);

    ws.onmessage = (event) => {
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

    try {
      const response = await axios.post('http://localhost:8000/api/chat/', { messages: message });
      setChatMessages(prev => [...prev, { role: 'assistant', text: response.data.result || response.data }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Error connecting to analysis engine.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  // --- Components ---




  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col selection:bg-indigo-500/30 font-['Fustat']">
      {/* Background Gradients - Subtle */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
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
          <div className="flex h-full">
            <StatCard label="CPU" value={`${systemStats.cpu}%`} icon={<Cpu className="w-4 h-4" />} color="text-indigo-400" />
            <StatCard label="RAM" value={`${systemStats.ram}%`} icon={<MemoryStick className="w-4 h-4" />} color="text-purple-400" />
            <StatCard label="Live Flows" value={flows.length} icon={<Activity className="w-4 h-4" />} color="text-emerald-400" />
            <StatCard label="Anomalies" value={stats.anomalies} color="text-rose-400" icon={<AlertTriangle className="w-4 h-4" />} />
            <StatCard label="Secured" value={`${stats.encryptedRatio.toFixed(1)}%`} color="text-indigo-400" icon={<Lock className="w-4 h-4" />} />
          </div>
        </div>
      </header>

      {/* Main Grid - Boxy, No Gap */}
      <main className="grid grid-cols-12 flex-grow relative z-10 border-b border-white/10">

        {/* Left Column: Visuals */}
        <div className="col-span-8 flex flex-col border-r border-white/10">

          {/* Top Row: Charts */}
          <div className="grid grid-cols-2 h-72">
            <ChartContainer title="Traffic Volume" className="border-r border-b-0 border-white/10">
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

            <ChartContainer title="Port Activity" className="border-b-0">
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

          {/* Bottom Row: Content (Table/Graph) */}
          <div className="flex-grow min-h-[500px] flex flex-col border-t border-white/10">
            {viewMode === 'list' && (
              <SecurityTable flows={flows} formatTime={formatTime} />
            )}

            {viewMode === 'graph' && (
              <BentoCard
                title="Live Network Topology"
                icon={<Network className="w-5 h-5 text-indigo-400" />}
                className="h-full border-none"
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
        <div className="col-span-4 h-full bg-[#0B0F19]">
          <BentoCard
            title="Security Analyst AI"
            icon={<MessageSquare className="w-5 h-5 text-emerald-400" />}
            className="h-full border-none" // Sticky/Fixed height
          >
            <div className="flex flex-col h-full bg-black/20">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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

              {/* Chat Input */}
              <div className="p-0 border-t border-white/10 backdrop-blur-xl">
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
                    placeholder="Ask about network anomalies..."
                    className="w-full bg-black/40 py-4 pl-4 pr-12 text-sm text-slate-200 focus:outline-none focus:bg-white/5 placeholder:text-slate-500 transition-colors rounded-none"
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
