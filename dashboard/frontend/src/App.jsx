import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Activity, Shield, MessageSquare, AlertTriangle,
  Lock, Unlock, ChevronRight, Send, Search, Terminal
} from 'lucide-react';
import axios from 'axios';

const App = () => {
  const [flows, setFlows] = useState([]);
  const [stats, setStats] = useState({
    totalPackets: 0,
    anomalies: 0,
    encryptedRatio: 0
  });
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Hello! I am your Network Security Assistant. How can I help you analyze the traffic today?' }
  ]);
  const [query, setQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  const [chartHistory, setChartHistory] = useState(new Array(30).fill({ packet_count: 0 }));
  const messageQueue = useRef([]);

  useEffect(() => {
    // WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:8000/ws/packets/`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Buffer messages to prevent UI flicker
      messageQueue.current.push(data);
    };

    // UI Update Loop (Throttled to 2 seconds)
    const updateInterval = setInterval(() => {
      if (messageQueue.current.length === 0) {
        // Still update chart to keep it moving forward smoothly
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

      setFlows((prev) => {
        let newFlows = [...prev];

        latestBatch.forEach(data => {
          const existingIdx = newFlows.findIndex(f => f.flow === data.flow);
          if (existingIdx > -1) {
            newFlows[existingIdx] = data;
          } else {
            newFlows = [data, ...newFlows];
          }
        });

        // Ensure flows are always sorted by most recent time
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

  return (
    <div className="min-h-screen bg-background text-slate-100 p-6 flex flex-col gap-6">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-surface pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Antigravity Sentinel</h1>
            <p className="text-secondary text-sm">Real-time Network Analysis & LLM Investigation</p>
          </div>
        </div>
        <div className="flex gap-4">
          <StatCard label="Live Flows" value={flows.length} icon={<Activity className="w-4 h-4" />} />
          <StatCard label="Anomalies" value={stats.anomalies} color="text-danger" icon={<AlertTriangle className="w-4 h-4" />} />
          <StatCard label="Encryption" value={`${stats.encryptedRatio.toFixed(1)}%`} icon={<Lock className="w-4 h-4" />} />
        </div>
      </header>

      <main className="grid grid-cols-12 gap-6 flex-grow">
        {/* Left Column: Visualizations & Table */}
        <div className="col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-6 h-64">
            <ChartContainer title="Traffic Volume (Load)">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartHistory}>
                  <defs>
                    <linearGradient id="colorPackets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <Area
                    type="monotone"
                    dataKey="packet_count"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorPackets)"
                    isAnimationActive={false}
                  />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} labelClassName="text-secondary" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>

            <ChartContainer title="Anomaly Detection Scan">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartHistory.slice(-15)}>
                  <Bar dataKey="packet_count" fill="#ef4444" radius={[4, 4, 0, 0]}>
                    {/* Visual indicator for "newness" could be added here */}
                  </Bar>
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Flow Table */}
          <div className="bg-surface rounded-xl overflow-hidden shadow-xl border border-white/5">
            <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
              <h3 className="font-semibold flex items-center gap-2">
                <Terminal className="w-4 h-4" /> Real-time Security Table
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-secondary bg-white/5">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Flow (Source to Dest)</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Packets</th>
                    <th className="px-4 py-3">Latest Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {flows.map((flow, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors cursor-pointer group">
                      <td className="px-4 py-3 font-mono text-[11px] text-secondary">
                        {formatTime(flow.last_packet_time)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">{flow.flow}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${flow.encryption === 'Encrypted' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
                          }`}>
                          {flow.encryption}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isAnomalous(flow) ? (
                          <div className="flex items-center gap-2 text-danger">
                            <AlertTriangle className="w-4 h-4 animate-pulse" />
                            <span className="text-[10px] font-bold">ANOMALOUS</span>
                          </div>
                        ) : (
                          <Shield className="w-4 h-4 text-success" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{flow.packet_count}</td>
                      <td className="px-4 py-3 text-sm text-secondary truncate max-w-[200px]">
                        {flow.last_packet_info}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: LLM Chat Interface */}
        <div className="col-span-4 flex flex-col bg-surface rounded-xl overflow-hidden shadow-xl border border-white/5">
          <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <span className="font-semibold">Security Expert AI</span>
          </div>

          <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-background border border-white/10'
                  }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-background border border-white/10 p-3 rounded-2xl animate-pulse text-secondary text-sm italic">
                  Analyzing traffic...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-white/5 flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask about network anomalies..."
              className="flex-grow bg-background border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
            />
            <button
              onClick={handleSendMessage}
              className="p-2 bg-primary rounded-lg hover:bg-primary/80 transition-opacity"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ label, value, color = "text-white", icon }) => (
  <div className="bg-surface border border-white/5 px-4 py-2 rounded-lg flex items-center gap-3">
    <div className="text-secondary">{icon}</div>
    <div>
      <p className="text-[10px] text-secondary uppercase font-bold leading-tight">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  </div>
);

const ChartContainer = ({ title, children }) => (
  <div className="bg-surface rounded-xl p-4 flex flex-col border border-white/5 shadow-lg">
    <h3 className="text-xs font-bold text-secondary uppercase mb-4">{title}</h3>
    <div className="flex-grow">{children}</div>
  </div>
);

const isAnomalous = (flow) => {
  return (flow.flag_anomalies && flow.flag_anomalies.length > 0) ||
    flow.ttl_anomaly ||
    flow.sequence_anomaly ||
    flow.small_packet_anomaly;
};

export default App;
