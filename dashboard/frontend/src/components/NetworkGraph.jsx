import React, { useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const NetworkGraph = ({ nodes = [], links = [] }) => {
    const fgRef = useRef();
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    useEffect(() => {
        const handleResize = () => {
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        // Adjust zoom to fit graph when data changes initially
        if (fgRef.current) {
            fgRef.current.d3Force('charge').strength(-20); // Much less repulsion
            fgRef.current.d3Force('link').distance(50); // Reasonable link length
            fgRef.current.d3Force('center').strength(0.3); // Stronger pull to center
            fgRef.current.d3Force('charge').distanceMax(200); // Limit repulsion range


            // Auto-fit ONLY if it's the very first load (small number of nodes)
            // We avoid auto-zooming constantly as it disorients the user
            if (nodes?.length > 0 && nodes?.length < 5) {
                setTimeout(() => {
                    fgRef.current.zoomToFit(400, 50);
                }, 500);
            }
        }
    }, [nodes?.length, links?.length]); // Re-run on data change

    const handleZoomToFit = () => {
        if (fgRef.current) {
            fgRef.current.zoomToFit(1000, 50);
        }
    };

    const [graphData, setGraphData] = useState({ nodes: [], links: [] });

    useEffect(() => {
        setGraphData(currentData => {
            // 1. Create Maps for fast lookup of existing simulation objects
            const currentNodesMap = new Map(currentData.nodes.map(n => [n.id, n]));
            const currentLinksMap = new Map(currentData.links.map(l => [l.id, l])); // Assuming links have IDs

            // 2. Process Incoming Nodes
            const nextNodes = nodes.map(newNode => {
                if (currentNodesMap.has(newNode.id)) {
                    // EXIST: Update properties but KEEP the same object reference (preserves x, y, vx, vy)
                    const existingNode = currentNodesMap.get(newNode.id);
                    // Explicitly update visual properties
                    existingNode.val = newNode.val;
                    existingNode.color = newNode.color;
                    existingNode.lastSeen = newNode.lastSeen;
                    return existingNode;
                } else {
                    // NEW: Return the new object
                    return newNode;
                }
            });

            // 3. Process Incoming Links
            // We need to be careful: ForceGraph replaces source/target string IDs with Node Objects.
            // When we receive new links from parent, source/target are likely strings (IPs).
            const nextLinks = links.map(newLink => {
                // Generate a consistent ID if not present (though App.jsx seems to set IDs properly)
                const linkId = newLink.id || `${newLink.source}-${newLink.target}`;

                if (currentLinksMap.has(linkId)) {
                    const existingLink = currentLinksMap.get(linkId);
                    existingLink.value = newLink.value;
                    existingLink.lastSeen = newLink.lastSeen;
                    return existingLink;
                } else {
                    return newLink;
                }
            });

            return { nodes: nextNodes, links: nextLinks };
        });
    }, [nodes, links]);

    return (
        <div className="w-full h-full bg-slate-950 rounded-xl overflow-hidden border border-white/5 relative">
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <div className="bg-black/50 p-2 rounded text-xs text-slate-300 pointer-events-none">
                    Nodes: {nodes?.length || 0} | Edges: {links?.length || 0}
                </div>
                <button
                    onClick={handleZoomToFit}
                    className="bg-primary/80 hover:bg-primary text-white text-xs px-2 py-1 rounded transition-colors pointer-events-auto"
                >
                    Recenter
                </button>
            </div>
            <ForceGraph2D
                ref={fgRef}
                width={windowSize.width * 0.6} // Approximate width of col-span-8
                height={500}
                graphData={graphData}
                nodeColor={node => node.color || "#3b82f6"}
                nodeVal={node => node.val || 1}
                // Custom Node Rendering
                nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.id;
                    const fontSize = 12 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    const textWidth = ctx.measureText(label).width;
                    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.5); // some padding

                    ctx.fillStyle = node.color || "#3b82f6";

                    // Draw solid circle (radius 6).
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI, false);
                    ctx.fill();

                    // Draw text *below* it.
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = 'white'; // Text color
                    ctx.fillText(label, node.x, node.y + 8);

                    node.__bckgDimensions = bckgDimensions; // for interaction
                }}
                nodePointerAreaPaint={(node, color, ctx) => {
                    ctx.fillStyle = color;
                    const bckgDimensions = node.__bckgDimensions;
                    bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, ...bckgDimensions);
                }}
                linkColor={() => "#ffffff33"}
                linkWidth={link => Math.log(link.value + 1) * 1.5} // Log scale for width
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}
                linkCurvature={link => link.curvature || 0} // Use calculated curvature
                d3VelocityDecay={0.4} // Increase friction to stop drift
                backgroundColor="#020617" // match slate-950
                cooldownTicks={100} // Stop simulation after 100 ticks to stabilize
                onNodeClick={node => {
                    // Center view on node
                    fgRef.current.centerAt(node.x, node.y, 1000);
                    fgRef.current.zoom(8, 2000);
                }}
            />
        </div>
    );
};

export default React.memo(NetworkGraph);
