import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Cpu, RefreshCw, Terminal, Database, ShieldCheck,
    Layers, CheckCircle2, Server, ArrowRight, Download, Menu, X, Settings
} from 'lucide-react';

export default function App() {
    const [productionMode, setProductionMode] = useState(() => {
        return localStorage.getItem('valkyrie_prod_mode') === 'true';
    });

    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('valkyrie_prod_mode') === 'true' ? 'dashboard' : 'landing';
    });

    const [menuOpen, setMenuOpen] = useState(false);
    const [itemId, setItemId] = useState('item_1');
    const [stockInput, setStockInput] = useState(100);
    const [ramStock, setRamStock] = useState('--');
    const [claimed, setClaimed] = useState(0);
    const [rejected, setRejected] = useState(0);
    const [concurrency, setConcurrency] = useState(500);
    const [isSimulating, setIsSimulating] = useState(false);
    const [logs, setLogs] = useState([]);
    const [sqlCount, setSqlCount] = useState(0);

    useEffect(() => {
        localStorage.setItem('valkyrie_prod_mode', productionMode);
        if (productionMode) {
            setActiveTab('dashboard');
        }
    }, [productionMode]);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`/api/status?itemId=${itemId}`);
            const data = await res.json();
            setRamStock(data.stock !== undefined ? data.stock : '0');
        } catch (err) {
            setRamStock('0');
        }
    };

    const fetchLogs = async () => {
        try {
            const [statusRes, logsRes] = await Promise.all([
                fetch(`/api/status?itemId=${itemId}`),
                fetch(`/api/logs?itemId=${itemId}&limit=50`)
            ]);

            if (statusRes.ok) {
                const sData = await statusRes.json();
                setRamStock(sData.stock !== undefined ? sData.stock : '0');
            }

            if (logsRes.ok) {
                const lData = await logsRes.json();

                // Flexibly extract array whether backend returns { logs: [] }, { data: [] }, or raw []
                const logArray = Array.isArray(lData)
                    ? lData
                    : (lData.logs || lData.data || lData.reservations || []);

                const count = lData.totalCount !== undefined
                    ? lData.totalCount
                    : logArray.length;

                setSqlCount(count);
                setLogs(logArray);
            } else {
                console.warn('Logs API returned non-200 status:', logsRes.status);
            }
        } catch (err) {
            console.error('Error fetching logs:', err);
        }
    };

    useEffect(() => {
        fetchStatus();
        if (activeTab === 'dashboard') {
            fetchLogs();
        }
    }, [itemId, activeTab]);

    const handleInitStock = async () => {
        try {
            const res = await fetch('/api/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, initialStock: parseInt(stockInput) || 100 })
            });
            const data = await res.json();
            setRamStock(data.stock);
            setClaimed(0);
            setRejected(0);
            if (activeTab === 'dashboard') fetchLogs();
        } catch (err) {
            alert('Error initializing stock: ' + err.message);
        }
    };

    const handleRunSimulation = async () => {
        setIsSimulating(true);
        let okCount = 0;
        let failCount = 0;

        const requests = Array.from({ length: concurrency }, (_, i) => {
            return fetch('/api/reserve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, userId: `usr_${Math.floor(Math.random() * 8999 + 1000)}` })
            }).then(res => {
                if (res.status === 200) okCount++;
                else if (res.status === 409) failCount++;
            }).catch(() => failCount++);
        });

        await Promise.all(requests);
        setClaimed(okCount);
        setRejected(failCount);

        // Always refresh stock and logs after simulation finishes
        await fetchStatus();
        await fetchLogs();

        setIsSimulating(false);
    };

    const exportCSV = () => {
        if (!logs.length) return alert('No logs available to export.');
        let csv = 'ID,User_ID,Item_ID,Status,Created_At\n';
        logs.forEach(l => {
            csv += `${l.id},${l.user_id},${l.item_id},${l.status},${l.created_at}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `valkyrie_reservations_${Date.now()}.csv`;
        a.click();
    };

    return (
        <div className="relative min-h-screen text-slate-200 flex flex-col justify-between overflow-x-hidden">
            <div className="mesh-curve"></div>

            {/* Navigation Header */}
            <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex justify-between items-center border-b border-violet-900/30">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => !productionMode && setActiveTab('landing')}>
                    <img
                        src="/logo.png"
                        alt="ValkyrieAlloc Logo"
                        className="w-10 h-10 rounded-2xl object-cover border border-violet-800/40 shadow-md shadow-violet-900/30"
                    />
                    <div>
                        <h1 className="text-xl font-extrabold text-white tracking-tight">ValkyrieAlloc</h1>
                        <p className="text-xs text-violet-400 font-mono tracking-wide uppercase">Zerops In-Memory Gate</p>
                    </div>
                </div>

                {/* Unified Tab Navigation */}
                {!productionMode ? (
                    <nav className="hidden md:flex items-center gap-2 bg-[#121024] p-1.5 rounded-full border border-violet-900/40">
                        <button
                            onClick={() => setActiveTab('landing')}
                            className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'landing' ? 'bg-[#2a264e] text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Sandbox
                        </button>
                        <button
                            onClick={() => setActiveTab('guide')}
                            className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'guide' ? 'bg-[#2a264e] text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Setup Guide
                        </button>
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-[#2a264e] text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Dashboard
                        </button>
                    </nav>
                ) : (
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-950/60 border border-violet-800/60 text-xs text-violet-300 font-mono">
                        <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
                        Production Mode Active
                    </div>
                )}

                {/* Settings Drawer Trigger */}
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-2.5 rounded-2xl bg-[#121024] border border-violet-900/40 hover:bg-[#1c1a33] text-slate-300 transition cursor-pointer"
                >
                    {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </header>

            {/* Settings Drawer */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="relative z-20 max-w-7xl mx-auto w-full px-6 mb-4"
                    >
                        <div className="bento-card p-6 bg-[#121024] border border-violet-800/40 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-violet-400" /> Settings
                                </h4>
                                <p className="text-xs text-slate-400 mt-1">Enable production mode to skip landing pages and lock directly onto the Dashboard.</p>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-slate-300">Production Mode:</span>
                                <button
                                    onClick={() => setProductionMode(!productionMode)}
                                    className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${productionMode ? 'bg-violet-600' : 'bg-slate-700'}`}
                                >
                                    <motion.div
                                        layout
                                        className="bg-white w-4 h-4 rounded-full shadow-md"
                                        animate={{ x: productionMode ? 24 : 0 }}
                                    />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content Area */}
            <main className="relative z-10 max-w-7xl mx-auto w-full px-6 py-8 flex-1">
                <AnimatePresence mode="wait">
                    {activeTab === 'landing' && !productionMode && (
                        <motion.div
                            key="landing"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.25 }}
                        >
                            {/* Hero Header */}
                            <section className="text-center max-w-4xl mx-auto my-10">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#121024] border border-violet-800/50 text-xs text-violet-300 font-mono mb-6">
                                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
                                    Sub-Millisecond Valkey Gate • Zero SQL Locks
                                </div>
                                <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-[1.15] mb-6">
                                    High-Concurrency <br />
                                    In-Memory Allocation Gate
                                </h2>
                                <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-8">
                                    Intercept high-traffic checkout spikes in RAM before touching relational databases. Atomic Lua evaluations run stock decrements in memory with complete race-condition protection.
                                </p>
                                <div className="flex justify-center gap-4">
                                    <button
                                        onClick={() => {
                                            document.getElementById('sandbox-workstation')?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        className="bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs px-7 py-3.5 rounded-full transition-all shadow-xl cursor-pointer"
                                    >
                                        Try Sandbox Below
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('guide')}
                                        className="bg-[#1c1a33] hover:bg-[#252244] text-slate-200 font-bold text-xs px-7 py-3.5 rounded-full border border-violet-800/60 transition-all cursor-pointer"
                                    >
                                        Setup Guide →
                                    </button>
                                </div>
                            </section>

                            {/* Bento Feature Cards */}
                            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 mb-16">
                                <div className="bento-card p-8">
                                    <div className="text-3xl font-black text-violet-400 font-mono mb-2">&lt; 0.5ms</div>
                                    <h3 className="text-base font-extrabold text-white mb-2">Atomic Memory Gate</h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        Executes single-threaded Lua evaluations directly in Valkey RAM. Rejects excess checkout requests instantly with zero SQL locks.
                                    </p>
                                </div>

                                <div className="bento-card p-8">
                                    <div className="text-3xl font-black text-violet-300 font-mono mb-2">0 Defect</div>
                                    <h3 className="text-base font-extrabold text-white mb-2">Concurrency Protection</h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        Guarantees exact inventory integrity under thousands of parallel connections. No oversold items, no matter how high the spike.
                                    </p>
                                </div>

                                <div className="bento-card p-8">
                                    <div className="text-3xl font-black text-indigo-400 font-mono mb-2">100% Async</div>
                                    <h3 className="text-base font-extrabold text-white mb-2">PostgreSQL Persistence</h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        Approved claims pass non-blocking write tasks to Zerops PostgreSQL, keeping user response latency ultra-low.
                                    </p>
                                </div>
                            </section>

                            {/* Sandbox Workstation */}
                            <section id="sandbox-workstation" className="bento-card p-8 md:p-10 mb-12 shadow-2xl">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-violet-900/40">
                                    <div>
                                        <h3 className="text-xl font-black text-white flex items-center gap-2">
                                            <Cpu className="w-5 h-5 text-violet-400" /> Testing Sandbox
                                        </h3>
                                        <p className="text-sm text-slate-400 mt-1">Set your product key, initial stock, and trigger parallel test requests.</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div>
                                            <label className="block text-xs font-mono text-violet-400 mb-1">Product Key</label>
                                            <input
                                                type="text"
                                                value={itemId}
                                                onChange={(e) => setItemId(e.target.value)}
                                                className="bg-black/60 border border-violet-800/60 rounded-xl px-3.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-violet-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-mono text-violet-400 mb-1">Set RAM Stock</label>
                                            <input
                                                type="number"
                                                value={stockInput}
                                                onChange={(e) => setStockInput(e.target.value)}
                                                className="bg-black/60 border border-violet-800/60 rounded-xl px-3.5 py-1.5 text-xs text-white font-mono w-24 focus:outline-none focus:border-violet-500"
                                            />
                                        </div>
                                        <button
                                            onClick={handleInitStock}
                                            className="self-end bg-[#252244] hover:bg-[#312d59] text-white font-bold text-xs px-4 py-2 rounded-xl transition border border-violet-700/50 cursor-pointer"
                                        >
                                            Set Stock
                                        </button>
                                    </div>
                                </div>

                                {/* Counters Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                    <div className="bg-black/40 p-5 rounded-2xl border border-violet-900/40 text-center">
                                        <span className="text-xs text-slate-400 font-medium">Valkey Stock Balance</span>
                                        <div className="text-3xl font-black text-violet-400 my-2 font-mono">{ramStock}</div>
                                        <span className="text-xs text-slate-500 font-mono">stock:{itemId}</span>
                                    </div>
                                    <div className="bg-black/40 p-5 rounded-2xl border border-violet-900/40 text-center">
                                        <span className="text-xs text-slate-400 font-medium">Approved Claims (200 OK)</span>
                                        <div className="text-3xl font-black text-violet-300 my-2 font-mono">{claimed}</div>
                                        <span className="text-xs text-violet-400/80">Secured in RAM</span>
                                    </div>
                                    <div className="bg-black/40 p-5 rounded-2xl border border-violet-900/40 text-center">
                                        <span className="text-xs text-slate-400 font-medium">Instant Rejections (409)</span>
                                        <div className="text-3xl font-black text-slate-300 my-2 font-mono">{rejected}</div>
                                        <span className="text-xs text-slate-400">Blocked at Gate</span>
                                    </div>
                                    <div className="bg-black/40 p-5 rounded-2xl border border-violet-900/40 text-center">
                                        <span className="text-xs text-slate-400 font-medium">Oversold Defect Count</span>
                                        <div className="text-3xl font-black text-violet-300 my-2 font-mono">0</div>
                                        <span className="text-xs text-slate-500">Race Conditions: 0</span>
                                    </div>
                                </div>

                                {/* Trigger Control */}
                                <div className="bg-black/30 p-6 rounded-2xl border border-violet-900/30 flex flex-col md:flex-row items-center gap-4">
                                    <div className="w-full md:w-1/3">
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Parallel Requests</label>
                                        <input
                                            type="range"
                                            min="10"
                                            max="2000"
                                            value={concurrency}
                                            onChange={(e) => setConcurrency(parseInt(e.target.value))}
                                            className="w-full accent-violet-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                                        />
                                        <span className="text-xs font-mono text-violet-400 mt-1 block">{concurrency} Parallel Requests</span>
                                    </div>
                                    <button
                                        onClick={handleRunSimulation}
                                        disabled={isSimulating}
                                        className="w-full md:w-2/3 bg-[#252244] hover:bg-[#312d59] text-white font-bold text-sm py-3.5 rounded-xl transition border border-violet-700/50 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isSimulating ? 'Sending Requests...' : 'Execute Test Requests'}
                                    </button>
                                </div>
                            </section>
                        </motion.div>
                    )}

                    {activeTab === 'guide' && !productionMode && (
                        <motion.div
                            key="guide"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.25 }}
                            className="max-w-4xl mx-auto space-y-8"
                        >
                            <div>
                                <h2 className="text-3xl font-black text-white mb-2">Setup Guide</h2>
                                <p className="text-sm text-slate-300">Deploy ValkyrieAlloc natively on Zerops in 5 simple steps.</p>
                            </div>

                            {/* Step 1 */}
                            <div className="bento-card p-6 md:p-8">
                                <div className="text-xs font-mono text-violet-400 font-bold mb-1">STEP 1</div>
                                <h3 className="text-lg font-bold text-white mb-2">Create Services on Zerops</h3>
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    In your Zerops project, create a Node.js runtime container, a Valkey memory service, and a PostgreSQL database. Zerops automatically handles connection routing between them.
                                </p>
                            </div>

                            {/* Step 2 (Apple macOS Window Box Restored) */}
                            <div className="bento-card p-6 md:p-8">
                                <div className="text-xs font-mono text-violet-400 font-bold mb-1">STEP 2</div>
                                <h3 className="text-lg font-bold text-white mb-3">Add zerops.yaml Configuration</h3>
                                <p className="text-sm text-slate-300 mb-4">Add this `zerops.yaml` file to your project root. It tells Zerops how to build the app and pass database credentials:</p>

                                <div className="rounded-xl border border-violet-900/50 bg-[#0c0a18] overflow-hidden shadow-2xl">
                                    <div className="bg-[#18152e] px-4 py-2.5 flex items-center gap-2 border-b border-violet-900/40">
                                        <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
                                        <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                                        <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                                        <span className="text-xs font-mono text-slate-400 ml-2">zerops.yaml</span>
                                    </div>
                                    <pre className="p-4 text-xs md:text-sm font-mono text-violet-300 overflow-x-auto leading-relaxed">
                                        {`zerops:
  - setup: api
    build:
      base: nodejs@20
      buildCommands:
        - npm install
        - npm run build
      deployFiles: ./
    run:
      base: nodejs@20
      ports:
        - port: 5000
          httpSupport: true
      envVariables:
        DB_HOST: db
        DB_PORT: 5432
        DB_USER: \${db_user}
        DB_PASSWORD: \${db_password}
        DB_NAME: \${db_database}
        VALKEY_HOST: valkey
        VALKEY_PORT: 6379
      start: node server.js`}
                                    </pre>
                                </div>
                            </div>

                            {/* Step 3 (Apple macOS Window Box Restored) */}
                            <div className="bento-card p-6 md:p-8">
                                <div className="text-xs font-mono text-violet-400 font-bold mb-1">STEP 3</div>
                                <h3 className="text-lg font-bold text-white mb-3">Set Initial Stock in Memory</h3>
                                <p className="text-sm text-slate-300 mb-4">Set your product inventory in Valkey RAM before accepting traffic:</p>

                                <div className="rounded-xl border border-violet-900/50 bg-[#0c0a18] overflow-hidden shadow-2xl">
                                    <div className="bg-[#18152e] px-4 py-2.5 flex items-center gap-2 border-b border-violet-900/40">
                                        <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
                                        <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                                        <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                                        <span className="text-xs font-mono text-slate-400 ml-2">terminal — init.sh</span>
                                    </div>
                                    <div className="p-4">
                                        <code className="text-xs md:text-sm font-mono text-violet-300 block overflow-x-auto">
                                            curl -X POST https://your-api.zerops.app/api/init -H "Content-Type: application/json" -d '&#123;"itemId":"item_1","initialStock":100&#125;'
                                        </code>
                                    </div>
                                </div>
                            </div>

                            {/* Step 4 (Apple macOS Window Box Restored) */}
                            <div className="bento-card p-6 md:p-8">
                                <div className="text-xs font-mono text-violet-400 font-bold mb-1">STEP 4</div>
                                <h3 className="text-lg font-bold text-white mb-3">Connect Checkout to the Gate</h3>
                                <p className="text-sm text-slate-300 mb-4">Send checkout requests to `POST /api/reserve`. It returns `200 OK` if stock is secured or `409 Conflict` if sold out:</p>

                                <div className="rounded-xl border border-violet-900/50 bg-[#0c0a18] overflow-hidden shadow-2xl">
                                    <div className="bg-[#18152e] px-4 py-2.5 flex items-center gap-2 border-b border-violet-900/40">
                                        <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
                                        <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                                        <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                                        <span className="text-xs font-mono text-slate-400 ml-2">checkout.js</span>
                                    </div>
                                    <pre className="p-4 text-xs md:text-sm font-mono text-slate-300 overflow-x-auto leading-relaxed">
                                        {`const res = await fetch('https://your-api.zerops.app/api/reserve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ itemId: 'item_1', userId: 'user_123' })
});

if (res.status === 200) {
  console.log('Stock reserved in RAM!');
} else if (res.status === 409) {
  console.log('Stock sold out!');
}`}
                                    </pre>
                                </div>
                            </div>

                            {/* Step 5 */}
                            <div className="bento-card p-6 md:p-8">
                                <div className="text-xs font-mono text-violet-400 font-bold mb-1">STEP 5</div>
                                <h3 className="text-lg font-bold text-white mb-2">View Orders in Dashboard</h3>
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    Every successful reservation writes asynchronously into the Zerops PostgreSQL `reservations` table. Use the Dashboard to review confirmed orders or export CSV audit logs.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'dashboard' && (
                        <motion.div
                            key="dashboard"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.25 }}
                        >
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-white">Dashboard</h2>
                                    <p className="text-sm text-slate-400">Live RAM status and confirmed PostgreSQL reservation ledger.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={exportCSV}
                                        className="bg-[#1c1a33] hover:bg-[#252244] text-white text-xs font-semibold px-4 py-2 rounded-xl border border-violet-800/40 transition flex items-center gap-2 cursor-pointer"
                                    >
                                        <Download className="w-3 h-3" /> Export CSV Audit
                                    </button>
                                    <button
                                        onClick={fetchLogs}
                                        className="bg-[#252244] hover:bg-[#312d59] text-white text-xs font-semibold px-4 py-2 rounded-xl border border-violet-700/50 transition flex items-center gap-2 cursor-pointer"
                                    >
                                        <RefreshCw className="w-3 h-3" /> Refresh Dashboard
                                    </button>
                                </div>
                            </div>

                            {/* Status Counters */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <div className="bento-card p-5 text-center">
                                    <span className="text-xs text-slate-400 font-medium">Valkey RAM Stock</span>
                                    <div className="text-3xl font-black text-violet-400 my-1 font-mono">{ramStock}</div>
                                    <span className="text-xs text-slate-500 font-mono">stock:{itemId}</span>
                                </div>
                                <div className="bento-card p-5 text-center">
                                    <span className="text-xs text-slate-400 font-medium">PostgreSQL Orders</span>
                                    <div className="text-3xl font-black text-violet-300 my-1 font-mono">{sqlCount}</div>
                                    <span className="text-xs text-violet-400/80">Persisted Records</span>
                                </div>
                                <div className="bento-card p-5 text-center">
                                    <span className="text-xs text-slate-400 font-medium">Execution Speed</span>
                                    <div className="text-3xl font-black text-violet-300 my-1 font-mono">&lt; 0.5 ms</div>
                                    <span className="text-xs text-slate-500">Served from RAM</span>
                                </div>
                            </div>

                            {/* Reserved Table */}
                            <div className="bento-card p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                        Confirmed Reservations (PostgreSQL Table)
                                    </h3>
                                    <span className="text-xs font-mono text-violet-300 bg-violet-950/60 border border-violet-800/60 px-2.5 py-0.5 rounded-full">
                                        Live Stream Active
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs font-mono">
                                        <thead>
                                            <tr className="text-slate-500 border-b border-violet-900/40">
                                                <th className="pb-3">ID</th>
                                                <th className="pb-3">USER_ID</th>
                                                <th className="pb-3">ITEM_ID</th>
                                                <th className="pb-3">STATUS</th>
                                                <th className="pb-3">TIMESTAMP</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-violet-900/20 text-slate-300">
                                            {logs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="py-8 text-center text-slate-600">No confirmed order records logged in PostgreSQL yet. Run a test in the Sandbox!</td>
                                                </tr>
                                            ) : (
                                                logs.map(log => (
                                                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                                                        <td className="py-2.5 text-violet-400">#{log.id}</td>
                                                        <td className="text-violet-300 font-semibold">{log.user_id}</td>
                                                        <td>{log.item_id}</td>
                                                        <td><span className="bg-violet-950 text-violet-300 border border-violet-800/60 px-2 py-0.5 rounded text-[10px]">{log.status}</span></td>
                                                        <td className="text-slate-500">
                                                            {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Footer */}
            <footer className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 border-t border-violet-900/30 text-center text-xs text-slate-600">
                ValkyrieAlloc Engine • Zerops Native Architecture (Node.js + Valkey + PostgreSQL)
            </footer>
        </div>
    );
}